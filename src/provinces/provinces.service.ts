import { Injectable, InternalServerErrorException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import * as https from "https"
import { Province } from "../database/mongoose/schemas/Province"

@Injectable()
export class ProvincesService {
  constructor(
    @InjectModel("provinces") private readonly provinceModel: Model<Province>
  ) {}

  // fetch JSON from a public GitHub raw source (data contains list of provinces)
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = ""
          res.on("data", (chunk) => (data += chunk))
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data)
              resolve(parsed)
            } catch (err) {
              reject(err)
            }
          })
        })
        .on("error", (err) => reject(err))
    })
  }

  /**
   * Sync provinces from a public source and upsert into DB.
   * Returns number of provinces processed.
   */
  async syncProvincesFromPublicSource(): Promise<number> {
    try {
      // public dataset (contains provinces and districts). We only need top-level provinces.
      const url =
        "https://raw.githubusercontent.com/kenzouno1/DiaGioiHanhChinhVN/master/data.json"

      const data = await this.fetchJson(url)

      if (!Array.isArray(data)) {
        throw new Error("Unexpected provinces data format")
      }

      // data is an array of province objects with fields: Id, Name, Districts
      const provinces = data.map((p) => ({
        code: p.Id?.toString?.() || "",
        name: p.Name?.toString?.().trim() || ""
      }))

      // take only unique non-empty entries (should be 63)
      const unique = provinces.reduce(
        (acc, cur) => {
          if (!cur.code || !cur.name) return acc
          if (!acc.some((x) => x.code === cur.code)) acc.push(cur)
          return acc
        },
        [] as { code: string; name: string }[]
      )

      if (unique.length === 0) return 0

      // build bulk ops upserting by code
      const ops = unique.map((p) => ({
        updateOne: {
          filter: { code: p.code },
          update: {
            $set: { name: p.name, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() }
          },
          upsert: true
        }
      }))

      const result = await this.provinceModel.bulkWrite(ops)

      // result may contain upsertedCount or nUpserted depending on mongoose version
      const upserted =
        (result as any).nUpserted ?? (result as any).upsertedCount ?? 0
      const modified =
        (result as any).nModified ?? (result as any).modifiedCount ?? 0

      return upserted + modified
    } catch (error) {
      console.error("Failed to sync provinces:", error)
      throw new InternalServerErrorException("Failed to sync provinces")
    }
  }

  // convenience: get all provinces
  async getAllProvinces(): Promise<{ provinces: Province[] }> {
    const provinces = await this.provinceModel.find().sort({ name: 1 }).exec()
    return { provinces }
  }
}
