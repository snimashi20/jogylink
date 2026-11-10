// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BigNumber, WidgetCard } from '../components/widget-card';

describe('WidgetCard', () => {
  it('shows the numbers when ready', () => {
    render(
      <WidgetCard title="Cash collected">
        <BigNumber value="Rs 1,250.00" caption="4 payments" />
      </WidgetCard>,
    );
    expect(screen.getByRole('region', { name: 'Cash collected' })).toBeInTheDocument();
    expect(screen.getByText('Rs 1,250.00')).toBeInTheDocument();
  });

  it('says who builds a card that does not exist yet', () => {
    render(<WidgetCard title="Expiring soon" owner="M3" state="not-built" />);
    expect(screen.getByText('Not built yet (M3 adds this).')).toBeInTheDocument();
  });

  it('shows a failure as an alert, in words, not colour alone', () => {
    render(
      <WidgetCard title="Stock" state="error">
        Could not load stock. Refresh the page to try again.
      </WidgetCard>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load stock');
  });

  it('explains an empty range', () => {
    render(
      <WidgetCard title="Sales" state="empty">
        No sales in this date range. Choose a longer range.
      </WidgetCard>,
    );
    expect(screen.getByText(/No sales in this date range/)).toBeInTheDocument();
  });
});
