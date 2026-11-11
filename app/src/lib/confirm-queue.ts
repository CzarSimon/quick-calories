/**
 * Confirmations made from a notification, kept on the phone until the server has them.
 * A tap on "Ate as planned" is written here first, so it survives a missing connection or the
 * app being closed before the request finishes.
 */

import type { QueuedConfirmation } from '@/lib/reminders-model';

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const QUEUE_KEY = 'qc.confirm-queue';
const HANDLED_KEY = 'qc.handled-responses';
const MAX_HANDLED = 100;

async function read<T>(storage: KeyValueStorage, key: string): Promise<T[]> {
  try {
    const parsed = JSON.parse((await storage.getItem(key)) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const same = (a: QueuedConfirmation, b: QueuedConfirmation) => a.date === b.date && a.planSlotId === b.planSlotId;

export function createConfirmQueue(storage: KeyValueStorage) {
  return {
    list: () => read<QueuedConfirmation>(storage, QUEUE_KEY),

    async add(item: QueuedConfirmation) {
      const queue = await read<QueuedConfirmation>(storage, QUEUE_KEY);
      if (!queue.some((q) => same(q, item))) await storage.setItem(QUEUE_KEY, JSON.stringify([...queue, item]));
    },

    async remove(item: QueuedConfirmation) {
      const queue = await read<QueuedConfirmation>(storage, QUEUE_KEY);
      await storage.setItem(QUEUE_KEY, JSON.stringify(queue.filter((q) => !same(q, item))));
    },

    /**
     * Record that a notification response was acted on. Returns false when it already was:
     * iOS can hand the same response to the app again on the next start.
     */
    async markHandled(responseKey: string): Promise<boolean> {
      const handled = await read<string>(storage, HANDLED_KEY);
      if (handled.includes(responseKey)) return false;
      await storage.setItem(HANDLED_KEY, JSON.stringify([...handled, responseKey].slice(-MAX_HANDLED)));
      return true;
    },
  };
}

export type ConfirmQueue = ReturnType<typeof createConfirmQueue>;

/**
 * Send queued confirmations. `confirm` returns normally when the server has dealt with the item
 * (confirmed, or nothing left to confirm) and throws when it could not be reached; the item then
 * stays queued and the rest wait for the next attempt.
 */
export async function flushConfirmQueue(queue: ConfirmQueue, confirm: (item: QueuedConfirmation) => Promise<unknown>): Promise<{ sent: number; left: number }> {
  const items = await queue.list();
  let sent = 0;
  for (const item of items) {
    try {
      await confirm(item);
    } catch {
      break;
    }
    await queue.remove(item);
    sent++;
  }
  return { sent, left: items.length - sent };
}
