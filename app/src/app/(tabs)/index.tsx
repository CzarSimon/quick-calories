import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NeedsWeight } from '@/components/needs-weight';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, MacroLine } from '@/components/ui';
import { Spacing, TabScreenTopInset, type ThemeColor } from '@/constants/theme';
import { addDays, sumNutrition } from '@/domain';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { confirmableSlots, isDue } from '@/lib/daylog-model';
import { useDay, useSetSlotStatus, type DayView, type LoggedSlot } from '@/lib/daylog';
import { useWeek } from '@/lib/week';
import { formatKcal, formatSignedKcal } from '@/lib/format';
import { errorMessage } from '@/lib/library';

function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function TodayScreen() {
  const now = useNow();
  // Days back from today; 0 is today. Stays relative so the screen rolls over at midnight.
  const [daysBack, setDaysBack] = useState(0);
  const date = addDays(now.date, -daysBack);
  const day = useDay(date, now.date);
  const [refreshing, setRefreshing] = useState(false);

  const title = daysBack === 0 ? 'Today' : daysBack === 1 ? 'Yesterday' : formatDate(date).split(' ')[0];
  const position = `Day ${day.dayIndex + 1} of ${day.microcycleLength}`;

  const refresh = () => {
    setRefreshing(true);
    day.retry();
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <View style={styles.header}>
            <View style={styles.grow}>
              <ThemedText type="eyebrow">
                {formatDate(date)} · {position}
              </ThemedText>
              <ThemedText type="title">{title}</ThemedText>
            </View>
            <Link href="/settings" asChild>
              <Pressable accessibilityRole="button" hitSlop={8}>
                <ThemedText type="smallBold" themeColor="carb">
                  Settings
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          <View style={styles.dayNav}>
            <Button label="‹ Previous day" compact onPress={() => setDaysBack(daysBack + 1)} testID="day-prev" />
            {daysBack > 0 ? <Button label={daysBack === 1 ? 'Today ›' : 'Next day ›'} compact onPress={() => setDaysBack(daysBack - 1)} testID="day-next" /> : null}
          </View>

          <DayBody day={day} nowTime={daysBack === 0 ? now.time : null} today={now.date} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DayBody({ day, nowTime, today }: { day: DayView; nowTime: string | null; today: string }) {
  const setStatus = useSetSlotStatus(day.date);
  // The current microcycle, for what today does to the days that follow.
  const week = useWeek(today, 0, day.bwKg);

  if (day.state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        {day.isSyncing ? (
          <ThemedText type="small" themeColor="textSecondary">
            Setting up today from your schedule…
          </ThemedText>
        ) : null}
      </View>
    );
  }
  if (day.state === 'error') {
    return (
      <Card>
        <ThemedText type="small">{errorMessage(day.error)}</ThemedText>
        <Button label="Try again" onPress={day.retry} />
      </Card>
    );
  }
  if (day.state === 'needs-weight') return <NeedsWeight />;
  if (day.state === 'no-schedule') {
    return (
      <Card>
        <ThemedText type="smallBold">No active schedule</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Today is built from your active schedule. Open a schedule and make it active.
        </ThemedText>
        <Button label="Open Schedules" onPress={() => router.push('/schedules')} />
      </Card>
    );
  }
  if (day.state === 'no-plan-day') {
    return (
      <Card>
        <ThemedText type="smallBold">Your schedule has no plan for this day</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The active schedule has fewer days than your microcycle. Add the day in Schedules.
        </ThemedText>
      </Card>
    );
  }
  if (day.state === 'no-log' || !day.targets || !day.projection) {
    return (
      <Card>
        <ThemedText type="smallBold">Nothing was logged this day</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A day is set up from your schedule the first time you open the app on it.
        </ThemedText>
      </Card>
    );
  }

  const { targets, projection, slots } = day;
  const correction = day.baseTargets ? targets.kcal - day.baseTargets.kcal : 0;
  const tomorrow = day.isToday ? week.summary?.days.find((d) => d.when === 'future') : undefined;
  const tomorrowShift = tomorrow?.target && tomorrow.base ? tomorrow.target.kcal - tomorrow.base.kcal : 0;
  const due = confirmableSlots(slots, nowTime);
  const firstOpen = slots.find((s) => s.kind === 'open' && s.status !== 'skipped' && s.entries.length === 0);
  const openSlot = (slot: LoggedSlot) => router.push({ pathname: '/log-slot/[id]', params: { id: slot.id, date: day.date } });

  return (
    <>
      <Card>
        <View style={styles.kcalRow}>
          <ThemedText type="title" style={styles.tabular} testID="kcal-consumed">
            {formatKcal(projection.consumed.kcal)}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.tabular}>
            of {formatKcal(targets.kcal)} kcal
          </ThemedText>
        </View>
        {correction !== 0 && day.baseTargets ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.tabular} testID="target-correction">
            Plan {formatKcal(day.baseTargets.kcal)}, {formatSignedKcal(correction)} to make up for earlier days.
          </ThemedText>
        ) : null}
        <ProgressBar consumed={projection.consumed.kcal} projected={projection.projected.kcal} target={targets.kcal} color="text" softColor="line" height={14} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular} testID="kcal-projected">
          {projection.projected.kcal > projection.consumed.kcal
            ? `${formatKcal(projection.projected.kcal)} kcal with the meals still planned`
            : 'Nothing more is planned'}
          {projection.remaining.kcal < 0 ? ` · ${formatKcal(-projection.remaining.kcal)} over target` : ''}
        </ThemedText>
        <MacroBar label="Carbs" color="carb" softColor="carbSoft" consumed={projection.consumed.carbs_g} projected={projection.projected.carbs_g} target={targets.carbs_g} />
        <MacroBar label="Protein" color="protein" softColor="proteinSoft" consumed={projection.consumed.protein_g} projected={projection.projected.protein_g} target={targets.protein_g} />
        <MacroBar label="Fat" color="fat" softColor="fatSoft" consumed={projection.consumed.fat_g} projected={projection.projected.fat_g} target={targets.fat_g} />
        <ThemedText type="small" themeColor="textSecondary">
          Solid: eaten. Light: still planned. Line: target.
        </ThemedText>
      </Card>

      {projection.openBudget && firstOpen ? (
        <OpenBudgetCard slot={firstOpen} budget={projection.openBudget} onPress={() => openSlot(firstOpen)} />
      ) : null}

      {due.length >= 2 ? (
        <Button
          label={`Confirm ${due.length} ${nowTime === null ? 'unconfirmed' : 'earlier'} meals as planned`}
          busy={setStatus.isPending}
          testID="confirm-all"
          onPress={() => setStatus.mutate({ slotIds: due.map((s) => s.id), status: 'confirmed' })}
        />
      ) : null}

      <Card style={styles.slotsCard}>
        {slots.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Your schedule has no slots for this day. Add them in Schedules.
          </ThemedText>
        ) : null}
        {slots.map((slot, i) => (
          <SlotRow
            key={slot.id}
            slot={slot}
            first={i === 0}
            due={isDue(slot, nowTime)}
            onOpen={() => openSlot(slot)}
            onConfirm={() => setStatus.mutate({ slotIds: [slot.id], status: 'confirmed' })}
          />
        ))}
      </Card>
      {tomorrow?.target && tomorrow.base ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular} testID="tomorrow-preview">
          {tomorrowShift === 0
            ? `On course. ${tomorrow.label} stays at ${formatKcal(tomorrow.target.kcal)} kcal.`
            : `As things stand, ${tomorrow.label} moves from ${formatKcal(tomorrow.base.kcal)} to ${formatKcal(tomorrow.target.kcal)} kcal.`}{' '}
          It is set when that day starts.
        </ThemedText>
      ) : null}
      {setStatus.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(setStatus.error)}
        </ThemedText>
      ) : null}
    </>
  );
}

