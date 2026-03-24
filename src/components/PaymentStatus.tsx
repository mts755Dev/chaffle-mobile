/**
 * PaymentStatus — Overlay showing the current state of a Terminal payment.
 *
 * States: creating_intent → waiting_for_input → processing → success / error
 */

import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Icon, Button, Card } from 'react-native-paper';
import { COLORS } from '../constants';
import { formatCurrency } from '../utils';
import type { TerminalPaymentStatus, TerminalPaymentResult } from '../types';

interface PaymentStatusProps {
  status: TerminalPaymentStatus;
  error: string | null;
  result: TerminalPaymentResult | null;
  amountInDollars: number;
  ticketQuantity: number;
  onCancel: () => void;
  onRetry: () => void;
  onNewSale: () => void;
}

export default function PaymentStatusOverlay({
  status,
  error,
  result,
  amountInDollars,
  ticketQuantity,
  onCancel,
  onRetry,
  onNewSale,
}: PaymentStatusProps) {
  if (status === 'idle') return null;

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.content}>
        {status === 'creating_intent' && (
          <>
            <ActivityIndicator size={64} color={COLORS.primary} />
            <Text style={styles.title}>Creating Payment…</Text>
            <Text style={styles.subtitle}>
              Preparing {formatCurrency(amountInDollars)} charge
            </Text>
          </>
        )}

        {status === 'waiting_for_input' && (
          <>
            <Icon source="credit-card-wireless" size={64} color="#3B82F6" />
            <Text style={styles.title}>Tap, Insert, or Swipe Card</Text>
            <Text style={styles.subtitle}>
              Present the card on the reader…
            </Text>
            <Text style={styles.amount}>
              {formatCurrency(amountInDollars)} — {ticketQuantity} ticket
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
            <Text style={styles.title}>Processing Payment…</Text>
            <Text style={styles.subtitle}>Do not remove the card</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Icon source="check-circle" size={64} color={COLORS.success} />
            <Text style={[styles.title, { color: COLORS.success }]}>Payment Successful!</Text>
            {result && (
              <Text style={styles.subtitle}>
                {formatCurrency(result.amount / 100)} charged via Stripe Terminal
              </Text>
            )}
            <Button mode="contained" onPress={onNewSale} style={styles.primaryBtn} buttonColor={COLORS.primary} icon="plus">
              New Sale
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Icon source="close-circle" size={64} color={COLORS.error} />
            <Text style={[styles.title, { color: COLORS.error }]}>Payment Failed</Text>
            {error && <Text style={styles.subtitle}>{error}</Text>}
            <View style={styles.errorActions}>
              <Button mode="outlined" onPress={onCancel} style={styles.actionBtn}>Cancel</Button>
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
  card: { backgroundColor: COLORS.surface, borderRadius: 12, marginBottom: 16, elevation: 2, borderWidth: 1.5, borderColor: COLORS.border },
  content: { alignItems: 'center', paddingVertical: 32, gap: 16 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.foreground, textAlign: 'center' },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  amount: { fontSize: 16, fontWeight: 'bold', color: COLORS.primary },
  actionBtn: { borderColor: COLORS.border, borderRadius: 8, marginTop: 4 },
  primaryBtn: { borderRadius: 8 },
  errorActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
