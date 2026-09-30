import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Text, Card, Divider, Chip, Icon } from 'react-native-paper';
import TextInput from '../../components/AppTextInput';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants';
import { Ticket } from '../../types';
import {
  useTicketStore,
  EnrichedWinnerTicket,
} from '../../store/ticketStore';
import { useAuthStore } from '../../store/authStore';
import {
  formatCurrency,
  shortId,
  formatDate,
  formatNumber,
  getTicketReferenceId,
} from '../../utils';
import LoadingScreen from '../../components/LoadingScreen';

type ListMode = 'tickets' | 'winners';

const LIST_MODES: { value: ListMode; label: string }[] = [
  { value: 'tickets', label: 'Tickets' },
  { value: 'winners', label: 'Winners' },
];

function matchesSearch(t: Ticket, query: string) {
  if (!query) return true;
  const referenceId = getTicketReferenceId(t.id).toLowerCase();
  return (
    t.buyerName.toLowerCase().includes(query) ||
    t.buyerEmail.toLowerCase().includes(query) ||
    t.id.toLowerCase().includes(query) ||
    referenceId.includes(query) ||
    shortId(t.id).toLowerCase().includes(query)
  );
}

export default function WorkerTicketsScreen() {
  const {
    tickets,
    winnerTickets,
    isLoading,
    isRefreshing,
    fetchPaidTickets,
    fetchWinnerTickets,
  } = useTicketStore();
  const { raffleId } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [listMode, setListMode] = useState<ListMode>('tickets');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const workerRaffleIds = raffleId ? [raffleId] : [];

  const loadList = useCallback(async () => {
    if (workerRaffleIds.length === 0) return;
    if (listMode === 'winners') {
      await fetchWinnerTickets(workerRaffleIds);
    } else {
      await fetchPaidTickets(workerRaffleIds);
    }
  }, [listMode, raffleId, fetchPaidTickets, fetchWinnerTickets]);

  useFocusEffect(
    useCallback(() => {
      void loadList();
    }, [loadList]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadList();
    setRefreshing(false);
  };

  const onModeChange = (mode: ListMode) => {
    if (mode === listMode) return;
    setListMode(mode);
    setExpandedId(null);
    setSearchQuery('');
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredTickets = tickets.filter((t) => matchesSearch(t, query));
  const filteredWinners = winnerTickets.filter((t) => matchesSearch(t, query));
  const showingWinners = listMode === 'winners';
  const listData = showingWinners ? filteredWinners : filteredTickets;
  const emptyData =
    showingWinners ? winnerTickets.length === 0 : tickets.length === 0;

  const toggleExpand = (id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  const renderModeTabs = () => (
    <View style={styles.filterWrap}>
      <View style={styles.filterTabs}>
        {LIST_MODES.map((option) => {
          const selected = listMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterTab, selected && styles.filterTabSelected]}
              activeOpacity={0.75}
              onPress={() => onModeChange(option.value)}
            >
              <Text
                style={[
                  styles.filterTabLabel,
                  selected && styles.filterTabLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderTicket = ({ item }: { item: Ticket }) => {
    const expanded = expandedId === item.id;

    return (
      <Card style={styles.card}>
        <Card.Content>
          <TouchableOpacity
            onPress={() => toggleExpand(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.headerRow}>
              <View style={styles.nameBlock}>
                <Text style={styles.name}>{item.buyerName}</Text>
                <Text style={styles.email}>{item.buyerEmail}</Text>
              </View>
              <View style={styles.chipRow}>
                {item.isFree ? (
                  <Chip
                    style={styles.freeChip}
                    textStyle={styles.freeChipText}
                    compact
                  >
                    Free
                  </Chip>
                ) : (
                  <Chip
                    style={styles.paidChip}
                    textStyle={styles.paidChipText}
                    compact
                  >
                    Paid
                  </Chip>
                )}
                {item.isWinner ? (
                  <Chip
                    icon="trophy"
                    style={styles.winnerChip}
                    textStyle={styles.winnerChipText}
                    compact
                  >
                    Winner
                  </Chip>
                ) : null}
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
                  <Text style={styles.label}>Reference ID</Text>
                  <Text style={styles.value}>
                    #{getTicketReferenceId(item.id)}
                  </Text>
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
                  <Text style={styles.label}>Status</Text>
                  <Text
                    style={[
                      styles.value,
                      { color: item.paid ? COLORS.success : COLORS.error },
                    ]}
                  >
                    {item.paid ? 'Paid' : 'Unpaid'}
                  </Text>
                </View>
              </View>
              <Divider style={styles.divider} />
              <View style={styles.bottomInfo}>
                {item.phone ? (
                  <View style={styles.infoRow}>
                    <Icon source="phone" size={14} color={COLORS.textLight} />
                    <Text style={styles.infoText}>{item.phone}</Text>
                  </View>
                ) : null}
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

  const renderWinner = ({ item }: { item: EnrichedWinnerTicket }) => {
    const totalAmount = item.totalAmount ?? 0;
    const estimatedAmount = item.estimatedAmount ?? 0;
    const expanded = expandedId === item.id;

    return (
      <Card style={[styles.card, styles.winnerCard]}>
        <Card.Content>
          <TouchableOpacity
            onPress={() => toggleExpand(item.id)}
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
                  <Chip
                    style={styles.freeChip}
                    textStyle={styles.freeChipText}
                    compact
                  >
                    Free
                  </Chip>
                ) : (
                  <Chip
                    style={styles.paidChip}
                    textStyle={styles.paidChipText}
                    compact
                  >
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
              </View>
              <Divider style={styles.divider} />
              <View style={styles.bottomInfo}>
                {item.phone ? (
                  <View style={styles.infoRow}>
                    <Icon source="phone" size={14} color={COLORS.textLight} />
                    <Text style={styles.infoText}>{item.phone}</Text>
                  </View>
                ) : null}
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

  if (isLoading && !isRefreshing && emptyData) {
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
        />
        {renderModeTabs()}
        <LoadingScreen
          message={
            showingWinners ? 'Loading winners...' : 'Loading tickets...'
          }
        />
      </View>
    );
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

      {renderModeTabs()}

      <FlatList
        data={listData as Ticket[]}
        keyExtractor={(item) => item.id}
        renderItem={
          showingWinners ? (renderWinner as any) : (renderTicket as any)
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon
              source={showingWinners ? 'trophy-outline' : 'ticket-outline'}
              size={48}
              color={COLORS.textLight}
            />
            <Text style={styles.emptyText}>
              {showingWinners ? 'No winners yet' : 'No tickets found'}
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
    paddingTop: 8,
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
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  filterTabLabelSelected: {
    color: COLORS.white,
  },
  filterInput: {
    backgroundColor: COLORS.white,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 0,
    fontSize: 14,
  },
  list: {
    padding: 12,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
  },
  winnerCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.gold,
  },
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
    marginRight: 4,
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
  freeChip: { backgroundColor: '#DBEAFE' },
  freeChipText: { fontSize: 11, color: '#2563EB' },
  paidChip: { backgroundColor: '#DCFCE7' },
  paidChipText: { fontSize: 11, color: COLORS.success },
  winnerChip: { backgroundColor: '#FEF3C7' },
  winnerChipText: { fontSize: 11, color: '#D97706' },
  divider: { marginVertical: 10 },
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
  bottomInfo: { gap: 6 },
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
