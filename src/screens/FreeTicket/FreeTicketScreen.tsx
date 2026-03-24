import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, Snackbar } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { COLORS } from '../../constants';
import { RootStackParamList } from '../../types';
import { ticketApi, raffleApi } from '../../services/api/raffleApi';
import { useLocation } from '../../hooks/useLocation';
import { getPublicIp } from '../../utils';
import LoadingScreen from '../../components/LoadingScreen';
import GeoRestrictedScreen from '../../components/GeoRestrictedScreen';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type FreeTicketRouteProp = RouteProp<RootStackParamList, 'FreeTicket'>;

const freeTicketSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Phone number is required'),
  address: z.string().min(5, 'Address is required'),
});

type FreeTicketFormData = z.infer<typeof freeTicketSchema>;

export default function FreeTicketScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<FreeTicketRouteProp>();
  const { raffleId } = route.params;
  const location = useLocation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [donationForm, setDonationForm] = useState<any>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FreeTicketFormData>({
    resolver: zodResolver(freeTicketSchema),
  });

  useEffect(() => {
    checkEligibility();
  }, []);

  const checkEligibility = async () => {
    try {
      const form = await raffleApi.getDonationFormById(raffleId);
      setDonationForm(form);

      if (!form) {
        setError('Raffle not found');
        setIsChecking(false);
        return;
      }

      // Check if draw date has passed
      if (form.draw_date && new Date(form.draw_date) < new Date()) {
        setError('This raffle has ended');
        setIsChecking(false);
        return;
      }

      // Check if already claimed free ticket by IP
      const ip = await getPublicIp();
      const existingTicket = await ticketApi.getTicketWhere({
        ip,
        donation_formId: raffleId,
        isFree: true,
      } as any);

      if (existingTicket) {
        setAlreadyClaimed(true);
      }
    } catch {
      // Continue
    } finally {
      setIsChecking(false);
    }
  };

  const onSubmit = async (formData: FreeTicketFormData) => {
    setIsSubmitting(true);
    setError('');

    try {
      const ip = await getPublicIp();

      // Double check free ticket eligibility
      const existingTicket = await ticketApi.getTicketWhere({
        ip,
        donation_formId: raffleId,
        isFree: true,
      } as any);

      if (existingTicket) {
        setAlreadyClaimed(true);
        setIsSubmitting(false);
        return;
      }

      await ticketApi.createTicket({
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        amount: 0,
        quantity: 1,
        raffleId,
        ip,
        isFree: true,
        paid: true, // Free tickets are automatically "paid"
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to claim free ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isChecking || location.isLoading) {
    return <LoadingScreen message="Checking eligibility..." />;
  }

  // Geo restriction - free tickets may be location restricted
  if (donationForm?.raffleLocation && location.state && donationForm.raffleLocation !== location.state) {
    return (
      <GeoRestrictedScreen
        userState={location.state}
        requiredState={donationForm.raffleLocation}
        onGoBack={() => navigation.goBack()}
      />
    );
  }

  if (alreadyClaimed) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.claimedText}>
          OOPS! You've already claimed a free ticket for this raffle.
        </Text>
        <Button
          mode="contained"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.successTitle}>Free Ticket Claimed!</Text>
        <Text style={styles.successText}>
          Your free ticket has been registered. Good luck!
        </Text>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('MainTabs')}
          style={styles.backButton}
        >
          Back to Home
        </Button>
      </View>
    );
  }

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
        <Text style={styles.title}>Claim Your Free Ticket</Text>
        <Text style={styles.description}>
          Get one free entry into this raffle. Limited to one per person.
        </Text>

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

        <Button
          mode="contained"
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
          style={styles.submitButton}
          contentStyle={styles.submitContent}
          icon="gift"
        >
          Claim Free Ticket
        </Button>
      </ScrollView>

      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3000}
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
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
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
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    marginTop: 16,
  },
  submitContent: {
    paddingVertical: 8,
  },
  claimedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.success,
    marginBottom: 8,
  },
  successText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
  },
  snackbar: {
    backgroundColor: COLORS.error,
  },
});
