import { Tag } from 'antd'

/** Consistent Active/Inactive rendering — every module's list/detail
 * screens use this instead of rolling their own color choice. */
export default function StatusTag({ active }: { active: boolean }) {
  return <Tag color={active ? 'success' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
}
