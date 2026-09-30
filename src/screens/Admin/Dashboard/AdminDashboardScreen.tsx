import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Platform,
  AppState,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Icon,
  Dialog,
  Portal,
  Paragraph,
} from 'react-native-paper';
import TextInput from '../../../components/AppTextInput';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { COLORS } from '../../../constants';
import { RootStackParamList, TicketTotalByRaffle } from '../../../types';
import { useRaffleStore } from '../../../store/raffleStore';
import { useAuthStore } from '../../../store/authStore';
import { formatCurrency, formatNumber } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';
import { subscribePaidTicketChanges } from '../../../services/ticketTotalsLive';
import TapToPayIcon from '../../../components/TapToPayIcon';
import {
  canSetupTapToPayOnDevice,
  canUseInPersonPayment,
  isTapToPayPaymentReady,
  showOrgStripeRequiredAlert,
  showRaffleStripeRequiredAlert,
  showTapToPayAdminRequiredAlert,
  usesOrganizationStripe,
} from '../../../utils/tapToPayAccess';
import {
  canOrgCreateRaffles,
  canOrgConnectStripe,
  getOrgApprovalBannerMessage,
} from '../../../utils/orgAccess';
import { formatOrganizationLabel } from '../../../utils/orgDisplay';
import DownloadTicketsCsvButton from '../../../components/DownloadTicketsCsvButton';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    isAdmin,
    canManageTapToPay,
    role,
    organizationId,
    organizationName,
    orgStripeConnected,
    orgStripeAccountId,
    orgApprovalStatus,
    connectStripe,
    refreshStripeStatus,
    refreshOrgState,
  } = useAuthStore();
  const {
    forms,
    ticketTotals,
    completedRaffleIds,
    isLoading,
    isRefreshing,
    error: storeError,
    fetchForms,
    fetchTicketTotals,
    fetchCompletedRaffleIds,
    deleteForm,
    updateForm,
  } = useRaffleStore();

  const isOrgAdmin = role === 'org_admin';
  const isSuperAdmin = role === 'super_admin';
  const canCreateRaffles = canOrgCreateRaffles(role, orgApprovalStatus);
  const canConnectStripe = canOrgConnectStripe(role, orgApprovalStatus);
  const approvalBannerMessage = isOrgAdmin
    ? getOrgApprovalBannerMessage(orgApprovalStatus)
    : null;

  const [refreshing, setRefreshing] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>(
    'all',
  );
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isRefreshingStripe, setIsRefreshingStripe] = useState(false);
  const [expandedRaffleId, setExpandedRaffleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingLocationId, setTogglingLocationId] = useState<string | null>(
    null,
  );

  const showTapToPayFeatures =
    Platform.OS === 'ios' && canSetupTapToPayOnDevice(isAdmin, role);

  const isCompleted = (raffleId: string): boolean => {
    return completedRaffleIds.includes(raffleId);
  };

  // Status comes from DB via winner tickets (completed) vs none (active).
  const filteredForms = forms.filter((f) => {
    const completed = isCompleted(f.id);
    if (statusFilter === 'active' && completed) return false;
    if (statusFilter === 'completed' && !completed) return false;
    const query = filterText.trim().toLowerCase();
    if (!query) return true;
    return (f.title || '').toLowerCase().includes(query);
  });

  const loadData = useCallback(async () => {
    if (role === null) return;

    console.log('[AdminDashboard.loadData]', { role, organizationId, isSuperAdmin });

    // Anyone who is not a scoped org/worker account gets the full platform list.
    const orgScoped = role === 'org_admin' || role === 'worker';
    if (!orgScoped || isSuperAdmin) {
      await fetchForms(undefined);
      const loaded = useRaffleStore.getState().forms;
      console.log('[AdminDashboard] forms after fetch', loaded.length);
      const raffleIds = loaded.map((f) => f.id);
      await Promise.all([
        fetchTicketTotals(undefined, raffleIds.length > 0 ? raffleIds : undefined),
        fetchCompletedRaffleIds(raffleIds.length > 0 ? raffleIds : undefined),
      ]);
      return;
    }

    if (role === 'org_admin' && !organizationId) {
      await refreshOrgState();
      const orgId = useAuthStore.getState().organizationId;
      if (!orgId) {
        await fetchForms(undefined);
        await Promise.all([
          fetchTicketTotals(undefined, undefined),
          fetchCompletedRaffleIds(undefined),
        ]);
        return;
      }
      await fetchForms(orgId);
      console.log('[AdminDashboard] forms after org fetch', useRaffleStore.getState().forms.length, {
        orgId,
      });
      const { forms: loadedForms } = useRaffleStore.getState();
      const raffleIds = loadedForms.map((f) => f.id);
      await Promise.all([
        fetchTicketTotals(undefined, raffleIds),
        fetchCompletedRaffleIds(raffleIds),
      ]);
      return;
    }

    if (role === 'org_admin') {
      await refreshOrgState();
    }

    const orgId =
      role === 'org_admin'
        ? useAuthStore.getState().organizationId ?? organizationId
        : undefined;
    await fetchForms(orgId);
    console.log('[AdminDashboard] forms after org fetch', useRaffleStore.getState().forms.length, {
      orgId,
    });
    const { forms: loadedForms } = useRaffleStore.getState();
    const raffleIds =
      role === 'org_admin' ? loadedForms.map((f) => f.id) : undefined;
    await Promise.all([
      fetchTicketTotals(undefined, raffleIds),
      fetchCompletedRaffleIds(raffleIds),
    ]);
  }, [
    role,
    isSuperAdmin,
    organizationId,
    refreshOrgState,
    fetchForms,
    fetchTicketTotals,
    fetchCompletedRaffleIds,
  ]);

  const refreshTicketTotals = useCallback(async () => {
    if (role === null) return;
    if (isSuperAdmin) {
      const raffleIds = useRaffleStore.getState().forms.map((f) => f.id);
      await fetchTicketTotals(
        undefined,
        raffleIds.length > 0 ? raffleIds : undefined,
      );
      return;
    }
    if (role === 'org_admin' && !organizationId) return;

    const { forms: loadedForms } = useRaffleStore.getState();
    const raffleIds =
      role === 'org_admin' ? loadedForms.map((f) => f.id) : undefined;
    await fetchTicketTotals(undefined, raffleIds);
  }, [role, isSuperAdmin, organizationId, fetchTicketTotals]);

  // Full reload on focus; live pot / ticket counts via Supabase realtime
  useFocusEffect(
    useCallback(() => {
      void loadData();

      const unsubscribe = subscribePaidTicketChanges(() => {
        void refreshTicketTotals();
      });

      const appStateSub = AppState.addEventListener('change', (next) => {
        if (next === 'active') {
          void loadData();
        }
      });

      return () => {
        unsubscribe();
        appStateSub.remove();
      };
    }, [loadData, refreshTicketTotals]),
  );

  const openTapToPaySettings = () => {
    if (isSuperAdmin) {
      navigation.navigate('AdminTapToPay', {});
      return;
    }
    navigation.navigate('AdminTapToPay', {
      stripeAccountId: orgStripeAccountId ?? undefined,
      merchantDisplayName: organizationName ?? undefined,
      raffleOrganizationId: organizationId,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateRaffle = () => {
    if (!canCreateRaffles) {
      Alert.alert(
        'Approval required',
        approvalBannerMessage ||
          'Your organization must be approved before you can create raffles.',
      );
      return;
    }

    navigation.navigate('EditRaffle', {
      organizationId: isOrgAdmin ? organizationId : undefined,
    });
  };

  const confirmDeleteRaffle = async () => {
    if (!deleteTarget) return;
    const { id, title } = deleteTarget;
    setDeleteTarget(null);
    setIsDeleting(true);
    try {
      await deleteForm(id);
      if (expandedRaffleId === id) setExpandedRaffleId(null);
      Alert.alert('Deleted', `"${title || 'Untitled Raffle'}" was deleted.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete raffle');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleLocationCheck = async (form: {
    id: string;
    locationCheckEnabled?: boolean | null;
  }) => {
    if (togglingLocationId) return;
    const next = !(form.locationCheckEnabled !== false);
    setTogglingLocationId(form.id);
    try {
      await updateForm({ id: form.id, locationCheckEnabled: next });
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.message || 'Could not update location check',
      );
    } finally {
      setTogglingLocationId(null);
    }
  };

  const handleConnectStripe = async () => {
    if (!canConnectStripe) {
      Alert.alert(
        'Approval required',
        'Stripe Connect is available after a super admin approves your organization.',
      );
      return;
    }
    setIsConnectingStripe(true);
    try {
      const onboardingUrl = await connectStripe();
      await Linking.openURL(onboardingUrl);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start Stripe onboarding');
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleRefreshStripe = async () => {
    setIsRefreshingStripe(true);
    try {
      const result = await refreshStripeStatus();
      Alert.alert(
        'Stripe Status',
        result.charges_enabled
          ? 'Stripe is connected and ready to accept payments!'
          : 'Stripe onboarding is not yet complete. Please finish onboarding in your browser.',
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to refresh Stripe status');
    } finally {
      setIsRefreshingStripe(false);
    }
  };

  const getTicketTotal = (raffleId: string): TicketTotalByRaffle | undefined => {
    return ticketTotals.find((t) => t.donation_formId === raffleId);
  };

  const STATUS_TABS: { value: 'all' | 'active' | 'completed'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
  ];

  if (isLoading && !isRefreshing && forms.length === 0) {
    return <LoadingScreen message="Loading dashboard..." />;
  }

  return (
    <View style={styles.container}>
      {isOrgAdmin && (
        <View style={styles.stripeBar}>
          {orgStripeConnected ? (
            <Chip icon="check-circle" style={styles.stripeConnectedChip} textStyle={styles.stripeConnectedText}>
              Stripe Connected
            </Chip>
          ) : (
            <>
              <Button
                mode="contained"
                onPress={handleConnectStripe}
                loading={isConnectingStripe}
                disabled={isConnectingStripe || !canConnectStripe}
                icon="link-variant"
                compact
                style={[
                  styles.stripeConnectButton,
                  !canConnectStripe && styles.stripeConnectButtonDisabled,
                ]}
                buttonColor={COLORS.primary}
              >
                {orgStripeAccountId ? 'Continue Stripe setup' : 'Connect Stripe'}
              </Button>
              <Button
                mode="outlined"
                onPress={handleRefreshStripe}
                loading={isRefreshingStripe}
                disabled={isRefreshingStripe || !canConnectStripe}
                icon="refresh"
                compact
                style={styles.stripeRefreshButton}
              >
                Refresh
              </Button>
            </>
          )}
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isOrgAdmin && organizationName && (
          <Text style={styles.orgBanner}>
            {organizationName}
          </Text>
        )}

        {approvalBannerMessage ? (
          <Card style={styles.approvalBannerCard}>
            <Card.Content style={styles.approvalBannerContent}>
              <Chip
                compact
                icon={
                  orgApprovalStatus === 'rejected'
                    ? 'close-circle-outline'
                    : 'clock-outline'
                }
                style={
                  orgApprovalStatus === 'rejected'
                    ? styles.approvalRejectedChip
                    : styles.approvalPendingChip
                }
                textStyle={
                  orgApprovalStatus === 'rejected'
                    ? styles.approvalRejectedChipText
                    : styles.approvalPendingChipText
                }
              >
                {orgApprovalStatus === 'rejected' ? 'Not approved' : 'Pending approval'}
              </Chip>
              <Text style={styles.approvalBannerText}>{approvalBannerMessage}</Text>
            </Card.Content>
          </Card>
        ) : null}

        {showTapToPayFeatures && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={openTapToPaySettings}
          >
            <Card style={styles.tapToPayCard}>
              <Card.Content style={styles.tapToPayCardContent}>
                <View style={styles.tapToPayCardLeft}>
                  <View style={styles.tapToPayIconWrap}>
                    <TapToPayIcon size={26} color={COLORS.primary} filled />
                  </View>
                  <View style={styles.tapToPayTextWrap}>
                    <Text style={styles.tapToPayTitle}>Tap to Pay on iPhone</Text>
                    <Text style={styles.tapToPayDesc}>
                      Accept contactless payments for in-person ticket sales
                    </Text>
                  </View>
                </View>
                <Icon
                  source="chevron-right"
                  size={26}
                  color={COLORS.white}
                />
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}

        <TextInput
          mode="outlined"
          placeholder="Search..."
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

        <View style={styles.statusTabs}>
          {STATUS_TABS.map((option) => {
            const selected = statusFilter === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.statusTab, selected && styles.statusTabSelected]}
                activeOpacity={0.75}
                onPress={() => setStatusFilter(option.value)}
              >
                <Text
                  style={[
                    styles.statusTabLabel,
                    selected && styles.statusTabLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>
          {isOrgAdmin ? 'My Raffles' : 'All Raffles'}
        </Text>

        {storeError && (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text style={styles.errorTitle}>Failed to load data</Text>
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
            <Text style={styles.emptyText}>
              {statusFilter === 'active'
                ? 'No active raffles.'
                : statusFilter === 'completed'
                  ? 'No completed raffles.'
                  : filterText.trim()
                    ? 'No raffles match your search.'
                    : 'No raffles yet. Create your first raffle!'}
            </Text>
          </View>
        )}

        {filteredForms.map((form) => {
          const total = getTicketTotal(form.id);
          const completed = isCompleted(form.id);
          const hasStripe = !!(form.stripeAccount as any)?.id;
          const paymentReady = isTapToPayPaymentReady(
            role,
            orgStripeConnected,
            orgStripeAccountId,
            organizationId,
            form.stripeAccount,
          );
          // Org admins sell via org Stripe (same as workers); don't require raffle.stripeAccount.
          const canSellTickets =
            showTapToPayFeatures && !completed && (paymentReady || hasStripe);
          const expanded = expandedRaffleId === form.id;
          const locationOn = form.locationCheckEnabled !== false;
          const locationBusy = togglingLocationId === form.id;
          const locationLabel = form.raffleLocation?.trim() || 'No location';

          const openSellTickets = () => {
            if (
              !canUseInPersonPayment(
                isAdmin,
                role,
                orgStripeConnected,
                orgStripeAccountId,
                organizationId,
                form.stripeAccount,
              )
            ) {
              if (usesOrganizationStripe(role, organizationId) && !orgStripeConnected) {
                showOrgStripeRequiredAlert(undefined, role);
              } else if (!hasStripe && !paymentReady) {
                showRaffleStripeRequiredAlert();
              } else {
                showTapToPayAdminRequiredAlert();
              }
              return;
            }
            navigation.navigate('InPersonPayment', { id: form.id });
          };

          return (
            <Card key={form.id} style={styles.raffleCard} mode="elevated">
              <TouchableOpacity
                onPress={() =>
                  setExpandedRaffleId((current) =>
                    current === form.id ? null : form.id,
                  )
                }
                activeOpacity={0.75}
                style={styles.cardHeaderPress}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.raffleTitle} numberOfLines={1}>
                    {form.title || 'Untitled Raffle'}
                  </Text>
                  {completed ? (
                    <Chip
                      icon="check-circle"
                      style={styles.completedChip}
                      textStyle={styles.completedText}
                      compact
                    >
                      Completed
                    </Chip>
                  ) : (
                    <Chip
                      icon="clock-outline"
                      style={styles.activeChip}
                      textStyle={styles.activeText}
                      compact
                    >
                      Active
                    </Chip>
                  )}
                </View>
                <View style={styles.cardBottomRow}>
                  <View style={styles.collapsedMeta}>
                    <Icon
                      source="map-marker"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.collapsedMetaText} numberOfLines={1}>
                      {locationLabel}
                    </Text>
                  </View>
                  <Icon
                    source={expanded ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={COLORS.textSecondary}
                  />
                </View>
              </TouchableOpacity>

              {expanded ? (
                <View style={styles.cardBody}>
                  {isSuperAdmin ? (
                    <Text
                      style={[
                        styles.metaSecondary,
                        form.organization_approval_status === 'terminated' &&
                          styles.raffleOrgLabelTerminated,
                      ]}
                      numberOfLines={1}
                    >
                      {formatOrganizationLabel(
                        form.organization_name,
                        form.organization_approval_status,
                      )}
                    </Text>
                  ) : null}
                  <Text style={styles.metaId} numberOfLines={1} selectable>
                    {form.id}
                  </Text>

                  <View style={styles.metricsRow}>
                    <View style={styles.metricTile}>
                      <Text style={styles.metricLabel}>Total Amount</Text>
                      <Text style={styles.metricValue} numberOfLines={1}>
                        {formatCurrency(total?._sum.amount || 0)}
                      </Text>
                    </View>
                    <View style={styles.metricDivider} />
                    <View style={styles.metricTile}>
                      <Text style={styles.metricLabel}>Tickets Sold</Text>
                      <Text style={styles.metricValue} numberOfLines={1}>
                        {formatNumber(total?._sum.quantity || 0)}
                      </Text>
                    </View>
                  </View>

                  <Button
                    mode="contained"
                    icon="ticket-confirmation-outline"
                    onPress={() =>
                      navigation.navigate('PreviewRaffle', { id: form.id })
                    }
                    buttonColor={COLORS.primary}
                    style={styles.sellTicketsButton}
                    contentStyle={styles.sellTicketsButtonContent}
                  >
                    Manual entry
                  </Button>

                  <View style={styles.actionsBar}>
                    <IconButton
                      icon="map-marker-outline"
                      iconColor={
                        completed
                          ? COLORS.disabled
                          : locationOn
                            ? COLORS.success
                            : COLORS.error
                      }
                      size={20}
                      disabled={completed || locationBusy}
                      onPress={() => void toggleLocationCheck(form)}
                      style={styles.actionBtn}
                      accessibilityLabel={
                        locationOn
                          ? 'Disable location check'
                          : 'Enable location check'
                      }
                    />
                    <IconButton
                      icon="eye-outline"
                      iconColor={COLORS.primary}
                      size={20}
                      onPress={() =>
                        navigation.navigate('PreviewRaffle', { id: form.id })
                      }
                      style={styles.actionBtn}
                      accessibilityLabel="Preview raffle"
                    />
                    <IconButton
                      icon="pencil-outline"
                      iconColor={COLORS.primary}
                      size={20}
                      onPress={() =>
                        navigation.navigate('EditRaffle', { id: form.id })
                      }
                      style={styles.actionBtn}
                    />
                    <DownloadTicketsCsvButton
                      raffleId={form.id}
                      raffleTitle={form.title}
                      variant="icon"
                    />
                    <IconButton
                      icon="account-group-outline"
                      iconColor={COLORS.primary}
                      size={20}
                      onPress={() =>
                        navigation.navigate('ManageWorkers', {
                          raffleId: form.id,
                          organizationId: form.organization_id,
                          raffleTitle: form.title,
                          organizationName: form.organization_name,
                        })
                      }
                      style={styles.actionBtn}
                    />
                    {canSellTickets ? (
                      <IconButton
                        icon="credit-card-outline"
                        iconColor={COLORS.primary}
                        size={20}
                        onPress={openSellTickets}
                        style={styles.actionBtn}
                        accessibilityLabel="Sell tickets"
                      />
                    ) : null}
                    <IconButton
                      icon="trash-can-outline"
                      iconColor={COLORS.error}
                      size={20}
                      disabled={isDeleting}
                      onPress={() =>
                        setDeleteTarget({
                          id: form.id,
                          title: form.title || 'Untitled Raffle',
                        })
                      }
                      style={styles.actionBtn}
                    />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      {canCreateRaffles ? (
        <FAB
          icon="plus"
          label="Create Raffle"
          style={styles.fab}
          onPress={handleCreateRaffle}
        />
      ) : null}

      <Portal>
        <Dialog
          visible={!!deleteTarget}
          onDismiss={() => setDeleteTarget(null)}
        >
          <Dialog.Title>Delete raffle?</Dialog.Title>
          <Dialog.Content>
            <Paragraph>
              {deleteTarget
                ? `Delete "${deleteTarget.title}"? This removes the raffle and its tickets. This cannot be undone.`
                : ''}
            </Paragraph>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              textColor={COLORS.error}
              loading={isDeleting}
              disabled={isDeleting}
              onPress={() => {
                void confirmDeleteRaffle();
              }}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
    paddingBottom: 110,
  },
  stripeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  stripeConnectedChip: {
    backgroundColor: '#e8f5e9',
  },
  stripeConnectedText: {
    color: COLORS.success,
    fontWeight: '600',
  },
  stripeConnectButton: {
    flex: 1,
    borderRadius: 8,
  },
  stripeConnectButtonDisabled: {
    opacity: 0.45,
  },
  stripeRefreshButton: {
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  filterInput: {
    backgroundColor: COLORS.white,
    marginBottom: 10,
    fontSize: 14,
  },
  statusTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statusTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusTabSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusTabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statusTabLabelSelected: {
    color: COLORS.white,
  },
  orgBanner: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  approvalBannerCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  approvalBannerContent: {
    gap: 10,
  },
  approvalPendingChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
  },
  approvalPendingChipText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '600',
  },
  approvalRejectedChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
  },
  approvalRejectedChipText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '600',
  },
  approvalBannerText: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 12,
  },
  tapToPayCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 0,
    elevation: 6,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  tapToPayCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingRight: 0,
  },
  tapToPayCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  tapToPayIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapToPayTextWrap: { flex: 1 },
  tapToPayTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  tapToPayDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 3,
    lineHeight: 16,
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
    borderRadius: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  cardHeaderPress: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  raffleTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.2,
  },
  collapsedMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  collapsedMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  metaSecondary: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  metaId: {
    fontSize: 11,
    color: COLORS.textLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  raffleOrgLabelTerminated: {
    color: '#6B7280',
    fontStyle: 'italic',
  },
  completedChip: {
    backgroundColor: '#ECFDF5',
    flexShrink: 0,
  },
  completedText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '600',
  },
  activeChip: {
    backgroundColor: '#FFF7ED',
    flexShrink: 0,
  },
  activeText: {
    color: '#EA580C',
    fontSize: 11,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  metricTile: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.foreground,
    letterSpacing: -0.3,
  },
  sellTicketsButton: {
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  sellTicketsButtonContent: {
    paddingVertical: 4,
  },
  actionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  actionBtn: {
    margin: 0,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 96,
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
