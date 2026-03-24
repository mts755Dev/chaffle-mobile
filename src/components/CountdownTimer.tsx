import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useCountdown } from '../hooks/useCountdown';
import { COLORS } from '../constants';

interface CountdownTimerProps {
  targetDate: string | null;
  onExpired?: () => void;
}

export default function CountdownTimer({ targetDate, onExpired }: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);

  React.useEffect(() => {
    if (isExpired && onExpired) {
      onExpired();
    }
  }, [isExpired]);

  if (isExpired) {
    return (
      <View style={styles.container}>
        <Text style={styles.expiredText}>Draw has ended</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Draw In</Text>
      <View style={styles.grid}>
        <View style={styles.block}>
          <Text style={styles.value}>{String(days).padStart(2, '0')}</Text>
          <Text style={styles.blockLabel}>Days</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.value}>{String(hours).padStart(2, '0')}</Text>
          <Text style={styles.blockLabel}>Hours</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.value}>{String(minutes).padStart(2, '0')}</Text>
          <Text style={styles.blockLabel}>Mins</Text>
        </View>
        <View style={styles.block}>
          <Text style={styles.value}>{String(seconds).padStart(2, '0')}</Text>
          <Text style={styles.blockLabel}>Secs</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  label: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 6,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  block: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
    width: '44%',
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  blockLabel: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expiredText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
