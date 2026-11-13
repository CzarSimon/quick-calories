import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';

/** Shown where macros can't be worked out because no body weight is known yet. */
export function NeedsWeight() {
  return (
    <Card>
      <ThemedText type="smallBold">Add your body weight first</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Protein, fat and carbs are worked out per kg of body weight. Enter a fallback weight in Settings to see them here.
      </ThemedText>
      <Button label="Open Settings" onPress={() => router.push('/settings')} />
    </Card>
  );
}
