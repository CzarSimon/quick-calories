import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenMargin, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ToastInput = { message: string; actionLabel?: string; onAction?: () => void };
type ToastState = ToastInput & { id: number };

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

const VISIBLE_MS = 5000;
/** Space for the tab bar, so the toast floats just above it. */
const TAB_BAR_HEIGHT = Platform.OS === 'web' ? 0 : 56;

/**
 * One short message at a time, floating above the tab bar so it never moves the content under
 * the user's finger. It can carry one action ("Undo").
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    nextId.current += 1;
    setToast({ ...input, id: nextId.current });
    AccessibilityInfo.announceForAccessibility(input.actionLabel ? `${input.message}. ${input.actionLabel} available.` : input.message);
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.layer, { bottom: insets.bottom + TAB_BAR_HEIGHT + Spacing.three }]}>
      <View style={[styles.toast, { backgroundColor: colors.text }]} testID="toast" accessibilityLiveRegion="polite">
        <ThemedText type="small" style={[styles.message, { color: colors.background }]} numberOfLines={2}>
          {toast.message}
        </ThemedText>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            accessibilityRole="button"
            testID="toast-action"
            hitSlop={8}
            onPress={() => {
              toast.onAction?.();
              onDismiss();
            }}
            style={styles.action}>
            <ThemedText type="smallBold" style={[styles.actionLabel, { color: colors.background }]}>
              {toast.actionLabel}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Show a toast: `toast({ message, actionLabel, onAction })`. */
export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(() => show, [show]);
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: ScreenMargin, right: ScreenMargin, alignItems: 'stretch' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.medium,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    minHeight: 48,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  message: { flex: 1, paddingVertical: 12 },
  action: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.two },
  actionLabel: { textDecorationLine: 'underline' },
});
