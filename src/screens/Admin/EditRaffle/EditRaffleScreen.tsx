import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  Snackbar,
  Icon,
  Menu,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, API_BASE_URL } from '../../../constants';
import { RootStackParamList, DonationForm } from '../../../types';
import { useRaffleStore } from '../../../store/raffleStore';
import { stripeApi } from '../../../services/api/stripeApi';
import { secureLinkApi } from '../../../services/api/raffleApi';
import { useImageUpload } from '../../../hooks/useImageUpload';
import LoadingScreen from '../../../components/LoadingScreen';
import * as Clipboard from 'expo-clipboard';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EditRaffleRouteProp = RouteProp<RootStackParamList, 'EditRaffle'>;

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

export default function EditRaffleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditRaffleRouteProp>();
  const { id } = route.params;

  const { fetchFormById, updateForm, currentForm, isLoading } = useRaffleStore();
  const { pickImage, uploadImage, isUploading } = useImageUpload();

  const [form, setForm] = useState<Partial<DonationForm>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const [isRefreshingStripe, setIsRefreshingStripe] = useState(false);
  const [isGeneratingSecureLink, setIsGeneratingSecureLink] = useState(false);
  const [stateMenuVisible, setStateMenuVisible] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadRaffle();
  }, [id]);

  useEffect(() => {
    if (currentForm) {
      setForm(currentForm);
    }
  }, [currentForm]);

  const loadRaffle = async () => {
    await fetchFormById(id);
  };

  // Validation — matches web's Zod schema
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.title || form.title.trim().length < 5)
      newErrors.title = 'Title must be at least 5 characters';
    if (!form.charity_info || form.charity_info.trim().length < 5)
      newErrors.charity_info = 'Raffle Info must be at least 5 characters';
    if (!form.rules || form.rules.trim().length < 5)
      newErrors.rules = 'Rules must be at least 5 characters';
    if (!form.draw_date) {
      newErrors.draw_date = 'Draw date is required';
    } else if (new Date(form.draw_date) < new Date()) {
      newErrors.draw_date = 'Draw date must be in the future';
    }
    if (!form.raffleLocation) newErrors.raffleLocation = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      setSnackMessage('Please fix the errors above');
      return;
    }

    setIsSaving(true);
    try {
      await updateForm({
        id,
        title: form.title,
        charity_info: form.charity_info,
        rules: form.rules,
        draw_date: form.draw_date,
        raffleLocation: form.raffleLocation,
        backgroundImage: form.backgroundImage,
      });
      setSnackMessage('Raffle saved successfully!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUpload = async () => {
    const uri = await pickImage();
    if (!uri) return;

    const publicUrl = await uploadImage(uri);
    if (publicUrl) {
      setForm((prev) => ({ ...prev, backgroundImage: publicUrl }));
      setSnackMessage('Image uploaded!');
    }
  };

  // Free ticket link — same as web
  const handleCopyFreeTicketLink = async () => {
    const link = `${API_BASE_URL}/ticket/free/${id}`;
    try {
      await Clipboard.setStringAsync(link);
      setSnackMessage('Free ticket link copied to clipboard!');
    } catch {
      Alert.alert('Free Ticket Link', link);
    }
  };

  // Stripe Connect
  const stripeAccount = form.stripeAccount as any;
  const isStripeLinked = stripeAccount?.charges_enabled;

  const handleGenerateSecureLink = async () => {
    if (form.stripeAccount) {
      setSnackMessage('Stripe account is already linked');
      return;
    }
    setIsGeneratingSecureLink(true);
    try {
      const uniqueRecord = await secureLinkApi.createUniqueRecord(id);
      const url = `${API_BASE_URL}/stripe/account/${uniqueRecord.id}/link`;
      try {
        await Clipboard.setStringAsync(url);
        setSnackMessage('Secure link copied to clipboard!');
      } catch {
        Alert.alert('Secure Link', url);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to generate link');
    } finally {
      setIsGeneratingSecureLink(false);
    }
  };

  const handleRefreshStripeStatus = async () => {
    if (!stripeAccount?.id) {
      setSnackMessage('No Stripe account found');
      return;
    }
    setIsRefreshingStripe(true);
    try {
      const result = await stripeApi.refreshStripeAccountStatus(stripeAccount.id, id);
      setSnackMessage(
        result.charges_enabled
          ? 'Stripe account linked successfully!'
          : 'Account not yet fully linked',
      );
      loadRaffle();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to refresh status');
    } finally {
      setIsRefreshingStripe(false);
    }
  };

  if (isLoading && !currentForm) {
    return <LoadingScreen message="Loading raffle..." />;
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
        {/* Header — matches web: "Raffle Information" + Preview link */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Raffle Information</Text>
          <Button
            mode="text"
            icon="eye"
            textColor={COLORS.primary}
            compact
            onPress={() => navigation.navigate('PreviewRaffle', { id })}
          >
            Preview
          </Button>
        </View>

        {/* Stripe Connect Section — matches web */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Stripe Connect</Text>
            {isStripeLinked ? (
              <View style={styles.stripeLinkedBanner}>
                <Icon source="wallet" size={20} color={COLORS.white} />
                <Text style={styles.stripeLinkedBannerText}>Account linked already</Text>
              </View>
            ) : (
              <View style={styles.stripeActions}>
                <Button
                  mode="contained"
                  onPress={() => {
                    Alert.alert(
                      'Generate Secure Link',
                      'Generating a new link will invalidate any previous links. Continue?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Continue', onPress: handleGenerateSecureLink },
                      ],
                    );
                  }}
                  loading={isGeneratingSecureLink}
                  disabled={isGeneratingSecureLink}
                  icon="shield-check"
                  style={styles.stripeButton}
                  buttonColor={COLORS.primary}
                >
                  Generate a secure link
                </Button>

                {stripeAccount?.id && (
                  <Button
                    mode="outlined"
                    onPress={handleRefreshStripeStatus}
                    loading={isRefreshingStripe}
                    disabled={isRefreshingStripe}
                    icon="refresh"
                    style={styles.refreshButton}
                    textColor={COLORS.foreground}
                  >
                    {isRefreshingStripe ? 'Checking...' : 'Refresh Status'}
                  </Button>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Form Fields — matches web: Title, Draw Date, Location, Raffle Info, Free Ticket Link, Rules, Submit */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Raffle Details</Text>

            {/* Title */}
            <TextInput
              mode="outlined"
              label="Title"
              value={form.title || ''}
              onChangeText={(text) => {
                setForm((prev) => ({ ...prev, title: text }));
                if (errors.title) setErrors((e) => ({ ...e, title: '' }));
              }}
              style={styles.input}
              outlineColor={errors.title ? COLORS.error : COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
              error={!!errors.title}
            />
            {errors.title ? <Text style={styles.errorText}>{errors.title}</Text> : null}

            {/* Draw Date + Location — side by side on web, stacked on mobile */}
            <TextInput
              mode="outlined"
              label="Draw Date"
              value={form.draw_date || ''}
              onChangeText={(text) => {
                setForm((prev) => ({ ...prev, draw_date: text }));
                if (errors.draw_date) setErrors((e) => ({ ...e, draw_date: '' }));
              }}
              placeholder="YYYY-MM-DD"
              style={styles.input}
              outlineColor={errors.draw_date ? COLORS.error : COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
              error={!!errors.draw_date}
            />
            {errors.draw_date ? <Text style={styles.errorText}>{errors.draw_date}</Text> : null}

            {/* Location — Dropdown like web's Select */}
            <Text style={styles.fieldLabel}>Raffle Location</Text>
            <Menu
              visible={stateMenuVisible}
              onDismiss={() => setStateMenuVisible(false)}
              anchor={
                <TouchableOpacity
                  onPress={() => setStateMenuVisible(true)}
                  style={[
                    styles.selectTrigger,
                    errors.raffleLocation ? styles.selectTriggerError : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.selectTriggerText,
                      !form.raffleLocation && styles.selectPlaceholder,
                    ]}
                  >
                    {form.raffleLocation || 'Select a state where raffle is going to be placed'}
                  </Text>
                  <Icon source="chevron-down" size={20} color={COLORS.textSecondary} />
                </TouchableOpacity>
              }
              contentStyle={styles.menuContent}
            >
              <ScrollView style={styles.menuScroll}>
                {US_STATES.map((state) => (
                  <Menu.Item
                    key={state}
                    title={state}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, raffleLocation: state }));
                      setStateMenuVisible(false);
                      if (errors.raffleLocation)
                        setErrors((e) => ({ ...e, raffleLocation: '' }));
                    }}
                    titleStyle={
                      form.raffleLocation === state
                        ? { color: COLORS.primary, fontWeight: '700' }
                        : { color: COLORS.foreground }
                    }
                  />
                ))}
              </ScrollView>
            </Menu>
            {errors.raffleLocation ? (
              <Text style={styles.errorText}>{errors.raffleLocation}</Text>
            ) : null}

            <Divider style={styles.sectionDivider} />

            {/* Raffle Info — charityInfo on web */}
            <TextInput
              mode="outlined"
              label="Raffle Info"
              value={form.charity_info || ''}
              onChangeText={(text) => {
                setForm((prev) => ({ ...prev, charity_info: text }));
                if (errors.charity_info)
                  setErrors((e) => ({ ...e, charity_info: '' }));
              }}
              multiline
              numberOfLines={5}
              style={[styles.input, styles.multilineInput]}
              outlineColor={errors.charity_info ? COLORS.error : COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
              error={!!errors.charity_info}
            />
            {errors.charity_info ? (
              <Text style={styles.errorText}>{errors.charity_info}</Text>
            ) : null}

            <Divider style={styles.sectionDivider} />

            {/* Free Ticket Link — matches web */}
            <Button
              mode="contained"
              onPress={handleCopyFreeTicketLink}
              icon="ticket-percent"
              style={styles.freeTicketButton}
              buttonColor={COLORS.primary}
            >
              Generate a free ticket link
            </Button>

            <Divider style={styles.sectionDivider} />

            {/* Rules and Regulation */}
            <TextInput
              mode="outlined"
              label="Rules and Regulation"
              value={form.rules || ''}
              onChangeText={(text) => {
                setForm((prev) => ({ ...prev, rules: text }));
                if (errors.rules) setErrors((e) => ({ ...e, rules: '' }));
              }}
              multiline
              numberOfLines={5}
              style={[styles.input, styles.multilineInput]}
              outlineColor={errors.rules ? COLORS.error : COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
              error={!!errors.rules}
            />
            {errors.rules ? <Text style={styles.errorText}>{errors.rules}</Text> : null}
          </Card.Content>
        </Card>

        {/* Image Upload — matches web's UploadBackgroundImage */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Background Image</Text>
            {form.backgroundImage ? (
              <Image
                source={{ uri: form.backgroundImage }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon source="image-plus" size={48} color={COLORS.textLight} />
                <Text style={styles.imagePlaceholderText}>No image uploaded</Text>
              </View>
            )}
            <Button
              mode="contained-tonal"
              onPress={handleImageUpload}
              loading={isUploading}
              disabled={isUploading}
              icon="camera"
              style={styles.uploadButton}
            >
              {form.backgroundImage ? 'Change Image' : 'Upload Image'}
            </Button>
          </Card.Content>
        </Card>

        {/* Submit Button — matches web */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          buttonColor={COLORS.primary}
        >
          Submit
        </Button>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={!!snackMessage}
        onDismiss={() => setSnackMessage('')}
        duration={3000}
        action={{
          label: 'OK',
          onPress: () => setSnackMessage(''),
        }}
      >
        {snackMessage}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.foreground,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  multilineInput: {
    minHeight: 100,
  },
  fieldLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 4,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
    marginBottom: 4,
  },
  selectTriggerError: {
    borderColor: COLORS.error,
  },
  selectTriggerText: {
    fontSize: 14,
    color: COLORS.foreground,
    flex: 1,
  },
  selectPlaceholder: {
    color: COLORS.textLight,
  },
  menuContent: {
    backgroundColor: COLORS.white,
    maxWidth: '90%',
  },
  menuScroll: {
    maxHeight: 300,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.error,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionDivider: {
    marginVertical: 16,
  },
  freeTicketButton: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  // Stripe styles
  stripeLinkedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
  },
  stripeLinkedBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  stripeActions: {
    gap: 10,
  },
  stripeButton: {
    borderRadius: 8,
  },
  refreshButton: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  // Image styles
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  imagePlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: COLORS.surfaceMuted,
  },
  imagePlaceholderText: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 8,
  },
  uploadButton: {
    borderRadius: 8,
  },
  saveButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  saveButtonContent: {
    paddingVertical: 8,
  },
});
