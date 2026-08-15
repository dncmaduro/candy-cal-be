import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect
} from "@nestjs/websockets"
import { Server, Socket } from "socket.io"
import { allowConfiguredOrigin } from "../common/cors-policy"

@WebSocketGateway({
  cors: { origin: allowConfiguredOrigin, credentials: true },
  namespace: "/meta"
})
export class MetaGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server

  afterInit(server: Server) {
    server.on("connection", (socket: Socket) => {
      // Khi FE join conversation room
      socket.on("join-room", (conversationId: string) => {
        socket.join(`conv:${conversationId}`)
        console.log(`✅ Socket ${socket.id} joined conv:${conversationId}`)
      })
    })
  }

  handleConnection(client: Socket) {
    console.log(`📡 Client connected to /meta: ${client.id}`)
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected from /meta: ${client.id}`)
  }

  /** Gửi tin nhắn tới room cụ thể */
  sendToConversation(conversationId: string, event: string, payload: any) {
    this.server.to(`conv:${conversationId}`).emit(event, payload)
  }

  /** Broadcast toàn bộ (dev/test) */
  broadcast(event: string, payload: any) {
    this.server.emit(event, payload)
  }
}
