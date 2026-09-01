import { describe, expect, it } from 'vitest'
import {
  applyTemplate,
  availableNamingTokens,
  buildDimensionToken,
  exampleNamingTokens,
  resolveNamingTemplate,
} from './namingTemplate'
import type { ItemFieldRule, ItemFieldRuleField, ItemFieldRuleState, NamingTemplate } from './types'

function template(overrides: Partial<NamingTemplate>): NamingTemplate {
  return {
    id: 1,
    item_class: 'FINISHED_GOOD',
    product_type: null,
    product_type_name: '',
    shape: null,
    shape_name: '',
    name_pattern: '',
    code_pattern: '',
    is_active: true,
    ...overrides,
  }
}

// Mirrors the backend's seeded rule set exactly (see
// `apps/items/migrations/0013_seed_item_field_rules.py`).
const ALL_RULES: ItemFieldRule[] = (
  [
    ['RAW_MATERIAL', 'product_type', 'HIDDEN'],
    ['RAW_MATERIAL', 'material_type', 'REQUIRED'],
    ['RAW_MATERIAL', 'shape', 'HIDDEN'],
    ['RAW_MATERIAL', 'dimensions', 'HIDDEN'],
    ['WIP', 'product_type', 'REQUIRED'],
    ['WIP', 'material_type', 'REQUIRED'],
    ['WIP', 'shape', 'OPTIONAL'],
    ['WIP', 'dimensions', 'OPTIONAL'],
    ['FINISHED_GOOD', 'product_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'material_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'shape', 'OPTIONAL'],
    ['FINISHED_GOOD', 'dimensions', 'OPTIONAL'],
    ['PACKAGING_MATERIAL', 'product_type', 'REQUIRED'],
    ['PACKAGING_MATERIAL', 'material_type', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'shape', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'dimensions', 'OPTIONAL'],
    ['CONSUMABLE', 'product_type', 'OPTIONAL'],
    ['CONSUMABLE', 'material_type', 'HIDDEN'],
    ['CONSUMABLE', 'shape', 'HIDDEN'],
    ['CONSUMABLE', 'dimensions', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'product_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'material_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'shape', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'dimensions', 'HIDDEN'],
  ] as [NamingTemplate['item_class'], ItemFieldRuleField, ItemFieldRuleState][]
).map(([item_class, field, state], index) => ({ id: index + 1, item_class, field, state }))

describe('availableNamingTokens', () => {
  it('offers every token for classes where the Item form shows everything', () => {
    expect(availableNamingTokens('FINISHED_GOOD', ALL_RULES)).toEqual([
      'class',
      'class_short',
      'product_type',
      'product_type_short',
      'material_type',
      'material_type_short',
      'shape',
      'shape_short',
      'length',
      'breadth',
      'height',
      'length_uom',
      'breadth_uom',
      'height_uom',
      'dimension',
      'uom',
    ])
  })

  it('omits product_type for Raw Material, where the Item form hides it', () => {
    const tokens = availableNamingTokens('RAW_MATERIAL', ALL_RULES)

    expect(tokens).not.toContain('product_type')
    expect(tokens).not.toContain('product_type_short')
    expect(tokens).toContain('material_type')
  })

  it('omits material_type for Packaging Material, where the Item form hides it', () => {
    const tokens = availableNamingTokens('PACKAGING_MATERIAL', ALL_RULES)

    expect(tokens).not.toContain('material_type')
    expect(tokens).not.toContain('material_type_short')
    expect(tokens).toContain('product_type')
  })

  it('omits material_type for Consumable, where the Item form hides it', () => {
    const tokens = availableNamingTokens('CONSUMABLE', ALL_RULES)

    expect(tokens).not.toContain('material_type')
    expect(tokens).toContain('product_type')
  })

  it('omits shape/dimension tokens outside WIP/Finished Good/Packaging Material', () => {
    const tokens = availableNamingTokens('SCRAP_BY_PRODUCT', ALL_RULES)

    expect(tokens).not.toContain('shape')
    expect(tokens).not.toContain('dimension')
  })

  it('offers dimension tokens but not shape tokens for Packaging Material', () => {
    const tokens = availableNamingTokens('PACKAGING_MATERIAL', ALL_RULES)

    expect(tokens).toContain('length')
    expect(tokens).toContain('breadth')
    expect(tokens).toContain('height')
    expect(tokens).toContain('length_uom')
    expect(tokens).toContain('breadth_uom')
    expect(tokens).toContain('height_uom')
    expect(tokens).toContain('dimension')
    expect(tokens).not.toContain('shape')
    expect(tokens).not.toContain('shape_short')
  })

  it('still returns class/class_short/uom when no class is selected yet', () => {
    expect(availableNamingTokens(undefined, ALL_RULES)).toEqual(['class', 'class_short', 'uom'])
  })
})

