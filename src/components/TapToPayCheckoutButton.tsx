/**
 * Prominent Tap to Pay on iPhone checkout button (5.1, 5.2).
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { tapToPayCheckoutButtonLabel } from '../constants/tapToPayCheckout';
import TapToPayIcon from './TapToPayIcon';

interface TapToPayCheckoutButtonProps {
  amountFormatted: string;
  onPress: () => void;
  loading?: boolean;
}

export default function TapToPayCheckoutButton({
  amountFormatted,
  onPress,
  loading = false,
}: TapToPayCheckoutButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Button
        mode="contained"
        icon={({ size, color }) => (
          <TapToPayIcon size={size} color={color} filled />
        )}
        onPress={onPress}
        loading={loading}
        style={styles.button}
        contentStyle={styles.buttonContent}
        labelStyle={styles.buttonLabel}
        buttonColor={COLORS.primary}
      >
        {tapToPayCheckoutButtonLabel(amountFormatted)}
      </Button>
      <Text style={styles.hint}>Hold the customer&apos;s card or device near the top of your iPhone</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  button: { borderRadius: 10 },
  buttonContent: { paddingVertical: 10 },
  buttonLabel: { fontSize: 15, fontWeight: '700' },
  hint: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 15,
  },
});
