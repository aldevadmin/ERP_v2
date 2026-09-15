import { useState } from 'react'
import { Alert, Button, Flex, Tag, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { activateProcessV1 } from './api'
import type { ActivationResultV1, ProcessV1, ProcessV1WizardStepKey } from './types'

const { Text } = Typography

export default function ReviewV1({
  process,
  onActivated,
  onEditStep,
}: {
  process: ProcessV1
  onActivated: (result: ActivationResultV1) => void
  onEditStep: (step: ProcessV1WizardStepKey) => void
}) {
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activated, setActivated] = useState(false)

  const handleActivate = async () => {
    setActivating(true)
    setError(null)
    try {
      const result = await activateProcessV1(process.version_id)
      setActivated(true)
      onActivated(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate this process.')
    } finally {
      setActivating(false)
    }
  }

  const isActive = process.version_status === 'ACTIVE' || activated

  return (
    <>
      <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
        Review &quot;{process.name}&quot; before activating
      </Text>

      <div style={{ marginBottom: 24, border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
        <Flex justify="space-between" align="flex-start" gap={16}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              INPUTS
            </Text>
            {process.inputs.length === 0 ? (
              <Text type="secondary">None configured</Text>
            ) : (
              process.inputs.map((input) => (
                <div key={input.id}>
                  <Text>{input.item_group_name}</Text>
                </div>
              ))
            )}
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              alignSelf: 'center',
              background: '#f5f7ff',
              borderRadius: 6,
              padding: '12px 8px',
            }}
          >
            <Text strong style={{ textTransform: 'uppercase' }}>
              {process.name}
            </Text>
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
              OUTPUTS
            </Text>
            {process.outputs.length === 0 ? (
              <Text type="secondary">None configured</Text>
            ) : (
              process.outputs.map((output) => (
                <div key={output.id}>
                  <Text>{output.item_group_name}</Text>{' '}
                  {output.classification_name && <Tag>{output.classification_name}</Tag>}
                </div>
              ))
            )}
          </div>
        </Flex>
      </div>

      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      {isActive && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="This process is active."
        />
      )}

      <Flex justify="space-between">
        <Flex gap={8}>
          <Button onClick={() => onEditStep('inputs')}>← Edit Inputs</Button>
          <Button onClick={() => onEditStep('outputs')}>Edit Outputs</Button>
        </Flex>
        {!isActive && (
          <Button type="primary" loading={activating} onClick={() => void handleActivate()}>
            Save & Activate
          </Button>
        )}
      </Flex>
    </>
  )
}
