// Job Detail and Packing Entry are reached from more than one place (Today's
// Packing, the Weekly Planner, or a direct URL) — the breadcrumb's root
// crumb should point back to wherever the user actually came from rather
// than always saying "Packing Orders". Callers pass this along as router
// `state` when navigating in, and it's forwarded through any further
// navigation (e.g. Job -> Work Session -> back to Job) so the whole chain
// stays consistent.
export interface PackingBreadcrumbFrom {
  label: string
  path: string
}

const DEFAULT_FROM: PackingBreadcrumbFrom = { label: 'Packing Orders', path: '/packing/orders' }

export function packingBreadcrumbFrom(state: unknown): PackingBreadcrumbFrom {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    state.from &&
    typeof state.from === 'object' &&
    'label' in state.from &&
    'path' in state.from
  ) {
    const from = state.from as { label: unknown; path: unknown }
    if (typeof from.label === 'string' && typeof from.path === 'string') {
      return { label: from.label, path: from.path }
    }
  }
  return DEFAULT_FROM
}
