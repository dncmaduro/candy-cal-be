export class PackingRuleDto {
  products: {
    productCode: string
    minQuantity: number | null
    maxQuantity: number | null
  }[]
  packingType: string
}
