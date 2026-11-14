import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/offline-banner';
import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Notice } from '@/components/ui';
import { Spacing, TabScreenTopInset } from '@/constants/theme';
import { addDays } from '@/domain';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatNumber, formatSignedKcal } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import { pb } from '@/lib/pocketbase';
import { useBodyWeight } from '@/lib/settings';
import type { MicrocycleRecord } from '@/lib/types';
import { useWeek, type WeekDay, type WeekSummary } from '@/lib/week';

function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const SOURCE_TEXT: Record<string, string> = {
  healthkit: 'Average of the microcycle before, from Apple Health',
  previous: 'Carried over from the microcycle before (no weigh-ins found)',
  manual: 'Fallback weight from Settings',
};

export default function WeekScreen() {
  const now = useNow();
  const [offset, setOffset] = useState(0);
  const weight = useBodyWeight();
  const week = useWeek(now.date, offset, weight.bwKg);
  const [refreshing, setRefreshing] = useState(false);
  const { microcycle, summary } = week;
  const end = addDays(microcycle.startDate, microcycle.length - 1);

  const refresh = () => {
    setRefreshing(true);
    week.refetch();
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <View>
            <ThemedText type="eyebrow">
              Microcycle {shortDate(microcycle.startDate)} – {shortDate(end)}
            </ThemedText>
            <ThemedText type="title">{offset === 0 ? 'This week' : offset === -1 ? 'Last week' : `${-offset} weeks ago`}</ThemedText>
          </View>
          <OfflineBanner />
          <View style={styles.nav}>
            <Button label="‹ Earlier" compact onPress={() => setOffset(offset - 1)} testID="week-prev" />
            {offset < 0 ? <Button label={offset === -1 ? 'This week ›' : 'Later ›'} compact onPress={() => setOffset(offset + 1)} testID="week-next" /> : null}
          </View>

          {week.isLoading ? (
            <ActivityIndicator style={styles.spinner} />
          ) : week.error || !summary ? (
            <Card>
              <ThemedText type="small">{errorMessage(week.error)}</ThemedText>
              <Button label="Try again" onPress={week.refetch} />
            </Card>
          ) : (
            <>
              <BalanceCard summary={summary} isCurrent={week.isCurrent} />
              <DaysCard summary={summary} />
              <WeightCard record={week.record} bwKg={week.bwKg} isCurrent={week.isCurrent} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function BalanceCard({ summary, isCurrent }: { summary: WeekSummary; isCurrent: boolean }) {
  const anyLogged = summary.days.some((d) => d.logged);
  const { balanceKcal: balance, unrecoveredKcal: unrecovered } = summary;
  const remaining = summary.days.filter((d) => d.when === 'future').length;
  const counted = summary.days.filter((d) => d.counted).length;
  return (
    <Card>
      <View style={styles.split}>
        <View style={styles.grow}>
          <ThemedText type="eyebrow">{isCurrent ? 'Balance so far' : 'Final balance'}</ThemedText>
          <ThemedText type="title" themeColor={balance > 0 ? 'over' : balance < 0 ? 'protein' : 'text'} style={styles.tabular} testID="week-balance">
            {formatSignedKcal(balance)}
            <ThemedText themeColor="textSecondary"> kcal</ThemedText>
          </ThemedText>
        </View>
        <View style={styles.end}>
          <ThemedText type="eyebrow">Microcycle goal</ThemedText>
          <ThemedText type="smallBold" style={styles.tabular}>
            {summary.goalKcal === null ? '–' : `${formatKcal(summary.goalKcal)} kcal`}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tabular} testID="week-explain">
        {!anyLogged
          ? 'Nothing logged in this microcycle yet.'
          : balance === 0
            ? isCurrent && Math.abs(summary.todayDeltaKcal) >= 10
              ? `Earlier days are on plan. Today is heading for ${formatSignedKcal(summary.todayDeltaKcal)} kcal against its plan, which moves the remaining days.`
              : counted === 0
                ? 'No earlier day counts yet.'
                : 'Earlier days add up to the plan.'
            : isCurrent && remaining > 0
              ? `${balance > 0 ? 'Over' : 'Under'} the plan on earlier days. The remaining days are ${balance > 0 ? 'lowered' : 'raised'} to make up for it.`
              : `${balance > 0 ? 'Over' : 'Under'} the plan across the counted days.`}
        {isCurrent && unrecovered !== 0 && Math.abs(unrecovered) >= 10 ? ` ${formatSignedKcal(unrecovered)} kcal will not be recovered this microcycle.` : ''}
      </ThemedText>
      {summary.uncountedDays > 0 ? (
        <Notice tone="info">
          <ThemedText type="small">
            {summary.uncountedDays} earlier {summary.uncountedDays === 1 ? 'day is' : 'days are'} not counted: nothing was logged, or an open
            meal is still empty. Finish them from Today → Previous day to include them.
          </ThemedText>
        </Notice>
      ) : null}
    </Card>
  );
}

function DaysCard({ summary }: { summary: WeekSummary }) {
  const colors = useTheme();
  return (
    <Card style={styles.daysCard}>
      {summary.days.map((day, i) => (
        <View key={day.date} style={[styles.day, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]} testID={`week-day-${i}`}>
          <View style={styles.dayHead}>
            <ThemedText type="smallBold" themeColor={day.when === 'today' ? 'accent' : 'text'} style={styles.dayName}>
              {day.label}
            </ThemedText>
            <ThemedText type="small" style={[styles.grow, styles.tabular]}>
              {targetText(day)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
              {statusText(day)}
            </ThemedText>
          </View>
          {day.target && day.logged ? (
            <ProgressBar consumed={day.eatenKcal ?? 0} projected={day.expectedKcal ?? 0} target={day.target.kcal} color="carb" softColor="carbSoft" height={8} />
          ) : null}
          {day.target ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
              {day.target.carbs_g} g carbs · {day.target.protein_g} g protein · {day.target.fat_g} g fat
            </ThemedText>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

function targetText(day: WeekDay): string {
  if (!day.target || !day.base) return 'No plan';
  if (day.target.kcal === day.base.kcal) return `${formatKcal(day.target.kcal)} kcal`;
  return `${formatKcal(day.base.kcal)} → ${formatKcal(day.target.kcal)} kcal`;
}

function statusText(day: WeekDay): string {
  if (day.when === 'future') return 'Planned';
  if (!day.logged) return day.when === 'today' ? 'Not started' : 'Not logged';
  const eaten = `${formatKcal(day.eatenKcal ?? 0)} eaten`;
  if (day.when === 'today') return eaten;
  if (!day.complete) return `${eaten} · incomplete`;
  return day.unconfirmed > 0 ? `${formatKcal(day.expectedKcal ?? 0)} incl. ${day.unconfirmed} unconfirmed` : eaten;
}

function WeightCard({ record, bwKg, isCurrent }: { record: MicrocycleRecord | null; bwKg: number | null; isCurrent: boolean }) {
  const colors = useTheme();
  const history = useQuery({
    queryKey: ['microcycles', 'history'],
    queryFn: async () => (await pb.collection('microcycles').getList<MicrocycleRecord>(1, 8, { sort: '-start_date' })).items,
  });
  const points = (history.data ?? []).filter((m) => m.bw_kg > 0).reverse();
  const min = Math.min(...points.map((p) => p.bw_kg));
  const max = Math.max(...points.map((p) => p.bw_kg));

  return (
    <Card>
      <ThemedText type="eyebrow">Body weight used</ThemedText>
      <ThemedText type="title" style={styles.tabular} testID="week-weight">
        {bwKg ? formatNumber(bwKg) : '–'}
        <ThemedText themeColor="textSecondary"> kg</ThemedText>
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {record
          ? `${SOURCE_TEXT[record.bw_source] ?? 'Set for this microcycle'}. It stays the same for the whole microcycle.`
          : isCurrent
            ? 'Set when the first day of this microcycle is opened.'
            : 'This microcycle was never opened.'}
      </ThemedText>
      {points.length >= 2 ? (
        <>
          <View style={styles.trend}>
            {points.map((point) => (
              <View key={point.id} style={styles.trendColumn}>
                <View
                  style={[
                    styles.trendBar,
                    { backgroundColor: point.id === record?.id ? colors.protein : colors.proteinSoft, height: 12 + (max > min ? ((point.bw_kg - min) / (max - min)) * 36 : 18) },
                  ]}
                />
                <ThemedText type="small" themeColor="textSecondary" style={[styles.tabular, styles.trendLabel]}>
                  {formatNumber(point.bw_kg)}
                </ThemedText>
              </View>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Weight used in the last {points.length} microcycles, oldest first.
          </ThemedText>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  content: { padding: Spacing.three, paddingTop: Spacing.three + TabScreenTopInset, gap: Spacing.three, paddingBottom: 120 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  spinner: { marginTop: Spacing.five },
  split: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  end: { alignItems: 'flex-end' },
  daysCard: { gap: 0, paddingVertical: Spacing.one },
  day: { paddingVertical: 10, gap: 6 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  dayName: { width: 44 },
  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, marginTop: Spacing.two },
  trendColumn: { flex: 1, alignItems: 'center', gap: 4 },
  trendBar: { width: '100%', borderRadius: 4 },
  trendLabel: { fontSize: 11 },
});
