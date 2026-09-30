import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, Card, Divider, Icon, Chip } from 'react-native-paper';
import TextInput from '../../../components/AppTextInput';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { useTicketStore, EnrichedWinnerTicket } from '../../../store/ticketStore';
import { useAuthStore } from '../../../store/authStore';
import { useRaffleStore } from '../../../store/raffleStore';
import { formatCurrency, shortId, formatDate, formatNumber, getTicketReferenceId } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';

export default function AdminWinnersScreen() {
  const { winnerTickets, isLoading, isRefreshing, fetchWinnerTickets } = useTicketStore();
  const { role, organizationId } = useAuthStore();
  const { fetchForms } = useRaffleStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedWinnerId, setExpandedWinnerId] = useState<string | null>(null);

  const loadWinners = useCallback(async () => {
    if (role === 'super_admin' || role === null) {
      await fetchWinnerTickets(undefined);
      return;
    }

    const isOrgScoped = role === 'org_admin' || role === 'worker';
    if (!isOrgScoped) {
      await fetchWinnerTickets(undefined);
      return;
    }

    if (!organizationId) {
      // Don't blank the list while org id is still resolving.
      await fetchWinnerTickets(undefined);
      return;
    }

    await fetchForms(organizationId);
    const raffleIds = useRaffleStore.getState().forms.map((f) => f.id);
    await fetchWinnerTickets(raffleIds);
  }, [role, organizationId, fetchForms, fetchWinnerTickets]);

  useFocusEffect(
    useCallback(() => {
      void loadWinners();
    }, [loadWinners]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWinners();
    setRefreshing(false);
  };

  const filteredWinners = winnerTickets.filter((t) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const referenceId = getTicketReferenceId(t.id).toLowerCase();
    return (
      t.buyerName.toLowerCase().includes(query) ||
      t.buyerEmail.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query) ||
      referenceId.includes(query) ||
      shortId(t.id).toLowerCase().includes(query)
    );
  });

  const renderWinner = ({ item }: { item: EnrichedWinnerTicket }) => {
    const raffleTitle = (item.donation_form as any)?.title || 'N/A';
    const totalAmount = item.totalAmount ?? 0;
    const estimatedAmount = item.estimatedAmount ?? 0;
    const expanded = expandedWinnerId === item.id;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <TouchableOpacity
            onPress={() =>
              setExpandedWinnerId((current) =>
                current === item.id ? null : item.id,
              )
            }
            activeOpacity={0.7}
          >
            <View style={styles.headerRow}>
              <View style={styles.trophyNameRow}>
                <Icon source="trophy" size={24} color={COLORS.gold} />
                <View style={styles.nameBlock}>
                  <Text style={styles.name}>{item.buyerName}</Text>
                  <Text style={styles.email}>{item.buyerEmail}</Text>
                </View>
              </View>
              <View style={styles.chipRow}>
                {item.isFree ? (
                  <Chip style={styles.freeChip} textStyle={styles.freeChipText} compact>
                    Free
                  </Chip>
                ) : (
                  <Chip style={styles.paidChip} textStyle={styles.paidChipText} compact>
                    Paid
                  </Chip>
                )}
              </View>
              <Icon
                source={expanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={COLORS.textSecondary}
              />
            </View>
          </TouchableOpacity>

          {expanded ? (
            <>
              <Divider style={styles.divider} />

              <View style={styles.detailGrid}>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Ticket ID</Text>
                  <Text style={styles.value}>#{shortId(item.id)}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Paid Amount</Text>
                  <Text style={styles.value}>
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Quantity</Text>
                  <Text style={styles.value}>
                    {formatNumber(item.quantity)}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Total Price</Text>
                  <Text style={[styles.value, { color: COLORS.primary }]}>
                    {formatCurrency(totalAmount)}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Estimated Prize</Text>
                  <Text style={[styles.value, { color: COLORS.success }]}>
                    {formatCurrency(estimatedAmount)}
                  </Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.label}>Free Ticket</Text>
                  <Text
                    style={[
                      styles.value,
                      {
                        color: item.isFree
                          ? '#2563EB'
                          : COLORS.textSecondary,
                      },
                    ]}
                  >
                    {item.isFree ? 'Yes' : 'No'}
                  </Text>
                </View>
              </View>

              <Divider style={styles.divider} />

              <View style={styles.bottomInfo}>
                {item.phone && (
                  <View style={styles.infoRow}>
                    <Icon source="phone" size={14} color={COLORS.textLight} />
                    <Text style={styles.infoText}>{item.phone}</Text>
                  </View>
                )}
                {item.address && (
                  <View style={styles.infoRow}>
                    <Icon
                      source="map-marker"
                      size={14}
                      color={COLORS.textLight}
                    />
                    <Text style={styles.infoText} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                )}
                <View style={styles.infoRow}>
                  <Icon source="ticket" size={14} color={COLORS.textLight} />
                  <Text style={styles.infoText} numberOfLines={1}>
                    {raffleTitle}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Icon
                    source="calendar"
                    size={14}
                    color={COLORS.textLight}
                  />
                  <Text style={styles.infoText}>
                    {formatDate(item.created_at, 'MMM D, YYYY h:mm A')}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </Card.Content>
      </Card>
    );
  };

  if (isLoading && !isRefreshing && winnerTickets.length === 0) {
    return <LoadingScreen message="Loading winners..." />;
  }

  return (
    <View style={styles.container}>
      <TextInput
        mode="outlined"
        placeholder="Search..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.filterInput}
        outlineColor={COLORS.border}
        activeOutlineColor={COLORS.primary}
        textColor={COLORS.foreground}
        placeholderTextColor={COLORS.textLight}
        dense
        left={<TextInput.Icon icon="magnify" color={COLORS.textLight} />}
        right={
          searchQuery ? (
            <TextInput.Icon
              icon="close"
              onPress={() => setSearchQuery('')}
              color={COLORS.textLight}
            />
          ) : undefined
        }
      />

      <Text style={styles.count}>
        {filteredWinners.length} winner{filteredWinners.length !== 1 ? 's' : ''}
      </Text>

      <FlatList
        data={filteredWinners}
        keyExtractor={(item) => item.id}
        renderItem={renderWinner}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="trophy-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No winners yet</Text>
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

  filterInput: {
    backgroundColor: COLORS.white,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
    fontSize: 14,
  },
  count: {
    fontSize: 13,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 4,
  },

  list: {
    padding: 12,
    paddingBottom: 24,
  },

  /* Winner card */
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
  },

  /* Header row */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  trophyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  email: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  freeChip: {
    backgroundColor: '#DBEAFE',
  },
  freeChipText: {
    fontSize: 11,
    color: '#2563EB',
  },
  paidChip: {
    backgroundColor: '#DCFCE7',
  },
  paidChipText: {
    fontSize: 11,
    color: COLORS.success,
  },

  divider: {
    marginVertical: 10,
  },

  /* Detail grid */
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  detailCell: {
    width: '48%',
    paddingVertical: 4,
  },
  label: {
    fontSize: 11,
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
    marginTop: 2,
  },

  /* Bottom info */
  bottomInfo: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },

  /* Empty state */
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
