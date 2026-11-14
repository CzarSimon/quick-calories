/**
 * Pure outbox model: changes to a day's log that have been made on the phone but may not have
 * reached the server yet.
 *
 * Every confirm, skip, "save what I ate", and every unplanned slot created, edited or removed,
 * becomes an operation. Operations are shown at once by laying them over the data from the server
 * (applyOps), stored on the phone, and sent in order.
 */

import type { EntryDraft, LoggedSlot } from '@/lib/daylog-model';
import type { IsoDate, LogEntryRecord, SlotStatus } from '@/lib/types';

/** A slot that does not exist on the server yet. Its id is chosen on the phone. */
export type SlotCreate = { dayLogId: string; name: string; time: string; sort: number };

export type OutboxOp = {
  id: string;
  date: IsoDate;
  slotId: string;
  /** The slot's new status. Left out when only the name or time changes. */
  status?: SlotStatus;
  /** When set, the slot's entries are replaced with these. */
  entries?: EntryDraft[];
  /** Create the slot first (an unplanned slot logged on the phone). */
  create?: SlotCreate;
  /** A new name or time for the slot. */
  fields?: { name?: string; time?: string };
  /** Delete the slot. Nothing else in the operation is sent. */
  remove?: true;
};

export type NewOp = Omit<OutboxOp, 'id'>;

/**
 * Add an operation, folding it into the latest earlier one for the same slot where that is safe:
 * the latest status wins, entries saved before a status change are kept, a pending creation is
 * kept, and new fields are merged. Removing a slot whose creation has not been sent yet cancels
 * both, since the server never knew about it.
 * An operation that is being sent right now (`inFlightId`) is left alone.
 */
export function addOp(ops: OutboxOp[], next: NewOp, id: string, inFlightId: string | null = null): OutboxOp[] {
  const index = ops.findLastIndex((op) => op.slotId === next.slotId && op.id !== inFlightId);
  const isLastForSlot = index >= 0 && !ops.slice(index + 1).some((op) => op.slotId === next.slotId);
  if (!isLastForSlot) return [...ops, { ...next, id }];
  const previous = ops[index];
  if (next.remove && previous.create) return ops.filter((_, i) => i !== index);
  const merged: OutboxOp = next.remove
    ? { id: previous.id, date: previous.date, slotId: previous.slotId, remove: true }
    : {
        ...previous,
        status: next.status ?? previous.status,
        entries: next.entries ?? previous.entries,
        ...(previous.fields || next.fields ? { fields: { ...previous.fields, ...next.fields } } : {}),
      };
  return ops.map((op, i) => (i === index ? merged : op));
}

function pendingEntry(slot: LoggedSlot, draft: EntryDraft, sort: number): LogEntryRecord {
  return { ...draft, id: `pending-${slot.id}-${sort}`, user: slot.user, created: '', updated: '', log_slot: slot.id, sort };
}

function createdSlot(op: OutboxOp & { create: SlotCreate }): LoggedSlot {
  const { dayLogId, name, time, sort } = op.create;
  return { id: op.slotId, user: '', created: '', updated: '', day_log: dayLogId, plan_slot: '', name, time, kind: 'open', status: op.status ?? 'confirmed', sort, entries: [] };
}

const byTime = (a: LoggedSlot, b: LoggedSlot) => a.time.localeCompare(b.time) || a.sort - b.sort;

/**
 * Lay pending operations over one day's slots loaded from the server. `dayLogId` is the day the
 * slots belong to: a slot created on the phone is only added to its own day. When it is left out
 * it is taken from the slots themselves.
 */
export function applyOps(slots: LoggedSlot[], ops: OutboxOp[], dayLogId?: string): LoggedSlot[] {
  if (ops.length === 0) return slots;
  const day = dayLogId ?? slots[0]?.day_log;
  const known = new Set(slots.map((s) => s.id));
  const created = ops.filter((op): op is OutboxOp & { create: SlotCreate } => !!op.create && op.create.dayLogId === day && !known.has(op.slotId));
  const all = created.length ? [...slots, ...created.map(createdSlot)] : slots;
  let reshaped = created.length > 0;

  const shown: LoggedSlot[] = [];
  for (const slot of all) {
    let result: LoggedSlot | null = slot;
    for (const op of ops) {
      if (op.slotId !== slot.id || !result) continue;
      if (op.remove) {
        result = null;
        reshaped = true;
        continue;
      }
      if (op.fields) reshaped = true;
      result = {
        ...result,
        ...op.fields,
        status: op.status ?? result.status,
        entries: op.entries ? op.entries.map((draft, i) => pendingEntry(slot, draft, i)) : result.entries,
      };
    }
    if (result) shown.push(result);
  }
  return reshaped ? shown.sort(byTime) : shown;
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
