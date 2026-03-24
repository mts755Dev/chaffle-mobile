/**
 * ReaderList — Displays discovered Stripe Terminal readers.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Icon, Button } from 'react-native-paper';
import { type Reader } from '@stripe/stripe-terminal-react-native';
import { COLORS } from '../constants';

interface ReaderListProps {
  readers: Reader.Type[];
  selectedReader: Reader.Type | null;
  onSelectReader: (reader: Reader.Type) => void;
  onConnect: () => void;
  isConnecting: boolean;
}

export default function ReaderList({
  readers,
  selectedReader,
  onSelectReader,
  onConnect,
  isConnecting,
}: ReaderListProps) {
  if (readers.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Available Readers</Text>

      {readers.map((reader) => {
        const isSelected = selectedReader?.serialNumber === reader.serialNumber;
        const batteryPercent =
          reader.batteryLevel != null
            ? `${Math.round(reader.batteryLevel * 100)}%`
            : null;

        return (
          <TouchableOpacity
            key={reader.serialNumber}
            style={[styles.readerRow, isSelected && styles.readerRowSelected]}
            onPress={() => onSelectReader(reader)}
            activeOpacity={0.7}
          >
            <View style={styles.radioOuter}>
              {isSelected && <View style={styles.radioInner} />}
            </View>

            <View style={styles.readerInfo}>
              <Text style={styles.readerLabel}>
                {reader.label || reader.deviceType || 'Stripe Reader'}
              </Text>
              <Text style={styles.readerSerial}>S/N: {reader.serialNumber}</Text>
              <View style={styles.readerMeta}>
                {batteryPercent && (
                  <View style={styles.metaItem}>
                    <Icon
                      source={reader.isCharging != null && reader.isCharging ? 'battery-charging' : 'battery'}
                      size={14}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.metaText}>{batteryPercent}</Text>
                  </View>
                )}
                <View style={styles.metaItem}>
                  <Icon source="bluetooth" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{reader.status || 'online'}</Text>
                </View>
                {reader.simulated && (
                  <View style={styles.simBadge}>
                    <Text style={styles.simBadgeText}>SIMULATED</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}

      <Button
        mode="contained"
        icon={isConnecting ? 'loading' : 'bluetooth-connect'}
        onPress={onConnect}
        disabled={!selectedReader || isConnecting}
        loading={isConnecting}
        style={styles.connectButton}
        buttonColor={COLORS.primary}
      >
        {isConnecting ? 'Connecting…' : 'Connect Reader'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, gap: 8 },
  heading: { fontSize: 14, fontWeight: '700', color: COLORS.foreground, marginBottom: 4 },
  readerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  readerRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(70,151,175,0.06)',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  readerInfo: { flex: 1 },
  readerLabel: { fontSize: 14, fontWeight: '600', color: COLORS.foreground },
  readerSerial: { fontSize: 11, color: COLORS.textSecondary, fontFamily: 'monospace', marginTop: 2 },
  readerMeta: { flexDirection: 'row', gap: 12, marginTop: 4, alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: COLORS.textSecondary },
  simBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  simBadgeText: { fontSize: 9, fontWeight: '700', color: '#92400E' },
  connectButton: { borderRadius: 8, marginTop: 4 },
});
