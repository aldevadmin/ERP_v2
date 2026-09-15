import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Flex, Select, Tabs, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listItems } from '../items/api'
import type { Item } from '../items/types'
import { saveRouteItemMappingsV1 } from './api'
import type {
  ProcessRouteVersionV1,
  RouteItemMappingV1,
  RouteItemMappingV1FormValues,
  RouteNodeV1,
} from './types'

const { Text } = Typography

interface Role {
  key: string
  node: RouteNodeV1
  definitionId: number
  definitionType: 'input' | 'output'
  itemGroup: number
  itemGroupName: string
  classificationName: string
}

function rolesFor(nodes: RouteNodeV1[]): Role[] {
  const ordered = [...nodes].sort((a, b) => a.sequence_hint - b.sequence_hint)
  const roles: Role[] = []
  for (const node of ordered) {
    for (const input of node.inputs) {
      roles.push({
        key: `in-${input.id}`,
        node,
        definitionId: input.id,
        definitionType: 'input',
        itemGroup: input.item_group,
        itemGroupName: input.item_group_name,
        classificationName: '',
      })
    }
    for (const output of node.outputs) {
      roles.push({
        key: `out-${output.id}`,
        node,
        definitionId: output.id,
        definitionType: 'output',
        itemGroup: output.item_group,
        itemGroupName: output.item_group_name,
        classificationName: output.classification_name,
      })
    }
  }
  return roles
}

function mappingKey(role: Role, targetItemId: number): string {
  return `${role.key}:${targetItemId}`
}

/** No old equivalent — this is the actual resolver data entry screen. Per
 * registered target item (a real finished/WIP SKU), fills in "which
 * concrete item plays each node's role for this SKU" — the same route
 * shape then works for every SKU size, each with its own small mapping
 * set instead of a duplicated route. See `ProcessRouteItemMappingV1`'s
 * docstring on the backend for the full reasoning. */
