/**
 * Shared Tap to Pay setup UI — connection status, enable action, and brief education.
 * Used on the admin settings screen (3.6, 3.9.1) without changing In-Person Payment checkout.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Text, Button, Divider, Card } from 'react-native-paper';
import { COLORS } from '../constants';
import ReaderConnectionStatus from './ReaderConnectionStatus';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import type { ReaderConnectionStatus as ConnectionStatusType } from '../types';
import { getTapToPayTermsAcceptedFromApple } from '../services/tapToPayTermsState';

interface TapToPayConnectionPanelProps {
  status: ConnectionStatusType;
  reader: Reader.Type | null;
  updateProgress: number | null;
  paymentError: string | null;
  onEnable: () => void;
  onDisconnect: () => void;
  enableLabel?: string;
}

export default function TapToPayConnectionPanel({
  status,
  reader,
  updateProgress,
  paymentError,
  onEnable,
  onDisconnect,
  enableLabel = 'Set Up Tap to Pay on iPhone',
}: TapToPayConnectionPanelProps) {
  const termsAccepted = getTapToPayTermsAcceptedFromApple();
  const isConnecting = status === 'connecting';
  const showEnable =
    status !== 'connected' && !isConnecting;

  return (
    <Card style={styles.card}>
      <Card.Content>
        <ReaderConnectionStatus
          status={status}
          reader={reader}
          onDisconnect={onDisconnect}
          updateProgress={updateProgress}
        />

        {termsAccepted === true && status !== 'connected' && (
          <Text style={styles.termsHint}>
            Apple Terms accepted on this device. Finish setup to go Ready.
          </Text>
        )}

        {showEnable && (
          <>
            <Divider style={styles.divider} />
            <Button
              mode="contained"
              icon="cellphone-nfc"
              onPress={onEnable}
              style={styles.enableBtn}
              buttonColor={COLORS.primary}
            >
              {enableLabel}
            </Button>
            <Text style={styles.enableHint}>
              Accept Apple&apos;s Tap to Pay Terms when prompted, then wait for setup to complete.
            </Text>
          </>
        )}

        {paymentError && (
          <Text style={styles.errorText}>{paymentError}</Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, backgroundColor: COLORS.surface },
  divider: { marginVertical: 12 },
  enableBtn: { borderRadius: 8 },
  enableHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  termsHint: {
    fontSize: 12,
    color: COLORS.success,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    marginTop: 8,
  },
});
