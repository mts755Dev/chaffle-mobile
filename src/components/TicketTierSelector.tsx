import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { TICKET_TIERS, COLORS } from '../constants';
import { formatCurrency } from '../utils';

interface TicketTierSelectorProps {
  selectedPrice: number | null;
  onSelect: (price: number, quantity: number) => void;
}

// Matches the web's TicketPriceCard: bg-primary text-white rounded-md
export default function TicketTierSelector({ selectedPrice, onSelect }: TicketTierSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Tickets</Text>
      <View style={styles.grid}>
        {TICKET_TIERS.map((tier) => {
          const isSelected = selectedPrice === tier.price;
          return (
            <TouchableOpacity
              key={tier.price}
              style={[styles.tier, isSelected && styles.tierSelected]}
              onPress={() => onSelect(tier.price, tier.quantity)}
              activeOpacity={0.7}
            >
              <Text style={styles.quantityText}>
                Ticket(s): {tier.quantity}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.priceText}>
                {formatCurrency(tier.price)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Matches web: bg-primary text-white rounded-md, with border-black border-2 when selected
  tier: {
    width: '31%',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tierSelected: {
    borderColor: COLORS.black,
  },
  quantityText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    fontFamily: 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: '100%',
    marginVertical: 6,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
});
