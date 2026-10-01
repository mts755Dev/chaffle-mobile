import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { RootStackParamList } from '../../types';
import { getTicketReferenceId } from '../../utils';
import { useAuthStore } from '../../store/authStore';
import { resetToAdminHome } from '../../navigation/resetToAdminHome';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PaymentSuccessRouteProp = RouteProp<RootStackParamList, 'PaymentSuccess'>;

export default function PaymentSuccessScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PaymentSuccessRouteProp>();
  const { ticketId, quantity } = route.params;
  const referenceId = getTicketReferenceId(ticketId);
  const { isAdmin, role } = useAuthStore();

  const goHome = () => {
    // Signed-in staff stack has AdminTabs/WorkerTabs, not AdminLogin.
    if (isAdmin && role) {
      resetToAdminHome(navigation, role);
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{ name: 'AdminLogin' }],
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon source="check-circle" size={56} color={COLORS.success} />
      </View>

      <Text style={styles.title}>Thank You for Your Purchase!</Text>
      <Text style={styles.subtitle}>
        Your payment was successful and your tickets have been entered into the
        raffle.
      </Text>

      <View style={styles.card}>
        <Text style={styles.referenceLabel}>Your Ticket ID:</Text>
        <Text style={styles.referenceValue} selectable>
          #{referenceId}
        </Text>
        {quantity != null && (
          <Text style={styles.quantityHint}>
            {quantity} {quantity === 1 ? 'ticket' : 'tickets'}
          </Text>
        )}
      </View>

      <Text style={styles.note}>
        You will also receive a confirmation email with your ticket information
        shortly. If you don't see it, check your spam/junk folder.
      </Text>

      <Text style={styles.note}>
        Feel free to screenshot or write down this Ticket ID. You may use it to
        check if you have won once the winning number is posted on the raffle
        page.
      </Text>

      <Button
        mode="contained"
        onPress={goHome}
        style={styles.button}
        contentStyle={styles.buttonContent}
        icon="home"
      >
        Back to Home
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.foreground,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  card: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  referenceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  referenceValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
    color: COLORS.primary,
  },
  quantityHint: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  note: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    width: '100%',
    marginTop: 12,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
