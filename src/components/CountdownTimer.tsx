import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useCountdown } from '../hooks/useCountdown';
import { COLORS } from '../constants';

interface CountdownTimerProps {
  targetDate: string | null;
  onExpired?: () => void;
  /** Use on light backgrounds (e.g. worker dashboard cards). */
  variant?: 'dark' | 'light';
  /** Hide the built-in "Draw In" heading when the parent supplies a label. */
  showLabel?: boolean;
  /** Single-row layout that fits narrow card widths. */
  compact?: boolean;
}

export default function CountdownTimer({
  targetDate,
  onExpired,
  variant = 'dark',
  showLabel = true,
  compact = false,
}: CountdownTimerProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);
  const isLight = variant === 'light';

  React.useEffect(() => {
    if (isExpired && onExpired) {
      onExpired();
    }
  }, [isExpired, onExpired]);

  if (isExpired) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        <Text style={[styles.expiredText, isLight && styles.expiredTextLight]}>
          Draw has ended
        </Text>
      </View>
    );
  }

  const blocks = [
    { value: days, label: 'Days' },
    { value: hours, label: 'Hours' },
    { value: minutes, label: 'Mins' },
    { value: seconds, label: 'Secs' },
  ];

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {showLabel ? (
        <Text style={[styles.label, isLight && styles.labelLight]}>Draw In</Text>
      ) : null}
      <View style={[styles.grid, compact && styles.gridCompact]}>
        {blocks.map((block) => (
          <View
            key={block.label}
            style={[
              styles.block,
              compact && styles.blockCompact,
              isLight && styles.blockLight,
            ]}
          >
            <Text style={[styles.value, isLight && styles.valueLight]}>
              {Number.isFinite(block.value)
                ? String(block.value).padStart(2, '0')
                : '00'}
            </Text>
            <Text style={[styles.blockLabel, isLight && styles.blockLabelLight]}>
              {block.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
  },
  containerCompact: {
    alignItems: 'stretch',
  },
  label: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 6,
    fontWeight: '600',
  },
  labelLight: {
    color: COLORS.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  gridCompact: {
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
  },
  block: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    alignItems: 'center',
    width: '44%',
  },
  blockCompact: {
    flex: 1,
    minWidth: 0,
    width: undefined,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  blockLight: {
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  value: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  valueLight: {
    fontSize: 15,
    color: COLORS.foreground,
  },
  blockLabel: {
    fontSize: 8,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  blockLabelLight: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },
  expiredText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  expiredTextLight: {
    color: COLORS.textSecondary,
  },
});
