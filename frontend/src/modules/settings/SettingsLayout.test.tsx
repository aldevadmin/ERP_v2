import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import SettingsLayout from './SettingsLayout'
import SettingsRedirect from './SettingsRedirect'

afterEach(() => {
  localStorage.clear()
})

function renderAt(pathname: string) {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SettingsLayout>
        <div>Page content for {pathname}</div>
      </SettingsLayout>
    </MemoryRouter>,
  )
}

describe('SettingsLayout', () => {
  it('selects the Master Data group and highlights the matching item for /customers', () => {
    renderAt('/customers')

    expect(screen.getByText('Master Data')).toBeInTheDocument()
    expect(screen.getByText('Page content for /customers')).toBeInTheDocument()

    // Every Master Data item is present as a single horizontal row —
    // spot-check a few, including one far down the list.
    expect(screen.getByText('Customers')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Customer Product Mappings')).toBeInTheDocument()

    // Operations-only items must not leak into the Master Data row.
    expect(screen.queryByText('Processes')).not.toBeInTheDocument()
  })

  it('selects the Operations group and its items for /work-centres', () => {
    renderAt('/work-centres')

    expect(screen.getByText('Work Centres')).toBeInTheDocument()
    expect(screen.getByText('Tooling Types')).toBeInTheDocument()
    // Master-Data-only items must not leak into the Operations row.
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()
  })

  it('links each item to its real, unchanged app route', () => {
    renderAt('/customers')

    expect(screen.getByText('Vendors').closest('a')).toHaveAttribute('href', '/vendors')
    expect(screen.getByText('Items').closest('a')).toHaveAttribute('href', '/items')
  })

  it('resolves a Create/Edit sub-route to its parent item and group, e.g. /items/new -> Items', () => {
    renderAt('/items/new')

    expect(screen.getByText('Master Data')).toBeInTheDocument()
    expect(screen.getByText('Items').closest('div')).toHaveClass('settings-subnav-item--active')
    expect(screen.getByText('Customers').closest('div')).not.toHaveClass(
      'settings-subnav-item--active',
    )
  })

  it('resolves an Operations Create/Edit sub-route correctly too, e.g. /processes/7/edit', () => {
    renderAt('/processes/7/edit')

    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('Processes').closest('div')).toHaveClass(
      'settings-subnav-item--active',
    )
  })

  it('does not confuse a similarly-prefixed item, e.g. /items must not match /item-classification', () => {
    renderAt('/item-classification')

    expect(screen.getByText('Item Classification').closest('div')).toHaveClass(
      'settings-subnav-item--active',
    )
    expect(screen.getByText('Items').closest('div')).not.toHaveClass(
      'settings-subnav-item--active',
    )
  })

  it('renders Administration items as disabled, non-navigating, "Not built yet"', () => {
    renderAt('/customers')

    // Administration isn't reachable from the URL (nothing is built there
    // yet) — but clicking the segment still swaps the row, purely as a
    // local preview, without touching the URL or page content.
    fireEvent.click(screen.getByRole('radio', { name: 'Administration' }))

    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Users').closest('a')).not.toBeInTheDocument()
    // The page content underneath is untouched by the Administration peek.
    expect(screen.getByText('Page content for /customers')).toBeInTheDocument()
  })

  it('jumps straight to the new group\'s first item when switching Master Data -> Operations', () => {
    render(
      <MemoryRouter initialEntries={['/customers']}>
        <Routes>
          <Route
            path="/customers"
            element={
              <SettingsLayout>
                <div>Customers page</div>
              </SettingsLayout>
            }
          />
          <Route
            path="/processes"
            element={
              <SettingsLayout>
                <div>Processes page</div>
              </SettingsLayout>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Customers page')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Operations' }))

    // One click on the group takes you to a real page — Processes, the
    // first Operations item — not just a relabeled, unnavigated row.
    expect(screen.getByText('Processes page')).toBeInTheDocument()
    expect(screen.getByText('Processes').closest('div')).toHaveClass(
      'settings-subnav-item--active',
    )
  })
})

describe('SettingsRedirect', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('redirects bare /settings to Items by default', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsRedirect />} />
          <Route path="/items" element={<div>Items landing</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Items landing')).toBeInTheDocument()
  })

  it('redirects to the last-visited settings page when one is recorded', async () => {
    localStorage.setItem('agrileaf-erp:last-settings-path', '/vendors')

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<SettingsRedirect />} />
          <Route path="/vendors" element={<div>Vendors landing</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Vendors landing')).toBeInTheDocument()
  })
})

describe('SettingsLayout — last-visited tracking', () => {
  it('records the current settings page as the new "last visited" one', () => {
    renderAt('/vendors')

    expect(localStorage.getItem('agrileaf-erp:last-settings-path')).toBe('/vendors')
  })
})

describe('SettingsLayout — active item highlighting', () => {
  it('marks the current page\'s own nav item visually distinct from the rest', () => {
    renderAt('/vendors')

    const vendorsLink = screen.getByText('Vendors').closest('a') as HTMLElement
    const customersLink = screen.getByText('Customers').closest('a') as HTMLElement

    // The active item's icon+label wrapper carries the active marker class;
    // an inactive sibling item does not.
    expect(within(vendorsLink).getByText('Vendors').closest('div')).toHaveClass(
      'settings-subnav-item--active',
    )
    expect(within(customersLink).getByText('Customers').closest('div')).not.toHaveClass(
      'settings-subnav-item--active',
    )
  })
})
