/**
 * Full-screen intro for Tap to Pay (3.1 visibility, 3.3 one-time communication, 3.2 hero).
 */

import React from 'react';
import { Modal, View, StyleSheet, Platform } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { COLORS } from '../constants';
import TapToPayIcon from './TapToPayIcon';

interface TapToPayIntroModalProps {
  visible: boolean;
  onGetStarted: () => void;
  onDismiss: () => void;
}

export default function TapToPayIntroModal({
  visible,
  onGetStarted,
  onDismiss,
}: TapToPayIntroModalProps) {
  if (Platform.OS !== 'ios') return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.hero}>
          <TapToPayIcon size={72} color={COLORS.white} filled />
          <Text style={styles.title}>Tap to Pay on iPhone</Text>
          <Text style={styles.subtitle}>
            Accept in-person contactless payments for raffle tickets — no extra card reader required.
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.bodyText}>
            Chaffle uses Apple&apos;s secure Tap to Pay on iPhone technology so you can sell tickets on-site with a tap of the
            customer&apos;s card or phone.
          </Text>
          <Button
            mode="contained"
            icon={({ size, color }) => (
              <TapToPayIcon size={size} color={color} filled />
            )}
            onPress={onGetStarted}
            style={styles.primaryBtn}
            buttonColor={COLORS.primary}
            contentStyle={styles.btnContent}
          >
            Get Started
          </Button>
          <Button mode="text" onPress={onDismiss} textColor={COLORS.textSecondary}>
            Not now
          </Button>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  hero: {
    flex: 1,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.white,
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 22,
  },
  body: { padding: 24, gap: 12 },
  bodyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 8,
  },
  primaryBtn: { borderRadius: 12 },
  btnContent: { paddingVertical: 6 },
});