export default function RouteItemMappingsFormV1({
  versionId,
  nodes,
  itemMappings,
  onSaved,
  onContinue,
}: {
  versionId: number
  nodes: RouteNodeV1[]
  itemMappings: RouteItemMappingV1[]
  onSaved: (version: ProcessRouteVersionV1) => void
  onContinue: () => void
}) {
  const roles = useMemo(() => rolesFor(nodes), [nodes])
  const [targetItems, setTargetItems] = useState<{ id: number; name: string }[]>([])
  const [activeTargetItemId, setActiveTargetItemId] = useState<number | null>(null)
  const [mappings, setMappings] = useState<Record<string, number>>({})
  const [itemsByGroup, setItemsByGroup] = useState<Record<number, Item[]>>({})
  const [candidateItems, setCandidateItems] = useState<Item[]>([])
  const [addingTargetItem, setAddingTargetItem] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const seen = new Map<number, string>()
    for (const mapping of itemMappings) {
      seen.set(mapping.target_item, mapping.target_item_name)
    }
    const initial = [...seen.entries()].map(([id, name]) => ({ id, name }))
    setTargetItems(initial)
    setActiveTargetItemId((prev) => prev ?? initial[0]?.id ?? null)

    const initialMappings: Record<string, number> = {}
    for (const mapping of itemMappings) {
      const role = roles.find(
        (r) =>
          (r.definitionType === 'input' && r.definitionId === mapping.input_definition) ||
          (r.definitionType === 'output' && r.definitionId === mapping.output_definition),
      )
      if (role) initialMappings[mappingKey(role, mapping.target_item)] = mapping.resolved_item
    }
    setMappings(initialMappings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId, itemMappings])

  useEffect(() => {
    const groupIds = [...new Set(roles.map((r) => r.itemGroup))]
    for (const groupId of groupIds) {
      if (itemsByGroup[groupId]) continue
      listItems({ itemGroup: groupId, isActive: true }).then((response) =>
        setItemsByGroup((prev) => ({ ...prev, [groupId]: response.results })),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles])

  useEffect(() => {
    if (!addingTargetItem) return
    listItems({ isActive: true }).then((response) =>
      setCandidateItems(
        response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD'),
      ),
    )
  }, [addingTargetItem])

  const persist = async (nextMappings: Record<string, number>) => {
    setSaving(true)
    setError(null)
    try {
      const payload: RouteItemMappingV1FormValues[] = []
      for (const targetItem of targetItems) {
        for (const role of roles) {
          const resolvedItem = nextMappings[mappingKey(role, targetItem.id)]
          if (!resolvedItem) continue
          const existing = itemMappings.find(
            (m) =>
              m.target_item === targetItem.id &&
              ((role.definitionType === 'input' && m.input_definition === role.definitionId) ||
                (role.definitionType === 'output' && m.output_definition === role.definitionId)),
          )
          payload.push({
            id: existing?.id,
            node: role.node.id,
            input_definition: role.definitionType === 'input' ? role.definitionId : null,
            output_definition: role.definitionType === 'output' ? role.definitionId : null,
            target_item: targetItem.id,
            resolved_item: resolvedItem,
          })
        }
      }
      const result = await saveRouteItemMappingsV1(versionId, { item_mappings: payload })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this mapping.')
    } finally {
      setSaving(false)
    }
  }

  const handleCellChange = (role: Role, targetItemId: number, resolvedItemId: number) => {
    const next = { ...mappings, [mappingKey(role, targetItemId)]: resolvedItemId }
    setMappings(next)
    void persist(next)
  }

  const handleAddTargetItem = (item: Item) => {
    setTargetItems((prev) => (prev.some((t) => t.id === item.id) ? prev : [...prev, { id: item.id, name: item.name }]))
    setActiveTargetItemId(item.id)
    setAddingTargetItem(false)
  }

  const activeTargetItem = targetItems.find((t) => t.id === activeTargetItemId)

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 16 }}>
        Which real item plays each role, per SKU size?
      </Text>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        The route above describes the chain generically, once. Here, for each real finished
        item/size, fill in which concrete item resolves at every step — the same route then works
        for every size you register.
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {roles.length === 0 && (
        <Text type="secondary">Add steps first (previous tab) before mapping items.</Text>
      )}

      {roles.length > 0 && (
        <>
          <Flex align="center" gap={8} style={{ marginBottom: 16 }} wrap="wrap">
            <Tabs
              activeKey={activeTargetItemId ? String(activeTargetItemId) : undefined}
              onChange={(key) => setActiveTargetItemId(Number(key))}
              items={targetItems.map((t) => ({ key: String(t.id), label: t.name }))}
              style={{ flex: 1, minWidth: 200 }}
            />
            {!addingTargetItem ? (
              <Button icon={<PlusOutlined />} onClick={() => setAddingTargetItem(true)}>
                Add Target Item
              </Button>
            ) : (
              <Select
                autoFocus
                open
                style={{ width: 280 }}
                placeholder="Search a finished/WIP item"
                showSearch
                optionFilterProp="label"
                options={candidateItems.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                onSelect={(value: number) => {
                  const item = candidateItems.find((i) => i.id === value)
                  if (item) handleAddTargetItem(item)
                }}
                onBlur={() => setAddingTargetItem(false)}
              />
            )}
          </Flex>

          {activeTargetItem ? (
            <Flex vertical gap={8}>
              {roles.map((role) => {
                const resolvedItemId = mappings[mappingKey(role, activeTargetItem.id)]
                const options = itemsByGroup[role.itemGroup] ?? []
                return (
                  <div
                    key={role.key}
                    style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}
                  >
                    <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
                      <div>
                        <Text strong>
                          {role.node.display_label || role.node.process_definition_name}
                        </Text>{' '}
                        <Tag color={role.definitionType === 'input' ? 'blue' : 'green'}>
                          {role.definitionType === 'input' ? 'Input' : 'Output'}
                        </Tag>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {role.itemGroupName}
                            {role.classificationName && ` — ${role.classificationName}`}
                          </Text>
                        </div>
                      </div>
                      <Select
                        style={{ width: 260 }}
                        placeholder="Select the concrete item"
                        showSearch
                        optionFilterProp="label"
                        value={resolvedItemId}
                        options={options.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                        onChange={(value: number) => handleCellChange(role, activeTargetItem.id, value)}
                      />
                    </Flex>
                  </div>
                )
              })}
            </Flex>
          ) : (
            <Text type="secondary">Add a target item to start mapping.</Text>
          )}
        </>
      )}

      <Flex justify="end" style={{ marginTop: 24 }}>
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>
    </>
  )
}
