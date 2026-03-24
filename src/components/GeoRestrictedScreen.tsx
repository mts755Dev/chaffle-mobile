import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';
import { COLORS } from '../constants';

interface GeoRestrictedScreenProps {
  userState: string | null;
  requiredState: string | null;
  onGoBack?: () => void;
}

export default function GeoRestrictedScreen({
  userState,
  requiredState,
  onGoBack,
}: GeoRestrictedScreenProps) {
  return (
    <View style={styles.container}>
      <Icon source="map-marker-off" size={72} color={COLORS.error} />
      <Text style={styles.title}>Location Restricted</Text>
      <Text style={styles.message}>
        This raffle is only available in{' '}
        <Text style={styles.highlight}>{requiredState || 'the required state'}</Text>.
      </Text>
      {userState && (
        <Text style={styles.subMessage}>
          Your current location: <Text style={styles.highlight}>{userState}</Text>
        </Text>
      )}
      <Text style={styles.note}>
        Please ensure your location services are enabled and you are in the correct state.
      </Text>
      {onGoBack && (
        <Button mode="contained" onPress={onGoBack} style={styles.button}>
          Go Back
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginTop: 16,
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  subMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  highlight: {
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  note: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
  },
});
