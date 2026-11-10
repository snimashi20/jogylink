import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, Modal } from '../src';

describe('Modal (C10)', () => {
  it('shows title, message and footer when open', () => {
    render(
      <Modal
        open
        onOpenChange={() => {}}
        title="Add product"
        description="Fill in the details."
        footer={<button>Save</button>}
      />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Add product' });
    expect(dialog).toHaveAccessibleDescription('Fill in the details.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<Modal open={false} onOpenChange={() => {}} title="Hidden" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks to close on Escape', async () => {
    const onOpenChange = vi.fn();
    render(<Modal open onOpenChange={onOpenChange} title="Add product" />);
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('works without a description', () => {
    render(<Modal open onOpenChange={() => {}} title="Just a title" />);
    expect(screen.getByRole('dialog', { name: 'Just a title' })).toBeInTheDocument();
  });
});

describe('ConfirmDialog (C10, destructive)', () => {
  const destructive = (overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        destructive
        itemName="Kalu Dodol 250g"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        {...(overrides as object)}
      />,
    );
    return { onConfirm, onOpenChange };
  };

  it('names the item and says it cannot be undone, never a bare "Are you sure?"', () => {
    destructive();
    expect(screen.getByRole('dialog', { name: 'Delete Kalu Dodol 250g?' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });

  it('uses Danger Crimson for the confirm button, not brand red', () => {
    destructive();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toHaveClass('bg-alarm');
    expect(confirm).not.toHaveClass('bg-brand');
  });

  it('puts Cancel on the left, first in order, so keyboard focus starts on the safe choice', () => {
    destructive();
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveTextContent('Cancel');
    expect(second).toHaveTextContent('Delete');
    expect(first).toHaveFocus();
  });

  it('Cancel closes without confirming', async () => {
    const { onConfirm, onOpenChange } = destructive();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Confirm runs the action and then closes', async () => {
    const { onConfirm, onOpenChange } = destructive();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks both buttons while the action runs, so it cannot run twice', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        destructive
        itemName="Kalu Dodol 250g"
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await userEvent.click(confirm);
    await userEvent.click(screen.getByRole('button', { name: /Working/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('aria-disabled', 'true');

    await userEvent.keyboard('{Escape}'); // cannot be dismissed mid-action
    expect(onOpenChange).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open and shows an error when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        destructive
        itemName="Kalu Dodol 250g"
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).not.toHaveAttribute('aria-busy');
  });

  it('shows the specific reason when the caller can explain the failure', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('own account'));
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        confirmLabel="Switch off"
        onConfirm={onConfirm}
        describeError={(e) =>
          e instanceof Error ? 'You cannot switch off your own account.' : undefined
        }
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Switch off' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot switch off your own account.',
    );
  });

  it('falls back to the generic message when describeError has nothing to say', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        confirmLabel="Save"
        onConfirm={vi.fn().mockRejectedValue(new Error('x'))}
        describeError={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('a destructive dialog cannot be created without naming the item (compile-time rule)', () => {
    // @ts-expect-error itemName is required when destructive is set
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      destructive
      confirmLabel="Delete"
      onConfirm={() => {}}
    />;
  });

  it('a normal confirmation uses the primary (brand) button and a plain title', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        confirmLabel="Save changes"
        message="Prices will update on the website."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveClass('bg-brand');
  });

  it('works inside a parent that controls open state', async () => {
    function Parent() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <span>{open ? 'open' : 'closed'}</span>
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            destructive
            itemName="Aluwa Pack 12"
            confirmLabel="Delete"
            onConfirm={() => {}}
          />
        </>
      );
    }
    render(<Parent />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.getByText('closed')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
