import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Divider,
  Snackbar,
  Icon,
  Menu,
  Switch,
} from 'react-native-paper';
import TextInput from '../../../components/AppTextInput';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, API_BASE_URL } from '../../../constants';
import { RootStackParamList, DonationForm } from '../../../types';
import { useRaffleStore } from '../../../store/raffleStore';
import { useAuthStore } from '../../../store/authStore';
import { stripeApi } from '../../../services/api/stripeApi';
import { secureLinkApi } from '../../../services/api/raffleApi';
import { useImageUpload } from '../../../hooks/useImageUpload';
import { resolveImageUrl } from '../../../utils';
import {
  fromRaffleDateTimeLocalValue,
  parseRaffleDrawDate,
  toRaffleDateTimeLocalValue,
} from '../../../lib/raffleDates';
import LoadingScreen from '../../../components/LoadingScreen';
import RaffleOrganizationAssignCard from '../../../components/RaffleOrganizationAssignCard';
import { RaffleCoverImage } from '../../../components/RaffleHeroBackground';
import DownloadTicketsCsvButton from '../../../components/DownloadTicketsCsvButton';
import DrawDateTimeField from '../../../components/DrawDateTimeField';
import { customDomainApi, CustomDomainStatus } from '../../../services/api/customDomainApi';
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

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

function normalizeDomainInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .trim();
}

