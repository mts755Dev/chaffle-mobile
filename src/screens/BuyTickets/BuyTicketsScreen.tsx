import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput as RNTextInput,
  Modal,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Checkbox,
  Snackbar,
  Card,
  Icon,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import * as SecureStore from 'expo-secure-store';
import { COLORS, STRIPE_PUBLISHABLE_KEY, US_STATES } from '../../constants';
import { RootStackParamList } from '../../types';
import { ticketApi } from '../../services/api/raffleApi';
import { stripeApi } from '../../services/api/stripeApi';
import { formatCurrency, getPublicIp } from '../../utils';
import { useAuthStore } from '../../store/authStore';
import { blockWorkerFromForeignRaffle } from '../../utils/workerAccess';
import TicketTierSelector from '../../components/TicketTierSelector';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type BuyTicketsRouteProp = RouteProp<RootStackParamList, 'BuyTickets'>;

const buyTicketSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().length(2, 'Please select a state'),
  zipCode: z.string().regex(/^\d{5}$/, 'Zip code must be 5 digits'),
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
  const { role, raffleId: workerRaffleId } = useAuthStore();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [workerBlocked, setWorkerBlocked] = useState(false);

  useEffect(() => {
    if (
      !blockWorkerFromForeignRaffle(role, workerRaffleId, raffleId, () =>
        navigation.goBack(),
      )
    ) {
      setWorkerBlocked(true);
    }
  }, [role, workerRaffleId, raffleId, navigation]);

  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState<number>(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [donateExtra, setDonateExtra] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef<RNTextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const nameFieldY = useRef(0);
  const [statePickerVisible, setStatePickerVisible] = useState(false);

  const FORM_STORAGE_KEY = `chaffle-checkout-form-${raffleId}`;
  const TICKET_STORAGE_KEY = `chaffle-selected-ticket-${raffleId}`;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<BuyTicketFormData>({
    resolver: zodResolver(buyTicketSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const savedForm = await SecureStore.getItemAsync(FORM_STORAGE_KEY);
        const savedTicket = await SecureStore.getItemAsync(TICKET_STORAGE_KEY);

        if (savedForm) {
          reset(JSON.parse(savedForm));
        }
        if (savedTicket) {
          const { price, quantity } = JSON.parse(savedTicket);
          setSelectedPrice(price);
          setSelectedQuantity(quantity);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const subscription = watch((value) => {
      SecureStore.setItemAsync(FORM_STORAGE_KEY, JSON.stringify(value)).catch(() => {});
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  const handleTierSelect = (price: number, quantity: number) => {
    setSelectedPrice(price);
    setSelectedQuantity(quantity);
    SecureStore.setItemAsync(TICKET_STORAGE_KEY, JSON.stringify({ price, quantity })).catch(() => {});
    setTimeout(() => {
      nameInputRef.current?.focus();
      scrollViewRef.current?.scrollTo({ y: nameFieldY.current, animated: true });
    }, 50);
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

      const fullAddress = `${formData.address}, ${formData.city}, ${formData.state} ${formData.zipCode}`;

      // 1. Create ticket record (unpaid)
      const ticket = await ticketApi.createTicket({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        address: fullAddress,
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

      // Clear saved form data after successful checkout
      await SecureStore.deleteItemAsync(FORM_STORAGE_KEY);
      await SecureStore.deleteItemAsync(TICKET_STORAGE_KEY);

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

  if (workerBlocked) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
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
            <View onLayout={(e) => { nameFieldY.current = e.nativeEvent.layout.y; }}>
              <TextInput
                ref={nameInputRef}
                mode="outlined"
                label="Full Name"
                value={value}
                onChangeText={onChange}
                error={!!errors.name}
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
              />
            </View>
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
              label="Street Address"
              placeholder="123 Main St"
              value={value}
              onChangeText={onChange}
              error={!!errors.address}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.address && <Text style={styles.errorText}>{errors.address.message}</Text>}

        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, value } }) => (
            <TextInput
              mode="outlined"
              label="City"
              placeholder="Orlando"
              value={value}
              onChangeText={onChange}
              error={!!errors.city}
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
            />
          )}
        />
        {errors.city && <Text style={styles.errorText}>{errors.city.message}</Text>}

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Controller
              control={control}
              name="state"
              render={({ field: { onChange, value } }) => (
                <>
                  <TouchableOpacity
                    onPress={() => setStatePickerVisible(true)}
                    activeOpacity={0.7}
                  >
                    <TextInput
                      mode="outlined"
                      label="State"
                      placeholder="Select"
                      value={value}
                      editable={false}
                      pointerEvents="none"
                      error={!!errors.state}
                      style={styles.input}
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.primary}
                      right={<TextInput.Icon icon="chevron-down" onPress={() => setStatePickerVisible(true)} />}
                    />
                  </TouchableOpacity>
                  <Modal
                    visible={statePickerVisible}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setStatePickerVisible(false)}
                  >
                    <TouchableOpacity
                      style={styles.modalOverlay}
                      activeOpacity={1}
                      onPress={() => setStatePickerVisible(false)}
                    >
                      <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                          <Text style={styles.modalTitle}>Select State</Text>
                          <TouchableOpacity onPress={() => setStatePickerVisible(false)}>
                            <Icon source="close" size={24} color={COLORS.foreground} />
                          </TouchableOpacity>
                        </View>
                        <FlatList
                          data={US_STATES}
                          keyExtractor={(item) => item}
                          renderItem={({ item }) => (
                            <TouchableOpacity
                              style={[
                                styles.stateItem,
                                value === item && styles.stateItemSelected,
                              ]}
                              onPress={() => {
                                onChange(item);
                                setStatePickerVisible(false);
                              }}
                            >
                              <Text
                                style={[
                                  styles.stateItemText,
                                  value === item && styles.stateItemTextSelected,
                                ]}
                              >
                                {item}
                              </Text>
                              {value === item && (
                                <Icon source="check" size={18} color={COLORS.primary} />
                              )}
                            </TouchableOpacity>
                          )}
                        />
                      </View>
                    </TouchableOpacity>
                  </Modal>
                </>
              )}
            />
            {errors.state && <Text style={styles.errorText}>{errors.state.message}</Text>}
          </View>

          <View style={styles.halfField}>
            <Controller
              control={control}
              name="zipCode"
              render={({ field: { onChange, value } }) => (
                <TextInput
                  mode="outlined"
                  label="Zip Code"
                  placeholder="32801"
                  value={value}
                  onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ''))}
                  maxLength={5}
                  keyboardType="number-pad"
                  error={!!errors.zipCode}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                />
              )}
            />
            {errors.zipCode && <Text style={styles.errorText}>{errors.zipCode.message}</Text>}
          </View>
        </View>

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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  stateItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  stateItemSelected: {
    backgroundColor: '#EEF7FA',
  },
  stateItemText: {
    fontSize: 16,
    color: COLORS.foreground,
  },
  stateItemTextSelected: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
