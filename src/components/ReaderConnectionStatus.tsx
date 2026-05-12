/**
 * ReaderConnectionStatus — Displays Tap to Pay connection status.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Chip, Icon, Button } from 'react-native-paper';
import { type Reader } from '@stripe/stripe-terminal-react-native';
import { COLORS } from '../constants';
import type { ReaderConnectionStatus as ConnectionStatusType } from '../types';

interface ReaderConnectionStatusProps {
  status: ConnectionStatusType;
  reader: Reader.Type | null;
  onDisconnect: () => void;
}

export default function ReaderConnectionStatus({
  status,
  reader,
  onDisconnect,
}: ReaderConnectionStatusProps) {
  const badgeStyle =
    status === 'connected'
      ? styles.badgeConnected
      : status === 'connecting'
        ? styles.badgeConnecting
        : styles.badgeDisconnected;

  const badgeLabel =
    status === 'connected'
      ? 'Ready'
      : status === 'connecting'
        ? 'Setting up…'
        : 'Not Connected';

  const iconName =
    status === 'connected'
      ? 'cellphone-nfc'
      : status === 'connecting'
        ? 'cellphone-arrow-down'
        : 'cellphone-off';

  const iconColor =
    status === 'connected'
      ? COLORS.success
      : status === 'connecting'
        ? COLORS.warning
        : COLORS.textLight;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon source={iconName} size={22} color={iconColor} />
          <View style={styles.headerText}>
            <Text style={styles.title}>Tap to Pay</Text>
            <Text style={styles.description}>
              {status === 'connected'
                ? `iPhone is ready to accept payments${reader?.simulated ? ' (Simulated)' : ''}`
                : status === 'connecting'
                  ? 'Setting up Tap to Pay…'
                  : 'Tap to Pay is not connected'}
            </Text>
          </View>
        </View>
        <Chip style={badgeStyle} textStyle={styles.badgeText} compact>
          {badgeLabel}
        </Chip>
      </View>

      {status === 'connected' && (
        <View style={styles.connectedInfo}>
          <View style={styles.readerDetails}>
            <Text style={styles.readyLabel}>Accepting contactless payments</Text>
          </View>
          <Button
            mode="outlined"
            icon="power-plug-off"
            onPress={onDisconnect}
            style={styles.disconnectBtn}
            compact
          >
            Disconnect
          </Button>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.foreground },
  description: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  badgeConnected: { backgroundColor: '#DCFCE7' },
  badgeConnecting: { backgroundColor: '#FEF3C7' },
  badgeDisconnected: { backgroundColor: '#F1F5F9' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  connectedInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 },
  readerDetails: { gap: 4 },
  readyLabel: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  disconnectBtn: { borderColor: COLORS.border, borderRadius: 8 },
});
