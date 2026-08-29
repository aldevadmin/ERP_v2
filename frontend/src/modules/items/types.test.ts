import { describe, expect, it } from 'vitest'
import { isApplicableToClass } from './types'
import type { MaterialType, ProductType } from './types'

function productType(overrides: Partial<ProductType>): ProductType {
  return {
    id: 1,
    name: 'Plate',
    short_code: 'PL',
    applicable_item_classes: [],
    is_active: true,
    ...overrides,
  }
}

describe('isApplicableToClass', () => {
  it('is applicable to every class when applicable_item_classes is empty', () => {
    const plate = productType({ applicable_item_classes: [] })

    expect(isApplicableToClass(plate, 'FINISHED_GOOD')).toBe(true)
    expect(isApplicableToClass(plate, 'PACKAGING_MATERIAL')).toBe(true)
  })

  it('is applicable only to the classes it names', () => {
    const carton = productType({
      name: 'Carton',
      applicable_item_classes: ['PACKAGING_MATERIAL'],
    })

    expect(isApplicableToClass(carton, 'PACKAGING_MATERIAL')).toBe(true)
    expect(isApplicableToClass(carton, 'FINISHED_GOOD')).toBe(false)
  })

  it('is applicable to any class it names when tagged for multiple', () => {
    const plate = productType({
      applicable_item_classes: ['WIP', 'FINISHED_GOOD'],
    })

    expect(isApplicableToClass(plate, 'WIP')).toBe(true)
    expect(isApplicableToClass(plate, 'FINISHED_GOOD')).toBe(true)
    expect(isApplicableToClass(plate, 'PACKAGING_MATERIAL')).toBe(false)
  })

  it('works the same way for Material Type rows', () => {
    const cortonPaper: MaterialType = {
      id: 1,
      name: 'Corrugated Paper',
      short_code: '',
      applicable_item_classes: ['PACKAGING_MATERIAL'],
      is_active: true,
    }

    expect(isApplicableToClass(cortonPaper, 'PACKAGING_MATERIAL')).toBe(true)
    expect(isApplicableToClass(cortonPaper, 'RAW_MATERIAL')).toBe(false)
  })
})
