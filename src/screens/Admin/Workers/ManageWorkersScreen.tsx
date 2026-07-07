import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  IconButton,
  Menu,
} from 'react-native-paper';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { COLORS, PASSWORD_REGEX } from '../../../constants';
import { RootStackParamList, Worker, OrgApprovalStatus } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useWorkerStore } from '../../../store/workerStore';
import { raffleApi } from '../../../services/api/raffleApi';
import { formatDate } from '../../../utils';
import { formatOrganizationLabel } from '../../../utils/orgDisplay';
import {
  findWorkerWithEmail,
  workerDuplicateEmailMessage,
} from '../../../utils/workerEmail';
import LoadingScreen from '../../../components/LoadingScreen';
import * as Clipboard from 'expo-clipboard';

type ManageWorkersRouteProp = RouteProp<RootStackParamList, 'ManageWorkers'>;

const DURATION_OPTIONS = [
  { label: '4 hours', value: 4 },
  { label: '8 hours', value: 8 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
  { label: '72 hours', value: 72 },
];

export default function ManageWorkersScreen() {
  const route = useRoute<ManageWorkersRouteProp>();
  const {
    raffleId,
    organizationId: routeOrganizationId,
    raffleTitle: routeRaffleTitle,
    organizationName: routeOrganizationName,
  } = route.params;

  const { role, organizationId: authOrganizationId, createWorker } = useAuthStore();
  const isSuperAdmin = role === 'super_admin';
  const isOrgAdmin = role === 'org_admin';

  const {
    workers,
    isLoading: storeLoading,
    error: storeError,
    fetchWorkers,
    removeWorker,
    clearError,
  } = useWorkerStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [durationHours, setDurationHours] = useState(8);
  const [menuVisible, setMenuVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [raffleOrganizationId, setRaffleOrganizationId] = useState<string | null | undefined>(
    routeOrganizationId,
  );
  const [raffleTitle, setRaffleTitle] = useState(routeRaffleTitle ?? '');
  const [organizationName, setOrganizationName] = useState(routeOrganizationName ?? '');
  const [organizationApprovalStatus, setOrganizationApprovalStatus] =
    useState<OrgApprovalStatus | null>(null);
  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Record<string, boolean>>({});

  const effectiveOrganizationId = isSuperAdmin
    ? raffleOrganizationId ?? null
    : authOrganizationId ?? raffleOrganizationId ?? null;

  const loadRaffleContext = useCallback(async () => {
    const form = await raffleApi.getDonationFormById(raffleId);
    if (!form) return;

    setRaffleOrganizationId(form.organization_id ?? null);
    setRaffleTitle(form.title || routeRaffleTitle || 'Untitled Raffle');
    setOrganizationName(form.organization_name ?? '');
    setOrganizationApprovalStatus(form.organization_approval_status ?? null);
  }, [raffleId, routeRaffleTitle]);

  useFocusEffect(
    useCallback(() => {
      clearError();
      void loadRaffleContext();
      fetchWorkers(raffleId);
    }, [raffleId, loadRaffleContext, fetchWorkers, clearError]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadRaffleContext(), fetchWorkers(raffleId)]);
    setRefreshing(false);
  };

  const togglePasswordVisibility = (workerId: string) => {
    setVisiblePasswordIds((current) => ({
      ...current,
      [workerId]: !current[workerId],
    }));
  };

  const copyPassword = async (worker: Worker) => {
    if (!worker.login_password) {
      Alert.alert('Password unavailable', 'This worker was created before passwords were saved.');
      return;
    }
    await Clipboard.setStringAsync(worker.login_password);
    Alert.alert('Copied', 'Worker password copied to clipboard.');
  };

  const renderPasswordLabel = (worker: Worker) => {
    if (!worker.login_password) {
      return 'Password: Not saved';
    }
    return visiblePasswordIds[worker.id]
      ? `Password: ${worker.login_password}`
      : `Password: ${'•'.repeat(Math.min(worker.login_password.length, 12))}`;
  };

  const handleCreate = async () => {
    setFormError(null);
    clearError();

    if (!email.trim()) {
      setFormError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Invalid email address');
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setFormError('Password must contain: uppercase, lowercase, number, special character, min 8 chars');
      return;
    }
    if (isOrgAdmin && !effectiveOrganizationId) {
      setFormError('This raffle is not linked to your organization');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const duplicateInList = findWorkerWithEmail(workers, normalizedEmail);
    if (duplicateInList) {
      setFormError(workerDuplicateEmailMessage(duplicateInList.raffle_id, raffleId));
      return;
    }

    setIsCreating(true);
    try {
      await createWorker(
        email.trim(),
        password,
        raffleId,
        effectiveOrganizationId,
        durationHours,
      );
      await fetchWorkers(raffleId);
      setEmail('');
      setPassword('');
      setDurationHours(8);
      Alert.alert('Success', 'Worker account created successfully');
    } catch (err: any) {
      setFormError(err.message || 'Failed to create worker');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = (worker: Worker) => {
    Alert.alert(
      'Terminate Worker',
      `Remove ${worker.email}? They will no longer be able to access the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeWorker(worker.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to terminate worker');
            }
          },
        },
      ],
    );
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const selectedDuration = DURATION_OPTIONS.find((d) => d.value === durationHours);
  const orgDisplayName = formatOrganizationLabel(
    effectiveOrganizationId ? organizationName : null,
    organizationApprovalStatus,
  );

  if (storeLoading && workers.length === 0 && !isCreating) {
    return <LoadingScreen message="Loading workers..." />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlatList
        data={workers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const expired = isExpired(item.expires_at);

          return (
            <Card style={styles.workerCard}>
              <Card.Content>
                <View style={styles.workerRow}>
                  <View style={styles.workerInfo}>
                    <Text style={styles.workerEmail}>{item.email}</Text>
                    <View style={styles.workerMeta}>
                      <Icon source="lock-outline" size={13} color={COLORS.textLight} />
                      <Text style={styles.workerMetaText} selectable={!!item.login_password}>
                        {renderPasswordLabel(item)}
                      </Text>
                      {item.login_password ? (
                        <>
                          <IconButton
                            icon={visiblePasswordIds[item.id] ? 'eye-off-outline' : 'eye-outline'}
                            iconColor={COLORS.textSecondary}
                            size={16}
                            onPress={() => togglePasswordVisibility(item.id)}
                            style={styles.inlineIconBtn}
                          />
                          <IconButton
                            icon="content-copy"
                            iconColor={COLORS.textSecondary}
                            size={16}
                            onPress={() => void copyPassword(item)}
                            style={styles.inlineIconBtn}
                          />
                        </>
                      ) : null}
                    </View>
                    <View style={styles.workerMeta}>
                      <Icon source="clock-outline" size={13} color={COLORS.textLight} />
                      <Text style={styles.workerMetaText}>
                        Expires: {formatDate(item.expires_at, 'MMM D, YYYY h:mm A')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.workerActions}>
                    {expired ? (
                      <Chip style={styles.expiredChip} textStyle={styles.expiredChipText} compact>
                        Expired
                      </Chip>
                    ) : (
                      <Chip style={styles.activeChip} textStyle={styles.activeChipText} compact>
                        Active
                      </Chip>
                    )}
                    <IconButton
                      icon="delete-outline"
                      iconColor={COLORS.error}
                      size={20}
                      onPress={() => handleDelete(item)}
                      style={styles.deleteBtn}
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
            <Card style={styles.contextCard}>
              <Card.Content>
                <Text style={styles.contextTitle}>{raffleTitle || 'Raffle Workers'}</Text>
                {isSuperAdmin ? (
                  <Text style={styles.contextMeta}>Organization: {orgDisplayName}</Text>
                ) : null}
              </Card.Content>
            </Card>

            <Card style={styles.formCard}>
              <Card.Content>
                <Text style={styles.formTitle}>Add Worker</Text>
                <Divider style={styles.formDivider} />

                <TextInput
                  mode="outlined"
                  label="Worker Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="email" color={COLORS.textSecondary} />}
                />

                <TextInput
                  mode="outlined"
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="lock" color={COLORS.textSecondary} />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      color={COLORS.textSecondary}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                />

                <Menu
                  visible={menuVisible}
                  onDismiss={() => setMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setMenuVisible(true)}
                      icon="clock-outline"
                      style={styles.durationBtn}
                      contentStyle={styles.durationBtnContent}
                      textColor={COLORS.foreground}
                    >
                      Duration: {selectedDuration?.label}
                    </Button>
                  }
                >
                  {DURATION_OPTIONS.map((opt) => (
                    <Menu.Item
                      key={opt.value}
                      onPress={() => {
                        setDurationHours(opt.value);
                        setMenuVisible(false);
                      }}
                      title={opt.label}
                      leadingIcon={durationHours === opt.value ? 'check' : undefined}
                    />
                  ))}
                </Menu>

                {formError ? (
                  <Text style={styles.errorText}>{formError}</Text>
                ) : null}
                {storeError ? (
                  <Text style={styles.errorText}>{storeError}</Text>
                ) : null}

                <Button
                  mode="contained"
                  onPress={handleCreate}
                  loading={isCreating}
                  disabled={isCreating}
                  style={styles.createBtn}
                  icon="account-plus"
                >
                  {isCreating ? 'Creating...' : 'Create Worker'}
                </Button>
              </Card.Content>
            </Card>

            <Text style={styles.sectionTitle}>
              Workers ({workers.length})
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="account-group-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No workers yet</Text>
          </View>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 16,
    paddingBottom: 24,
  },
  contextCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contextTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  contextMeta: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    elevation: 2,
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  formDivider: {
    marginVertical: 12,
  },
  input: {
    backgroundColor: COLORS.surface,
    marginBottom: 12,
  },
  durationBtn: {
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 10,
  },
  durationBtnContent: {
    justifyContent: 'flex-start',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginBottom: 8,
  },
  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 12,
  },
  workerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    marginBottom: 10,
    elevation: 1,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workerInfo: {
    flex: 1,
    marginRight: 8,
  },
  workerEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  workerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  workerMetaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  inlineIconBtn: {
    margin: 0,
    width: 28,
    height: 28,
  },
  workerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeChip: {
    backgroundColor: '#DCFCE7',
  },
  activeChipText: {
    fontSize: 11,
    color: COLORS.success,
  },
  expiredChip: {
    backgroundColor: '#FEE2E2',
  },
  expiredChipText: {
    fontSize: 11,
    color: COLORS.error,
  },
  deleteBtn: {
    margin: 0,
  },
  empty: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});
