/**
 * ReaderScanner — Bluetooth reader discovery button component.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Icon } from 'react-native-paper';
import { COLORS } from '../constants';

interface ReaderScannerProps {
  isDiscovering: boolean;
  onDiscover: () => void;
  onCancel: () => void;
  disabled?: boolean;
}

export default function ReaderScanner({
  isDiscovering,
  onDiscover,
  onCancel,
  disabled = false,
}: ReaderScannerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.infoRow}>
        <Icon source="bluetooth" size={20} color={COLORS.primary} />
        <Text style={styles.infoText}>
          {isDiscovering
            ? 'Scanning for nearby Stripe readers…'
            : 'Tap "Find Readers" to scan for nearby M2 readers via Bluetooth'}
        </Text>
      </View>

      {isDiscovering ? (
        <Button
          mode="outlined"
          icon="stop-circle"
          onPress={onCancel}
          style={styles.button}
          textColor={COLORS.error}
        >
          Stop Scanning
        </Button>
      ) : (
        <Button
          mode="outlined"
          icon="refresh"
          onPress={onDiscover}
          disabled={disabled}
          style={styles.button}
          loading={isDiscovering}
        >
          Find Readers
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  button: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
});
