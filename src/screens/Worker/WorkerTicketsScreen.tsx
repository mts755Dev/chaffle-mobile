import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Text, Card, Divider, Searchbar, Chip, Icon } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../constants';
import { Ticket } from '../../types';
import { useTicketStore } from '../../store/ticketStore';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, shortId, formatDate } from '../../utils';
import LoadingScreen from '../../components/LoadingScreen';

export default function WorkerTicketsScreen() {
  const { tickets, isLoading, isRefreshing, fetchPaidTickets } = useTicketStore();
  const { raffleId } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const workerRaffleIds = raffleId ? [raffleId] : [];

  useFocusEffect(
    useCallback(() => {
      if (workerRaffleIds.length > 0) {
        fetchPaidTickets(workerRaffleIds);
      }
    }, [raffleId]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    if (workerRaffleIds.length > 0) {
      await fetchPaidTickets(workerRaffleIds);
    }
    setRefreshing(false);
  };

  const filteredTickets = tickets.filter((t) => {
    const query = searchQuery.toLowerCase();
    return (
      t.buyerName.toLowerCase().includes(query) ||
      t.buyerEmail.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query)
    );
  });

  const renderTicket = ({ item }: { item: Ticket }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.headerRow}>
          <View style={styles.nameBlock}>
            <Text style={styles.name}>{item.buyerName}</Text>
            <Text style={styles.email}>{item.buyerEmail}</Text>
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
            {item.isWinner && (
              <Chip icon="trophy" style={styles.winnerChip} textStyle={styles.winnerChipText} compact>
                Winner
              </Chip>
            )}
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.detailGrid}>
          <View style={styles.detailCell}>
            <Text style={styles.label}>Ticket ID</Text>
            <Text style={styles.value}>#{shortId(item.id)}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.label}>Paid Amount</Text>
            <Text style={styles.value}>{formatCurrency(item.amount)}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.label}>Quantity</Text>
            <Text style={styles.value}>{item.quantity}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, { color: item.paid ? COLORS.success : COLORS.error }]}>
              {item.paid ? 'Paid' : 'Unpaid'}
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
          <View style={styles.infoRow}>
            <Icon source="calendar" size={14} color={COLORS.textLight} />
            <Text style={styles.infoText}>
              {formatDate(item.created_at, 'MMM D, YYYY h:mm A')}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  if (isLoading && !isRefreshing && tickets.length === 0) {
    return <LoadingScreen message="Loading tickets..." />;
  }

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search by name, email, or ticket ID..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
        inputStyle={styles.searchInput}
      />

      <Text style={styles.count}>
        {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
      </Text>

      <FlatList
        data={filteredTickets}
        keyExtractor={(item) => item.id}
        renderItem={renderTicket}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="ticket-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No tickets found</Text>
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
  searchbar: {
    margin: 12,
    elevation: 2,
    backgroundColor: COLORS.white,
    borderRadius: 10,
  },
  searchInput: {
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
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 10,
    elevation: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBlock: {
    flex: 1,
    marginRight: 8,
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
