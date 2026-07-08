import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { COLORS } from '../constants';
import {
  computeChargeBreakdown,
  type PaymentChannel,
} from '../utils/paymentFees';

/** Payment breakdowns must show exact cents (unlike whole-dollar ticket prices). */
function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

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
        <Text style={styles.label}>Ticket amount</Text>
        <Text style={styles.value} numberOfLines={1}>
          {formatCents(breakdown.baseAmountCents)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Processing fee</Text>
        <Text style={styles.value} numberOfLines={1}>
          {formatCents(breakdown.processingFeeCents)}
        </Text>
      </View>
      {includePlatformFee ? (
        <View style={styles.row}>
          <Text style={styles.label}>Platform support</Text>
          <Text style={styles.value} numberOfLines={1}>
            {formatCents(breakdown.platformFeeCents)}
          </Text>
        </View>
      ) : null}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Customer pays</Text>
        <Text style={styles.totalValue} numberOfLines={1}>
          {formatCents(breakdown.totalCents)}
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
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.foreground,
    flexShrink: 0,
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
    flexShrink: 0,
  },
});
