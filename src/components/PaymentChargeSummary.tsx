import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS } from '../constants';
import { formatCurrency } from '../utils';
import {
  computeChargeBreakdown,
  type PaymentChannel,
} from '../utils/paymentFees';

interface PaymentChargeSummaryProps {
  baseAmount: number;
  includePlatformFee: boolean;
  channel?: PaymentChannel;
  compact?: boolean;
}

export default function PaymentChargeSummary({
  baseAmount,
  includePlatformFee,
  channel = 'online',
  compact = false,
}: PaymentChargeSummaryProps) {
  const breakdown = computeChargeBreakdown(baseAmount, {
    includePlatformFee,
    channel,
  });

  return (
    <View style={styles.container}>
      {!compact ? (
        <Text style={styles.title}>Payment summary</Text>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.label}>Ticket amount (to organization)</Text>
        <Text style={styles.value}>
          {formatCurrency(breakdown.baseAmountCents / 100)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Processing fee</Text>
        <Text style={styles.value}>
          {formatCurrency(breakdown.processingFeeCents / 100)}
        </Text>
      </View>
      {includePlatformFee ? (
        <View style={styles.row}>
          <Text style={styles.label}>Platform support (10%)</Text>
          <Text style={styles.value}>
            {formatCurrency(breakdown.platformFeeCents / 100)}
          </Text>
        </View>
      ) : null}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Customer pays</Text>
        <Text style={styles.totalValue}>
          {formatCurrency(breakdown.totalCents / 100)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  totalRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
