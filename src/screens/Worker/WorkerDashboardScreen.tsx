import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS } from '../../constants';
import { RootStackParamList, DonationForm } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { raffleApi } from '../../services/api/raffleApi';
import { formatDate, resolveImageUrl } from '../../utils';
import LoadingScreen from '../../components/LoadingScreen';
import CountdownTimer from '../../components/CountdownTimer';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function WorkerDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, raffleId, logout } = useAuthStore();
  const [raffle, setRaffle] = useState<DonationForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const expiresAt = user?.user_metadata?.expires_at;
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiresDate ? expiresDate < new Date() : false;

  useEffect(() => {
    loadRaffle();
  }, [raffleId]);

  const loadRaffle = async () => {
    if (!raffleId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const form = await raffleApi.getDonationFormById(raffleId);
      setRaffle(form);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        onPress: async () => {
          await logout();
          navigation.navigate('MainTabs' as any);
        },
      },
    ]);
  };

  if (isLoading) return <LoadingScreen message="Loading..." />;

  if (isExpired) {
    return (
      <View style={styles.centered}>
        <Icon source="clock-alert-outline" size={64} color={COLORS.error} />
        <Text style={styles.expiredTitle}>Account Expired</Text>
        <Text style={styles.expiredText}>
          Your worker access has expired. Please contact your organization admin.
        </Text>
        <Button mode="contained" onPress={handleLogout} style={styles.logoutBtn}>
          Logout
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topActions}>
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

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {/* Expiry countdown */}
        {expiresDate && (
          <Card style={styles.expiryCard}>
            <Card.Content style={styles.expiryContent}>
              <Icon source="clock-outline" size={20} color={COLORS.warning} />
              <View style={styles.expiryInfo}>
                <Text style={styles.expiryLabel}>Access Expires</Text>
                <Text style={styles.expiryDate}>
                  {formatDate(expiresAt, 'MMM D, YYYY h:mm A')}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Raffle info */}
        {raffle ? (
          <Card style={styles.raffleCard}>
            {resolveImageUrl(raffle.backgroundImage) ? (
              <Image
                source={{ uri: resolveImageUrl(raffle.backgroundImage) }}
                style={styles.raffleImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.raffleImagePlaceholder}>
                <Icon source="ticket-confirmation-outline" size={48} color={COLORS.white} />
              </View>
            )}
            <Card.Content style={styles.raffleContent}>
              <Text style={styles.raffleTitle}>
                {raffle.title || 'Untitled Raffle'}
              </Text>

              <Divider style={styles.divider} />

              <View style={styles.infoRow}>
                <Icon source="map-marker-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>
                  {raffle.raffleLocation || 'No location set'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Icon source="calendar-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>
                  {raffle.draw_date
                    ? formatDate(raffle.draw_date, 'MMM D, YYYY h:mm A')
                    : 'No draw date'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Icon source="tag-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>
                  Min Ticket: ${raffle.min_ticket_price ?? 5}
                </Text>
              </View>

              {raffle.draw_date && new Date(raffle.draw_date) > new Date() && (
                <View style={styles.countdownRow}>
                  <Text style={styles.countdownLabel}>Time Left:</Text>
                  <CountdownTimer targetDate={raffle.draw_date} />
                </View>
              )}

              {raffle.draw_date && new Date(raffle.draw_date) < new Date() ? (
                <Chip icon="check-circle" style={styles.completedChip} textStyle={styles.completedText}>
                  Raffle Completed
                </Chip>
              ) : (
                <Chip icon="clock-outline" style={styles.activeChip} textStyle={styles.activeText}>
                  Active
                </Chip>
              )}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.raffleCard}>
            <Card.Content style={styles.centered}>
              <Text style={styles.emptyText}>Raffle not found</Text>
            </Card.Content>
          </Card>
        )}

        {/* Action buttons */}
        {raffle && (
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => navigation.navigate('PreviewRaffle', { id: raffle.id })}
              icon="ticket"
              style={styles.actionBtn}
              contentStyle={styles.actionBtnContent}
              labelStyle={styles.actionBtnLabel}
            >
              Sell Tickets
            </Button>

            <Button
              mode="contained"
              onPress={() => navigation.navigate('WorkerTickets')}
              icon="magnify"
              style={[styles.actionBtn, styles.secondaryBtn]}
              contentStyle={styles.actionBtnContent}
              labelStyle={styles.actionBtnLabel}
              buttonColor={COLORS.teal800}
            >
              Search Tickets
            </Button>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.background,
  },
  topActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topButton: {
    borderColor: COLORS.border,
  },
  expiryCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  expiryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expiryInfo: {
    flex: 1,
  },
  expiryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expiryDate: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
    marginTop: 2,
  },
  raffleCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    elevation: 2,
    overflow: 'hidden',
    marginBottom: 20,
  },
  raffleImage: {
    width: '100%',
    height: 160,
  },
  raffleImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raffleContent: {
    paddingTop: 16,
  },
  raffleTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.foreground,
  },
  divider: {
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  countdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  completedChip: {
    backgroundColor: '#DCFCE7',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  completedText: {
    color: COLORS.success,
    fontSize: 12,
  },
  activeChip: {
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  activeText: {
    color: COLORS.warning,
    fontSize: 12,
  },
  actions: {
    gap: 12,
  },
  actionBtn: {
    borderRadius: 12,
  },
  secondaryBtn: {
    // uses buttonColor prop
  },
  actionBtnContent: {
    paddingVertical: 8,
  },
  actionBtnLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  expiredTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.error,
    marginTop: 16,
  },
  expiredText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  logoutBtn: {
    backgroundColor: COLORS.error,
    borderRadius: 10,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
