import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listCustomerProductMappings } from '../customer-mappings/api'
import type { CustomerProductMapping } from '../customer-mappings/types'
import { listItems, listUOMs } from '../items/api'
import type { Item, UOM } from '../items/types'
import {
  createPackagingProfile,
  getPackagingProfile,
  getPackagingProfileVersion,
  newPackagingProfileDraft,
  publishPackagingProfileVersion,
  savePackagingMaterials,
  updatePackagingProfile,
  updatePackagingProfileVersion,
} from './api'
import { PACKAGING_MATERIAL_LEVEL_OPTIONS, PACKAGING_PROFILE_SCOPE_OPTIONS, PACK_MODE_OPTIONS } from './types'
import type {
  PackagingMaterialRow,
  PackagingProfile,
  PackagingProfileFormValues,
  PackagingProfileVersion,
} from './types'

const { Title, Text } = Typography

function Suggestion({ value, onUse }: { value: string | null; onUse: () => void }) {
  if (!value) return null
  return (
    <div style={{ marginTop: -16, marginBottom: 16, fontSize: 13, color: '#8c8c8c' }}>
      Suggested: <span style={{ fontFamily: 'monospace' }}>{value}</span>{' '}
      <Typography.Link onClick={onUse}>Use</Typography.Link>
    </div>
  )
}

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'materials', label: 'Materials' },
  { key: 'specifications', label: 'Specifications' },
  { key: 'review', label: 'Review' },
] as const
type StepKey = (typeof STEPS)[number]['key']

