import HealthStatus from './HealthStatus'

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
      <HealthStatus />
    </div>
  )
}
