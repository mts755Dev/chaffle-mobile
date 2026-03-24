import React, { useEffect, useState, useCallback, Component, ErrorInfo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/components/SplashScreen';
import { theme } from './src/constants/theme';
import { STRIPE_PUBLISHABLE_KEY } from './src/constants';
import { useAuthStore } from './src/store/authStore';

try {
  ExpoSplashScreen.preventAutoHideAsync();
} catch {
  // Safe to ignore — splash screen will auto-hide
}

// ── Error Boundary — catches JS crashes and shows them on screen ──
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#FEF2F2' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#DC2626', marginBottom: 12 }}>
            App Crashed
          </Text>
          <Text style={{ fontSize: 14, color: '#B91C1C', marginBottom: 8 }}>
            {this.state.error?.message}
          </Text>
          <ScrollView style={{ maxHeight: 300 }}>
            <Text style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>
              {this.state.error?.stack}
            </Text>
            <Text style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace', marginTop: 8 }}>
              {this.state.errorInfo?.componentStack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { initialize } = useAuthStore();
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        await initialize();
      } catch {
        // Auth init failed — continue without session
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutReady = useCallback(async () => {
    if (appReady) {
      try {
        await ExpoSplashScreen.hideAsync();
      } catch {
        // Safe to ignore
      }
    }
  }, [appReady]);

  if (!appReady) return null;

  return (
    <View style={styles.container} onLayout={onLayoutReady}>
      <StatusBar style={splashDone ? 'dark' : 'light'} />
      <AppNavigator />
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
    </View>
  );
}

export default function App() {
  const hasValidStripeKey = STRIPE_PUBLISHABLE_KEY.startsWith('pk_');

  const content = (
    <PaperProvider theme={theme}>
      <AppContent />
    </PaperProvider>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <ErrorBoundary>
        <SafeAreaProvider>
          {hasValidStripeKey ? (
            <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
              {content}
            </StripeProvider>
          ) : (
            content
          )}
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
