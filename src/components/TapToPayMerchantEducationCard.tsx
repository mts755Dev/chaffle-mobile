/**
 * Merchant education entry points (4.2) on Tap to Pay settings.
 * Apple ProximityReaderDiscovery is the primary, marketing-compliant path.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { Text, Button, Card, Divider } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../constants';
import { RootStackParamList } from '../types';
import { supportsAppleProximityReaderDiscovery } from '../services/tapToPayEducation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface TapToPayMerchantEducationCardProps {
  onPresentAppleEducation: () => void;
  educationStatus?: string | null;
}

export default function TapToPayMerchantEducationCard({
  onPresentAppleEducation,
  educationStatus,
}: TapToPayMerchantEducationCardProps) {
  const navigation = useNavigation<Nav>();
  const appleAvailable = supportsAppleProximityReaderDiscovery();

  return (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.title}>Merchant education</Text>
        <Text style={styles.desc}>
          Apple&apos;s official tutorial shows how to accept contactless cards, Apple Pay, and
          digital wallets. It appears automatically after you accept Terms &amp; Conditions and
          complete setup.
        </Text>

        <Button
          mode="contained"
          icon="book-open-variant"
          onPress={onPresentAppleEducation}
          disabled={!appleAvailable}
          style={styles.btn}
          buttonColor={COLORS.primary}
        >
          View Apple Tap to Pay on iPhone Tutorial
        </Button>

        <Text style={styles.hint}>
          {appleAvailable
            ? 'Apple-provided, localized content (iOS 18+). Required for App Review.'
            : 'Requires iOS 18+ and a current development build with ProximityReaderDiscovery.'}
        </Text>

        {!appleAvailable && (
          <>
            <Divider style={styles.divider} />
            <Button
              mode="outlined"
              icon="help-circle-outline"
              onPress={() => navigation.navigate('TapToPayEducation')}
              style={styles.btn}
            >
              Open Reference Guide (fallback)
            </Button>
          </>
        )}

        {educationStatus && (
          <Text style={styles.status}>{educationStatus}</Text>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, backgroundColor: COLORS.surface },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.foreground, marginBottom: 6 },
  desc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },
  btn: { borderRadius: 8 },
  hint: { fontSize: 11, color: COLORS.textLight, marginTop: 6, textAlign: 'center' },
  divider: { marginVertical: 12 },
  status: { fontSize: 12, color: COLORS.success, marginTop: 10 },
});
