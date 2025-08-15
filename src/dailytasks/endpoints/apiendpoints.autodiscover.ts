import { Injectable, OnApplicationBootstrap, Logger } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { ApiEndpoint } from "../../database/mongoose/schemas/ApiEndpoint"
import { ModulesContainer } from "@nestjs/core"
import { PATH_METADATA, METHOD_METADATA } from "@nestjs/common/constants"
import { RequestMethod } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"

@Injectable()
export class ApiEndpointAutoDiscoverService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ApiEndpointAutoDiscoverService.name)
  constructor(
    private readonly modulesContainer: ModulesContainer,
    @InjectModel("ApiEndpoint")
    private readonly apiEndpointModel: Model<ApiEndpoint>
  ) {}

  async onApplicationBootstrap() {
    await this.runDiscovery("bootstrap")
  }

  @Cron("0 2 * * *") // chạy mỗi ngày lúc 02:00
  async scheduledDiscovery() {
    await this.runDiscovery("cron")
  }

  private async runDiscovery(source: "bootstrap" | "cron") {
    const discovered: Array<{ key: string; method: string; path: string }> = []

    for (const moduleRef of this.modulesContainer.values()) {
      for (const controllerWrapper of moduleRef.controllers.values()) {
        const instance = controllerWrapper.instance as any
        if (!instance) continue
        const controllerClass = instance.constructor
        const basePath: string =
          Reflect.getMetadata(PATH_METADATA, controllerClass) || ""
        const prototype = controllerClass.prototype
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (m) => m !== "constructor" && typeof prototype[m] === "function"
        )
        for (const mName of methodNames) {
          const handler = prototype[mName]
          const methodPath: string =
            Reflect.getMetadata(PATH_METADATA, handler) || ""
          const requestMethodVal: number | undefined = Reflect.getMetadata(
            METHOD_METADATA,
            handler
          )
          if (requestMethodVal === undefined) continue
          const httpMethod = RequestMethod[requestMethodVal]
          const fullPath =
            "/" +
              [basePath, methodPath]
                .filter(Boolean)
                .join("/")
                .replace(/\/+/g, "/")
                // Build a deterministic key
                .replace(/\/+$/, "") || "/"
          const key = `${httpMethod}-${fullPath.replace(/[:/]/g, "_")}`
          discovered.push({ key, method: httpMethod, path: fullPath })
        }
      }
    }

    let upserts = 0
    for (const item of discovered) {
      try {
        await this.apiEndpointModel.updateOne(
          { key: item.key },
          {
            $set: {
              name: item.path,
              method: item.method,
              url: item.path,
              active: true,
              deleted: false
            }
          },
          { upsert: true }
        )
        upserts++
      } catch (e) {
        this.logger.warn(`AutoDiscover fail ${item.key}: ${e.message}`)
      }
    }
    this.logger.log(
      `ApiEndpoint auto-discover (${source}) processed=${discovered.length} upserts=${upserts}`
    )
  }
}
