import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TextInput as RNTextInput, Keyboard } from 'react-native';
import { Text } from 'react-native-paper';
import TextInput from './AppTextInput';
import {
  COLORS,
  CUSTOM_TICKET_DOLLARS_MIN,
  customTicketQuantityFromDollars,
} from '../constants';
import { formatCurrency, formatNumber } from '../utils';

type Props = {
  value: string;
  error: string;
  selected: boolean;
  previewPrice?: number | null;
  previewQuantity?: number | null;
  onChangeText: (raw: string) => void;
  /** Clears preset package highlight when the user starts a custom amount. */
  onFocus?: () => void;
  /** Bumps when a preset is chosen so the field loses focus / selected look. */
  blurToken?: number;
};

/** Shared custom-amount entry: 3 tickets / $1, must be greater than $250. */
export default function CustomTicketAmountField({
  value,
  error,
  selected,
  previewPrice,
  previewQuantity,
  onChangeText,
  onFocus,
  blurToken = 0,
}: Props) {
  const inputRef = useRef<RNTextInput>(null);

  useEffect(() => {
    if (blurToken > 0) {
      Keyboard.dismiss();
      inputRef.current?.blur();
    }
  }, [blurToken]);

  return (
    <View
      key={`custom-amount-wrap-${blurToken}`}
      style={[styles.card, selected ? styles.cardSelected : null]}
    >
      <Text style={styles.title}>Or enter any amount</Text>
      <Text style={styles.hint}>3 tickets for every $1</Text>
      <TextInput
        ref={inputRef}
        mode="outlined"
        label="Amount ($)"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        keyboardType="number-pad"
        placeholder="e.g. 1250"
        style={styles.input}
        outlineColor={
          error ? COLORS.error : selected ? COLORS.primary : COLORS.border
        }
        activeOutlineColor={error ? COLORS.error : COLORS.primary}
        textColor={COLORS.foreground}
        left={<TextInput.Affix text="$" />}
        error={!!error}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {selected && previewPrice != null && previewQuantity != null ? (
        <Text style={styles.preview}>
          {formatCurrency(previewPrice)} → {formatNumber(previewQuantity)} tickets
        </Text>
      ) : null}
    </View>
  );
}

/** Digits-only parse + validation used by Buy Tickets / Tap to Pay. */
export function parseCustomTicketAmount(raw: string): {
  cleaned: string;
  dollars: number | null;
  quantity: number | null;
  error: string;
} {
  const cleaned = raw.replace(/[^0-9]/g, '');
  if (!cleaned) {
    return { cleaned: '', dollars: null, quantity: null, error: '' };
  }

  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars <= CUSTOM_TICKET_DOLLARS_MIN) {
    return {
      cleaned,
      dollars: null,
      quantity: null,
      error: `Enter more than $${CUSTOM_TICKET_DOLLARS_MIN}. For $${CUSTOM_TICKET_DOLLARS_MIN} or less, choose a package above.`,
    };
  }

  return {
    cleaned,
    dollars,
    quantity: customTicketQuantityFromDollars(dollars),
    error: '',
  };
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceMuted,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(70,151,175,0.08)',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.surface,
  },
  error: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 6,
  },
  preview: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 8,
  },
});
