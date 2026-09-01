import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useParams } from 'react-router'
import NamingTemplateFormPage from './NamingTemplateFormPage'
import * as api from './api'
import type {
  ItemFieldRule,
  ItemFieldRuleField,
  ItemFieldRuleState,
  NamingTemplate,
  ProductTypeListResponse,
  ShapeListResponse,
} from './types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useParams: vi.fn(() => ({})) }
})
vi.mock('./api')

const mockedApi = vi.mocked(api)
const mockedUseParams = vi.mocked(useParams)

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
    ['FINISHED_GOOD', 'product_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'material_type', 'REQUIRED'],
    ['FINISHED_GOOD', 'shape', 'OPTIONAL'],
    ['FINISHED_GOOD', 'dimensions', 'OPTIONAL'],
    ['PACKAGING_MATERIAL', 'product_type', 'REQUIRED'],
    ['PACKAGING_MATERIAL', 'material_type', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'shape', 'HIDDEN'],
    ['PACKAGING_MATERIAL', 'dimensions', 'OPTIONAL'],
    ['CONSUMABLE', 'product_type', 'OPTIONAL'],
    ['CONSUMABLE', 'material_type', 'HIDDEN'],
    ['CONSUMABLE', 'shape', 'HIDDEN'],
    ['CONSUMABLE', 'dimensions', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'product_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'material_type', 'OPTIONAL'],
    ['SCRAP_BY_PRODUCT', 'shape', 'HIDDEN'],
    ['SCRAP_BY_PRODUCT', 'dimensions', 'HIDDEN'],
  ] as [ItemFieldRule['item_class'], ItemFieldRuleField, ItemFieldRuleState][]
).map(([item_class, field, state], index) => ({ id: index + 1, item_class, field, state }))

const productTypes: ProductTypeListResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
}
const shapes: ShapeListResponse = { count: 0, next: null, previous: null, results: [] }

function setup() {
  mockedApi.listProductTypes.mockResolvedValue(productTypes)
  mockedApi.listShapes.mockResolvedValue(shapes)
  mockedApi.listItemFieldRules.mockResolvedValue(fieldRules)
}

