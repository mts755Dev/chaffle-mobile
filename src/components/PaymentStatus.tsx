/**
 * PaymentStatus — Checkout payment UI (Apple Section 5: 5.7–5.9, 5.10).
 */

import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Share, Alert } from 'react-native';
import { Text, Icon, Button, Card } from 'react-native-paper';
import { COLORS } from '../constants';
import {
  TAP_TO_PAY_INITIALIZING_SUBTITLE,
  TAP_TO_PAY_INITIALIZING_TITLE,
  TAP_TO_PAY_PROCESSING_SUBTITLE,
  TAP_TO_PAY_PROCESSING_TITLE,
} from '../constants/tapToPayCheckout';
import {
  formatChargeCents,
} from '../utils/paymentFees';
import {
  buildPaymentReceiptText,
  outcomeTitle,
} from '../utils/terminalPaymentOutcome';
import type {
  TerminalPaymentStatus,
  TerminalPaymentResult,
  TerminalPaymentOutcome,
} from '../types';
import TapToPayIcon from './TapToPayIcon';

interface PaymentStatusProps {
  status: TerminalPaymentStatus;
  outcome: TerminalPaymentOutcome | null;
  error: string | null;
  result: TerminalPaymentResult | null;
  customerChargeCents: number;
  ticketQuantity: number;
  buyerName: string;
  buyerEmail: string;
  ticketId?: string;
  onSendEmailReceipt: () => Promise<void>;
  onCancel: () => void;
  onRetry: () => void;
  onNewSale: () => void;
}

function PaymentReceiptActions({
  onSendEmail,
  onShare,
  sending,
}: {
  onSendEmail: () => void;
  onShare: () => void;
  sending: boolean;
}) {
  return (
    <View style={styles.receiptActions}>
      <Text style={styles.receiptTitle}>Send confidential receipt</Text>
      <Button
        mode="outlined"
        icon="email-outline"
        onPress={onSendEmail}
        loading={sending}
        disabled={sending}
        style={styles.receiptBtn}
      >
        Email receipt
      </Button>
      <Button mode="text" icon="share-variant" onPress={onShare} disabled={sending}>
        Share receipt
      </Button>
    </View>
  );
}

export default function PaymentStatusOverlay({
  status,
  outcome,
  error,
  result,
  customerChargeCents,
  ticketQuantity,
  buyerName,
  buyerEmail,
  ticketId,
  onSendEmailReceipt,
  onCancel,
  onRetry,
  onNewSale,
}: PaymentStatusProps) {
  const [sendingReceipt, setSendingReceipt] = useState(false);

  if (status === 'idle') return null;

  const resolvedOutcome: TerminalPaymentOutcome =
    outcome ?? (status === 'success' ? 'approved' : 'declined');

  const customerChargeFormatted = formatChargeCents(customerChargeCents);

  const shareReceipt = async () => {
    try {
      await Share.share({
        title: 'Chaffle payment receipt',
        message: buildPaymentReceiptText({
          outcome: resolvedOutcome,
          amountFormatted:
            result?.amount != null
              ? formatChargeCents(result.amount)
              : customerChargeFormatted,
          ticketQuantity,
          buyerName,
          buyerEmail,
          ticketId,
          paymentIntentId: result?.paymentIntentId,
        }),
      });
    } catch {
      Alert.alert('Share failed', 'Could not open the share sheet.');
    }
  };

  const sendEmail = async () => {
    setSendingReceipt(true);
    try {
      await onSendEmailReceipt();
      Alert.alert('Receipt sent', `A receipt was sent to ${buyerEmail}.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not send receipt email.';
      Alert.alert('Email failed', message);
    } finally {
      setSendingReceipt(false);
    }
  };

  const showReceipt =
    status === 'success' || (status === 'error' && resolvedOutcome !== null);

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        {status === 'initializing' && (
          <>
            <ActivityIndicator size={64} color={COLORS.primary} />
            <Text style={styles.title}>{TAP_TO_PAY_INITIALIZING_TITLE}</Text>
            <Text style={styles.subtitle}>{TAP_TO_PAY_INITIALIZING_SUBTITLE}</Text>
          </>
        )}

        {status === 'creating_intent' && (
          <>
            <ActivityIndicator size={64} color={COLORS.primary} />
            <Text style={styles.title}>Preparing payment…</Text>
            <Text style={styles.subtitle}>
              {customerChargeFormatted} — {ticketQuantity} ticket
              {ticketQuantity > 1 ? 's' : ''}
            </Text>
          </>
        )}

        {status === 'waiting_for_input' && (
          <>
            <TapToPayIcon size={64} color={COLORS.primary} filled />
            <Text style={styles.title}>Tap to Pay on iPhone</Text>
            <Text style={styles.subtitle}>
              Ask the customer to hold their card or device near the top of your iPhone.
            </Text>
            <Text style={styles.amount}>
              {customerChargeFormatted} — {ticketQuantity} ticket
              {ticketQuantity > 1 ? 's' : ''}
            </Text>
            <Button mode="outlined" onPress={onCancel} style={styles.actionBtn} textColor={COLORS.error}>
              Cancel
            </Button>
          </>
        )}

        {status === 'processing' && (
          <>
            <ActivityIndicator size={64} color={COLORS.warning} />
            <Text style={styles.title}>{TAP_TO_PAY_PROCESSING_TITLE}</Text>
            <Text style={styles.subtitle}>{TAP_TO_PAY_PROCESSING_SUBTITLE}</Text>
            <Text style={styles.amount}>
              {customerChargeFormatted} — {ticketQuantity} ticket
              {ticketQuantity > 1 ? 's' : ''}
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Icon source="check-circle" size={64} color={COLORS.success} />
            <Text style={[styles.title, { color: COLORS.success }]}>
              {outcomeTitle('approved')}
            </Text>
            {result && (
              <Text style={styles.subtitle}>
                {formatChargeCents(result.amount)} charged successfully
              </Text>
            )}
            {showReceipt && (
              <PaymentReceiptActions
                onSendEmail={() => void sendEmail()}
                onShare={() => void shareReceipt()}
                sending={sendingReceipt}
              />
            )}
            <Button mode="contained" onPress={onNewSale} style={styles.primaryBtn} buttonColor={COLORS.primary} icon="plus">
              New Sale
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Icon
              source={resolvedOutcome === 'timed_out' ? 'clock-alert-outline' : 'close-circle'}
              size={64}
              color={COLORS.error}
            />
            <Text style={[styles.title, { color: COLORS.error }]}>
              {outcomeTitle(resolvedOutcome)}
            </Text>
            {error && <Text style={styles.subtitle}>{error}</Text>}
            {showReceipt && (
              <PaymentReceiptActions
                onSendEmail={() => void sendEmail()}
                onShare={() => void shareReceipt()}
                sending={sendingReceipt}
              />
            )}
            <View style={styles.errorActions}>
              <Button mode="outlined" onPress={onCancel} style={styles.actionBtn}>
                Cancel
              </Button>
              <Button mode="contained" onPress={onRetry} style={styles.primaryBtn} buttonColor={COLORS.primary} icon="refresh">
                Try Again
              </Button>
            </View>
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  content: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.foreground, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: 8 },
  amount: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  actionBtn: { borderColor: COLORS.border, borderRadius: 8, marginTop: 4 },
  primaryBtn: { borderRadius: 8 },
  errorActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  receiptActions: { width: '100%', gap: 8, marginTop: 4 },
  receiptTitle: { fontSize: 13, fontWeight: '600', color: COLORS.foreground, textAlign: 'center' },
  receiptBtn: { borderRadius: 8 },
});
