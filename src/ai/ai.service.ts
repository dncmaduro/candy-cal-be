import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { InjectConnection } from "@nestjs/mongoose"
import { Connection, Model, Types, isValidObjectId } from "mongoose"
import axios from "axios"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { AiUsage } from "../database/mongoose/schemas/AiUsage"
import { AiUserUsage } from "../database/mongoose/schemas/AiUserUsage"
import {
  AiConversation,
  AiConversationMessage
} from "../database/mongoose/schemas/AiConversation"
import { AiFeedback } from "../database/mongoose/schemas/AiFeedback"
import { Product } from "../database/mongoose/schemas/Product"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import {
  AI_ROUTING_TABLES,
  RoutingSource
} from "./ai.routing.context"
import { AI_DB_TABLES } from "./ai.db.context"
import { IncomeService } from "../income/income.service"

type OpenAiUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

@Injectable()
export class AiService {
  private readonly apiKey = process.env.OPENAI_API_KEY
  private readonly baseUrl =
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  private readonly model = process.env.OPENAI_MODEL
  private readonly temperature = Number(process.env.AI_TEMPERATURE || "0.2")
  private readonly timeoutMs = Number(process.env.AI_TIMEOUT_MS || "15000")
  private readonly maxOutputTokens = Number(
    process.env.AI_MAX_OUTPUT_TOKENS || "0"
  )
  private readonly maxQuestionChars = Number(
    process.env.AI_MAX_QUESTION_CHARS || "1000"
  )
  private readonly monthlyBudgetUsd = Number(
    process.env.AI_MONTHLY_BUDGET_USD || "3"
  )
  private readonly inputCostPer1M = Number(
    process.env.AI_INPUT_COST_PER_1M || "0.4"
  )
  private readonly outputCostPer1M = Number(
    process.env.AI_OUTPUT_COST_PER_1M || "1.6"
  )
  private readonly charsPerToken = Number(
    process.env.AI_CHARS_PER_TOKEN || "3"
  )
  private readonly dailyQuestionLimit = Number(
    process.env.AI_DAILY_QUESTION_LIMIT || "1000"
  )
  private readonly conversationTtlHours = Number(
    process.env.AI_CONVERSATION_TTL_HOURS || "24"
  )
  private readonly conversationMaxMessages = Number(
    process.env.AI_CONVERSATION_MAX_MESSAGES || "20"
  )
  private readonly routeMinConfidence = Number(
    process.env.AI_ROUTE_MIN_CONFIDENCE || "0.6"
  )

  constructor(
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>,
    @InjectModel("products")
    private readonly productModel: Model<Product>,
    @InjectModel("storagelogs")
    private readonly storageLogModel: Model<StorageLog>,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel("aiusages")
    private readonly aiUsageModel: Model<AiUsage>,
    @InjectModel("aiuserusages")
    private readonly aiUserUsageModel: Model<AiUserUsage>,
    @InjectModel("aiconversations")
    private readonly aiConversationModel: Model<AiConversation>,
    @InjectModel("aifeedbacks")
    private readonly aiFeedbackModel: Model<AiFeedback>,
    private readonly incomeService: IncomeService
  ) {}

