import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesLeadCase } from "../database/mongoose/schemas/SalesLeadCase"
import { SalesLeadAssignment } from "../database/mongoose/schemas/SalesLeadAssignment"
import { SalesLeadCall, SalesLeadCallOutcome } from "../database/mongoose/schemas/SalesLeadCall"
import { SalesCsAvailability } from "../database/mongoose/schemas/SalesCsAvailability"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { User } from "../database/mongoose/schemas/User"
import { NotificationsService } from "../notifications/notifications.service"

const OUTCOMES: SalesLeadCallOutcome[] = ["no_answer", "not_interested", "call_back", "considering", "closed", "wrong_number", "other"]
@Injectable()
export class SalesLeadsService {
  constructor(
    @InjectModel("salesleadcases") private cases: Model<SalesLeadCase>,
    @InjectModel("salesleadassignments") private assignments: Model<SalesLeadAssignment>,
    @InjectModel("salesleadcalls") private calls: Model<SalesLeadCall>,
    @InjectModel("salescsavailabilities") private availabilityModel: Model<SalesCsAvailability>,
    @InjectModel("salesfunnel") private funnels: Model<SalesFunnel>,
    @InjectModel("saleschannels") private channels: Model<SalesChannel>,
    @InjectModel("salesorders") private orders: Model<SalesOrder>,
    @InjectModel("users") private users: Model<User>,
    private notifications: NotificationsService
  ) {}
  private manager(roles: string[] = []) { return roles.includes("admin") || roles.includes("sales-leader") }
  private month(now = new Date()) { const y = now.getFullYear(), m = now.getMonth(); return { key: `${y}-${String(m + 1).padStart(2, "0")}`, start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) } }
  private async eligible(userId: string, channelId?: string) {
    if (!Types.ObjectId.isValid(userId)) throw new HttpException("Sales CS không hợp lệ", HttpStatus.BAD_REQUEST)
    const [user, availability] = await Promise.all([this.users.findById(userId).lean(), this.availabilityModel.findOne({ salesCsId: userId }).lean()])
    if (!user || user.active === false || !user.roles?.includes("sales-cs") || availability?.isReceivingLeads === false) throw new HttpException("Sales CS không bật nhận khách", HttpStatus.BAD_REQUEST)
    if (channelId) {
      if (!Types.ObjectId.isValid(channelId)) throw new HttpException("Kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      const channel: any = await this.channels.findOne({ _id: channelId, deletedAt: null }).lean()
      if (!channel) throw new HttpException("Kênh không tồn tại", HttpStatus.NOT_FOUND)
      const assignedIds = [channel.assignedTo, ...(channel.assignedTos || [])].filter(Boolean).map((id: any) => id.toString())
      if (!assignedIds.includes(userId)) throw new HttpException("Sales CS không phụ trách kênh này", HttpStatus.BAD_REQUEST)
    }
    return user
  }
  private snapshot(f: any) { return { name: f.name, phoneNumber: f.phoneNumber, secondaryPhoneNumbers: f.secondaryPhoneNumbers || [], address: f.address, provinceId: f.province, channelId: f.channel } }
  async availableCs(channelId?: string) {
    let assignedIds: Types.ObjectId[] | undefined
    if (channelId) {
      if (!Types.ObjectId.isValid(channelId)) throw new HttpException("Kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      const channel: any = await this.channels.findOne({ _id: channelId, deletedAt: null }).lean()
      if (!channel) throw new HttpException("Kênh không tồn tại", HttpStatus.NOT_FOUND)
      assignedIds = Array.from(new Map([channel.assignedTo, ...(channel.assignedTos || [])].filter(Boolean).map((id: any) => [id.toString(), id])).values())
    }
    const users: any[] = await this.users.find({ roles: "sales-cs", active: { $ne: false }, ...(assignedIds ? { _id: { $in: assignedIds } } : {}) }).select("name username active roles").lean()
    const availability = await this.availabilityModel.find({ salesCsId: { $in: users.map((user) => user._id) } }).lean()
    const byUserId = new Map(availability.map((row: any) => [row.salesCsId.toString(), row]))
    return users.filter((user) => byUserId.get(user._id.toString())?.isReceivingLeads !== false).map((user) => ({ ...(byUserId.get(user._id.toString()) || { isReceivingLeads: true }), salesCsId: user }))
  }
  async availability() {
    const [users, rows] = await Promise.all([this.users.find({ roles: "sales-cs" }).select("name username active").lean(), this.availabilityModel.find().lean()])
    const byUser = new Map(rows.map((row: any) => [row.salesCsId.toString(), row]))
    return users.map((user: any) => ({ ...(byUser.get(user._id.toString()) || { isReceivingLeads: false }), _id: byUser.get(user._id.toString())?._id || user._id, salesCsId: user }))
  }
  async setAvailability(userId: string, isReceivingLeads: boolean, actor: string, note?: string) {
    const user = await this.users.findById(userId).lean()
    if (!user || !user.roles?.includes("sales-cs")) throw new HttpException("Người dùng không phải sales CS", HttpStatus.BAD_REQUEST)
    return this.availabilityModel.findOneAndUpdate({ salesCsId: userId }, { $set: { isReceivingLeads: !!isReceivingLeads, changedById: actor, changedAt: new Date(), note } }, { upsert: true, new: true })
  }
  async create(payload: any, hunterId: string) {
    if (!payload.name) throw new HttpException("Thiếu tên khách", HttpStatus.BAD_REQUEST)
    const now = new Date(), hasSalesCs = !!payload.salesCsId
    // SalesFunnel.user is required by the legacy schema. Until a CS claims the
    // case, retain the hunter as this compatibility owner; it is not a CS assignment.
    if (hasSalesCs) await this.eligible(payload.salesCsId, payload.channel || undefined)
    const funnel = await this.funnels.create({ name: payload.name, phoneNumber: payload.phoneNumber, secondaryPhoneNumbers: payload.secondaryPhoneNumbers || [], address: payload.address, province: payload.province, channel: payload.channel, user: hasSalesCs ? payload.salesCsId : hunterId, stage: "lead", updateStageLogs: [{ stage: "lead", updatedAt: now }], funnelSource: payload.funnelSource || "ads" })
    const lead = await this.cases.create({ salesFunnelId: funnel._id, hunterId, sourceChannelId: payload.channel, status: hasSalesCs ? "assigned" : "unassigned" })
    if (!hasSalesCs) return { lead, assignment: null, funnel }
    const period = this.month(now)
    const assignment = await this.assignments.create({ leadCaseId: lead._id, salesCsId: payload.salesCsId, assignedById: hunterId, kind: "initial", status: "active", cycleKey: period.key, cycleStartAt: period.start, cycleEndAt: period.end, startedAt: now, customerSnapshot: this.snapshot(funnel) })
    lead.currentAssignmentId = assignment._id as any; await lead.save()
    void this.notifications.createNotificationForSingleUser({ title: "Có lead mới", content: `Bạn được phân lead ${funnel.name}`, type: "sales-lead", link: `/sales/leads/${lead._id}`, createdAt: now }, payload.salesCsId)
    return { lead, assignment, funnel }
  }
  async pool() { return this.cases.find({ status: { $in: ["unassigned", "pooled"] } }).populate("salesFunnelId", "name phoneNumber").populate("hunterId", "name").sort({ updatedAt: -1 }).lean() }
  async assignPooled(id: string, salesCsId: string | undefined, actor: string, roles: string[] = []) {
    const isManager = this.manager(roles)
    const canAssign = isManager || roles.includes("sales-hunter") || roles.includes("sales-cs")
    if (!canAssign) throw new HttpException("Bạn không có quyền phân lead", HttpStatus.FORBIDDEN)
    const assigneeId = isManager || roles.includes("sales-hunter") ? salesCsId : actor
    if (!assigneeId) throw new HttpException("Cần chọn sales CS nhận lead", HttpStatus.BAD_REQUEST)
    const candidate: any = await this.cases.findById(id).lean()
    if (!candidate || !["unassigned", "pooled"].includes(candidate.status)) throw new HttpException("Lead đã được nhận hoặc không tồn tại", HttpStatus.CONFLICT)
    const funnel = await this.funnels.findById(candidate.salesFunnelId); if (!funnel) throw new HttpException("Funnel không tồn tại", HttpStatus.NOT_FOUND)
    await this.eligible(assigneeId, funnel.channel?.toString())
    const lead = await this.cases.findOneAndUpdate({ _id: id, status: { $in: ["unassigned", "pooled"] } }, { $set: { status: "assigned", updatedAt: new Date() } }, { new: true })
    if (!lead) throw new HttpException("Lead đã được nhận", HttpStatus.CONFLICT)
    const prev: any = await this.assignments.findOne({ leadCaseId: id }).sort({ endedAt: -1 }).lean(), now = new Date(), p = this.month(now)
    const assignment = await this.assignments.create({ leadCaseId: lead._id, salesCsId: assigneeId, assignedById: actor, kind: prev ? "recycled" : "initial", status: "active", cycleKey: p.key, cycleStartAt: p.start, cycleEndAt: p.end, startedAt: now, previousSalesCsId: prev?.salesCsId, customerSnapshot: this.snapshot(funnel) })
    await this.cases.findByIdAndUpdate(id, { $set: { currentAssignmentId: assignment._id } }); await this.funnels.findByIdAndUpdate(funnel._id, { $set: { user: assigneeId } })
    if (assigneeId !== actor) void this.notifications.createNotificationForSingleUser({ title: "Có lead mới", content: `Bạn được phân lead ${funnel.name}`, type: "sales-lead", link: `/sales/leads/${lead._id}`, createdAt: new Date() }, assigneeId)
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
    const q: any = { status: { $in: ["active", "retained"] } }; if (!this.manager(roles)) q.salesCsId = userId
    const assignments: any[] = await this.assignments.find(q).populate({ path: "leadCaseId", populate: { path: "salesFunnelId", select: "name phoneNumber" } }).populate("salesCsId", "name").sort({ startedAt: -1 }).lean()
    if (!needsCall) return assignments
    const ids = assignments.filter((a) => a.status === "active").map((a) => a._id); const called = await this.calls.distinct("assignmentId", { assignmentId: { $in: ids } }); return assignments.filter((a) => a.status === "active" && !called.some((x: any) => x.toString() === a._id.toString()))
  }
  private async access(id: string, userId: string, roles: string[]) {
    const lead: any = await this.cases.findById(id).lean(); if (!lead) throw new HttpException("Lead không tồn tại", HttpStatus.NOT_FOUND)
    if (this.manager(roles)) return { lead, mode: "all" }
    if (roles.includes("sales-hunter") && lead.hunterId.toString() === userId) return { lead, mode: "hunter" }
    const assignments: any[] = await this.assignments.find({ leadCaseId: id, salesCsId: userId }).lean(); if (assignments.length) return { lead, mode: "cs", assignments }
    throw new HttpException("Bạn không có quyền xem lead này", HttpStatus.FORBIDDEN)
  }
  async detail(id: string, userId: string, roles: string[]) {
    const data: any = await this.access(id, userId, roles); const funnel = await this.funnels.findById(data.lead.salesFunnelId).lean()
    if (data.mode === "hunter") return { ...data.lead, funnel: { name: funnel?.name, phoneNumber: funnel?.phoneNumber }, assignment: await this.assignments.findById(data.lead.currentAssignmentId).populate("salesCsId", "name").lean() }
    const assignments = data.mode === "all" ? await this.assignments.find({ leadCaseId: id }).populate("salesCsId", "name").sort({ startedAt: -1 }).lean() : data.assignments
    const calls = await this.calls.find({ assignmentId: { $in: assignments.map((a: any) => a._id) } }).sort({ calledAt: -1 }).lean(); return { ...data.lead, funnel, assignments, calls }
  }
  async addCall(id: string, body: any, userId: string, roles: string[]) {
    if (!OUTCOMES.includes(body.outcome) || !String(body.note || "").trim()) throw new HttpException("Cần chọn kết quả và nhập ghi chú", HttpStatus.BAD_REQUEST)
    const assignment: any = await this.assignments.findOne({ leadCaseId: id, status: "active", ...(this.manager(roles) ? {} : { salesCsId: userId }) })
    if (!assignment) throw new HttpException("Bạn không có kỳ chăm sóc đang hiệu lực", HttpStatus.FORBIDDEN)
    return this.calls.create({ leadCaseId: id, assignmentId: assignment._id, salesCsId: assignment.salesCsId, calledAt: body.calledAt ? new Date(body.calledAt) : new Date(), outcome: body.outcome, note: body.note.trim() })
  }
  async transfer(id: string, salesCsId: string, actor: string, roles: string[]) {
    await this.eligible(salesCsId); const current: any = await this.assignments.findOne({ leadCaseId: id, status: { $in: ["active", "retained"] }, ...(this.manager(roles) ? {} : { salesCsId: actor }) })
    if (!current) throw new HttpException("Bạn không quản lý khách này", HttpStatus.FORBIDDEN)
    if (current.salesCsId.toString() === salesCsId) throw new HttpException("Sales CS nhận đã là người quản lý", HttpStatus.BAD_REQUEST)
    const lead: any = await this.cases.findById(id); const funnel = await this.funnels.findById(lead.salesFunnelId); const now = new Date()
    current.status = "transferred"; current.endedAt = now; current.endReason = "manual_transfer"; await current.save()
    const next = await this.assignments.create({ leadCaseId: lead._id, salesCsId, assignedById: actor, kind: "manual_transfer", status: "active", cycleKey: lead.firstOfficialOrderId ? undefined : current.cycleKey, cycleStartAt: now, cycleEndAt: lead.firstOfficialOrderId ? undefined : current.cycleEndAt, startedAt: now, previousSalesCsId: current.salesCsId, customerSnapshot: this.snapshot(funnel) })
    lead.currentAssignmentId = next._id; lead.status = lead.firstOfficialOrderId ? "retained" : "assigned"; await lead.save(); await this.funnels.findByIdAndUpdate(funnel._id, { $set: { user: salesCsId } }); return next
  }
  async handleOfficialOrder(order: SalesOrder) {
    const lead: any = await this.cases.findOne({ salesFunnelId: order.salesFunnelId }); if (!lead || lead.firstOfficialOrderId) return
    const now = new Date(); const assignment: any = await this.assignments.findById(lead.currentAssignmentId); if (assignment) { assignment.status = "retained"; assignment.endedAt = now; assignment.endReason = "official"; await assignment.save() }
    await this.cases.findByIdAndUpdate(lead._id, { $set: { status: "retained", firstOfficialOrderId: order._id, firstOfficialAt: now, updatedAt: now } })
  }
  @Cron("0 5 0 1 * *", { timeZone: "Asia/Ho_Chi_Minh" }) async recycleExpired() {
    const rows: any[] = await this.assignments.find({ status: "active", cycleEndAt: { $lt: new Date() } }); for (const a of rows) { const lead: any = await this.cases.findById(a.leadCaseId); if (!lead || lead.firstOfficialOrderId) continue; a.status = "recycled"; a.endedAt = new Date(); a.endReason = "month_expired"; await a.save(); await this.cases.findByIdAndUpdate(lead._id, { $set: { status: "pooled", currentAssignmentId: null, updatedAt: new Date() } }); void this.notifications.createNotificationForSingleUser({ title: "Lead đã trả pool", content: "Lead chưa có đơn official đã hết chu kỳ tháng", type: "sales-lead", link: "/sales/leads/pool", createdAt: new Date() }, a.salesCsId.toString()) }
  }
}
