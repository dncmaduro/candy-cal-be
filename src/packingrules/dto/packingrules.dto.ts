export class PackingRuleRequirementDto {
  minQuantity: number | null
  maxQuantity: number | null
  packingType: string
}

export class PackingRuleDto {
  productCode: string
  requirements: PackingRuleRequirementDto[]
}