type MacroBarProps = { label: string; color: ThemeColor; softColor: ThemeColor; consumed: number; projected: number; target: number };

function MacroBar({ label, color, softColor, consumed, projected, target }: MacroBarProps) {
  return (
    <View style={styles.macro}>
      <View style={styles.macroHead}>
        <ThemedText type="smallBold" themeColor={color}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
          {Math.round(consumed)} eaten · {Math.round(projected)} planned ·{' '}
          <ThemedText type="smallBold">{Math.round(target)} g</ThemedText>
        </ThemedText>
      </View>
      <ProgressBar consumed={consumed} projected={projected} target={target} color={color} softColor={softColor} />
    </View>
  );
}

function OpenBudgetCard({ slot, budget, onPress }: { slot: LoggedSlot; budget: { kcal: number; carbs_g: number; protein_g: number; fat_g: number }; onPress: () => void }) {
  const colors = useTheme();
  const tiles = [
    { label: 'Carbs', value: budget.carbs_g, color: 'carb' as const },
    { label: 'Protein', value: budget.protein_g, color: 'protein' as const },
    { label: 'Fat', value: budget.fat_g, color: 'fat' as const },
  ];
  return (
    <View style={[styles.budget, { borderColor: colors.carb, backgroundColor: colors.backgroundElement }]} testID="open-budget">
      <View style={styles.budgetHead}>
        <View style={styles.grow}>
          <ThemedText type="eyebrow">
            Left for {slot.name.toLowerCase()} · {slot.time}
          </ThemedText>
          <ThemedText type="title" themeColor={budget.kcal < 0 ? 'over' : 'carb'} style={styles.tabular}>
            {formatKcal(budget.kcal)}
            <ThemedText themeColor="textSecondary"> kcal</ThemedText>
          </ThemedText>
        </View>
        <Button label={`Log ${slot.name.toLowerCase()}`} variant="primary" compact onPress={onPress} testID="open-budget-log" />
      </View>
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <View key={tile.label} style={[styles.tile, { backgroundColor: colors.backgroundSelected }]}>
            <ThemedText type="small" themeColor={tile.color}>
              {tile.label}
            </ThemedText>
            <ThemedText type="subtitle" themeColor={tile.value < 0 ? 'over' : 'text'} style={styles.tabular}>
              {Math.round(tile.value)} g
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

function SlotRow({ slot, first, due, onOpen, onConfirm }: { slot: LoggedSlot; first: boolean; due: boolean; onOpen: () => void; onConfirm: () => void }) {
  const colors = useTheme();
  const total = sumNutrition(slot.entries);
  const hasEntries = slot.entries.length > 0;
  const canConfirm = slot.kind === 'planned' && slot.status === 'pending' && hasEntries;

  let chip: { label: string; background: string; color: ThemeColor };
  if (slot.status === 'confirmed') chip = { label: slot.kind === 'open' ? 'Logged' : 'Confirmed', background: colors.proteinSoft, color: 'text' };
  else if (slot.status === 'adjusted') chip = { label: 'Adjusted', background: colors.fatSoft, color: 'text' };
  else if (slot.status === 'skipped') chip = { label: 'Skipped', background: colors.backgroundSelected, color: 'textSecondary' };
  else if (slot.kind === 'open') chip = { label: hasEntries ? 'Logged' : 'Open', background: colors.backgroundSelected, color: 'textSecondary' };
  else chip = { label: due ? 'Unconfirmed' : 'Planned', background: due ? colors.carbSoft : colors.backgroundSelected, color: due ? 'text' : 'textSecondary' };

  return (
    <View style={[styles.slot, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]} testID={`slot-${slot.name}`}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${slot.name}, ${chip.label}`} onPress={onOpen} style={({ pressed }) => [styles.slotMain, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={[styles.time, styles.tabular]}>
          {slot.time}
        </ThemedText>
        <View style={styles.grow}>
          <View style={styles.slotTitle}>
            <ThemedText type="smallBold" style={slot.status === 'skipped' ? styles.struck : undefined}>
              {slot.name}
            </ThemedText>
            <View style={[styles.chip, { backgroundColor: chip.background }]}>
              <ThemedText type="eyebrow" themeColor={chip.color} style={styles.chipText}>
                {chip.label}
              </ThemedText>
            </View>
          </View>
          {hasEntries ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {slot.entries.map((e) => e.name).join(' · ')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
                {formatKcal(total.kcal)} kcal · <MacroLine nutrition={total} />
              </ThemedText>
            </>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {slot.kind === 'open' ? 'Not planned. Log what you eat.' : 'Nothing planned for this slot yet.'}
            </ThemedText>
          )}
        </View>
      </Pressable>
      {canConfirm ? <Button label="Ate as planned" variant={due ? 'primary' : 'secondary'} compact onPress={onConfirm} testID={`confirm-${slot.name}`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  content: { padding: Spacing.three, paddingTop: Spacing.three + TabScreenTopInset, gap: Spacing.three, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  dayNav: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  centered: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.five },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  macro: { gap: Spacing.one },
  macroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: Spacing.two },
  budget: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  budgetHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, paddingHorizontal: 10 },
  slotsCard: { gap: 0, paddingVertical: Spacing.one },
  slot: { paddingVertical: 12, gap: Spacing.two },
  slotMain: { flexDirection: 'row', gap: Spacing.three },
  slotTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  time: { width: 48 },
  chip: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  chipText: { fontSize: 10, lineHeight: 14 },
  struck: { textDecorationLine: 'line-through' },
});
