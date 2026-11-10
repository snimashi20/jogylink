// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@jogylink/shared';
import { UsersView } from '../app/(admin)/users/users-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const WORKER_ID = '22222222-2222-4222-8222-222222222222';

const owner: User = {
  id: OWNER_ID,
  name: 'Owner',
  username: 'owner',
  role: 'owner',
  active: true,
  createdAt: new Date('2026-01-05T10:00:00Z'),
};
const worker: User = {
  id: WORKER_ID,
  name: 'Kamal',
  username: 'kamal',
  role: 'worker',
  active: true,
  createdAt: new Date('2026-02-10T10:00:00Z'),
};

const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
const view = (users: User[] = [owner, worker]) =>
  render(<UsersView users={users} currentUserId={OWNER_ID} />);
const sent = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => ({
  url: fetchMock.mock.calls[call]![0] as string,
  method: fetchMock.mock.calls[call]![1].method as string,
  body: JSON.parse(fetchMock.mock.calls[call]![1].body),
});

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe('UsersView', () => {
  it('lists people with role and status as text (not colour alone), and marks you', () => {
    view([owner, worker, { ...worker, id: '3', name: 'Nimal', username: 'nimal', active: false }]);
    const row = screen.getByRole('row', { name: /Kamal/ });
    expect(within(row).getByText('Worker (POS)')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /Nimal/ })).getByText('Switched off'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /Owner/ })).getByText('(you)'),
    ).toBeInTheDocument();
    expect(within(row).getByText('10 Feb 2026')).toBeInTheDocument();
  });

  it('will not let you switch off your own account, and says why', () => {
    view();
    const own = screen.getByRole('button', { name: 'Switch off Owner' });
    expect(own).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('You cannot switch off your own account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch off Kamal' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('adds a user with a clean username and sends the chosen role', async () => {
    const fetchMock = reply(201, worker);
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add user/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Nimal Silva');
    await user.type(within(dialog).getByLabelText(/Username/), ' NimalS ');
    await user.type(within(dialog).getByLabelText(/First password/), 'nimal-pass-1');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'owner');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toEqual({
      url: '/backend/users',
      method: 'POST',
      body: { name: 'Nimal Silva', username: 'nimals', password: 'nimal-pass-1', role: 'owner' },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not call the API for an invalid form, and explains each field', async () => {
    const fetchMock = reply(201);
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add user/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Username/), 'a b');
    await user.type(within(dialog).getByLabelText(/First password/), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));

    expect(within(dialog).getByText(/Enter the person's name/)).toBeInTheDocument();
    expect(within(dialog).getByText(/no spaces/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/at least 8 characters\./i, { selector: 'p[role=alert]' }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('puts a taken username on the username field', async () => {
    vi.stubGlobal('fetch', reply(409, { message: 'taken' }));
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add user/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name/), 'Dup');
    await user.type(within(dialog).getByLabelText(/Username/), 'kamal');
    await user.type(within(dialog).getByLabelText(/First password/), 'long-enough-1');
    await user.click(within(dialog).getByRole('button', { name: 'Add user' }));
    expect(await within(dialog).findByText(/already taken/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("changes someone else's name and role", async () => {
    const fetchMock = reply(200, worker);
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Kamal' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'owner');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toEqual({
      url: `/backend/users/${WORKER_ID}`,
      method: 'PATCH',
      body: { name: 'Kamal', role: 'owner' },
    });
  });

  it('locks your own role and never sends it', async () => {
    const fetchMock = reply(200, owner);
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit Owner' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Role')).toBeDisabled();
    expect(within(dialog).getByText('You cannot change your own role.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock).body).toEqual({ name: 'Owner' });
  });

  it('resets a password, checks its length first, and confirms without showing it', async () => {
    const fetchMock = reply(200, worker);
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reset password for Kamal' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/New password/), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/New password/));
    await user.type(within(dialog).getByLabelText(/New password/), 'brand-new-pass');
    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock)).toEqual({
      url: `/backend/users/${WORKER_ID}`,
      method: 'PATCH',
      body: { password: 'brand-new-pass' },
    });
    expect(await screen.findByText(/Password changed for Kamal/)).toBeInTheDocument();
    expect(screen.queryByText(/brand-new-pass/)).not.toBeInTheDocument();
  });

  it('asks before switching someone off, naming them, and only then calls the API', async () => {
    const fetchMock = reply(200, { ...worker, active: false });
    vi.stubGlobal('fetch', fetchMock);
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch off Kamal' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Kamal will be signed out/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent(fetchMock).body).toEqual({ active: false });
  });

  it('switches someone back on without asking', async () => {
    const fetchMock = reply(200, worker);
    vi.stubGlobal('fetch', fetchMock);
    view([owner, { ...worker, active: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Switch on Kamal' }));
    await waitFor(() => expect(sent(fetchMock).body).toEqual({ active: true }));
  });

  it('shows the server reason when a switch-off is refused', async () => {
    vi.stubGlobal('fetch', reply(409, { message: 'You cannot deactivate your own account.' }));
    view();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Switch off Kamal' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Switch off' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot deactivate your own account.',
    );
  });
});
