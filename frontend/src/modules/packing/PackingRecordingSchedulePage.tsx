import { useEffect, useState } from 'react'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Drawer,
  Flex,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Table,
  TimePicker,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Link } from 'react-router'
import dayjs, { type Dayjs } from 'dayjs'
import { ApiError } from '../../shared/api/http'
import StatusTag from '../../shared/components/StatusTag'
import {
  activateRecordingScheduleVersion,
  createRecordingSchedule,
  listRecordingSchedules,
  listShifts,
  newRecordingScheduleDraft,
  replaceRecordingScheduleBlocks,
} from './api'
import type { PackingRecordingSchedule, Shift } from './types'

const { Title, Text } = Typography

interface EditableBlockRow {
  key: string
  sequence: number
  from_time: Dayjs | null
  to_time: Dayjs | null
  is_active: boolean
}

function blocksFromSchedule(schedule: PackingRecordingSchedule): EditableBlockRow[] {
  const version = schedule.current_version
  if (!version) return []
  return version.blocks.map((b) => ({
    key: String(b.id),
    sequence: b.sequence,
    from_time: dayjs(b.from_time, 'HH:mm:ss'),
    to_time: dayjs(b.to_time, 'HH:mm:ss'),
    is_active: b.is_active,
  }))
}

export default function PackingRecordingSchedulePage() {
  const [schedules, setSchedules] = useState<PackingRecordingSchedule[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<{ name: string; shift: number }>()
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<PackingRecordingSchedule | null>(null)
  const [rows, setRows] = useState<EditableBlockRow[]>([])
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [startingNewDraft, setStartingNewDraft] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    listRecordingSchedules()
      .then(setSchedules)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    listShifts().then((r) => setShifts(r.results))
  }, [])

  const openEditor = (schedule: PackingRecordingSchedule) => {
    setEditing(schedule)
    setRows(blocksFromSchedule(schedule))
    setDrawerError(null)
  }

  const closeEditor = () => {
    setEditing(null)
    setRows([])
  }

  const isDraft = editing?.current_version?.status === 'DRAFT'

  const handleCreate = async (values: { name: string; shift: number }) => {
    setCreating(true)
    try {
      await createRecordingSchedule({ name: values.name, shift: values.shift, is_active: true })
      message.success('Schedule created.')
      setCreateOpen(false)
      createForm.resetFields()
      load()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create this schedule.')
    } finally {
      setCreating(false)
    }
  }

  const handleStartNewDraft = async () => {
    if (!editing) return
    setStartingNewDraft(true)
    try {
      await newRecordingScheduleDraft(editing.id)
      message.success('A new draft version was created from the active one.')
      const refreshed = await listRecordingSchedules()
      setSchedules(refreshed)
      const updated = refreshed.find((s) => s.id === editing.id)
      if (updated) openEditor(updated)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not start a new draft.')
    } finally {
      setStartingNewDraft(false)
    }
  }

  const addBlock = () => {
    const nextSequence = rows.length > 0 ? Math.max(...rows.map((r) => r.sequence)) + 1 : 1
    setRows([...rows, { key: `new-${Date.now()}`, sequence: nextSequence, from_time: null, to_time: null, is_active: true }])
  }

  const removeBlock = (key: string) => {
    setRows(rows.filter((r) => r.key !== key))
  }

  const updateBlock = (key: string, patch: Partial<EditableBlockRow>) => {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const handleSaveBlocks = async () => {
    if (!editing?.current_version) return
    setDrawerError(null)
    if (rows.some((r) => !r.from_time || !r.to_time)) {
      setDrawerError('Every block needs both a From and a To time.')
      return
    }
    setSaving(true)
    try {
      const updated = await replaceRecordingScheduleBlocks(
        editing.current_version.id,
        rows.map((r) => ({
          sequence: r.sequence,
          from_time: (r.from_time as Dayjs).format('HH:mm'),
          to_time: (r.to_time as Dayjs).format('HH:mm'),
          is_active: r.is_active,
        })),
      )
      message.success('Blocks saved.')
      const refreshed = await listRecordingSchedules()
      setSchedules(refreshed)
      const updatedSchedule = refreshed.find((s) => s.id === editing.id)
      if (updatedSchedule) {
        setEditing(updatedSchedule)
        setRows(blocksFromSchedule(updatedSchedule))
      }
      void updated
    } catch (err) {
      setDrawerError(err instanceof ApiError ? err.message : 'Could not save these blocks.')
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async () => {
    if (!editing?.current_version) return
    setActivating(true)
    setDrawerError(null)
    try {
      await activateRecordingScheduleVersion(editing.current_version.id)
      message.success('Schedule activated.')
      const refreshed = await listRecordingSchedules()
      setSchedules(refreshed)
      const updatedSchedule = refreshed.find((s) => s.id === editing.id)
      if (updatedSchedule) openEditor(updatedSchedule)
    } catch (err) {
      setDrawerError(err instanceof ApiError ? err.message : 'Could not activate this schedule.')
    } finally {
      setActivating(false)
    }
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to="/packing/settings">Packing</Link> }, { title: 'Recording Schedule' }]}
      />
      <Card
        title={
          <Title level={4} style={{ margin: 0 }}>
            Packing Recording Schedules
          </Title>
        }
        extra={
          <Button type="primary" onClick={() => setCreateOpen(true)}>
            New Schedule
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Fixed timetable blocks (e.g. 08:30–10:30) offered when a floor operator records an hour, in
          place of a rolling clock window. Each shift may have one active schedule at a time.
        </Typography.Paragraph>
        <Table<PackingRecordingSchedule>
          rowKey="id"
          loading={loading}
          dataSource={schedules}
          onRow={(record) => ({ onClick: () => openEditor(record), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Shift', dataIndex: 'shift_name' },
            {
              title: 'Version Status',
              key: 'version_status',
              render: (_, record) =>
                record.current_version ? (
                  <StatusTag active={record.current_version.status === 'ACTIVE'} />
                ) : (
                  <Text type="secondary">No version</Text>
                ),
            },
            {
              title: 'Blocks',
              key: 'blocks',
              render: (_, record) => record.current_version?.blocks.length ?? 0,
            },
            { title: 'Active', dataIndex: 'is_active', render: (v: boolean) => <StatusTag active={v} /> },
          ]}
        />
      </Card>

      <Modal
        title="New Recording Schedule"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="Create"
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => void handleCreate(values)}>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Standard Shift 1" />
          </Form.Item>
          <Form.Item label="Shift" name="shift" rules={[{ required: true }]}>
            <Select options={shifts.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={editing ? `${editing.name} — ${editing.shift_name}` : ''}
        open={!!editing}
        onClose={closeEditor}
        size={640}
        extra={
          editing?.current_version?.status === 'ACTIVE' ? (
            <Button loading={startingNewDraft} onClick={() => void handleStartNewDraft()}>
              Edit (new draft)
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <>
            {drawerError && <Alert type="error" title={drawerError} showIcon style={{ marginBottom: 16 }} />}
            {!editing.current_version && <Text type="secondary">This schedule has no version yet.</Text>}
            {editing.current_version && (
              <>
                <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                  <StatusTag active={editing.current_version.status === 'ACTIVE'} />
                  <Text type="secondary">
                    Version {editing.current_version.version_number} • {editing.current_version.status}
                  </Text>
                </Flex>
                <Table<EditableBlockRow>
                  rowKey="key"
                  dataSource={rows}
                  pagination={false}
                  size="small"
                  style={{ marginBottom: 12 }}
                  columns={[
                    { title: 'Seq', dataIndex: 'sequence', width: 60 },
                    {
                      title: 'From',
                      key: 'from_time',
                      render: (_, record) =>
                        isDraft ? (
                          <TimePicker
                            format="HH:mm"
                            value={record.from_time}
                            onChange={(v) => updateBlock(record.key, { from_time: v })}
                          />
                        ) : (
                          record.from_time?.format('HH:mm') ?? '—'
                        ),
                    },
                    {
                      title: 'To',
                      key: 'to_time',
                      render: (_, record) =>
                        isDraft ? (
                          <TimePicker
                            format="HH:mm"
                            value={record.to_time}
                            onChange={(v) => updateBlock(record.key, { to_time: v })}
                          />
                        ) : (
                          record.to_time?.format('HH:mm') ?? '—'
                        ),
                    },
                    {
                      title: 'Duration',
                      key: 'duration',
                      render: (_, record) =>
                        record.from_time && record.to_time
                          ? `${record.to_time.diff(record.from_time, 'minute')} min`
                          : '—',
                    },
                    {
                      title: 'Active',
                      key: 'is_active',
                      width: 70,
                      render: (_, record) =>
                        isDraft ? (
                          <Switch
                            size="small"
                            checked={record.is_active}
                            onChange={(v) => updateBlock(record.key, { is_active: v })}
                          />
                        ) : (
                          <StatusTag active={record.is_active} />
                        ),
                    },
                    ...(isDraft
                      ? [
                          {
                            title: '',
                            key: 'actions',
                            width: 40,
                            render: (_: unknown, record: EditableBlockRow) => (
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => removeBlock(record.key)}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
                {isDraft && (
                  <Flex gap={8} style={{ marginBottom: 16 }}>
                    <Button icon={<PlusOutlined />} onClick={addBlock}>
                      Add Block
                    </Button>
                    <Button type="primary" loading={saving} onClick={() => void handleSaveBlocks()}>
                      Save Schedule
                    </Button>
                    <Button
                      loading={activating}
                      disabled={rows.length === 0}
                      onClick={() => void handleActivate()}
                    >
                      Activate
                    </Button>
                  </Flex>
                )}
              </>
            )}
          </>
        )}
      </Drawer>
    </div>
  )
}
