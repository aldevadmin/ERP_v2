import { useEffect, useState } from 'react'
import { Button, Drawer, InputNumber, Popconfirm, Table, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { ApiError } from '../../shared/api/http'
import { listPackingAllotments, releaseAllotments, removeAllotment, updateAllotmentQuantity } from './api'
import type { PackingAllotmentRow } from './types'

const { Text } = Typography

/** The "Orders Selected" staging list — every Draft allotment waiting to
 * be committed. Editing a quantity or removing a row talks straight to
 * the backend (drafts are saved server-side the moment they're staged,
 * per the design), so this drawer is just a live view of that state, not
 * its own local cart. */
export default function OrdersSelectedDrawer({
  open,
  onClose,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [rows, setRows] = useState<PackingAllotmentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const load = () => {
    setLoading(true)
    listPackingAllotments({ status: 'DRAFT' })
      .then(setRows)
      .catch((err) => message.error(err instanceof ApiError ? err.message : 'Could not load your selection.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  // Typing updates the field locally only — the PATCH (and its Pending
  // cap validation) fires once on blur/Enter, not on every keystroke.
  const handleQuantityInput = (row: PackingAllotmentRow, cartons: number) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, allotted_cartons: cartons } : r)))
  }

  const handleQuantityCommit = async (row: PackingAllotmentRow) => {
    try {
      const updated = await updateAllotmentQuantity(row.id, row.allotted_cartons)
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not update this quantity.')
      load()
    }
  }

  const handleRemove = async (row: PackingAllotmentRow) => {
    try {
      await removeAllotment(row.id)
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      onChanged()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not remove this line.')
    }
  }

  const handleRelease = async () => {
    setReleasing(true)
    try {
      await releaseAllotments()
      message.success('Released to the packing floor.')
      setRows([])
      onChanged()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not release these lines.')
    } finally {
      setReleasing(false)
    }
  }

  const totalBoxes = rows.reduce((sum, r) => sum + r.allotted_cartons, 0)

  return (
    <Drawer title="Orders Selected" open={open} onClose={onClose} width={640}>
      <Table<PackingAllotmentRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: 'Nothing selected yet — pick lines from All Orders.' }}
        columns={[
          { title: 'Customer', dataIndex: 'customer_name' },
          { title: 'Order #', dataIndex: 'order_no' },
          { title: 'SKU', dataIndex: 'customer_sku_code' },
          {
            title: 'Pending',
            dataIndex: 'pending_cartons',
            align: 'right',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: "Today's Allotment",
            dataIndex: 'allotted_cartons',
            align: 'right',
            render: (v: number, row) => (
              <InputNumber
                size="small"
                min={1}
                max={row.pending_cartons}
                value={v}
                style={{ width: 90 }}
                onChange={(value) => handleQuantityInput(row, value ?? 0)}
                onBlur={() => void handleQuantityCommit(row)}
                onPressEnter={() => void handleQuantityCommit(row)}
              />
            ),
          },
          {
            title: '',
            key: 'remove',
            render: (_, row) => (
              <Popconfirm title="Remove this line?" onConfirm={() => void handleRemove(row)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Total Boxes: {totalBoxes.toLocaleString()}</Text>
        <Button
          type="primary"
          disabled={rows.length === 0}
          loading={releasing}
          onClick={() => void handleRelease()}
        >
          Release to Packing Floor
        </Button>
      </div>
    </Drawer>
  )
}
