import { useEffect, useState } from 'react'
import { Breadcrumb, Button, Checkbox, Select, Typography, message } from 'antd'
import { Link } from 'react-router'
import { ApiError } from '../../shared/api/http'
import SectionCard from '../../shared/components/SectionCard'
import {
  listItemFieldRules,
  listMaterialTypes,
  listProductTypes,
  updateItemFieldRule,
  updateMaterialTypeClasses,
  updateProductTypeClasses,
} from './api'
import { ITEM_CLASS_OPTIONS, isApplicableToClass } from './types'
import type { ItemClass, ItemFieldRule, ItemFieldRuleField, ItemFieldRuleState } from './types'

const { Text, Paragraph } = Typography

const CELL_STYLE: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '8px 12px',
  textAlign: 'center',
  verticalAlign: 'middle',
}
const HEADER_CELL_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  background: '#fafafa',
  fontWeight: 600,
}
const LABEL_CELL_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  textAlign: 'left',
  fontWeight: 500,
}

// All four rows offer the same Required/Optional/Hidden choice — see
// `ItemFieldRule`'s docstring on the backend for why Shape/Dimensions
// aren't restricted to fewer options here.
const CONFIGURABLE_FIELDS: { field: ItemFieldRuleField; label: string }[] = [
  { field: 'product_type', label: 'Product Type' },
  { field: 'material_type', label: 'Material' },
  { field: 'shape', label: 'Shape' },
  { field: 'dimensions', label: 'Dimensions' },
]

const STATE_OPTIONS: { value: ItemFieldRuleState; label: string }[] = [
  { value: 'REQUIRED', label: 'Required' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'HIDDEN', label: 'Hidden' },
]

// Always required for every class today, with no demonstrated need to
// vary — see `ItemFieldRule`'s docstring on the backend. Shown for visual
// parity with the source spreadsheet, not backed by real per-class data.
const ALWAYS_REQUIRED_ROWS = ['Inventory Unit', 'How is it used', 'Lot Tracking', 'Active Toggle']

function FieldVisibilityGrid() {
  const [rules, setRules] = useState<ItemFieldRule[]>([])
  const [original, setOriginal] = useState<ItemFieldRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    listItemFieldRules()
      .then((data) => {
        setRules(data)
        setOriginal(data)
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const ruleFor = (itemClass: ItemClass, field: ItemFieldRuleField) =>
    rules.find((r) => r.item_class === itemClass && r.field === field)

  const setState = (id: number, state: ItemFieldRuleState) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, state } : r)))
  }

  const dirty = rules.filter((r) => {
    const before = original.find((o) => o.id === r.id)
    return before && before.state !== r.state
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(dirty.map((r) => updateItemFieldRule(r.id, r.state)))
      message.success('Field visibility saved.')
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not save these changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title="Field Visibility"
      extra={
        <Button type="primary" onClick={handleSave} loading={saving} disabled={dirty.length === 0}>
          Save Changes
        </Button>
      }
    >
      <Paragraph type="secondary">
        Which fields are Required, Optional, or Hidden on the Create/Edit Item screen, per Item
        Class.
      </Paragraph>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', opacity: loading ? 0.5 : 1 }}>
          <thead>
            <tr>
              <th style={HEADER_CELL_STYLE}>Field</th>
              {ITEM_CLASS_OPTIONS.map((option) => (
                <th key={option.value} style={HEADER_CELL_STYLE}>
                  {option.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONFIGURABLE_FIELDS.map(({ field, label }) => (
              <tr key={field}>
                <td style={LABEL_CELL_STYLE}>{label}</td>
                {ITEM_CLASS_OPTIONS.map((option) => {
                  const rule = ruleFor(option.value, field)
                  return (
                    <td key={option.value} style={CELL_STYLE}>
                      {rule && (
                        <Select
                          size="small"
                          style={{ width: 110 }}
                          value={rule.state}
                          onChange={(state) => setState(rule.id, state)}
                          options={STATE_OPTIONS}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {ALWAYS_REQUIRED_ROWS.map((label) => (
              <tr key={label}>
                <td style={LABEL_CELL_STYLE}>{label}</td>
                {ITEM_CLASS_OPTIONS.map((option) => (
                  <td key={option.value} style={CELL_STYLE}>
                    <Text type="secondary">Required</Text>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

interface ApplicabilityRow {
  id: number
  name: string
  applicable_item_classes: ItemClass[]
}

function ApplicabilityGrid({
  title,
  description,
  load,
  save,
}: {
  title: string
  description: string
  load: () => Promise<ApplicabilityRow[]>
  save: (id: number, classes: ItemClass[]) => Promise<unknown>
}) {
  const [rows, setRows] = useState<ApplicabilityRow[]>([])
  const [original, setOriginal] = useState<ApplicabilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const reload = () => {
    setLoading(true)
    load()
      .then((data) => {
        setRows(data)
        setOriginal(data)
      })
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [])

  const toggle = (rowId: number, itemClass: ItemClass) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row
        // An empty list means "no restriction" — toggling off the first
        // box has to first make that implicit "every class" explicit, so
        // the other five stay checked instead of the whole row emptying.
        const effective =
          row.applicable_item_classes.length === 0
            ? ITEM_CLASS_OPTIONS.map((o) => o.value)
            : row.applicable_item_classes
        const next = effective.includes(itemClass)
          ? effective.filter((c) => c !== itemClass)
          : [...effective, itemClass]
        return { ...row, applicable_item_classes: next }
      }),
    )
  }

  const dirty = rows.filter((row) => {
    const before = original.find((o) => o.id === row.id)
    if (!before) return false
    const a = [...before.applicable_item_classes].sort()
    const b = [...row.applicable_item_classes].sort()
    return a.length !== b.length || a.some((c, i) => c !== b[i])
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(dirty.map((row) => save(row.id, row.applicable_item_classes)))
      message.success(`${title} saved.`)
      reload()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not save these changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      title={title}
      extra={
        <Button type="primary" onClick={handleSave} loading={saving} disabled={dirty.length === 0}>
          Save Changes
        </Button>
      }
    >
      <Paragraph type="secondary">{description}</Paragraph>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', opacity: loading ? 0.5 : 1 }}>
          <thead>
            <tr>
              <th style={HEADER_CELL_STYLE}>Name</th>
              {ITEM_CLASS_OPTIONS.map((option) => (
                <th key={option.value} style={HEADER_CELL_STYLE}>
                  {option.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={LABEL_CELL_STYLE}>{row.name}</td>
                {ITEM_CLASS_OPTIONS.map((option) => (
                  <td key={option.value} style={CELL_STYLE}>
                    <Checkbox
                      checked={isApplicableToClass(row, option.value)}
                      onChange={() => toggle(row.id, option.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

export default function ItemClassificationSettingsPage() {
  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/settings">Settings</Link> }, { title: 'Item Classification' }]}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <FieldVisibilityGrid />
        <ApplicabilityGrid
          title="Product Type Applicability"
          description="Which Product Types are offered on the Create/Edit Item screen, per Item Class. Every box checked means no restriction — offered for every class."
          load={() => listProductTypes({ isActive: true }).then((r) => r.results)}
          save={updateProductTypeClasses}
        />
        <ApplicabilityGrid
          title="Material Type Applicability"
          description="Which Materials are offered on the Create/Edit Item screen, per Item Class. Every box checked means no restriction — offered for every class."
          load={() => listMaterialTypes({ isActive: true }).then((r) => r.results)}
          save={updateMaterialTypeClasses}
        />
      </div>
    </div>
  )
}
