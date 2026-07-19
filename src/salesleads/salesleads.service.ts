import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { InjectModel } from "@nestjs/mongoose"
import { ClientSession, Model, Types } from "mongoose"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { SalesLeadCase } from "../database/mongoose/schemas/SalesLeadCase"
import { SalesLeadAssignment } from "../database/mongoose/schemas/SalesLeadAssignment"
import {
  SalesLeadCall,
  SalesLeadCallOutcome
} from "../database/mongoose/schemas/SalesLeadCall"
import { SalesCsAvailability } from "../database/mongoose/schemas/SalesCsAvailability"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { User } from "../database/mongoose/schemas/User"
import { NotificationsService } from "../notifications/notifications.service"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

const SALES_TIME_ZONE = "Asia/Ho_Chi_Minh"

const OUTCOMES: SalesLeadCallOutcome[] = [
  "no_answer",
  "not_interested",
  "call_back",
  "considering",
  "closed",
  "wrong_number",
  "other"
]
@Injectable()
export class SalesLeadsService {
  constructor(
    @InjectModel("salesleadcases") private cases: Model<SalesLeadCase>,
    @InjectModel("salesleadassignments")
    private assignments: Model<SalesLeadAssignment>,
    @InjectModel("salesleadcalls") private calls: Model<SalesLeadCall>,
    @InjectModel("salescsavailabilities")
    private availabilityModel: Model<SalesCsAvailability>,
    @InjectModel("salesfunnel") private funnels: Model<SalesFunnel>,
    @InjectModel("saleschannels") private channels: Model<SalesChannel>,
    @InjectModel("salesorders") private orders: Model<SalesOrder>,
    @InjectModel("users") private users: Model<User>,
    private notifications: NotificationsService,
    private systemLogs: SystemLogsService
  ) {}
  private manager(roles: string[] = []) {
    return roles.includes("admin") || roles.includes("sales-leader") || roles.includes("sales-hunter")
  }
  private month(now = new Date()) {
    const zonedNow = toZonedTime(now, SALES_TIME_ZONE)
    const y = zonedNow.getFullYear(),
      m = zonedNow.getMonth()
    return {
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      start: fromZonedTime(new Date(y, m, 1), SALES_TIME_ZONE),
      end: fromZonedTime(new Date(y, m + 1, 0, 23, 59, 59, 999), SALES_TIME_ZONE)
    }
  }
  private async transaction<T>(work: (session: ClientSession) => Promise<T>) {
    const session = await this.cases.db.startSession()
    try {
      let result!: T
      await session.withTransaction(async () => {
        result = await work(session)
      })
      return result
    } finally {
      await session.endSession()
    }
  }
  private audit(
    actor: string,
    action: string,
    entityId: string,
    meta?: Record<string, unknown>,
    entity = "salesleadcase"
  ) {
    void this.systemLogs.createSystemLog(
      {
        type: "sales-leads",
        action,
        entity,
        entityId,
        result: "success",
        meta
      },
      actor
    )
  }
  private async eligible(userId: string, channelId?: string) {
    if (!Types.ObjectId.isValid(userId))
      throw new HttpException("Sales CS không hợp lệ", HttpStatus.BAD_REQUEST)
    const [user, availability] = await Promise.all([
      this.users.findById(userId).lean(),
      this.availabilityModel.findOne({ salesCsId: userId }).lean()
    ])
    if (
      !user ||
      user.active === false ||
      !user.roles?.includes("sales-cs") ||
      availability?.isReceivingLeads !== true
    )
      throw new HttpException(
        "Sales CS không bật nhận khách",
        HttpStatus.BAD_REQUEST
      )
    if (channelId) {
      if (!Types.ObjectId.isValid(channelId))
        throw new HttpException("Kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      const channel: any = await this.channels
        .findOne({ _id: channelId, deletedAt: null })
        .lean()
      if (!channel)
        throw new HttpException("Kênh không tồn tại", HttpStatus.NOT_FOUND)
      const assignedIds = [channel.assignedTo, ...(channel.assignedTos || [])]
        .filter(Boolean)
        .map((id: any) => id.toString())
      if (!assignedIds.includes(userId))
        throw new HttpException(
          "Sales CS không phụ trách kênh này",
          HttpStatus.BAD_REQUEST
        )
    }
    return user
  }
  private snapshot(f: any) {
    return {
      name: f.name,
      phoneNumber: f.phoneNumber,
      secondaryPhoneNumbers: f.secondaryPhoneNumbers || [],
      address: f.address,
      provinceId: f.province,
      channelId: f.channel
    }
  }
  async availableCs(channelId?: string) {
    let assignedIds: Types.ObjectId[] | undefined
    if (channelId) {
      if (!Types.ObjectId.isValid(channelId))
        throw new HttpException("Kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      const channel: any = await this.channels
        .findOne({ _id: channelId, deletedAt: null })
        .lean()
      if (!channel)
        throw new HttpException("Kênh không tồn tại", HttpStatus.NOT_FOUND)
      assignedIds = Array.from(
        new Map(
          [channel.assignedTo, ...(channel.assignedTos || [])]
            .filter(Boolean)
            .map((id: any) => [id.toString(), id])
        ).values()
      )
    }
    const users: any[] = await this.users
      .find({
        roles: "sales-cs",
        active: { $ne: false },
        ...(assignedIds ? { _id: { $in: assignedIds } } : {})
      })
      .select("name username active roles")
      .lean()
    const availability = await this.availabilityModel
      .find({ salesCsId: { $in: users.map((user) => user._id) } })
      .lean()
    const byUserId = new Map(
      availability.map((row: any) => [row.salesCsId.toString(), row])
    )
    return users
      .filter(
        (user) => byUserId.get(user._id.toString())?.isReceivingLeads === true
      )
      .map((user) => ({
        ...(byUserId.get(user._id.toString()) || { isReceivingLeads: true }),
        salesCsId: user
      }))
  }
  async availability() {
    const [users, rows] = await Promise.all([
      this.users
        .find({ roles: "sales-cs" })
        .select("name username active")
        .lean(),
      this.availabilityModel.find().lean()
    ])
    const byUser = new Map(
      rows.map((row: any) => [row.salesCsId.toString(), row])
    )
    return users.map((user: any) => ({
        ...(byUser.get(user._id.toString()) || { isReceivingLeads: false }),
      _id: byUser.get(user._id.toString())?._id || user._id,
      salesCsId: user
    }))
  }
  async setAvailability(
    userId: string,
    isReceivingLeads: boolean,
    actor: string,
    note?: string
  ) {
    const user = await this.users.findById(userId).lean()
    if (!user || !user.roles?.includes("sales-cs"))
      throw new HttpException(
        "Người dùng không phải sales CS",
        HttpStatus.BAD_REQUEST
      )
    const availability = await this.availabilityModel.findOneAndUpdate(
      { salesCsId: userId },
      {
        $set: {
          isReceivingLeads: !!isReceivingLeads,
          changedById: actor,
          changedAt: new Date(),
          note
        }
      },
      { upsert: true, new: true }
    )
    this.audit(
      actor,
      "availability_updated",
      userId,
      { isReceivingLeads: !!isReceivingLeads },
      "salescsavailability"
    )
    return availability
  }
  async create(payload: any, hunterId: string) {
    if (!payload.name)
      throw new HttpException("Thiếu tên khách", HttpStatus.BAD_REQUEST)
    const now = new Date(),
      hasSalesCs = !!payload.salesCsId
    // SalesFunnel.user is required by the legacy schema. Until a CS claims the
    // case, retain the hunter as this compatibility owner; it is not a CS assignment.
    if (hasSalesCs)
      await this.eligible(payload.salesCsId, payload.channel || undefined)
    const result = await this.transaction(async (session) => {
      const [funnel] = await this.funnels.create(
        [
          {
            name: payload.name,
            phoneNumber: payload.phoneNumber,
            secondaryPhoneNumbers: payload.secondaryPhoneNumbers || [],
            address: payload.address,
            province: payload.province,
            channel: payload.channel,
            user: hasSalesCs ? payload.salesCsId : hunterId,
            stage: "lead",
            updateStageLogs: [{ stage: "lead", updatedAt: now }],
            funnelSource: payload.funnelSource || "ads"
          }
        ],
        { session }
      )
      const [lead] = await this.cases.create(
        [
          {
            salesFunnelId: funnel._id,
            hunterId,
            sourceChannelId: payload.channel,
            status: hasSalesCs ? "assigned" : "unassigned"
          }
        ],
        { session }
      )
      if (!hasSalesCs) return { lead, assignment: null, funnel }

      const period = this.month(now)
      const [assignment] = await this.assignments.create(
        [
          {
            leadCaseId: lead._id,
            salesCsId: payload.salesCsId,
            assignedById: hunterId,
            kind: "initial",
            status: "active",
            cycleKey: period.key,
            cycleStartAt: period.start,
            cycleEndAt: period.end,
            startedAt: now,
            customerSnapshot: this.snapshot(funnel)
          }
        ],
        { session }
      )
      lead.currentAssignmentId = assignment._id as any
      await lead.save({ session })
      return { lead, assignment, funnel }
    })
    const { lead, assignment, funnel } = result
    this.audit(hunterId, "created", lead._id.toString(), {
      salesFunnelId: funnel._id.toString(),
      salesCsId: payload.salesCsId
    })
    if (!assignment) return result
    void this.notifications.createNotificationForSingleUser(
      {
        title: "Có lead mới",
        content: `Bạn được phân lead ${funnel.name}`,
        type: "sales-lead",
        link: `/sales/leads/${lead._id}`,
        createdAt: now
      },
      payload.salesCsId
    )
    return result
  }
  async pool() {
    const leads: any[] = await this.cases
      .find({ status: { $in: ["unassigned", "pooled"] } })
      .populate("salesFunnelId", "name phoneNumber")
      .populate("hunterId", "name")
      .sort({ updatedAt: -1 })
      .lean()
    const leadIds = leads.map((lead) => lead._id)
    const assignments: any[] = await this.assignments
      .find({ leadCaseId: { $in: leadIds } })
      .populate("salesCsId", "name username")
      .sort({ endedAt: -1, startedAt: -1 })
      .lean()
    const latestByLead = new Map<string, any>()
    for (const assignment of assignments) {
      const key = assignment.leadCaseId.toString()
      if (!latestByLead.has(key)) latestByLead.set(key, assignment)
    }
    const previousAssignments = Array.from(latestByLead.values())
    const callCounts = await this.calls.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { assignmentId: { $in: previousAssignments.map((row) => row._id) } } },
      { $group: { _id: "$assignmentId", count: { $sum: 1 } } }
    ])
    const callCountByAssignment = new Map(
      callCounts.map((row) => [row._id.toString(), row.count])
    )
    return leads.map((lead) => {
      const previous = latestByLead.get(lead._id.toString())
      return {
        ...lead,
        previousSalesCs: previous?.salesCsId,
        previousCycleKey: previous?.cycleKey,
        previousCallCount: previous
          ? callCountByAssignment.get(previous._id.toString()) || 0
          : 0
      }
    })
  }
  async assignPooled(
    id: string,
    salesCsId: string | undefined,
    actor: string,
    roles: string[] = [],
    channelId?: string
  ) {
    const isManager = this.manager(roles)
    const canAssign = isManager || roles.includes("sales-hunter")
    if (!canAssign)
      throw new HttpException(
        "Bạn không có quyền phân lead",
        HttpStatus.FORBIDDEN
      )
    const assigneeId = salesCsId
    if (!assigneeId)
      throw new HttpException(
        "Cần chọn sales CS nhận lead",
        HttpStatus.BAD_REQUEST
      )
    const candidate: any = await this.cases.findById(id).lean()
    if (!candidate || !["unassigned", "pooled"].includes(candidate.status))
      throw new HttpException(
        "Lead đã được nhận hoặc không tồn tại",
        HttpStatus.CONFLICT
      )
    const funnel = await this.funnels.findById(candidate.salesFunnelId)
    if (!funnel)
      throw new HttpException("Funnel không tồn tại", HttpStatus.NOT_FOUND)
    const selectedChannelId = channelId || funnel.channel?.toString()
    await this.eligible(assigneeId, selectedChannelId)
    const assignment = await this.transaction(async (session) => {
      const lead: any = await this.cases.findOneAndUpdate(
        { _id: id, status: { $in: ["unassigned", "pooled"] } },
        { $set: { status: "assigned", updatedAt: new Date() } },
        { new: true, session }
      )
      if (!lead)
        throw new HttpException("Lead đã được nhận", HttpStatus.CONFLICT)
      const prev: any = await this.assignments
        .findOne({ leadCaseId: id })
        .sort({ endedAt: -1, startedAt: -1 })
        .session(session)
        .lean()
      const now = new Date()
      const p = this.month(now)
      const snapshotFunnel: any = {
        ...funnel.toObject(),
        ...(channelId ? { channel: new Types.ObjectId(channelId) } : {})
      }
      const [created] = await this.assignments.create(
        [
          {
            leadCaseId: lead._id,
            salesCsId: assigneeId,
            assignedById: actor,
            kind: prev ? "recycled" : "initial",
            status: "active",
            cycleKey: p.key,
            cycleStartAt: p.start,
            cycleEndAt: p.end,
            startedAt: now,
            previousSalesCsId: prev?.salesCsId,
            customerSnapshot: this.snapshot(snapshotFunnel)
          }
        ],
        { session }
      )
      await this.cases.findByIdAndUpdate(
        id,
        {
          $set: {
            currentAssignmentId: created._id,
            ...(channelId ? { sourceChannelId: channelId } : {})
          }
        },
        { session }
      )
      await this.funnels.findByIdAndUpdate(
        funnel._id,
        { $set: { user: assigneeId, ...(channelId ? { channel: channelId } : {}) } },
        { session }
      )
      return created
    })
    this.audit(actor, "assigned", id, { salesCsId: assigneeId, channelId })
    if (assigneeId !== actor)
      void this.notifications.createNotificationForSingleUser(
        {
          title: "Có lead mới",
          content: `Bạn được phân lead ${funnel.name}`,
          type: "sales-lead",
          link: `/sales/leads/${id}`,
          createdAt: new Date()
        },
        assigneeId
      )
    return assignment
  }
  async acquired(userId: string, roles: string[]) {
    const q = this.manager(roles) ? {} : { hunterId: userId }
    return this.cases
      .find(q)
      .populate("salesFunnelId", "name phoneNumber")
      .populate({
        path: "currentAssignmentId",
        select: "salesCsId status cycleKey",
        populate: { path: "salesCsId", select: "name username" }
      })
      .sort({ createdAt: -1 })
      .lean()
  }
  async active(userId: string, roles: string[], needsCall = false) {
    const q: any = { status: { $in: ["active", "retained"] } }
    if (!this.manager(roles)) q.salesCsId = userId
    const assignments: any[] = await this.assignments
      .find(q)
      .populate({
        path: "leadCaseId",
        populate: { path: "salesFunnelId", select: "name phoneNumber" }
      })
      .populate("salesCsId", "name")
      .sort({ startedAt: -1 })
      .lean()
    if (!needsCall) return assignments
    const ids = assignments
      .filter((a) => a.status === "active")
      .map((a) => a._id)
    const called = await this.calls.distinct("assignmentId", {
      assignmentId: { $in: ids }
    })
    return assignments.filter(
      (a) =>
        a.status === "active" &&
        !called.some((x: any) => x.toString() === a._id.toString())
    )
  }
  private async access(id: string, userId: string, roles: string[]) {
    const lead: any = await this.cases.findById(id).lean()
    if (!lead)
      throw new HttpException("Lead không tồn tại", HttpStatus.NOT_FOUND)
    if (this.manager(roles)) return { lead, mode: "all" }
    if (roles.includes("sales-hunter") && lead.hunterId.toString() === userId)
      return { lead, mode: "hunter" }
    const assignments: any[] = await this.assignments
      .find({ leadCaseId: id, salesCsId: userId })
      .lean()
    if (assignments.length) return { lead, mode: "cs", assignments }
    throw new HttpException(
      "Bạn không có quyền xem lead này",
      HttpStatus.FORBIDDEN
    )
  }
  async detail(id: string, userId: string, roles: string[]) {
    const data: any = await this.access(id, userId, roles)
    const funnel = await this.funnels.findById(data.lead.salesFunnelId).lean()
    if (data.mode === "hunter")
      return {
        ...data.lead,
        funnel: { name: funnel?.name, phoneNumber: funnel?.phoneNumber },
        assignment: await this.assignments
          .findById(data.lead.currentAssignmentId)
          .populate("salesCsId", "name")
          .lean()
      }
    const assignments =
      data.mode === "all"
        ? await this.assignments
            .find({ leadCaseId: id })
            .populate("salesCsId", "name")
            .sort({ startedAt: -1 })
            .lean()
        : data.assignments
    const calls = await this.calls
      .find({ assignmentId: { $in: assignments.map((a: any) => a._id) } })
      .sort({ calledAt: -1 })
      .lean()
    return { ...data.lead, funnel, assignments, calls }
  }
  async detailByFunnel(funnelId: string, userId: string, roles: string[]) {
    const lead = await this.cases
      .findOne({ salesFunnelId: funnelId })
      .select("_id")
      .lean()
    if (!lead) return null
    return this.detail(lead._id.toString(), userId, roles)
  }
  async callsFor(id: string, userId: string, roles: string[]) {
    const data: any = await this.access(id, userId, roles)
    if (data.mode === "hunter")
      throw new HttpException(
        "Hunter không có quyền xem lịch sử gọi",
        HttpStatus.FORBIDDEN
      )
    const assignments =
      data.mode === "all"
        ? await this.assignments.find({ leadCaseId: id }).lean()
        : data.assignments
    return this.calls
      .find({ assignmentId: { $in: assignments.map((assignment: any) => assignment._id) } })
      .sort({ calledAt: -1 })
      .lean()
  }
  async addCall(id: string, body: any, userId: string, roles: string[]) {
    if (!OUTCOMES.includes(body.outcome) || !String(body.note || "").trim())
      throw new HttpException(
        "Cần chọn kết quả và nhập ghi chú",
        HttpStatus.BAD_REQUEST
      )
    const assignment: any = await this.assignments.findOne({
      leadCaseId: id,
      status: "active",
      ...(this.manager(roles) ? {} : { salesCsId: userId })
    })
    if (!assignment)
      throw new HttpException(
        "Bạn không có kỳ chăm sóc đang hiệu lực",
        HttpStatus.FORBIDDEN
      )
    const call = await this.calls.create({
      leadCaseId: id,
      assignmentId: assignment._id,
      salesCsId: assignment.salesCsId,
      calledAt: body.calledAt ? new Date(body.calledAt) : new Date(),
      outcome: body.outcome,
      note: body.note.trim()
    })
    this.audit(userId, "call_logged", id, { assignmentId: assignment._id.toString() })
    return call
  }
  async transfer(
    id: string,
    salesCsId: string,
    actor: string,
    roles: string[]
  ) {
    await this.eligible(salesCsId)
    const current: any = await this.assignments.findOne({
      leadCaseId: id,
      status: { $in: ["active", "retained"] },
      ...(this.manager(roles) ? {} : { salesCsId: actor })
    })
    if (!current)
      throw new HttpException(
        "Bạn không quản lý khách này",
        HttpStatus.FORBIDDEN
      )
    if (current.salesCsId.toString() === salesCsId)
      throw new HttpException(
        "Sales CS nhận đã là người quản lý",
        HttpStatus.BAD_REQUEST
      )
    const next = await this.transaction(async (session) => {
      const active: any = await this.assignments.findOneAndUpdate(
        {
          _id: current._id,
          status: { $in: ["active", "retained"] },
          ...(this.manager(roles) ? {} : { salesCsId: actor })
        },
        {
          $set: {
            status: "transferred",
            endedAt: new Date(),
            endReason: "manual_transfer"
          }
        },
        { new: true, session }
      )
      if (!active)
        throw new HttpException("Lead đã được chuyển", HttpStatus.CONFLICT)
      const lead: any = await this.cases.findById(id).session(session)
      if (!lead) throw new HttpException("Lead không tồn tại", HttpStatus.NOT_FOUND)
      const funnel: any = await this.funnels.findById(lead.salesFunnelId).session(session)
      if (!funnel) throw new HttpException("Funnel không tồn tại", HttpStatus.NOT_FOUND)
      const now = new Date()
      const isRetained = !!lead.firstOfficialOrderId
      const [created] = await this.assignments.create(
        [
          {
            leadCaseId: lead._id,
            salesCsId,
            assignedById: actor,
            kind: "manual_transfer",
            status: isRetained ? "retained" : "active",
            cycleKey: isRetained ? undefined : active.cycleKey,
            cycleStartAt: now,
            cycleEndAt: isRetained ? undefined : active.cycleEndAt,
            startedAt: now,
            previousSalesCsId: active.salesCsId,
            customerSnapshot: this.snapshot(funnel)
          }
        ],
        { session }
      )
      await this.cases.findByIdAndUpdate(
        lead._id,
        {
          $set: {
            currentAssignmentId: created._id,
            status: lead.firstOfficialOrderId ? "retained" : "assigned"
          }
        },
        { session }
      )
      await this.funnels.findByIdAndUpdate(
        funnel._id,
        { $set: { user: salesCsId } },
        { session }
      )
      return created
    })
    this.audit(actor, "transferred", id, { salesCsId })
    return next
  }
  async handleOfficialOrder(order: SalesOrder) {
    const now = new Date()
    const lead = await this.transaction(async (session) => {
      const row: any = await this.cases.findOneAndUpdate(
        {
          salesFunnelId: order.salesFunnelId,
          firstOfficialOrderId: { $exists: false }
        },
        {
          $set: {
            status: "retained",
            firstOfficialOrderId: order._id,
            firstOfficialAt: now,
            updatedAt: now
          }
        },
        { new: true, session }
      )
      if (!row) return null
      if (row.currentAssignmentId) {
        await this.assignments.findByIdAndUpdate(
          row.currentAssignmentId,
          { $set: { status: "retained", endedAt: now, endReason: "official" } },
          { session }
        )
      }
      return row
    })
    if (lead) this.audit("system", "official_order_retained", lead._id.toString(), { orderId: order._id.toString() })
  }
  private async notifyPoolAvailable() {
    const recipients = await this.users
      .find({ roles: "sales-hunter", active: { $ne: false } })
      .select("_id")
      .lean()
    await Promise.all(
      recipients.map((user: any) =>
        this.notifications.createNotificationForSingleUser(
          {
            title: "Có lead cần phân lại",
            content: "Có lead chưa có đơn official đang chờ bạn phân công",
            type: "sales-lead",
            link: "/sales/leads?view=acquired&status=pooled",
            createdAt: new Date()
          },
          user._id.toString()
        )
      )
    )
  }
  @Cron("0 5 0 1 * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async recycleExpired() {
    const rows: any[] = await this.assignments.find({
      status: "active",
      cycleEndAt: { $lt: new Date() }
    })
    let hasPooledLead = false
    for (const a of rows) {
      const recycled = await this.transaction(async (session) => {
        const lead: any = await this.cases.findById(a.leadCaseId).session(session)
        if (!lead || lead.firstOfficialOrderId) return null
        const assignment = await this.assignments.findOneAndUpdate(
          { _id: a._id, status: "active" },
          {
            $set: {
              status: "recycled",
              endedAt: new Date(),
              endReason: "month_expired"
            }
          },
          { new: true, session }
        )
        if (!assignment) return null
        await this.cases.findByIdAndUpdate(
          lead._id,
          {
            $set: {
              status: "pooled",
              currentAssignmentId: null,
              updatedAt: new Date()
            }
          },
          { session }
        )
        return { leadId: lead._id.toString(), salesCsId: assignment.salesCsId.toString() }
      })
      if (!recycled) continue
      hasPooledLead = true
      this.audit("system", "recycled", recycled.leadId)
      void this.notifications.createNotificationForSingleUser(
        {
          title: "Lead đã trả pool",
          content: "Lead chưa có đơn official đã hết chu kỳ tháng",
          type: "sales-lead",
          link: `/sales/leads/${recycled.leadId}`,
          createdAt: new Date()
        },
        recycled.salesCsId
      )
    }
    if (hasPooledLead) void this.notifyPoolAvailable()
  }
  @Cron("0 30 8 * * *", { timeZone: SALES_TIME_ZONE })
  async remindMissingCalls() {
    const zonedNow = toZonedTime(new Date(), SALES_TIME_ZONE)
    const day = zonedNow.getDate()
    const finalDay = new Date(zonedNow.getFullYear(), zonedNow.getMonth() + 1, 0).getDate()
    if (day !== 3 && day !== 7 && day < finalDay - 2) return
    const period = this.month()
    const assignments: any[] = await this.assignments
      .find({ status: "active", cycleKey: period.key })
      .populate({ path: "leadCaseId", populate: { path: "salesFunnelId", select: "name" } })
      .lean()
    const calledIds = await this.calls.distinct("assignmentId", {
      assignmentId: { $in: assignments.map((assignment) => assignment._id) }
    })
    const called = new Set(calledIds.map((id: any) => id.toString()))
    await Promise.all(
      assignments
        .filter((assignment) => !called.has(assignment._id.toString()))
        .map((assignment) =>
          this.notifications.createNotificationForSingleUser(
            {
              title: "Lead cần gọi",
              content: `Bạn chưa ghi nhận cuộc gọi cho ${assignment.leadCaseId?.salesFunnelId?.name || "một khách hàng"}`,
              type: "sales-lead",
              link: `/sales/leads/${assignment.leadCaseId?._id}`,
              createdAt: new Date()
            },
            assignment.salesCsId.toString()
          )
        )
    )
  }
  async callCompliance(cycleKey = this.month().key) {
    const assignments: any[] = await this.assignments
      .find({ cycleKey })
      .populate("salesCsId", "name username")
      .lean()
    const assignmentIds = assignments.map((assignment) => assignment._id)
    const calledIds = await this.calls.distinct("assignmentId", {
      assignmentId: { $in: assignmentIds }
    })
    const called = new Set(calledIds.map((id: any) => id.toString()))
    const bySalesCs = new Map<string, { salesCs: any; total: number; called: number }>()
    for (const assignment of assignments) {
      const key = assignment.salesCsId?._id?.toString() || assignment.salesCsId.toString()
      const row = bySalesCs.get(key) || { salesCs: assignment.salesCsId, total: 0, called: 0 }
      row.total += 1
      if (called.has(assignment._id.toString())) row.called += 1
      bySalesCs.set(key, row)
    }
    return {
      cycleKey,
      total: assignments.length,
      called: called.size,
      missingCall: assignments.length - called.size,
      bySalesCs: Array.from(bySalesCs.values()).map((row) => ({
        ...row,
        missingCall: row.total - row.called
      }))
    }
  }
}
