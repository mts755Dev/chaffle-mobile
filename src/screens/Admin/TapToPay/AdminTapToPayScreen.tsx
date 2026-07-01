/**
 * Tap to Pay on iPhone — setup outside checkout (3.5, 3.6, 3.9.1).
 * Does not replace In-Person Payment; merchants configure here then sell on a raffle.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, Alert } from 'react-native';
import { Text, Card, Button } from 'react-native-paper';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, STRIPE_TERMINAL_SIMULATED } from '../../../constants';
import { RootStackParamList } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useStripeReader } from '../../../hooks/useStripeReader';
import TapToPayConnectionPanel from '../../../components/TapToPayConnectionPanel';
import TapToPayMerchantEducationCard from '../../../components/TapToPayMerchantEducationCard';
import { presentAppleTapToPayEducation } from '../../../services/tapToPayEducation';
import {
  canAcceptTapToPayTerms,
  showTapToPayAdminRequiredAlert,
} from '../../../utils/tapToPayAccess';
import { getTapToPayTermsAcceptedFromApple } from '../../../services/tapToPayTermsState';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AdminTapToPayRoute = RouteProp<RootStackParamList, 'AdminTapToPay'>;

export default function AdminTapToPayScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AdminTapToPayRoute>();
  const { isAdmin, canManageTapToPay } = useAuthStore();
  const [educationStatus, setEducationStatus] = useState<string | null>(null);
  const [setupStarted, setSetupStarted] = useState(false);

  const allowed = canAcceptTapToPayTerms(isAdmin, canManageTapToPay);

  const {
    connectedReader,
    connectionStatus,
    beginTapToPaySetup,
    resetTapToPayDeviceState,
    disconnectReader,
    paymentError,
    readerUpdateProgress,
  } = useStripeReader();

  const runSetup = useCallback(async () => {
    setSetupStarted(true);
    await beginTapToPaySetup();
  }, [beginTapToPaySetup]);

  const handleResetOnboarding = useCallback(async () => {
    await resetTapToPayDeviceState();
    setSetupStarted(false);
    Alert.alert(
      'Onboarding Reset',
      'Tap to Pay keychain and setup flags cleared. The Get Started screen should appear now.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }, [navigation, resetTapToPayDeviceState]);

  useEffect(() => {
    if (!allowed) {
      showTapToPayAdminRequiredAlert();
      navigation.goBack();
    }
  }, [allowed, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!allowed || Platform.OS !== 'ios') return;

      if (route.params?.startSetup) {
        navigation.setParams({ startSetup: undefined });
        const timer = setTimeout(() => {
          void runSetup();
        }, 450);
        return () => clearTimeout(timer);
      }

      return undefined;
    }, [allowed, route.params?.startSetup, navigation, runSetup]),
  );

  const runAppleEducation = useCallback(async () => {
    const result = await presentAppleTapToPayEducation();
    if (result.source === 'apple-proximity-reader-discovery') {
      setEducationStatus('Apple merchant education completed.');
    } else {
      setEducationStatus(
        'Apple tutorial unavailable on this device. Open Merchant Guide below for full instructions.',
      );
    }
  }, []);

  const handlePresentAppleEducation = () => {
    void runAppleEducation();
  };

  if (!allowed) {
    return null;
  }

  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.centered}>
        <Text style={styles.unavailable}>
          Tap to Pay on iPhone is only available on compatible iPhones.
        </Text>
      </View>
    );
  }

  const handleEnable = () => {
    if (!canAcceptTapToPayTerms(isAdmin, canManageTapToPay)) {
      showTapToPayAdminRequiredAlert();
      return;
    }
    void runSetup();
  };

  const termsAccepted = getTapToPayTermsAcceptedFromApple();
  const awaitingAppleTerms =
    setupStarted &&
    connectionStatus === 'connecting' &&
    termsAccepted !== true;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Tap to Pay on iPhone</Text>
      <Text style={styles.subheading}>
        Set up and manage contactless payments for in-person ticket sales. This is separate from your checkout
        flow — use Tap to Pay on iPhone on a raffle when you&apos;re ready to charge a customer.
      </Text>

      {STRIPE_TERMINAL_SIMULATED && (
        <Card style={styles.warnCard}>
          <Card.Content>
            <Text style={styles.warnText}>
              Simulated reader mode is on — Apple&apos;s Terms &amp; Conditions sheet will not appear. Use a
              development build with real Tap to Pay on a physical iPhone.
            </Text>
          </Card.Content>
        </Card>
      )}

      {awaitingAppleTerms && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.infoText}>
              Apple&apos;s Tap to Pay on iPhone Terms &amp; Conditions should appear automatically during
              setup. Please wait while your iPhone connects.
            </Text>
          </Card.Content>
        </Card>
      )}

      <TapToPayConnectionPanel
        status={connectionStatus}
        reader={connectedReader}
        updateProgress={readerUpdateProgress}
        paymentError={paymentError}
        onEnable={handleEnable}
        onDisconnect={disconnectReader}
      />

      <TapToPayMerchantEducationCard
        onPresentAppleEducation={handlePresentAppleEducation}
        educationStatus={educationStatus}
      />

      <Card style={styles.resetCard}>
        <Card.Content>
          <Text style={styles.resetTitle}>Reset Onboarding</Text>
          <Text style={styles.resetText}>
            Clears Stripe Terminal keychain credentials, onboarding flags, and cached reader state
            so you can re-test the full flow from scratch.
          </Text>
          <Button
            mode="outlined"
            onPress={handleResetOnboarding}
            style={styles.resetButton}
            labelStyle={styles.resetButtonLabel}
            icon="refresh"
          >
            Reset Tap to Pay Setup
          </Button>
        </Card.Content>
      </Card>

      <Card style={styles.noteCard}>
        <Card.Content>
          <Text style={styles.noteTitle}>Administrator only</Text>
          <Text style={styles.noteText}>
            Tap to Pay on iPhone Terms &amp; Conditions must be accepted by an authorized administrator on this
            iPhone. The Apple system sheet appears during setup — not on the intro screen.
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  unavailable: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center' },
  heading: { fontSize: 22, fontWeight: 'bold', color: COLORS.foreground, marginBottom: 8 },
  subheading: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 16 },
  warnCard: { marginBottom: 12, backgroundColor: '#FFF8E1' },
  warnText: { fontSize: 13, color: '#92400E', lineHeight: 18 },
  infoCard: { marginBottom: 12, backgroundColor: '#EFF6FF' },
  infoText: { fontSize: 13, color: '#1D4ED8', lineHeight: 18 },
  resetCard: { marginBottom: 12, backgroundColor: COLORS.surface },
  resetTitle: { fontSize: 14, fontWeight: '600', color: COLORS.foreground, marginBottom: 4 },
  resetText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },
  resetButton: { borderColor: COLORS.textSecondary },
  resetButtonLabel: { fontSize: 13, color: COLORS.textSecondary },
  noteCard: { backgroundColor: COLORS.surface },
  noteTitle: { fontSize: 14, fontWeight: '600', color: COLORS.foreground, marginBottom: 4 },
  noteText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
});
