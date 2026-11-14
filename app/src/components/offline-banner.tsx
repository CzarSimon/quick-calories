import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOnline } from '@/lib/connectivity';
import { useOutbox, useRejectedCount } from '@/lib/outbox';

/** Says when the app is working from saved data, and how many changes are waiting to be sent. */
export function OfflineBanner() {
  const colors = useTheme();
  const online = useOnline();
  const waiting = useOutbox().length;
  const rejected = useRejectedCount();

  const lines: string[] = [];
  if (!online) {
    lines.push(
      waiting > 0
        ? `Offline. Showing saved data; ${waiting} ${waiting === 1 ? 'change is' : 'changes are'} saved on this phone and will be sent when you are back online.`
        : 'Offline. Showing saved data. Confirming and logging meals still works.',
    );
  } else if (waiting > 0) {
    lines.push(`Sending ${waiting} saved ${waiting === 1 ? 'change' : 'changes'}…`);
  }
  if (rejected > 0) {
    lines.push(`${rejected} ${rejected === 1 ? 'change' : 'changes'} could not be saved because the meal had changed on the server. Check today’s meals.`);
  }
  if (lines.length === 0) return null;

  return (
    <View style={[styles.banner, { backgroundColor: online && rejected === 0 ? colors.backgroundSelected : colors.warningSoft }]} testID="offline-banner">
      {lines.map((line) => (
        <ThemedText key={line} type="small">
          {line}
        </ThemedText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.medium, padding: 12, gap: 4 },
});
