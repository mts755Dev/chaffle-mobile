import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Checkbox,
  Snackbar,
  Card,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { COLORS, STRIPE_PUBLISHABLE_KEY } from '../../constants';
import { RootStackParamList } from '../../types';
import { ticketApi } from '../../services/api/raffleApi';
import { stripeApi } from '../../services/api/stripeApi';
import { formatCurrency, getPublicIp } from '../../utils';
import TicketTierSelector from '../../components/TicketTierSelector';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type BuyTicketsRouteProp = RouteProp<RootStackParamList, 'BuyTickets'>;

const buyTicketSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  address: z.string().min(5, 'Address is required'),
});

type BuyTicketFormData = z.infer<typeof buyTicketSchema>;

export default function BuyTicketsScreen() {
  const route = useRoute<BuyTicketsRouteProp>();
  const { donationForm } = route.params;
  const stripeAccountId = (donationForm.stripeAccount as any)?.id;

  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      stripeAccountId={stripeAccountId}
    >
      <BuyTicketsContent />
    </StripeProvider>
  );
}

function BuyTicketsContent() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BuyTicketsRouteProp>();
  const { raffleId, donationForm } = route.params;
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState<number>(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [donateExtra, setDonateExtra] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<BuyTicketFormData>({
    resolver: zodResolver(buyTicketSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  const handleTierSelect = (price: number, quantity: number) => {
    setSelectedPrice(price);
    setSelectedQuantity(quantity);
  };

  const onSubmit = async (formData: BuyTicketFormData) => {
    if (!selectedPrice || !selectedQuantity) {
      setError('Please select a ticket tier');
      return;
    }

    if (!acceptedTerms) {
      setError('Please accept the terms and conditions');
      return;
    }

    const stripeAccount = (donationForm.stripeAccount as any)?.id;
    if (!stripeAccount) {
      setError('Payment is not configured for this raffle');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const ip = await getPublicIp();

      // 1. Create ticket record (unpaid)
      const ticket = await ticketApi.createTicket({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        amount: selectedPrice,
        quantity: selectedQuantity,
        raffleId,
        ip,
        isFree: false,
        paid: false,
      });

      // 2. Create payment intent via backend
      const paymentData = await stripeApi.createPaymentIntent({
        amount: selectedPrice,
        quantity: selectedQuantity,
        email: formData.email,
        ticketId: ticket.id,
        raffleAccount: stripeAccount,
        isApplicationAmount: donateExtra,
      });

      if (!paymentData?.clientSecret) {
        throw new Error('Failed to create payment');
      }

      // 3. Initialize Stripe payment sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: paymentData.clientSecret,
        merchantDisplayName: 'Chaffle',
        allowsDelayedPaymentMethods: false,
        returnURL: 'chaffle://payment-complete',
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // 4. Present payment sheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setIsProcessing(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // 5. Payment successful - confirm on backend
      await stripeApi.confirmPaymentSuccess(ticket.id);

      // 6. Send confirmation email (fire-and-forget, don't block navigation)
      stripeApi.sendPurchaseEmail({
        email: formData.email,
        quantity: selectedQuantity,
        ticketNumber: ticket.id,
      }).catch((err) => console.warn('Confirmation email failed:', err.message));

      // 7. Navigate to success
      navigation.replace('PaymentSuccess', {
        ticketId: ticket.id,
        quantity: selectedQuantity,
      });
    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>
          {donationForm.title || 'Buy Raffle Tickets'}
        </Text>

        {/* Ticket Tiers */}
        <TicketTierSelector
          selectedPrice={selectedPrice}
          onSelect={handleTierSelect}
        />

        {selectedPrice && (
          <Card style={styles.summaryCard}>
            <Card.Content>
              <Text style={styles.summaryText}>
                {formatCurrency(selectedPrice)} → {selectedQuantity}{' '}
                {selectedQuantity === 1 ? 'ticket' : 'tickets'}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Form Fields */}
        <Text style={styles.sectionTitle}>Your Information</Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Full Name"
              value={value}
              onChangeText={onChange}
              error={!!errors.name}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.name && <Text style={styles.errorText}>{errors.name.message}</Text>}

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Email"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              error={!!errors.email}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Phone Number"
              value={value}
              onChangeText={onChange}
              keyboardType="phone-pad"
              error={!!errors.phone}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.phone && <Text style={styles.errorText}>{errors.phone.message}</Text>}

        <Controller
          control={control}
          name="address"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="Address"
              value={value}
              onChangeText={onChange}
              error={!!errors.address}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              multiline
            />
          )}
        />
        {errors.address && <Text style={styles.errorText}>{errors.address.message}</Text>}

        {/* Checkboxes */}
        <View style={styles.checkboxRow}>
          <Checkbox.Android
            status={acceptedTerms ? 'checked' : 'unchecked'}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            color={COLORS.primary}
            uncheckedColor={COLORS.textSecondary}
          />
          <Text style={styles.checkboxLabel} onPress={() => setAcceptedTerms(!acceptedTerms)}>
            I accept the terms and conditions
          </Text>
        </View>

        <View style={styles.checkboxRow}>
          <Checkbox.Android
            status={donateExtra ? 'checked' : 'unchecked'}
            onPress={() => setDonateExtra(!donateExtra)}
            color={COLORS.primary}
            uncheckedColor={COLORS.textSecondary}
          />
          <Text style={styles.checkboxLabel} onPress={() => setDonateExtra(!donateExtra)}>
            Donate an extra 10% platform fee to support Chaffle
          </Text>
        </View>

        {/* Submit */}
        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={isProcessing}
          disabled={isProcessing || !selectedPrice || !acceptedTerms}
          style={styles.submitButton}
          contentStyle={styles.submitButtonContent}
          icon="credit-card"
        >
          {isProcessing ? 'Processing...' : 'Proceed to Payment'}
        </Button>
      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={4000}
        action={{ label: 'OK', onPress: () => setError('') }}
        style={styles.snackbar}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginTop: 16,
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    marginTop: 16,
  },
  submitButtonContent: {
    paddingVertical: 8,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