export default function EditRaffleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EditRaffleRouteProp>();
  const routeOrganizationId = route.params.organizationId;

  const { fetchFormById, updateForm, createForm, currentForm, isLoading, setCurrentForm } =
    useRaffleStore();
  const { role, organizationId: authOrganizationId } = useAuthStore();
  const isOrgAdmin = role === 'org_admin';
  const isSuperAdmin = role === 'super_admin';
  const { pickImage, uploadImage, isUploading } = useImageUpload();

  const [raffleId, setRaffleId] = useState<string | undefined>(route.params.id);
  const [isCreateMode, setIsCreateMode] = useState(!route.params.id);
  const [form, setForm] = useState<Partial<DonationForm>>({
    autoCheckDonation: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const [isRefreshingStripe, setIsRefreshingStripe] = useState(false);
  const [isGeneratingSecureLink, setIsGeneratingSecureLink] = useState(false);
  const [stateMenuVisible, setStateMenuVisible] = useState(false);
  const [returnToDashboardOnDismiss, setReturnToDashboardOnDismiss] = useState(false);

  // Custom domain — mirrors web (super_admin only)
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [savedCustomDomain, setSavedCustomDomain] = useState('');
  const [domainStatus, setDomainStatus] = useState<CustomDomainStatus | null>(null);
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [isDeletingDomain, setIsDeletingDomain] = useState(false);
  const [isRefreshingDomain, setIsRefreshingDomain] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createOrganizationId = isOrgAdmin
    ? routeOrganizationId ?? authOrganizationId
    : routeOrganizationId ?? null;

  useEffect(() => {
    navigation.setOptions({
      title: isCreateMode ? 'Create Raffle' : 'Edit Raffle',
    });
  }, [isCreateMode, navigation]);

  useEffect(() => {
    if (route.params.id) {
      setRaffleId(route.params.id);
      setIsCreateMode(false);
      void loadRaffle(route.params.id);
      return;
    }

    setRaffleId(undefined);
    setIsCreateMode(true);
    setForm({ autoCheckDonation: true });
    setCustomDomainInput('');
    setSavedCustomDomain('');
    setDomainStatus(null);
    setCurrentForm(null);
  }, [route.params.id]);

  useEffect(() => {
    if (currentForm && currentForm.id === raffleId) {
      setForm({
        ...currentForm,
        draw_date: toRaffleDateTimeLocalValue(currentForm.draw_date),
        autoCheckDonation: currentForm.autoCheckDonation ?? true,
      });
      const domain = currentForm.custom_domain ?? '';
      setSavedCustomDomain(domain);
      setCustomDomainInput(domain);
    }
  }, [currentForm, raffleId]);

  useEffect(() => {
    if (!isSuperAdmin || !savedCustomDomain) {
      setDomainStatus(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await customDomainApi.status(savedCustomDomain);
        if (!cancelled) setDomainStatus(status);
      } catch {
        if (!cancelled) setDomainStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, savedCustomDomain]);

  const loadRaffle = async (id: string) => {
    await fetchFormById(id);
  };

  // Validation — matches web's Zod schema
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.title || form.title.trim().length < 5)
      newErrors.title = 'Minimum content length is 5';
    if (!form.charity_info || form.charity_info.trim().length < 5)
      newErrors.charity_info = 'Minimum content length is 5';
    if (!form.rules || form.rules.trim().length < 5)
      newErrors.rules = 'Minimum content length is 5';
    if (!form.draw_date?.trim()) {
      newErrors.draw_date = 'Draw date and time are required';
    } else {
      const parsed = parseRaffleDrawDate(form.draw_date);
      if (Number.isNaN(parsed.getTime())) {
        newErrors.draw_date = 'Should be a valid date and time';
      } else if (parsed.getTime() < Date.now()) {
        newErrors.draw_date = 'Should be a future date and time (EST)';
      }
    }
    if (!form.raffleLocation) newErrors.raffleLocation = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildFormPayload = () => {
    const drawLocal =
      toRaffleDateTimeLocalValue(form.draw_date) || form.draw_date || '';
    const normalizedDrawDate = fromRaffleDateTimeLocalValue(drawLocal);

    return {
      title: form.title,
      charity_info: form.charity_info,
      mission_statement: form.mission_statement || null,
      donation_amount_information: form.donation_amount_information || null,
      rules: form.rules,
      draw_date: normalizedDrawDate,
      raffleLocation: form.raffleLocation,
      autoCheckDonation: form.autoCheckDonation ?? true,
      presented_by_name: form.presented_by_name || null,
      mobile_title: form.mobile_title || null,
      backgroundImage: form.backgroundImage || null,
      presented_by_image: form.presented_by_image || null,
    };
  };

  const ensureRaffleId = async (): Promise<string | null> => {
    if (raffleId) return raffleId;

    if (!validate()) {
      setSnackMessage('Complete the required raffle fields before uploading an image');
      return null;
    }

    try {
      const created = await createForm(createOrganizationId, buildFormPayload());
      setRaffleId(created.id);
      setIsCreateMode(false);
      setForm({
        ...created,
        draw_date: toRaffleDateTimeLocalValue(created.draw_date),
        autoCheckDonation: created.autoCheckDonation ?? true,
      });
      navigation.setOptions({ title: 'Edit Raffle' });
      return created.id;
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create raffle');
      return null;
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      setSnackMessage('Please fix the errors above');
      return;
    }

    const formData = buildFormPayload();

    setIsSaving(true);
    try {
      let activeId = raffleId;
      let createdNew = false;

      if (activeId) {
        await updateForm({
          id: activeId,
          ...formData,
        });
      } else {
        const created = await createForm(createOrganizationId, formData);
        activeId = created.id;
        createdNew = true;
        setRaffleId(created.id);
        setIsCreateMode(false);
        setForm({
          ...created,
          draw_date: toRaffleDateTimeLocalValue(created.draw_date),
          autoCheckDonation: created.autoCheckDonation ?? true,
        });
        setReturnToDashboardOnDismiss(true);
      }

      // Custom domain on submit — same as web (super_admin)
      if (isSuperAdmin && activeId) {
        const submittedDomain = normalizeDomainInput(customDomainInput);
        if (submittedDomain !== savedCustomDomain) {
          try {
            const domainResult = await customDomainApi.set(
              activeId,
              submittedDomain || null,
            );
            setSavedCustomDomain(domainResult.custom_domain ?? '');
            setCustomDomainInput(domainResult.custom_domain ?? '');
            setDomainStatus(domainResult.domainStatus);
            setForm((prev) => ({
              ...prev,
              custom_domain: domainResult.custom_domain,
            }));
          } catch (domainErr: any) {
            Alert.alert(
              'Domain Error',
              domainErr.message || 'Raffle saved, but custom domain failed',
            );
            setIsSaving(false);
            return;
          }
        }
      }

      setSnackMessage(
        createdNew ? 'Raffle created successfully!' : 'Raffle saved successfully!',
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDomain = async () => {
    const nextDomain = normalizeDomainInput(customDomainInput);
    if (!nextDomain) {
      Alert.alert('Domain required', 'Enter a domain before adding.');
      return;
    }
    if (!DOMAIN_PATTERN.test(nextDomain)) {
      Alert.alert('Invalid domain', 'Enter a valid domain like fiu5050.com');
      return;
    }
    if (nextDomain === savedCustomDomain) {
      setSnackMessage('Domain already added — use Refresh status to check DNS');
      return;
    }

    const activeId = await ensureRaffleId();
    if (!activeId) return;

    setIsAddingDomain(true);
    try {
      const result = await customDomainApi.set(activeId, nextDomain);
      setCustomDomainInput(nextDomain);
      setSavedCustomDomain(nextDomain);
      setDomainStatus(result.domainStatus);
      setForm((prev) => ({ ...prev, custom_domain: nextDomain }));
      setSnackMessage('Domain added — copy the DNS records below to your registrar');
    } catch (err: any) {
      Alert.alert('Domain Error', err.message || 'Failed to add domain');
    } finally {
      setIsAddingDomain(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!savedCustomDomain || !raffleId) return;
    setIsDeletingDomain(true);
    try {
      await customDomainApi.set(raffleId, null);
      setCustomDomainInput('');
      setSavedCustomDomain('');
      setDomainStatus(null);
      setForm((prev) => ({ ...prev, custom_domain: null }));
      setSnackMessage('Custom domain removed');
    } catch (err: any) {
      Alert.alert('Domain Error', err.message || 'Failed to remove domain');
    } finally {
      setIsDeletingDomain(false);
    }
  };

  const handleRefreshDomainStatus = async () => {
    const domain = savedCustomDomain || normalizeDomainInput(customDomainInput);
    if (!domain) return;
    setIsRefreshingDomain(true);
    try {
      const status = await customDomainApi.status(domain);
      setDomainStatus(status);
    } catch (err: any) {
      Alert.alert('Domain Error', err.message || 'Failed to load domain status');
    } finally {
      setIsRefreshingDomain(false);
    }
  };

  const handleImageUpload = async () => {
    const activeRaffleId = await ensureRaffleId();
    if (!activeRaffleId) return;

    const picked = await pickImage();
    if (!picked) return;

    const storedPath = await uploadImage(picked.uri, {
      raffleId: activeRaffleId,
      isBackground: true,
      mimeType: picked.mimeType,
    });
    if (!storedPath) return;

    try {
      await updateForm({
        id: activeRaffleId,
        backgroundImage: storedPath,
      });
      setForm((prev) => ({ ...prev, backgroundImage: storedPath }));
      setSnackMessage('Image uploaded!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Image uploaded but failed to save on the raffle');
    }
  };

  const handlePresenterImageUpload = async () => {
    const activeRaffleId = await ensureRaffleId();
    if (!activeRaffleId) return;

    const picked = await pickImage();
    if (!picked) return;

    const storedPath = await uploadImage(picked.uri, {
      raffleId: activeRaffleId,
      isBackground: false,
      subfolder: 'presented-by',
      mimeType: picked.mimeType,
    });
    if (!storedPath) return;

    try {
      await updateForm({
        id: activeRaffleId,
        presented_by_image: storedPath,
      });
      setForm((prev) => ({ ...prev, presented_by_image: storedPath }));
      setSnackMessage('Presenter logo uploaded!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Logo uploaded but failed to save on the raffle');
    }
  };

  const handleRemovePresenterImage = async () => {
    if (!raffleId) return;
    try {
      await updateForm({
        id: raffleId,
        presented_by_image: null,
      });
      setForm((prev) => ({ ...prev, presented_by_image: null }));
      setSnackMessage('Presenter logo removed');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to remove logo');
    }
  };

  // Free ticket link — same as web
  const handleCopyFreeTicketLink = async () => {
    if (!raffleId) return;
    const link = `${API_BASE_URL}/ticket/free/${raffleId}`;
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
    if (!raffleId) return;
    if (form.stripeAccount) {
      setSnackMessage('Stripe account is already linked');
      return;
    }
    setIsGeneratingSecureLink(true);
    try {
      const uniqueRecord = await secureLinkApi.createUniqueRecord(raffleId);
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
    if (!raffleId) return;
    if (!stripeAccount?.id) {
      setSnackMessage('No Stripe account found');
      return;
    }
    setIsRefreshingStripe(true);
    try {
      const result = await stripeApi.refreshStripeAccountStatus(stripeAccount.id, raffleId);
      setSnackMessage(
        result.charges_enabled
          ? 'Stripe account linked successfully!'
          : 'Account not yet fully linked',
      );
      loadRaffle(raffleId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to refresh status');
    } finally {
      setIsRefreshingStripe(false);
    }
  };

  const handleSnackDismiss = () => {
    const shouldReturn = returnToDashboardOnDismiss;
    setSnackMessage('');
    setReturnToDashboardOnDismiss(false);
    if (shouldReturn) {
      navigation.navigate('AdminTabs' as never);
    }
  };

  if (!isCreateMode && isLoading && !currentForm) {
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
        {/* Header — title, then Download Tickets CSV below (no Preview on edit) */}
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Raffle Information</Text>
          {!isCreateMode && raffleId ? (
            <DownloadTicketsCsvButton
              raffleId={raffleId}
              raffleTitle={form.title}
            />
          ) : null}
        </View>

        {/* Stripe Connect Section — hidden for org_admin (managed at org level) */}
        {!isOrgAdmin && !isCreateMode && (
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
        )}

        {isSuperAdmin && !isCreateMode && raffleId ? (
          <RaffleOrganizationAssignCard
            raffleId={raffleId}
            form={form as DonationForm}
            onUpdated={(patch) => {
              setForm((prev) => ({ ...prev, ...patch }));
              if (currentForm) {
                setCurrentForm({ ...currentForm, ...patch } as DonationForm);
              }
            }}
          />
        ) : null}

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

            {/* Custom Domain — super_admin only (same as web / edge auth) */}
            {isSuperAdmin ? (
              <>
                <TextInput
                  mode="outlined"
                  label="Custom Domain"
                  value={customDomainInput}
                  onChangeText={(text) =>
                    setCustomDomainInput(normalizeDomainInput(text))
                  }
                  placeholder="e.g. fiu5050.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  textColor={COLORS.foreground}
                />
                <Text style={styles.helperText}>
                  Click Add Domain to register on Chaffle and show DNS records. Copy them to your registrar.
                </Text>
                <View style={styles.domainActions}>
                  <Button
                    mode="contained"
                    onPress={handleAddDomain}
                    loading={isAddingDomain}
                    disabled={
                      isAddingDomain ||
                      isDeletingDomain ||
                      isSaving ||
                      isUploading
                    }
                    buttonColor={COLORS.primary}
                    style={styles.domainActionButton}
                  >
                    {isAddingDomain ? 'Adding…' : 'Add Domain'}
                  </Button>
                  {savedCustomDomain ? (
                    <Button
                      mode="outlined"
                      onPress={handleRemoveDomain}
                      loading={isDeletingDomain}
                      disabled={
                        isDeletingDomain ||
                        isAddingDomain ||
                        isSaving ||
                        isUploading
                      }
                      textColor={COLORS.error}
                      style={styles.removeLogoButton}
                    >
                      {isDeletingDomain ? 'Removing…' : 'Delete Domain'}
                    </Button>
                  ) : null}
                </View>
                {savedCustomDomain ? (
                  <View style={styles.dnsPanel}>
                    <View style={styles.dnsPanelHeader}>
                      <View style={styles.dnsPanelCopy}>
                        <Text style={styles.dnsPanelTitle}>Domain configuration</Text>
                        <Text style={styles.dnsPanelDomain}>{savedCustomDomain}</Text>
                      </View>
                      {domainStatus ? (
                        <View
                          style={[
                            styles.dnsBadge,
                            domainStatus.isLive
                              ? styles.dnsBadgeLive
                              : styles.dnsBadgePending,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dnsBadgeText,
                              domainStatus.isLive
                                ? styles.dnsBadgeTextLive
                                : styles.dnsBadgeTextPending,
                            ]}
                          >
                            {domainStatus.statusLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {domainStatus?.statusDescription ? (
                      <Text style={styles.helperText}>
                        {domainStatus.statusDescription}
                      </Text>
                    ) : null}
                    <Button
                      mode="outlined"
                      onPress={handleRefreshDomainStatus}
                      loading={isRefreshingDomain}
                      disabled={isRefreshingDomain}
                      icon="refresh"
                      style={styles.domainActionButton}
                      textColor={COLORS.foreground}
                    >
                      {isRefreshingDomain ? 'Checking…' : 'Refresh status'}
                    </Button>
                    {domainStatus?.records?.length ? (
                      <View style={styles.dnsRecords}>
                        <Text style={styles.switchLabel}>
                          Add these records at your registrar
                        </Text>
                        {domainStatus.records.map((record, i) => (
                          <View
                            key={`${record.type}-${record.name}-${i}`}
                            style={styles.dnsRecordRow}
                          >
                            <View style={styles.dnsRecordCopy}>
                              <Text style={styles.dnsRecordMeta}>
                                {record.type} · {record.name}
                              </Text>
                              <Text style={styles.dnsRecordValue} selectable>
                                {record.value}
                              </Text>
                              {record.note ? (
                                <Text style={styles.helperText}>{record.note}</Text>
                              ) : null}
                            </View>
                            <Button
                              mode="text"
                              compact
                              icon="content-copy"
                              onPress={async () => {
                                await Clipboard.setStringAsync(record.value);
                                setSnackMessage(`${record.type} record copied`);
                              }}
                              textColor={COLORS.primary}
                            >
                              Copy
                            </Button>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}

            {/* Draw Date & Time (EST) — native picker, same Eastern wall-clock as web datetime-local */}
            <DrawDateTimeField
              value={form.draw_date}
              error={!!errors.draw_date}
              onChange={(next) => {
                setForm((prev) => ({ ...prev, draw_date: next }));
                if (errors.draw_date) setErrors((e) => ({ ...e, draw_date: '' }));
              }}
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

            {/* Default Platform Fee — matches web autoCheckDonation */}
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>Default Platform Fee to Checked</Text>
                <Text style={styles.helperText}>
                  When enabled, the “Help support our platform by donating 10%” checkbox will be checked by default during checkout.
                </Text>
              </View>
              <Switch
                value={form.autoCheckDonation ?? true}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, autoCheckDonation: value }))
                }
                color={COLORS.primary}
              />
            </View>

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

            {/* Description / Mission Statement */}
            <TextInput
              mode="outlined"
              label="Description / Mission Statement"
              value={form.mission_statement || ''}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, mission_statement: text }))
              }
              multiline
              numberOfLines={4}
              style={[styles.input, styles.multilineInput]}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
            />
            <Text style={styles.helperText}>
              Shows on the white-labeled custom domain page as the organization description.
            </Text>

            <Divider style={styles.sectionDivider} />

            {/* Game Information & Draw Details */}
            <TextInput
              mode="outlined"
              label="Game Information & Draw Details"
              value={form.donation_amount_information || ''}
              onChangeText={(text) =>
                setForm((prev) => ({
                  ...prev,
                  donation_amount_information: text,
                }))
              }
              multiline
              numberOfLines={4}
              style={[styles.input, styles.multilineInput]}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
            />
            <Text style={styles.helperText}>
              Shows on the white-labeled custom domain page as game info and draw date details.
            </Text>

            <Divider style={styles.sectionDivider} />

            {!isCreateMode && raffleId ? (
              <>
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
              </>
            ) : null}

            {/* Presented By — Name */}
            <TextInput
              mode="outlined"
              label="Presented By — Name"
              value={form.presented_by_name || ''}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, presented_by_name: text }))
              }
              placeholder="e.g. Bojangles"
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
            />
            <Text style={styles.helperText}>
              Optional. If set, shows a “PRESENTED BY:” line on the raffle page with this name and/or the presenter logo.
            </Text>

            <Divider style={styles.sectionDivider} />

            {/* Mobile Title */}
            <TextInput
              mode="outlined"
              label="Mobile Title"
              value={form.mobile_title || ''}
              onChangeText={(text) =>
                setForm((prev) => ({ ...prev, mobile_title: text }))
              }
              placeholder="e.g. PIRATES CLUB"
              style={styles.input}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
            />
            <Text style={styles.helperText}>
              Optional. If set, this text shows above the 50/50 RAFFLE text only on mobile devices.
            </Text>

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
            <Text style={styles.cardTitle}>Organization Logo</Text>
            {resolveImageUrl(form.backgroundImage) ? (
              <RaffleCoverImage
                imagePath={form.backgroundImage}
                style={styles.previewImage}
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
              disabled={isUploading || isSaving}
              icon="camera"
              style={styles.uploadButton}
            >
              {form.backgroundImage ? 'Change Image' : 'Upload Image'}
            </Button>
          </Card.Content>
        </Card>

        {/* Presented By — Logo — matches web */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Presented By — Logo</Text>
            <Text style={[styles.helperText, styles.helperTextWarn]}>
              Optional. Upload a presenter/sponsor logo (PNG under 1 MB recommended).
            </Text>
            {resolveImageUrl(form.presented_by_image) ? (
              <>
                <RaffleCoverImage
                  imagePath={form.presented_by_image}
                  style={styles.presenterPreview}
                />
                <View style={styles.presenterActions}>
                  <Button
                    mode="contained-tonal"
                    onPress={handlePresenterImageUpload}
                    loading={isUploading}
                    disabled={isUploading || isSaving}
                    icon="camera"
                    style={styles.uploadButton}
                  >
                    Change Logo
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={handleRemovePresenterImage}
                    disabled={isUploading || isSaving}
                    textColor={COLORS.error}
                    style={styles.removeLogoButton}
                  >
                    Remove
                  </Button>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.imagePlaceholder, styles.presenterPlaceholder]}>
                  <Icon source="image-plus" size={40} color={COLORS.textLight} />
                  <Text style={styles.imagePlaceholderText}>No logo uploaded</Text>
                </View>
                <Button
                  mode="contained-tonal"
                  onPress={handlePresenterImageUpload}
                  loading={isUploading}
                  disabled={isUploading || isSaving}
                  icon="camera"
                  style={styles.uploadButton}
                >
                  Upload Logo
                </Button>
              </>
            )}
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
        onDismiss={handleSnackDismiss}
        duration={returnToDashboardOnDismiss ? 2000 : 3000}
        action={{
          label: 'OK',
          onPress: handleSnackDismiss,
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
    marginBottom: 16,
    gap: 12,
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
  helperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    marginTop: 4,
    lineHeight: 17,
  },
  helperTextWarn: {
    color: COLORS.error,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  switchCopy: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 4,
  },
  freeTicketButton: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  presenterPreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceMuted,
  },
  presenterPlaceholder: {
    height: 140,
  },
  presenterActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  removeLogoButton: {
    borderRadius: 8,
    borderColor: COLORS.error,
  },
  domainActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  domainActionButton: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  dnsPanel: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceMuted,
    gap: 8,
  },
  dnsPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  dnsPanelCopy: {
    flex: 1,
  },
  dnsPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  dnsPanelDomain: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dnsBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dnsBadgeLive: {
    backgroundColor: '#D1FAE5',
  },
  dnsBadgePending: {
    backgroundColor: '#FEF3C7',
  },
  dnsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dnsBadgeTextLive: {
    color: '#065F46',
  },
  dnsBadgeTextPending: {
    color: '#92400E',
  },
  dnsRecords: {
    gap: 8,
    marginTop: 4,
  },
  dnsRecordRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
    backgroundColor: COLORS.surface,
  },
  dnsRecordCopy: {
    flex: 1,
  },
  dnsRecordMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  dnsRecordValue: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.foreground,
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
  imageHelperText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
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
