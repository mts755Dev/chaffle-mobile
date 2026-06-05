/**
 * Tap to Pay warm-up (Apple 1.5): initialize Terminal SDK at launch and on foreground.
 * Does not discover or connect — In-Person Payment keeps its existing connect flow.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useAuthStore } from '../store/authStore';
import { terminalLog } from '../services/stripeTerminal';

export default function TapToPayWarmup() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { initialize: sdkInitialize } = useStripeTerminal();
  const warmupInFlight = useRef(false);

  const runWarmup = useCallback(async () => {
    if (Platform.OS !== 'ios' || !isAdmin) return;
    if (warmupInFlight.current) return;

    warmupInFlight.current = true;
    try {
      terminalLog.connection('Tap to Pay warm-up (SDK initialize)…');
      const { error } = await sdkInitialize();
      if (error) {
        terminalLog.error('Tap to Pay warm-up failed', error);
        return;
      }
      terminalLog.connection('Tap to Pay warm-up complete');
    } catch (err: unknown) {
      terminalLog.error('Tap to Pay warm-up error', err);
    } finally {
      warmupInFlight.current = false;
    }
  }, [isAdmin, sdkInitialize]);

  useEffect(() => {
    void runWarmup();
  }, [runWarmup]);

  useEffect(() => {
    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        void runWarmup();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [runWarmup]);

  return null;
}
