/**
 * Post-login prompt to enable Tap to Pay (3.4 end of merchant onboarding path).
 */

import React from 'react';
import { Modal, View, StyleSheet, Platform } from 'react-native';
import { Text, Button, Portal } from 'react-native-paper';
import { COLORS } from '../constants';

interface TapToPayEnablePromptModalProps {
  visible: boolean;
  onSetUp: () => void;
  onLater: () => void;
}

export default function TapToPayEnablePromptModal({
  visible,
  onSetUp,
  onLater,
}: TapToPayEnablePromptModalProps) {
  if (Platform.OS !== 'ios') return null;

  return (
    <Portal>
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.title}>Enable Tap to Pay on iPhone</Text>
            <Text style={styles.message}>
              You&apos;re ready to accept contactless payments. Set up Tap to Pay on iPhone now — it only takes a few minutes.
              You&apos;ll accept Apple&apos;s Terms & Conditions on this device.
            </Text>
            <Button
              mode="contained"
              onPress={onSetUp}
              style={styles.btn}
              buttonColor={COLORS.primary}
            >
              Set Up Tap to Pay on iPhone
            </Button>
            <Button mode="text" onPress={onLater} textColor={COLORS.textSecondary}>
              Later
            </Button>
          </View>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  btn: { borderRadius: 8, marginBottom: 4 },
});
