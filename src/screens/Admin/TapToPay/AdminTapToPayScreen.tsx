/**
 * Tap to Pay on iPhone — setup outside checkout (3.5, 3.6, 3.9.1).
 * Does not replace In-Person Payment; merchants configure here then sell on a raffle.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Text, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../../constants';
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
import { markTapToPayEnablePromptSeen } from '../../../services/tapToPayPrefs';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminTapToPayScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { isAdmin, canManageTapToPay } = useAuthStore();
  const hasAutoConnectedRef = useRef(false);
  const [educationStatus, setEducationStatus] = useState<string | null>(null);

  const allowed = canAcceptTapToPayTerms(isAdmin, canManageTapToPay);

  const {
    connectedReader,
    connectionStatus,
    autoConnect,
    disconnectReader,
    paymentError,
    readerUpdateProgress,
  } = useStripeReader();

  useEffect(() => {
    if (!allowed) {
      showTapToPayAdminRequiredAlert();
      navigation.goBack();
    }
  }, [allowed, navigation]);

  useEffect(() => {
    if (!allowed || Platform.OS !== 'ios') return;
    if (hasAutoConnectedRef.current) return;
    hasAutoConnectedRef.current = true;
    void autoConnect();
  }, [allowed, autoConnect]);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      void markTapToPayEnablePromptSeen();
    }
  }, [connectionStatus]);

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
    void autoConnect();
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Tap to Pay on iPhone</Text>
      <Text style={styles.subheading}>
        Set up and manage contactless payments for in-person ticket sales. This is separate from your checkout
        flow — use In-Person Payment on a raffle when you&apos;re ready to charge a customer.
      </Text>

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

      <Card style={styles.noteCard}>
        <Card.Content>
          <Text style={styles.noteTitle}>Administrator only</Text>
          <Text style={styles.noteText}>
            Tap to Pay Terms & Conditions must be accepted by an authorized administrator on this iPhone.
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
  noteCard: { backgroundColor: COLORS.surface },
  noteTitle: { fontSize: 14, fontWeight: '600', color: COLORS.foreground, marginBottom: 4 },
  noteText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
});
