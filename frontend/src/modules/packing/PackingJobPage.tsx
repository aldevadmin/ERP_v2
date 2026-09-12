import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { Alert, Breadcrumb, Button, Card, Descriptions, Tag, Typography } from 'antd'
import { getPackingJob } from './api'
import { packingBreadcrumbFrom } from './breadcrumbFrom'
import JobDetailTabs from './JobDetailTabs'
import type { PackingJob, PackingJobStatus } from './types'

const { Title, Text } = Typography

const STATUS_COLORS: Record<PackingJobStatus, string> = {
  AWAITING_MATERIAL: 'default',
  READY: 'blue',
  IN_PROGRESS: 'processing',
  COMPLETED: 'green',
  ON_HOLD: 'orange',
  STOPPED: 'default',
  CANCELLED: 'red',
}

export default function PackingJobPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const location = useLocation()
  const from = packingBreadcrumbFrom(location.state)
  const [job, setJob] = useState<PackingJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!jobId) return
    setLoading(true)
    getPackingJob(Number(jobId))
      .then(setJob)
      .catch(() => setError('Could not load this job.'))
      .finally(() => setLoading(false))
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  if (loading || !job) {
    return (
      <Card loading={loading}>
        {error && <Alert type="error" title={error} showIcon />}
      </Card>
    )
  }

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[{ title: <Link to={from.path}>{from.label}</Link> }, { title: job.job_number }]}
      />
      <Card>
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <Title level={4} style={{ margin: 0 }}>
              {job.job_number} — {job.item_name}{' '}
              <Tag color={STATUS_COLORS[job.status]}>{job.status.replace('_', ' ')}</Tag>
            </Title>
            <Text type="secondary">
              {job.order_no} • {job.customer_name} • {job.plan_code}
            </Text>
          </div>
          <Link to={`/packing/today?date=${job.date}&shift=${job.shift}&bay=${job.bay}`}>
            <Button>View on Packing Floor</Button>
          </Link>
        </div>
        <Descriptions column={4} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Date">{job.date}</Descriptions.Item>
          <Descriptions.Item label="Shift">{job.shift_name}</Descriptions.Item>
          <Descriptions.Item label="Bay">{job.bay_name}</Descriptions.Item>
          <Descriptions.Item label="Target">{job.target_qty.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Packed">{job.packed_qty.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="Balance">{job.balance_qty.toLocaleString()}</Descriptions.Item>
        </Descriptions>

        <JobDetailTabs job={job} variant="full" />
      </Card>
    </div>
  )
}