describe('exampleNamingTokens', () => {
  it('returns an empty object when no class is selected yet', () => {
    expect(exampleNamingTokens(undefined, ALL_RULES)).toEqual({})
  })

  it('fills every available token with a real example value', () => {
    const tokens = exampleNamingTokens('FINISHED_GOOD', ALL_RULES)

    expect(tokens.class).toBe('Finished Good')
    expect(tokens.class_short).toBe('FG')
    expect(tokens.product_type).toBeTruthy()
    expect(tokens.product_type_short).toBeTruthy()
    expect(tokens.material_type).toBeTruthy()
    expect(tokens.material_type_short).toBeTruthy()
    expect(tokens.shape).toBeTruthy()
    expect(tokens.shape_short).toBeTruthy()
    expect(tokens.length).toBeTruthy()
    expect(tokens.breadth).toBeTruthy()
    expect(tokens.height).toBeTruthy()
    expect(tokens.length_uom).toBeTruthy()
    expect(tokens.breadth_uom).toBeTruthy()
    expect(tokens.height_uom).toBeTruthy()
    expect(tokens.uom).toBeTruthy()
    expect(tokens.dimension).toBeTruthy()
  })

  it('omits tokens the class hides, mirroring availableNamingTokens exactly', () => {
    const tokens = exampleNamingTokens('PACKAGING_MATERIAL', ALL_RULES)

    expect(tokens.product_type).toBeTruthy()
    expect(tokens.material_type).toBeUndefined()
    expect(tokens.material_type_short).toBeUndefined()
    expect(tokens.shape).toBeUndefined()
    expect(tokens.dimension).toBeTruthy()
  })

  it('produces tokens that actually resolve through applyTemplate', () => {
    const tokens = exampleNamingTokens('FINISHED_GOOD', ALL_RULES)

    expect(applyTemplate('{product_type} — {material_type}', tokens)).toBe('Plate — Bagasse')
    expect(applyTemplate('{material_type_short}_{shape_short}-{dimension}', tokens)).toBe(
      'BG_RD-10x10D20',
    )
  })

  it('lets a pattern be explicit about each dimension unit via {length_uom}/{breadth_uom}/{height_uom}', () => {
    const tokens = exampleNamingTokens('FINISHED_GOOD', ALL_RULES)

    expect(
      applyTemplate('{length}{length_uom} x {breadth}{breadth_uom} x {height}{height_uom}', tokens),
    ).toBe('10in x 10in x 20mm')
  })

  it('returns null via applyTemplate for a token the class hides, instead of a misleading result', () => {
    const tokens = exampleNamingTokens('PACKAGING_MATERIAL', ALL_RULES)

    expect(applyTemplate('{product_type} made of {material_type}', tokens)).toBeNull()
  })
})

describe('buildDimensionToken', () => {
  it('uses LxBDH when both length and breadth are set', () => {
    expect(buildDimensionToken('10', '10', '20', 'RD')).toBe('10x10D20')
  })

  it('uses L{shape}H when only length is set (round/single-dimension items)', () => {
    expect(buildDimensionToken('10', undefined, '20', 'RD')).toBe('10RD20')
  })

  it('returns undefined when only length is set but there is no shape short code', () => {
    expect(buildDimensionToken('10', undefined, '20', undefined)).toBeUndefined()
  })

  it('returns undefined when height is missing', () => {
    expect(buildDimensionToken('10', '10', undefined, 'RD')).toBeUndefined()
  })
})

describe('applyTemplate', () => {
  it('substitutes every referenced token', () => {
    expect(applyTemplate('{product_type} — {material_type}', {
      product_type: 'Plate',
      material_type: 'Areca Palm',
    })).toBe('Plate — Areca Palm')
  })

  it('returns null when a referenced token has no value', () => {
    expect(applyTemplate('{product_type} — {material_type}', { product_type: 'Plate' })).toBeNull()
  })

  it('returns null for an empty pattern', () => {
    expect(applyTemplate('', { product_type: 'Plate' })).toBeNull()
  })
})

describe('resolveNamingTemplate', () => {
  it('prefers a template scoped on both product_type and shape over either alone', () => {
    const both = template({ id: 1, product_type: 10, shape: 20 })
    const productTypeOnly = template({ id: 2, product_type: 10, shape: null })
    const shapeOnly = template({ id: 3, product_type: null, shape: 20 })
    const classWide = template({ id: 4, product_type: null, shape: null })

    const result = resolveNamingTemplate(
      [classWide, shapeOnly, productTypeOnly, both],
      'FINISHED_GOOD',
      10,
      20,
    )

    expect(result?.id).toBe(1)
  })

  it('prefers a single-scoped template over a class-wide one', () => {
    const productTypeOnly = template({ id: 2, product_type: 10, shape: null })
    const classWide = template({ id: 4, product_type: null, shape: null })

    const result = resolveNamingTemplate([classWide, productTypeOnly], 'FINISHED_GOOD', 10, 20)

    expect(result?.id).toBe(2)
  })

  it('excludes a template whose scope does not match the item, even if it is more specific', () => {
    const wrongProductType = template({ id: 1, product_type: 99, shape: null })
    const classWide = template({ id: 2, product_type: null, shape: null })

    const result = resolveNamingTemplate([wrongProductType, classWide], 'FINISHED_GOOD', 10, 20)

    expect(result?.id).toBe(2)
  })

  it('a shape-only template applies across different product types sharing that shape', () => {
    const roundOnly = template({ id: 1, product_type: null, shape: 20 })

    const bowl = resolveNamingTemplate([roundOnly], 'FINISHED_GOOD', 10, 20)
    const cup = resolveNamingTemplate([roundOnly], 'FINISHED_GOOD', 11, 20)

    expect(bowl?.id).toBe(1)
    expect(cup?.id).toBe(1)
  })

  it('ignores inactive templates', () => {
    const inactive = template({ id: 1, is_active: false })

    expect(resolveNamingTemplate([inactive], 'FINISHED_GOOD', 10, 20)).toBeUndefined()
  })

  it('returns undefined when nothing matches', () => {
    expect(resolveNamingTemplate([], 'FINISHED_GOOD', 10, 20)).toBeUndefined()
    expect(resolveNamingTemplate([template({})], undefined, 10, 20)).toBeUndefined()
  })
})
