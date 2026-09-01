import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate, useParams } from 'react-router'
import PackagingProfileFormPage from './PackagingProfileFormPage'
import * as packagingApi from './api'
import * as itemsApi from '../items/api'
import type { PackagingProfile } from './types'
import type { ItemListResponse, UOMListResponse } from '../items/types'

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: vi.fn(), useParams: vi.fn() }
})
vi.mock('./api')
vi.mock('../items/api')

const mockedApi = vi.mocked(packagingApi)
const mockedItemsApi = vi.mocked(itemsApi)
const mockedUseNavigate = vi.mocked(useNavigate)
const mockedUseParams = vi.mocked(useParams)
const navigateMock = vi.fn()

const finishedGoodItem: ItemListResponse['results'][number] = {
  id: 1,
  code: 'SQ10',
  name: '10 Inch Plate',
  description: '',
  item_class: 'FINISHED_GOOD',
  product_type: null,
  product_type_name: '',
  material_type: null,
  material_type_name: '',
  shape: null,
  shape_name: '',
  length: null,
  breadth: null,
  height: null,
  length_uom: null,
  breadth_uom: null,
  height_uom: null,
  inventory_uom: null,
  inventory_uom_code: '',
  purchasable: false,
  manufacturable: true,
  stockable: true,
  sellable: true,
  lot_tracking: 'NONE',
  is_active: true,
  available_qty: 0,
}

const wipItem: ItemListResponse['results'][number] = {
  ...finishedGoodItem,
  id: 2,
  code: 'SQ10-WIP',
  name: '10 Inch Plate (Unsorted)',
  item_class: 'WIP',
}

const itemsResponse: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [finishedGoodItem],
}

const itemsResponseWithWip: ItemListResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [finishedGoodItem, wipItem],
}

const uomsResponse: UOMListResponse = { count: 0, next: null, previous: null, results: [] }

beforeEach(() => {
  mockedUseNavigate.mockReturnValue(navigateMock)
  mockedUseParams.mockReturnValue({})
  mockedItemsApi.listItems.mockResolvedValue(itemsResponse)
  mockedItemsApi.listUOMs.mockResolvedValue(uomsResponse)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PackagingProfileFormPage — wizard shell', () => {
  it('shows all 4 steps', async () => {
    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )

    for (const label of ['Basics', 'Materials', 'Specifications', 'Review']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

describe('PackagingProfileFormPage — Basics', () => {
  it('creates the profile and moves to the Materials step on Continue', async () => {
    const created: PackagingProfile = {
      id: 1,
      code: 'PKG-1',
      name: 'Standard Packing',
      finished_item: 1,
      finished_item_name: '10 Inch Plate',
      scope: 'STANDARD',
      is_active: true,
      current_version: {
        id: 10,
        profile: 1,
        profile_name: 'Standard Packing',
        version_number: 1,
        status: 'DRAFT',
        effective_from: null,
        effective_to: null,
        selling_uom: null,
        selling_uom_code: '',
        pack_mode: 'CARTON',
        pieces_per_pouch: null,
        pouches_per_carton: null,
        carton_length_mm: null,
        carton_breadth_mm: null,
        carton_height_mm: null,
        carton_net_weight_kg: null,
        carton_gross_weight_kg: null,
        pieces_per_selling_unit: null,
        cbm: null,
        materials: [],
      },
    }
    mockedApi.createPackagingProfile.mockResolvedValue(created)
    mockedApi.getPackagingProfileVersion.mockResolvedValue(created.current_version!)

    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Profile Code')

    fireEvent.change(screen.getByLabelText('Profile Code'), { target: { value: 'PKG-1' } })
    fireEvent.change(screen.getByLabelText('Profile Name'), {
      target: { value: 'Standard Packing' },
    })
    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    fireEvent.click(await screen.findByTitle('10 Inch Plate | (SQ10)'))

    fireEvent.click(screen.getByRole('button', { name: 'Save & Continue →' }))

    await waitFor(() =>
      expect(mockedApi.createPackagingProfile).toHaveBeenCalledWith({
        code: 'PKG-1',
        name: 'Standard Packing',
        finished_item: 1,
        scope: 'STANDARD',
        is_active: true,
      }),
    )
    expect(
      await screen.findByText('What packaging materials does this profile use?'),
    ).toBeInTheDocument()
  })

  it('suggests a Profile Code from the Finished Item once one is picked', async () => {
    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Profile Code')

    expect(screen.queryByText('Suggested:')).not.toBeInTheDocument()

    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    fireEvent.click(await screen.findByTitle('10 Inch Plate | (SQ10)'))

    expect(await screen.findByText('SQ10-PKG')).toBeInTheDocument()

    // Name is suggested too now — scope to the Code suggestion specifically
    // so this test isn't ambiguous between the two "Use" links.
    const codeSuggestion = screen.getByText('SQ10-PKG').closest('div') as HTMLElement
    fireEvent.click(within(codeSuggestion).getByText('Use'))

    expect(screen.getByLabelText('Profile Code')).toHaveValue('SQ10-PKG')
  })

  it('suggests a Profile Name from the Finished Item once one is picked', async () => {
    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Profile Code')

    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    fireEvent.click(await screen.findByTitle('10 Inch Plate | (SQ10)'))

    expect(await screen.findByText('10 Inch Plate Packaging')).toBeInTheDocument()

    const nameSuggestion = screen.getByText('10 Inch Plate Packaging').closest('div') as HTMLElement
    fireEvent.click(within(nameSuggestion).getByText('Use'))

    expect(screen.getByLabelText('Profile Name')).toHaveValue('10 Inch Plate Packaging')
  })

  it('hides WIP items from Finished Item until "Include WIP" is switched on', async () => {
    mockedItemsApi.listItems.mockResolvedValue(itemsResponseWithWip)

    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Profile Code')

    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    expect(await screen.findByTitle('10 Inch Plate | (SQ10)')).toBeInTheDocument()
    expect(screen.queryByTitle('10 Inch Plate (Unsorted) | (SQ10-WIP)')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByLabelText('Finished Item'), { key: 'Escape' })

    fireEvent.click(screen.getByRole('switch', { name: 'Include WIP items' }))

    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    expect(await screen.findByTitle('10 Inch Plate (Unsorted) | (SQ10-WIP)')).toBeInTheDocument()
  })

  it('keeps an already-selected WIP item visible even after switching "Include WIP" back off', async () => {
    mockedItemsApi.listItems.mockResolvedValue(itemsResponseWithWip)

    render(
      <MemoryRouter>
        <PackagingProfileFormPage />
      </MemoryRouter>,
    )
    await screen.findByLabelText('Profile Code')

    fireEvent.click(screen.getByRole('switch', { name: 'Include WIP items' }))
    fireEvent.mouseDown(screen.getByLabelText('Finished Item'))
    fireEvent.click(await screen.findByTitle('10 Inch Plate (Unsorted) | (SQ10-WIP)'))

    fireEvent.click(screen.getByRole('switch', { name: 'Include WIP items' }))

    const selector = screen.getByLabelText('Finished Item').closest('.ant-select') as HTMLElement
    expect(within(selector).getByText('10 Inch Plate (Unsorted) | (SQ10-WIP)')).toBeInTheDocument()
  })
})
