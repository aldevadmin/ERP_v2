import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router'
import NamingTemplateListPage from './NamingTemplateListPage'
import * as api from './api'
import type {
  ItemFieldRule,
  ItemFieldRuleField,
  ItemFieldRuleState,
  NamingTemplateListResponse,
} from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn() }
})
vi.mock('./api')

const mockedApi = vi.mocked(api)
const mockedUseNavigate = vi.mocked(useNavigate)

afterEach(() => {
  vi.clearAllMocks()
})

// Mirrors the backend's seeded rule set (see
// `apps/items/migrations/0013_seed_item_field_rules.py`).
const fieldRules: ItemFieldRule[] = (
  [
    ['RAW_MATERIAL', 'product_type', 'HIDDEN'],
    ['RAW_MATERIAL', 'material_type', 'REQUIRED'],
    ['RAW_MATERIAL', 'shape', 'HIDDEN'],
    ['RAW_MATERIAL', 'dimensions', 'HIDDEN'],
    ['WIP', 'product_type', 'REQUIRED'],
    ['WIP', 'material_type', 'REQUIRED'],
    ['WIP', 'shape', 'OPTIONAL'],
    ['WIP', 'dimensions', 'OPTIONAL'],
  ] as [ItemFieldRule['item_class'], ItemFieldRuleField, ItemFieldRuleState][]
).map(([item_class, field, state], index) => ({ id: index + 1, item_class, field, state }))

const response: NamingTemplateListResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 5,
      item_class: 'WIP',
      product_type: 3,
      product_type_name: 'Plate',
      shape: 9,
      shape_name: 'Round',
      name_pattern: '{class}_{length} {shape} {product_type} - {material_type}',
      code_pattern: '{class_short}_{length}{shape_short}{product_type_short}_{material_type_short}',
      is_active: true,
    },
    {
      id: 6,
      item_class: 'WIP',
      product_type: null,
      product_type_name: '',
      shape: null,
      shape_name: '',
      name_pattern: '{class}',
      code_pattern: '{class_short}',
      is_active: true,
    },
    {
      id: 7,
      item_class: 'RAW_MATERIAL',
      product_type: null,
      product_type_name: '',
      shape: null,
      shape_name: '',
      name_pattern: '{material_type} - {class}',
      code_pattern: '{material_type_short}_{class_short}',
      is_active: true,
    },
  ],
}

function setup() {
  mockedApi.listNamingTemplates.mockResolvedValue(response)
  mockedApi.listItemFieldRules.mockResolvedValue(fieldRules)
}

describe('NamingTemplateListPage', () => {
  it('navigates to the create form with the source row as duplicate-from state', async () => {
    const navigate = vi.fn()
    mockedUseNavigate.mockReturnValue(navigate)
    setup()

    render(
      <MemoryRouter>
        <NamingTemplateListPage />
      </MemoryRouter>,
    )

    fireEvent.click((await screen.findAllByLabelText('Duplicate template for WIP'))[0])

    expect(navigate).toHaveBeenCalledWith('/naming-templates/new', {
      state: { duplicateFrom: response.results[0] },
    })
  })

  it('shows the real scope value when one is set', async () => {
    setup()

    render(
      <MemoryRouter>
        <NamingTemplateListPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Plate')).toBeInTheDocument()
    expect(screen.getByText('Round')).toBeInTheDocument()
  })

  it('shows "All product types"/"All shapes" for an unscoped row on a class that supports them', async () => {
    setup()

    render(
      <MemoryRouter>
        <NamingTemplateListPage />
      </MemoryRouter>,
    )

    expect(await screen.findAllByText('All product types')).toHaveLength(1)
    expect(screen.getAllByText('All shapes')).toHaveLength(1)
  })

  it('shows "Not configured" instead of "All..." for a class where the field is hidden entirely', async () => {
    setup()

    render(
      <MemoryRouter>
        <NamingTemplateListPage />
      </MemoryRouter>,
    )

    // Raw Material hides both Product Type and Shape.
    expect(await screen.findAllByText('Not configured')).toHaveLength(2)
  })
})
