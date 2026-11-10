import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src';

describe('Button (C1)', () => {
  it('renders its label and defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['primary', 'bg-brand'],
    ['secondary', 'border-charcoal'],
    ['tertiary', 'bg-gold'],
    ['text', 'text-brand-deep'],
    ['danger', 'bg-alarm'],
  ] as const)('%s uses the design-guide colour (%s)', (variant, expected) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button')).toHaveClass(expected);
  });

  it('keeps the primary (brand red) and danger (alarm crimson) buttons visibly different', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="danger">Delete</Button>
      </>,
    );
    const [primary, danger] = screen.getAllByRole('button');
    expect(primary).not.toHaveClass('bg-alarm');
    expect(danger).not.toHaveClass('bg-brand');
  });

  it('admin size is 36px high and web size is 48px', () => {
    render(
      <>
        <Button size="admin">A</Button>
        <Button size="web">B</Button>
      </>,
    );
    expect(screen.getByText('A')).toHaveClass('h-9');
    expect(screen.getByText('B')).toHaveClass('h-12');
  });

  describe('disabled', () => {
    it('does not fire onClick and explains why (tooltip + screen reader text)', async () => {
      const onClick = vi.fn();
      render(
        <Button disabled disabledReason="Add at least one product first" onClick={onClick}>
          Place order
        </Button>,
      );
      // the reason is a description, not part of the name
      const button = screen.getByRole('button', { name: 'Place order' });
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('title', 'Add at least one product first');
      expect(button).toHaveAccessibleDescription('Add at least one product first');
    });

    it('is styled as disabled (Light Sand fill, Stone text) whatever the variant', () => {
      render(
        <Button variant="primary" disabled disabledReason="Not allowed">
          Save
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-sand', 'text-stone');
    });

    it('cannot be disabled without a reason (compile-time rule)', () => {
      // @ts-expect-error disabled needs a disabledReason
      render(<Button disabled>No reason</Button>);
    });
  });

  describe('loading', () => {
    it('swaps the label for "Saving…" and marks the button busy', () => {
      render(<Button loading>Save</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Saving…');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('aria-disabled', 'true');
    });

    it('accepts a custom loading label', () => {
      render(
        <Button loading loadingLabel="Placing order…">
          Place order
        </Button>,
      );
      expect(screen.getByRole('button')).toHaveTextContent('Placing order…');
    });

    it('is locked: clicks do nothing, so a double click cannot submit twice', async () => {
      const onClick = vi.fn();
      render(
        <Button loading onClick={onClick}>
          Save
        </Button>,
      );
      await userEvent.dblClick(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });

    it('does not submit a form while loading', async () => {
      const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <form onSubmit={onSubmit}>
          <Button type="submit" loading>
            Save
          </Button>
        </form>,
      );
      await userEvent.click(screen.getByRole('button'));
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('a normal submit button still submits its form', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save</Button>
      </form>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
