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
import { RootStackParamList, Worker } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useWorkerStore } from '../../../store/workerStore';
import { formatDate } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';

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
  const { raffleId } = route.params;

  const { organizationId, createWorker } = useAuthStore();
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

  useFocusEffect(
    useCallback(() => {
      fetchWorkers(raffleId);
    }, [raffleId]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWorkers(raffleId);
    setRefreshing(false);
  };

  const handleCreate = async () => {
    setFormError(null);

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
    if (!organizationId) {
      setFormError('Organization not found');
      return;
    }

    setIsCreating(true);
    try {
      await createWorker(email.trim(), password, raffleId, organizationId, durationHours);
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
      'Delete Worker',
      `Remove ${worker.email}? They will no longer be able to access the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeWorker(worker.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete worker');
            }
          },
        },
      ],
    );
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const selectedDuration = DURATION_OPTIONS.find((d) => d.value === durationHours);

  const renderWorker = ({ item }: { item: Worker }) => {
    const expired = isExpired(item.expires_at);

    return (
      <Card style={styles.workerCard}>
        <Card.Content>
          <View style={styles.workerRow}>
            <View style={styles.workerInfo}>
              <Text style={styles.workerEmail}>{item.email}</Text>
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
  };

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
        renderItem={renderWorker}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
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
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="email-outline" />}
                  dense
                />

                <TextInput
                  mode="outlined"
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.primary}
                  left={<TextInput.Icon icon="lock-outline" />}
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                  dense
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

                {(formError || storeError) && (
                  <Text style={styles.errorText}>{formError || storeError}</Text>
                )}

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
    backgroundColor: COLORS.white,
    marginBottom: 10,
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
    gap: 4,
    marginTop: 4,
  },
  workerMetaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
