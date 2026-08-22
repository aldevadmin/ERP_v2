import { useState } from 'react'
import { Alert, Button, Flex, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import AddEditStepModal from './AddEditStepModal'
import { saveRouteNodes } from './api'
import type { ProcessRouteVersion, RouteNode, RouteNodeFormValues } from './types'

const { Text } = Typography

function toFormValues(rows: RouteNode[]): RouteNodeFormValues[] {
  return rows.map((row) => ({
    id: row.id,
    node_key: row.node_key,
    process_definition: row.process_definition,
    display_label: row.display_label,
    is_optional: row.is_optional,
  }))
}

export default function RouteStepsForm({
  productName,
  versionId,
  nodes,
  onSaved,
  onContinue,
}: {
  productName: string
  versionId: number
  nodes: RouteNode[]
  onSaved: (version: ProcessRouteVersion) => void
  onContinue: () => void
}) {
  const [editingNode, setEditingNode] = useState<RouteNode | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persist = async (nextNodes: RouteNodeFormValues[]) => {
    setSaving(true)
    setError(null)
    try {
      const result = await saveRouteNodes(versionId, { nodes: nextNodes })
      onSaved(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save steps.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNode = async (values: RouteNodeFormValues) => {
    const nextValues = toFormValues(nodes)
    const existingIndex =
      editingNode && editingNode !== 'new' ? nodes.findIndex((row) => row.id === editingNode.id) : -1
    if (existingIndex >= 0) {
      nextValues[existingIndex] = values
    } else {
      nextValues.push(values)
    }
    await persist(nextValues)
    setEditingNode(null)
  }

  const handleDelete = (node: RouteNode) => {
    const nextValues = toFormValues(nodes).filter((row) => row.id !== node.id)
    void persist(nextValues)
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= nodes.length) return
    const nextValues = toFormValues(nodes)
    const [moved] = nextValues.splice(index, 1)
    nextValues.splice(targetIndex, 0, moved)
    void persist(nextValues)
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        How is &quot;{productName}&quot; processed?
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        {nodes.length === 0 && <Text type="secondary">No steps added yet.</Text>}
        {nodes.map((node, index) => (
          <div
            key={node.id}
            style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}
          >
            <Flex justify="space-between" align="center">
              <div>
                <Text strong>
                  {index + 1} {node.display_label || node.process_definition_name}
                </Text>
                {node.display_label && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {node.process_definition_name}
                    </Text>
                  </div>
                )}
                {node.is_optional && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Optional step
                    </Text>
                  </div>
                )}
              </div>
              <Flex gap={8}>
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  aria-label={`Move ${node.process_definition_name} up`}
                  disabled={index === 0}
                  onClick={() => handleMove(index, -1)}
                />
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  aria-label={`Move ${node.process_definition_name} down`}
                  disabled={index === nodes.length - 1}
                  onClick={() => handleMove(index, 1)}
                />
                <Button size="small" icon={<EditOutlined />} onClick={() => setEditingNode(node)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`Delete ${node.process_definition_name}`}
                  onClick={() => handleDelete(node)}
                />
              </Flex>
            </Flex>
          </div>
        ))}
      </Flex>
      <Button onClick={() => setEditingNode('new')} style={{ marginBottom: 24 }}>
        + Add Step
      </Button>

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={onContinue}>
          Save & Continue →
        </Button>
      </Flex>

      <AddEditStepModal
        open={editingNode !== null}
        node={editingNode === 'new' ? null : editingNode}
        onClose={() => setEditingNode(null)}
        onSave={handleSaveNode}
      />
    </>
  )
}
