import { ListRow } from '@/components/ui';
import type { ThemeColor } from '@/constants/theme';
import { sumNutrition } from '@/domain';
import { slotState, type LoggedSlot, type SlotState } from '@/lib/daylog-model';
import { formatKcal } from '@/lib/format';

const STATE: Record<SlotState, { label: string; color?: ThemeColor; bold?: boolean }> = {
  planned: { label: 'Planned' },
  unconfirmed: { label: 'Unconfirmed', color: 'text', bold: true },
  confirmed: { label: '✓ Confirmed' },
  adjusted: { label: '✓ Adjusted' },
  skipped: { label: 'Skipped' },
  open: { label: 'Log meal', color: 'accent', bold: true },
  logged: { label: '✓ Logged' },
  unplanned: { label: 'Unplanned' },
};

/** Words for screen readers, without the check mark. */
const SPOKEN: Record<SlotState, string> = {
  planned: 'Planned',
  unconfirmed: 'Unconfirmed',
  confirmed: 'Confirmed',
  adjusted: 'Adjusted',
  skipped: 'Skipped',
  open: 'Not logged yet',
  logged: 'Logged',
  unplanned: 'Unplanned',
};

/** One meal of the day. The whole row opens the meal; the state is always a word, never colour alone. */
export function SlotRow({ slot, now, first, onOpen }: { slot: LoggedSlot; now: string | null; first?: boolean; onOpen: () => void }) {
  const state = slotState(slot, now);
  const total = sumNutrition(slot.entries);
  const hasEntries = slot.entries.length > 0;
  const subtitle = hasEntries
    ? `${slot.entries.map((e) => e.name).join(' + ')} · ${formatKcal(total.kcal)} kcal`
    : slot.kind === 'open'
      ? 'Nothing logged yet'
      : 'Nothing planned';
  const { label, color, bold } = STATE[state];
  return (
    <ListRow
      first={first}
      leading={slot.time}
      title={slot.name}
      subtitle={subtitle}
      trailing={label}
      trailingColor={color}
      trailingBold={bold}
      struck={state === 'skipped'}
      onPress={onOpen}
      testID={`slot-${slot.name}`}
      accessibilityLabel={`${slot.name}, ${slot.time}, ${SPOKEN[state]}${hasEntries ? `, ${formatKcal(total.kcal)} kcal` : ''}`}
    />
  );
}
