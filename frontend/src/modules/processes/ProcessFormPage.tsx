import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Empty, Flex, Form, Input, Radio, Typography } from 'antd'
import { ApiError } from '../../shared/api/http'
import Step2InputsForm from './Step2InputsForm'
import Step3OutputsForm from './Step3OutputsForm'
import Step4WorkCentreForm from './Step4WorkCentreForm'
import Step5OutputCaptureForm from './Step5OutputCaptureForm'
import Step6ParametersForm from './Step6ParametersForm'
import Step7RulesForm from './Step7RulesForm'
import Step8Review from './Step8Review'
import { createProcess, getProcess, listProcessCategories, updateProcess } from './api'
import { PROCESS_WIZARD_STEPS } from './types'
import type { Process, ProcessBasicsValues, ProcessCategory, ProcessWizardStepKey } from './types'

const { Title, Text } = Typography

function slugifyCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export default function ProcessFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [process, setProcess] = useState<Process | null>(null)
  const isEdit = process !== null
  const [form] = Form.useForm<ProcessBasicsValues>()
  const [currentStep, setCurrentStep] = useState<ProcessWizardStepKey>('basics')
  const [loading, setLoading] = useState(Boolean(id))
  const [submitting, setSubmitting] = useState<'draft' | 'continue' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<ProcessCategory[]>([])
  const [codeTouched, setCodeTouched] = useState(Boolean(id))

  useEffect(() => {
    listProcessCategories({ isActive: true }).then((response) => setCategories(response.results))
  }, [])

  useEffect(() => {
    // Only fetches when landing directly on an existing process's URL — a
    // process created in-place during this session (see `save` below) is
    // already fully in hand from the create response, so re-fetching it
    // here would be a wasted request.
    if (!id) return
    getProcess(Number(id))
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
    let values: ProcessBasicsValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(mode)
    try {
      const saved = process ? await updateProcess(process.id, values) : await createProcess(values)
      setProcess(saved)
      if (mode === 'draft') {
        navigate('/processes')
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
      // Every other step's own editor persists as the user makes changes
      // (see Step2InputsForm) — nothing further to save here.
      navigate('/processes')
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/processes">Processes</Link> },
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
          style={{ width: 220, borderRight: '1px solid #f0f0f0', padding: '20px 0', flexShrink: 0 }}
        >
          {PROCESS_WIZARD_STEPS.map((step) => {
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
              <Form<ProcessBasicsValues> form={form} layout="vertical" disabled={loading}>
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
                          No process categories yet — <Link to="/process-categories/new">create one</Link> first
                          (e.g. Production, Packing, Quality), then come back to this step.
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
              <Step2InputsForm
                processName={process.name}
                versionId={process.version_id}
                inputs={process.inputs}
                batchLotMode={process.batch_lot_mode}
                onSaved={(result) =>
                  setProcess((prev) =>
                    prev ? { ...prev, inputs: result.inputs, batch_lot_mode: result.batch_lot_mode } : prev,
                  )
                }
                onContinue={() => setCurrentStep('outputs')}
              />
            ) : (
              <Empty description="Save Basics first to configure Inputs." style={{ paddingTop: 48 }} />
            ))}
          {currentStep === 'outputs' &&
            (process ? (
              <Step3OutputsForm
                processName={process.name}
                versionId={process.version_id}
                outputs={process.outputs}
                onSaved={(outputs) =>
                  setProcess((prev) => (prev ? { ...prev, outputs } : prev))
                }
                onContinue={() => setCurrentStep('work_centre')}
              />
            ) : (
              <Empty description="Save Basics first to configure Outputs." style={{ paddingTop: 48 }} />
            ))}
          {currentStep === 'work_centre' &&
            (process ? (
              <Step4WorkCentreForm
                processName={process.name}
                versionId={process.version_id}
                workCentreRequirement={process.work_centre_requirement}
                operatorRequired={process.operator_required}
                standardRateConfigLevel={process.standard_rate_config_level}
                onSaved={(values) =>
                  setProcess((prev) => (prev ? { ...prev, ...values } : prev))
                }
                onContinue={() => setCurrentStep('output_capture')}
              />
            ) : (
              <Empty
                description="Save Basics first to configure Work Centre."
                style={{ paddingTop: 48 }}
              />
            ))}
          {currentStep === 'output_capture' &&
            (process ? (
              <Step5OutputCaptureForm
                versionId={process.version_id}
                captureMode={process.capture_mode}
                positionLabel={process.position_label}
                defaultPositionCount={process.default_position_count}
                allowWorkCentreOverride={process.allow_work_centre_override}
                allowDifferentSkuPerPosition={process.allow_different_sku_per_position}
                onSaved={(values) =>
                  setProcess((prev) => (prev ? { ...prev, ...values } : prev))
                }
                onContinue={() => setCurrentStep('parameters')}
              />
            ) : (
              <Empty
                description="Save Basics first to configure Output Capture."
                style={{ paddingTop: 48 }}
              />
            ))}
          {currentStep === 'parameters' &&
            (process ? (
              <Step6ParametersForm
                versionId={process.version_id}
                parameters={process.parameters}
                allowManualStandardRate={process.allow_manual_standard_rate}
                reserveMachineDerivedRate={process.reserve_machine_derived_rate}
                onParametersSaved={(parameters) =>
                  setProcess((prev) => (prev ? { ...prev, parameters } : prev))
                }
                onPerformanceSaved={(values) =>
                  setProcess((prev) => (prev ? { ...prev, ...values } : prev))
                }
                onContinue={() => setCurrentStep('rules')}
              />
            ) : (
              <Empty
                description="Save Basics first to configure Parameters."
                style={{ paddingTop: 48 }}
              />
            ))}
          {currentStep === 'rules' &&
            (process ? (
              <Step7RulesForm
                versionId={process.version_id}
                transactionFrequency={process.transaction_frequency}
                batchLotMode={process.batch_lot_mode}
                partialOutputForward={process.partial_output_forward}
                allowOverProduction={process.allow_over_production}
                overProductionTolerancePercent={process.over_production_tolerance_percent}
                inputConsumptionMode={process.input_consumption_mode}
                completionMode={process.completion_mode}
                qcRequirement={process.qc_requirement}
                allowCorrectionWithAuditTrail={process.allow_correction_with_audit_trail}
                allowDestructiveDelete={process.allow_destructive_delete}
                permitMachineGeneratedSource={process.permit_machine_generated_source}
                onSaved={(values) => setProcess((prev) => (prev ? { ...prev, ...values } : prev))}
                onContinue={() => setCurrentStep('review')}
              />
            ) : (
              <Empty description="Save Basics first to configure Rules." style={{ paddingTop: 48 }} />
            ))}
          {currentStep === 'review' &&
            (process ? (
              <Step8Review
                process={process}
                onActivated={(result) =>
                  setProcess((prev) =>
                    prev ? { ...prev, version_status: result.version_status } : prev,
                  )
                }
                onEditStep={setCurrentStep}
              />
            ) : (
              <Empty description="Save Basics first to review this process." style={{ paddingTop: 48 }} />
            ))}
        </div>
      </Flex>
      </Card>
    </div>
  )
}
