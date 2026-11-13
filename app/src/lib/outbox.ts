/**
 * The outbox: changes to a day's log (confirm, skip, save what I ate) are stored on the phone
 * first and sent to the server in order. Online that takes a moment; offline they wait.
 *
 * Screens show pending operations by laying them over the loaded data (applyOps), so a change is
 * visible at once and stays visible across restarts until the server has it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { DayData } from '@/lib/daylog';
import { replaceEntries } from '@/lib/log-entries';
import { addOp, applyOps, sendOps, type NewOp, type OutboxOp } from '@/lib/outbox-model';
import { authReady, pb } from '@/lib/pocketbase';
import { queryClient } from '@/lib/query-client';
import type { LogEntryRecord } from '@/lib/types';

const KEY = 'qc.outbox';

let ops: OutboxOp[] = [];
let rejected = 0;
let inFlightId: string | null = null;
const listeners = new Set<() => void>();

const loaded: Promise<void> = AsyncStorage.getItem(KEY)
  .then((raw) => {
    const parsed = JSON.parse(raw ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) set([...parsed, ...ops]);
  })
  .catch(() => undefined);

function set(next: OutboxOp[]) {
  ops = next;
  listeners.forEach((l) => l());
}

const save = () => AsyncStorage.setItem(KEY, JSON.stringify(ops)).catch(() => undefined);

let counter = 0;
const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Record a change and try to send it. Resolves once it is safely stored on the phone. */
export async function enqueueOp(op: NewOp): Promise<void> {
  await loaded;
  set(addOp(ops, op, newId(), inFlightId));
  await save();
  void flushOutbox();
}

async function send(op: OutboxOp) {
  inFlightId = op.id;
  try {
    if (op.entries) {
      const existing = await pb
        .collection('log_entries')
        .getFullList<LogEntryRecord>({ filter: pb.filter('log_slot = {:id}', { id: op.slotId }), sort: 'sort' });
      await replaceEntries(op.slotId, existing, op.entries);
    }
    await pb.collection('log_slots').update(op.slotId, { status: op.status });
  } finally {
    inFlightId = null;
  }
}

let flushing: Promise<void> | null = null;

/** Send what is waiting, in order. Safe to call any time; concurrent calls share one run. */
export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    try {
      await Promise.all([loaded, authReady]);
      if (ops.length === 0 || !pb.authStore.isValid) return;
      const dates = new Set<string>();
      await sendOps([...ops], send, async (op, outcome) => {
        if (outcome === 'sent') {
          // Fold the change into the loaded data before dropping it, so the screen does not
          // flick back to the old state while the day is refetched.
          queryClient.setQueryData<DayData>(['day', op.date], (data) => (data ? { ...data, slots: applyOps(data.slots, [op]) } : data));
          dates.add(op.date);
        } else {
          rejected++;
        }
        set(ops.filter((o) => o.id !== op.id));
        await save();
      });
      for (const date of dates) void queryClient.invalidateQueries({ queryKey: ['day', date] });
      if (dates.size > 0) void queryClient.invalidateQueries({ queryKey: ['week'] });
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Operations waiting to be sent, for code outside React. */
export const pendingOps = () => ops;

/** Forget everything waiting (on sign-out). */
export async function clearOutbox() {
  await loaded;
  rejected = 0;
  set([]);
  await save();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The operations waiting to be sent. Re-renders when the list changes. */
export function useOutbox(): OutboxOp[] {
  return useSyncExternalStore(subscribe, pendingOps, pendingOps);
}

/** How many changes the server refused since the app started (shown once as a notice). */
export function useRejectedCount(): number {
  return useSyncExternalStore(subscribe, () => rejected, () => rejected);
}
