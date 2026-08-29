import { fieldRulesForClass, ITEM_CLASS_OPTIONS, ITEM_CLASS_SHORT_LABELS } from './types'
import type { ItemClass, ItemFieldRule, NamingTemplate } from './types'

/** Picks the best-matching active template for an item's class, product
 * type, and shape. `product_type` and `shape` are two independent
 * optional scopes on a template — a template's non-null scope fields must
 * equal the item's values to be eligible at all (they never narrow via
 * mismatch); among eligible templates, the one with the most scopes set
 * wins, so a template scoped on both beats one scoped on either alone,
 * which beats a class-wide template scoped on neither. */
export function resolveNamingTemplate(
  templates: NamingTemplate[],
  itemClass: ItemClass | undefined,
  productTypeId: number | null | undefined,
  shapeId: number | null | undefined,
): NamingTemplate | undefined {
  if (!itemClass) return undefined
  const eligible = templates.filter((t) => {
    if (!t.is_active || t.item_class !== itemClass) return false
    if (t.product_type != null && t.product_type !== productTypeId) return false
    if (t.shape != null && t.shape !== shapeId) return false
    return true
  })
  const specificity = (t: NamingTemplate) =>
    (t.product_type != null ? 1 : 0) + (t.shape != null ? 1 : 0)
  return eligible.reduce<NamingTemplate | undefined>((best, t) => {
    if (!best || specificity(t) > specificity(best)) return t
    return best
  }, undefined)
}

/** Values a `NamingTemplate` pattern can reference as `{token}`. Every
 * value is a plain string (already formatted for display) — a token
 * simply being absent/empty means "not filled in yet", not an error. */
export interface NamingTokens {
  class?: string
  class_short?: string
  product_type?: string
  product_type_short?: string
  material_type?: string
  material_type_short?: string
  shape?: string
  shape_short?: string
  length?: string
  breadth?: string
  height?: string
  uom?: string
  dimension?: string
}

/** Which `{token}` placeholders a NamingTemplate pattern can actually rely
 * on for the given item class — reads the same live `ItemFieldRule` set
 * the Item form itself uses (via `fieldRulesForClass`), so a pattern built
 * from this list can never reference a token that's guaranteed empty for
 * that class (which would silently block the whole suggestion — see
 * `applyTemplate`). `class`/`class_short`/`uom` are always available since
 * every class always populates them. */
export function availableNamingTokens(
  itemClass: ItemClass | undefined,
  fieldRules: ItemFieldRule[],
): string[] {
  if (!itemClass) return ['class', 'class_short', 'uom']

  const rules = fieldRulesForClass(fieldRules, itemClass)
  const showProductType = rules.product_type !== 'HIDDEN'
  const showMaterialType = rules.material_type !== 'HIDDEN'
  const showShape = rules.shape !== 'HIDDEN'
  const showDimensions = rules.dimensions !== 'HIDDEN'

  return [
    'class',
    'class_short',
    ...(showProductType ? ['product_type', 'product_type_short'] : []),
    ...(showMaterialType ? ['material_type', 'material_type_short'] : []),
    ...(showShape ? ['shape', 'shape_short'] : []),
    ...(showDimensions ? ['length', 'breadth', 'height', 'dimension'] : []),
    'uom',
  ]
}

// Illustrative stand-ins, not real master data — the Naming Template
// screen has no Item to read values from, unlike the Item form. Chosen to
// exercise the LxBDH dimension form (both breadth and a shape short code
// are present, so `buildDimensionToken` picks that branch over L{shape}H).
const EXAMPLE_VALUES: Record<string, string> = {
  product_type: 'Plate',
  product_type_short: 'PL',
  material_type: 'Bagasse',
  material_type_short: 'BG',
  shape: 'Round',
  shape_short: 'RD',
  length: '10',
  breadth: '10',
  height: '20',
  uom: 'PC',
}

/** Fills in `NamingTokens` with representative example values (not real
 * data) for whichever tokens `availableNamingTokens` says this class can
 * actually populate — so `applyTemplate` on the result previews a pattern
 * exactly the way it would behave on a real Item of this class, including
 * returning `null` for a pattern that references a token the class hides
 * (rather than optimistically rendering something no real item could). */
export function exampleNamingTokens(
  itemClass: ItemClass | undefined,
  fieldRules: ItemFieldRule[],
): NamingTokens {
  if (!itemClass) return {}
  const available = new Set(availableNamingTokens(itemClass, fieldRules))
  const tokens: NamingTokens = {}

  if (available.has('class')) {
    tokens.class = ITEM_CLASS_OPTIONS.find((option) => option.value === itemClass)?.label
  }
  if (available.has('class_short')) {
    tokens.class_short = ITEM_CLASS_SHORT_LABELS[itemClass]
  }
  for (const [key, value] of Object.entries(EXAMPLE_VALUES)) {
    if (available.has(key)) (tokens as Record<string, string>)[key] = value
  }
  if (available.has('dimension')) {
    tokens.dimension = buildDimensionToken(
      tokens.length,
      tokens.breadth,
      tokens.height,
      tokens.shape_short,
    )
  }

  return tokens
}

/** The compact dimension segment used by the Item Code convention:
 * `{L}x{B}D{H}` when both Length and Breadth are set (square/rectangular —
 * collapses naturally when they're equal), or `{L}{ShapeShort}{H}` when
 * only Length is set (round/single-dimension items, e.g. a diameter) —
 * which needs a Shape short code to stay unambiguous. Returns `undefined`
 * when there isn't enough to build either form. */
export function buildDimensionToken(
  length: string | undefined,
  breadth: string | undefined,
  height: string | undefined,
  shapeShort: string | undefined,
): string | undefined {
  if (!length || !height) return undefined
  if (breadth) return `${length}x${breadth}D${height}`
  if (shapeShort) return `${length}${shapeShort}${height}`
  return undefined
}

/** Substitutes every `{token}` placeholder in `pattern` from `tokens`.
 * Returns `null` unless every token the pattern actually references has a
 * value — so a suggestion only ever appears once the relevant fields are
 * filled in, never with a half-built string. */
export function applyTemplate(pattern: string, tokens: NamingTokens): string | null {
  if (!pattern) return null
  const values = tokens as Record<string, string | undefined>
  let missing = false
  const result = pattern.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key]
    if (!value) {
      missing = true
      return ''
    }
    return value
  })
  return missing ? null : result
}
