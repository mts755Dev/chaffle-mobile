import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Chip,
  FAB,
  Divider,
  IconButton,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../../constants';
import { RootStackParamList, TicketTotalByRaffle } from '../../../types';
import { useRaffleStore } from '../../../store/raffleStore';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { logout } = useAuthStore();
  const {
    forms,
    ticketTotals,
    completedRaffleIds,
    isLoading,
    error: storeError,
    fetchForms,
    fetchTicketTotals,
    fetchCompletedRaffleIds,
    createForm,
  } = useRaffleStore();

  const [refreshing, setRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [filterText, setFilterText] = useState('');

  // Filter forms by title
  const filteredForms = filterText.trim()
    ? forms.filter((f) =>
        (f.title || '').toLowerCase().includes(filterText.toLowerCase()),
      )
    : forms;

  // Load data from DB on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const loadData = async () => {
    await Promise.all([
      fetchForms(),
      fetchTicketTotals(),
      fetchCompletedRaffleIds(),
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateRaffle = async () => {
    setIsCreating(true);
    try {
      const newForm = await createForm();
      navigation.navigate('EditRaffle', { id: newForm.id });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create raffle');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          await logout();
          navigation.navigate('MainTabs');
        },
      },
    ]);
  };

  const getTicketTotal = (raffleId: string): TicketTotalByRaffle | undefined => {
    return ticketTotals.find((t) => t.donation_formId === raffleId);
  };

  const isCompleted = (raffleId: string): boolean => {
    return completedRaffleIds.includes(raffleId);
  };

  if (isLoading && forms.length === 0) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  return (
    <View style={styles.container}>
      {/* Top Actions */}
      <View style={styles.topActions}>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('AdminTickets')}
          icon="ticket"
          compact
          style={styles.topButton}
        >
          Tickets
        </Button>
        <Button
          mode="outlined"
          onPress={() => navigation.navigate('AdminWinners')}
          icon="trophy"
          compact
          style={styles.topButton}
        >
          Winners
        </Button>
        <Button
          mode="outlined"
          onPress={handleLogout}
          icon="logout"
          compact
          style={styles.topButton}
          textColor={COLORS.error}
        >
          Logout
        </Button>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Filter — matches web's title filter */}
        <TextInput
          mode="outlined"
          placeholder="Filter..."
          value={filterText}
          onChangeText={setFilterText}
          style={styles.filterInput}
          outlineColor={COLORS.border}
          activeOutlineColor={COLORS.primary}
          textColor={COLORS.foreground}
          placeholderTextColor={COLORS.textLight}
          dense
          left={<TextInput.Icon icon="magnify" color={COLORS.textLight} />}
          right={
            filterText ? (
              <TextInput.Icon icon="close" onPress={() => setFilterText('')} color={COLORS.textLight} />
            ) : undefined
          }
        />

        <Text style={styles.sectionTitle}>
          Raffles ({filteredForms.length})
        </Text>

        {storeError && (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text style={styles.errorTitle}>⚠️ Failed to load data</Text>
              <Text style={styles.errorText}>{storeError}</Text>
              <Text style={styles.errorHint}>
                This is likely a Supabase RLS issue. Make sure Row Level Security policies are configured to allow the anon role to read data.
              </Text>
              <Button
                mode="outlined"
                onPress={loadData}
                style={styles.retryButton}
                icon="refresh"
                compact
              >
                Retry
              </Button>
            </Card.Content>
          </Card>
        )}

        {filteredForms.length === 0 && !isLoading && !storeError && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No raffles yet. Create your first raffle!</Text>
          </View>
        )}

        {filteredForms.map((form) => {
          const total = getTicketTotal(form.id);
          const completed = isCompleted(form.id);
          const hasStripe = !!(form.stripeAccount as any)?.charges_enabled;

          return (
            <Card key={form.id} style={styles.raffleCard}>
              <TouchableOpacity
                onPress={() => navigation.navigate('PreviewRaffle', { id: form.id })}
                activeOpacity={0.7}
              >
                <Card.Content>
                  {/* Title + Status */}
                  <View style={styles.cardHeader}>
                    <Text style={styles.raffleTitle} numberOfLines={2}>
                      {form.title || 'Untitled Raffle'}
                    </Text>
                    {completed ? (
                      <Chip icon="check" style={styles.completedChip} textStyle={styles.completedText}>
                        Completed
                      </Chip>
                    ) : (
                      <Chip icon="clock" style={styles.activeChip} textStyle={styles.activeText}>
                        Active
                      </Chip>
                    )}
                  </View>

                  {/* Raffle ID */}
                  <Text style={styles.raffleId} numberOfLines={1} selectable>
                    ID: {form.id}
                  </Text>

                  <Divider style={styles.divider} />

                  {/* Total Amount + Tickets Sold + Actions */}
                  <View style={styles.statsRow}>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Total Amount</Text>
                      <Text style={styles.statValue}>
                        {formatCurrency(total?._sum.amount || 0)}
                      </Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>Tickets Sold</Text>
                      <Text style={styles.statValue}>
                        {total?._sum.quantity || 0}
                      </Text>
                    </View>
                    <View style={styles.statsActions}>
                      <IconButton
                        icon="eye"
                        iconColor={COLORS.foreground}
                        size={20}
                        onPress={() => navigation.navigate('PreviewRaffle', { id: form.id })}
                        style={styles.iconAction}
                      />
                      {hasStripe && !completed ? (
                        <IconButton
                          icon="credit-card"
                          iconColor={COLORS.primary}
                          size={20}
                          onPress={() => navigation.navigate('InPersonPayment', { id: form.id })}
                          style={styles.iconAction}
                        />
                      ) : hasStripe && completed ? (
                        <IconButton
                          icon="credit-card"
                          iconColor={COLORS.disabled}
                          size={20}
                          disabled
                          style={styles.iconAction}
                        />
                      ) : null}
                    </View>
                  </View>
                </Card.Content>
              </TouchableOpacity>
            </Card>
          );
        })}
      </ScrollView>

      <FAB
        icon="plus"
        label="Create Raffle"
        style={styles.fab}
        onPress={handleCreateRaffle}
        loading={isCreating}
        disabled={isCreating}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  topActions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topButton: {
    flex: 1,
    borderColor: COLORS.border,
  },
  filterInput: {
    backgroundColor: COLORS.white,
    marginBottom: 14,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  raffleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 20,
    elevation: 2,
    paddingTop: 8,
    paddingBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  raffleTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.foreground,
    flex: 1,
    marginRight: 8,
  },
  raffleId: {
    fontSize: 12,
    color: COLORS.textLight,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  completedChip: {
    backgroundColor: '#e8f5e9',
  },
  completedText: {
    color: COLORS.success,
    fontSize: 11,
  },
  activeChip: {
    backgroundColor: '#fff3e0',
  },
  activeText: {
    color: COLORS.warning,
    fontSize: 11,
  },
  divider: {
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.foreground,
    marginTop: 2,
  },
  statsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  iconAction: {
    margin: 0,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: COLORS.primary,
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    marginBottom: 4,
  },
  errorHint: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderColor: '#DC2626',
  },
});
