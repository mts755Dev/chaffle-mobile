import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Icon } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { RootStackParamList } from '../../types';
import { shortId } from '../../utils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PaymentSuccessRouteProp = RouteProp<RootStackParamList, 'PaymentSuccess'>;

export default function PaymentSuccessScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PaymentSuccessRouteProp>();
  const { ticketId, quantity } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Icon source="check-circle" size={80} color={COLORS.success} />
      </View>

      <Text style={styles.title}>Thank You!</Text>
      <Text style={styles.subtitle}>Your payment was successful</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ticket Confirmation</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Ticket Number</Text>
          <Text style={styles.value}>#{shortId(ticketId)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Quantity</Text>
          <Text style={styles.value}>
            {quantity} {quantity === 1 ? 'ticket' : 'tickets'}
          </Text>
        </View>
      </View>

      <Text style={styles.note}>
        A confirmation email has been sent to your email address. Winners will be announced via
        email and social media. Good luck!
      </Text>

      <Button
        mode="contained"
        onPress={() => navigation.navigate('MainTabs')}
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
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.foreground,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.success,
    marginTop: 4,
    marginBottom: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    elevation: 2,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  note: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    width: '100%',
  },
  buttonContent: {
    paddingVertical: 8,
  },
});
