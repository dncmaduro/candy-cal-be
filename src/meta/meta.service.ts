import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import axios from "axios"

const FB_API = "https://graph.facebook.com/v24.0"

export interface ConversationParticipant {
  id: string
  name?: string
}

export interface Conversation {
  id: string
  updated_time: string
  link?: string
  participants: { data: ConversationParticipant[] }
}

export interface Paging {
  cursors?: { before?: string; after?: string }
  next?: string
}

export interface ConversationResponse {
  data: Conversation[]
  paging?: Paging
}

export interface ConversationItem {
  conversationId: string
  updated_time: string
  link?: string
  user: {
    psid: string
    name?: string | null
    first_name?: string | null
    last_name?: string | null
    profile_pic?: string | null
  }
}

export interface Message {
  id: string
  created_time: string
  message?: string
  from?: { id: string; name?: string }
  to?: { data: { id: string; name?: string }[] }
}

export interface MessagesResponse {
  messages?: {
    data: Message[]
    paging?: { cursors?: { after?: string; before?: string } }
  }
}

export interface MessageItem {
  id: string
  text?: string
  created_time: string
  from: {
    id: string
    name?: string
    isPage: boolean
  }
}

@Injectable()
export class MetaService {
  constructor() {}

  private pageId = process.env.META_PAGE_ID
  private pageToken = process.env.META_PAGE_TOKEN

  private readonly api = "https://graph.facebook.com/v24.0"

  async listConversations(
    page = 1,
    limit = 10
  ): Promise<{
    items: ConversationItem[]
    nextPage: number | null
  }> {
    // Lấy trước toàn bộ, rồi tính offset dựa vào page
    const params = {
      access_token: this.pageToken,
      fields: "updated_time,link,participants",
      limit
    }

    const { data } = await axios.get<ConversationResponse>(
      `${this.api}/${this.pageId}/conversations`,
      { params }
    )

    const conversations = data.data ?? []
    const afterCursor = data.paging?.cursors?.after ?? null

    const items: ConversationItem[] = await Promise.all(
      conversations.map(async (c) => {
        const others = (c.participants?.data ?? []).filter(
          (p) => p.id !== this.pageId
        )
        const person = others[0]
        let first_name: string | null = null
        let last_name: string | null = null
        let profile_pic: string | null = null

        try {
          const userRes = await axios.get(`${this.api}/${person.id}`, {
            params: {
              fields: "first_name,last_name,profile_pic",
              access_token: this.pageToken
            }
          })
          first_name = userRes.data.first_name ?? null
          last_name = userRes.data.last_name ?? null
          profile_pic = userRes.data.profile_pic ?? null
        } catch (_) {
          /* ignore */
        }

        return {
          conversationId: c.id,
          updated_time: c.updated_time,
          link: c.link,
          user: {
            psid: person.id,
            name:
              person.name ||
              [first_name, last_name].filter(Boolean).join(" ") ||
              null,
            first_name,
            last_name,
            profile_pic
          }
        }
      })
    )

    return {
      items,
      nextPage: afterCursor ? page + 1 : null
    }
  }

  async listMessages(
    conversationId: string,
    opts: { limit?: number; after?: string; before?: string } = {}
  ): Promise<{
    items: MessageItem[]
    nextCursor: string | null // cursor để tải TIẾP (older)
    prevCursor: string | null // cursor để quay LẠI (newer)
  }> {
    const { limit = 50, after, before } = opts

    try {
      const params: any = {
        access_token: this.pageToken,
        limit,
        fields: "id,message,from,to,created_time"
      }
      if (after) params.after = after
      if (before) params.before = before

      // Gọi trực tiếp edge /messages để truyền cursor
      const { data } = await axios.get<{
        data: Message[]
        paging?: { cursors?: { after?: string; before?: string } }
      }>(`${this.api}/${conversationId}/messages`, { params })

      const raw = data?.data ?? []

      const items: MessageItem[] = raw.map((m) => ({
        id: m.id,
        text: m.message,
        created_time: m.created_time,
        from: {
          id: m.from?.id ?? "",
          name: m.from?.name,
          isPage: m.from?.id === this.pageId
        }
      }))

      // FB trả mặc định "mới → cũ". Nếu FE muốn hiển thị "cũ → mới",
      // tiếp tục đảo ở FE như bạn đang làm: items.slice().reverse()
      const nextCursor = data?.paging?.cursors?.after ?? null
      const prevCursor = data?.paging?.cursors?.before ?? null

      return { items, nextCursor, prevCursor }
    } catch (err) {
      throw new HttpException(
        "Không lấy được danh sách tin nhắn",
        HttpStatus.BAD_GATEWAY
      )
    }
  }

  async getPsidByConversationId(
    conversationId: string
  ): Promise<{ psid: string }> {
    const params = {
      access_token: this.pageToken,
      fields: "participants"
    }

    const { data } = await axios.get<{
      participants: { data: { id: string }[] }
    }>(`${this.api}/${conversationId}`, { params })

    const others = (data.participants?.data ?? []).filter(
      (p) => p.id !== this.pageId
    )
    const person = others[0]
    return { psid: person.id }
  }

  async getConversationIdByPsid(
    psid: string
  ): Promise<{ conversationId: string }> {
    const params = {
      access_token: this.pageToken,
      fields: "conversations"
    }

    const { data } = await axios.get<{
      conversations: { data: { id: string }[] }
    }>(`${this.api}/${psid}`, { params })

    const conversation = data.conversations?.data[0]
    return { conversationId: conversation.id }
  }

  async sendText(psid: string, text: string): Promise<void> {
    try {
      const url = "https://graph.facebook.com/v24.0/me/messages"
      await axios.post(
        url,
        { recipient: { id: psid }, message: { text } },
        { params: { access_token: this.pageToken } }
      )
    } catch (error) {
      console.error("Error sending text:", error)
      throw new HttpException(
        "Lỗi khi gửi tin nhắn",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getProfileByPsid(
    psid: string
  ): Promise<{ first_name: string; last_name: string; profile_pic: string }> {
    try {
      const url = `${this.api}/${psid}?fields=first_name,last_name,profile_pic`
      const { data } = await axios.get(url, {
        params: { access_token: this.pageToken }
      })
      return data
    } catch (error) {
      console.error("Error getting profile:", error)
      throw new HttpException(
        "Lỗi khi lấy thông tin người dùng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
