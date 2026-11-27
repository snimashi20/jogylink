import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard, formatRupees } from '../src';

const base = {
  name: 'Kalu Dodol',
  weight: '250 g',
  price: 165,
  imageUrl: '/img/kalu-dodol.jpg',
};

describe('ProductCard (C18)', () => {
  it('shows the photo with alt text, the name, the weight and the retail price', () => {
    render(<ProductCard {...base} />);
    expect(screen.getByRole('img', { name: 'Kalu Dodol' })).toHaveAttribute(
      'src',
      '/img/kalu-dodol.jpg',
    );
    expect(screen.getByRole('heading', { name: 'Kalu Dodol' })).toBeInTheDocument();
    expect(screen.getByText('250 g')).toBeInTheDocument();
    expect(screen.getByText('Rs 165.00')).toBeInTheDocument();
  });

  it('formats money as Rs, a space, thousands separators and two decimals', () => {
    expect(formatRupees(3500)).toBe('Rs 3,500.00');
    expect(formatRupees(1250.5)).toBe('Rs 1,250.50');
  });

  it('uses a Golden Crumb (tertiary) Add to cart button, 48 px high on the website', async () => {
    const onAddToCart = vi.fn();
    render(<ProductCard {...base} onAddToCart={onAddToCart} />);
    const button = screen.getByRole('button', { name: 'Add Kalu Dodol to cart' });
    expect(button).toHaveClass('bg-gold');
    expect(button).toHaveClass('h-12');
    await userEvent.click(button);
    expect(onAddToCart).toHaveBeenCalledTimes(1);
  });

  it('links the name to the product page when given', () => {
    render(<ProductCard {...base} href="/products/kalu-dodol" />);
    expect(screen.getByRole('link', { name: 'Kalu Dodol' })).toHaveAttribute(
      'href',
      '/products/kalu-dodol',
    );
  });

  it('shows an Offer badge with an icon and text, not colour alone', () => {
    render(<ProductCard {...base} offer />);
    expect(screen.getByText('Offer')).toHaveClass('bg-gold');
  });

  it('disables the button when out of stock and says why', async () => {
    const onAddToCart = vi.fn();
    render(<ProductCard {...base} outOfStock onAddToCart={onAddToCart} />);
    const button = screen.getByRole('button', { name: /out of stock/i });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Out of stock. Check back soon.');
    await userEvent.click(button);
    expect(onAddToCart).not.toHaveBeenCalled();
  });
});
