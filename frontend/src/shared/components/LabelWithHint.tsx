import { InfoCircleOutlined } from '@ant-design/icons'
import { Tooltip, Typography } from 'antd'

const { Text } = Typography

/** A bold field-question label with an info tooltip — for the wizard-step
 * forms that render their own <Text strong> labels instead of AntD
 * Form.Item (which has a built-in `tooltip` prop). */
export default function LabelWithHint({ text, hint }: { text: string; hint: string }) {
  return (
    <Text strong style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {text}
      <Tooltip title={hint}>
        <InfoCircleOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
      </Tooltip>
    </Text>
  )
}
