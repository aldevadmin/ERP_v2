import { useEffect, useState } from 'react'
import { Alert, Form, Input, Modal, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import { getExportOrder, uploadPoVersion } from './api'
import type { ExportOrder } from './types'

interface UploadPoVersionFormValues {
  remarks: string
}

export default function UploadPoVersionModal({
  open,
  exportOrderId,
  onClose,
  onUploaded,
}: {
  open: boolean
  exportOrderId: number
  onClose: () => void
  onUploaded: (order: ExportOrder) => void
}) {
  const [form] = Form.useForm<UploadPoVersionFormValues>()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      form.resetFields()
      setFileList([])
      setError(null)
    }
  }, [open, form])

  const handleSubmit = async (values: UploadPoVersionFormValues) => {
    const file = fileList[0]?.originFileObj
    if (!file) {
      setError('Select a file to upload.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await uploadPoVersion(exportOrderId, file, values.remarks ?? '')
      onUploaded(await getExportOrder(exportOrderId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the PO revision.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Upload PO Revision"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={submitting}
      destroyOnHidden
    >
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
      <Form<UploadPoVersionFormValues> form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="File" required>
          <Upload
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
            maxCount={1}
          >
            <UploadOutlined /> Select file
          </Upload>
        </Form.Item>
        <Form.Item label="Remarks" name="remarks">
          <Input placeholder="e.g. Revised quantities" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
