import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import axios from "axios"

@Injectable()
export class CurrencyExchangeService {
  private cachedRate: { rate: number; timestamp: number } | null = null
  private readonly CACHE_DURATION = 60 * 60 * 1000 // 1 hour

  /**
   * Get current USD to VND exchange rate from external API
   * Uses caching to avoid too many API calls
   */
  async getUsdToVndRate(): Promise<number> {
    try {
      // Check cache first
      if (
        this.cachedRate &&
        Date.now() - this.cachedRate.timestamp < this.CACHE_DURATION
      ) {
        return this.cachedRate.rate
      }

      // Try multiple APIs as fallback
      let rate: number | null = null

      // Try exchangerate-api.com (free tier)
      try {
        const response = await axios.get(
          "https://open.er-api.com/v6/latest/USD",
          { timeout: 5000 }
        )
        if (response.data?.rates?.VND) {
          rate = response.data.rates.VND
        }
      } catch (e) {
        console.warn("Failed to get rate from exchangerate-api:", e.message)
      }

      // Fallback to exchangerate.host
      if (!rate) {
        try {
          const response = await axios.get(
            "https://api.exchangerate.host/latest?base=USD&symbols=VND",
            { timeout: 5000 }
          )
          if (response.data?.rates?.VND) {
            rate = response.data.rates.VND
          }
        } catch (e) {
          console.warn("Failed to get rate from exchangerate.host:", e.message)
        }
      }

      // If all APIs fail, use a reasonable fallback rate
      if (!rate) {
        console.warn(
          "All exchange rate APIs failed, using fallback rate of 24,000 VND/USD"
        )
        rate = 24000 // Approximate fallback rate
      }

      // Cache the rate
      this.cachedRate = {
        rate,
        timestamp: Date.now()
      }

      return rate
    } catch (error) {
      console.error("Error getting exchange rate:", error)
      throw new HttpException(
        "Không thể lấy tỷ giá USD/VND",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Convert USD to VND
   */
  async convertUsdToVnd(usdAmount: number): Promise<number> {
    const rate = await this.getUsdToVndRate()
    return Math.round(usdAmount * rate)
  }

  /**
   * Clear the cached rate (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cachedRate = null
  }
}
