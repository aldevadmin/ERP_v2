import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChangeToolingModal from './ChangeToolingModal'
import * as api from './api'
import * as itemsApi from '../items/api'
import type { Tooling, ToolingListResponse, WorkCentrePosition } from './types'
import type { ItemListResponse } from '../items/types'

vi.mock('./api')
vi.mock('../items/api')

const mockedApi = vi.mocked(api)
const mockedItemsApi = vi.mocked(itemsApi)

afterEach(() => {
  vi.clearAllMocks()
})

const mould: Tooling = {
  id: 2,
  code: 'MLD-310',
  name: '6" Bowl Mould',
  tooling_type: 1,
  tooling_type_name: 'Mould',
  cavity_count: 1,
  default_standard_rate: 75,
  is_active: true,
  notes: '',
  compatibilities: [
    { id: 1, item: 1, item_name: '6" Bowl', item_code: 'BOWL-6', process_definition: null, process_definition_name: '' },
  ],
  compatibilities_count: 1,
}

const toolingResponse: ToolingListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [mould],
}

const itemsResponse: ItemListResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      code: 'BOWL-6',
      name: '6" Bowl',
      description: '',
      item_class: 'FINISHED_GOOD',
      product_type: null,
      product_type_name: '',
      material_type: null,
      material_type_name: '',
      inventory_uom: null,
      inventory_uom_code: '',
      purchasable: false,
      manufacturable: true,
      stockable: true,
      sellable: true,
      lot_tracking: 'NONE',
      is_active: true,
      available_qty: 0,
    },
  ],
}

const position: WorkCentrePosition = {
  id: 3,
  position_index: 3,
  display_label: '',
  is_active: true,
  installed_tooling: 'Old Mould',
  installed_tooling_code: 'MLD-100',
  default_sku: '',
  standard_rate: '',
}

describe('ChangeToolingModal', () => {
  it('shows current tooling and lets the user select new tooling', async () => {
    mockedApi.listTooling.mockResolvedValue(toolingResponse)
    mockedItemsApi.listItems.mockResolvedValue(itemsResponse)

    render(
      <ChangeToolingModal open position={position} onClose={vi.fn()} onSave={vi.fn()} />,
    )

    expect(await screen.findByText(/MLD-100/)).toBeInTheDocument()
    expect(screen.getByText('Change Tooling — Position 3')).toBeInTheDocument()
  })

  it('confirms a changeover with the selected tooling', async () => {
    mockedApi.listTooling.mockResolvedValue(toolingResponse)
    mockedItemsApi.listItems.mockResolvedValue(itemsResponse)
    const onSave = vi.fn().mockResolvedValue(undefined)

    render(<ChangeToolingModal open position={position} onClose={vi.fn()} onSave={onSave} />)
    await screen.findByText(/MLD-100/)

    fireEvent.mouseDown(screen.getByLabelText('New Tooling'))
    const options = await screen.findAllByText('6" Bowl Mould (MLD-310)')
    fireEvent.click(options[options.length - 1])

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Changeover' }))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ tooling: 2, standard_rate_override: 75 }),
      ),
    )
  })
})
