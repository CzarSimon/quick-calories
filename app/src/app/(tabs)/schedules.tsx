import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { ScreenMargin, Spacing, TabScreenTopInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatKcal, formatSignedKcal } from '@/lib/format';
import { errorMessage } from '@/lib/library';
import { useSchedules, type Schedule } from '@/lib/schedules';

export default function SchedulesScreen() {
  const data = useSchedules();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await data.refetch();
    setRefreshing(false);
  };

  let empty;
  if (data.isLoading) {
    empty = <ActivityIndicator style={styles.spinner} />;
  } else if (data.error) {
    empty = (
      <Card>
        <ThemedText type="small">{errorMessage(data.error)}</ThemedText>
        <Button label="Try again" onPress={refresh} />
      </Card>
    );
  } else {
    empty = (
      <Card>
        <ThemedText type="smallBold">No schedules yet</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          A schedule holds the calorie target and planned meals for each day of your training week. Create one, then make it
          active.
        </ThemedText>
      </Card>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill} edges={['top']}>
        <FlatList
          data={data.error || data.isLoading ? [] : data.schedules}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.titleRow}>
              <ThemedText type="title">Schedules</ThemedText>
              <Button label="New schedule" variant="primary" compact testID="schedule-new" onPress={() => router.push('/schedule/new')} />
            </View>
          }
          ListEmptyComponent={empty}
          renderItem={({ item }) => <ScheduleRow schedule={item} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const colors = useTheme();
  const maintenance = schedule.days.reduce((sum, day) => sum + day.kcal, 0);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/schedule/[id]', params: { id: schedule.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundElement, borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.rowMain}>
        <ThemedText type="smallBold">{schedule.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.tabular}>
          {formatKcal(maintenance)} kcal over {schedule.days.length} days
          {schedule.adjustment_kcal ? ` · ${formatSignedKcal(schedule.adjustment_kcal)}` : ''}
        </ThemedText>
        {schedule.labelRecords.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            {schedule.labelRecords.map((l) => l.name).join(' · ')}
          </ThemedText>
        ) : null}
      </View>
      {schedule.is_active ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <ThemedText type="smallBold" themeColor="onAccent">
            Active
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: ScreenMargin, paddingTop: Spacing.three + TabScreenTopInset, gap: Spacing.two, paddingBottom: 120 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  badge: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  tabular: { fontVariant: ['tabular-nums'] },
  spinner: { marginTop: Spacing.five },
});