export default function PackagingProfileFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const [basicsForm] = Form.useForm<PackagingProfileFormValues>()
  const [specForm] = Form.useForm()

  const [profile, setProfile] = useState<PackagingProfile | null>(null)
  const [version, setVersion] = useState<PackagingProfileVersion | null>(null)
  const [currentStep, setCurrentStep] = useState<StepKey>('basics')
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finishedItems, setFinishedItems] = useState<Item[]>([])
  const [packagingItems, setPackagingItems] = useState<Item[]>([])
  const [uoms, setUoms] = useState<UOM[]>([])
  const [materialRows, setMaterialRows] = useState<PackagingMaterialRow[]>([])
  const [mappings, setMappings] = useState<CustomerProductMapping[]>([])
  // Most profiles target a Finished Good — WIP is the occasional case
  // (packing an intermediate stage before it's fully finished), so it
  // starts hidden to keep the common list short, with this as the easy way
  // back in rather than a permanent, always-mixed list.
  const [includeWip, setIncludeWip] = useState(false)
  // Pieces per Pouch/Box live here on Basics (not Specifications) because
  // they're what actually distinguishes one profile from another for the
  // same finished item (e.g. a 300-piece box vs. a 100-piece box), and
  // because Name/Code suggestions need them before the user ever reaches
  // Specifications. They still persist onto the *version* (via
  // `updatePackagingProfileVersion` inside `saveBasics`), not the profile,
  // so the immutable-once-published guarantee for packing math is
  // unchanged — only where they're captured in the wizard has moved, not
  // where the fact lives. Pouches per Box (`pouchesPerBox` below) is
  // derived, not entered directly.
  const [piecesPerPouch, setPiecesPerPouch] = useState<number | null>(null)
  const [piecesPerBox, setPiecesPerBox] = useState<number | null>(null)

  const editable = !version || version.status === 'DRAFT'
  // Name/Scope/Active are just descriptive metadata on the stable profile
  // row — safe to edit anytime, unlike Materials/Specifications which live
  // on the (intentionally frozen-once-published) version. Finished Item is
  // the one Basics field that still needs its own lock: once ANY version of
  // this profile has ever been published (not just the current one — a new
  // draft flips `version.status` back to DRAFT, which would otherwise
  // reopen this), changing it would retroactively redefine what an
  // already-published, possibly Customer-Mapping-pinned version means. The
  // backend enforces this same rule independently (`PackagingProfileSerializer.validate`).
  const finishedItemLocked =
    version !== null && (version.status !== 'DRAFT' || version.version_number > 1)

  useEffect(() => {
    listItems({ isActive: true }).then((response) =>
      setFinishedItems(response.results.filter((i) => i.item_class === 'WIP' || i.item_class === 'FINISHED_GOOD')),
    )
    listItems({ isActive: true, itemClass: 'PACKAGING_MATERIAL' }).then((response) =>
      setPackagingItems(response.results),
    )
    listUOMs({ isActive: true }).then((response) => setUoms(response.results))
  }, [])

  const loadVersion = useCallback(
    (versionId: number) => {
      getPackagingProfileVersion(versionId).then((v) => {
        setVersion(v)
        specForm.setFieldsValue(v)
        setMaterialRows(
          v.materials.map((m) => ({
            id: m.id,
            item: m.item,
            level: m.level,
            quantity: Number(m.quantity),
            uom: m.uom,
          })),
        )
        setPiecesPerPouch(v.pieces_per_pouch)
        setPiecesPerBox(
          v.pieces_per_pouch && v.pouches_per_carton
            ? v.pieces_per_pouch * v.pouches_per_carton
            : null,
        )
      })
    },
    [specForm],
  )

  useEffect(() => {
    if (!id) return
    getPackagingProfile(Number(id))
      .then((data) => {
        setProfile(data)
        basicsForm.setFieldsValue(data)
        if (data.current_version) {
          loadVersion(data.current_version.id)
        }
      })
      .catch(() => setError('Could not load this profile.'))
      .finally(() => setLoading(false))
    listCustomerProductMappings({ packagingProfile: Number(id) }).then((response) =>
      setMappings(response.results),
    )
  }, [id, basicsForm, loadVersion])

  const saveBasics = async () => {
    let values: PackagingProfileFormValues
    try {
      values = await basicsForm.validateFields()
    } catch {
      return
    }
    if ((piecesPerPouch != null) !== (piecesPerBox != null)) {
      setError('Enter both Pieces per Pouch and Pieces per Box, or leave both blank.')
      return
    }
    if (piecesPerPouch != null && piecesPerBox != null && !pouchesPerBoxValid) {
      setError('Pieces per Box must be an exact multiple of Pieces per Pouch.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      let versionId: number | undefined
      if (profile) {
        const updated = await updatePackagingProfile(profile.id, values)
        setProfile(updated)
        versionId = version?.id
      } else {
        const created = await createPackagingProfile(values)
        setProfile(created)
        versionId = created.current_version?.id
        navigate(`/packaging-profiles/${created.id}/edit`, { replace: true })
      }
      // Pack quantities are version-level (see the state comment above) —
      // only worth (re)saving while the version is still a draft, same
      // rule Materials/Specifications already follow.
      if (versionId && editable && piecesPerPouch != null && pouchesPerBox != null) {
        const patched = await updatePackagingProfileVersion(versionId, {
          pieces_per_pouch: piecesPerPouch,
          pouches_per_carton: pouchesPerBox,
          pack_mode: 'CARTON',
        })
        setVersion(patched)
        specForm.setFieldsValue(patched)
        setMaterialRows(
          patched.materials.map((m) => ({
            id: m.id,
            item: m.item,
            level: m.level,
            quantity: Number(m.quantity),
            uom: m.uom,
          })),
        )
      } else if (versionId) {
        loadVersion(versionId)
      }
      setCurrentStep('materials')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveMaterials = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const saved = await savePackagingMaterials(version.id, materialRows)
      setVersion(saved)
      setCurrentStep('specifications')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save materials.')
    } finally {
      setSubmitting(false)
    }
  }

  const saveSpecifications = async () => {
    if (!version) return
    let values: Record<string, unknown>
    try {
      values = await specForm.validateFields()
    } catch {
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const saved = await updatePackagingProfileVersion(version.id, values)
      setVersion(saved)
      setCurrentStep('review')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save specifications.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePublish = async () => {
    if (!version) return
    setError(null)
    setSubmitting(true)
    try {
      const published = await publishPackagingProfileVersion(version.id)
      setVersion(published)
      message.success('Packaging profile published.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish this profile.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewDraft = async () => {
    if (!version) return
    setSubmitting(true)
    try {
      const draft = await newPackagingProfileDraft(version.id)
      loadVersion(draft.id)
      message.success('New draft version created.')
      setCurrentStep('materials')
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create a new draft.')
    } finally {
      setSubmitting(false)
    }
  }

  const addMaterialRow = () => {
    setMaterialRows((prev) => [...prev, { item: 0, level: 'CARTON', quantity: 1, uom: 0 }])
  }

  const updateMaterialRow = (index: number, patch: Partial<PackagingMaterialRow>) => {
    setMaterialRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeMaterialRow = (index: number) => {
    setMaterialRows((prev) => prev.filter((_, i) => i !== index))
  }

  const pageTitle = isEdit ? 'Edit Packaging Profile' : 'Create Packaging Profile'
  const uomOptions = uoms.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))

  const finishedItemId = Form.useWatch('finished_item', basicsForm) as number | undefined
  const selectedFinishedItem = finishedItems.find((i) => i.id === finishedItemId)
  // A finished item can have more than one profile (e.g. a customer
  // template alongside the standard one), so this is only a starting
  // point, not a guaranteed-unique value — the backend's own uniqueness
  // check on `code` catches a collision the same way it already does for
  // an untouched suggestion on the Item form.
  const pouchesPerBox =
    piecesPerPouch != null && piecesPerBox != null ? piecesPerBox / piecesPerPouch : null
  const pouchesPerBoxValid = pouchesPerBox === null || Number.isInteger(pouchesPerBox)
  // Explicit about the pack structure in the suggestion itself —
  // {totalPieces}_{piecesPerPouch}x{pouches} — e.g. "300_50x6" reads as
  // "300 total, 50 per pouch, 6 pouches per box", which is what actually
  // distinguishes one profile from another for the same finished item.
  // Falls back to the plain item name/code until both quantities (and
  // their exact-multiple relationship) are filled in.
  const packSuffix =
    piecesPerPouch != null && piecesPerBox != null && pouchesPerBoxValid
      ? `${piecesPerBox}_${piecesPerPouch}x${pouchesPerBox}`
      : null
  const suggestedCode = selectedFinishedItem
    ? packSuffix
      ? `${selectedFinishedItem.code}-${packSuffix}`
      : `${selectedFinishedItem.code}-PKG`
    : null
  const suggestedName = selectedFinishedItem
    ? packSuffix
      ? `${selectedFinishedItem.name} (${packSuffix})`
      : `${selectedFinishedItem.name} Packaging`
    : null

  // Keep whichever item is already selected visible even with the toggle
  // off — flipping "Include WIP" off should never silently blank out an
  // existing WIP selection, only hide it from the picker for *new* choices.
  const finishedItemOptions = finishedItems
    .filter((i) => includeWip || i.item_class === 'FINISHED_GOOD' || i.id === finishedItemId)
    .map((i) => ({ value: i.id, label: `${i.name} | (${i.code})` }))

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <Link to="/settings">Settings</Link> },
          { title: <Link to="/packaging-profiles">Packaging Profiles</Link> },
          { title: pageTitle },
        ]}
      />
      <Card style={{ maxWidth: 960, margin: '0 auto' }} styles={{ body: { padding: 0 } }} loading={loading}>
        <Flex justify="space-between" align="center" style={{ padding: '20px 24px', borderBottom: '1px solid #f0f0f0' }}>
          <Title level={4} style={{ margin: 0 }}>
            {pageTitle}
          </Title>
          {version && (
            <Tag color={version.status === 'PUBLISHED' ? 'green' : version.status === 'DRAFT' ? 'default' : 'orange'}>
              v{version.version_number} — {version.status}
            </Tag>
          )}
        </Flex>
        <Flex align="stretch">
          <div style={{ width: 200, borderRight: '1px solid #f0f0f0', padding: '20px 0', flexShrink: 0 }}>
            {STEPS.map((step) => (
              <div
                key={step.key}
                role="button"
                onClick={() => {
                  setError(null)
                  setCurrentStep(step.key)
                }}
                style={{
                  padding: '10px 24px',
                  cursor: 'pointer',
                  color: step.key === currentStep ? '#155eef' : 'inherit',
                  fontWeight: step.key === currentStep ? 600 : 400,
                }}
              >
                {step.label}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: '24px 32px', minWidth: 0 }}>
            {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

            {currentStep === 'basics' && (
              <Form<PackagingProfileFormValues>
                form={basicsForm}
                layout="vertical"
                disabled={loading}
                initialValues={{ scope: 'STANDARD', is_active: true }}
              >
                <Form.Item
                  label="Finished Item"
                  name="finished_item"
                  rules={[{ required: true, message: 'Select the finished item.' }]}
                  extra={
                    finishedItemLocked ? (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        Locked — a version of this profile has already been published, so
                        changing the finished item would redefine what that version means.
                      </Text>
                    ) : (
                      <Flex align="center" gap={8} style={{ marginTop: 4 }}>
                        <Switch
                          size="small"
                          aria-label="Include WIP items"
                          checked={includeWip}
                          onChange={setIncludeWip}
                        />
                        <Text type="secondary" style={{ fontSize: 13 }}>
                          Include WIP items — for packing an intermediate stage, not a Finished
                          Good
                        </Text>
                      </Flex>
                    )
                  }
                >
                  <Select
                    size="large"
                    showSearch
                    optionFilterProp="label"
                    disabled={finishedItemLocked}
                    options={finishedItemOptions}
                  />
                </Form.Item>
                <Form.Item
                  label="Pieces per Pouch / Box (optional)"
                  tooltip="What actually distinguishes one packing profile from another for the same finished item — e.g. a 300-piece box vs. a 100-piece box. Pouches per Box is worked out automatically. Leave both blank if this profile doesn't pack into pouches/cartons at all."
                >
                  <Flex align="center" gap={12} wrap="wrap">
                    <InputNumber
                      min={1}
                      style={{ width: 170 }}
                      placeholder="Pieces per Pouch"
                      disabled={!editable}
                      value={piecesPerPouch}
                      onChange={setPiecesPerPouch}
                    />
                    <InputNumber
                      min={1}
                      style={{ width: 170 }}
                      placeholder="Pieces per Box"
                      disabled={!editable}
                      value={piecesPerBox}
                      onChange={setPiecesPerBox}
                    />
                    {pouchesPerBox !== null && (
                      <Text type={pouchesPerBoxValid ? 'secondary' : 'danger'} style={{ fontSize: 13 }}>
                        {pouchesPerBoxValid
                          ? `= ${pouchesPerBox} pouches per box`
                          : 'Pieces per Box must be an exact multiple of Pieces per Pouch.'}
                      </Text>
                    )}
                  </Flex>
                </Form.Item>
                <Form.Item label="Profile Code" name="code" rules={[{ required: true, message: 'Enter a code.' }]}>
                  <Input size="large" disabled={isEdit} />
                </Form.Item>
                {!isEdit && (
                  <Suggestion
                    value={suggestedCode}
                    onUse={() => basicsForm.setFieldValue('code', suggestedCode)}
                  />
                )}
                <Form.Item label="Profile Name" name="name" rules={[{ required: true, message: 'Enter a name.' }]}>
                  <Input size="large" />
                </Form.Item>
                {!isEdit && (
                  <Suggestion
                    value={suggestedName}
                    onUse={() => basicsForm.setFieldValue('name', suggestedName)}
                  />
                )}
                <Form.Item label="Scope" name="scope">
                  <Radio.Group options={PACKAGING_PROFILE_SCOPE_OPTIONS} optionType="button" />
                </Form.Item>
                <Form.Item label="Active" name="is_active" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Flex justify="end">
                  <Button type="primary" loading={submitting} onClick={() => void saveBasics()}>
                    Save &amp; Continue →
                  </Button>
                </Flex>
              </Form>
            )}

            {currentStep === 'materials' &&
              (profile ? (
                <>
                  <Text strong style={{ display: 'block', marginBottom: 16 }}>
                    What packaging materials does this profile use?
                  </Text>
                  <Table<PackagingMaterialRow>
                    rowKey={(_, i) => String(i)}
                    dataSource={materialRows}
                    pagination={false}
                    tableLayout="fixed"
                    locale={{ emptyText: 'No materials yet.' }}
                    columns={[
                      {
                        title: 'Item',
                        dataIndex: 'item',
                        width: '45%',
                        ellipsis: true,
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: '100%' }}
                            // The trigger truncates a long item name to fit its
                            // fixed column (see `tableLayout="fixed"` above) —
                            // the open dropdown shouldn't inherit that same
                            // narrow width, or the full name becomes unreadable
                            // exactly when the user is trying to pick it.
                            popupMatchSelectWidth={false}
                            disabled={!editable}
                            value={value || undefined}
                            placeholder="Select item"
                            showSearch
                            optionFilterProp="label"
                            options={packagingItems.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))}
                            onChange={(v) => {
                              const selected = packagingItems.find((i) => i.id === v)
                              updateMaterialRow(index, { item: v, uom: selected?.inventory_uom ?? 0 })
                            }}
                          />
                        ),
                      },
                      {
                        title: 'Level',
                        dataIndex: 'level',
                        width: 140,
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: '100%' }}
                            disabled={!editable}
                            value={value}
                            options={PACKAGING_MATERIAL_LEVEL_OPTIONS}
                            onChange={(v) => updateMaterialRow(index, { level: v })}
                          />
                        ),
                      },
                      {
                        title: 'Quantity',
                        dataIndex: 'quantity',
                        width: 120,
                        render: (value, _row, index) => (
                          <InputNumber
                            min={0}
                            style={{ width: '100%' }}
                            disabled={!editable}
                            value={value}
                            onChange={(v) => updateMaterialRow(index, { quantity: v ?? 0 })}
                          />
                        ),
                      },
                      {
                        title: 'UOM',
                        dataIndex: 'uom',
                        width: 150,
                        render: (value, _row, index) => (
                          <Select
                            style={{ width: '100%' }}
                            disabled={!editable}
                            value={value || undefined}
                            placeholder="UOM"
                            options={uomOptions}
                            onChange={(v) => updateMaterialRow(index, { uom: v })}
                          />
                        ),
                      },
                      {
                        title: '',
                        key: 'actions',
                        width: 48,
                        render: (_, _row, index) =>
                          editable && (
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeMaterialRow(index)}
                            />
                          ),
                      },
                    ]}
                  />
                  {editable && (
                    <Button style={{ marginTop: 12 }} onClick={addMaterialRow}>
                      + Add Material
                    </Button>
                  )}
                  <Flex justify="end" style={{ marginTop: 24 }}>
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveMaterials()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'specifications' &&
              (version ? (
                <Form form={specForm} layout="vertical" disabled={!editable}>
                  <Form.Item
                    label="Pack Mode"
                    name="pack_mode"
                    tooltip="How pieces are physically bundled — Piece (sold loose), Pouch (grouped into pouches), or Carton (pouches grouped into cartons). Set automatically to Carton on Basics once Pieces per Pouch/Box are filled in there — change it here if that's not actually right for this profile."
                  >
                    <Radio.Group options={PACK_MODE_OPTIONS} optionType="button" />
                  </Form.Item>
                  <Form.Item
                    label="Selling Unit"
                    name="selling_uom"
                    rules={[{ required: true, message: 'Select a selling unit.' }]}
                    tooltip="The unit you invoice the customer in — Carton, Piece, Kg, etc. Usually matches Pack Mode's top level (packed in cartons, sold by the carton), but doesn't have to — e.g. packed in cartons, still sold by the piece."
                  >
                    <Select
                      style={{ maxWidth: 240 }}
                      showSearch
                      optionFilterProp="label"
                      options={uomOptions}
                    />
                  </Form.Item>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Carton Length (mm)" name="carton_length_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Carton Breadth (mm)" name="carton_breadth_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Carton Height (mm)" name="carton_height_mm">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                  </Flex>
                  <Flex gap={16} wrap="wrap">
                    <Form.Item label="Net Weight (kg)" name="carton_net_weight_kg">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label="Gross Weight (kg)" name="carton_gross_weight_kg">
                      <InputNumber min={0} style={{ width: 150 }} />
                    </Form.Item>
                  </Flex>
                  <Flex justify="end">
                    <Button
                      type="primary"
                      loading={submitting}
                      disabled={!editable}
                      onClick={() => void saveSpecifications()}
                    >
                      Save &amp; Continue →
                    </Button>
                  </Flex>
                </Form>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}

            {currentStep === 'review' &&
              (version ? (
                <>
                  <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                    <Descriptions.Item label="Status">{version.status}</Descriptions.Item>
                    <Descriptions.Item label="Pack Mode">{version.pack_mode}</Descriptions.Item>
                    <Descriptions.Item label="Pieces per Selling Unit">
                      {version.pieces_per_selling_unit ?? '— (computed on publish)'}
                    </Descriptions.Item>
                    <Descriptions.Item label="CBM">{version.cbm ?? '— (computed on publish)'}</Descriptions.Item>
                    <Descriptions.Item label="Materials">{version.materials.length}</Descriptions.Item>
                  </Descriptions>
                  {version.status === 'DRAFT' && (
                    <Popconfirm title="Publish this version?" onConfirm={() => void handlePublish()}>
                      <Button type="primary" loading={submitting}>
                        Publish
                      </Button>
                    </Popconfirm>
                  )}
                  {version.status === 'PUBLISHED' && (
                    <Button loading={submitting} onClick={() => void handleNewDraft()}>
                      Create New Draft Version
                    </Button>
                  )}
                </>
              ) : (
                <Empty description="Save Basics first." style={{ paddingTop: 48 }} />
              ))}
          </div>
        </Flex>
      </Card>
      {isEdit && profile && (
        <Card style={{ maxWidth: 960, margin: '16px auto 0' }}>
          <Title level={5} style={{ marginTop: 0 }}>
            Used By Customers
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
            Customer Product Mappings currently pinned to a version of this profile — this is
            where a "Customer Template" scope profile actually gets tied to a specific customer,
            not on this screen.
          </Text>
          <Table<CustomerProductMapping>
            rowKey="id"
            size="small"
            dataSource={mappings}
            pagination={false}
            locale={{ emptyText: 'Not used by any customer mapping yet.' }}
            onRow={(record) => ({
              onClick: () => navigate(`/customer-product-mappings/${record.id}/edit`),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: 'Customer', dataIndex: 'customer_name' },
              { title: 'Item', dataIndex: 'item_name' },
              { title: 'Customer SKU', dataIndex: 'customer_sku' },
              {
                title: 'Status',
                render: (_, r) =>
                  r.current_version ? (
                    <Tag color={r.current_version.status === 'PUBLISHED' ? 'green' : 'default'}>
                      v{r.current_version.version_number} — {r.current_version.status}
                    </Tag>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  )
}
