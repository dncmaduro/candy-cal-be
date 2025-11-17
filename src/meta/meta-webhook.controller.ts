import { Controller, Get, Post, Query, Res, Req } from "@nestjs/common"
import axios from "axios"
import { SalesFunnelService } from "../salesfunnel/salesfunnel.service"
import { MetaGateway } from "./meta.gateway"
import { MetaService } from "./meta.service"
import { SalesChannelsService } from "../saleschannels/saleschannels.service"

@Controller("meta/webhook")
export class MetaWebhookController {
  constructor(
    private readonly salesFunnelService: SalesFunnelService,
    private readonly metaGateway: MetaGateway,
    private readonly metaService: MetaService,
    private readonly salesChannelsService: SalesChannelsService
  ) {}

  @Get()
  verify(@Query() query: any, @Res() res) {
    const mode = query["hub.mode"]
    const token = query["hub.verify_token"]
    const challenge = query["hub.challenge"]
    const verifyToken = process.env.META_VERIFY_TOKEN

    console.log(mode, token, verifyToken)
    if (mode === "subscribe" && token === verifyToken) {
      return res.status(200).send(challenge)
    }
    return res.sendStatus(403)
  }

  @Post()
  async receive(@Req() req, @Res() res) {
    const body = req.body
    // Loop qua các entry/messaging event
    for (const entry of body.entry || []) {
      for (const evt of entry.messaging || []) {
        const psid = evt.sender?.id
        const text = evt.message?.text
        const mid = evt.delivery ? evt.delivery.mids[0] : evt.message?.mid
        const ts = evt.timestamp
        const conv = await this.metaService.getConversationIdByPsid(psid)

        const user = await getUserInfo(psid)
        const isPsidExists = await this.salesFunnelService.isPsidExists(psid)
        const from = evt.delivery
          ? {
              id: evt.recipient.id,
              name: "",
              isPage: true
            }
          : {
              id: evt.sender.id,
              name: evt.sender.name,
              isPage: false
            }

        // TODO: Determine channel ID - for now use a default or get from config
        const defaultChannelId =
          process.env.DEFAULT_SALES_CHANNEL_ID || "646666666666666666666666"

        if (!isPsidExists) {
          await this.salesFunnelService.createFunnelFromPsid(
            psid,
            user.last_name + " " + user.first_name,
            defaultChannelId
          )
        }

        // TODO: LƯU DB: contacts(psid), messages(psid, text|payload, timestamp)
        const payload = {
          psid,
          from,
          text: text ?? evt.postback?.payload ?? null,
          messageId: mid ?? null,
          created_time: ts
            ? new Date(ts).toISOString()
            : new Date().toISOString()
        }

        this.metaGateway.sendToConversation(
          conv.conversationId,
          "meta:new_message",
          payload
        )
      }
    }
    return res.sendStatus(200)
  }
}

async function getUserInfo(psid: string) {
  const token = process.env.META_PAGE_TOKEN
  const fields = "first_name,last_name,profile_pic"
  const url = `https://graph.facebook.com/v24.0/${psid}?fields=${fields}&access_token=${token}`

  const { data } = await axios.get(url)
  return data
}
