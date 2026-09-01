import { Segmented } from 'antd'
import { SETTINGS_GROUPS } from './settingsNav'
import type { SettingsGroupKey } from './settingsNav'

export default function SettingsGroupSelector({
  value,
  onChange,
}: {
  value: SettingsGroupKey
  onChange: (key: SettingsGroupKey) => void
}) {
  return (
    <Segmented<SettingsGroupKey>
      size="large"
      className="settings-group-selector"
      value={value}
      onChange={onChange}
      options={SETTINGS_GROUPS.map((group) => ({ label: group.label, value: group.key }))}
    />
  )
}
