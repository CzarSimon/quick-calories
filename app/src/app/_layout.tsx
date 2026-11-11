import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { useReminders } from '@/hooks/use-reminders';
import { useOfflineSync } from '@/hooks/use-offline-sync';
import { CACHE_MAX_AGE_MS, CACHE_VERSION, cachePersister, queryClient, shouldSaveQuery } from '@/lib/query-client';
import { initReminders } from '@/lib/reminders';

SplashScreen.preventAutoHideAsync();

// As early as possible, so a tap on a notification that starts the app is not missed.
initReminders();


function RootNavigator() {
  const { ready, isLoggedIn } = useAuth();
  useReminders(ready ? isLoggedIn : null);
  useOfflineSync(ready ? isLoggedIn : null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isLoggedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="food/[id]" options={{ headerShown: true, headerBackTitle: 'Library' }} />
        <Stack.Screen name="meal/[id]" options={{ headerShown: true, headerBackTitle: 'Library' }} />
        <Stack.Screen name="schedule/[id]" options={{ headerShown: true, headerBackTitle: 'Schedules' }} />
        <Stack.Screen name="day-plan/[id]" options={{ headerShown: true, headerBackTitle: 'Schedule' }} />
        <Stack.Screen name="plan-slot/[id]" options={{ headerShown: true, headerBackTitle: 'Day' }} />
        <Stack.Screen name="log-slot/[id]" options={{ headerShown: true, headerBackTitle: 'Today' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isLoggedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{
          persister: cachePersister,
          maxAge: CACHE_MAX_AGE_MS,
          buster: CACHE_VERSION,
          dehydrateOptions: { shouldDehydrateQuery: shouldSaveQuery },
        }}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
