import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderTracker } from '../src';

const steps = [
  { key: 'confirmed', label: 'Confirmed', time: '27 Nov, 10:30' },
  { key: 'packed', label: 'Packed' },
  { key: 'handed_to_courier', label: 'With courier' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
];

function items() {
  return within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole('listitem');
}

describe('OrderTracker (C19)', () => {
  it('marks earlier steps done, the current step current, and later steps not yet', () => {
    render(<OrderTracker steps={steps} currentKey="handed_to_courier" />);
    const list = items();
    expect(list).toHaveLength(5);
    expect(list[0]).toHaveTextContent('(done)');
    expect(list[1]).toHaveTextContent('(done)');
    expect(list[2]).toHaveAttribute('aria-current', 'step');
    expect(list[2]).toHaveTextContent('(current step)');
    expect(list[3]).toHaveTextContent('(not yet)');
    expect(list[4]).not.toHaveAttribute('aria-current');
  });

  it('shows the current step in Bucket Red and writes it out (never colour alone)', () => {
    render(<OrderTracker steps={steps} currentKey="handed_to_courier" />);
    const circle = items()[2]!.querySelector('[aria-hidden="true"].rounded-full');
    expect(circle).toHaveClass('bg-brand');
    expect(screen.getByText('Current:').parentElement).toHaveTextContent('Current: With courier');
  });

  it('shows every step as done once the order reaches the last step', () => {
    render(<OrderTracker steps={steps} currentKey="delivered" />);
    for (const item of items()) {
      expect(item).toHaveTextContent('(done)');
      expect(item).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByText('Completed:').parentElement).toHaveTextContent('Completed: Delivered');
  });

  it('shows the time under a step when given', () => {
    render(<OrderTracker steps={steps} currentKey="packed" />);
    expect(screen.getByText('27 Nov, 10:30')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Order progress' })).toHaveClass('flex');
  });

  it('shows an exception as a banner with text, not colour alone', () => {
    render(
      <OrderTracker
        steps={steps}
        currentKey="in_transit"
        exception={{
          title: 'Delivery failed',
          message: 'The courier will try again tomorrow.',
          tone: 'act',
        }}
      />,
    );
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Delivery failed');
    expect(banner).toHaveTextContent('The courier will try again tomorrow.');
    expect(banner).toHaveClass('border-act');
    // The order stopped at "In transit", so that step is current, not done.
    expect(items()[3]).toHaveTextContent('(current step)');
  });

  it('uses the alarm colour for a cancelled order by default', () => {
    render(
      <OrderTracker
        steps={steps}
        currentKey="confirmed"
        exception={{ title: 'Order cancelled' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveClass('border-alarm');
  });
});
