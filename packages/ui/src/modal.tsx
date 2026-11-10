import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './button';

/**
 * C10 — Modal Dialog (UI Design Guide, section 5).
 * Title, message, then Secondary (left) and Primary (right). Radix handles the focus trap,
 * Escape to close and screen-reader roles.
 */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons, Secondary first (left), Primary last (right). */
  footer?: ReactNode;
}

export function Modal({ open, onOpenChange, title, description, children, footer }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-charcoal/50" />
        <Dialog.Content
          // Without a description, tell Radix that is intentional (it would warn otherwise).
          {...(description ? {} : { 'aria-describedby': undefined })}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-modal bg-white p-6 text-charcoal shadow-level-3 outline-none"
        >
          <Dialog.Title className="text-h2 font-semibold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-2 text-body">{description}</Dialog.Description>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {footer ? <div className="mt-6 flex justify-end gap-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ConfirmCommon = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Verb on the confirm button: "Delete", "Block", "Save". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Extra explanation. Destructive dialogs default to "This cannot be undone." */
  message?: string;
  /** May be async. While it runs, both buttons are locked so it cannot run twice. */
  onConfirm: () => void | Promise<void>;
};

/**
 * Destructive actions MUST name the item ("Delete Kalu Dodol 250g? This cannot be undone."),
 * never a bare "Are you sure?". The type makes `itemName` mandatory when `destructive` is set,
 * and the confirm button is Danger Crimson instead of brand red.
 */
export type ConfirmDialogProps = ConfirmCommon &
  ({ destructive: true; itemName: string } | { destructive?: false; itemName?: string });

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange, confirmLabel, cancelLabel = 'Cancel', onConfirm } = props;
  const destructive = props.destructive === true;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (open) setFailed(false);
  }, [open]);

  const title = destructive ? `${confirmLabel} ${props.itemName}?` : confirmLabel;
  const message = props.message ?? (destructive ? 'This cannot be undone.' : undefined);

  async function handleConfirm() {
    setPending(true);
    setFailed(false);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      setFailed(true); // stay open so the user can retry or cancel
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next); // cannot be dismissed mid-action
      }}
      title={title}
      description={message}
      footer={
        <>
          {/* Cancel comes first, so focus starts on the safe choice */}
          {pending ? (
            <Button
              variant="secondary"
              disabled
              disabledReason="Please wait, this is still running"
            >
              {cancelLabel}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={pending}
            loadingLabel="Working…"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {failed ? (
        <p role="alert" className="text-caption text-alarm">
          Something went wrong. Try again, or cancel.
        </p>
      ) : null}
    </Modal>
  );
}
