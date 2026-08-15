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
  cors: { origin: allowConfiguredOrigin, credentials: true }
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server

  afterInit(server: Server) {
    // Đăng ký lắng nghe join-room ở đây!
    server.on("connection", (socket: Socket) => {
      socket.on("join-room", (userId: string) => {
        socket.join(userId)
      })
    })
  }

  handleConnection(client: Socket) {}

  handleDisconnect(client: Socket) {}

  notifyAll(payload: any) {
    this.server.emit("notification", payload)
  }

  notifyUser(userId: string, payload: any) {
    this.server.to(userId).emit("notification", payload)
  }
}