  async ask(
    question: string,
    userId?: string,
    conversationId?: string,
    debug = false
  ): Promise<{ answer: string; conversationId: string }> {
    if (!question || !question.trim()) {
      throw new BadRequestException("Question is required")
    }
    if (question.length > this.maxQuestionChars) {
      throw new BadRequestException("Question is too long")
    }
    if (!this.apiKey) {
      throw new InternalServerErrorException("AI is not configured")
    }
    if (!this.model) {
      throw new InternalServerErrorException("AI model is not configured")
    }
    if (!userId) {
      throw new BadRequestException("User is required")
    }

    const isNewConversationRequest = !conversationId || !conversationId.trim()
    const safeConversationId =
      conversationId && conversationId.trim()
        ? conversationId.trim()
        : new Types.ObjectId().toString()
    await this.ensureConversationOwnership(userId, safeConversationId)

    await this.assertDailyLimit(userId)

    const monthKey = this.getMonthKey()
    const usage = await this.ensureUsageDoc(monthKey)
    const remainingBudget = this.monthlyBudgetUsd - (usage.totalCost || 0)
    if (remainingBudget <= 0) {
      throw new ForbiddenException("AI budget reached for this month")
    }
    const initialConversationTitle = isNewConversationRequest
      ? await this.generateConversationTitle(question)
      : undefined

    const conversation = await this.getOrCreateConversation(
      userId,
      safeConversationId,
      question,
      initialConversationTitle
    )
    const resolved = this.resolveAmbiguitySelection(question, conversation)
    if (resolved.question !== question) {
      console.info("[ai] resolvedQuestion", { from: question, to: resolved.question })
    }
    const isIncomeRequest = this.isIncomeQuestion(resolved.question)
    const isIncomeBySourceRequest = this.isIncomeBySourceQuestion(
      resolved.question
    )
    const isIncomeProductsRequest = this.isIncomeProductsQuantityQuestion(
      resolved.question
    )
    const shouldUseRangeStats =
      isIncomeRequest || isIncomeBySourceRequest || isIncomeProductsRequest
    const rangeStatsFacts = await this.tryBuildRangeStatsFacts(
      resolved.question,
      shouldUseRangeStats,
      conversation
    )
    if (shouldUseRangeStats && !rangeStatsFacts) {
      const missingArgsMessage =
        "De tra loi doanh thu, he thong bat buoc goi API incomes/range-stats. " +
        "Ban vui long cung cap day du ten kenh va khoang ngay theo dinh dang dd/mm/yyyy. " +
        "Vi du: doanh thu cua kenh ABC tu ngay 01/02/2026 den ngay 24/02/2026."
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: missingArgsMessage,
          createdAt: new Date()
        }
      ])
      return { answer: missingArgsMessage, conversationId: safeConversationId }
    }
    let queryPlan = resolved.plan
      ? resolved.plan
      : await this.planDataFetch(resolved.question, conversation)
    let fetchedData: Record<string, any> = {}
    let fetchedMeta: Record<string, any> = {}
    if (rangeStatsFacts) {
      queryPlan = {
        tables: [
          {
            collection: "incomes",
            filter: {
              channelId: rangeStatsFacts.channelId,
              date: {
                $gte: rangeStatsFacts.startDate,
                $lte: rangeStatsFacts.endDate
              }
            },
            limit: 1
          }
        ],
        reason: "Cau hoi thong ke range: goi incomes/range-stats de lay nhanh."
      }
      fetchedData = {
        rangeStats: {
          channelId: rangeStatsFacts.channelId,
          channelName: rangeStatsFacts.channelName,
          startDate: rangeStatsFacts.startDate,
          endDate: rangeStatsFacts.endDate,
          stats: rangeStatsFacts.stats
        }
      }
      fetchedMeta = {
        rangeStats: {
          via: "incomes/range-stats",
          channelId: rangeStatsFacts.channelId,
          startDate: rangeStatsFacts.startDate,
          endDate: rangeStatsFacts.endDate
        }
      }
    } else {
      if (!queryPlan?.tables?.length) {
        const direct =
          this.buildDirectPlan(resolved.question, conversation) ||
          this.buildFallbackPlanFromContext(resolved.question)
        if (direct) queryPlan = direct
      }
      const fetchedResult = await this.fetchDataByPlan(queryPlan, debug)
      fetchedData = fetchedResult.data
      fetchedMeta = fetchedResult.meta
    }
    console.info("[ai] plan", queryPlan)
    console.info("[ai] fetched.keys", Object.keys(fetchedData))
    console.info("[ai] fetched.meta", fetchedMeta)
    const ambiguity =
      !rangeStatsFacts
        ? this.detectNameAmbiguity(queryPlan, {
            data: fetchedData,
            meta: fetchedMeta
          })
        : null
    if (ambiguity && !rangeStatsFacts) {
      await this.storePendingSelection(conversation, ambiguity.options)
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: ambiguity.message,
          createdAt: new Date()
        }
      ])
      return { answer: ambiguity.message, conversationId: safeConversationId }
    }
    const isIncomeBySourceQuestion = isIncomeBySourceRequest
    const isIncomeProductsQuestion = isIncomeProductsRequest
    const isIncomeOverviewQuestion =
      isIncomeRequest && !isIncomeBySourceQuestion && !isIncomeProductsQuestion
    const responseMode = isIncomeProductsQuestion
      ? "income_products_quantity"
      : isIncomeBySourceQuestion
        ? "income_by_source"
      : isIncomeOverviewQuestion
        ? "income_overview"
        : "general"
    const factsData = isIncomeOverviewQuestion
      ? this.buildIncomeOverviewFactsOnly(fetchedData)
      : isIncomeProductsQuestion
      ? this.buildIncomeProductsQuantityFactsOnly(fetchedData)
      : isIncomeBySourceQuestion
        ? this.buildIncomeSourceFactsOnly(fetchedData)
      : fetchedData
    const facts = {
      plan: queryPlan,
      data: factsData
    }
    const systemPrompt =
      "Ban la tro ly tra loi dua tren du lieu duoc cung cap. " +
      "Tra loi tu do, ro rang, dung du lieu. " +
      "Chi tra loi ket qua cuoi cung, ngan gon. " +
      "Khong giai thich ky thuat truy van va khong giai thich logic ngay thang/khung gio. " +
      "Neu cau hoi ve ma/SKU/san pham da ban trong ngay/khoang ngay, bat buoc su dung field productsQuantity de tra loi. " +
      "Neu cau hoi la doanh thu theo nguon, chi duoc tra loi cac so lieu theo nguon (ads, affiliate, affiliateAds, other) va tong theo nguon; khong tra loi cac muc khac. " +
      "Neu cau hoi la doanh thu tong quan (khong theo nguon), bat buoc neu day du 2 phan: Truoc chiet khau va Sau chiet khau; moi phan gom it nhat tong doanh thu, doanh thu live, doanh thu video va doanh thu khac. Tuyet doi khong liet ke theo nguon trong mode nay. " +
      "Neu co nhieu nguon du lieu hoac nhieu dong ket qua, hay tach rieng tung nguon/tung dong, khong gop chung. " +
      "Neu data la danh sach (array) co nhieu phan tu, phai liet ke tung phan tu voi cac truong chinh. " +
      "Neu khong du du lieu hoac khong tim thay, noi ro. " +
      "Khong tu suy doan. " +
      "Neu hoi ve so thung: so thung = floor(ton kho / so luong moi thung), so du le = ton kho % so luong moi thung. " +
      "Neu hoi ve tong so luong trong nhat ky kho, tong = sum(quantity) cua cac log. " +
      "Bat buoc liet ke DAY DU tat ca phan tu trong cac mang du lieu; khong duoc chon 1 phan tu."
    const userPrompt =
      `Response mode: ${responseMode}\n` +
      `Cau hoi: ${question}\n` +
      `Du lieu: ${JSON.stringify(facts)}`
    const askedDateLabel = this.extractQuestionDateLabel(resolved.question)

    const deterministicAnswer = this.tryBuildDeterministicIncomeAnswer(
      responseMode,
      factsData,
      askedDateLabel
    )
    if (deterministicAnswer) {
      console.info("[ai] answer.deterministic", { responseMode })
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: deterministicAnswer,
          createdAt: new Date()
        }
      ])
      return { answer: deterministicAnswer, conversationId: safeConversationId }
    }

    const historyMessages = (conversation?.messages || [])
      .slice(-this.conversationMaxMessages)
      .map((m) => ({
        role: m.role,
        content: m.content
      }))

    const estimatedInputTokens = this.estimateTokens(
      `${systemPrompt}\n${historyMessages
        .map((m) => `${m.role}:${m.content}`)
        .join("\n")}\n${userPrompt}`
    )
    const estimatedCost =
      this.costForInputTokens(estimatedInputTokens) +
      this.costForOutputTokens(
        this.maxOutputTokens > 0 ? this.maxOutputTokens : 2048
      )
    if (remainingBudget < estimatedCost) {
      throw new ForbiddenException("AI budget too low for this request")
    }

    const responseText = await this.callOpenAi(
      systemPrompt,
      userPrompt,
      historyMessages
    )
    console.info("[ai] answer.raw", responseText)
    await this.appendConversationMessages(conversation, [
      { role: "user", content: resolved.question, createdAt: new Date() },
      { role: "assistant", content: responseText.trim(), createdAt: new Date() }
    ])
    return { answer: responseText.trim(), conversationId: safeConversationId }
  }

  private async callOpenAi(
    systemPrompt: string,
    userPrompt: string,
    history: Array<{ role: "user" | "assistant"; content: string }>
  ) {
    try {
      const res = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          temperature: this.temperature,
          ...(this.maxOutputTokens > 0
            ? { max_tokens: this.maxOutputTokens }
            : {}),
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userPrompt }
          ]
        },
        {
          timeout: this.timeoutMs,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          }
        }
      )

      const answer = res?.data?.choices?.[0]?.message?.content
      if (!answer) {
        throw new Error("Empty AI response")
      }

      const usage: OpenAiUsage = res?.data?.usage || {}
      await this.recordUsage(usage)
      return answer
    } catch (error: any) {
      console.error("AI call failed:", error?.message || error)
      throw new InternalServerErrorException("AI request failed")
    }
  }

  private async buildFacts(question: string) {
    console.info("[ai] buildFacts: storageitems", { question })
    const itemLookup = this.extractStorageItemLookup(question)
    if (!itemLookup) {
      if (this.isGeneralExplanationQuestion(question)) {
        return {
          type: "formula",
          topic: "boxes",
          explanation:
            "So thung = floor(ton kho / so luong moi thung). So du le = ton kho % so luong moi thung."
        }
      }
      return { type: "unknown", message: "Khong nhan dien duoc ma hang" }
    }
    const metric = this.extractMetric(question)
    console.info("[ai] buildFacts: storageitems.lookup", {
      itemLookup,
      metric
    })

    const itemResult = await this.findStorageItem(itemLookup)
    if (!itemResult.found) {
      if (itemResult.payload?.type === "storage_item") {
        const payload: any = itemResult.payload
        return {
          type: "storagelogs",
          found: false,
          ...(payload.code ? { code: payload.code } : {}),
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.candidates ? { candidates: payload.candidates } : {})
        }
      }
      return itemResult.payload
    }
    const item = itemResult.item

    if (!item) {
      return { type: "storage_item", found: false }
    }

    const metrics = {
      quantityPerBox: item.quantityPerBox ?? 0,
      receivedQuantity: item.receivedQuantity?.quantity ?? 0,
      receivedReal: item.receivedQuantity?.real ?? 0,
      deliveredQuantity: item.deliveredQuantity?.quantity ?? 0,
      deliveredReal: item.deliveredQuantity?.real ?? 0,
      restQuantity: item.restQuantity?.quantity ?? 0,
      restReal: item.restQuantity?.real ?? 0
    }
    const qtyPerBox = metrics.quantityPerBox || 0
    const boxes =
      qtyPerBox > 0 ? Math.floor(metrics.restQuantity / qtyPerBox) : 0
    const remainder =
      qtyPerBox > 0 ? metrics.restQuantity % qtyPerBox : metrics.restQuantity

    const requestedMetric = metric || "all"
    const metricValueMap: Record<string, any> = {
      rest: {
        quantity: metrics.restQuantity,
        real: metrics.restReal
      },
      boxes: {
        boxes,
        remainder,
        quantityPerBox: qtyPerBox,
        restQuantity: metrics.restQuantity,
        explanation:
          qtyPerBox > 0
            ? `so thung = floor(${metrics.restQuantity} / ${qtyPerBox}), so du le = ${metrics.restQuantity} % ${qtyPerBox}`
            : "quantityPerBox = 0, khong the tinh so thung"
      },
      received: {
        quantity: metrics.receivedQuantity,
        real: metrics.receivedReal
      },
      delivered: {
        quantity: metrics.deliveredQuantity,
        real: metrics.deliveredReal
      },
      quantityPerBox: metrics.quantityPerBox
    }

    return {
      type: "storage_item",
      found: true,
      code: item.code,
      name: item.name,
      metrics: { ...metrics, boxes, remainder },
      requestedMetric,
      requestedValue: metric ? metricValueMap[metric] ?? null : metrics
    }
  }

  private async buildProductFacts(question: string) {
    console.info("[ai] buildFacts: products", { question })
    const name = this.extractProductName(question)
    if (!name) {
      console.info("[ai] buildFacts: products.miss_name -> fallback_storageitems")
      return await this.buildFacts(question)
    }

    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const product = await this.productModel
      .findOne({ name: { $regex: `^${escaped}$`, $options: "i" }, deletedAt: null })
      .populate({ path: "items._id", select: "code name" })
      .lean()
      .exec()

    if (!product) {
      console.info("[ai] buildFacts: products.not_found -> fallback_storageitems", {
        name
      })
      return await this.buildFacts(question)
    }

    const items = (product.items || []).map((item: any) => ({
      code: item?._id?.code,
      name: item?._id?.name,
      quantity: item?.quantity ?? 0
    }))

    return {
      type: "product",
      found: true,
      name: product.name,
      itemCount: items.length,
      items
    }
  }

  private async buildStorageLogFacts(question: string) {
    console.info("[ai] buildFacts: storagelogs", { question })
    const itemLookup = this.extractStorageItemLookup(question)
    if (!itemLookup) {
      return {
        type: "storagelogs",
        found: false,
        message: "Khong nhan dien duoc ma hang"
      }
    }
    console.info("[ai] buildFacts: storagelogs.lookup", { itemLookup })

    let items: Array<any> = []
    if (itemLookup.type === "name") {
      items = await this.findStorageItemsByName(itemLookup.value)
      console.info("[ai] storagelogs.items_by_name", {
        name: itemLookup.value,
        count: items.length,
        items: items.map((i) => ({ id: i._id?.toString(), code: i.code, name: i.name }))
      })
      if (!items.length) {
        return { type: "storagelogs", found: false, name: itemLookup.value }
      }
    } else {
      const itemResult = await this.findStorageItem(itemLookup)
      console.info("[ai] storagelogs.item_by_code", {
        lookup: itemLookup,
        found: itemResult.found,
        item: itemResult.item
          ? { id: itemResult.item._id?.toString(), code: itemResult.item.code, name: itemResult.item.name }
          : null
      })
      if (!itemResult.found) {
        const nameFallback = this.extractStorageItemName(question)
        if (nameFallback) {
          items = await this.findStorageItemsByNameAdaptive(nameFallback)
          console.info("[ai] storagelogs.items_by_name_fallback", {
            name: nameFallback,
            count: items.length,
            items: items.map((i) => ({
              id: i._id?.toString(),
              code: i.code,
              name: i.name
            }))
          })
          if (items.length) {
            // Continue with name-based results
          } else {
            return { type: "storagelogs", found: false, name: nameFallback }
          }
        } else if (itemResult.payload?.type === "storage_item") {
          const payload: any = itemResult.payload
          return {
            type: "storagelogs",
            found: false,
            ...(payload.code ? { code: payload.code } : {}),
            ...(payload.name ? { name: payload.name } : {}),
            ...(payload.candidates ? { candidates: payload.candidates } : {})
          }
        } else {
          return itemResult.payload
        }
      }
      if (itemResult.item) items = [itemResult.item]
    }
    if (!items.length) {
      return { type: "storagelogs", found: false }
    }

    const status = this.extractStorageLogStatus(question)
    const dateRange = this.extractDateRange(question)
    const logMetric = this.extractStorageLogMetric(question)
    console.info("[ai] buildFacts: storagelogs.filters", { status, dateRange })
    const itemIds = items.map((i) => i._id)
    const query: any = {
      $or: [{ "item._id": { $in: itemIds } }, { "items._id": { $in: itemIds } }]
    }
    if (status) {
      query.status = status
    }
    if (dateRange) {
      query.date = { $gte: dateRange.start, $lte: dateRange.end }
    }
    console.info("[ai] storagelogs.query", { query })

    const totalsAgg = await this.storageLogModel
      .aggregate([
        { $match: query },
        {
          $addFields: {
            qtyFromItem: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$item", null] },
                    { $in: ["$item._id", itemIds] }
                  ]
                },
                "$item.quantity",
                0
              ]
            },
            qtyFromItems: {
              $reduce: {
                input: { $ifNull: ["$items", []] },
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    {
                      $cond: [
                        { $in: ["$$this._id", itemIds] },
                        "$$this.quantity",
                        0
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        { $addFields: { qty: { $add: ["$qtyFromItem", "$qtyFromItems"] } } },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: "$qty" },
            total: { $sum: 1 }
          }
        }
      ])
      .exec()
    console.info("[ai] storagelogs.totals", {
      total: totalsAgg?.[0]?.total || 0,
      totalQuantity: totalsAgg?.[0]?.totalQuantity || 0
    })
    const totalQuantity = totalsAgg?.[0]?.totalQuantity || 0
    const total = totalsAgg?.[0]?.total || 0

    const logs = await this.storageLogModel
      .find(query)
      .sort({ date: -1 })
      .limit(20)
      .lean()
      .exec()
    console.info("[ai] storagelogs.logs", {
      count: logs.length,
      sample: logs.slice(0, 3).map((log) => ({
        id: log._id?.toString(),
        status: log.status,
        date: log.date,
        item: log.item?._id?.toString(),
        itemsCount: (log.items || []).length
      }))
    })

    const itemIdSet = new Set(itemIds.map((id) => id.toString()))
    const mapped = logs.map((log) => ({
      status: log.status,
      date: log.date,
      note: log.note || "",
      tag: log.tag || "",
      quantity:
        (log.item?._id && itemIdSet.has(log.item._id.toString())
          ? log.item?.quantity || 0
          : 0) +
        (log.items || []).reduce((sum: number, i: any) => {
          if (i?._id && itemIdSet.has(i._id.toString())) {
            return sum + (i.quantity || 0)
          }
          return sum
        }, 0)
    }))

    return {
      type: "storagelogs",
      found: true,
      ...(items.length === 1
        ? { code: items[0].code, name: items[0].name }
        : {
            nameQuery: itemLookup.type === "name" ? itemLookup.value : undefined,
            items: items.map((i) => ({ code: i.code, name: i.name }))
          }),
      status: status || "all",
      dateRange: dateRange
        ? { start: dateRange.start, end: dateRange.end }
        : null,
      total,
      totalQuantity,
      requestedMetric: logMetric || "totalQuantity",
      requestedValue: logMetric === "total" ? total : totalQuantity,
      logs: mapped
    }
  }

  private async routeQuestion(
    question: string
  ): Promise<{ source: RoutingSource; confidence: number }> {
    if (this.isStorageLogQuestion(question)) {
      return { source: "storagelogs", confidence: 1 }
    }
    const productName = this.extractProductName(question)
    if (productName) {
      return { source: "products", confidence: 1 }
    }

    const tables = AI_ROUTING_TABLES.map((t) => ({
      source: t.source,
      table: t.table,
      description: t.description,
      examples: t.exampleQuestions
    }))

    const systemPrompt =
      "Ban la bo phan loai cau hoi. " +
      "Chon dung 1 nguon du lieu tu danh sach. " +
      'Neu khong chac, tra ve "unknown". ' +
      'Tra ve dung JSON: {"source":"...","confidence":0.0-1.0}.'
    const userPrompt =
      `Cau hoi: ${question}\n` +
      `Danh sach nguon:\n${JSON.stringify(tables)}`

    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      if (!parsed) return { source: "unknown", confidence: 0 }
      const source = parsed.source as RoutingSource
      if (
        source !== "unknown" &&
        !AI_ROUTING_TABLES.some((t) => t.source === source)
      ) {
        return { source: "unknown", confidence: 0 }
      }
      const confidence =
        typeof parsed.confidence === "number" ? parsed.confidence : 0
      if (confidence < this.routeMinConfidence) {
        return { source: "unknown", confidence }
      }
      return { source, confidence }
    } catch {
      return { source: "unknown", confidence: 0 }
    }
  }

  private safeParseRoute(raw: string) {
    try {
      return JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return null
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
  }

  private async planDataFetch(
    question: string,
    conversation?: AiConversation | null
  ): Promise<{
    tables: Array<{
      collection: string
      filter?: Record<string, any>
      projection?: string[]
      sort?: Record<string, 1 | -1>
      limit?: number
    }>
    reason?: string
  }> {
    const directPlan = this.buildDirectPlan(question, conversation)
    if (directPlan) return directPlan

    const context = AI_DB_TABLES.map((t) => ({
      collection: t.collection,
      description: t.description,
      keyFields: t.keyFields
    }))
    const systemPrompt =
      "Ban la bo lap ke hoach truy van du lieu. " +
      "Dua vao cau hoi va mo ta bang, chon cac bang can truy van. " +
      "Tra ve dung JSON: {\"tables\":[{\"collection\":\"...\",\"filter\":{...},\"projection\":[...],\"sort\":{...},\"limit\":number}],\"reason\":\"...\"}. " +
      "Chi chon cac bang can thiet (toi da 3). " +
      "Neu khong chac, de tables rong. " +
      "Moi cau hoi ve ton kho bat buoc truy van bang storageitems. " +
      "Moi cau hoi ve doanh thu bat buoc truy van bang incomes. " +
      "Cau hoi ve SKU Tiktok Shop bat buoc truy van bang products. " +
      "Cau hoi ve SKU Shopee bat buoc truy van bang shopeeproducts."
    const lastUserQuestion = conversation
      ? [...conversation.messages]
          .reverse()
          .find((m) => m.role === "user")?.content
      : undefined
    const pendingSelection = conversation?.pendingSelection?.options?.length
      ? conversation.pendingSelection.options
      : null
    const pendingContext = pendingSelection
      ? pendingSelection
          .map((o) => {
            const code = o.code ? ` (ma: ${o.code})` : ""
            const name = o.name || "Khong ro ten"
            return `${o.index}. ${name}${code}`
          })
          .join("\n")
      : ""
    const userPrompt =
      `Cau hoi: ${question}\n` +
      (lastUserQuestion ? `Cau hoi truoc do: ${lastUserQuestion}\n` : "") +
      (pendingContext
        ? `Dang cho nguoi dung chon 1 trong cac ket qua:\n${pendingContext}\n`
        : "") +
      `Mo ta bang:\n${JSON.stringify(context)}`

    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      if (!parsed || !Array.isArray(parsed.tables)) return { tables: [] }
      const tables = parsed.tables
        .map((t: any) => {
          if (typeof t === "string") return { collection: t }
          return t
        })
        .filter((t: any) => t && typeof t.collection === "string")
      return {
        tables,
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined
      }
    } catch {
      return { tables: [] }
    }
  }

  private buildDirectPlan(question: string, conversation?: AiConversation | null) {
    const trimmed = question.trim()
    if (this.isIncomeQuestion(trimmed)) {
      const dateRange = this.extractDateRange(trimmed)
      const channelName = this.extractIncomeChannelName(trimmed)
      const filter: Record<string, any> = {}
      if (dateRange) {
        filter.date = { $gte: dateRange.start, $lte: dateRange.end }
      }
      if (channelName) {
        filter.channelName = channelName
      }
      return {
        tables: [
          {
            collection: "incomes",
            filter,
            projection: [
              "orderId",
              "customer",
              "province",
              "shippingProvider",
              "channel",
              "date",
              "products"
            ],
            sort: { date: -1 as const },
            limit: 200
          }
        ],
        reason: "Cau hoi doanh thu: truy van incomes."
      }
    }
    const skuChannel = this.detectSkuChannel(trimmed, conversation)
    if (skuChannel === "tiktok") {
      return {
        tables: [
          {
            collection: "products",
            filter: { deletedAt: null },
            projection: ["name", "items"],
            limit: 200
          }
        ],
        reason: "Cau hoi ve SKU Tiktok Shop: truy van products."
      }
    }
    if (skuChannel === "shopee") {
      return {
        tables: [
          {
            collection: "shopeeproducts",
            filter: { deletedAt: null },
            projection: ["name", "items"],
            limit: 200
          }
        ],
        reason: "Cau hoi ve SKU Shopee: truy van shopeeproducts."
      }
    }
    const codeMatch = trimmed.match(/^(ma|mã)\s+([a-z0-9_-]+)/i)
    if (codeMatch?.[2]) {
      const code = codeMatch[2].toUpperCase()
      return {
        tables: [
          {
            collection: "storageitems",
            filter: { code },
            projection: ["code", "name", "restQuantity", "quantityPerBox"],
            limit: 1
          }
        ],
        reason: "Truy van storageitems theo ma hang."
      }
    }

    const nameMatch = trimmed.match(/^(mat hang|mặt hàng)\s+(.+)/i)
    if (nameMatch?.[2]) {
      const name = nameMatch[2].trim()
      return {
        tables: [
          {
            collection: "storageitems",
            filter: { name },
            projection: ["code", "name", "restQuantity", "quantityPerBox"],
            limit: 99
          }
        ],
        reason: "Truy van storageitems theo ten mat hang."
      }
    }
    const tonKhoName = this.extractNameAfterTonKho(trimmed)
    if (tonKhoName) {
      return {
        tables: [
          {
            collection: "storageitems",
            filter: { name: tonKhoName },
            projection: ["code", "name", "restQuantity", "quantityPerBox"],
            limit: 99
          }
        ],
        reason: "Cau hoi ton kho: truy van storageitems theo ten mat hang."
      }
    }
    const lower = trimmed
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    if (/^(ket\\s*qua|ket qua|kq|chon|option)\\s*\\d+$/.test(lower)) {
      const lastUserQuestion = conversation
        ? [...conversation.messages]
            .reverse()
            .find((m) => m.role === "user")?.content
        : undefined
      if (lastUserQuestion && /ton kho|tồn kho/.test(lastUserQuestion)) {
        return {
          tables: [
            {
              collection: "storageitems",
              filter: {},
              projection: ["code", "name", "restQuantity", "quantityPerBox"],
              limit: 99
            }
          ],
          reason: "Ngu canh truoc do la ton kho; can truy van storageitems."
        }
      }
    }
    return null
  }

  private detectSkuChannel(
    question: string,
    conversation?: AiConversation | null
  ): "tiktok" | "shopee" | null {
    const normalize = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    const normalized = normalize(question)
    const hasSkuSignal = /(sku|ma sku|danh sach sku|cac sku)/.test(normalized)
    const hasTiktok = /(tiktok|tik tok)/.test(normalized)
    const hasShopee = /shopee/.test(normalized)
    if (hasSkuSignal && hasTiktok) return "tiktok"
    if (hasSkuSignal && hasShopee) return "shopee"
    const lastUserQuestion = conversation
      ? [...conversation.messages]
          .reverse()
          .find((m) => m.role === "user")?.content
      : ""
    const prev = normalize(lastUserQuestion || "")
    const prevHasSkuSignal = /(sku|ma sku|danh sach sku|cac sku)/.test(prev)
    if (prevHasSkuSignal && hasTiktok) return "tiktok"
    if (prevHasSkuSignal && hasShopee) return "shopee"
    if (hasSkuSignal) {
      if (/(tiktok|tik tok)/.test(prev)) return "tiktok"
      if (/shopee/.test(prev)) return "shopee"
    }
    return null
  }

  private isIncomeQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(doanh thu|revenue|thu nhap|tong thu)/.test(normalized)
  }

  private isIncomeBySourceQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasIncomeSignal = /(doanh thu|revenue|thu nhap|tong thu)/.test(
      normalized
    )
    const hasSourceSignal =
      /(theo nguon|tach.*nguon|chi tiet.*nguon|nguon doanh thu|co cau nguon|ads|affiliate)/.test(
        normalized
      )
    return hasIncomeSignal && hasSourceSignal
  }

  private isIncomeProductsQuantityQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasIncomeSignal =
      /(doanh thu|revenue|ban ra|don hang|ban duoc|ban chay|nhieu nhat|top)/.test(
        normalized
      )
    const hasProductSignal =
      /(ma|sku|san pham|mat hang|hang ban|duoc ban|ban trong)/.test(
        normalized
      )
    const hasDateSignal =
      /\d{1,2}\/\d{1,2}\/\d{4}/.test(normalized) ||
      /(ngay|khoang|tu ngay|den ngay)/.test(normalized)
    return hasIncomeSignal && hasProductSignal && hasDateSignal
  }

  private buildIncomeSourceFactsOnly(fetchedData: Record<string, any>) {
    const range = fetchedData?.rangeStats
    if (!range?.stats?.current) return fetchedData
    return {
      rangeStats: {
        channelId: range.channelId,
        channelName: range.channelName,
        startDate: range.startDate,
        endDate: range.endDate,
        stats: {
          period: range.stats.period,
          current: {
            beforeDiscount: {
              totalIncome: range.stats.current.beforeDiscount?.totalIncome ?? 0,
              sources: range.stats.current.beforeDiscount?.sources || {}
            },
            afterDiscount: {
              totalIncome: range.stats.current.afterDiscount?.totalIncome ?? 0,
              sources: range.stats.current.afterDiscount?.sources || {}
            }
          },
          changes: range.stats.changes
            ? {
                beforeDiscount: {
                  sources: range.stats.changes.beforeDiscount?.sources || {}
                },
                afterDiscount: {
                  sources: range.stats.changes.afterDiscount?.sources || {}
                }
              }
            : undefined
        }
      }
    }
  }

  private buildIncomeOverviewFactsOnly(fetchedData: Record<string, any>) {
    const range = fetchedData?.rangeStats
    if (!range?.stats?.current) return fetchedData
    return {
      rangeStats: {
        channelId: range.channelId,
        channelName: range.channelName,
        startDate: range.startDate,
        endDate: range.endDate,
        stats: {
          period: range.stats.period,
          current: {
            beforeDiscount: {
              totalIncome: range.stats.current.beforeDiscount?.totalIncome ?? 0,
              liveIncome: range.stats.current.beforeDiscount?.liveIncome ?? 0,
              videoIncome: range.stats.current.beforeDiscount?.videoIncome ?? 0,
              otherIncome: range.stats.current.beforeDiscount?.otherIncome ?? 0
            },
            afterDiscount: {
              totalIncome: range.stats.current.afterDiscount?.totalIncome ?? 0,
              liveIncome: range.stats.current.afterDiscount?.liveIncome ?? 0,
              videoIncome: range.stats.current.afterDiscount?.videoIncome ?? 0,
              otherIncome: range.stats.current.afterDiscount?.otherIncome ?? 0
            }
          }
        }
      }
    }
  }

  private tryBuildDeterministicIncomeAnswer(
    responseMode: string,
    factsData: Record<string, any>,
    askedDateLabel?: string | null
  ) {
    const range = factsData?.rangeStats
    const current = range?.stats?.current
    if (!current) return null

    const fmt = (value: any) => Number(value || 0).toLocaleString("vi-VN")
    const titleDate =
      askedDateLabel ||
      this.formatDateRangeLabel(range.startDate, range.endDate)
    const titleLine = `Kênh ${range.channelName || ""} (${titleDate})`

    if (responseMode === "income_by_source") {
      const b = current.beforeDiscount || {}
      const a = current.afterDiscount || {}
      return [
        titleLine,
        "",
        "Trước chiết khấu:",
        `- Quảng cáo: ${fmt(b?.sources?.ads)} VNĐ`,
        `- Affiliate: ${fmt(b?.sources?.affiliate)} VNĐ`,
        `- Affiliate Ads: ${fmt(b?.sources?.affiliateAds)} VNĐ`,
        `- Khác: ${fmt(b?.sources?.other)} VNĐ`,
        `- Tổng: ${fmt(b?.totalIncome)} VNĐ`,
        "",
        "Sau chiết khấu:",
        `- Quảng cáo: ${fmt(a?.sources?.ads)} VNĐ`,
        `- Affiliate: ${fmt(a?.sources?.affiliate)} VNĐ`,
        `- Affiliate Ads: ${fmt(a?.sources?.affiliateAds)} VNĐ`,
        `- Khác: ${fmt(a?.sources?.other)} VNĐ`,
        `- Tổng: ${fmt(a?.totalIncome)} VNĐ`
      ].join("\n")
    }

    if (responseMode === "income_overview") {
      const b = current.beforeDiscount || {}
      const a = current.afterDiscount || {}
      return [
        titleLine,
        "",
        "Trước chiết khấu:",
        `- Tổng doanh thu: ${fmt(b?.totalIncome)} VNĐ`,
        `- Doanh thu live: ${fmt(b?.liveIncome)} VNĐ`,
        `- Doanh thu video: ${fmt(b?.videoIncome)} VNĐ`,
        `- Doanh thu khác: ${fmt(b?.otherIncome)} VNĐ`,
        "",
        "Sau chiết khấu:",
        `- Tổng doanh thu: ${fmt(a?.totalIncome)} VNĐ`,
        `- Doanh thu live: ${fmt(a?.liveIncome)} VNĐ`,
        `- Doanh thu video: ${fmt(a?.videoIncome)} VNĐ`,
        `- Doanh thu khác: ${fmt(a?.otherIncome)} VNĐ`
      ].join("\n")
    }
    return null
  }

  private formatDateRangeLabel(startDate: any, endDate: any) {
    const toLabel = (value: any) => {
      const d = new Date(value)
      if (Number.isNaN(d.getTime())) return ""
      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}/${d.getUTCFullYear()}`
    }
    const start = toLabel(startDate)
    const end = toLabel(endDate)
    if (start && end && start !== end) return `${start} - ${end}`
    return start || end || "không rõ thời gian"
  }

  private extractQuestionDateLabel(question: string) {
    const range = this.extractDateRange(question)
    if (!range) return null
    const fmt = (date: Date) =>
      `${String(date.getUTCDate()).padStart(2, "0")}/${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}/${date.getUTCFullYear()}`
    const start = fmt(range.start)
    const end = fmt(range.end)
    if (start === end) return start
    return `${start} - ${end}`
  }

  private buildIncomeProductsQuantityFactsOnly(fetchedData: Record<string, any>) {
    const range = fetchedData?.rangeStats
    if (!range?.stats?.current) return fetchedData
    return {
      rangeStats: {
        channelId: range.channelId,
        channelName: range.channelName,
        startDate: range.startDate,
        endDate: range.endDate,
        stats: {
          period: range.stats.period,
          current: {
            productsQuantity: range.stats.current.productsQuantity || {}
          }
        }
      }
    }
  }

  private extractIncomeChannelName(question: string) {
    const patterns = [
      /c(?:ua|của)\s*k(?:e|ê)nh\s*([^\n\r?!.]+)/i,
      /k(?:e|ê)nh\s*([^\n\r?!.]+)/i
    ]
    for (const pattern of patterns) {
      const match = question.match(pattern)
      if (match?.[1]) {
        const cleaned = this.cleanIncomeChannelName(match[1])
        if (cleaned) return cleaned
      }
    }
    return null
  }

  private cleanIncomeChannelName(raw: string) {
    let value = String(raw || "").trim().replace(/[?!.]+$/g, "")
    if (!value) return null

    const stopPatterns = [
      /\bng(?:a|à)y\b[\s\S]*$/i,
      /\bt(?:u|ừ)\s*ng(?:a|à)y\b[\s\S]*$/i,
      /\b(?:d|đ)(?:e|ế)n\s*ng(?:a|à)y\b[\s\S]*$/i,
      /\btrong\s*kho(?:a|ả)ng\b[\s\S]*$/i,
      /\bkho(?:a|ả)ng\s*th(?:o|ờ)i\s*gian\b[\s\S]*$/i
    ]
    for (const pattern of stopPatterns) {
      value = value.replace(pattern, "").trim()
    }

    value = value.replace(/\d{1,2}\/\d{1,2}\/\d{4}[\s\S]*$/i, "").trim()
    value = value.replace(/[,:;\-]+$/g, "").trim()
    return value || null
  }

  private isRangeStatsQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasKeyword =
      /(doanh thu|revenue|kpi|chi phi ads|chi phi quang cao|ads|don vi van chuyen|van chuyen|quy cach dong hop|dong hop|luong sku ban ra|sku ban ra|san luong sku)/.test(
        normalized
      )
    const hasDateSignal =
      /\d{1,2}\/\d{1,2}\/\d{4}/.test(normalized) ||
      /(tu ngay|den ngay|trong khoang|khoang thoi gian)/.test(normalized)
    return hasKeyword && hasDateSignal
  }

  private async tryBuildRangeStatsFacts(
    question: string,
    forceForIncome = false,
    conversation?: AiConversation | null
  ) {
    if (!forceForIncome && !this.isRangeStatsQuestion(question)) return null
    const dateRange = this.extractDateRange(question)
    if (!dateRange) return null
    const normalizedRange = this.normalizeRangeStatsDateRange(dateRange)
    const channelName =
      this.extractIncomeChannelName(question) ||
      this.extractIncomeChannelNameFromConversation(conversation)
    if (!channelName) return null
    const channelId = await this.findLivestreamChannelId(channelName)
    if (!channelId) return null
    console.info("[ai][api:req] incomes/range-stats", {
      startDate: normalizedRange.start,
      endDate: normalizedRange.end,
      channelId,
      comparePrevious: true
    })
    const stats = await this.incomeService.getRangeStats(
      normalizedRange.start,
      normalizedRange.end,
      channelId,
      true
    )
    console.info("[ai][api:res] incomes/range-stats", {
      ok: true,
      period: stats?.period,
      current: stats?.current
        ? {
            beforeDiscount: stats.current.beforeDiscount,
            afterDiscount: stats.current.afterDiscount,
            ads: stats.current.ads,
            discounts: stats.current.discounts
          }
        : undefined
    })
    return {
      channelId,
      channelName,
      startDate: normalizedRange.start,
      endDate: normalizedRange.end,
      stats
    }
  }

  private normalizeRangeStatsDateRange(dateRange: { start: Date; end: Date }) {
    const tzOffsetHours = 7
    const toUtcBoundary = (date: Date, endOfDay: boolean) => {
      const y = date.getUTCFullYear()
      const m = date.getUTCMonth()
      const d = date.getUTCDate()
      const utcMs = endOfDay
        ? Date.UTC(y, m, d, 23, 59, 59, 999)
        : Date.UTC(y, m, d, 0, 0, 0, 0)
      return new Date(utcMs - tzOffsetHours * 60 * 60 * 1000)
    }
    const isSameDayInput =
      dateRange.start.getUTCFullYear() === dateRange.end.getUTCFullYear() &&
      dateRange.start.getUTCMonth() === dateRange.end.getUTCMonth() &&
      dateRange.start.getUTCDate() === dateRange.end.getUTCDate()
    const start = toUtcBoundary(dateRange.start, false)
    const end = isSameDayInput
      ? new Date(start.getTime() + 2 * 60 * 60 * 1000 - 1)
      : toUtcBoundary(dateRange.end, true)
    return {
      start,
      end
    }
  }

  private extractIncomeChannelNameFromConversation(
    conversation?: AiConversation | null
  ) {
    if (!conversation?.messages?.length) return null
    const lastUserMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .slice(0, 6)
    for (const msg of lastUserMessages) {
      const name = this.extractIncomeChannelName(msg.content)
      if (name) return name
    }
    return null
  }

  private async findLivestreamChannelId(channelKeyword: string) {
    if (!channelKeyword.trim()) return null
    let channelModel: Model<any>
    try {
      channelModel = this.connection.model("livestreamchannels")
    } catch {
      return null
    }
    const escaped = channelKeyword.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = { $regex: escaped, $options: "i" }
    const channel: any = await channelModel
      .findOne(
        { $or: [{ name: regex }, { username: regex }, { usernames: regex }] },
        { _id: 1 }
      )
      .lean()
      .exec()
    if (channel?._id) return String(channel._id)

    const normalize = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
    const target = normalize(channelKeyword)
    if (!target) return null

    const candidates: any[] = await channelModel
      .find({}, { _id: 1, name: 1, username: 1, usernames: 1 })
      .limit(500)
      .lean()
      .exec()
    const matched = candidates.find((c) => {
      const fields = [c?.name, c?.username, ...(Array.isArray(c?.usernames) ? c.usernames : [])]
      return fields.some((f) => normalize(f).includes(target))
    })
    return matched?._id ? String(matched._id) : null
  }

  private async fetchDataByPlan(
    plan: {
      tables: Array<{
        collection: string
        filter?: Record<string, any>
        projection?: string[]
        sort?: Record<string, 1 | -1>
        limit?: number
      }>
    },
    debug = false
  ) {
    const result: Record<string, any> = {}
    const meta: Record<
      string,
      {
        filter: Record<string, any>
        projection?: Record<string, 1>
        sort?: Record<string, 1 | -1>
        limit: number
        count: number
        sample: any[]
      }
    > = {}
    const tables = Array.isArray(plan.tables) ? plan.tables.slice(0, 3) : []

    for (const table of tables) {
      if (!table?.collection) continue
      if (table.collection === "incomes") {
        const incomeResult = await this.fetchIncomesViaApi(table)
        result[table.collection] = incomeResult.rows
        meta[table.collection] = {
          ...incomeResult.meta,
          sample: incomeResult.rows.slice(0, 2)
        }
        continue
      }
      let model: Model<any>
      try {
        model = this.connection.model(table.collection)
      } catch {
        continue
      }

      let filter =
        table.filter && typeof table.filter === "object" ? table.filter : {}
      filter = this.applyLikeFilters(filter)
      let projection =
        Array.isArray(table.projection) && table.projection.length
          ? table.projection.reduce((acc: Record<string, 1>, f: string) => {
              if (typeof f === "string" && f.trim()) acc[f.trim()] = 1
              return acc
            }, {})
          : undefined
      if (table.collection === "storageitems") {
        projection = projection || {}
        projection.code = 1
        projection.name = 1
        projection.restQuantity = 1
        projection.quantityPerBox = 1
      }
      const sort =
        table.sort && typeof table.sort === "object" ? table.sort : undefined
      const limitRaw = Number(table.limit || 20)
      let limit = Math.max(1, Math.min(200, limitRaw))
      const hasRegex = Object.values(filter).some(
        (v) => v && typeof v === "object" && "$regex" in v
      )
      if (hasRegex && limit < 99) {
        limit = 99
      }

      const query = model.find(filter, projection).limit(limit)
      if (sort) query.sort(sort)
      const docs = await query.lean().exec()
      const normalizedDocs =
        table.collection === "products" || table.collection === "shopeeproducts"
          ? await this.normalizeSkuProductRows(docs)
          : docs
      result[table.collection] = normalizedDocs
      meta[table.collection] = {
        filter,
        projection,
        sort,
        limit,
        count: normalizedDocs.length,
        sample: normalizedDocs.slice(0, 2)
      }
    }

    return { data: result, meta }
  }

  private async fetchIncomesViaApi(table: {
    collection: string
    filter?: Record<string, any>
    projection?: string[]
    sort?: Record<string, 1 | -1>
    limit?: number
  }) {
    let filter =
      table.filter && typeof table.filter === "object" ? table.filter : {}
    filter = await this.resolveIncomeFilter(filter)
    filter = this.applyLikeFilters(filter)

    const projection =
      Array.isArray(table.projection) && table.projection.length
        ? table.projection.reduce((acc: Record<string, 1>, f: string) => {
            if (typeof f === "string" && f.trim()) acc[f.trim()] = 1
            return acc
          }, {})
        : undefined
    const sort =
      table.sort && typeof table.sort === "object" ? table.sort : undefined
    const limitRaw = Number(table.limit || 20)
    const limit = Math.max(1, Math.min(200, limitRaw))

    const dateFilter = filter?.date && typeof filter.date === "object" ? filter.date : {}
    const startDate = dateFilter?.$gte
      ? new Date(dateFilter.$gte)
      : new Date("2000-01-01T00:00:00.000Z")
    const endDate = dateFilter?.$lte
      ? new Date(dateFilter.$lte)
      : new Date()

    const channelIds = this.extractIncomeChannelIds(filter?.channel)
    const rows: any[] = []
    for (const channelId of channelIds) {
      const first = await this.incomeService.getIncomesByDateRange(
        startDate,
        endDate,
        1,
        limit,
        typeof filter?.orderId === "string" ? filter.orderId : undefined,
        typeof filter?.["products.code"] === "string" ? filter["products.code"] : undefined,
        typeof filter?.["products.source"] === "string"
          ? filter["products.source"]
          : undefined,
        channelId
      )

      let incomes = Array.isArray(first?.incomes) ? first.incomes : []
      const needsLastPage =
        (sort?.date === -1 || sort?._id === -1) && Number(first?.total || 0) > limit
      if (needsLastPage) {
        const lastPage = Math.max(1, Math.ceil(Number(first.total) / limit))
        const last = await this.incomeService.getIncomesByDateRange(
          startDate,
          endDate,
          lastPage,
          limit,
          typeof filter?.orderId === "string" ? filter.orderId : undefined,
          typeof filter?.["products.code"] === "string" ? filter["products.code"] : undefined,
          typeof filter?.["products.source"] === "string"
            ? filter["products.source"]
            : undefined,
          channelId
        )
        incomes = Array.isArray(last?.incomes) ? last.incomes : incomes
      }
      rows.push(...incomes)
    }

    const uniqueRows = this.uniqueIncomesById(rows)
    const normalized = await this.normalizeIncomeRows(uniqueRows)
    const sorted = this.sortIncomeRows(normalized, sort)
    const projected = projection ? this.pickFields(sorted, Object.keys(projection)) : sorted
    const sliced = projected.slice(0, limit)

    return {
      rows: sliced,
      meta: {
        via: "incomes/api",
        filter,
        projection,
        sort,
        limit,
        count: sliced.length
      }
    }
  }

  private extractIncomeChannelIds(channelFilter: any): Array<string | undefined> {
    if (typeof channelFilter === "string" && channelFilter.trim()) {
      return [channelFilter.trim()]
    }
    if (channelFilter && typeof channelFilter === "object" && Array.isArray(channelFilter.$in)) {
      const ids = channelFilter.$in
        .map((id: any) => String(id || "").trim())
        .filter((id: string) => id.length > 0)
      return ids.length ? ids : [undefined]
    }
    return [undefined]
  }

  private uniqueIncomesById(rows: any[]) {
    const map = new Map<string, any>()
    for (const row of rows) {
      const key = String(row?._id || row?.orderId || "")
      if (!key) continue
      map.set(key, row)
    }
    return Array.from(map.values())
  }

  private sortIncomeRows(rows: any[], sort?: Record<string, 1 | -1>) {
    if (!Array.isArray(rows) || !sort) return Array.isArray(rows) ? rows : []
    const entries = Object.entries(sort).filter(
      ([k, v]) => (k === "date" || k === "_id") && (v === 1 || v === -1)
    )
    if (!entries.length) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      for (const [key, dir] of entries) {
        const av = key === "date" ? new Date(a?.date || 0).getTime() : String(a?._id || "")
        const bv = key === "date" ? new Date(b?.date || 0).getTime() : String(b?._id || "")
        if (av < bv) return -1 * dir
        if (av > bv) return 1 * dir
      }
      return 0
    })
    return sorted
  }

  private pickFields(rows: any[], fields: string[]) {
    if (!Array.isArray(rows) || !fields.length) return rows
    return rows.map((row) =>
      fields.reduce((acc: Record<string, any>, field: string) => {
        if (field in row) acc[field] = row[field]
        return acc
      }, {})
    )
  }

  private async normalizeSkuProductRows(rows: any[]) {
    if (!Array.isArray(rows)) return []
    const storageIdSet = new Set<string>()
    for (const row of rows) {
      const items = Array.isArray(row?.items) ? row.items : []
      for (const item of items) {
        const storageId = item?._id
        if (storageId) storageIdSet.add(String(storageId))
      }
    }

    let storageMap = new Map<string, { code?: string; name?: string }>()
    if (storageIdSet.size) {
      let storageModel: Model<any> | null = null
      try {
        storageModel = this.connection.model("storageitems")
      } catch {
        storageModel = null
      }
      if (storageModel) {
        const storageRows = await storageModel
          .find(
            { _id: { $in: Array.from(storageIdSet) } },
            { code: 1, name: 1 }
          )
          .lean()
          .exec()
        storageMap = new Map(
          storageRows.map((row: any) => [
            String(row._id),
            { code: row.code, name: row.name }
          ])
        )
      }
    }

    return rows.map((row) => ({
      _id: row?._id,
      name: row?.name,
      deletedAt: row?.deletedAt ?? null,
      items: Array.isArray(row?.items)
        ? row.items.map((item: any) => {
            const storage = storageMap.get(String(item?._id || ""))
            return {
              code: storage?.code,
              name: storage?.name,
              quantity: item?.quantity ?? 0
            }
          })
        : []
    }))
  }

  private async resolveIncomeFilter(filter: Record<string, any>) {
    const out: Record<string, any> = { ...(filter || {}) }
    const channelKeywordRaw =
      typeof out.channelName === "string" && out.channelName.trim()
        ? out.channelName.trim()
        : typeof out.channel === "string"
          ? out.channel.trim()
          : ""
    if (!channelKeywordRaw) return out

    delete out.channelName
    if (out.channel === channelKeywordRaw) {
      delete out.channel
    }

    let channelModel: Model<any>
    try {
      channelModel = this.connection.model("livestreamchannels")
    } catch {
      return out
    }

    const escaped = channelKeywordRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = { $regex: escaped, $options: "i" }
    const channels = await channelModel
      .find(
        { $or: [{ name: regex }, { username: regex }, { usernames: regex }] },
        { _id: 1 }
      )
      .lean()
      .exec()

    const channelIds = channels.map((c: any) => c._id).filter(Boolean)
    out.channel = channelIds.length ? { $in: channelIds } : { $in: [] }
    return out
  }

  private async normalizeIncomeRows(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) return []
    const channelIdSet = new Set<string>()
    for (const row of rows) {
      if (row?.channel) channelIdSet.add(String(row.channel))
    }

    let channelMap = new Map<string, { name?: string; username?: string; platform?: string }>()
    if (channelIdSet.size) {
      try {
        const channelModel = this.connection.model("livestreamchannels")
        const channels = await channelModel
          .find(
            { _id: { $in: Array.from(channelIdSet) } },
            { name: 1, username: 1, platform: 1 }
          )
          .lean()
          .exec()
        channelMap = new Map(
          channels.map((c: any) => [
            String(c._id),
            { name: c.name, username: c.username, platform: c.platform }
          ])
        )
      } catch {
        // Best-effort enrichment only.
      }
    }

    return rows.map((row: any) => {
      const channelInfo = row?.channel ? channelMap.get(String(row.channel)) : undefined
      return {
        ...row,
        channel: channelInfo
          ? {
              _id: row.channel,
              name: channelInfo.name,
              username: channelInfo.username,
              platform: channelInfo.platform
            }
          : row.channel
      }
    })
  }

  private detectNameAmbiguity(
    plan: {
      tables: Array<{
        collection: string
        filter?: Record<string, any>
      }>
    },
    fetchedResult: { data: Record<string, any>; meta: Record<string, any> }
  ): { message: string; options: Array<{ index: number; code?: string; name?: string }> } | null {
    const tables = Array.isArray(plan.tables) ? plan.tables : []
    for (const table of tables) {
      const filter = table?.filter || {}
      const nameFilter = filter?.name
      const usedName =
        (nameFilter && typeof nameFilter === "object" && "$regex" in nameFilter) ||
        (typeof nameFilter === "string" && nameFilter.trim())
      if (!usedName) continue

      const rows = fetchedResult.data?.[table.collection]
      if (Array.isArray(rows) && rows.length > 1) {
        const opts = rows.map((r: any, idx: number) => ({
          index: idx + 1,
          code: r?.code,
          name: r?.name
        }))
        const options = opts
          .map((o) => {
            const code = o.code ? ` (ma: ${o.code})` : ""
            const name = o.name || "Khong ro ten"
            return `${o.index}. ${name}${code}`
          })
          .join("\n")
        return {
          message:
            "Co nhieu ket qua phu hop. " +
            "Ban muon AI tra loi theo ket qua nao?\n" +
            options,
          options: opts
        }
      }
    }
    return null
  }

  private async storePendingSelection(
    conversation: AiConversation | null,
    options: Array<{ index: number; code?: string; name?: string }>
  ) {
    if (!conversation?._id) return
    await this.aiConversationModel.updateOne(
      { _id: conversation._id },
      { $set: { pendingSelection: { options } } }
    )
  }

  private resolveAmbiguitySelection(
    question: string,
    conversation: AiConversation | null
  ): { question: string; plan?: { tables: Array<any>; reason?: string } } {
    const trimmed = question.trim()
    const normalizeText = (value: string) =>
      value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
    const normalized = normalizeText(trimmed)
    const directNumber = normalized.match(/^\d+$/)
    const phraseNumber = normalized.match(
      /(?:ket\\s*qua|ket qua|ket qua so|kq|chon|option)\\s*(\\d+)/i
    )
    const ordinalNumber = normalized.match(/(?:thu|thứ)\\s*(\\d+)/i)
    const anyNumber = normalized.match(/(\\d+)/)
    const choiceText =
      directNumber?.[0] ||
      phraseNumber?.[1] ||
      ordinalNumber?.[1] ||
      anyNumber?.[1]
    const choiceIndex = choiceText ? Number(choiceText) : NaN
    if (conversation?.pendingSelection?.options?.length) {
      const option = Number.isFinite(choiceIndex)
        ? conversation.pendingSelection.options.find(
            (o) => o.index === choiceIndex
          )
        : undefined
      if (option?.code || option?.name) {
        const code = option?.code?.toUpperCase()
        if (conversation?._id) {
          this.aiConversationModel.updateOne(
            { _id: conversation._id },
            { $unset: { pendingSelection: "" } }
          )
        }
        if (code) {
          return {
            question: `ma ${code}`,
            plan: {
              tables: [
                {
                  collection: "storageitems",
                  filter: { code },
                  projection: ["code", "name", "restQuantity", "quantityPerBox"],
                  limit: 1
                }
              ],
              reason: "Truy van storageitems theo ma hang (chon tu danh sach)."
            }
          }
        }
        return {
          question: `mat hang ${option.name}`,
          plan: {
            tables: [
              {
                collection: "storageitems",
                filter: { name: option.name },
                projection: ["code", "name", "restQuantity", "quantityPerBox"],
                limit: 99
              }
            ],
            reason: "Truy van storageitems theo ten (chon tu danh sach)."
          }
        }
      }

      const normalizedQuestion = normalized
      const codeMatch = conversation.pendingSelection.options.find(
        (o) =>
          o.code &&
          normalizedQuestion.includes(normalizeText(String(o.code)))
      )
      if (codeMatch?.code) {
        const code = codeMatch.code.toUpperCase()
        if (conversation?._id) {
          this.aiConversationModel.updateOne(
            { _id: conversation._id },
            { $unset: { pendingSelection: "" } }
          )
        }
        return {
          question: `ma ${code}`,
          plan: {
            tables: [
              {
                collection: "storageitems",
                filter: { code },
                projection: ["code", "name", "restQuantity", "quantityPerBox"],
                limit: 1
              }
            ],
            reason: "Truy van storageitems theo ma hang (chon tu danh sach)."
          }
        }
      }

      const nameMatch = conversation.pendingSelection.options.find(
        (o) =>
          o.name &&
          normalizedQuestion.includes(normalizeText(String(o.name)))
      )
      if (nameMatch?.name) {
        const code = nameMatch.code?.toUpperCase()
        if (conversation?._id) {
          this.aiConversationModel.updateOne(
            { _id: conversation._id },
            { $unset: { pendingSelection: "" } }
          )
        }
        if (code) {
          return {
            question: `ma ${code}`,
            plan: {
              tables: [
                {
                  collection: "storageitems",
                  filter: { code },
                  projection: ["code", "name", "restQuantity", "quantityPerBox"],
                  limit: 1
                }
              ],
              reason: "Truy van storageitems theo ma hang (chon tu danh sach)."
            }
          }
        }
        return {
          question: `mat hang ${nameMatch.name}`,
          plan: {
            tables: [
              {
                collection: "storageitems",
                filter: { name: nameMatch.name },
                projection: ["code", "name", "restQuantity", "quantityPerBox"],
                limit: 99
              }
            ],
            reason: "Truy van storageitems theo ten (chon tu danh sach)."
          }
        }
      }
    } else if (!choiceText) {
      return { question }
    }

    if (!conversation?.messages?.length) return { question }
    const assistantMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.role === "assistant" && m.content)
    if (!assistantMessages.length) return { question }

    let optionLines: string[] = []
    for (const msg of assistantMessages) {
      const lines = msg.content.split("\n")
      const candidates = lines.filter((l) => /^\s*\d+\.\s+/.test(l))
      if (candidates.length) {
        optionLines = candidates
        break
      }
    }
    if (!optionLines.length) return { question }
    const selected = optionLines.find((l) =>
      new RegExp(`^\\s*${choiceIndex}\\.\\s+`).test(l)
    )
    if (!selected) return { question }

    const codeMatch = selected.match(/\(ma:\s*([A-Za-z0-9_-]+)\)/i)
    const nameMatch = selected
      .replace(/^\s*\d+\.\s+/, "")
      .replace(/\s*\(ma:.*\)$/i, "")
      .trim()
    if (codeMatch?.[1]) {
      const code = codeMatch[1].toUpperCase()
      return {
        question: `ma ${code}`,
        plan: {
          tables: [
            {
              collection: "storageitems",
              filter: { code },
              projection: ["code", "name", "restQuantity", "quantityPerBox"],
              limit: 1
            }
          ],
          reason: "Truy van storageitems theo ma hang (chon tu danh sach)."
        }
      }
    }
    if (nameMatch) {
      return {
        question: `mat hang ${nameMatch}`,
        plan: {
          tables: [
            {
              collection: "storageitems",
              filter: { name: nameMatch },
              projection: ["code", "name", "restQuantity", "quantityPerBox"],
              limit: 99
            }
          ],
          reason: "Truy van storageitems theo ten (chon tu danh sach)."
        }
      }
    }
    return { question }
  }

  private applyLikeFilters(filter: Record<string, any>) {
    const out: Record<string, any> = { ...filter }
    const likeKeys = new Set(["name", "code"])
    for (const key of Object.keys(out)) {
      const value = out[key]
      if (likeKeys.has(key) && typeof value === "string" && value.trim()) {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        out[key] = { $regex: escaped, $options: "i" }
      }
    }
    return out
  }

  private extractNameAfterTonKho(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const match = normalized.match(/ton kho\\s*(cua|của)?\\s*(mat hang|mặt hàng)?\\s*([^?!.]+)/i)
    if (!match?.[3]) return null
    let name = match[3].trim()
    name = name.replace(/(la bao nhieu|bao nhieu|hien tai la bao nhieu|hien tai|la gi)$/i, "").trim()
    return name || null
  }

  private buildFallbackPlanFromContext(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    if (/ton kho|tồn kho/.test(normalized)) {
      const name = this.extractNameAfterTonKho(question)
      return {
        tables: [
          {
            collection: "storageitems",
            filter: name ? { name } : {},
            projection: ["code", "name", "restQuantity", "quantityPerBox"],
            limit: 99
          }
        ],
        reason: "Fallback theo context: cau hoi ve ton kho => storageitems."
      }
    }
    return null
  }

  private extractCode(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const patterns = [
      /mat\s*hang\s*[:\-]?\s*([a-z0-9_-]+)/i,
      /ma\s*hang\s*[:\-]?\s*([a-z0-9_-]+)/i,
      /ma\s*mat\s*hang\s*[:\-]?\s*([a-z0-9_-]+)/i,
      /ma\s*[:\-]?\s*([a-z0-9_-]+)/i,
      /item\s*[:\-]?\s*([a-z0-9_-]+)/i,
      /hang\s*[:\-]?\s*([a-z0-9_-]+)/i
    ]
    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      if (match?.[1]) return match[1].toUpperCase()
    }
    return null
  }

  private extractStorageItemLookup(question: string) {
    const code = this.extractCode(question)
    if (code) return { type: "code" as const, value: code }
    const codeBare = this.extractBareCode(question)
    if (codeBare) return { type: "code" as const, value: codeBare }
    const name = this.extractStorageItemName(question)
    if (name) return { type: "name" as const, value: name }
    return null
  }

  private extractStorageItemName(question: string) {
    const patterns = [
      /mặt\s*hàng\s*[:\-]?\s*([^\n\r?!.]+)/i,
      /mat\s*hang\s*[:\-]?\s*([^\n\r?!.]+)/i,
      /hàng\s*[:\-]?\s*([^\n\r?!.]+)/i,
      /hang\s*[:\-]?\s*([^\n\r?!.]+)/i,
      /item\s*[:\-]?\s*([^\n\r?!.]+)/i
    ]
    for (const pattern of patterns) {
      const match = question.match(pattern)
      if (match?.[1]) {
        let name = match[1].trim()
        name = name.replace(/[?!.]+$/g, "")
        const lower = ` ${name.toLowerCase()} `
        const cutKeywords = [
          " bao nhieu ",
          " con bao nhieu ",
          " da ",
          " trong ",
          " duoc ",
          " xuat ",
          " nhap ",
          " tra ",
          " den "
        ]
        let cutIndex = -1
        for (const kw of cutKeywords) {
          const idx = lower.indexOf(kw)
          if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) {
            cutIndex = idx
          }
        }
        if (cutIndex !== -1) {
          name = name.slice(0, cutIndex).trim()
        }
        return name
      }
    }
    return null
  }

  private extractBareCode(question: string) {
    const trimmed = question.trim()
    if (!trimmed) return null
    const match = trimmed.match(/^([a-z0-9_-]{4,})\b/i)
    if (!match?.[1]) return null
    const token = match[1].toUpperCase()
    return token
  }

  private isGeneralExplanationQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasExplain = /(giai thich|vi sao|tai sao|cong thuc|cach tinh)/.test(
      normalized
    )
    const hasBoxes = /(so thung|so du|du le|item le|thung|hop)/.test(normalized)
    return hasExplain && hasBoxes
  }


  private async findStorageItem(lookup: { type: "code" | "name"; value: string }) {
    if (lookup.type === "code") {
      const escaped = lookup.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const item = await this.storageItemModel
        .findOne({ code: { $regex: `^${escaped}$`, $options: "i" }, deletedAt: null })
        .lean()
        .exec()
      if (!item) {
        return { found: false, payload: { type: "storage_item", code: lookup.value, found: false } }
      }
      return { found: true, item }
    }

    const escapedName = lookup.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const items = await this.storageItemModel
      .find({ name: { $regex: escapedName, $options: "i" }, deletedAt: null })
      .limit(5)
      .lean()
      .exec()
    if (!items.length) {
      return {
        found: false,
        payload: { type: "storage_item", name: lookup.value, found: false }
      }
    }
    if (items.length > 1) {
      return {
        found: false,
        payload: {
          type: "storage_item",
          name: lookup.value,
          found: false,
          candidates: items.map((i) => ({ code: i.code, name: i.name }))
        }
      }
    }
    return { found: true, item: items[0] }
  }

  private async findStorageItemsByName(name: string) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return this.storageItemModel
      .find({ name: { $regex: escapedName, $options: "i" }, deletedAt: null })
      .limit(10)
      .lean()
      .exec()
  }

  private async findStorageItemsByNameAdaptive(name: string) {
    const tokens = name
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (!tokens.length) return []

    let results: any[] = []
    for (let i = 1; i <= tokens.length; i += 1) {
      const phrase = tokens.slice(0, i).join(" ")
      results = await this.findStorageItemsByName(phrase)
      if (results.length > 0 && results.length <= 5) {
        return results
      }
    }
    return results
  }

  private extractMetric(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const patterns: Array<{ key: string; regex: RegExp }> = [
      { key: "boxes", regex: /(so thung|so hop|thung|hop)/ },
      {
        key: "quantityPerBox",
        regex:
          /(so luong.*thung|so luong.*hop|moi thung|moi hop|per box|quantity per box|quantity\/box|sl\/thung)/
      },
      { key: "received", regex: /(nhap kho|da nhap|nhap|received)/ },
      { key: "delivered", regex: /(xuat kho|da xuat|xuat|ban|delivered)/ },
      { key: "rest", regex: /(ton kho|ton|con lai|con)/ }
    ]
    for (const pattern of patterns) {
      if (pattern.regex.test(normalized)) return pattern.key
    }
    return null
  }

  private extractProductName(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const patterns = [
      /san\s*pham\s*[:\-]?\s*([a-z0-9 _-]+)/i,
      /product\s*[:\-]?\s*([a-z0-9 _-]+)/i,
      /sku\s*[:\-]?\s*([a-z0-9 _-]+)/i,
      /ma\s*sku\s*[:\-]?\s*([a-z0-9 _-]+)/i,
      /ma\s*[:\-]?\s*([a-z0-9 _-]+)/i,
      /hang\s*[:\-]?\s*([a-z0-9 _-]+)/i
    ]
    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      if (match?.[1]) {
        let name = match[1].trim().replace(/[?!.]+$/g, "")
        const lower = ` ${name.toLowerCase()} `
        const cutKeywords = [" bao gom ", " gom ", " co ", " la "]
        let cutIndex = -1
        for (const kw of cutKeywords) {
          const idx = lower.indexOf(kw)
          if (idx !== -1 && (cutIndex === -1 || idx < cutIndex)) {
            cutIndex = idx
          }
        }
        if (cutIndex !== -1) {
          name = name.slice(0, cutIndex).trim()
        }
        return name
      }
    }
    return null
  }

  private extractStorageLogStatus(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    if (/(nhap kho|nhap|received)/.test(normalized)) return "received"
    if (/(xuat kho|xuat|delivered)/.test(normalized)) return "delivered"
    if (/(tra hang|hoan|returned)/.test(normalized)) return "returned"
    return null
  }

  private extractStorageLogMetric(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    if (/(bao nhieu|tong so|so luong)/.test(normalized)) return "totalQuantity"
    if (/(bao nhieu lan|bao nhieu log|bao nhieu nhat ky)/.test(normalized))
      return "total"
    return null
  }

  private extractDateRange(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
    const now = new Date()
    const dateRegex = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g
    const dates: Array<{ d: number; m: number; y: number }> = []
    let match: RegExpExecArray | null
    while ((match = dateRegex.exec(normalized))) {
      const d = Number(match[1])
      const m = Number(match[2])
      const yRaw = match[3]
      if (Number.isNaN(d) || Number.isNaN(m)) continue
      if (yRaw) {
        const y = Number(yRaw)
        if (!Number.isNaN(y)) dates.push({ d, m, y })
        continue
      }
      const inferredDayMonth = this.inferNearestPastDayMonth(d, m, now)
      if (inferredDayMonth) dates.push(inferredDayMonth)
    }
    if (!dates.length) {
      const dayOnlyRegex = /(?:^|\s)ngay\s*(\d{1,2})(?!\s*\/)/gi
      while ((match = dayOnlyRegex.exec(normalized))) {
        const d = Number(match[1])
        if (Number.isNaN(d)) continue
        const inferredDayOnly = this.inferNearestPastDayOnly(d, now)
        if (inferredDayOnly) dates.push(inferredDayOnly)
      }
    }
    if (!dates.length) return null
    const start = new Date(Date.UTC(dates[0].y, dates[0].m - 1, dates[0].d, 0, 0, 0, 0))
    const endDate = dates[1] || dates[0]
    const end = new Date(Date.UTC(endDate.y, endDate.m - 1, endDate.d, 23, 59, 59, 999))
    return { start, end }
  }

  private inferNearestPastDayMonth(
    d: number,
    m: number,
    now: Date
  ): { d: number; m: number; y: number } | null {
    if (d < 1 || d > 31 || m < 1 || m > 12) return null
    const nowMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
    const currentYear = now.getUTCFullYear()
    const cur = new Date(Date.UTC(currentYear, m - 1, d, 0, 0, 0, 0))
    const curValid =
      cur.getUTCFullYear() === currentYear &&
      cur.getUTCMonth() === m - 1 &&
      cur.getUTCDate() === d
    if (curValid && cur.getTime() <= nowMs) return { d, m, y: currentYear }

    const prevYear = currentYear - 1
    const prev = new Date(Date.UTC(prevYear, m - 1, d, 0, 0, 0, 0))
    const prevValid =
      prev.getUTCFullYear() === prevYear &&
      prev.getUTCMonth() === m - 1 &&
      prev.getUTCDate() === d
    if (prevValid) return { d, m, y: prevYear }
    return null
  }

  private inferNearestPastDayOnly(
    d: number,
    now: Date
  ): { d: number; m: number; y: number } | null {
    if (d < 1 || d > 31) return null
    const nowMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
    let y = now.getUTCFullYear()
    let m = now.getUTCMonth() + 1
    for (let i = 0; i < 24; i += 1) {
      const candidate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0))
      const valid =
        candidate.getUTCFullYear() === y &&
        candidate.getUTCMonth() === m - 1 &&
        candidate.getUTCDate() === d
      if (valid && candidate.getTime() <= nowMs) {
        return { d, m, y }
      }
      m -= 1
      if (m < 1) {
        m = 12
        y -= 1
      }
    }
    return null
  }

  private isStorageLogQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasLogKeywords = /(nhat ky|lich su|lich su nhap|lich su xuat)/.test(
      normalized
    )
    const hasMoveKeywords = /(nhap kho|xuat kho|tra hang|xuat|nhap)/.test(
      normalized
    )
    const hasDate = /\d{1,2}\/\d{1,2}\/\d{4}/.test(normalized)
    const hasRange = /(tu ngay|den|khoang thoi gian)/.test(normalized)
    return hasLogKeywords || (hasMoveKeywords && (hasDate || hasRange))
  }

  private getMonthKey() {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, "0")
    return `${y}-${m}`
  }

  private getDateKey() {
    const now = new Date()
    const y = now.getUTCFullYear()
    const m = String(now.getUTCMonth() + 1).padStart(2, "0")
    const d = String(now.getUTCDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  private async assertDailyLimit(userId: string) {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    const userObjectId = new Types.ObjectId(userId)
    const dateKey = this.getDateKey()
    const current = await this.aiUserUsageModel
      .findOne({ userId: userObjectId, dateKey })
      .lean()
      .exec()

    if ((current?.count || 0) >= this.dailyQuestionLimit) {
      throw new ForbiddenException("Daily AI limit reached")
    }

    await this.aiUserUsageModel.updateOne(
      { userId: userObjectId, dateKey },
      { $inc: { count: 1 } },
      { upsert: true }
    )
  }

  private async ensureConversationOwnership(userId: string, conversationId: string) {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!conversationId?.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    const userObjectId = new Types.ObjectId(userId)
    const existing = await this.aiConversationModel
      .findOne({ conversationId })
      .select({ userId: 1 })
      .lean()
      .exec()
    if (existing && String(existing.userId) !== String(userObjectId)) {
      throw new ForbiddenException("Conversation does not belong to user")
    }
  }

  private async getOrCreateConversation(
    userId: string,
    conversationId: string,
    firstQuestion?: string,
    initialTitle?: string
  ) {
    if (!isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    const userObjectId = new Types.ObjectId(userId)
    const expireAt = this.computeConversationExpireAt()
    const title =
      initialTitle?.trim() || this.buildConversationTitle(firstQuestion)
    const convo = await this.aiConversationModel
      .findOneAndUpdate(
        { userId: userObjectId, conversationId },
        {
          $setOnInsert: {
            userId: userObjectId,
            conversationId,
            messages: [],
            ...(title ? { title } : {})
          },
          $set: { expireAt }
        },
        { new: true, upsert: true }
      )
      .lean()
      .exec()

    return convo
  }

  private async generateConversationTitle(question: string) {
    const fallback = this.buildConversationTitle(question)
    const systemPrompt =
      "Ban la tro ly dat tieu de doan chat. " +
      "Tom tat cau hoi thanh tieu de ngan gon, toi da 8 tu, khong dau cau. " +
      "Chi tra ve duy nhat tieu de."
    const userPrompt = `Cau hoi dau tien: ${question}`
    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const title = this.normalizeConversationTitle(raw)
      return title || fallback
    } catch {
      return fallback
    }
  }

  private normalizeConversationTitle(raw: string) {
    if (!raw) return ""
    const maxLen = 80
    const oneLine = raw
      .split("\n")[0]
      .replace(/^["'`\-\d\.\)\s]+/, "")
      .replace(/["'`]$/g, "")
      .trim()
    if (!oneLine) return ""
    return oneLine.length > maxLen ? oneLine.slice(0, maxLen).trim() : oneLine
  }

  async createFeedback(
    userId?: string,
    payload?: {
      conversationId: string
      description: string
      expected?: string
      actual?: string
      rating?: number
    }
  ) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!payload?.conversationId?.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    if (!payload?.description?.trim()) {
      throw new BadRequestException("Description is required")
    }

    const userObjectId = new Types.ObjectId(userId)
    const conversationId = payload.conversationId.trim()
    const conversation = await this.aiConversationModel
      .findOne({ userId: userObjectId, conversationId })
      .select({ _id: 1, conversationId: 1 })
      .lean()
      .exec()
    if (!conversation) {
      throw new BadRequestException("Conversation not found")
    }

    const created = await this.aiFeedbackModel.create({
      userId: userObjectId,
      conversationId,
      conversationObjectId: conversation._id,
      description: payload.description.trim(),
      ...(payload.expected?.trim() ? { expected: payload.expected.trim() } : {}),
      ...(payload.actual?.trim() ? { actual: payload.actual.trim() } : {}),
      ...(typeof payload.rating === "number" ? { rating: payload.rating } : {})
    })

    return {
      feedbackId: String(created._id),
      conversationId: created.conversationId,
      createdAt: created.createdAt
    }
  }

  async listFeedback(userId?: string, conversationId?: string, limit = 20) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    const safeLimit = Math.max(1, Math.min(100, limit || 20))
    const userObjectId = new Types.ObjectId(userId)
    const filter: Record<string, any> = { userId: userObjectId }
    if (conversationId?.trim()) {
      filter.conversationId = conversationId.trim()
    }
    const rows = await this.aiFeedbackModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec()

    return {
      data: rows.map((item: any) => ({
        feedbackId: String(item._id),
        conversationId: item.conversationId,
        description: item.description,
        expected: item.expected,
        actual: item.actual,
        rating: item.rating,
        createdAt: item.createdAt
      }))
    }
  }

  private async appendConversationMessages(
    conversation: AiConversation | null,
    messages: AiConversationMessage[]
  ) {
    if (!conversation) return
    const all = [...(conversation.messages || []), ...messages]
    const expireAt = this.computeConversationExpireAt()

    await this.aiConversationModel.updateOne(
      { _id: conversation._id },
      { $set: { messages: all, expireAt } }
    )
  }

  private computeConversationExpireAt() {
    return new Date(Date.now() + this.conversationTtlHours * 60 * 60 * 1000)
  }

  private buildConversationTitle(firstQuestion?: string) {
    if (!firstQuestion) return ""
    const trimmed = firstQuestion.trim()
    if (!trimmed) return ""
    const maxLen = 80
    return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}...` : trimmed
  }

  async getDailyUsage(userId?: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    const userObjectId = new Types.ObjectId(userId)
    const dateKey = this.getDateKey()
    const usage = await this.aiUserUsageModel
      .findOne({ userId: userObjectId, dateKey })
      .lean()
      .exec()

    const count = usage?.count || 0
    const remaining = Math.max(0, this.dailyQuestionLimit - count)
    return { date: dateKey, count, limit: this.dailyQuestionLimit, remaining }
  }

  async listConversations(userId?: string, limit = 20) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    const safeLimit = Math.max(1, Math.min(100, limit || 20))
    const userObjectId = new Types.ObjectId(userId)
    const conversations = await this.aiConversationModel
      .find({ userId: userObjectId })
      .sort({ updatedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec()

    return {
      data: conversations.map((c) => {
        const last = c.messages?.[c.messages.length - 1]
        return {
          conversationId: c.conversationId,
          title: c.title || "",
          updatedAt: c.updatedAt,
          expireAt: c.expireAt,
          lastMessage: last?.content
        }
      })
    }
  }

  async getConversationHistory(
    userId?: string,
    conversationId?: string,
    limit = 20,
    cursor?: number
  ) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!conversationId || !conversationId.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    const userObjectId = new Types.ObjectId(userId)
    const conversation = await this.aiConversationModel
      .findOne({ userId: userObjectId, conversationId })
      .lean()
      .exec()

    if (!conversation) {
      throw new BadRequestException("Conversation not found")
    }

    const safeLimit = Math.max(1, Math.min(100, limit || 20))
    const all = conversation.messages || []
    const total = all.length
    const end =
      typeof cursor === "number" && cursor >= 0 ? Math.min(cursor, total) : total
    const start = Math.max(end - safeLimit, 0)
    const messages = all.slice(start, end)
    const nextCursor = start > 0 ? start : null

    return {
      conversationId,
      messages,
      nextCursor,
      total
    }
  }

  async deleteConversation(userId?: string, conversationId?: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!conversationId || !conversationId.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    const userObjectId = new Types.ObjectId(userId)
    await this.aiConversationModel.deleteOne({
      userId: userObjectId,
      conversationId
    })
  }

  async clearConversationHistory(userId?: string, conversationId?: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!conversationId || !conversationId.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    const userObjectId = new Types.ObjectId(userId)
    const expireAt = this.computeConversationExpireAt()
    const res = await this.aiConversationModel.updateOne(
      { userId: userObjectId, conversationId },
      { $set: { messages: [], expireAt } }
    )
    if (!res.matchedCount) {
      throw new BadRequestException("Conversation not found")
    }
  }

  async updateConversationTitle(
    userId?: string,
    conversationId?: string,
    title?: string
  ) {
    if (!userId || !isValidObjectId(userId)) {
      throw new BadRequestException("Invalid user")
    }
    if (!conversationId || !conversationId.trim()) {
      throw new BadRequestException("ConversationId is required")
    }
    if (!title || !title.trim()) {
      throw new BadRequestException("Title is required")
    }
    const maxLen = 80
    const nextTitle = title.trim().slice(0, maxLen)
    const userObjectId = new Types.ObjectId(userId)
    const res = await this.aiConversationModel.updateOne(
      { userId: userObjectId, conversationId: conversationId.trim() },
      { $set: { title: nextTitle } }
    )
    if (!res.matchedCount) {
      throw new BadRequestException("Conversation not found")
    }
    return { conversationId: conversationId.trim(), title: nextTitle }
  }

  private async ensureUsageDoc(monthKey: string) {
    const existing = await this.aiUsageModel.findOne({ monthKey }).exec()
    if (existing) return existing
    const created = new this.aiUsageModel({ monthKey })
    return await created.save()
  }

  private estimateTokens(text: string) {
    return Math.ceil(text.length / this.charsPerToken)
  }

  private costForInputTokens(tokens: number) {
    return (tokens / 1_000_000) * this.inputCostPer1M
  }

  private costForOutputTokens(tokens: number) {
    return (tokens / 1_000_000) * this.outputCostPer1M
  }

  private async recordUsage(usage: OpenAiUsage) {
    const monthKey = this.getMonthKey()
    const promptTokens = usage.prompt_tokens || 0
    const completionTokens = usage.completion_tokens || 0
    const totalCost =
      this.costForInputTokens(promptTokens) +
      this.costForOutputTokens(completionTokens)

    await this.aiUsageModel.updateOne(
      { monthKey },
      {
        $inc: {
          inputTokens: promptTokens,
          outputTokens: completionTokens,
          totalCost
        }
      },
      { upsert: true }
    )
  }

}
