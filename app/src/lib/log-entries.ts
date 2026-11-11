import { sameEntries, type EntryDraft } from '@/lib/daylog-model';
import { currentUserId, pb } from '@/lib/pocketbase';
import type { LogEntryRecord } from '@/lib/types';

/** Make a slot's stored entries match `drafts`, reusing rows by position. */
export async function replaceEntries(slotId: string, existing: LogEntryRecord[], drafts: EntryDraft[]) {
  const user = currentUserId();
  for (const [sort, draft] of drafts.entries()) {
    const row = existing[sort];
    if (!row) {
      await pb.collection('log_entries').create({ ...draft, user, log_slot: slotId, sort });
    } else if (!sameEntries([row], [draft]) || row.origin !== draft.origin || row.sort !== sort) {
      await pb.collection('log_entries').update(row.id, { ...draft, sort });
    }
  }
  for (const row of existing.slice(drafts.length)) await pb.collection('log_entries').delete(row.id);
}
