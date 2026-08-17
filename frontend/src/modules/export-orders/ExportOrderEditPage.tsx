import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Alert, Button, Card, DatePicker, Divider, Form, Input, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { listEmployees } from '../accounts/api'
import type { Employee } from '../accounts/types'
import { getCustomer } from '../customers/api'
import type { Customer } from '../customers/types'
import { getExportOrder, updateExportOrder } from './api'
import { INCOTERMS } from './types'
import type { ExportOrder } from './types'

const { Title } = Typography
const { TextArea } = Input

interface ExportOrderEditFormValues {
  export_coordinator: number | null
  country: string
  destination_port: string
  requested_shipment_date: Dayjs | null
  planned_container_ready_date: Dayjs | null
  currency: string
  incoterm: string
  payment_terms: string
  bill_to: number | null
  ship_to: number | null
  internal_remarks: string
  customer_remarks: string
}

const INCOTERM_OPTIONS = INCOTERMS.map((code) => ({ value: code, label: code }))

export default function ExportOrderEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm<ExportOrderEditFormValues>()
  const [order, setOrder] = useState<ExportOrder | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [coordinators, setCoordinators] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    listEmployees({ role: 'Export Coordinator' }).then((response) =>
      setCoordinators(response.results),
    )
    getExportOrder(Number(id))
      .then((data) => {
        setOrder(data)
        form.setFieldsValue({
          export_coordinator: data.export_coordinator,
          country: data.country,
          destination_port: data.destination_port,
          requested_shipment_date: data.requested_shipment_date
            ? dayjs(data.requested_shipment_date)
            : null,
          planned_container_ready_date: data.planned_container_ready_date
            ? dayjs(data.planned_container_ready_date)
            : null,
          currency: data.currency,
          incoterm: data.incoterm,
          payment_terms: data.payment_terms,
          bill_to: data.bill_to,
          ship_to: data.ship_to,
          internal_remarks: data.internal_remarks,
          customer_remarks: data.customer_remarks,
        })
        return getCustomer(data.customer)
      })
      .then(setCustomer)
      .catch(() => setError('Could not load this export order.'))
      .finally(() => setLoading(false))
  }, [id, form])

  const handleSubmit = async (values: ExportOrderEditFormValues) => {
    if (!order) return
    setError(null)
    setSubmitting(true)
    try {
      const updated = await updateExportOrder(order.id, {
        ...values,
        requested_shipment_date: values.requested_shipment_date
          ? values.requested_shipment_date.format('YYYY-MM-DD')
          : null,
        planned_container_ready_date: values.planned_container_ready_date
          ? values.planned_container_ready_date.format('YYYY-MM-DD')
          : null,
        incoterm: (values.incoterm ?? '') as ExportOrder['incoterm'],
      })
      navigate(`/export-orders/${updated.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the export order.')
    } finally {
      setSubmitting(false)
    }
  }

  const billToOptions = (customer?.addresses ?? [])
    .filter((a) => a.address_type === 'BILLING' || a.address_type === 'BILLING_AND_SHIPPING')
    .map((a) => ({ value: a.id, label: `${a.line1}, ${a.country}` }))
  const shipToOptions = (customer?.addresses ?? [])
    .filter((a) => a.address_type === 'SHIPPING' || a.address_type === 'BILLING_AND_SHIPPING')
    .map((a) => ({ value: a.id, label: `${a.line1}, ${a.country}` }))

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4}>{order ? `Edit ${order.order_number}` : 'Edit Export Order'}</Title>
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<ExportOrderEditFormValues>
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading || submitting}
      >
        <Divider titlePlacement="left">Order Info</Divider>
        <Form.Item label="Export Coordinator" name="export_coordinator">
          <Select
            allowClear
            options={coordinators.map((c) => ({ value: c.id, label: c.full_name }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>

        <Divider titlePlacement="left">Shipping</Divider>
        <Form.Item label="Country" name="country">
          <Input />
        </Form.Item>
        <Form.Item label="Destination Port" name="destination_port">
          <Input />
        </Form.Item>
        <Form.Item label="Requested Shipment Date" name="requested_shipment_date">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="Planned Container Ready Date" name="planned_container_ready_date">
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>

        <Divider titlePlacement="left">Commercial Terms</Divider>
        <Form.Item label="Currency" name="currency" help="3-letter code, e.g. USD">
          <Input maxLength={3} />
        </Form.Item>
        <Form.Item label="Incoterm" name="incoterm">
          <Select allowClear options={INCOTERM_OPTIONS} />
        </Form.Item>
        <Form.Item label="Payment Terms" name="payment_terms">
          <Input />
        </Form.Item>
        <Form.Item
          label="Bill To"
          name="bill_to"
          help={!customer ? undefined : 'Only this customer’s addresses are shown'}
        >
          <Select allowClear options={billToOptions} />
        </Form.Item>
        <Form.Item label="Ship To" name="ship_to">
          <Select allowClear options={shipToOptions} />
        </Form.Item>

        <Divider titlePlacement="left">Remarks</Divider>
        <Form.Item label="Internal Remarks" name="internal_remarks">
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Customer-Visible Remarks" name="customer_remarks">
          <TextArea rows={3} />
        </Form.Item>

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" htmlType="submit" size="large" loading={submitting}>
            Save
          </Button>
        </Form.Item>
      </Form>
    </Card>
  )
}
