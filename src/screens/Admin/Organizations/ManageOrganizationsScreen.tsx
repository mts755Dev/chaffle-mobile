import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  Divider,
} from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { OrganizationRecord, OrgApprovalStatus } from '../../../types';
import { organizationApi, OrganizationListFilter } from '../../../services/api/organizationApi';
import { useAuthStore } from '../../../store/authStore';
import { formatDate } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';

type FilterOption = OrganizationListFilter;

const FILTER_OPTIONS: { value: FilterOption; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

function statusChipStyle(status: OrgApprovalStatus | undefined) {
  switch (status) {
    case 'approved':
      return { bg: '#DCFCE7', text: '#166534' };
    case 'rejected':
      return { bg: '#FEE2E2', text: '#991B1B' };
    case 'terminated':
      return { bg: '#E5E7EB', text: '#374151' };
    default:
      return { bg: '#FEF3C7', text: '#92400E' };
  }
}

export default function ManageOrganizationsScreen() {
  const { user } = useAuthStore();
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [filter, setFilter] = useState<FilterOption>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    setError(null);
    try {
      const rows = await organizationApi.listOrganizations(filter);
      setOrganizations(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void loadOrganizations();
    }, [loadOrganizations]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrganizations();
    setRefreshing(false);
  };

  const handleApproval = (org: OrganizationRecord, action: 'approved' | 'rejected') => {
    const verb = action === 'approved' ? 'approve' : 'reject';
    Alert.alert(
      action === 'approved' ? 'Approve organization' : 'Reject organization',
      `${action === 'approved' ? 'Approve' : 'Reject'} "${org.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approved' ? 'Approve' : 'Reject',
          style: action === 'approved' ? 'default' : 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setActingOnId(org.id);
            try {
              await organizationApi.updateApprovalStatus(org.id, action, user.id);
              await loadOrganizations();
            } catch (err: any) {
              Alert.alert('Error', err.message || `Failed to ${verb} organization`);
            } finally {
              setActingOnId(null);
            }
          },
        },
      ],
    );
  };

  const handleTerminate = (org: OrganizationRecord) => {
    Alert.alert(
      'Terminate Organization',
      `Terminate "${org.name}"? Active raffles and live data will be removed. Completed raffles will remain and show this organization as terminated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Terminate',
          style: 'destructive',
          onPress: async () => {
            setActingOnId(org.id);
            try {
              await organizationApi.terminateOrganization(org.id);
              await loadOrganizations();
              Alert.alert('Terminated', `"${org.name}" has been terminated.`);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to terminate organization');
            } finally {
              setActingOnId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: OrganizationRecord }) => {
    const status = item.approval_status ?? 'pending';
    const colors = statusChipStyle(status);
    const isPending = status === 'pending';
    const isApproved = status === 'approved';
    const isActing = actingOnId === item.id;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text style={styles.orgName}>{item.name}</Text>
            <Chip
              compact
              style={{ backgroundColor: colors.bg }}
              textStyle={{ color: colors.text, fontSize: 11, fontWeight: '600' }}
            >
              {status.toUpperCase()}
            </Chip>
          </View>

          {item.contact_email ? (
            <Text style={styles.metaText}>{item.contact_email}</Text>
          ) : null}
          <Text style={styles.metaText}>
            {`Submitted ${formatDate(item.created_at, 'MMM D, YYYY h:mm A')}`}
          </Text>
          {status === 'terminated' && item.terminated_at ? (
            <Text style={styles.metaText}>
              {`Terminated ${formatDate(item.terminated_at, 'MMM D, YYYY h:mm A')}`}
            </Text>
          ) : null}

          {isPending ? (
            <>
              <Divider style={styles.divider} />
              <View style={styles.actionsRow}>
                <Button
                  mode="contained"
                  icon="check"
                  onPress={() => handleApproval(item, 'approved')}
                  loading={isActing}
                  disabled={isActing}
                  style={styles.approveButton}
                  buttonColor={COLORS.primary}
                  compact
                >
                  Approve
                </Button>
                <Button
                  mode="outlined"
                  icon="close"
                  onPress={() => handleApproval(item, 'rejected')}
                  loading={isActing}
                  disabled={isActing}
                  style={styles.rejectButton}
                  textColor={COLORS.error}
                  compact
                >
                  Reject
                </Button>
              </View>
            </>
          ) : isApproved ? (
            <>
              <Divider style={styles.divider} />
              <Button
                mode="outlined"
                icon="delete-forever"
                onPress={() => handleTerminate(item)}
                loading={isActing}
                disabled={isActing}
                style={styles.terminateButton}
                textColor={COLORS.error}
                compact
              >
                Terminate Organization
              </Button>
            </>
          ) : null}
        </Card.Content>
      </Card>
    );
  };

  if (isLoading && organizations.length === 0) {
    return <LoadingScreen message="Loading organizations..." />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterWrap}>
        <View style={styles.filterTabs}>
          {FILTER_OPTIONS.map((option) => {
            const selected = filter === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.filterTab, selected && styles.filterTabSelected]}
                activeOpacity={0.75}
                onPress={() => setFilter(option.value)}
              >
                <Text
                  style={[
                    styles.filterTabLabel,
                    selected && styles.filterTabLabelSelected,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={organizations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No organizations</Text>
            <Text style={styles.emptyText}>
              {filter === 'pending'
                ? 'No organizations are waiting for approval.'
                : 'Nothing to show for this filter.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  filterWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
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
  filterTabSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterTabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  filterTabLabelSelected: {
    color: COLORS.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  orgName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  metaText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  approveButton: {
    flex: 1,
    borderRadius: 8,
  },
  rejectButton: {
    flex: 1,
    borderRadius: 8,
    borderColor: COLORS.error,
  },
  terminateButton: {
    borderRadius: 8,
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
