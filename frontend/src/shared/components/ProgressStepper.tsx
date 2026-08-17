import { Tooltip } from 'antd'

interface ProgressStepperProps {
  steps: string[]
  currentIndex: number
  /** Renders every dot in the "failed" color and skips the connecting fill — for terminal/cancelled states. */
  failed?: boolean
}

const DOT_SIZE = 10

/** A compact colored-dot stepper for order-level status — filled dots for
 * completed/current steps, outlined for what's ahead. Not a form of
 * navigation, purely a read-only progress indicator. */
export default function ProgressStepper({ steps, currentIndex, failed = false }: ProgressStepperProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {steps.map((step, index) => {
        const done = !failed && index <= currentIndex
        const isCurrent = index === currentIndex
        const color = failed ? '#ff4d4f' : done ? '#155eef' : '#d9d9d9'
        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
            {index > 0 && (
              <div
                style={{
                  width: 20,
                  height: 2,
                  background: !failed && index <= currentIndex ? '#155eef' : '#d9d9d9',
                }}
              />
            )}
            <Tooltip title={step}>
              <div
                role="img"
                aria-label={isCurrent ? `${step} (current)` : step}
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: isCurrent ? `0 0 0 3px ${color}33` : undefined,
                }}
              />
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}
