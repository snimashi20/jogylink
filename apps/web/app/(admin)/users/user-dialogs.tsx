'use client';

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button, FormField, Modal } from '@jogylink/ui';
import type { Role, User } from '@jogylink/shared';
import { ApiError, callApi } from '../../../lib/client-api';
import { passwordProblem, validateNewUser, type NewUserErrors } from '../../../lib/user-form';

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', worker: 'Worker (POS)' };

function RoleSelect({
  value,
  onChange,
  disabled,
  note,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  note?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-body font-semibold text-charcoal">
        Role
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
        aria-describedby={note ? `${id}-note` : undefined}
        className="h-11 rounded-control border border-sand bg-white px-3 text-body text-charcoal disabled:bg-sand disabled:text-stone"
      >
        <option value="worker">Worker: uses the POS app</option>
        <option value="owner">Owner: full access, including this website</option>
      </select>
      {note ? (
        <p id={`${id}-note`} className="text-caption text-stone">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex justify-end gap-3">{children}</div>;
}

function saveFailure(err: unknown): string {
  if (err instanceof ApiError && err.status === 0) return err.message;
  if (err instanceof ApiError && err.status === 403) {
    return 'Only the owner can manage users. Sign in as the owner and try again.';
  }
  return 'Could not save. Check the details and try again.';
}

/* ------------------------------------------------------------------ add */

export function AddUserDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (user: User) => void;
}) {
  const blank = { name: '', username: '', password: '', role: 'worker' as Role };
  const [values, setValues] = useState(blank);
  const [errors, setErrors] = useState<NewUserErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(blank);
      setErrors({});
      setFormError(null);
      setPending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const result = validateNewUser(values);
    if (!result.ok) return setErrors(result.errors);
    setErrors({});
    setFormError(null);
    setPending(true);
    try {
      onSaved(await callApi<User>('POST', '/users', result.value));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ username: 'This username is already taken. Choose a different one.' });
      } else setFormError(saveFailure(err));
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title="Add user"
      description="Give the new person their username and a first password. Share it with them in person."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Name"
          required
          value={values.name}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
          error={errors.name}
          placeholder="e.g. Kamal Perera"
        />
        <FormField
          label="Username"
          required
          value={values.username}
          onChange={(e) => setValues({ ...values, username: e.target.value })}
          error={errors.username}
          helperText="They type this to sign in. It cannot be changed later."
          autoCapitalize="none"
          autoComplete="off"
        />
        <FormField
          label="First password"
          required
          type="password"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
          error={errors.password}
          helperText="At least 8 characters."
          autoComplete="new-password"
        />
        <RoleSelect value={values.role} onChange={(role) => setValues({ ...values, role })} />
        {formError ? (
          <p role="alert" className="text-caption text-alarm">
            {formError}
          </p>
        ) : null}
        <Actions>
          <Button variant="secondary" onClick={() => !pending && onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            Add user
          </Button>
        </Actions>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- edit */

export function EditUserDialog({
  user,
  isSelf,
  onOpenChange,
  onSaved,
}: {
  user: User | null;
  isSelf: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (user: User) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setRole(user.role);
      setNameError(undefined);
      setFormError(null);
      setPending(false);
    }
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || pending) return;
    if (name.trim() === '') return setNameError("Enter the person's name.");
    setNameError(undefined);
    setFormError(null);
    setPending(true);
    try {
      // Your own role is never sent: the server refuses it, and the screen does not offer it.
      const body = isSelf ? { name: name.trim() } : { name: name.trim(), role };
      onSaved(await callApi<User>('PATCH', `/users/${user.id}`, body));
      onOpenChange(false);
    } catch (err) {
      setFormError(saveFailure(err));
      setPending(false);
    }
  }

  return (
    <Modal
      open={user !== null}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={user ? `Edit ${user.name}` : 'Edit user'}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
        <RoleSelect
          value={role}
          onChange={setRole}
          disabled={isSelf}
          note={isSelf ? 'You cannot change your own role.' : undefined}
        />
        {formError ? (
          <p role="alert" className="text-caption text-alarm">
            {formError}
          </p>
        ) : null}
        <Actions>
          <Button variant="secondary" onClick={() => !pending && onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            Save changes
          </Button>
        </Actions>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------- reset password */

export function ResetPasswordDialog({
  user,
  onOpenChange,
  onDone,
}: {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onDone: (user: User) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword('');
      setError(undefined);
      setFormError(null);
      setPending(false);
    }
  }, [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || pending) return;
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setError(undefined);
    setFormError(null);
    setPending(true);
    try {
      await callApi('PATCH', `/users/${user.id}`, { password });
      onDone(user);
      onOpenChange(false);
    } catch (err) {
      setFormError(saveFailure(err));
      setPending(false);
    }
  }

  return (
    <Modal
      open={user !== null}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={user ? `Reset password for ${user.name}` : 'Reset password'}
      description="Their old password stops working straight away. Tell them the new one in person."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField
          label="New password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
          helperText="At least 8 characters."
          autoComplete="new-password"
        />
        {formError ? (
          <p role="alert" className="text-caption text-alarm">
            {formError}
          </p>
        ) : null}
        <Actions>
          <Button variant="secondary" onClick={() => !pending && onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={pending} loadingLabel="Saving…">
            Reset password
          </Button>
        </Actions>
      </form>
    </Modal>
  );
}