describe('NamingTemplateFormPage', () => {
  it('shows a live example preview as a pattern is typed', async () => {
    setup()
    mockedUseParams.mockReturnValue({})

    render(
      <MemoryRouter>
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    const classField = screen.getByLabelText('Item Class')
    fireEvent.mouseDown(classField)
    fireEvent.click(await screen.findByTitle('Finished Good'))

    fireEvent.change(screen.getByLabelText('Name Pattern'), {
      target: { value: '{product_type} — {material_type}' },
    })

    expect(await screen.findByText('Plate — Bagasse')).toBeInTheDocument()
  })

  it('submits an untouched Name/Code Pattern as empty strings, not undefined, on create', async () => {
    setup()
    mockedUseParams.mockReturnValue({})
    mockedApi.createNamingTemplate.mockResolvedValue({} as NamingTemplate)

    render(
      <MemoryRouter>
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    const classField = screen.getByLabelText('Item Class')
    fireEvent.mouseDown(classField)
    fireEvent.click(await screen.findByTitle('Finished Good'))

    // Name Pattern / Code Pattern are left blank — never typed into.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedApi.createNamingTemplate).toHaveBeenCalled())
    const submitted = mockedApi.createNamingTemplate.mock.calls[0][0]
    // undefined here would become an explicit `null` via jsonBody, which
    // the backend rejects (`name_pattern`/`code_pattern` are blank=True
    // but not null=True) — see the identical fix on ItemFormPage's
    // `description`.
    expect(submitted.name_pattern).toBe('')
    expect(submitted.code_pattern).toBe('')
  })

  it('warns instead of previewing when the pattern uses a token the class hides', async () => {
    setup()
    mockedUseParams.mockReturnValue({})

    render(
      <MemoryRouter>
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    const classField = screen.getByLabelText('Item Class')
    fireEvent.mouseDown(classField)
    fireEvent.click(await screen.findByTitle('Packaging Material'))

    fireEvent.change(screen.getByLabelText('Name Pattern'), {
      target: { value: '{product_type} made of {material_type}' },
    })

    await waitFor(() =>
      expect(
        screen.getByText(/No preview — this pattern uses a token not available/),
      ).toBeInTheDocument(),
    )
  })

  it('can clear an already-set Shape back to "All shapes" via the hover clear button', async () => {
    setup()
    mockedUseParams.mockReturnValue({ id: '2' })
    mockedApi.listProductTypes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        { id: 3, name: 'Plate', short_code: 'PL', applicable_item_classes: [], is_active: true },
      ],
    })
    mockedApi.listShapes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, name: 'Round', short_code: 'RD', is_active: true }],
    })
    mockedApi.getNamingTemplate.mockResolvedValue({
      id: 2,
      item_class: 'WIP',
      product_type: 3,
      product_type_name: 'Plate',
      shape: 9,
      shape_name: 'Round',
      name_pattern: '{class}_{length} {shape} {product_type} - {material_type}',
      code_pattern: '{class_short}_{length}{shape_short}{product_type_short}_{material_type_short}',
      is_active: true,
    })

    render(
      <MemoryRouter>
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Round')).toBeInTheDocument()
    const shapeField = screen.getByText('Shape (optional)').closest('.ant-form-item') as HTMLElement
    const clearBtn = shapeField.querySelector('.ant-select-clear') as HTMLElement
    expect(clearBtn).toBeInTheDocument()
    fireEvent.mouseDown(clearBtn)
    fireEvent.click(clearBtn)

    await waitFor(() => expect(shapeField.textContent).toContain('All shapes'))
    expect(screen.queryByText('Round')).not.toBeInTheDocument()
  })

  it('submits a cleared Shape as undefined at the form boundary (jsonBody\'s job to make it null)', async () => {
    setup()
    mockedUseParams.mockReturnValue({ id: '2' })
    mockedApi.listProductTypes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        { id: 3, name: 'Plate', short_code: 'PL', applicable_item_classes: [], is_active: true },
      ],
    })
    mockedApi.listShapes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, name: 'Round', short_code: 'RD', is_active: true }],
    })
    mockedApi.getNamingTemplate.mockResolvedValue({
      id: 2,
      item_class: 'WIP',
      product_type: 3,
      product_type_name: 'Plate',
      shape: 9,
      shape_name: 'Round',
      name_pattern: '{class}_{length} {shape} {product_type} - {material_type}',
      code_pattern: '{class_short}_{length}{shape_short}{product_type_short}_{material_type_short}',
      is_active: true,
    })
    mockedApi.updateNamingTemplate.mockResolvedValue({} as NamingTemplate)

    render(
      <MemoryRouter>
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Round')).toBeInTheDocument()
    const shapeField = screen.getByText('Shape (optional)').closest('.ant-form-item') as HTMLElement
    const clearBtn = shapeField.querySelector('.ant-select-clear') as HTMLElement
    fireEvent.mouseDown(clearBtn)
    fireEvent.click(clearBtn)
    await waitFor(() => expect(shapeField.textContent).toContain('All shapes'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedApi.updateNamingTemplate).toHaveBeenCalled())
    // Ant Design's onFinish reports a cleared field as `undefined`, not
    // `null` — real `JSON.stringify` would drop this key entirely from
    // the PATCH body, silently leaving the old value untouched server
    // side. `updateNamingTemplate`'s real implementation runs this
    // through `jsonBody` (see http.test.ts) precisely to prevent that;
    // this test documents the raw value it has to correct.
    const payload = mockedApi.updateNamingTemplate.mock.calls[0][1]
    expect(payload.shape).toBeUndefined()
  })

  it('prefills every field from a duplicate-from source and warns before saving', async () => {
    setup()
    mockedUseParams.mockReturnValue({})
    mockedApi.listProductTypes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        { id: 3, name: 'Plate', short_code: 'PL', applicable_item_classes: [], is_active: true },
      ],
    })
    mockedApi.listShapes.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [{ id: 9, name: 'Round', short_code: 'RD', is_active: true }],
    })
    const source: NamingTemplate = {
      id: 5,
      item_class: 'WIP',
      product_type: 3,
      product_type_name: 'Plate',
      shape: 9,
      shape_name: 'Round',
      name_pattern: '{dimension} {product_type}',
      code_pattern: '{product_type_short}-{dimension}',
      is_active: true,
    }

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/naming-templates/new', state: { duplicateFrom: source } }]}
      >
        <NamingTemplateFormPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Duplicating a template')).toBeInTheDocument()
    expect(screen.getByText('Plate')).toBeInTheDocument()
    expect(screen.getByText('Round')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{dimension} {product_type}')).toBeInTheDocument()
    expect(screen.getByDisplayValue('{product_type_short}-{dimension}')).toBeInTheDocument()
  })
})
