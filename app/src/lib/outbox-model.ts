/**
 * Pure outbox model: changes to today's log that have been made on the phone but may not have
 * reached the server yet.
 *
 * Every confirm, skip and "save what I ate" becomes an operation. Operations are shown at once by
 * laying them over the data from the server (applyOps), stored on the phone, and sent in order.
 */

import type { EntryDraft, LoggedSlot } from '@/lib/daylog-model';
import type { IsoDate, LogEntryRecord, SlotStatus } from '@/lib/types';

export type OutboxOp = {
  id: string;
  date: IsoDate;
  slotId: string;
  /** The slot's new status. */
  status: SlotStatus;
  /** When set, the slot's entries are replaced with these. */
  entries?: EntryDraft[];
};

export type NewOp = Omit<OutboxOp, 'id'>;

/**
 * Add an operation, folding it into an earlier one for the same slot where that is safe:
 * the latest status wins, and a status change keeps entries saved just before it.
 * An operation that is being sent right now (`inFlightId`) is left alone.
 */
export function addOp(ops: OutboxOp[], next: NewOp, id: string, inFlightId: string | null = null): OutboxOp[] {
  const index = ops.findLastIndex((op) => op.slotId === next.slotId && op.id !== inFlightId);
  const isLastForSlot = index >= 0 && !ops.slice(index + 1).some((op) => op.slotId === next.slotId);
  if (!isLastForSlot) return [...ops, { ...next, id }];
  const previous = ops[index];
  const merged: OutboxOp = { ...previous, status: next.status, entries: next.entries ?? previous.entries };
  return ops.map((op, i) => (i === index ? merged : op));
}

function pendingEntry(slot: LoggedSlot, draft: EntryDraft, sort: number): LogEntryRecord {
  return { ...draft, id: `pending-${slot.id}-${sort}`, user: slot.user, created: '', updated: '', log_slot: slot.id, sort };
}

/** Lay pending operations over slots loaded from the server. */
export function applyOps(slots: LoggedSlot[], ops: OutboxOp[]): LoggedSlot[] {
  if (ops.length === 0) return slots;
  return slots.map((slot) => {
    let result = slot;
    for (const op of ops) {
      if (op.slotId !== slot.id) continue;
      result = {
        ...result,
        status: op.status,
        entries: op.entries ? op.entries.map((draft, i) => pendingEntry(slot, draft, i)) : result.entries,
      };
    }
    return result;
  });
}

export type SendOutcome = 'sent' | 'offline' | 'rejected';

/**
 * What a failed request means for the operation that caused it.
 * - No response or a server fault: the phone is offline or the server is down. Keep it and retry.
 * - A refusal (the slot is gone, the session ended, the data is invalid): it can never succeed. Drop it.
 */
export function classifyFailure(status: number | undefined): Exclude<SendOutcome, 'sent'> {
  if (status === undefined || status === 0 || status === 429 || status >= 500) return 'offline';
  return 'rejected';
}

/**
 * Send operations in order. Stops at the first one that cannot be sent now, so a later change
 * never overtakes an earlier one. Returns what was sent, what was rejected, and what is left.
 */
export async function sendOps(
  ops: OutboxOp[],
  send: (op: OutboxOp) => Promise<void>,
  onDone: (op: OutboxOp, outcome: 'sent' | 'rejected') => Promise<void> | void,
): Promise<{ sent: number; rejected: number; stoppedOffline: boolean }> {
  let sent = 0;
  let rejected = 0;
  for (const op of ops) {
    let outcome: SendOutcome = 'sent';
    try {
      await send(op);
    } catch (err) {
      outcome = classifyFailure((err as { status?: number })?.status);
    }
    if (outcome === 'offline') return { sent, rejected, stoppedOffline: true };
    await onDone(op, outcome);
    if (outcome === 'sent') sent++;
    else rejected++;
  }
  return { sent, rejected, stoppedOffline: false };
}
