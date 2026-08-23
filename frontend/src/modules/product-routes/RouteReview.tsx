import { useState } from 'react'
import { Alert, Button, Flex, Tag, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { activateRouteVersion } from './api'
import type { ProcessRoute, ProductRouteWizardStepKey } from './types'

const { Text } = Typography

export default function RouteReview({
  route,
  onActivated,
  onEditStep,
}: {
  route: ProcessRoute
  onActivated: (status: string) => void
  onEditStep: (step: ProductRouteWizardStepKey) => void
}) {
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleActivate = async () => {
    setActivating(true)
    setError(null)
    try {
      const result = await activateRouteVersion(route.version_id)
      onActivated(result.version_status)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate this route.')
    } finally {
      setActivating(false)
    }
  }

  const isActive = route.version_status === 'ACTIVE'
  const orderedNodes = [...route.nodes].sort((a, b) => a.sequence_hint - b.sequence_hint)

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        Review &quot;{route.name}&quot; before activating
      </Text>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Flex gap={12} style={{ marginBottom: 20 }}>
        <Text type="secondary">Item: {route.item_name}</Text>
        <Text type="secondary">Version: v{route.version_number}</Text>
        <Text type="secondary">Default: {route.is_default ? 'Yes' : 'No'}</Text>
      </Flex>

      <div style={{ marginBottom: 24, border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
        {orderedNodes.length === 0 && <Text type="secondary">No steps configured yet.</Text>}
        <Text>
          {orderedNodes
            .map((node) => node.display_label || node.process_definition_name)
            .join(' → ')}
        </Text>
        {orderedNodes
          .filter((node) => node.outputs.length > 1)
          .map((node) => (
            <div key={node.id} style={{ marginTop: 8, marginLeft: 16 }}>
              {node.outputs.map((output) => {
                const edge = route.edges.find(
                  (e) => e.source_node === node.id && e.source_output_definition === output.id,
                )
                const destination = edge
                  ? edge.disposition_type === 'CONTINUE_TO_PROCESS'
                    ? (orderedNodes.find((n) => n.id === edge.target_node)?.display_label ??
                      orderedNodes.find((n) => n.id === edge.target_node)?.process_definition_name ??
                      '—')
                    : edge.destination_location_name || '—'
                  : 'Not configured'
                return (
                  <div key={output.id}>
                    <Text type="secondary">
                      ├─ {output.classification_name} → {destination}
                    </Text>
                  </div>
                )
              })}
            </div>
          ))}
      </div>

      {isActive && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="This route is active."
        />
      )}

      <Flex justify="space-between">
        <Flex gap={8}>
          <Button onClick={() => onEditStep('steps')}>← Edit Steps</Button>
          <Button onClick={() => onEditStep('output_routing')}>Edit Output Routing</Button>
        </Flex>
        {!isActive && (
          <Button type="primary" loading={activating} onClick={() => void handleActivate()}>
            Activate Route
          </Button>
        )}
        {isActive && <Tag color="green">Active</Tag>}
      </Flex>
    </>
  )
}
