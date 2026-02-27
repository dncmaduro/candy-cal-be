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
import { LivestreamanalyticsService } from "../livestreamanalytics/livestreamanalytics.service"
import { LivestreammonthgoalsService } from "../livestreammonthgoals/livestreammonthgoals.service"
import { StorageLogsService } from "../storagelogs/storagelogs.service"
import { MonthGoalService } from "../monthgoals/monthgoals.service"

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
    private readonly incomeService: IncomeService,
    private readonly livestreamanalyticsService: LivestreamanalyticsService,
    private readonly livestreammonthgoalsService: LivestreammonthgoalsService,
    private readonly storageLogsService: StorageLogsService,
    private readonly monthGoalService: MonthGoalService
  ) {}

  async ask(
    question: string,
    module: "storage" | "livestream",
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
    if (module !== "storage" && module !== "livestream") {
      throw new BadRequestException("Module is required: storage | livestream")
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
    const isLivestreamIntent = this.isLivestreamIntentQuestion(
      resolved.question
    )
    if (module === "livestream") {
      if (this.isLivestreamMonthKpiQuestion(resolved.question)) {
        console.log("[ai][kpi] route=livestream_month_kpi", {
          question: resolved.question
        })
        const monthKpiAnswer = await this.tryBuildLivestreamMonthKpiAnswer(
          resolved.question,
          conversation
        )
        if (monthKpiAnswer) {
          await this.appendConversationMessages(conversation, [
            { role: "user", content: resolved.question, createdAt: new Date() },
            {
              role: "assistant",
              content: monthKpiAnswer,
              createdAt: new Date()
            }
          ])
          return { answer: monthKpiAnswer, conversationId: safeConversationId }
        }
        const missingKpiArgsMessage =
          "Để lấy KPI tháng livestream, vui lòng cung cấp tên kênh."
        await this.appendConversationMessages(conversation, [
          { role: "user", content: resolved.question, createdAt: new Date() },
          {
            role: "assistant",
            content: missingKpiArgsMessage,
            createdAt: new Date()
          }
        ])
        return {
          answer: missingKpiArgsMessage,
          conversationId: safeConversationId
        }
      }
      if (this.isLivestreamAggregatedMetricsQuestion(resolved.question)) {
        const livestreamRevenueAnswer =
          await this.tryBuildLivestreamAggregatedMetricsAnswer(
            resolved.question,
            conversation
          )
        if (livestreamRevenueAnswer) {
          await this.appendConversationMessages(conversation, [
            { role: "user", content: resolved.question, createdAt: new Date() },
            {
              role: "assistant",
              content: livestreamRevenueAnswer,
              createdAt: new Date()
            }
          ])
          return {
            answer: livestreamRevenueAnswer,
            conversationId: safeConversationId
          }
        }
        const missingRevenueArgsMessage =
          "Để lấy doanh thu livestream, vui lòng cung cấp tên kênh và ngày/khoảng ngày."
        await this.appendConversationMessages(conversation, [
          { role: "user", content: resolved.question, createdAt: new Date() },
          {
            role: "assistant",
            content: missingRevenueArgsMessage,
            createdAt: new Date()
          }
        ])
        return {
          answer: missingRevenueArgsMessage,
          conversationId: safeConversationId
        }
      }
      const livestreamScheduleAnswer = await this.tryBuildLivestreamScheduleAnswer(
        resolved.question,
        conversation
      )
      if (livestreamScheduleAnswer) {
        await this.appendConversationMessages(conversation, [
          { role: "user", content: resolved.question, createdAt: new Date() },
          {
            role: "assistant",
            content: livestreamScheduleAnswer,
            createdAt: new Date()
          }
        ])
        return { answer: livestreamScheduleAnswer, conversationId: safeConversationId }
      }
      const unsupportedMessage =
        "Module livestream chi ho tro cau hoi lien quan den live/livestream."
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        { role: "assistant", content: unsupportedMessage, createdAt: new Date() }
      ])
      return { answer: unsupportedMessage, conversationId: safeConversationId }
    }
    if (module === "storage" && isLivestreamIntent) {
      const moduleMismatchMessage =
        "Cau hoi live/livestream can gui voi module=livestream."
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: moduleMismatchMessage,
          createdAt: new Date()
        }
      ])
      return { answer: moduleMismatchMessage, conversationId: safeConversationId }
    }
    const shouldHandleStorageKpi =
      module === "storage" &&
      (this.isStorageKpiQuestion(resolved.question) ||
        this.isStorageKpiFollowUpQuestion(resolved.question, conversation))
    if (shouldHandleStorageKpi) {
      const storageKpiQuestion = this.resolveStorageKpiFollowUpQuestion(
        resolved.question,
        conversation
      )
      const storageKpiAnswer = await this.tryBuildStorageKpiAnswer(
        storageKpiQuestion,
        conversation
      )
      if (storageKpiAnswer) {
        await this.appendConversationMessages(conversation, [
          { role: "user", content: resolved.question, createdAt: new Date() },
          {
            role: "assistant",
            content: storageKpiAnswer,
            createdAt: new Date()
          }
        ])
        return { answer: storageKpiAnswer, conversationId: safeConversationId }
      }
    }
    const storageFollowUpQuestion = this.resolveStorageFollowUpQuestion(
      resolved.question,
      conversation
    )
    const storageMovementAnswer = await this.tryBuildStorageMovementAnswer(
      storageFollowUpQuestion
    )
    if (storageMovementAnswer) {
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: storageMovementAnswer,
          createdAt: new Date()
        }
      ])
      return { answer: storageMovementAnswer, conversationId: safeConversationId }
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
    const rangeStatsResolution = await this.tryBuildRangeStatsFacts(
      resolved.question,
      shouldUseRangeStats,
      conversation
    )
    const rangeStatsFacts = rangeStatsResolution?.facts || null
    if (shouldUseRangeStats && !rangeStatsFacts) {
      const missingArgsMessage =
        await this.generateIncomeRangeStatsMissingArgsMessage(
          resolved.question,
          rangeStatsResolution?.missing || []
        )
      const fallbackMessage = this.buildIncomeRangeStatsFallbackMessage(
        rangeStatsResolution?.missing || []
      )
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: missingArgsMessage || fallbackMessage,
          createdAt: new Date()
        }
      ])
      return {
        answer: missingArgsMessage || fallbackMessage,
        conversationId: safeConversationId
      }
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
      const ambiguityMessage =
        (await this.generateAmbiguityQuestionWithAi(
          resolved.question,
          ambiguity.options
        )) || ambiguity.message
      await this.storePendingSelection(conversation, ambiguity.options)
      await this.appendConversationMessages(conversation, [
        { role: "user", content: resolved.question, createdAt: new Date() },
        {
          role: "assistant",
          content: ambiguityMessage,
          createdAt: new Date()
        }
      ])
      return { answer: ambiguityMessage, conversationId: safeConversationId }
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
    const includeTrendInsights =
      responseMode === "income_overview" &&
      this.isIncomeTrendQuestion(resolved.question)

    const deterministicAnswer = this.tryBuildDeterministicIncomeAnswer(
      responseMode,
      factsData,
      askedDateLabel,
      includeTrendInsights
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

  private isLivestreamScheduleQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(lich livestream|lich live|ca livestream|ca live|hom nay livestream|livestream hom nay|hom nay.*ca live|gom nhung ai|nhung ai live|dang live|hien tai.*live)/.test(
      normalized
    )
  }

  private isLivestreamIntentQuestion(question: string) {
    if (this.isLivestreamScheduleQuestion(question)) return true
    const roleFilter = this.extractLivestreamRoleFilter(question)
    if (roleFilter !== "all") return true
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(live|livestream)/.test(normalized)
  }

  private isLivestreamAggregatedMetricsQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasMetricsSignal =
      /(doanh thu|chi phi ads|chi phi quang cao|ads|binh luan|comment|don hang|so don|kpi)/.test(
        normalized
      )
    return hasMetricsSignal
  }

  private isLivestreamMonthKpiQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasKpi = /\bkpi\b/.test(normalized)
    const hasMonthSignal = /(thang|month)/.test(normalized)
    const hasCurrentSignal = /(hien tai|bay gio|luc nay|now|current)/.test(normalized)
    return hasKpi && (hasMonthSignal || hasCurrentSignal)
  }

  private async tryBuildLivestreamMonthKpiAnswer(
    question: string,
    conversation?: AiConversation | null
  ) {
    try {
      const taskPlan = [
        "resolve_month_year",
        "resolve_channel",
        "fetch_month_kpis",
        "pick_channel_target",
        "format_answer"
      ]
      console.log("[ai][kpi] taskPlan", { taskPlan })

      console.log("[ai][kpi][task:start]", { task: "resolve_month_year" })
      const monthYear = this.extractMonthYear(question)
      console.log("[ai][kpi][task:done]", { task: "resolve_month_year", monthYear })

      console.log("[ai][kpi][task:start]", { task: "resolve_channel" })
      const channelKeyword =
        this.extractIncomeChannelName(question) ||
        this.extractIncomeChannelNameFromConversation(conversation)
      if (!channelKeyword) return null
      const channel = await this.findLivestreamChannel(channelKeyword)
      if (!channel) return null
      console.log("[ai][kpi][task:done]", {
        task: "resolve_channel",
        channel: { id: channel.id, name: channel.name }
      })

      console.log("[ai][kpi][task:start]", { task: "fetch_month_kpis" })
      const apiMonth = monthYear.month - 1
      console.info("[ai][api:req] livestreammonthgoals/kpis", {
        month: apiMonth,
        year: monthYear.year
      })
      const monthKpis = await this.livestreammonthgoalsService.getLivestreamMonthKpis(
        apiMonth,
        monthYear.year
      )
      console.info("[ai][api:res] livestreammonthgoals/kpis", {
        ok: true,
        count: Array.isArray(monthKpis) ? monthKpis.length : 0
      })
      console.log("[ai][kpi][task:done]", {
        task: "fetch_month_kpis",
        count: Array.isArray(monthKpis) ? monthKpis.length : 0
      })

      console.log("[ai][kpi][task:start]", { task: "pick_channel_target" })
      const target = (monthKpis || []).find((item: any) => {
        const id = String(item?.channel?._id || item?.channel || "")
        return id === channel.id
      })
      console.log("[ai][kpi][task:done]", {
        task: "pick_channel_target",
        matched: Boolean(target)
      })

      if (!target) {
        const resolvedChannelName = channel.name
        return `Chưa có KPI tháng ${String(monthYear.month).padStart(
          2,
          "0"
        )}/${monthYear.year} cho kênh ${resolvedChannelName}.`
      }

      console.log("[ai][kpi][task:start]", { task: "format_answer" })
      const goalValue = Number((target as any)?.goal || 0)
      const resolvedChannelName = String(
        (target as any)?.channel?.name ||
          (target as any)?.channel?.username ||
          channel.name
      ).trim()
      const answer = `KPI tháng ${String(monthYear.month).padStart(2, "0")}/${
        monthYear.year
      } của kênh ${resolvedChannelName}: ${goalValue.toLocaleString("vi-VN")} VNĐ.`
      console.log("[ai][kpi][task:done]", { task: "format_answer" })
      return answer
    } catch (error: any) {
      console.error("[ai][kpi] failed", error?.message || error)
      return "Hiện chưa lấy được KPI do lỗi hệ thống tạm thời. Bạn thử lại sau giúp mình."
    }
  }

  private extractMonthYear(question: string): { month: number; year: number } {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const now = new Date()

    if (/(thang nay|month nay|this month)/.test(normalized)) {
      return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }
    }

    const monthYearMatch =
      normalized.match(/thang\s*(\d{1,2})\s*\/\s*(\d{4})/) ||
      normalized.match(/thang\s*(\d{1,2})\s*nam\s*(\d{4})/) ||
      normalized.match(/month\s*(\d{1,2})\s*\/\s*(\d{4})/)
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1])
      const year = Number(monthYearMatch[2])
      if (month >= 1 && month <= 12 && Number.isFinite(year)) {
        return { month, year }
      }
    }

    const monthOnlyMatch =
      normalized.match(/thang\s*(\d{1,2})/) ||
      normalized.match(/month\s*(\d{1,2})/)
    if (monthOnlyMatch) {
      const month = Number(monthOnlyMatch[1])
      if (month >= 1 && month <= 12) {
        return { month, year: now.getUTCFullYear() }
      }
    }

    return { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }
  }

  private isStorageKpiQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /\bkpi\b/.test(normalized)
  }

  private isStorageKpiFollowUpQuestion(
    question: string,
    conversation?: AiConversation | null
  ) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasDiscountSignal =
      /(truoc\s*chiet\s*khau|sau\s*chiet\s*khau|truoc\s*ck|sau\s*ck|chiet\s*khau)/.test(
        normalized
      )
    if (!hasDiscountSignal) return false
    if (!conversation?.messages?.length) return false
    const recentUserMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .slice(0, 6)
    return recentUserMessages.some((m) => this.isStorageKpiQuestion(m.content))
  }

  private resolveStorageKpiFollowUpQuestion(
    question: string,
    conversation?: AiConversation | null
  ) {
    if (this.isStorageKpiQuestion(question)) return question
    if (!conversation?.messages?.length) return question
    const recentUserMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .slice(0, 8)
    const base = recentUserMessages.find((m) => this.isStorageKpiQuestion(m.content))
    if (!base) return question
    const merged = `${base.content}. ${question}`.trim()
    console.info("[ai][storage-kpi] followup_merged_question", {
      baseQuestion: base.content,
      followUp: question,
      mergedQuestion: merged
    })
    return merged
  }

  private resolveStorageKpiDiscountMode(question: string): "before" | "after" | "both" {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const wantsBefore = /(truoc\s*chiet\s*khau|truoc\s*ck)/.test(normalized)
    const wantsAfter = /(sau\s*chiet\s*khau|sau\s*ck)/.test(normalized)
    if (wantsBefore && wantsAfter) return "both"
    if (wantsBefore) return "before"
    if (wantsAfter) return "after"
    return "after"
  }

  private isStorageKpiTargetQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(de dat kpi|dat duoc kpi|can dat|ngay con lai|trung binh.*ngay|phai dat doanh so)/.test(
      normalized
    )
  }

  private async tryBuildStorageKpiAnswer(
    question: string,
    conversation?: AiConversation | null
  ) {
    try {
      console.log("[ai][storage-kpi] route=monthgoals", { question })
      const monthYear = this.extractMonthYear(question)
      const queryMonth = monthYear.month - 1
      const channel = await this.resolveStorageKpiChannel(question, conversation)
      let channelId = channel?.id

      console.log("[ai][storage-kpi][task:start]", { task: "fetch_monthgoals" })
      const goal = await this.monthGoalService.getGoal(
        queryMonth,
        monthYear.year,
        channelId
      )
      console.log("[ai][storage-kpi][task:done]", {
        task: "fetch_monthgoals",
        monthQueried: queryMonth,
        yearQueried: monthYear.year,
        matchedMonth: Boolean(goal)
      })

      if (!goal) {
        if (channel?.name) {
          return `Chưa có KPI tháng ${String(monthYear.month).padStart(
            2,
            "0"
          )}/${monthYear.year} cho kênh ${channel.name}.`
        }
        return `Chưa có KPI tháng ${String(monthYear.month).padStart(2, "0")}/${
          monthYear.year
        }.`
      }

      if (!channelId) {
        const rawGoalChannelId =
          (goal as any)?.channel?._id ||
          (goal as any)?.channel?.id ||
          (goal as any)?.channel
        if (rawGoalChannelId) channelId = String(rawGoalChannelId)
      }

      const now = new Date()
      const monthRange = this.buildMonthRange(monthYear.month, monthYear.year, now)
      const normalizedRange = this.normalizeRangeStatsDateRange(monthRange)
      const hasRangeStats = Boolean(channelId)
      const discountMode = this.resolveStorageKpiDiscountMode(question)
      let liveIncomeBeforeDiscount = 0
      let shopIncomeBeforeDiscount = 0
      let liveIncomeAfterDiscount = 0
      let shopIncomeAfterDiscount = 0

      if (hasRangeStats && channelId) {
        console.log("[ai][storage-kpi][task:start]", {
          task: "fetch_range_stats_income",
          startDate: normalizedRange.start,
          endDate: normalizedRange.end,
          channelId
        })
        const stats = await this.incomeService.getRangeStats(
          normalizedRange.start,
          normalizedRange.end,
          channelId,
          false
        )
        liveIncomeBeforeDiscount = Number(
          stats?.current?.beforeDiscount?.liveIncome || 0
        )
        shopIncomeBeforeDiscount = Number(
          stats?.current?.beforeDiscount?.videoIncome || 0
        )
        liveIncomeAfterDiscount = Number(
          stats?.current?.afterDiscount?.liveIncome || 0
        )
        shopIncomeAfterDiscount = Number(
          stats?.current?.afterDiscount?.videoIncome || 0
        )
        console.log("[ai][storage-kpi][task:done]", {
          task: "fetch_range_stats_income",
          discountMode,
          liveIncomeBeforeDiscount,
          shopIncomeBeforeDiscount,
          liveIncomeAfterDiscount,
          shopIncomeAfterDiscount
        })
      } else {
        console.log("[ai][storage-kpi][task:skip]", {
          task: "fetch_range_stats_income",
          reason: "missing_channel_id"
        })
      }

      const fmt = (v: any) => Number(v || 0).toLocaleString("vi-VN")
      const fmtPct = (v: number) =>
        `${(Math.round(Number(v || 0) * 100) / 100).toLocaleString("vi-VN")}%`
      const liveGoal = Number((goal as any)?.liveStreamGoal || 0)
      const shopGoal = Number((goal as any)?.shopGoal || 0)
      const liveIncomeForKpi =
        discountMode === "before" ? liveIncomeBeforeDiscount : liveIncomeAfterDiscount
      const shopIncomeForKpi =
        discountMode === "before" ? shopIncomeBeforeDiscount : shopIncomeAfterDiscount
      const liveKpiPct =
        liveGoal > 0 ? Math.min((liveIncomeForKpi / liveGoal) * 100, 999) : 0
      const shopKpiPct =
        shopGoal > 0 ? Math.min((shopIncomeForKpi / shopGoal) * 100, 999) : 0
      let channelName = String(
        (goal as any)?.channel?.name || channel?.name || ""
      ).trim()
      if (!channelName && channelId) {
        const channelById = await this.findLivestreamChannelById(channelId)
        channelName = channelById?.name || ""
      }
      if (!channelName) channelName = "không rõ kênh"
      const lines = [
        `KPI tháng ${String(monthYear.month).padStart(2, "0")}/${
          monthYear.year
        } của kênh ${channelName}:`,
        `- KPI LiveStream: ${fmt(liveGoal)}`,
        `- KPI Shop: ${fmt(shopGoal)}`
      ]
      if (discountMode === "before" || discountMode === "both") {
        lines.push(`- Doanh thu Live (trước CK): ${fmt(liveIncomeBeforeDiscount)}`)
        lines.push(`- Doanh thu Shop (trước CK): ${fmt(shopIncomeBeforeDiscount)}`)
      }
      if (discountMode === "after" || discountMode === "both") {
        lines.push(`- Doanh thu Live (sau CK): ${fmt(liveIncomeAfterDiscount)}`)
        lines.push(`- Doanh thu Shop (sau CK): ${fmt(shopIncomeAfterDiscount)}`)
      }
      if (discountMode === "before") {
        lines.push(`- KPI% Live (trước CK): ${fmtPct(liveKpiPct)}`)
        lines.push(`- KPI% Shop (trước CK): ${fmtPct(shopKpiPct)}`)
      } else if (discountMode === "both") {
        const liveKpiAfter =
          liveGoal > 0 ? Math.min((liveIncomeAfterDiscount / liveGoal) * 100, 999) : 0
        const shopKpiAfter =
          shopGoal > 0 ? Math.min((shopIncomeAfterDiscount / shopGoal) * 100, 999) : 0
        lines.push(`- KPI% Live (trước CK): ${fmtPct(liveKpiPct)}`)
        lines.push(`- KPI% Shop (trước CK): ${fmtPct(shopKpiPct)}`)
        lines.push(`- KPI% Live (sau CK): ${fmtPct(liveKpiAfter)}`)
        lines.push(`- KPI% Shop (sau CK): ${fmtPct(shopKpiAfter)}`)
      } else {
        lines.push(`- KPI% Live (sau CK): ${fmtPct(liveKpiPct)}`)
        lines.push(`- KPI% Shop (sau CK): ${fmtPct(shopKpiPct)}`)
      }

      if (this.isStorageKpiTargetQuestion(question)) {
        console.log("[ai][storage-kpi][task:start]", {
          task: "compute_required_daily_revenue_for_kpi",
          discountMode
        })
        const monthEnd = new Date(Date.UTC(monthYear.year, monthYear.month, 0, 23, 59, 59, 999))
        const today = new Date()
        const todayStart = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            0,
            0,
            0,
            0
          )
        )
        const monthEndStart = new Date(
          Date.UTC(
            monthEnd.getUTCFullYear(),
            monthEnd.getUTCMonth(),
            monthEnd.getUTCDate(),
            0,
            0,
            0,
            0
          )
        )
        const remainingDays =
          monthEndStart.getTime() < todayStart.getTime()
            ? 0
            : Math.floor((monthEndStart.getTime() - todayStart.getTime()) / 86400000) + 1
        const remainLive = Math.max(liveGoal - liveIncomeForKpi, 0)
        const remainShop = Math.max(shopGoal - shopIncomeForKpi, 0)
        const remainTotal = remainLive + remainShop
        const requiredLivePerDay = remainingDays > 0 ? remainLive / remainingDays : 0
        const requiredShopPerDay = remainingDays > 0 ? remainShop / remainingDays : 0
        const requiredTotalPerDay = remainingDays > 0 ? remainTotal / remainingDays : 0
        const modeLabel = discountMode === "before" ? "trước CK" : "sau CK"
        lines.push("")
        lines.push(`Cần đạt thêm để chạm KPI (${modeLabel}):`)
        lines.push(`- Còn thiếu Live: ${fmt(remainLive)}`)
        lines.push(`- Còn thiếu Shop: ${fmt(remainShop)}`)
        lines.push(`- Còn lại ${remainingDays} ngày trong tháng`)
        lines.push(
          `- Trung bình/ngày cần đạt Live: ${fmt(requiredLivePerDay)}, Shop: ${fmt(
            requiredShopPerDay
          )}, Tổng: ${fmt(requiredTotalPerDay)}`
        )
        console.log("[ai][storage-kpi][task:done]", {
          task: "compute_required_daily_revenue_for_kpi",
          remainingDays,
          remainLive,
          remainShop,
          requiredLivePerDay,
          requiredShopPerDay,
          requiredTotalPerDay
        })
      }

      return lines.join("\n")
    } catch (error: any) {
      console.error("[ai][storage-kpi] failed", error?.message || error)
      return "Hiện chưa lấy được KPI ở nhánh storage. Bạn thử lại sau giúp mình."
    }
  }

  private async resolveStorageKpiChannel(
    question: string,
    conversation?: AiConversation | null
  ) {
    const channelKeyword =
      this.extractIncomeChannelName(question) ||
      this.extractIncomeChannelNameFromConversation(conversation)
    if (channelKeyword) {
      const direct = await this.findLivestreamChannel(channelKeyword)
      if (direct) return direct
    }
    const inferred = await this.findLivestreamChannelFromQuestion(question)
    if (inferred) {
      console.log("[ai][storage-kpi] inferred_channel_from_schema", inferred)
      return inferred
    }
    return null
  }

  private async findLivestreamChannelFromQuestion(question: string) {
    let channelModel: Model<any>
    try {
      channelModel = this.connection.model("livestreamchannels")
    } catch {
      return null
    }
    const normalize = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim()
    const stop = new Set([
      "hien",
      "tai",
      "kpi",
      "kenh",
      "la",
      "bao",
      "nhieu",
      "roi",
      "cho",
      "cua",
      "thang",
      "nam"
    ])
    const tokens = normalize(question)
      .split(/[^a-z0-9]+/)
      .filter((t) => t && t.length >= 2 && !stop.has(t))
    if (!tokens.length) return null

    const candidates: any[] = await channelModel
      .find({}, { _id: 1, name: 1, username: 1, usernames: 1 })
      .limit(500)
      .lean()
      .exec()
    let best: { id: string; name: string; score: number } | null = null
    for (const c of candidates) {
      const fields = [
        String(c?.name || ""),
        String(c?.username || ""),
        ...(Array.isArray(c?.usernames) ? c.usernames.map((u: any) => String(u || "")) : [])
      ]
      const haystack = normalize(fields.join(" "))
      const score = tokens.reduce(
        (acc, token) => (haystack.includes(token) ? acc + 1 : acc),
        0
      )
      if (score <= 0) continue
      if (!best || score > best.score) {
        const name = String(c?.name || c?.username || "").trim()
        best = { id: String(c?._id || ""), name, score }
      }
    }
    if (!best || best.score < 2) return null
    return { id: best.id, name: best.name || "Không rõ kênh" }
  }

  private async tryBuildLivestreamAggregatedMetricsAnswer(
    question: string,
    conversation?: AiConversation | null
  ) {
    const dateRange = this.extractLivestreamAggregatedDateRange(question)
    if (!dateRange) return null
    const channelKeyword =
      this.extractIncomeChannelName(question) ||
      this.extractIncomeChannelNameFromConversation(conversation)
    if (!channelKeyword) return null
    const channel = await this.findLivestreamChannel(channelKeyword)
    if (!channel) return null

    console.info("[ai][api:req] livestreamanalytics/aggregated-metrics", {
      startDate: dateRange.start,
      endDate: dateRange.end,
      channel: channel.id
    })
    const metrics = await this.livestreamanalyticsService.getAggregatedMetrics(
      dateRange.start,
      dateRange.end,
      channel.id
    )
    console.info("[ai][api:res] livestreamanalytics/aggregated-metrics", {
      ok: true,
      metrics
    })

    const fmt = (value: any) => Number(value || 0).toLocaleString("vi-VN")
    const dateLabel =
      this.extractQuestionDateLabel(question) ||
      this.formatDateRangeLabel(dateRange.start, dateRange.end)
    return [
      `Doanh thu livestream kênh ${channel.name} (${dateLabel || "không rõ ngày"}):`,
      `- Tổng doanh thu: ${fmt(metrics?.totalIncome)} VNĐ`,
      `- Tổng chi phí ads: ${fmt(metrics?.totalAdsCost)} VNĐ`,
      `- Tổng bình luận: ${fmt(metrics?.totalComments)}`,
      `- Tổng đơn hàng: ${fmt(metrics?.totalOrders)}`,
      `- KPI: ${fmt(metrics?.kpi)}`
    ].join("\n")
  }

  private extractLivestreamAggregatedDateRange(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const now = new Date()
    const todayMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    )
    const hasDateToken = /\d{1,2}\/\d{1,2}(?:\/\d{4})?/.test(normalized)
    const hasTodayToken = /(hom nay|today)/.test(normalized)
    const explicitRange = this.extractDateRange(question)
    if (hasTodayToken && hasDateToken && explicitRange) {
      const start = new Date(
        Date.UTC(
          explicitRange.start.getUTCFullYear(),
          explicitRange.start.getUTCMonth(),
          explicitRange.start.getUTCDate(),
          0,
          0,
          0,
          0
        )
      )
      return { start, end: new Date(todayMidnight) }
    }

    if (hasTodayToken) {
      return { start: new Date(todayMidnight), end: new Date(todayMidnight) }
    }
    if (/(hom qua|yesterday)/.test(normalized)) {
      const d = new Date(todayMidnight)
      d.setUTCDate(d.getUTCDate() - 1)
      return { start: d, end: new Date(d) }
    }
    if (/(ngay mai|tomorrow)/.test(normalized)) {
      const d = new Date(todayMidnight)
      d.setUTCDate(d.getUTCDate() + 1)
      return { start: d, end: new Date(d) }
    }

    const range = this.extractDateRange(question)
    if (!range) return null
    const toMidnight = (value: Date) =>
      new Date(
        Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0)
      )
    return {
      start: toMidnight(range.start),
      end: toMidnight(range.end)
    }
  }

  private isLivestreamNowQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(dang live|hien tai|now|luc nay|bay gio)/.test(normalized)
  }

  private async tryBuildLivestreamScheduleAnswer(
    question: string,
    conversation?: AiConversation | null
  ) {
    const roleFilter = this.extractLivestreamRoleFilter(question)
    const isNowQuestion = this.isLivestreamNowQuestion(question)
    const isScheduleQuestion =
      this.isLivestreamScheduleQuestion(question) || isNowQuestion
    let baseQuestion = question
    if (!isScheduleQuestion) {
      if (roleFilter === "all") return null
      const lastScheduleQuestion =
        this.findLastLivestreamScheduleQuestion(conversation)
      if (!lastScheduleQuestion) return null
      baseQuestion = lastScheduleQuestion
    }

    const day =
      this.extractLivestreamScheduleDate(question) ||
      this.extractLivestreamScheduleDate(baseQuestion)
    const effectiveDay =
      day ||
      (isNowQuestion
        ? new Date(
            Date.UTC(
              new Date().getUTCFullYear(),
              new Date().getUTCMonth(),
              new Date().getUTCDate()
            )
          )
        : null)
    if (!effectiveDay) return null

    let livestreamModel: Model<any>
    try {
      livestreamModel = this.connection.model("livestreams")
    } catch {
      return null
    }

    const start = new Date(effectiveDay)
    start.setHours(0, 0, 0, 0)
    const end = new Date(effectiveDay)
    end.setHours(23, 59, 59, 999)

    const rows: any[] = await livestreamModel
      .find({ date: { $gte: start, $lte: end } }, { date: 1, snapshots: 1 })
      .populate("snapshots.assignee", "_id name username")
      .populate("snapshots.altAssignee", "_id name username")
      .populate("snapshots.period.channel", "_id name username platform")
      .lean()
      .exec()

    const byChannel = new Map<
      string,
      Map<string, { startMin: number; endMin: number; hosts: Set<string>; assistants: Set<string> }>
    >()
    const toName = (person: any) =>
      String(person?.name || person?.username || "").trim()
    const toTimeLabel = (minute: number) =>
      `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
        minute % 60
      ).padStart(2, "0")}`
    const nowMinutesVn = (() => {
      const now = new Date()
      const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
      return (utcMinutes + 7 * 60 + 24 * 60) % (24 * 60)
    })()

    for (const row of rows) {
      const snapshots = Array.isArray(row?.snapshots) ? row.snapshots : []
      for (const s of snapshots) {
        const channelObj = s?.period?.channel
        const channelName = String(
          channelObj?.name || channelObj?.username || "Kênh không rõ"
        ).trim()
        if (!byChannel.has(channelName)) byChannel.set(channelName, new Map())
        const channelSlots = byChannel.get(channelName)!

        const startHour = Number(s?.period?.startTime?.hour)
        const startMinute = Number(s?.period?.startTime?.minute)
        const endHour = Number(s?.period?.endTime?.hour)
        const endMinute = Number(s?.period?.endTime?.minute)
        const hasStart =
          Number.isFinite(startHour) && Number.isFinite(startMinute)
        const hasEnd = Number.isFinite(endHour) && Number.isFinite(endMinute)
        const startMin = hasStart ? startHour * 60 + startMinute : -1
        const endMin = hasEnd ? endHour * 60 + endMinute : -1
        const slotKey =
          hasStart && hasEnd
            ? `${startMin}-${endMin}`
            : "unknown-time"
        if (!channelSlots.has(slotKey)) {
          channelSlots.set(slotKey, {
            startMin,
            endMin,
            hosts: new Set(),
            assistants: new Set()
          })
        }
        const slot = channelSlots.get(slotKey)!

        let personName = ""
        if (s?.altAssignee === "other") {
          personName = String(s?.altOtherAssignee || "").trim()
        } else if (s?.altAssignee) {
          personName = toName(s.altAssignee)
        } else if (s?.assignee) {
          personName = toName(s.assignee)
        }
        if (!personName) continue

        if (s?.period?.for === "assistant") slot.assistants.add(personName)
        else slot.hosts.add(personName)
      }
    }

    const dateLabel =
      this.extractQuestionDateLabel(question) ||
      this.extractQuestionDateLabel(baseQuestion)
    if (!byChannel.size) {
      return `Lịch livestream ngày ${dateLabel || ""}: chưa có ca livestream.`
    }

    const lines: string[] = [`Lịch livestream ngày ${dateLabel || ""}:`]
    let renderedSlots = 0
    for (const [channelName, slots] of byChannel.entries()) {
      const channelLines: string[] = []
      const sortedSlots = Array.from(slots.values()).sort((a, b) => {
        if (a.startMin === -1 && b.startMin === -1) return 0
        if (a.startMin === -1) return 1
        if (b.startMin === -1) return -1
        return a.startMin - b.startMin
      })
      for (const slot of sortedSlots) {
        const hosts = Array.from(slot.hosts)
        const assistants = Array.from(slot.assistants)
        if (isNowQuestion) {
          const inCurrentSlot =
            slot.startMin >= 0 &&
            slot.endMin >= 0 &&
            nowMinutesVn >= slot.startMin &&
            nowMinutesVn < slot.endMin
          if (!inCurrentSlot) continue
        }
        if (roleFilter === "host" && !hosts.length) continue
        if (roleFilter === "assistant" && !assistants.length) continue
        const timeLabel =
          slot.startMin >= 0 && slot.endMin >= 0
            ? `${toTimeLabel(slot.startMin)}-${toTimeLabel(slot.endMin)}`
            : "Không rõ giờ"
        const details: string[] = []
        if (roleFilter !== "assistant" && hosts.length) {
          details.push(`Host: ${hosts.join(", ")}`)
        }
        if (roleFilter !== "host" && assistants.length) {
          details.push(`Trợ live: ${assistants.join(", ")}`)
        }
        if (!details.length && roleFilter === "all") {
          details.push("Chưa phân công nhân sự")
        }
        if (!details.length) continue
        channelLines.push(`- ${timeLabel} | ${details.join(" | ")}`)
        renderedSlots += 1
      }
      if (channelLines.length) {
        lines.push("")
        lines.push(`Kênh ${channelName}:`)
        lines.push(...channelLines)
      }
    }
    if (!renderedSlots) {
      if (isNowQuestion && roleFilter === "all") {
        return "Hiện tại không có ai đang live."
      }
      if (isNowQuestion && roleFilter === "host") {
        return "Hiện tại không có host nào đang live."
      }
      if (isNowQuestion && roleFilter === "assistant") {
        return "Hiện tại không có trợ live nào đang live."
      }
      if (roleFilter === "host") {
        return `Lịch livestream ngày ${dateLabel || ""}: không có ca host.`
      }
      if (roleFilter === "assistant") {
        return `Lịch livestream ngày ${dateLabel || ""}: không có ca trợ live.`
      }
      return `Lịch livestream ngày ${dateLabel || ""}: chưa có ca livestream.`
    }
    return lines.join("\n")
  }

  private extractLivestreamRoleFilter(question: string): "host" | "assistant" | "all" {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasHost = /(host|nguoi dan|mc)/.test(normalized)
    const hasAssistant = /(assistant|tro ly|tro live|tro stream|ho tro live)/.test(
      normalized
    )
    if (hasHost && !hasAssistant) return "host"
    if (hasAssistant && !hasHost) return "assistant"
    return "all"
  }

  private findLastLivestreamScheduleQuestion(
    conversation?: AiConversation | null
  ) {
    if (!conversation?.messages?.length) return null
    const lastUserMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .slice(0, 10)
    for (const msg of lastUserMessages) {
      if (this.isLivestreamScheduleQuestion(msg.content)) return msg.content
    }
    return null
  }

  private extractLivestreamScheduleDate(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const now = new Date()
    if (/(hom nay|today)/.test(normalized)) {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      )
    }
    if (/(hom qua|yesterday)/.test(normalized)) {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
      )
    }
    if (/(ngay mai|tomorrow)/.test(normalized)) {
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      )
    }
    const range = this.extractDateRange(question)
    return range?.start || null
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
          },
          dailyTrend: range.stats.dailyTrend || []
        }
      }
    }
  }

  private tryBuildDeterministicIncomeAnswer(
    responseMode: string,
    factsData: Record<string, any>,
    askedDateLabel?: string | null,
    includeTrendInsights = false
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
      const lines = [
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
      ]
      if (includeTrendInsights) {
        const trendSummary = this.buildIncomeTrendSummary(
          range?.stats?.dailyTrend
        )
        if (trendSummary.length) {
          lines.push("", "Nhận xét xu hướng:", ...trendSummary)
        }
      }
      return lines.join("\n")
    }
    return null
  }

  private isIncomeTrendQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(xu huong|tang|giam|bien dong|cao nhat|thap nhat|trend|peak)/.test(
      normalized
    )
  }

  private buildIncomeTrendSummary(dailyTrend: any) {
    if (!Array.isArray(dailyTrend) || dailyTrend.length < 2) return []
    const safeRows = dailyTrend
      .map((row: any) => ({
        date: new Date(row?.date),
        before: Number(row?.beforeDiscountTotal || 0),
        after: Number(row?.afterDiscountTotal || 0)
      }))
      .filter((row: any) => !Number.isNaN(row.date.getTime()))
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime())
    if (safeRows.length < 2) return []

    const highAfter = safeRows.reduce((best: any, cur: any) =>
      cur.after > best.after ? cur : best
    )
    const lowAfter = safeRows.reduce((best: any, cur: any) =>
      cur.after < best.after ? cur : best
    )
    const first = safeRows[0]
    const last = safeRows[safeRows.length - 1]
    const changePct =
      first.after === 0
        ? last.after === 0
          ? 0
          : 100
        : Math.round(((last.after - first.after) / first.after) * 10000) / 100
    const trendDirection =
      changePct > 1 ? "xu hướng tăng" : changePct < -1 ? "xu hướng giảm" : "dao động nhẹ"

    return [
      `- Tổng quan: ${trendDirection} (${changePct.toLocaleString("vi-VN")}%) so với đầu kỳ.`,
      `- Ngày cao nhất (sau chiết khấu): ${this.formatDateForTrendLabel(highAfter.date)} với ${highAfter.after.toLocaleString("vi-VN")} VNĐ.`,
      `- Ngày thấp nhất (sau chiết khấu): ${this.formatDateForTrendLabel(lowAfter.date)} với ${lowAfter.after.toLocaleString("vi-VN")} VNĐ.`
    ]
  }

  private formatDateForTrendLabel(date: Date) {
    return `${String(date.getUTCDate()).padStart(2, "0")}/${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}/${date.getUTCFullYear()}`
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
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const now = new Date()
    const format = (date: Date) =>
      `${String(date.getUTCDate()).padStart(2, "0")}/${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}/${date.getUTCFullYear()}`
    if (/(hom nay|today)/.test(normalized)) {
      return format(
        new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        )
      )
    }
    if (/(hom qua|yesterday)/.test(normalized)) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      )
      d.setUTCDate(d.getUTCDate() - 1)
      return format(d)
    }
    if (/(ngay mai|tomorrow)/.test(normalized)) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      )
      d.setUTCDate(d.getUTCDate() + 1)
      return format(d)
    }

    const range = this.extractDateRange(question)
    if (!range) return null
    const start = format(range.start)
    const end = format(range.end)
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
      /\btrong\s*\d+\s*ng(?:a|à)y\b[\s\S]*$/i,
      /\btrong\s*(?:\d+\s*)?(?:t(?:u|uầ)n|th(?:a|á)ng|n(?:a|ă)m)\b[\s\S]*$/i,
      /\bt(?:u|ừ)\s*ng(?:a|à)y\b[\s\S]*$/i,
      /\b(?:d|đ)(?:e|ế)n\s*ng(?:a|à)y\b[\s\S]*$/i,
      /\btrong\s*kho(?:a|ả)ng\b[\s\S]*$/i,
      /\bkho(?:a|ả)ng\s*th(?:o|ờ)i\s*gian\b[\s\S]*$/i,
      /\bng(?:a|à)y\b[\s\S]*$/i,
      /\b(?:d|đ)u(?:o|ơ)c\s*bao\s*nhieu\b[\s\S]*$/i,
      /\bbao\s*nhieu\b[\s\S]*$/i,
      /\bda\s*dat\b[\s\S]*$/i,
      /\bdat\s*duoc\b[\s\S]*$/i,
      /\bthi\s*sao\b[\s\S]*$/i,
      /\broi\b[\s\S]*$/i
    ]
    for (const pattern of stopPatterns) {
      value = value.replace(pattern, "").trim()
    }

    value = value.replace(/\d{1,2}\/\d{1,2}\/\d{4}[\s\S]*$/i, "").trim()
    value = value.replace(/\d{1,2}\/\d{1,2}[\s\S]*$/i, "").trim()
    value = value.replace(/\b(tu|từ|den|đến|la|là)\b\s*$/i, "").trim()
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
  ): Promise<{
    facts: {
      channelId: string
      channelName: string
      startDate: Date
      endDate: Date
      stats: any
    } | null
    missing: Array<"channel" | "dateRange">
  }> {
    if (!forceForIncome && !this.isRangeStatsQuestion(question)) {
      return { facts: null, missing: [] }
    }
    const taskPlan = [
      "resolve_date_range",
      "resolve_channel_name",
      "resolve_channel_id",
      "fetch_range_stats"
    ]
    console.info("[ai][income] taskPlan", { taskPlan })

    console.info("[ai][income][task:start]", { task: "resolve_date_range" })
    const dateRange = await this.inferIncomeDateRangeWithAi(question)
    console.info("[ai][income][task:done]", {
      task: "resolve_date_range",
      hasDateRange: Boolean(dateRange)
    })

    console.info("[ai][income][task:start]", { task: "resolve_channel_name" })
    const channelName =
      this.extractIncomeChannelName(question) ||
      this.extractIncomeChannelNameFromConversation(conversation) ||
      (await this.inferIncomeChannelNameWithAi(question, conversation))
    console.info("[ai][income][task:done]", {
      task: "resolve_channel_name",
      channelName: channelName || null
    })

    const missing: Array<"channel" | "dateRange"> = []
    if (!dateRange) missing.push("dateRange")
    if (!channelName) missing.push("channel")
    if (missing.length > 0) {
      console.info("[ai][income][task:skip]", {
        task: "resolve_channel_id",
        reason: "missing_required_input"
      })
      console.info("[ai][income][task:skip]", {
        task: "fetch_range_stats",
        reason: "missing_required_input"
      })
      return { facts: null, missing }
    }

    const normalizedRange = this.normalizeRangeStatsDateRange(dateRange)
    console.info("[ai][income][task:start]", { task: "resolve_channel_id" })
    const channelId = await this.findLivestreamChannelId(channelName)
    console.info("[ai][income][task:done]", {
      task: "resolve_channel_id",
      found: Boolean(channelId)
    })
    if (!channelId) return { facts: null, missing: ["channel"] }

    console.info("[ai][income][task:start]", { task: "fetch_range_stats" })
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
    const dailyTrend = await this.buildIncomeDailyTrend(
      normalizedRange.start,
      normalizedRange.end,
      channelId
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
    console.info("[ai][income][task:done]", {
      task: "fetch_range_stats",
      ok: true
    })
    return {
      facts: {
        channelId,
        channelName,
        startDate: normalizedRange.start,
        endDate: normalizedRange.end,
        stats: {
          ...stats,
          dailyTrend
        }
      },
      missing: []
    }
  }

  private async buildIncomeDailyTrend(
    startDate: Date,
    endDate: Date,
    channelId: string
  ) {
    const perDay = new Map<string, { beforeDiscountTotal: number; afterDiscountTotal: number }>()
    const limit = 200
    const first = await this.incomeService.getIncomesByDateRange(
      startDate,
      endDate,
      1,
      limit,
      undefined,
      undefined,
      undefined,
      channelId
    )
    const total = Number(first?.total || 0)
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const allIncomes: any[] = [...(Array.isArray(first?.incomes) ? first.incomes : [])]
    for (let page = 2; page <= totalPages; page++) {
      const next = await this.incomeService.getIncomesByDateRange(
        startDate,
        endDate,
        page,
        limit,
        undefined,
        undefined,
        undefined,
        channelId
      )
      if (Array.isArray(next?.incomes) && next.incomes.length) {
        allIncomes.push(...next.incomes)
      }
    }

    for (const income of allIncomes) {
      const d = new Date(income?.date)
      if (Number.isNaN(d.getTime())) continue
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getUTCDate()).padStart(2, "0")}`
      const current = perDay.get(key) || {
        beforeDiscountTotal: 0,
        afterDiscountTotal: 0
      }
      for (const p of income?.products || []) {
        const before = Number(p?.price || 0)
        const sellerDiscount = Number(p?.sellerDiscount || 0)
        current.beforeDiscountTotal += before
        current.afterDiscountTotal += before - sellerDiscount
      }
      perDay.set(key, current)
    }

    return Array.from(perDay.entries())
      .map(([day, totals]) => ({
        date: new Date(`${day}T00:00:00.000Z`),
        beforeDiscountTotal: totals.beforeDiscountTotal,
        afterDiscountTotal: totals.afterDiscountTotal
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  private async generateIncomeRangeStatsMissingArgsMessage(
    question: string,
    missing: Array<"channel" | "dateRange">
  ) {
    const missingLabel =
      missing.includes("channel") && missing.includes("dateRange")
        ? "thiếu cả tên kênh và khoảng ngày"
        : missing.includes("channel")
          ? "thiếu tên kênh"
          : missing.includes("dateRange")
            ? "thiếu khoảng ngày"
            : "thiếu thông tin"
    const systemPrompt =
      "Bạn là trợ lý nhắc người dùng bổ sung dữ liệu đầu vào cho truy vấn doanh thu. " +
      "Viết 1 câu tiếng Việt có dấu, ngắn gọn, lịch sự (tối đa 22 từ), nêu đúng phần còn thiếu, không giải thích kỹ thuật."
    const userPrompt =
      `Câu hỏi người dùng: ${question}\n` +
      `Tình trạng hiện tại: ${missingLabel}\n` +
      "Nếu thiếu tên kênh, gợi ý ví dụ: My Candy. " +
      "Nếu thiếu khoảng ngày, gợi ý: 30 ngày gần nhất."
    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const content = String(raw || "").trim()
      if (!content) return null
      return content
    } catch {
      return null
    }
  }

  private buildIncomeRangeStatsFallbackMessage(
    missing: Array<"channel" | "dateRange">
  ) {
    if (missing.includes("channel") && missing.includes("dateRange")) {
      return "Bạn cho mình tên kênh và khoảng ngày nhé, ví dụ: kênh My Candy trong 30 ngày gần nhất."
    }
    if (missing.includes("channel")) {
      return "Bạn cho mình tên kênh nhé, ví dụ: My Candy."
    }
    if (missing.includes("dateRange")) {
      return "Bạn cho mình khoảng ngày nhé, ví dụ: 30 ngày gần nhất hoặc từ ngày ... đến ngày ...."
    }
    return "Bạn bổ sung thêm tên kênh và khoảng ngày để mình trả kết quả chính xác nhé."
  }

  private async inferIncomeDateRangeWithAi(question: string) {
    const now = new Date()
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getUTCDate()).padStart(2, "0")}`
    const systemPrompt =
      "Ban la bo phan suy luan khoang ngay cho cau hoi doanh thu. " +
      'Tra ve dung JSON: {"start":"YYYY-MM-DD","end":"YYYY-MM-DD","confidence":0-1}. ' +
      'Neu khong suy ra duoc thi tra ve {"start":null,"end":null,"confidence":0}. ' +
      "Quy tac: " +
      '"X ngay gan nhat" => end = hom nay, start = hom nay - (X-1) ngay. ' +
      '"hom nay" => 1 ngay hom nay; "hom qua" => 1 ngay hom qua; "ngay mai" => 1 ngay ngay mai. ' +
      '"thang nay" => tu ngay 01 den hom nay; "thang truoc" => tu ngay 01 den ngay cuoi thang truoc. ' +
      '"thang N" => toan bo thang N gan nhat trong qua khu; "thang N/YYYY" => toan bo thang do. ' +
      'Neu co 2 moc ngay ro rang (vi du "tu ngay ... den ngay ...") thi dung dung 2 moc do.'
    const userPrompt =
      `Hom nay (UTC): ${today}\n` +
      `Cau hoi: ${question}\n` +
      "Chi tra ve JSON."

    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      const startRaw = typeof parsed?.start === "string" ? parsed.start : ""
      const endRaw = typeof parsed?.end === "string" ? parsed.end : ""
      const startMatch = startRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const endMatch = endRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!startMatch || !endMatch) return null

      const start = new Date(
        Date.UTC(
          Number(startMatch[1]),
          Number(startMatch[2]) - 1,
          Number(startMatch[3]),
          0,
          0,
          0,
          0
        )
      )
      const end = new Date(
        Date.UTC(
          Number(endMatch[1]),
          Number(endMatch[2]) - 1,
          Number(endMatch[3]),
          23,
          59,
          59,
          999
        )
      )
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        start.getTime() > end.getTime()
      ) {
        return null
      }
      return { start, end }
    } catch {
      return null
    }
  }

  private async inferIncomeChannelNameWithAi(
    question: string,
    conversation?: AiConversation | null
  ) {
    let channelModel: Model<any>
    try {
      channelModel = this.connection.model("livestreamchannels")
    } catch {
      return null
    }
    const channels: any[] = await channelModel
      .find({}, { _id: 0, name: 1, username: 1 })
      .limit(500)
      .lean()
      .exec()
    const candidateNames = Array.from(
      new Set(
        channels
          .flatMap((c) => [c?.name, c?.username])
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      )
    ).slice(0, 300)
    if (!candidateNames.length) return null

    const recentContext = (conversation?.messages || [])
      .slice(-6)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n")
    const systemPrompt =
      "Ban la bo phan trich xuat ten kenh livestream trong cau hoi doanh thu. " +
      'Tra ve dung JSON: {"channelName":"...","confidence":0-1}. ' +
      'Neu khong xac dinh duoc thi tra ve {"channelName":null,"confidence":0}. ' +
      "Chi chon ten kenh tu danh sach duoc cung cap."
    const userPrompt =
      `Cau hoi hien tai: ${question}\n` +
      (recentContext ? `Ngu canh hoi dap gan day:\n${recentContext}\n` : "") +
      `Danh sach kenh hop le:\n${JSON.stringify(candidateNames)}\n` +
      "Chi tra ve JSON."
    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      const channelName =
        typeof parsed?.channelName === "string" ? parsed.channelName.trim() : ""
      if (!channelName) return null
      if (!candidateNames.includes(channelName)) return null
      return channelName
    } catch {
      return null
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
    const recentMessages = [...conversation.messages]
      .reverse()
      .filter((m) => m.content)
      .slice(0, 10)
    for (const msg of recentMessages) {
      if (msg.role === "user") {
        const name = this.extractIncomeChannelName(msg.content)
        if (name) return name
      }
      if (msg.role === "assistant") {
        const assistantMatch = msg.content.match(
          /c(?:ua|ủa)\s*k(?:e|ê)nh\s*([^:\n\r]+)/i
        )
        if (assistantMatch?.[1]) {
          const cleaned = this.cleanIncomeChannelName(assistantMatch[1])
          if (cleaned) return cleaned
        }
      }
    }
    return null
  }

  private async findLivestreamChannelById(channelId: string) {
    if (!channelId || !isValidObjectId(channelId)) return null
    let channelModel: Model<any>
    try {
      channelModel = this.connection.model("livestreamchannels")
    } catch {
      return null
    }
    const channel: any = await channelModel
      .findById(channelId, { _id: 1, name: 1, username: 1 })
      .lean()
      .exec()
    if (!channel?._id) return null
    const name = String(channel?.name || channel?.username || "").trim()
    if (!name) return null
    return { id: String(channel._id), name }
  }

  private async findLivestreamChannelId(channelKeyword: string) {
    const channel = await this.findLivestreamChannel(channelKeyword)
    return channel?.id || null
  }

  private async findLivestreamChannel(
    channelKeyword: string
  ): Promise<{ id: string; name: string } | null> {
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
        { _id: 1, name: 1, username: 1 }
      )
      .lean()
      .exec()
    if (channel?._id) {
      const displayName = String(channel?.name || channel?.username || "").trim()
      return { id: String(channel._id), name: displayName || channelKeyword.trim() }
    }

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
    if (!matched?._id) return null
    const displayName = String(matched?.name || matched?.username || "").trim()
    return { id: String(matched._id), name: displayName || channelKeyword.trim() }
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

  private async generateAmbiguityQuestionWithAi(
    question: string,
    options: Array<{ index: number; code?: string; name?: string }>
  ) {
    if (!Array.isArray(options) || !options.length) return null
    const optionLines = options
      .map((o) => {
        const code = o.code ? ` (mã: ${o.code})` : ""
        const name = o.name || "Không rõ tên"
        return `${o.index}. ${name}${code}`
      })
      .join("\n")
    const fallback =
      "Có nhiều kết quả phù hợp. Bạn muốn AI trả lời theo kết quả nào?\n" +
      optionLines
    const systemPrompt =
      "Bạn là trợ lý viết câu hỏi làm rõ. " +
      "Viết 1 tin nhắn tiếng Việt tự nhiên, có dấu, ngắn gọn để người dùng chọn 1 kết quả. " +
      "Giữ nguyên danh sách lựa chọn, không đổi số thứ tự, không thêm lựa chọn mới."
    const userPrompt =
      `Câu hỏi người dùng: ${question}\n` +
      `Danh sách lựa chọn:\n${optionLines}\n` +
      "Trả về đúng nội dung tin nhắn để gửi người dùng."
    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const content = String(raw || "").trim()
      if (!content) return fallback
      const hasNumberedOption = /^\s*1\.\s+/m.test(content)
      if (!hasNumberedOption) return fallback
      return content
    } catch {
      return fallback
    }
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
      const pendingOptions = conversation.pendingSelection.options
      const baseQuestion = this.getPendingSelectionBaseQuestion(conversation)
      const shouldKeepStorageContext = this.shouldKeepStorageContextForSelection(
        baseQuestion
      )
      const selectAllSignal =
        /(ca\\s*2|ca\\s*hai|ca\\s*2\\s*san\\s*pham|ca\\s*hai\\s*san\\s*pham|tat\\s*ca|all\\s*(items|products)?|all)$/i.test(
          normalized
        )
      if (selectAllSignal && shouldKeepStorageContext) {
        if (conversation?._id) {
          this.aiConversationModel.updateOne(
            { _id: conversation._id },
            { $unset: { pendingSelection: "" } }
          )
        }
        return {
          question: this.buildStorageSelectionQuestion(baseQuestion, pendingOptions)
        }
      }
      const option = Number.isFinite(choiceIndex)
        ? pendingOptions.find((o) => o.index === choiceIndex)
        : undefined
      if (option?.code || option?.name) {
        const code = option?.code?.toUpperCase()
        if (conversation?._id) {
          this.aiConversationModel.updateOne(
            { _id: conversation._id },
            { $unset: { pendingSelection: "" } }
          )
        }
        if (shouldKeepStorageContext) {
          return {
            question: this.buildStorageSelectionQuestion(baseQuestion, [option])
          }
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
      const codeMatch = pendingOptions.find(
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
        if (shouldKeepStorageContext) {
          return {
            question: this.buildStorageSelectionQuestion(baseQuestion, [codeMatch])
          }
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

      const nameMatch = pendingOptions.find(
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
        if (shouldKeepStorageContext) {
          return {
            question: this.buildStorageSelectionQuestion(baseQuestion, [nameMatch])
          }
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

  private getPendingSelectionBaseQuestion(conversation: AiConversation | null) {
    const messages = conversation?.messages || []
    const users = [...messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .map((m) => String(m.content).trim())
    for (const q of users) {
      const normalized = this.normalizeStorageText(q)
      const isShortChoice =
        /^\d+$/.test(normalized) ||
        /(ket qua|chon|option|ca 2|ca hai|tat ca|all)/.test(normalized)
      if (!isShortChoice) return q
    }
    return users[0] || ""
  }

  private shouldKeepStorageContextForSelection(baseQuestion: string) {
    if (!baseQuestion) return false
    const normalized = this.normalizeStorageText(baseQuestion)
    if (this.isRestockForecastQuestion(baseQuestion)) return true
    if (this.isStorageCoverageDaysQuestion(baseQuestion)) return true
    if (this.isStorageMovementQuantityQuestion(baseQuestion)) return true
    return /(xuat|nhap|ton kho|het hang|sap het)/.test(normalized)
  }

  private buildStorageSelectionQuestion(
    baseQuestion: string,
    options: Array<{ index: number; code?: string; name?: string }>
  ) {
    const labels = options
      .map((o) => {
        const code = o.code ? String(o.code).toUpperCase() : ""
        const name = String(o.name || "").trim()
        if (name && code) return `${name} (mã ${code})`
        if (name) return name
        if (code) return `mã ${code}`
        return ""
      })
      .filter(Boolean)
    if (!labels.length) return baseQuestion
    const normalizedBase = this.normalizeStorageText(baseQuestion)
    const connector = labels.length > 1 ? " và " : ""
    const selectedLabel = labels.join(connector)
    if (/(cho (ma|mã|mat hang|mặt hàng|san pham|sản phẩm))/.test(normalizedBase)) {
      return `${baseQuestion} (${selectedLabel})`
    }
    return `${baseQuestion} cho ${selectedLabel}`
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
      /item\s*[:\-]?\s*([a-z0-9_-]+)/i
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

  private extractStorageLogStatus(
    question: string
  ): "received" | "delivered" | "returned" | null {
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

  private async tryBuildStorageMovementAnswer(question: string) {
    const isRestockForecastIntent = this.isRestockForecastQuestion(question)
    if (!this.isStorageMovementQuantityQuestion(question) && !isRestockForecastIntent) {
      return null
    }
    if (
      this.hasExplicitStorageItemScope(question) &&
      this.extractStorageItemLookup(question) &&
      !isRestockForecastIntent
    ) {
      return null
    }
    const aiQuery = await this.inferStorageMovementQueryWithAi(question)
    console.info("[ai][storage] aiQuery", aiQuery)
    const taskType = this.resolveStorageTaskType(question, aiQuery?.taskType || null)
    const resolvedDateRange =
      aiQuery?.dateRange || (await this.resolveStorageMovementDateRange(question))
    const dateRange =
      resolvedDateRange ||
      (!this.hasUserProvidedTimeSignal(question)
        ? this.getDefaultRecentTwoWeeksDateRange()
        : null)
    if (!dateRange) {
      return "Mình chưa xác định được khoảng ngày phù hợp từ câu hỏi. Vui lòng cung cấp ngày hoặc khoảng ngày cụ thể."
    }
    if (!resolvedDateRange && dateRange) {
      console.info("[ai][storage] applied_default_date_range_14_days", {
        start: dateRange.start,
        end: dateRange.end
      })
    }
    const apiDateRange = this.normalizeStorageMovementDateRange(dateRange)

    const askedDateLabel =
      this.extractQuestionDateLabel(question) ||
      this.formatDateRangeLabel(dateRange.start, dateRange.end)
    const isCoverageDaysIntent = taskType === "coverage_days"
    const aiStatus = aiQuery?.status
    const answerScope = aiQuery?.answerScope || "all_items"
    const status =
      aiStatus && aiStatus !== "both"
        ? aiStatus
        : this.extractStorageLogStatus(question)
    const effectiveStatus = isCoverageDaysIntent
      ? ("delivered" as const)
      : status
    const hasDelivered = /(xuat kho|xuat|delivered)/.test(
      question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    )
    const hasReceived = /(nhap kho|nhap|received)/.test(
      question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    )
    const wantsBoth =
      aiStatus === "both" ||
      (!aiStatus && (!status || (hasDelivered && hasReceived)))
    const wantsTotal =
      typeof aiQuery?.wantsTotal === "boolean"
        ? aiQuery.wantsTotal
        : this.isTotalQuantityIntent(question)
    const explicitTotalIntent = this.isTotalQuantityIntent(question)
    let itemHints =
      aiQuery?.itemHints?.length
        ? aiQuery.itemHints
        : (() => {
            const fallback = this.extractStorageMovementItemHint(question)
            return fallback ? [fallback] : []
          })()
    let hasItemScope = answerScope !== "all_items" || itemHints.length > 0
    const hasExplicitItemCode = this.hasExplicitItemCodeLookup(question)
    const hasMeaningfulItemHints = this.hasMeaningfulCoverageItemHints(itemHints)
    if (isCoverageDaysIntent && !hasExplicitItemCode && !hasMeaningfulItemHints) {
      itemHints = []
      hasItemScope = false
      console.info("[ai][storage] force_all_codes_coverage_no_code_specified")
    }
    if (isCoverageDaysIntent && this.shouldUseAllItemsCoverageScope(question, itemHints)) {
      itemHints = []
      hasItemScope = false
      console.info("[ai][storage] force_all_items_coverage_scope")
    }
    const forceItemizedAllItems = !hasItemScope && !explicitTotalIntent
    const taskPlan = await this.planStorageMovementTasksWithAi(question, {
      taskType,
      status: effectiveStatus,
      wantsBoth: isCoverageDaysIntent ? false : wantsBoth,
      hasItemScope
    })
    console.info("[ai][storage] taskPlan", {
      taskPlan,
      taskType,
      status: effectiveStatus,
      wantsBoth: isCoverageDaysIntent ? false : wantsBoth,
      hasItemScope,
      itemHints
    })
    const taskExecution = await this.executeStorageMovementTasks(taskPlan, {
      dateRange,
      apiDateRange,
      status: effectiveStatus,
      itemHints,
      hasItemScope
    })
    console.info("[ai][storage] taskExecution", {
      statusLogs: taskExecution.statusLogs?.length || 0,
      receivedLogs: taskExecution.receivedLogs?.length || 0,
      deliveredLogs: taskExecution.deliveredLogs?.length || 0,
      statusByItem: taskExecution.statusByItem?.length || 0,
      receivedByItem: taskExecution.receivedByItem?.length || 0,
      deliveredByItem: taskExecution.deliveredByItem?.length || 0,
      remainingQty: taskExecution.remainingQty,
      hasCoverageAnswer: Boolean(taskExecution.coverageAnswer)
    })

    const countQuantity = (logs: any[]) =>
      (logs || []).reduce((sum: number, log: any) => {
        const many = Array.isArray(log?.items)
          ? log.items.reduce(
              (acc: number, item: any) => acc + Number(item?.quantity || 0),
              0
            )
          : 0
        const one = many > 0 ? 0 : Number(log?.item?.quantity || 0)
        return sum + one + many
      }, 0)

    if (isCoverageDaysIntent) {
      const deliveredLogs =
        taskExecution.deliveredLogs ||
        (await this.fetchStorageLogsViaApi(
          apiDateRange.start,
          apiDateRange.end,
          "delivered"
        ))
      const byItem =
        taskExecution.deliveredByItem ||
        (await this.aggregateStorageLogsByItem(deliveredLogs))
      const filteredByItem = this.filterStorageRowsByItemHints(byItem, itemHints)
      const deliveredQty = hasItemScope
        ? filteredByItem.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
        : countQuantity(deliveredLogs)
      const daysInRange =
        Math.floor((dateRange.end.getTime() - dateRange.start.getTime()) / 86400000) + 1
      const dailyAvg = daysInRange > 0 ? deliveredQty / daysInRange : 0
      if (!hasItemScope) {
        const perItemCoverage = await this.estimateCoverageDaysByItem(
          byItem,
          daysInRange
        )
        if (!perItemCoverage.length) {
          return `Không đủ dữ liệu xuất kho ${askedDateLabel ? `(${askedDateLabel})` : ""} để ước tính số ngày còn đủ hàng theo từng mã.`
        }
        return [
          `Ước tính số ngày còn đủ hàng theo từng mã (${askedDateLabel}):`,
          ...perItemCoverage.map(
            (row) =>
              `- ${row.code || ""}${row.code ? " - " : ""}${row.name}: còn ${row.remainingQty.toLocaleString(
                "vi-VN"
              )}, TB xuất/ngày ${row.dailyAvg.toLocaleString("vi-VN", {
                maximumFractionDigits: 2
              })}, đủ khoảng ${row.coverageDays.toLocaleString("vi-VN", {
                maximumFractionDigits: 1
              })} ngày, ${this.buildRestockEtaLabel(row.coverageDays)}`
          )
        ].join("\n")
      }
      const remainingQty =
        taskExecution.remainingQty ??
        (await this.sumRestQuantityByItemHints(itemHints))

      if (deliveredQty <= 0 || dailyAvg <= 0) {
        return `Không đủ dữ liệu xuất kho ${askedDateLabel ? `(${askedDateLabel})` : ""} để ước tính số ngày còn đủ hàng.`
      }
      const coverageDays = remainingQty / dailyAvg
      const scopeLabel = hasItemScope
        ? `cho nhóm mặt hàng phù hợp "${itemHints.join(", ")}"`
        : "cho toàn bộ hàng hóa"
      return [
        `Ước tính số ngày còn đủ hàng ${scopeLabel}:`,
        `- Khoảng tham chiếu xuất kho: ${askedDateLabel}`,
        `- Tổng lượng xuất trong kỳ: ${deliveredQty.toLocaleString("vi-VN")}`,
        `- Trung bình/ngày: ${dailyAvg.toLocaleString("vi-VN", {
          maximumFractionDigits: 2
        })}`,
        `- Lượng tồn hiện tại: ${remainingQty.toLocaleString("vi-VN")}`,
        `- Số ngày còn đủ hàng: ${coverageDays.toLocaleString("vi-VN", {
          maximumFractionDigits: 1
        })} ngày`,
        `- Dự kiến cần nhập thêm: ${this.buildRestockEtaLabel(coverageDays)}`
      ].join("\n")
    }

    if (!wantsBoth && effectiveStatus) {
      const logs =
        taskExecution.statusLogs ||
        (await this.fetchStorageLogsViaApi(
          apiDateRange.start,
          apiDateRange.end,
          effectiveStatus
        ))
      if (!logs.length) {
        const statusLabel =
          effectiveStatus === "received"
            ? "nhập kho"
            : effectiveStatus === "delivered"
              ? "xuất kho"
              : "trả hàng"
        return `Không có dữ liệu ${statusLabel} ${askedDateLabel ? `(${askedDateLabel})` : ""}.`
      }
      const totalQuantity = countQuantity(logs)
      const statusLabel =
        effectiveStatus === "received"
          ? "nhập kho"
          : effectiveStatus === "delivered"
            ? "xuất kho"
            : "trả hàng"
      const byItem =
        taskExecution.statusByItem || (await this.aggregateStorageLogsByItem(logs))
      const filteredByItem = this.filterStorageRowsByItemHints(byItem, itemHints)
      if (wantsTotal && !forceItemizedAllItems) {
        if (hasItemScope) {
          const scopedTotal = filteredByItem.reduce(
            (sum, row) => sum + Number(row.quantity || 0),
            0
          )
          if (!filteredByItem.length) {
            const hintLabel = itemHints.join(", ")
            return `Không có dữ liệu ${statusLabel} cho mặt hàng phù hợp "${hintLabel}" ${askedDateLabel ? `(${askedDateLabel})` : ""}.`
          }
          return `Tổng số lượng ${statusLabel} của mặt hàng phù hợp ${askedDateLabel ? `(${askedDateLabel}) ` : ""}là ${scopedTotal.toLocaleString("vi-VN")}.`
        }
        return `Tổng số lượng ${statusLabel} ${askedDateLabel ? `(${askedDateLabel}) ` : ""}là ${totalQuantity.toLocaleString("vi-VN")}.`
      }
      if (!filteredByItem.length) {
        if (hasItemScope) {
          const hintLabel = itemHints.join(", ")
          return `Không có dữ liệu ${statusLabel} cho mặt hàng phù hợp "${hintLabel}" ${askedDateLabel ? `(${askedDateLabel})` : ""}.`
        }
        return `Không có dữ liệu ${statusLabel} theo mặt hàng ${askedDateLabel ? `(${askedDateLabel})` : ""}.`
      }
      return [
        `Chi tiết số lượng ${statusLabel} theo mặt hàng ${askedDateLabel ? `(${askedDateLabel})` : ""}:`,
        ...filteredByItem.map(
          (row) =>
            `- ${row.code || ""}${row.code ? " - " : ""}${row.name}: ${row.quantity.toLocaleString("vi-VN")}`
        )
      ].join("\n")
    }

    const [receivedLogs, deliveredLogs] = await Promise.all([
      taskExecution.receivedLogs
        ? Promise.resolve(taskExecution.receivedLogs)
        : this.fetchStorageLogsViaApi(apiDateRange.start, apiDateRange.end, "received"),
      taskExecution.deliveredLogs
        ? Promise.resolve(taskExecution.deliveredLogs)
        : this.fetchStorageLogsViaApi(apiDateRange.start, apiDateRange.end, "delivered")
    ])
    const receivedQty = countQuantity(receivedLogs)
    const deliveredQty = countQuantity(deliveredLogs)
    if (wantsTotal) {
      return [
        `Số lượng nhập/xuất ${askedDateLabel ? `(${askedDateLabel})` : ""}:`,
        `- Nhập kho: ${receivedQty.toLocaleString("vi-VN")}`,
        `- Xuất kho: ${deliveredQty.toLocaleString("vi-VN")}`
      ].join("\n")
    }
    const [receivedByItem, deliveredByItem] = await Promise.all([
      taskExecution.receivedByItem
        ? Promise.resolve(taskExecution.receivedByItem)
        : this.aggregateStorageLogsByItem(receivedLogs),
      taskExecution.deliveredByItem
        ? Promise.resolve(taskExecution.deliveredByItem)
        : this.aggregateStorageLogsByItem(deliveredLogs)
    ])
    const filteredReceivedByItem = this.filterStorageRowsByItemHints(
      receivedByItem,
      itemHints
    )
    const filteredDeliveredByItem = this.filterStorageRowsByItemHints(
      deliveredByItem,
      itemHints
    )
    if (hasItemScope && !filteredReceivedByItem.length && !filteredDeliveredByItem.length) {
      const hintLabel = itemHints.join(", ")
      return `Không có dữ liệu nhập/xuất cho mặt hàng phù hợp "${hintLabel}" ${askedDateLabel ? `(${askedDateLabel})` : ""}.`
    }
    const lines: string[] = [
      `Chi tiết nhập/xuất theo mặt hàng ${askedDateLabel ? `(${askedDateLabel})` : ""}:`
    ]
    if (filteredReceivedByItem.length) {
      lines.push("- Nhập kho:")
      for (const row of filteredReceivedByItem) {
        lines.push(
          `- ${row.code || ""}${row.code ? " - " : ""}${row.name}: ${row.quantity.toLocaleString("vi-VN")}`
        )
      }
    } else {
      lines.push("- Nhập kho: không có dữ liệu.")
    }
    if (filteredDeliveredByItem.length) {
      lines.push("- Xuất kho:")
      for (const row of filteredDeliveredByItem) {
        lines.push(
          `- ${row.code || ""}${row.code ? " - " : ""}${row.name}: ${row.quantity.toLocaleString("vi-VN")}`
        )
      }
    } else {
      lines.push("- Xuất kho: không có dữ liệu.")
    }
    return lines.join("\n")
  }

  private async planStorageMovementTasksWithAi(
    question: string,
    context: {
      taskType: "quantity" | "coverage_days"
      status: "received" | "delivered" | "returned" | null
      wantsBoth: boolean
      hasItemScope: boolean
    }
  ): Promise<string[]> {
    const allowedTasks = [
      "fetch_status_logs",
      "fetch_received_logs",
      "fetch_delivered_logs",
      "aggregate_status_items",
      "aggregate_received_items",
      "aggregate_delivered_items",
      "fetch_remaining_quantities",
      "compute_coverage_days"
    ]
    const fallback = this.buildDefaultStorageMovementTaskPlan(context)
    const systemPrompt =
      "Ban la bo lap ke hoach task cho truy van kho. " +
      "Tra ve JSON: {\"tasks\":[...]} voi danh sach task tu tap cho phep. " +
      "Chi dung cac task can thiet, theo thu tu thuc thi. " +
      `Tap task hop le: ${allowedTasks.join(", ")}.`
    const userPrompt =
      `Cau hoi: ${question}\n` +
      `Ngu canh: ${JSON.stringify(context)}\n` +
      "Chi tra ve JSON."
    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      const tasks: string[] = Array.isArray(parsed?.tasks)
        ? parsed.tasks
            .map((t: any) => (typeof t === "string" ? t.trim() : ""))
            .filter((t: string) => allowedTasks.includes(t))
        : []
      if (!tasks.length) return fallback
      return this.normalizeStorageMovementTaskPlan(context, [...new Set(tasks)])
    } catch {
      return fallback
    }
  }

  private buildDefaultStorageMovementTaskPlan(context: {
    taskType: "quantity" | "coverage_days"
    status: "received" | "delivered" | "returned" | null
    wantsBoth: boolean
    hasItemScope: boolean
  }): string[] {
    if (context.taskType === "coverage_days") {
      const tasks = ["fetch_delivered_logs", "aggregate_delivered_items"]
      if (context.hasItemScope) tasks.push("fetch_remaining_quantities")
      tasks.push("compute_coverage_days")
      return tasks
    }
    if (!context.wantsBoth && context.status) {
      return ["fetch_status_logs", "aggregate_status_items"]
    }
    return [
      "fetch_received_logs",
      "fetch_delivered_logs",
      "aggregate_received_items",
      "aggregate_delivered_items"
    ]
  }

  private normalizeStorageMovementTaskPlan(
    context: {
      taskType: "quantity" | "coverage_days"
      status: "received" | "delivered" | "returned" | null
      wantsBoth: boolean
      hasItemScope: boolean
    },
    tasks: string[]
  ) {
    if (context.taskType !== "coverage_days") return tasks
    const cleaned = tasks.filter(
      (t) => t !== "fetch_received_logs" && t !== "aggregate_received_items"
    )
    if (!cleaned.includes("fetch_delivered_logs")) cleaned.unshift("fetch_delivered_logs")
    if (!cleaned.includes("aggregate_delivered_items")) {
      cleaned.push("aggregate_delivered_items")
    }
    if (context.hasItemScope && !cleaned.includes("fetch_remaining_quantities")) {
      cleaned.push("fetch_remaining_quantities")
    }
    if (!cleaned.includes("compute_coverage_days")) cleaned.push("compute_coverage_days")
    return cleaned
  }

  private async executeStorageMovementTasks(
    tasks: string[],
    input: {
      dateRange: { start: Date; end: Date }
      apiDateRange: { start: Date; end: Date }
      status: "received" | "delivered" | "returned" | null
      itemHints: string[]
      hasItemScope: boolean
    }
  ) {
    const state: {
      statusLogs?: any[]
      receivedLogs?: any[]
      deliveredLogs?: any[]
      statusByItem?: Array<{ code: string; name: string; quantity: number }>
      receivedByItem?: Array<{ code: string; name: string; quantity: number }>
      deliveredByItem?: Array<{ code: string; name: string; quantity: number }>
      remainingQty?: number
      coverageAnswer?: string
    } = {}
    const uniqueTasks = [...new Set(tasks)]
    const countQuantity = (logs: any[]) =>
      (logs || []).reduce((sum: number, log: any) => {
        const many = Array.isArray(log?.items)
          ? log.items.reduce(
              (acc: number, item: any) => acc + Number(item?.quantity || 0),
              0
            )
          : 0
        const one = many > 0 ? 0 : Number(log?.item?.quantity || 0)
        return sum + one + many
      }, 0)

    for (const task of uniqueTasks) {
      console.info("[ai][storage][task:start]", { task })
      if (task === "fetch_status_logs" && input.status) {
        state.statusLogs = await this.fetchStorageLogsViaApi(
          input.apiDateRange.start,
          input.apiDateRange.end,
          input.status
        )
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.statusLogs.length
        })
      }
      if (task === "fetch_received_logs") {
        state.receivedLogs = await this.fetchStorageLogsViaApi(
          input.apiDateRange.start,
          input.apiDateRange.end,
          "received"
        )
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.receivedLogs.length
        })
      }
      if (task === "fetch_delivered_logs") {
        state.deliveredLogs = await this.fetchStorageLogsViaApi(
          input.apiDateRange.start,
          input.apiDateRange.end,
          "delivered"
        )
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.deliveredLogs.length
        })
      }
      if (task === "aggregate_status_items" && state.statusLogs) {
        state.statusByItem = await this.aggregateStorageLogsByItem(state.statusLogs)
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.statusByItem.length
        })
      }
      if (task === "aggregate_received_items" && state.receivedLogs) {
        state.receivedByItem = await this.aggregateStorageLogsByItem(state.receivedLogs)
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.receivedByItem.length
        })
      }
      if (task === "aggregate_delivered_items" && state.deliveredLogs) {
        state.deliveredByItem = await this.aggregateStorageLogsByItem(state.deliveredLogs)
        console.info("[ai][storage][task:done]", {
          task,
          rows: state.deliveredByItem.length
        })
      }
      if (task === "fetch_remaining_quantities") {
        if (!input.hasItemScope) {
          console.info("[ai][storage][task:skip]", {
            task,
            reason: "all_items_scope_coverage"
          })
          continue
        }
        state.remainingQty = await this.sumRestQuantityByItemHints(
          input.hasItemScope ? input.itemHints : []
        )
        console.info("[ai][storage][task:done]", {
          task,
          remainingQty: state.remainingQty
        })
      }
      if (task === "compute_coverage_days") {
        const deliveredLogs = state.deliveredLogs || []
        const deliveredByItem =
          state.deliveredByItem || (await this.aggregateStorageLogsByItem(deliveredLogs))
        const filteredByItem = this.filterStorageRowsByItemHints(
          deliveredByItem,
          input.itemHints
        )
        const deliveredQty = input.hasItemScope
          ? filteredByItem.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
          : countQuantity(deliveredLogs)
        const daysInRange =
          Math.floor(
            (input.dateRange.end.getTime() - input.dateRange.start.getTime()) / 86400000
          ) + 1
        const dailyAvg = daysInRange > 0 ? deliveredQty / daysInRange : 0
        const remainingQty =
          typeof state.remainingQty === "number"
            ? state.remainingQty
            : await this.sumRestQuantityByItemHints(
                input.hasItemScope ? input.itemHints : []
              )
        if (deliveredQty > 0 && dailyAvg > 0) {
          const coverageDays = remainingQty / dailyAvg
          const dateLabel = this.formatDateRangeLabel(
            input.dateRange.start,
            input.dateRange.end
          )
          const scopeLabel = input.hasItemScope
            ? `cho nhóm mặt hàng phù hợp "${input.itemHints.join(", ")}"`
            : "cho toàn bộ hàng hóa"
          state.coverageAnswer = [
            `Ước tính số ngày còn đủ hàng ${scopeLabel}:`,
            `- Khoảng tham chiếu xuất kho: ${dateLabel}`,
            `- Tổng lượng xuất trong kỳ: ${deliveredQty.toLocaleString("vi-VN")}`,
            `- Trung bình/ngày: ${dailyAvg.toLocaleString("vi-VN", {
              maximumFractionDigits: 2
            })}`,
            `- Lượng tồn hiện tại: ${remainingQty.toLocaleString("vi-VN")}`,
            `- Số ngày còn đủ hàng: ${coverageDays.toLocaleString("vi-VN", {
              maximumFractionDigits: 1
            })} ngày`,
            `- Dự kiến cần nhập thêm: ${this.buildRestockEtaLabel(coverageDays)}`
          ].join("\n")
        }
        console.info("[ai][storage][task:done]", {
          task,
          deliveredQty,
          dailyAvg,
          remainingQty,
          hasCoverageAnswer: Boolean(state.coverageAnswer)
        })
      }
    }
    return state
  }

  private async inferStorageMovementQueryWithAi(question: string): Promise<{
    taskType: "quantity" | "coverage_days" | null
    status: "received" | "delivered" | "returned" | "both" | null
    wantsTotal: boolean | null
    answerScope: "single_item" | "multiple_items" | "all_items" | null
    itemHints: string[]
    dateRange: { start: Date; end: Date } | null
  } | null> {
    const now = new Date()
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getUTCDate()).padStart(2, "0")}`
    const systemPrompt =
      "Ban la bo phan trich xuat tham so cho truy van lich su kho. " +
      "Tra ve dung JSON: " +
      "{\"taskType\":\"quantity|coverage_days|unknown\",\"status\":\"received|delivered|returned|both|unknown\",\"wantsTotal\":true|false|null,\"answerScope\":\"single_item|multiple_items|all_items|unknown\",\"itemHints\":[\"...\"],\"start\":\"YYYY-MM-DD\"|null,\"end\":\"YYYY-MM-DD\"|null}. " +
      "BUOC 1 bat buoc: xac dinh taskType truoc tien. " +
      "Quy tac: " +
      "xuat kho => delivered, nhap kho => received, tra hang => returned. " +
      "Neu cau hoi khong ro trang thai thi status=both. " +
      "Neu co cum 'bao lau', 'bao nhieu ngay', 'khi nao', 'phai nhap them', 'sap het', 'het hang' thi uu tien taskType=coverage_days. " +
      "taskType=coverage_days khi cau hoi hoi ton con lai du xuat trong bao nhieu ngay dua tren luong xuat tham chieu. Nguoc lai taskType=quantity. " +
      "wantsTotal=true chi khi cau hoi co y ro rang ve tong (tu 'tong', 'tong so', 'tong cong', 'sum'). Neu chi la 'bao nhieu' thi de wantsTotal=false. " +
      "answerScope=single_item neu cau hoi 1 mat hang cu the, multiple_items neu nhieu mat hang cu the, all_items neu hoi tong quan hang hoa. " +
      "itemHints la danh sach ten mat hang (co the rong), bo cac tu chuc nang nhu co, duoc, trong, thang, tuan, bao nhieu. " +
      "\"thang nay\" => start la ngay 01 thang hien tai, end la hom nay. " +
      "\"thang truoc\" => start ngay 01 thang truoc, end ngay cuoi thang truoc. " +
      "\"thang N\" => toan bo thang N gan nhat trong qua khu. " +
      "\"thang N/YYYY\" => toan bo thang do. " +
      "\"tuan nay\" => tu thu Hai tuan nay den hom nay. " +
      "\"tuan truoc\" => tu thu Hai den Chu Nhat tuan truoc."
    const userPrompt =
      `Hom nay (UTC): ${today}\n` +
      `Cau hoi: ${question}\n` +
      "Chi tra ve JSON."

    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      if (!parsed || typeof parsed !== "object") return null
      const taskTypeRaw =
        typeof parsed.taskType === "string" ? parsed.taskType.toLowerCase() : ""
      const taskType =
        taskTypeRaw === "quantity" || taskTypeRaw === "coverage_days"
          ? (taskTypeRaw as "quantity" | "coverage_days")
          : null
      const statusRaw =
        typeof parsed.status === "string" ? parsed.status.toLowerCase() : ""
      const status =
        statusRaw === "received" ||
        statusRaw === "delivered" ||
        statusRaw === "returned" ||
        statusRaw === "both"
          ? (statusRaw as "received" | "delivered" | "returned" | "both")
          : null
      const answerScopeRaw =
        typeof parsed.answerScope === "string"
          ? parsed.answerScope.toLowerCase()
          : ""
      const answerScope =
        answerScopeRaw === "single_item" ||
        answerScopeRaw === "multiple_items" ||
        answerScopeRaw === "all_items"
          ? (answerScopeRaw as "single_item" | "multiple_items" | "all_items")
          : null
      const wantsTotal =
        typeof parsed.wantsTotal === "boolean" ? parsed.wantsTotal : null
      const itemHintsRaw = Array.isArray(parsed.itemHints)
        ? parsed.itemHints
            .map((v: any) => (typeof v === "string" ? v.trim() : ""))
            .filter((v: string) => v.length >= 2)
        : []
      const itemHints = this.sanitizeStorageMovementItemHints(
        question,
        answerScope,
        itemHintsRaw
      )

      const startRaw = typeof parsed.start === "string" ? parsed.start : ""
      const endRaw = typeof parsed.end === "string" ? parsed.end : ""
      const startMatch = startRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const endMatch = endRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      let dateRange: { start: Date; end: Date } | null = null
      if (startMatch && endMatch) {
        const start = new Date(
          Date.UTC(
            Number(startMatch[1]),
            Number(startMatch[2]) - 1,
            Number(startMatch[3]),
            0,
            0,
            0,
            0
          )
        )
        const end = new Date(
          Date.UTC(
            Number(endMatch[1]),
            Number(endMatch[2]) - 1,
            Number(endMatch[3]),
            23,
            59,
            59,
            999
          )
        )
        if (
          !Number.isNaN(start.getTime()) &&
          !Number.isNaN(end.getTime()) &&
          start.getTime() <= end.getTime()
        ) {
          dateRange = { start, end }
        }
      }

      return { taskType, status, wantsTotal, answerScope, itemHints, dateRange }
    } catch {
      return null
    }
  }

  private extractStorageMovementDateRange(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const now = new Date()
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    )
    if (/(hom nay|today)/.test(normalized)) {
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    }
    if (/(hom qua|yesterday)/.test(normalized)) {
      const start = new Date(today)
      start.setUTCDate(start.getUTCDate() - 1)
      return {
        start,
        end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    }
    if (/(ngay mai|tomorrow)/.test(normalized)) {
      const start = new Date(today)
      start.setUTCDate(start.getUTCDate() + 1)
      return {
        start,
        end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    }
    const monthRange = this.extractMonthRangeFromQuestion(normalized, now)
    if (monthRange) return monthRange
    const relativeDay = this.extractNearestRelativeDayRange(normalized, now)
    if (relativeDay) return relativeDay
    return this.extractDateRange(question)
  }

  private extractNearestRelativeDayRange(normalized: string, now: Date) {
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
    )

    const dayInMonthMatch = normalized.match(
      /(?:^|\s)ngay\s*(\d{1,2})\s+thang\s*(nay|truoc)\b/
    )
    if (dayInMonthMatch) {
      const day = Number(dayInMonthMatch[1])
      const fromPreviousMonth = dayInMonthMatch[2] === "truoc"
      const resolved = this.resolveNearestPastDayByMonthScope(
        day,
        today,
        fromPreviousMonth ? 1 : 0
      )
      if (resolved) {
        return {
          start: resolved,
          end: new Date(resolved.getTime() + 24 * 60 * 60 * 1000 - 1)
        }
      }
    }

    const hasThisWeek = /(tuan nay|this week)/.test(normalized)
    const hasLastWeek = /(tuan truoc|last week)/.test(normalized)
    const weekday = this.extractWeekdayInQuestion(normalized)
    if ((hasThisWeek || hasLastWeek) && weekday !== null) {
      const resolved = this.resolveNearestDayByWeekScope(
        today,
        weekday,
        hasLastWeek ? "last" : "this"
      )
      return {
        start: resolved,
        end: new Date(resolved.getTime() + 24 * 60 * 60 * 1000 - 1)
      }
    }
    return null
  }

  private async resolveStorageMovementDateRange(question: string) {
    const regexRange = this.extractStorageMovementDateRange(question)
    if (regexRange && !this.shouldFallbackToAiForDateRange(question, regexRange)) {
      return regexRange
    }

    const aiRange = await this.inferStorageMovementDateRangeWithAi(question)
    if (aiRange) return aiRange
    return regexRange
  }

  private shouldFallbackToAiForDateRange(
    question: string,
    regexRange: { start: Date; end: Date }
  ) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasBroadTimeSignal =
      /(thang nay|thang truoc|tuan nay|tuan truoc|this month|last month|this week|last week)/.test(
        normalized
      )
    if (!hasBroadTimeSignal) return false
    if (this.hasSpecificDateSignal(normalized)) return false

    const sameDay =
      regexRange.start.getUTCFullYear() === regexRange.end.getUTCFullYear() &&
      regexRange.start.getUTCMonth() === regexRange.end.getUTCMonth() &&
      regexRange.start.getUTCDate() === regexRange.end.getUTCDate()
    return sameDay
  }

  private hasSpecificDateSignal(normalizedQuestion: string) {
    if (/(hom nay|hom qua|ngay mai|today|yesterday|tomorrow)/.test(normalizedQuestion)) {
      return true
    }
    if (/\d{1,2}\/\d{1,2}(?:\/\d{4})?/.test(normalizedQuestion)) return true
    if (/(?:thang|month)\s*\d{1,2}(?:\s*\/\s*\d{4})?/.test(normalizedQuestion)) {
      return true
    }
    if (/(?:^|\s)ngay\s+\d{1,2}\b/.test(normalizedQuestion)) return true
    if (
      /(thu\s*(?:2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)|chu nhat|cn)\s*(?:cua\s*)?(tuan nay|tuan truoc|this week|last week)/.test(
        normalizedQuestion
      )
    ) {
      return true
    }
    return false
  }

  private async inferStorageMovementDateRangeWithAi(question: string) {
    const now = new Date()
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getUTCDate()).padStart(2, "0")}`
    const systemPrompt =
      "Ban la bo phan suy luan khoang ngay cho cau hoi kho. " +
      "Tra ve dung JSON: {\"start\":\"YYYY-MM-DD\",\"end\":\"YYYY-MM-DD\",\"confidence\":0-1}. " +
      "Neu khong suy ra duoc thi tra ve {\"start\":null,\"end\":null,\"confidence\":0}. " +
      "Quy tac uu tien: " +
      "\"thang nay\" => tu ngay 01 thang hien tai den hom nay; " +
      "\"thang truoc\" => tu ngay 01 den ngay cuoi thang truoc; " +
      "\"thang N\" => toan bo thang N gan nhat trong qua khu; " +
      "\"thang N/YYYY\" => toan bo thang do; " +
      "\"tuan nay\" => tu thu Hai tuan nay den hom nay; " +
      "\"tuan truoc\" => tu thu Hai den Chu Nhat tuan truoc."
    const userPrompt =
      `Hom nay (UTC): ${today}\n` +
      `Cau hoi: ${question}\n` +
      "Chi tra ve JSON."

    try {
      const raw = await this.callOpenAi(systemPrompt, userPrompt, [])
      const parsed = this.safeParseRoute(raw)
      const startRaw = typeof parsed?.start === "string" ? parsed.start : ""
      const endRaw = typeof parsed?.end === "string" ? parsed.end : ""
      const startMatch = startRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const endMatch = endRaw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (!startMatch || !endMatch) return null

      const start = new Date(
        Date.UTC(
          Number(startMatch[1]),
          Number(startMatch[2]) - 1,
          Number(startMatch[3]),
          0,
          0,
          0,
          0
        )
      )
      const end = new Date(
        Date.UTC(
          Number(endMatch[1]),
          Number(endMatch[2]) - 1,
          Number(endMatch[3]),
          23,
          59,
          59,
          999
        )
      )
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
      if (start.getTime() > end.getTime()) return null
      return { start, end }
    } catch {
      return null
    }
  }

  private extractMonthRangeFromQuestion(normalizedQuestion: string, now: Date) {
    const monthYearMatch = normalizedQuestion.match(
      /(?:thang|month)\s*(\d{1,2})\s*\/\s*(\d{4})/
    )
    if (monthYearMatch) {
      const month = Number(monthYearMatch[1])
      const year = Number(monthYearMatch[2])
      if (month >= 1 && month <= 12 && Number.isFinite(year)) {
        return this.buildMonthRange(month, year, now)
      }
    }

    const monthOnlyMatch = normalizedQuestion.match(/(?:thang|month)\s*(\d{1,2})\b/)
    if (monthOnlyMatch) {
      const month = Number(monthOnlyMatch[1])
      if (month >= 1 && month <= 12) {
        const nowYear = now.getUTCFullYear()
        const nowMonth = now.getUTCMonth() + 1
        const inferredYear = month <= nowMonth ? nowYear : nowYear - 1
        return this.buildMonthRange(month, inferredYear, now)
      }
    }
    return null
  }

  private buildMonthRange(month: number, year: number, now: Date) {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    let end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
    const isCurrentMonth =
      year === now.getUTCFullYear() && month === now.getUTCMonth() + 1
    if (isCurrentMonth) {
      end = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999
        )
      )
    }
    return { start, end }
  }

  private normalizeStorageMovementDateRange(dateRange: { start: Date; end: Date }) {
    const start = new Date(
      Date.UTC(
        dateRange.start.getUTCFullYear(),
        dateRange.start.getUTCMonth(),
        dateRange.start.getUTCDate() - 1,
        17,
        0,
        0,
        0
      )
    )
    const end = new Date(
      Date.UTC(
        dateRange.end.getUTCFullYear(),
        dateRange.end.getUTCMonth(),
        dateRange.end.getUTCDate(),
        16,
        59,
        59,
        999
      )
    )
    return { start, end }
  }

  private isStorageMovementQuantityQuestion(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    const hasMoveKeywords = /(xuat kho|nhap kho|xuat|nhap|delivered|received)/.test(
      normalized
    )
    const hasQuantitySignal = /(so luong|bao nhieu|tong|tong so|so hang|bao lau|bao nhieu ngay)/.test(
      normalized
    )
    return hasMoveKeywords && hasQuantitySignal
  }

  private hasExplicitStorageItemScope(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /(ma hang|ma mat hang|mat hang|item|sku|code)/.test(normalized)
  }

  private extractStorageMovementItemHint(question: string) {
    const normalized = this.normalizeStorageText(question)
      .replace(/\d{1,2}\/\d{1,2}(?:\/\d{4})?/g, " ")
      .replace(/(?:^|\s)ngay\s+\d{1,2}(?!\s*\/)/g, " ")
      .replace(/\bngay\b/g, " ")
      .replace(/\b(?:thang|month)\s*\d{1,2}(?:\s*\/\s*\d{4})?\b/g, " ")
      .replace(/\b(thang|tuan)\s+(nay|truoc)\b/g, " ")
      .replace(
        /\b(tu ngay|den ngay|khoang thoi gian|trong ngay|hom nay|hom qua|ngay mai|today|yesterday|tomorrow|this week|last week|this month|last month|xuat kho|nhap kho|xuat ra|xuat|nhap|received|delivered|so luong|luong|bao nhieu|la bao nhieu|nhu nao|nhu the nao|tong|tong so|tong cong|hang|mat hang|item|sku|code|cua|trong|tu|den|hoi|cho|voi|va|co|duoc|ra)\b/g,
        " "
      )
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!normalized) return null
    if (normalized.length < 2) return null
    return normalized
  }

  private filterStorageRowsByItemHint(
    rows: Array<{ code: string; name: string; quantity: number }>,
    hint: string | null
  ) {
    if (!hint) return rows
    const tokens = hint
      .split(/\s+/)
      .map((t) => this.normalizeStorageText(t.trim()))
      .filter((t) => t.length >= 2)
    if (!tokens.length) return rows
    return rows.filter((row) => {
      const haystack = this.normalizeStorageText(`${row.code || ""} ${row.name || ""}`)
      return tokens.every((token) => haystack.includes(token))
    })
  }

  private filterStorageRowsByItemHints(
    rows: Array<{ code: string; name: string; quantity: number }>,
    hints: string[]
  ) {
    if (!hints.length) return rows
    const groups = hints
      .map((hint) =>
        hint
          .split(/\s+/)
          .map((t) => this.normalizeStorageText(t.trim()))
          .filter((t) => t.length >= 2)
      )
      .filter((tokens) => tokens.length)
    if (!groups.length) return rows
    return rows.filter((row) => {
      const haystack = this.normalizeStorageText(`${row.code || ""} ${row.name || ""}`)
      return groups.some((tokens) => tokens.every((token) => haystack.includes(token)))
    })
  }

  private sanitizeStorageMovementItemHints(
    question: string,
    answerScope: "single_item" | "multiple_items" | "all_items" | null,
    hints: string[]
  ) {
    const normalizedQuestion = this.normalizeStorageText(question)
    const hasAllItemsSignal = /(hang hoa|tat ca|toan bo|all items|all products)/.test(
      normalizedQuestion
    )
    if (answerScope === "all_items" || hasAllItemsSignal) return []

    const stopwords = new Set([
      "co",
      "duoc",
      "ra",
      "hang",
      "hoa",
      "hang hoa",
      "xuat",
      "nhap",
      "kho",
      "so",
      "luong",
      "bao",
      "nhieu",
      "trong",
      "thang",
      "tuan",
      "ngay",
      "nay",
      "truoc",
      "se",
      "con",
      "lai",
      "du",
      "de",
      "nua"
    ])
    const cleaned = hints
      .map((hint) =>
        this.normalizeStorageText(hint)
          .replace(/\b(?:thang|month)\s*\d{1,2}(?:\s*\/\s*\d{4})?\b/g, " ")
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .map((hint) =>
        hint
          .split(/\s+/)
          .filter((token) => token.length >= 2 && !stopwords.has(token))
          .join(" ")
          .trim()
      )
      .filter((hint) => hint.length >= 3)
    return [...new Set(cleaned)]
  }

  private isStorageCoverageDaysQuestion(question: string) {
    const normalized = this.normalizeStorageText(question)
    const hasCoverageSignal =
      /(bao nhieu ngay|du .*ngay|con du|du de xuat|so ngay)/.test(normalized) &&
      /(con lai|ton|ton kho|luong hang con)/.test(normalized)
    const hasDeliveredSignal =
      /(xuat kho|xuat|delivered)/.test(normalized) ||
      /(bao lau|khi nao|phai nhap them|sap het|het hang)/.test(normalized)
    return hasCoverageSignal && hasDeliveredSignal
  }

  private isRestockForecastQuestion(question: string) {
    const normalized = this.normalizeStorageText(question)
    const hasRestockSignal = /(phai nhap them|nhap them hang|khi nao nhap|bao lau.*nhap)/.test(
      normalized
    )
    return hasRestockSignal
  }

  private resolveStorageTaskType(
    question: string,
    aiTaskType: "quantity" | "coverage_days" | null
  ) {
    if (this.isRestockForecastQuestion(question) || this.isStorageCoverageDaysQuestion(question)) {
      return "coverage_days" as const
    }
    if (aiTaskType === "coverage_days" || aiTaskType === "quantity") {
      return aiTaskType
    }
    return "quantity" as const
  }

  private shouldUseAllItemsCoverageScope(question: string, itemHints: string[]) {
    const normalized = this.normalizeStorageText(question)
    const hasGenericAllSignal =
      /(hang hoa|luong hang|hang con lai|toan bo|tat ca|all items|all products)/.test(
        normalized
      )
    const hasExplicitItemSignal = /(mat hang|san pham|sku|ma hang|item|code)/.test(
      normalized
    )
    const hasWeakHints =
      !itemHints.length || itemHints.every((hint) => hint.split(/\s+/).length <= 1)
    return hasGenericAllSignal && !hasExplicitItemSignal && hasWeakHints
  }

  private hasExplicitItemCodeLookup(question: string) {
    const lookup = this.extractStorageItemLookup(question)
    return Boolean(lookup && lookup.type === "code" && String(lookup.value || "").trim())
  }

  private hasMeaningfulCoverageItemHints(itemHints: string[]) {
    if (!Array.isArray(itemHints) || !itemHints.length) return false
    return itemHints.some((hint) => {
      const tokens = this.normalizeStorageText(hint)
        .split(/\s+/)
        .filter((t) => t && t.length >= 2)
      return tokens.length >= 2
    })
  }

  private async sumRestQuantityByItemHints(itemHints: string[]) {
    const docs = await this.storageItemModel
      .find({}, { code: 1, name: 1, restQuantity: 1 })
      .lean()
      .exec()
    const rows = (docs as any[]).map((doc) => ({
      code: String(doc?.code || ""),
      name: String(doc?.name || ""),
      quantity: Number(doc?.restQuantity?.quantity || 0)
    }))
    const filtered = this.filterStorageRowsByItemHints(rows, itemHints)
    const totalFiltered = filtered.reduce((sum, row) => sum + Number(row.quantity || 0), 0)
    console.info("[ai][storage][remaining]", {
      hints: itemHints,
      docsCount: rows.length,
      filteredCount: filtered.length,
      totalFiltered
    })
    if (itemHints.length > 0 && filtered.length === 0) return 0
    return totalFiltered
  }

  private async estimateCoverageDaysByItem(
    deliveredByItem: Array<{ code: string; name: string; quantity: number }>,
    daysInRange: number
  ) {
    if (!daysInRange || daysInRange <= 0) return []
    const docs = await this.storageItemModel
      .find({}, { code: 1, name: 1, restQuantity: 1 })
      .lean()
      .exec()
    const restMap = new Map<string, number>()
    for (const doc of docs as any[]) {
      const key = this.normalizeStorageText(`${doc?.code || ""}|${doc?.name || ""}`)
      restMap.set(key, Number(doc?.restQuantity?.quantity || 0))
    }
    const topDelivered = [...(deliveredByItem || [])]
      .filter((row) => Number(row?.quantity || 0) > 0)
      .sort((a, b) => Number(b?.quantity || 0) - Number(a?.quantity || 0))
      .slice(0, 15)
    console.info("[ai][storage][coverage] top_delivered_items", {
      totalItems: (deliveredByItem || []).length,
      selectedTop: topDelivered.length
    })
    return topDelivered
      .map((row) => {
        const deliveredQty = Number(row?.quantity || 0)
        const dailyAvg = deliveredQty / daysInRange
        const key = this.normalizeStorageText(`${row?.code || ""}|${row?.name || ""}`)
        const remainingQty = Number(restMap.get(key) || 0)
        const coverageDays =
          deliveredQty > 0 && dailyAvg > 0 ? remainingQty / dailyAvg : 0
        return {
          code: String(row?.code || ""),
          name: String(row?.name || ""),
          deliveredQty,
          dailyAvg,
          remainingQty,
          coverageDays
        }
      })
      .filter((row) => row.deliveredQty > 0)
  }

  private normalizeStorageText(value: string) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
  }

  private buildRestockEtaLabel(coverageDays: number) {
    if (!Number.isFinite(coverageDays) || coverageDays <= 0) {
      return "cần nhập ngay"
    }
    const today = new Date()
    const daysToAdd = Math.ceil(coverageDays)
    const eta = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    )
    eta.setUTCDate(eta.getUTCDate() + daysToAdd)
    const dd = String(eta.getUTCDate()).padStart(2, "0")
    const mm = String(eta.getUTCMonth() + 1).padStart(2, "0")
    const yyyy = eta.getUTCFullYear()
    return `cần nhập khoảng ${dd}/${mm}/${yyyy}`
  }

  private resolveStorageFollowUpQuestion(
    currentQuestion: string,
    conversation: AiConversation | null
  ) {
    const hasPendingSelection =
      Boolean(conversation?.pendingSelection?.options?.length)
    if (!hasPendingSelection) return currentQuestion

    const isCurrentStorageIntent =
      this.isStorageMovementQuantityQuestion(currentQuestion) ||
      this.isRestockForecastQuestion(currentQuestion) ||
      this.isStorageCoverageDaysQuestion(currentQuestion)
    if (isCurrentStorageIntent) return currentQuestion
    if (!this.hasUserProvidedTimeSignal(currentQuestion)) return currentQuestion

    const messages = conversation?.messages || []
    const lastStorageUserQuestion = [...messages]
      .reverse()
      .filter((m) => m.role === "user" && m.content)
      .map((m) => String(m.content).trim())
      .find(
        (q) =>
          this.isStorageMovementQuantityQuestion(q) ||
          this.isRestockForecastQuestion(q) ||
          this.isStorageCoverageDaysQuestion(q)
      )
    if (!lastStorageUserQuestion) return currentQuestion

    const normalizedCurrent = this.normalizeStorageText(currentQuestion)
    if (
      /(doanh thu|income|revenue|thu nhap|tong thu|kpi|chi phi ads|chi phi quang cao|don hang|so don)/.test(
        normalizedCurrent
      )
    ) {
      return currentQuestion
    }
    const merged = `${lastStorageUserQuestion}. ${currentQuestion}`
    console.info("[ai][storage] followup_merged_question", {
      from: currentQuestion,
      base: lastStorageUserQuestion,
      merged
    })
    return merged
  }

  private hasUserProvidedTimeSignal(question: string) {
    const normalized = this.normalizeStorageText(question)
    if (/\d{1,2}\/\d{1,2}(?:\/\d{4})?/.test(normalized)) return true
    if (/(hom nay|hom qua|ngay mai|today|yesterday|tomorrow)/.test(normalized)) {
      return true
    }
    if (
      /(thang nay|thang truoc|tuan nay|tuan truoc|this month|last month|this week|last week)/.test(
        normalized
      )
    ) {
      return true
    }
    if (/(?:thang|month)\s*\d{1,2}(?:\s*\/\s*\d{4})?/.test(normalized)) return true
    if (/(?:^|\s)ngay\s+\d{1,2}\b/.test(normalized)) return true
    if (/(tu ngay|den ngay|khoang|trong ngay)/.test(normalized)) return true
    return false
  }

  private getDefaultRecentTwoWeeksDateRange() {
    const now = new Date()
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
    )
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13, 0, 0, 0, 0)
    )
    return { start, end }
  }

  private isTotalQuantityIntent(question: string) {
    const normalized = question
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
    return /\btong\b|tong so|tong cong|sum/.test(normalized)
  }

  private async aggregateStorageLogsByItem(logs: any[]) {
    const map = new Map<string, number>()
    for (const log of logs || []) {
      const items =
        Array.isArray(log?.items) && log.items.length > 0
          ? log.items
          : log?.item
            ? [log.item]
            : []
      for (const item of items) {
        const id = item?._id ? String(item._id) : ""
        if (!id) continue
        map.set(id, (map.get(id) || 0) + Number(item?.quantity || 0))
      }
    }
    const ids = [...map.keys()]
    if (!ids.length) return []
    const docs = await this.storageItemModel
      .find({ _id: { $in: ids } }, { _id: 1, code: 1, name: 1 })
      .lean()
      .exec()
    const info = new Map<string, { code: string; name: string }>()
    for (const doc of docs as any[]) {
      info.set(String(doc._id), {
        code: String(doc.code || "").trim(),
        name: String(doc.name || "").trim()
      })
    }
    return ids
      .map((id) => ({
        itemId: id,
        code: info.get(id)?.code || "",
        name: info.get(id)?.name || id,
        quantity: map.get(id) || 0
      }))
      .sort((a, b) => b.quantity - a.quantity)
  }

  private async fetchStorageLogsViaApi(
    startDate: Date,
    endDate: Date,
    status?: "received" | "delivered" | "returned"
  ) {
    const pageSize = 10
    const startDateIso = startDate.toISOString()
    const endDateIso = endDate.toISOString()
    const all: any[] = []
    let page = 1
    let total = 0
    do {
      console.info("[ai][api:req] storagelogs", {
        page,
        limit: pageSize,
        startDate: startDateIso,
        endDate: endDateIso,
        status
      })
      const res = await this.storageLogsService.getStorageLogs(
        page,
        pageSize,
        startDateIso,
        endDateIso,
        status
      )
      const rows = Array.isArray(res?.data) ? res.data : []
      total = Number(res?.total || 0)
      all.push(...rows)
      console.info("[ai][api:res] storagelogs", {
        page,
        count: rows.length,
        total
      })
      page += 1
    } while (all.length < total)
    return all
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

  private resolveNearestPastDayByMonthScope(
    day: number,
    today: Date,
    monthBackOffset: number
  ) {
    if (day < 1 || day > 31) return null
    const nowMs = Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      23,
      59,
      59,
      999
    )
    let cursorMonth = today.getUTCMonth() - monthBackOffset
    let cursorYear = today.getUTCFullYear()
    while (cursorMonth < 0) {
      cursorMonth += 12
      cursorYear -= 1
    }
    for (let i = 0; i < 24; i += 1) {
      const candidate = new Date(Date.UTC(cursorYear, cursorMonth, day, 0, 0, 0, 0))
      const isValid =
        candidate.getUTCFullYear() === cursorYear &&
        candidate.getUTCMonth() === cursorMonth &&
        candidate.getUTCDate() === day
      if (isValid && candidate.getTime() <= nowMs) {
        return candidate
      }
      cursorMonth -= 1
      if (cursorMonth < 0) {
        cursorMonth = 11
        cursorYear -= 1
      }
    }
    return null
  }

  private extractWeekdayInQuestion(normalized: string): number | null {
    const weekdayMap: Array<{ regex: RegExp; weekday: number }> = [
      { regex: /(?:\bchu nhat\b|\bcn\b)/, weekday: 0 },
      { regex: /\bthu\s*(?:2|hai)\b/, weekday: 1 },
      { regex: /\bthu\s*(?:3|ba)\b/, weekday: 2 },
      { regex: /\bthu\s*(?:4|tu)\b/, weekday: 3 },
      { regex: /\bthu\s*(?:5|nam)\b/, weekday: 4 },
      { regex: /\bthu\s*(?:6|sau)\b/, weekday: 5 },
      { regex: /\bthu\s*(?:7|bay)\b/, weekday: 6 }
    ]
    for (const entry of weekdayMap) {
      if (entry.regex.test(normalized)) return entry.weekday
    }
    return null
  }

  private resolveNearestDayByWeekScope(
    today: Date,
    weekday: number | null,
    scope: "this" | "last"
  ) {
    const currentWeekday = today.getUTCDay()
    const offsetFromMonday = (currentWeekday + 6) % 7
    const weekStart = new Date(today)
    weekStart.setUTCDate(weekStart.getUTCDate() - offsetFromMonday)
    weekStart.setUTCHours(0, 0, 0, 0)

    if (scope === "last") {
      weekStart.setUTCDate(weekStart.getUTCDate() - 7)
    }

    if (weekday === null) {
      const fallback = new Date(today)
      if (scope === "last") fallback.setUTCDate(fallback.getUTCDate() - 7)
      fallback.setUTCHours(0, 0, 0, 0)
      return fallback
    }

    const mondayBasedIndex = weekday === 0 ? 6 : weekday - 1
    const candidate = new Date(weekStart)
    candidate.setUTCDate(candidate.getUTCDate() + mondayBasedIndex)

    if (scope === "this" && candidate.getTime() > today.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() - 7)
    }
    candidate.setUTCHours(0, 0, 0, 0)
    return candidate
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
