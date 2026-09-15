import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Empty, Flex, Form, Input, Radio, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import { listProcessCategories } from '../processes/api'
import type { ProcessCategory } from '../processes/types'
import ReviewV1 from './ReviewV1'
import Step2InputsFormV1 from './Step2InputsFormV1'
import Step3OutputsFormV1 from './Step3OutputsFormV1'
import { createProcessV1, getProcessV1, updateProcessV1 } from './api'
import { PROCESS_V1_WIZARD_STEPS } from './types'
import type { ProcessV1, ProcessV1BasicsValues, ProcessV1WizardStepKey } from './types'

const { Title, Text } = Typography

function slugifyCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Mirrors `apps/processes/ProcessFormPage.tsx`'s wizard shell, trimmed to
 * Basics/Inputs/Outputs/Review — this engine has no execution-orchestration
 * config (Work Centre, Output Capture, Parameters, Rules) since there's no
 * recording consumer built against it yet. Its own Settings tab
 * ("Processes V1"), separate from the original Processes module, which it
 * leaves completely untouched.
 */
export default function ProcessV1FormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [process, setProcess] = useState<ProcessV1 | null>(null)
  const isEdit = process !== null
  const [form] = Form.useForm<ProcessV1BasicsValues>()
  const [currentStep, setCurrentStep] = useState<ProcessV1WizardStepKey>('basics')
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState<'draft' | 'continue' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [codeTouched, setCodeTouched] = useState(Boolean(id))

  useEffect(() => {
    listProcessCategories({ isActive: true }).then((response) => setCategories(response.results))
  }, [])

  useEffect(() => {
    if (!id) return
    getProcessV1(Number(id))
      .then((loaded) => {
        setProcess(loaded)
        form.setFieldsValue({
          name: loaded.name,
          code: loaded.code,
          category: loaded.category,
          description: loaded.description,
        })
      })
      .catch(() => setError('Could not load this process.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleNameChange = (value: string) => {
    if (!codeTouched) {
      form.setFieldValue('code', slugifyCode(value))
    }
  }

  const saveBasics = async (mode: 'draft' | 'continue') => {
    let values: ProcessV1BasicsValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(mode)
    try {
      const saved = process
        ? await updateProcessV1(process.id, values)
        : await createProcessV1(values)
      setProcess(saved)
      if (mode === 'draft') {
        navigate('/processes-v1')
      } else {
        setCurrentStep('inputs')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this process.')
    } finally {
      setSubmitting(null)
    }
  }

  const handleSaveDraft = () => {
    if (currentStep === 'basics') {
      void saveBasics('draft')
    } else {
      navigate('/processes-v1')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/processes-v1">Processes V1</Link> },
          { title: isEdit ? 'Edit Process' : 'Create Process' },
        ]}
      />
      <Card style={{ maxWidth: 960, margin: '0 auto' }} styles={{ body: { padding: 0 } }}>
        <Flex
          justify="space-between"
          align="center"
          style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}
        >
          <Title level={4} style={{ margin: 0 }}>
            {isEdit ? 'Edit Process' : 'Create Process'}
          </Title>
          <Button loading={submitting === 'draft'} onClick={handleSaveDraft}>
            Save Draft
          </Button>
        </Flex>
        <Flex align="stretch">
          <div
            style={{
              width: 220,
              borderRight: '1px solid #f0f0f0',
              padding: '20px 0',
              flexShrink: 0,
            }}
          >
            {PROCESS_V1_WIZARD_STEPS.map((step) => {
              const active = step.key === currentStep
              return (
                <div
                  key={step.key}
                  role="button"
                  onClick={() => setCurrentStep(step.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 24px',
                    cursor: 'pointer',
                    color: active ? '#155eef' : 'inherit',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: `2px solid ${active ? '#155eef' : '#d9d9d9'}`,
                      background: active ? '#155eef' : 'transparent',
                      flexShrink: 0,
                    }}
                  />
                  {step.label}
                </div>
              )
            })}
          </div>
          <div style={{ flex: 1, padding: '24px 32px', minWidth: 0 }}>
            {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
            {currentStep === 'basics' && (
              <>
                <Text strong style={{ display: 'block', marginBottom: 20, fontSize: 16 }}>
                  Let&apos;s configure this process
                </Text>
                <Form<ProcessV1BasicsValues> form={form} layout="vertical" disabled={loading}>
                  <Form.Item
                    label="What should this process be called?"
                    name="name"
                    rules={[{ required: true, message: 'Enter a process name.' }]}
                  >
                    <Input size="large" onChange={(e) => handleNameChange(e.target.value)} />
                  </Form.Item>
                  <Form.Item
                    label="Process Code"
                    name="code"
                    rules={[{ required: true, message: 'Enter a process code.' }]}
                  >
                    <Input size="large" disabled={isEdit} onChange={() => setCodeTouched(true)} />
                  </Form.Item>
                  <Form.Item
                    label="Where will this process normally be used?"
                    name="category"
                    rules={[{ required: true, message: 'Select where this process is used.' }]}
                  >
                    {categories.length > 0 ? (
                      <Radio.Group>
                        <Flex vertical gap={8}>
                          {categories.map((category) => (
                            <Radio key={category.id} value={category.id}>
                              {category.name}
                            </Radio>
                          ))}
                        </Flex>
                      </Radio.Group>
                    ) : (
                      <Empty
                        description={
                          <Text type="secondary">
                            No process categories yet —{' '}
                            <Link to="/process-categories/new">create one</Link> first, then come
                            back to this step.
                          </Text>
                        }
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        style={{ margin: '8px 0' }}
                      />
                    )}
                  </Form.Item>
                  <Form.Item label="Description (optional)" name="description">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Form>
                <Flex justify="end">
                  <Button
                    type="primary"
                    loading={submitting === 'continue'}
                    onClick={() => void saveBasics('continue')}
                  >
                    Continue →
                  </Button>
                </Flex>
              </>
            )}
            {currentStep === 'inputs' &&
              (process ? (
                <Step2InputsFormV1
                  processName={process.name}
                  versionId={process.version_id}
                  inputs={process.inputs}
                  onSaved={(inputs) => setProcess((prev) => (prev ? { ...prev, inputs } : prev))}
                  onContinue={() => setCurrentStep('outputs')}
                />
              ) : (
                <Empty description="Save Basics first to configure Inputs." style={{ paddingTop: 48 }} />
              ))}
            {currentStep === 'outputs' &&
              (process ? (
                <Step3OutputsFormV1
                  processName={process.name}
                  versionId={process.version_id}
                  outputs={process.outputs}
                  onSaved={(outputs) => setProcess((prev) => (prev ? { ...prev, outputs } : prev))}
                  onContinue={() => setCurrentStep('review')}
                />
              ) : (
                <Empty
                  description="Save Basics first to configure Outputs."
                  style={{ paddingTop: 48 }}
                />
              ))}
            {currentStep === 'review' &&
              (process ? (
                <ReviewV1
                  process={process}
                  onActivated={(result) =>
                    setProcess((prev) =>
                      prev ? { ...prev, version_status: result.version_status } : prev,
                    )
                  }
                  onEditStep={setCurrentStep}
                />
              ) : (
                <Empty
                  description="Save Basics first to review this process."
                  style={{ paddingTop: 48 }}
                />
              ))}
          </div>
        </Flex>
      </Card>
    </div>
  )
}
