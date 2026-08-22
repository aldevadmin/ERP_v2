import { useEffect, useState } from 'react'
import { Alert, Button, Flex, Select, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listStorageLocations, saveRouteEdges } from './api'
import type {
  ProcessRouteVersion,
  RouteEdge,
  RouteEdgeDisposition,
  RouteEdgeFormValues,
  RouteNode,
  RouteNodeOutput,
  StorageLocation,
} from './types'

const { Text } = Typography

interface OutputRowState {
  disposition_type: RouteEdgeDisposition | undefined
  target_node: number | null
  destination_location: number | null
}

function keyFor(nodeId: number, outputId: number): string {
  return `${nodeId}:${outputId}`
}

export default function RouteOutputRoutingForm({
  versionId,
  nodes,
  edges,
  onSaved,
  onContinue,
}: {
  versionId: number
  nodes: RouteNode[]
  edges: RouteEdge[]
  onSaved: (version: ProcessRouteVersion) => void
  onContinue: () => void
}) {
  const branchingNodes = nodes.filter((node) => node.outputs.length > 1)
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [rows, setRows] = useState<Record<string, OutputRowState>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listStorageLocations({ isActive: true }).then((response) => setLocations(response.results))
  }, [])

  useEffect(() => {
    const initial: Record<string, OutputRowState> = {}
    for (const node of branchingNodes) {
      for (const output of node.outputs) {
        const existing = edges.find(
          (e) => e.source_node === node.id && e.source_output_definition === output.id,
        )
        initial[keyFor(node.id, output.id)] = {
          disposition_type: existing?.disposition_type,
          target_node: existing?.target_node ?? null,
          destination_location: existing?.destination_location ?? null,
        }
      }
    }
    setRows(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId])

  const updateRow = (nodeId: number, outputId: number, partial: Partial<OutputRowState>) => {
    setRows((prev) => ({
      ...prev,
      [keyFor(nodeId, outputId)]: { ...prev[keyFor(nodeId, outputId)], ...partial },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const linearEdges: RouteEdgeFormValues[] = edges
        .filter((e) => e.source_output_definition === null)
        .map((e) => ({
          id: e.id,
          source_node: e.source_node,
          source_output_definition: null,
          target_node: e.target_node,
          disposition_type: e.disposition_type,
          destination_location: e.destination_location,
        }))

      const branchingEdges: RouteEdgeFormValues[] = []
      for (const node of branchingNodes) {
        for (const output of node.outputs) {
          const row = rows[keyFor(node.id, output.id)]
          if (!row?.disposition_type) continue
          const existing = edges.find(
            (e) => e.source_node === node.id && e.source_output_definition === output.id,
          )
          branchingEdges.push({
            id: existing?.id,
            source_node: node.id,
            source_output_definition: output.id,
            target_node: row.disposition_type === 'CONTINUE_TO_PROCESS' ? row.target_node : null,
            disposition_type: row.disposition_type,
            destination_location:
              row.disposition_type === 'MOVE_TO_STORAGE' ? row.destination_location : null,
          })
        }
      }

      const result = await saveRouteEdges(versionId, { edges: [...linearEdges, ...branchingEdges] })
      onSaved(result)
      onContinue()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save output routing.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        Configure what happens to each output
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {branchingNodes.length === 0 && (
        <Text type="secondary">
          No steps in this route produce more than one output — nothing to configure here.
        </Text>
      )}

      {branchingNodes.map((node) => (
        <div key={node.id} style={{ marginBottom: 32 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            {(node.display_label || node.process_definition_name).toUpperCase()}
          </Text>
          {node.outputs.map((output: RouteNodeOutput) => {
            const row = rows[keyFor(node.id, output.id)] ?? {
              disposition_type: undefined,
              target_node: null,
              destination_location: null,
            }
            return (
              <div
                key={output.id}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 12,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Output: {output.item_label} ({output.classification_name})
                </Text>
                <Flex gap={12} wrap="wrap">
                  <div>
                    <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      Next action
                    </Text>
                    <Select
                      aria-label={`Next action for ${output.item_label}`}
                      style={{ width: 200 }}
                      placeholder="Select an action"
                      value={row.disposition_type}
                      onChange={(value: RouteEdgeDisposition) =>
                        updateRow(node.id, output.id, { disposition_type: value })
                      }
                      options={[
                        { value: 'CONTINUE_TO_PROCESS', label: 'Continue to Process' },
                        { value: 'MOVE_TO_STORAGE', label: 'Move / Store' },
                      ]}
                    />
                  </div>
                  {row.disposition_type === 'CONTINUE_TO_PROCESS' && (
                    <div>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        Next process
                      </Text>
                      <Select
                        aria-label={`Next process for ${output.item_label}`}
                        style={{ width: 220 }}
                        placeholder="Select a step"
                        value={row.target_node ?? undefined}
                        onChange={(value: number) =>
                          updateRow(node.id, output.id, { target_node: value })
                        }
                        options={nodes
                          .filter((n) => n.id !== node.id)
                          .map((n) => ({
                            value: n.id,
                            label: n.display_label || n.process_definition_name,
                          }))}
                      />
                    </div>
                  )}
                  {row.disposition_type === 'MOVE_TO_STORAGE' && (
                    <div>
                      <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                        Destination
                      </Text>
                      <Select
                        aria-label={`Destination for ${output.item_label}`}
                        style={{ width: 220 }}
                        placeholder="Select a location"
                        value={row.destination_location ?? undefined}
                        onChange={(value: number) =>
                          updateRow(node.id, output.id, { destination_location: value })
                        }
                        options={locations.map((l) => ({ value: l.id, label: l.name }))}
                      />
                    </div>
                  )}
                </Flex>
              </div>
            )
          })}
        </div>
      ))}

      <Flex justify="end">
        <Button type="primary" loading={saving} onClick={() => void handleSave()}>
          Save & Continue →
        </Button>
      </Flex>
    </>
  )
}
