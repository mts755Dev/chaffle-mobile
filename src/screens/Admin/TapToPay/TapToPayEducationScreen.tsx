/**
 * Merchant education reference (4.3, 4.4 fallback) — Settings / Help section.
 */

import React, { useState } from 'react';
import { ScrollView, View, StyleSheet, Platform } from 'react-native';
import { Text, Button, Card, Divider } from 'react-native-paper';
import { COLORS } from '../../../constants';
import {
  TAP_TO_PAY_EDUCATION_SECTIONS,
  TAP_TO_PAY_EDUCATION_REGION,
} from '../../../constants/tapToPayEducationContent';
import {
  presentAppleTapToPayEducation,
  supportsAppleProximityReaderDiscovery,
} from '../../../services/tapToPayEducation';

export default function TapToPayEducationScreen() {
  const [appleStatus, setAppleStatus] = useState<string | null>(null);
  const canUseApple = supportsAppleProximityReaderDiscovery();

  const handleAppleEducation = async () => {
    setAppleStatus(null);
    const result = await presentAppleTapToPayEducation();
    if (result.source === 'apple-proximity-reader-discovery') {
      setAppleStatus('Apple education completed.');
    } else {
      setAppleStatus(result.reason);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Tap to Pay — Merchant Guide</Text>
      <Text style={styles.subheading}>
        Reference for accepting in-person contactless payments. Region: {TAP_TO_PAY_EDUCATION_REGION}.
      </Text>

      {Platform.OS === 'ios' && (
        <Card style={styles.appleCard}>
          <Card.Content>
            <Text style={styles.appleTitle}>Apple official tutorial</Text>
            <Text style={styles.appleDesc}>
              {canUseApple
                ? 'Opens Apple\'s localized education for Tap to Pay on iPhone (iOS 18+).'
                : 'Requires iOS 18 or later. Use the guide below on older versions.'}
            </Text>
            <Button
              mode="contained"
              icon="book-open-variant"
              onPress={handleAppleEducation}
              disabled={!canUseApple}
              style={styles.appleBtn}
              buttonColor={COLORS.primary}
            >
              View Apple Education
            </Button>
            {appleStatus && (
              <Text style={styles.appleStatus}>{appleStatus}</Text>
            )}
          </Card.Content>
        </Card>
      )}

      <Divider style={styles.divider} />

      {TAP_TO_PAY_EDUCATION_SECTIONS.map((section) => (
        <Card key={section.id} style={styles.sectionCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: 'bold', color: COLORS.foreground, marginBottom: 8 },
  subheading: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 16 },
  appleCard: { marginBottom: 8, backgroundColor: COLORS.surface },
  appleTitle: { fontSize: 16, fontWeight: '700', color: COLORS.foreground, marginBottom: 6 },
  appleDesc: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 12 },
  appleBtn: { borderRadius: 8 },
  appleStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 10 },
  divider: { marginVertical: 16 },
  sectionCard: { marginBottom: 12, backgroundColor: COLORS.surface },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.foreground, marginBottom: 6 },
  sectionBody: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  bulletDot: { fontSize: 13, color: COLORS.primary },
  bulletText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
});
