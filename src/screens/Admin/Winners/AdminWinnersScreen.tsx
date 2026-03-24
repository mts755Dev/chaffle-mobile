import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Text, Card, Divider, Icon, Searchbar, Chip } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { useTicketStore, EnrichedWinnerTicket } from '../../../store/ticketStore';
import { formatCurrency, shortId, formatDate } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';

export default function AdminWinnersScreen() {
  const { winnerTickets, isLoading, fetchWinnerTickets } = useTicketStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load data from DB on screen focus
  useFocusEffect(
    useCallback(() => {
      fetchWinnerTickets();
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWinnerTickets();
    setRefreshing(false);
  };

  // Filter by name (matches web's filterColumn="buyerName")
  const filteredWinners = winnerTickets.filter((t) => {
    const query = searchQuery.toLowerCase();
    return (
      t.buyerName.toLowerCase().includes(query) ||
      t.buyerEmail.toLowerCase().includes(query) ||
      t.id.toLowerCase().includes(query)
    );
  });

  const renderWinner = ({ item }: { item: EnrichedWinnerTicket }) => {
    const raffleTitle = (item.donation_form as any)?.title || 'N/A';
    const totalAmount = item.totalAmount ?? 0;
    const estimatedAmount = item.estimatedAmount ?? 0;

    return (
      <Card style={styles.card}>
        <Card.Content>
          {/* Header: Trophy + Name + Chips */}
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
          </View>

          <Divider style={styles.divider} />

          {/* Detail grid — matches web table columns */}
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
              <Text style={[styles.value, { color: item.isFree ? '#2563EB' : COLORS.textSecondary }]}>
                {item.isFree ? 'Yes' : 'No'}
              </Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          {/* Bottom info: Phone, Address, Raffle, Date */}
          <View style={styles.bottomInfo}>
            {item.phone && (
              <View style={styles.infoRow}>
                <Icon source="phone" size={14} color={COLORS.textLight} />
                <Text style={styles.infoText}>{item.phone}</Text>
              </View>
            )}
            {item.address && (
              <View style={styles.infoRow}>
                <Icon source="map-marker" size={14} color={COLORS.textLight} />
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
              <Icon source="calendar" size={14} color={COLORS.textLight} />
              <Text style={styles.infoText}>
                {formatDate(item.created_at, 'MMM D, YYYY h:mm A')}
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (isLoading && winnerTickets.length === 0) {
    return <LoadingScreen message="Loading winners..." />;
  }

  return (
    <View style={styles.container}>
      {/* Filter — matches web's filterColumn="buyerName" */}
      <Searchbar
        placeholder="Filter by name, email, or ticket ID…"
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchbar}
        inputStyle={styles.searchInput}
      />

      <Text style={styles.sectionTitle}>
        Winners ({filteredWinners.length})
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

  /* Search */
  searchbar: {
    marginHorizontal: 12,
    marginBottom: 8,
    elevation: 2,
    backgroundColor: COLORS.white,
    borderRadius: 10,
  },
  searchInput: {
    fontSize: 14,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.foreground,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
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
    alignItems: 'flex-start',
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
