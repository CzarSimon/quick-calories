import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootNavigator() {
  const { ready, isLoggedIn } = useAuth();

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
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
