import { SyncResponseSchema } from '@jogylink/shared';
import { authorizedFetch } from '../auth';
import type { PendingEvent } from '../storage';
import type { SyncApi, UploadResponse } from './types';

/** The sync endpoint. */
export const SYNC_PATH = '/sync';

/** Give up on one request after this long and let the engine retry. */
export const DEFAULT_UPLOAD_TIMEOUT_MS = 20_000;

export interface SyncApiOptions {
  /** Injectable so tests need no network; defaults to the app's authorized fetch. */
  fetchImpl?: (path: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  deviceId?: string;
}

/**
 * Posts a batch of events and reads the reply.
 *
 * Everything that might work later — no signal, a timeout, a 5xx, a reply that does not parse —
 * is thrown, because the engine must retry those with the queue untouched. Only a reply this
 * function returns is a statement about the events themselves.
 *
 * A 4xx is thrown too, and deliberately: a request the server calls malformed is a bug in this
 * app, not a reason to destroy a morning's sales. The server refuses individual events in the
 * `rejected` array of a normal reply, where each one carries a reason a person can act on.
 */
export function createSyncApi(options: SyncApiOptions = {}): SyncApi {
  const fetchImpl = options.fetchImpl ?? authorizedFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;

  return {
    async upload(events: readonly PendingEvent[]): Promise<UploadResponse> {
      const body = JSON.stringify({
        ...(options.deviceId ? { deviceId: options.deviceId } : {}),
        events: events.map((event) => ({
          uuid: event.uuid,
          type: event.type,
          createdAt: event.createdAt.toISOString(),
          payload: event.payload,
        })),
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchImpl(SYNC_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
      } catch (error) {
        throw new Error(
          controller.signal.aborted
            ? 'The upload took too long. It will be tried again.'
            : `No connection to the server (${describe(error)}).`,
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(`The server answered ${response.status}. Nothing has been sent yet.`);
      }

      const parsed = SyncResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new Error('The server replied with something this app could not read.');
      }

      return parsed.data;
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'unknown error';
}
