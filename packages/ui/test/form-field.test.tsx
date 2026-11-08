import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormField } from '../src';

describe('FormField (C9)', () => {
  it('puts the label above the field and links them', () => {
    render(<FormField label="Product name" />);
    const input = screen.getByLabelText('Product name');
    expect(input).toBeInstanceOf(HTMLInputElement);
    const label = screen.getByText('Product name');
    expect(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('marks required fields with an asterisk AND the word "required"', () => {
    render(<FormField label="SKU" required />);
    expect(screen.getByText(/required/)).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByLabelText(/SKU/)).toHaveAttribute('aria-required', 'true');
  });

  it('does not use the native required attribute (so Zod produces the messages, not the browser)', () => {
    render(<FormField label="SKU" required />);
    expect(screen.getByLabelText(/SKU/)).not.toHaveAttribute('required');
  });

  it('shows helper text below the field and links it to the input', () => {
    render(<FormField label="Phone" helperText="10 digits, starting with 0" />);
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription(
      '10 digits, starting with 0',
    );
  });

  describe('error', () => {
    it('shows the message with a warning icon, marks the field invalid and announces it', () => {
      const { container } = render(
        <FormField label="Phone" error="Enter a 10-digit phone number starting with 0" />,
      );
      const input = screen.getByLabelText('Phone');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveClass('border-alarm');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a 10-digit phone number starting with 0',
      );
      expect(container.querySelector('svg')).not.toBeNull(); // never colour alone
      expect(input).toHaveAccessibleDescription('Enter a 10-digit phone number starting with 0');
    });

    it('replaces the helper text rather than showing both', () => {
      render(<FormField label="Phone" helperText="Digits only" error="Too short" />);
      expect(screen.queryByText('Digits only')).not.toBeInTheDocument();
      expect(screen.getByText('Too short')).toBeInTheDocument();
    });

    it('has no alert and is not invalid when there is no error', () => {
      render(<FormField label="Phone" />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-invalid');
    });
  });

  describe('success', () => {
    it('shows a tick, with a text alternative for screen readers', () => {
      const { container } = render(<FormField label="Phone" success />);
      expect(container.querySelector('svg')).not.toBeNull();
      expect(screen.getByText('Valid')).toBeInTheDocument();
    });

    it('never shows the tick while there is an error', () => {
      render(<FormField label="Phone" success error="Too short" />);
      expect(screen.queryByText('Valid')).not.toBeInTheDocument();
    });
  });

  it('is 44px high', () => {
    render(<FormField label="Name" />);
    expect(screen.getByLabelText('Name')).toHaveClass('h-11');
  });

  it('passes normal input props through and forwards the ref (react-hook-form needs both)', async () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(
      <FormField
        ref={ref}
        label="Price"
        type="number"
        name="price"
        placeholder="0.00"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText('Price');
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('name', 'price');
    expect(input).toHaveAttribute('type', 'number');
    await userEvent.type(input, '12');
    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveValue(12);
  });

  it('uses a given id, and generates distinct ids for fields that have none', () => {
    render(
      <>
        <FormField label="A" id="custom" />
        <FormField label="B" />
        <FormField label="C" />
      </>,
    );
    expect(screen.getByLabelText('A')).toHaveAttribute('id', 'custom');
    expect(screen.getByLabelText('B').id).not.toBe(screen.getByLabelText('C').id);
  });
});
