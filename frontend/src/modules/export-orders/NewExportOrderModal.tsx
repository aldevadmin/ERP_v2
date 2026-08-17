import { useEffect, useState } from 'react'
import { Alert, DatePicker, Form, Input, Modal, Select, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import dayjs from 'dayjs'
import { listCustomers } from '../customers/api'
import type { CustomerListItem } from '../customers/types'
import { createExportOrder, uploadPoVersion } from './api'
import type { ExportOrder } from './types'

interface NewExportOrderFormValues {
  customer: number
  customer_po_number: string
  customer_po_date: dayjs.Dayjs
}

export default function NewExportOrderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (order: ExportOrder) => void
}) {
  const [form] = Form.useForm<NewExportOrderFormValues>()
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listCustomers({ isActive: true }).then((response) => setCustomers(response.results))
  }, [open])

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFileList([])
      setError(null)
    }
  }, [open, form])

  const handleSubmit = async (values: NewExportOrderFormValues) => {
    setSubmitting(true)
    setError(null)
    try {
      const order = await createExportOrder({
        customer: values.customer,
        customer_po_number: values.customer_po_number,
        customer_po_date: values.customer_po_date.format('YYYY-MM-DD'),
      })
      const file = fileList[0]?.originFileObj
      if (file) {
        await uploadPoVersion(order.id, file, '')
      }
      onCreated(order)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the export order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="New Export Order"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<NewExportOrderFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label="Customer"
          name="customer"
          rules={[{ required: true, message: 'Select a customer.' }]}
        >
          <Select
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          label="Customer PO Number"
          name="customer_po_number"
          rules={[{ required: true, message: 'Enter the customer PO number.' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="PO Date"
          name="customer_po_date"
          rules={[{ required: true, message: 'Select the PO date.' }]}
        >
          <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="PO Attachment" help="Optional — can also be added later">
          <Upload
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
            maxCount={1}
          >
            <UploadOutlined /> Select file
          </Upload>
        </Form.Item>
      </Form>
    </Modal>
  )
}
