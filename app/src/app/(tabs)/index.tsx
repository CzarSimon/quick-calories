import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';

export default function TodayScreen() {
  return (
    <PlaceholderScreen
      title="Today"
      eyebrow="Microcycle day"
      milestone="Arrives in M4"
      description="Consumed and projected kcal and macros against today's target, the open budget for dinner, and the day's slots to confirm."
      headerRight={
        <Link href="/settings" asChild>
          <Pressable accessibilityRole="button" hitSlop={8}>
            <ThemedText type="smallBold" themeColor="carb">
              Settings
            </ThemedText>
          </Pressable>
        </Link>
      }
    />
  );
}
