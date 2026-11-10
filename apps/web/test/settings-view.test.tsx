// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Setting } from '@jogylink/shared';
import { inOrder, type ExpiryDays } from '../lib/settings-form';
import { SettingsView } from '../app/(admin)/settings/settings-view';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, replace: vi.fn() }) }));

const at = new Date('2026-03-01T10:00:00Z');
const settings: Setting[] = [
  { key: 'retail_markup', value: 1.1, updatedAt: at },
  { key: 'expiry_green_min_days', value: 46, updatedAt: at },
  { key: 'expiry_yellow_min_days', value: 22, updatedAt: at },
  { key: 'expiry_orange_min_days', value: 8, updatedAt: at },
  { key: 'claim_value_trigger', value: 5000, updatedAt: at },
  { key: 'claim_age_trigger_days', value: 14, updatedAt: at },
];

const ok = () => vi.fn().mockImplementation(async () => new Response('{}', { status: 200 }));
const calls = (f: ReturnType<typeof vi.fn>) =>
  f.mock.calls.map((c) => ({
    url: c[0] as string,
    method: c[1].method as string,
    body: JSON.parse(c[1].body),
  }));

/** Replays the saves in order and checks the API would never see green > yellow > orange broken. */
function everyStepInOrder(f: ReturnType<typeof vi.fn>, start: ExpiryDays) {
  let state = start;
  for (const c of calls(f)) {
    state = { ...state, [c.url.split('/').pop()!]: c.body.value };
    expect(inOrder(state), JSON.stringify(state)).toBe(true);
  }
  return state;
}
const START: ExpiryDays = {
  expiry_green_min_days: 46,
  expiry_yellow_min_days: 22,
  expiry_orange_min_days: 8,
};

const card = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
const saveIn = (name: string) => within(card(name)).getByRole('button', { name: 'Save changes' });

beforeEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe('SettingsView', () => {
  it('shows the current values and when they last changed', () => {
    render(<SettingsView settings={settings} />);
    expect(screen.getByLabelText('Shop-wide markup')).toHaveValue('1.10');
    expect(screen.getByLabelText(/Green starts/)).toHaveValue('46');
    expect(screen.getByLabelText(/Claim when the value/)).toHaveValue('5000.00');
    expect(screen.getAllByText('Last changed 1 Mar 2026').length).toBeGreaterThan(0);
  });

  it('keeps every Save button off until something changes, and says why', () => {
    render(<SettingsView settings={settings} />);
    for (const name of ['Website prices', 'Expiry stages', 'Supplier claims']) {
      expect(saveIn(name)).toHaveAttribute('aria-disabled', 'true');
    }
    expect(screen.getAllByText('Change a value first')).toHaveLength(3);
  });

  describe('website markup', () => {
    it('previews the effect, asks first, and only then saves', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText('Shop-wide markup'));
      await user.type(screen.getByLabelText('Shop-wide markup'), '1.25');
      expect(screen.getByText(/sells on the website for Rs 125\.00/)).toBeInTheDocument();

      await user.click(saveIn('Website prices'));
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText(/change price on the website straight away/),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Update website prices' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(calls(fetchMock)).toEqual([
        { url: '/backend/settings/retail_markup', method: 'PUT', body: { value: 1.25 } },
      ]);
      expect(await screen.findByText('Saved')).toBeInTheDocument();
      expect(refresh).toHaveBeenCalled();
    });

    it('refuses a markup below 1 without asking the API or even opening the dialog', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText('Shop-wide markup'));
      await user.type(screen.getByLabelText('Shop-wide markup'), '0.9');
      await user.click(saveIn('Website prices'));
      expect(screen.getByText(/never cheaper than the shop/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('shows the real reason when the server refuses', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ message: 'Validation failed' }), { status: 400 }),
          ),
      );
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText('Shop-wide markup'));
      await user.type(screen.getByLabelText('Shop-wide markup'), '1.3');
      await user.click(saveIn('Website prices'));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Update website prices',
        }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent('Validation failed');
    });
  });

  describe('expiry stages', () => {
    it('explains what the stages mean, live', async () => {
      render(<SettingsView settings={settings} />);
      const list = screen.getByRole('list', { name: 'What the stages mean' });
      expect(list).toHaveTextContent('Green: 46 days or more left');
      expect(list).toHaveTextContent('Yellow: 22 to 45 days left');
      expect(list).toHaveTextContent('Orange: 8 to 21 days left');
      expect(list).toHaveTextContent('Red: 7 days or fewer: blocked from every sale');
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText(/Orange starts/));
      await user.type(screen.getByLabelText(/Orange starts/), '10');
      expect(screen.getByRole('list', { name: 'What the stages mean' })).toHaveTextContent(
        'Red: 9 days or fewer',
      );
    });

    it('raising all three never sends the API a bad in-between order', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      for (const [label, value] of [
        [/Green starts/, '60'],
        [/Yellow starts/, '31'],
        [/Orange starts/, '30'],
      ] as const) {
        await user.clear(screen.getByLabelText(label));
        await user.type(screen.getByLabelText(label), value);
      }
      await user.click(saveIn('Expiry stages'));
      await waitFor(() => expect(calls(fetchMock)).toHaveLength(3));
      expect(everyStepInOrder(fetchMock, START)).toEqual({
        expiry_green_min_days: 60,
        expiry_yellow_min_days: 31,
        expiry_orange_min_days: 30,
      });
      expect(await screen.findByText('Saved')).toBeInTheDocument();
    });

    it('lowering all three never sends the API a bad in-between order', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      for (const [label, value] of [
        [/Green starts/, '20'],
        [/Yellow starts/, '10'],
        [/Orange starts/, '5'],
      ] as const) {
        await user.clear(screen.getByLabelText(label));
        await user.type(screen.getByLabelText(label), value);
      }
      await user.click(saveIn('Expiry stages'));
      await waitFor(() => expect(calls(fetchMock)).toHaveLength(3));
      expect(everyStepInOrder(fetchMock, START)).toEqual({
        expiry_green_min_days: 20,
        expiry_yellow_min_days: 10,
        expiry_orange_min_days: 5,
      });
    });

    it('sends only what changed', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText(/Orange starts/));
      await user.type(screen.getByLabelText(/Orange starts/), '10');
      await user.click(saveIn('Expiry stages'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(calls(fetchMock)).toEqual([
        { url: '/backend/settings/expiry_orange_min_days', method: 'PUT', body: { value: 10 } },
      ]);
    });

    it('refuses an impossible order without calling the API', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText(/Green starts/));
      await user.type(screen.getByLabelText(/Green starts/), '10');
      await user.click(saveIn('Expiry stages'));
      expect(screen.getAllByText(/Green must be more days than Yellow/).length).toBeGreaterThan(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('supplier claims', () => {
    it('saves only the changed number, as a plain number', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText(/Claim when the value/));
      await user.type(screen.getByLabelText(/Claim when the value/), '7,500.50');
      await user.click(saveIn('Supplier claims'));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(calls(fetchMock)).toEqual([
        { url: '/backend/settings/claim_value_trigger', method: 'PUT', body: { value: 7500.5 } },
      ]);
    });

    it('explains a bad amount or day count', async () => {
      const fetchMock = ok();
      vi.stubGlobal('fetch', fetchMock);
      render(<SettingsView settings={settings} />);
      const user = userEvent.setup();
      await user.clear(screen.getByLabelText(/Claim when the value/));
      await user.type(screen.getByLabelText(/Claim when the value/), 'lots');
      await user.clear(screen.getByLabelText(/stock is this old/));
      await user.type(screen.getByLabelText(/stock is this old/), '0');
      await user.click(saveIn('Supplier claims'));
      expect(screen.getByText(/Enter an amount in rupees/)).toBeInTheDocument();
      expect(screen.getByText(/whole number of days, 1 or more/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
