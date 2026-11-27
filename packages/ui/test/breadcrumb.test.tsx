import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumb } from '../src';

const items = [
  { label: 'Home', href: '/' },
  { label: 'Sweets', href: '/shop' },
  { label: 'Kalu Dodol 250g' },
];

describe('Breadcrumb (C23)', () => {
  it('is a navigation landmark named "Breadcrumb"', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('links every item except the current page', () => {
    render(<Breadcrumb items={items} />);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sweets' })).toHaveAttribute('href', '/shop');
    expect(screen.queryByRole('link', { name: 'Kalu Dodol 250g' })).not.toBeInTheDocument();
  });

  it('marks the last item as the current page, even if it was given a link', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Cart', href: '/cart' },
        ]}
      />,
    );
    expect(screen.getByText('Cart')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Cart' })).not.toBeInTheDocument();
  });

  it('renders nothing when there are no items', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
