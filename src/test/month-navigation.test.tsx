import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MobileTopBar } from '@/mobile/MobileTopBar'
import { monthKeys } from '@/data/helpers'
import type { Transaction } from '@/types'

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>
}))
vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key
}))

describe('MobileTopBar date navigation', () => {
  it('should render the swipeable month strip on the budgets view', () => {
    const keys = ['2026-03', '2026-04', '2026-05', '2026-06']

    render(
      <MobileTopBar
        route="profile"
        view="budgets"
        mkey="2026-06"
        monthKeys={keys}
        onSelectMonth={vi.fn()}
        onSettings={vi.fn()}
        onCurrency={vi.fn()}
        onSearch={vi.fn()}
      />
    )

    keys.forEach(key => {
      expect(document.querySelector(`[data-key="${key}"]`)).toBeTruthy()
    })
  })

  it('should render a swipeable month strip on the home route instead of prev/next arrows', () => {
    const keys = ['2026-03', '2026-04', '2026-05', '2026-06']

    render(
      <MobileTopBar
        route="home"
        view="dashboard"
        mkey="2026-06"
        monthKeys={keys}
        onSelectMonth={vi.fn()}
        onSettings={vi.fn()}
        onCurrency={vi.fn()}
        onSearch={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: /^prevMonth$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^nextMonth$/i })).not.toBeInTheDocument()
    keys.forEach(key => {
      expect(document.querySelector(`[data-key="${key}"]`)).toBeTruthy()
    })
  })

  it('should not render any month selector on the annual or calendar views', () => {
    const keys = ['2026-03', '2026-04', '2026-05', '2026-06']

    const { rerender } = render(
      <MobileTopBar
        route="analysis"
        view="calendar"
        mkey="2026-06"
        monthKeys={keys}
        onSelectMonth={vi.fn()}
        onSettings={vi.fn()}
        onCurrency={vi.fn()}
        onSearch={vi.fn()}
      />
    )
    expect(document.querySelector('.mobile-month-strip')).toBeNull()

    rerender(
      <MobileTopBar
        route="analysis"
        view="calendar"
        mkey="2026-06"
        monthKeys={keys}
        onSelectMonth={vi.fn()}
        onSettings={vi.fn()}
        onCurrency={vi.fn()}
        onSearch={vi.fn()}
      />
    )
    expect(document.querySelector('.mobile-month-strip')).toBeNull()
  })

  it('should generate all months in between oldest tx and current month', () => {
    const txns: Transaction[] = [
      { id: '1', type: 'expense', amount: 10, date: '2026-03-01', note: 'a', categoryId: 'cat', accountId: 'acc' },
      { id: '2', type: 'expense', amount: 10, date: '2026-06-01', note: 'a', categoryId: 'cat', accountId: 'acc' },
    ]
    // Mock currentMonthKey to return '2026-06'
    const keys = monthKeys(txns)
    expect(keys).toContain('2026-03')
    expect(keys).toContain('2026-04')
    expect(keys).toContain('2026-05')
    expect(keys).toContain('2026-06')
  })
})
