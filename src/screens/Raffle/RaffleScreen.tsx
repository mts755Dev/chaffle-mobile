import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { Text, Button, Card, Chip } from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, API_BASE_URL } from '../../constants';
import { RootStackParamList, DonationForm, TicketTotalByRaffle, Ticket } from '../../types';
import { raffleApi, ticketApi } from '../../services/api/raffleApi';
import { formatCurrency, calculatePot, formatDate } from '../../utils';
import { useLocation } from '../../hooks/useLocation';
import CountdownTimer from '../../components/CountdownTimer';
import HtmlContent from '../../components/HtmlContent';
import LoadingScreen from '../../components/LoadingScreen';
import GeoRestrictedScreen from '../../components/GeoRestrictedScreen';
import ErrorScreen from '../../components/ErrorScreen';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RaffleRouteProp = RouteProp<RootStackParamList, 'Raffle'>;

export default function RaffleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RaffleRouteProp>();
  const { id } = route.params;

  const location = useLocation();

  const [donationForm, setDonationForm] = useState<DonationForm | null>(null);
  const [ticketTotal, setTicketTotal] = useState<TicketTotalByRaffle | null>(null);
  const [winnerTicket, setWinnerTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    loadRaffle();
  }, [id]);

  const loadRaffle = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const form = await raffleApi.getDonationFormById(id);
      if (!form) {
        setError('Raffle not found');
        setIsLoading(false);
        return;
      }

      setDonationForm(form);

      const totals = await raffleApi.getTicketsAmountByRaffle(id);
      if (totals.length > 0) setTicketTotal(totals[0]);

      if (form.draw_date && new Date(form.draw_date) < new Date()) {
        const winner = await ticketApi.getTicketWhere({
          donation_formId: id,
          isWinner: true,
        } as any);
        if (winner) setWinnerTicket(winner);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load raffle');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      const url = `${API_BASE_URL}/donation/${id}`;
      await Share.share({
        message: `Check out this charity raffle on Chaffle! ${donationForm?.title || ''}\n\n${url}`,
        url,
        title: donationForm?.title || 'Chaffle Raffle',
      });
    } catch {
      // User cancelled
    }
  };

  const handleBuyTickets = () => {
    if (donationForm) {
      navigation.navigate('BuyTickets', { raffleId: id, donationForm });
    }
  };

  const handleFreeTicket = () => {
    navigation.navigate('FreeTicket', { raffleId: id });
  };

  if (isLoading || location.isLoading) {
    return <LoadingScreen message="Loading raffle..." />;
  }

  if (error) {
    return <ErrorScreen message={error} onRetry={loadRaffle} />;
  }

  if (!donationForm) {
    return <ErrorScreen message="Raffle not found" />;
  }

  // Geo restriction check
  if (donationForm.raffleLocation && location.state && donationForm.raffleLocation !== location.state) {
    return (
      <GeoRestrictedScreen
        userState={location.state}
        requiredState={donationForm.raffleLocation}
        onGoBack={() => navigation.goBack()}
      />
    );
  }

  const totalAmount = ticketTotal?._sum.amount || 0;
  const potAmount = calculatePot(totalAmount);
  const isExpired = donationForm.draw_date
    ? new Date(donationForm.draw_date) < new Date()
    : false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 50/50 RAFFLE heading — serif uppercase, like web */}
      <Text style={styles.raffleHeading}>50/50 RAFFLE</Text>

      {/* Title */}
      <Text style={styles.title}>{donationForm.title || 'Charity Raffle'}</Text>

      {donationForm.raffleLocation && (
        <Chip icon="map-marker" style={styles.locationChip} textStyle={styles.chipText}>
          {donationForm.raffleLocation}
        </Chip>
      )}

      {/* Ticket info circles — like web's 4-ticket grid */}
      <View style={styles.ticketInfoRow}>
        {/* Location & Date */}
        <View style={styles.ticketInfoCircle}>
          <Text style={styles.ticketInfoSmall}>Raffle Location</Text>
          <Text style={styles.ticketInfoValue}>{donationForm.raffleLocation || '—'}</Text>
          <Text style={styles.ticketInfoSmall}>Draw Date</Text>
          <Text style={styles.ticketInfoValue}>
            {donationForm.draw_date ? formatDate(donationForm.draw_date, 'M/D/YYYY') : '—'}
          </Text>
        </View>

        {/* POT */}
        <View style={styles.ticketInfoCircle}>
          <Text style={styles.ticketInfoBig}>{formatCurrency(totalAmount)}</Text>
          <Text style={styles.ticketInfoSmall}>POT</Text>
        </View>

        {/* Est. Winning */}
        <View style={styles.ticketInfoCircle}>
          <Text style={styles.ticketInfoBig}>{formatCurrency(potAmount)}</Text>
          <Text style={styles.ticketInfoSmall}>Estimated Winning</Text>
        </View>

        {/* Timer / Winner */}
        <View style={styles.ticketInfoCircle}>
          {winnerTicket ? (
            <>
              <Text style={styles.ticketInfoValue}>
                #{winnerTicket.id.slice(0, 8).toUpperCase()}
              </Text>
              <Text style={styles.ticketInfoSmall}>Winner Ticket</Text>
            </>
          ) : !isExpired ? (
            <>
              <Text style={styles.ticketInfoSmall}>Hurry there's still time</Text>
              <CountdownTimer targetDate={donationForm.draw_date} />
              <Text style={styles.ticketInfoSmall}>Time until raffle</Text>
            </>
          ) : (
            <Text style={styles.ticketInfoSmall}>Draw has ended</Text>
          )}
        </View>
      </View>

      {/* Buy Tickets & Terms — like web */}
      {!isExpired && !winnerTicket && (
        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={handleBuyTickets}
            style={styles.buyButton}
            contentStyle={styles.buttonContent}
            icon="ticket"
            buttonColor={COLORS.primary}
          >
            Buy Tickets
          </Button>
          <Button
            mode="outlined"
            onPress={handleFreeTicket}
            style={styles.freeButton}
            contentStyle={styles.buttonContent}
            icon="gift"
            textColor={COLORS.primary}
          >
            Get Free Ticket
          </Button>
        </View>
      )}

      {/* Charity Info — like web's flex flex-1 section */}
      {donationForm.charity_info && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Charity Information:</Text>
            <HtmlContent html={donationForm.charity_info} />
          </Card.Content>
        </Card>
      )}

      {/* Mission */}
      {donationForm.mission_statement && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Mission</Text>
            <HtmlContent html={donationForm.mission_statement} />
          </Card.Content>
        </Card>
      )}

      {/* Donation Info */}
      {donationForm.donation_amount_information && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Donation Amount</Text>
            <HtmlContent html={donationForm.donation_amount_information} />
          </Card.Content>
        </Card>
      )}

      {/* Share & QR */}
      <View style={styles.shareSection}>
        <Button
          mode="outlined"
          onPress={handleShare}
          icon="share-variant"
          style={styles.shareButton}
          textColor={COLORS.primary}
        >
          Share Raffle
        </Button>
        <Button
          mode="outlined"
          onPress={() => setShowQR(!showQR)}
          icon="qrcode"
          style={styles.shareButton}
          textColor={COLORS.primary}
        >
          {showQR ? 'Hide QR' : 'Show QR Code'}
        </Button>
      </View>

      {showQR && (
        <View style={styles.qrContainer}>
          <QRCode
            value={`${API_BASE_URL}/donation/${id}`}
            size={200}
            backgroundColor="white"
            color={COLORS.foreground}
          />
          <Text style={styles.qrLabel}>Scan to view raffle</Text>
        </View>
      )}

      {/* Rules link */}
      {donationForm.rules && (
        <Card style={styles.infoCard}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Rules</Text>
            <HtmlContent html={donationForm.rules} />
          </Card.Content>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 40,
  },
  raffleHeading: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'serif',
    textTransform: 'uppercase',
    textAlign: 'center',
    color: COLORS.foreground,
    marginTop: 20,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  locationChip: {
    alignSelf: 'center',
    marginBottom: 12,
    backgroundColor: COLORS.accent,
  },
  chipText: {
    fontSize: 12,
    color: COLORS.foreground,
  },

  // Ticket info row — matches the web's 4-ticket SVG grid
  ticketInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 8,
    marginVertical: 16,
  },
  ticketInfoCircle: {
    width: '46%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  ticketInfoSmall: {
    fontSize: 11,
    fontFamily: 'serif',
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  ticketInfoValue: {
    fontSize: 14,
    fontFamily: 'serif',
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    marginVertical: 2,
  },
  ticketInfoBig: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
  },

  actions: {
    padding: 16,
    gap: 12,
  },
  buyButton: {
    borderRadius: 8,
  },
  freeButton: {
    borderRadius: 8,
    borderColor: COLORS.primary,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  infoCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.foreground,
    marginBottom: 8,
  },
  shareSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
  },
  shareButton: {
    flex: 1,
    borderRadius: 8,
    borderColor: COLORS.border,
  },
  qrContainer: {
    alignItems: 'center',
    padding: 24,
    margin: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    elevation: 2,
  },
  qrLabel: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
