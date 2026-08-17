import type { CSSProperties, ReactNode } from 'react'
import { Card } from 'antd'

interface SectionCardProps {
  title?: ReactNode
  extra?: ReactNode
  children: ReactNode
  style?: CSSProperties
}

/** Consistent card chrome (shadow, radius, header spacing) for the
 * screen-level sections of a page — a thin wrapper over `Card`, not a
 * replacement for it. */
export default function SectionCard({ title, extra, children, style }: SectionCardProps) {
  return (
    <Card
      title={title}
      extra={extra}
      style={{ borderRadius: 12, boxShadow: '0 1px 2px rgba(16, 24, 40, 0.06)', ...style }}
      styles={{ body: { padding: 20 } }}
    >
      {children}
    </Card>
  )
}
