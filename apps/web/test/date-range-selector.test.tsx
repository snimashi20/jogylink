// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateRangeSelector } from '../components/date-range-selector';
import { rangeForPreset } from '../lib/date-range';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/reports',
}));

const TODAY = '2026-11-10';
beforeEach(() => push.mockClear());

describe('DateRangeSelector', () => {
  it('marks the current preset and changes the address when another is chosen', async () => {
    render(<DateRangeSelector value={rangeForPreset('30d', TODAY)} today={TODAY} />);
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(push).toHaveBeenCalledWith('/reports?range=7d');
  });

  it('applies a custom range', async () => {
    const user = userEvent.setup();
    render(<DateRangeSelector value={rangeForPreset('30d', TODAY)} today={TODAY} />);
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.type(screen.getByLabelText('From'), '2026-11-01');
    await user.type(screen.getByLabelText('To'), '2026-11-05');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(push).toHaveBeenCalledWith('/reports?range=custom&from=2026-11-01&to=2026-11-05');
  });

  it('refuses a backwards range and says how to fix it', async () => {
    const user = userEvent.setup();
    render(<DateRangeSelector value={rangeForPreset('30d', TODAY)} today={TODAY} />);
    await user.click(screen.getByRole('button', { name: 'Custom' }));
    await user.type(screen.getByLabelText('From'), '2026-11-09');
    await user.type(screen.getByLabelText('To'), '2026-11-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(/start date must be on or before/i)).toBeInTheDocument();
  });
});
