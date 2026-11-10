// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../app/login/login-form';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const reply = (status: number) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status }));

async function fillIn(password = 'secret-pass') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/username/i), 'owner');
  await user.type(screen.getByLabelText(/^password/i), password);
  return user;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  replace.mockClear();
  refresh.mockClear();
});

describe('LoginForm', () => {
  it('cannot be submitted empty, and says why', () => {
    render(<LoginForm />);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Enter your username and password')).toBeInTheDocument();
  });

  it('signs in and goes to the home page', async () => {
    const fetchMock = reply(200);
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm />);
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      username: 'owner',
      password: 'secret-pass',
    });
  });

  it('says how to fix a wrong password, and stays on the page', async () => {
    vi.stubGlobal('fetch', reply(401));
    render(<LoginForm />);
    const user = await fillIn('wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Check them and try again');
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('tells a locked-out person how long to wait', async () => {
    vi.stubGlobal('fetch', reply(429));
    render(<LoginForm />);
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait 15 minutes');
  });

  it('explains a network failure differently from a wrong password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<LoginForm />);
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server');
  });

  it('shows progress and blocks a double submit while signing in', async () => {
    let finish: (r: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((r) => (finish = r)));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginForm />);
    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Signing in…')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response('{}', { status: 200 }));
  });
});
