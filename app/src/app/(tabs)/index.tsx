import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NeedsWeight } from '@/components/needs-weight';
import { OfflineBanner } from '@/components/offline-banner';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AvailableSummary } from '@/components/today/available-summary';
import { NextMealCard } from '@/components/today/next-meal-card';
import { SlotRow } from '@/components/today/slot-row';
import { useToast } from '@/components/toast';
import { Button, Card, Divider, SectionHeader } from '@/components/ui';
import { ScreenMargin, Spacing, TabScreenTopInset } from '@/constants/theme';
import { addDays, sumNutrition } from '@/domain';
import { useNow } from '@/hooks/use-now';
import { isUnplanned, nextUp, type LoggedSlot } from '@/lib/daylog-model';
import { useDay, useSetSlotStatus, type DayView } from '@/lib/daylog';
import { formatKcal } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import { useSchedules } from '@/lib/schedules';
import { useWeek } from '@/lib/week';

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
  const { schedules } = useSchedules();
  const [refreshing, setRefreshing] = useState(false);

  const title = daysBack === 0 ? 'Today' : daysBack === 1 ? 'Yesterday' : formatDate(date).split(' ')[0];
  // The schedule the day was built from; before the day exists, the one it will be built from.
  const scheduleName = schedules.find((s) => (day.dayLog ? s.id === day.dayLog.schedule : s.is_active))?.name;

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
              <ThemedText type="eyebrow" numberOfLines={1}>
                {formatDate(date)}
                {scheduleName ? ` · ${scheduleName}` : ''}
              </ThemedText>
              <ThemedText type="title" accessibilityRole="header">
                {title}
              </ThemedText>
            </View>
            <Button label="Settings" variant="text" onPress={() => router.push('/settings')} testID="open-settings" />
          </View>

          <View style={styles.dayNav}>
            <DayNavButton label="‹" accessibilityLabel="Previous day" onPress={() => setDaysBack(daysBack + 1)} testID="day-prev" style={styles.navFirst} />
            {daysBack > 0 ? (
              <View style={styles.dayNavRight}>
                <Button label="Today" variant="text" onPress={() => setDaysBack(0)} testID="day-today" />
                <DayNavButton label="›" accessibilityLabel={daysBack === 1 ? 'Today' : 'Next day'} onPress={() => setDaysBack(daysBack - 1)} testID="day-next" />
              </View>
            ) : null}
          </View>

          <OfflineBanner />

          <DayBody day={day} nowTime={daysBack === 0 ? now.time : null} today={now.date} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function DayNavButton({ label, accessibilityLabel, onPress, testID, style }: { label: string; accessibilityLabel: string; onPress: () => void; testID: string; style?: object }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.navButton, style, { opacity: pressed ? 0.5 : 1 }]}>
      <ThemedText type="subtitle" themeColor="accent">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function StateCard({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Card tone="selected">
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {body}
      </ThemedText>
      {action ? <Button label={action.label} variant="primary" onPress={action.onPress} /> : null}
    </Card>
  );
}

function DayBody({ day, nowTime, today }: { day: DayView; nowTime: string | null; today: string }) {
  const setStatus = useSetSlotStatus(day.date);
  const toast = useToast();
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
  if (day.state === 'error') return <StateCard title="Can't load this day" body={errorMessage(day.error)} action={{ label: 'Try again', onPress: day.retry }} />;
  if (day.state === 'needs-weight') return <NeedsWeight />;
  if (day.state === 'no-schedule') {
    return (
      <StateCard
        title="No active schedule"
        body="Today is built from your active schedule. Open a schedule and make it active."
        action={{ label: 'Open Schedules', onPress: () => router.push('/schedules') }}
      />
    );
  }
  if (day.state === 'no-plan-day') {
    return <StateCard title="Your schedule has no plan for this day" body="The active schedule has fewer days than your microcycle. Add the day in Schedules." />;
  }
  if (day.state === 'no-log' || !day.targets || !day.projection || !day.dayLog) {
    return <StateCard title="Nothing was logged this day" body="A day is set up from your schedule the first time you open the app on it." />;
  }

  const { targets, projection, slots, dayLog } = day;
  const tomorrow = day.isToday ? week.summary?.days.find((d) => d.when === 'future') : undefined;
  const tomorrowShift = tomorrow?.target && tomorrow.base ? tomorrow.target.kcal - tomorrow.base.kcal : 0;
  const planSlots = slots.filter((s) => !isUnplanned(s));
  const handled = planSlots.filter((s) => s.status !== 'pending' || (s.kind === 'open' && s.entries.length > 0)).length;

  const openSlot = (slot: LoggedSlot) => router.push({ pathname: '/log-slot/[id]', params: { id: slot.id, date: day.date } });
  const logFood = () => router.push({ pathname: '/log-slot/[id]', params: { id: 'new', date: day.date, dayLog: dayLog.id } });

  const confirm = (confirmed: LoggedSlot[]) => {
    const slotIds = confirmed.map((s) => s.id);
    const kcal = sumNutrition(confirmed.flatMap((s) => s.entries)).kcal;
    setStatus.mutate(
      { slotIds, status: 'confirmed' },
      {
        onSuccess: () =>
          toast({
            message: `${confirmed.length === 1 ? confirmed[0].name : `${confirmed.length} meals`} logged · ${formatKcal(kcal)} kcal`,
            actionLabel: 'Undo',
            onAction: () => setStatus.mutate({ slotIds, status: 'pending' }),
          }),
      },
    );
  };

  return (
    <>
      <NextMealCard next={nextUp(slots, nowTime)} isToday={day.isToday} busy={setStatus.isPending} onConfirm={confirm} onOpen={openSlot} />

      {setStatus.error ? (
        <ThemedText type="small" themeColor="over">
          {errorMessage(setStatus.error)}
        </ThemedText>
      ) : null}

      <Divider />
      <AvailableSummary projection={projection} targets={targets} baseTargets={day.baseTargets} isToday={day.isToday} onLogFood={logFood} />
      <Divider />

      <View>
        <SectionHeader title={day.isToday ? 'Your day' : 'That day'} right={planSlots.length ? `${handled} of ${planSlots.length} logged` : undefined} />
        {slots.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Your schedule has no meals for this day. Add them in Schedules.
          </ThemedText>
        ) : null}
        {slots.map((slot, i) => (
          <SlotRow key={slot.id} slot={slot} now={nowTime} first={i === 0} onOpen={() => openSlot(slot)} />
        ))}
      </View>

      {tomorrow?.target && tomorrow.base ? (
        <ThemedText type="caption" themeColor="textSecondary" tabular testID="tomorrow-preview">
          {tomorrowShift === 0
            ? `On course. ${tomorrow.label} stays at ${formatKcal(tomorrow.target.kcal)} kcal.`
            : `${tomorrow.label} moves from ${formatKcal(tomorrow.base.kcal)} to ${formatKcal(tomorrow.target.kcal)} kcal as things stand.`}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: ScreenMargin, paddingTop: Spacing.three + TabScreenTopInset, gap: Spacing.four, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  dayNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: -Spacing.three, marginBottom: -Spacing.three },
  dayNavRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  navButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  navFirst: { marginLeft: -12 },
  centered: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.five },
});
