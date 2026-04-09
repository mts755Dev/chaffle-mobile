import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Share,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  Surface,
  IconButton,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, API_BASE_URL } from '../../../constants';
import {
  RootStackParamList,
  DonationForm,
  TicketTotalByRaffle,
  Ticket,
} from '../../../types';
import { raffleApi, ticketApi } from '../../../services/api/raffleApi';
import {
  formatCurrency,
  calculatePot,
  formatDate,
  stripHtml,
  resolveImageUrl,
} from '../../../utils';
import CountdownTimer from '../../../components/CountdownTimer';
import HtmlContent from '../../../components/HtmlContent';
import LoadingScreen from '../../../components/LoadingScreen';
import ErrorScreen from '../../../components/ErrorScreen';

const chaffleLogo = require('../../../../assets/chaffle-logo.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type PreviewRaffleRouteProp = RouteProp<RootStackParamList, 'PreviewRaffle'>;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function PreviewRaffleScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PreviewRaffleRouteProp>();
  const { id } = route.params;

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

      // Check for winner if draw date has passed — mirrors web's preview page logic
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

  /* ---- guards ---- */
  if (isLoading) return <LoadingScreen message="Loading raffle preview..." />;
  if (error) return <ErrorScreen message={error} onRetry={loadRaffle} />;
  if (!donationForm) return <ErrorScreen message="Raffle not found" />;

  /* ---- derived data ---- */
  const totalAmount = ticketTotal?._sum.amount || 0;
  const totalQty = ticketTotal?._sum.quantity || 0;
  const potAmount = calculatePot(totalAmount);
  const isExpired = donationForm.draw_date
    ? new Date(donationForm.draw_date) < new Date()
    : false;
  const hasStripe = !!(donationForm.stripeAccount as any)?.charges_enabled;

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {resolveImageUrl(donationForm.backgroundImage) ? (
            <Image
              source={{ uri: resolveImageUrl(donationForm.backgroundImage) }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.heroPlaceholder} />
          )}

          {/* Logo pinned to the top-center */}
          <View style={styles.heroLogoTop}>
            <Image
              source={chaffleLogo}
              style={styles.heroLogoSmall}
              resizeMode="contain"
            />
          </View>

          {/* Gradient overlay */}
          <View style={styles.heroOverlay}>
            {/* Top row — badge + status */}
            <View style={styles.heroBadgeRow}>
              <View style={styles.raffleBadge}>
                <Icon source="ticket-confirmation-outline" size={14} color={COLORS.white} />
                <Text style={styles.raffleBadgeText}>50 / 50 RAFFLE</Text>
              </View>
              {isExpired ? (
                <View style={[styles.statusPill, styles.statusCompleted]}>
                  <View style={[styles.statusDot, { backgroundColor: COLORS.success }]} />
                  <Text style={[styles.statusPillText, { color: COLORS.success }]}>Completed</Text>
                </View>
              ) : (
                <View style={[styles.statusPill, styles.statusActive]}>
                  <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={[styles.statusPillText, { color: '#22C55E' }]}>Active</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={styles.heroTitle} numberOfLines={3}>
              {donationForm.title || 'Untitled Raffle'}
            </Text>

            {/* Meta row — location & draw date */}
            <View style={styles.heroMeta}>
              {donationForm.raffleLocation ? (
                <View style={styles.metaItem}>
                  <Icon source="map-marker-outline" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.metaText}>{donationForm.raffleLocation}</Text>
                </View>
              ) : null}
              {donationForm.draw_date ? (
                <View style={styles.metaItem}>
                  <Icon source="calendar-outline" size={14} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.metaText}>
                    {formatDate(donationForm.draw_date, 'MMM D, YYYY')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* ─── Quick Stats Row ──────────────────────────────────── */}
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Icon source="cash-multiple" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statValue}>{formatCurrency(totalAmount)}</Text>
            <Text style={styles.statLabel}>Collected</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon source="ticket-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statValue}>{totalQty}</Text>
            <Text style={styles.statLabel}>Tickets</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon source="trophy-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statValue}>{formatCurrency(potAmount)}</Text>
            <Text style={styles.statLabel}>Est. Prize</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon source="tag-outline" size={18} color="rgba(255,255,255,0.7)" />
            <Text style={styles.statValue}>
              ${donationForm.min_ticket_price ?? 5}
            </Text>
            <Text style={styles.statLabel}>Min Price</Text>
          </View>
        </View>

        {/* ─── Ticket Info Cards (2×2) — like web's ticket SVG grid */}
        <View style={styles.cardGrid}>
          {/* Location & Date */}
          <Surface style={styles.infoTile} elevation={2}>
            <Icon source="map-marker-radius" size={28} color={COLORS.white} />
            <Text style={styles.tileLabelTop}>Location & Date</Text>
            <Text style={styles.tileValue}>
              {donationForm.raffleLocation || '—'}
            </Text>
            <View style={styles.tileDivider} />
            <Text style={styles.tileValue}>
              {donationForm.draw_date
                ? new Date(donationForm.draw_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : '—'}
            </Text>
          </Surface>

          {/* Current Jackpot / POT */}
          <Surface style={styles.infoTile} elevation={2}>
            <Icon source="cash-multiple" size={28} color={COLORS.white} />
            <Text style={styles.tileLabelTop}>Current Jackpot</Text>
            <Text style={styles.tileBigValue}>
              {formatCurrency(totalAmount)}
            </Text>
            <Text style={styles.tileSublabel}>POT</Text>
          </Surface>

          {/* Estimated Prize */}
          <Surface style={styles.infoTile} elevation={2}>
            <Icon source="trophy-outline" size={28} color={COLORS.white} />
            <Text style={styles.tileLabelTop}>Estimated Prize</Text>
            <Text style={styles.tileBigValue}>{formatCurrency(potAmount)}</Text>
            <Text style={styles.tileSublabel}>Winner takes 50%</Text>
          </Surface>

          {/* Countdown / Winner */}
          <Surface style={styles.infoTile} elevation={2}>
            {winnerTicket ? (
              <>
                <Icon source="party-popper" size={28} color={COLORS.white} />
                <Text style={styles.tileLabelTop}>Winner</Text>
                <Text style={styles.tileValue}>
                  #{winnerTicket.id.slice(0, 8).toUpperCase()}
                </Text>
                <Text style={styles.tileSublabel}>Winner Ticket</Text>
              </>
            ) : !isExpired && donationForm.draw_date ? (
              <>
                <Icon source="clock-outline" size={28} color={COLORS.white} />
                <Text style={styles.tileLabelTop}>Time Left</Text>
                <CountdownTimer targetDate={donationForm.draw_date} />
              </>
            ) : (
              <>
                <Icon
                  source="calendar-check"
                  size={28}
                  color={COLORS.white}
                />
                <Text style={styles.tileLabelTop}>Draw Ended</Text>
                <Text style={styles.tileSublabel}>
                  Awaiting winner selection
                </Text>
              </>
            )}
          </Surface>
        </View>

        {/* ─── Buy Tickets (like web's PaymentDialog) ────────────── */}
        {!isExpired && !winnerTicket && hasStripe && (
          <View style={styles.section}>
            <Button
              mode="contained"
              onPress={() =>
                navigation.navigate('BuyTickets', {
                  raffleId: id,
                  donationForm,
                })
              }
              style={styles.buyButton}
              contentStyle={styles.winnerButtonContent}
              buttonColor={COLORS.primary}
              icon="ticket"
              labelStyle={styles.winnerButtonLabel}
            >
              Buy Tickets
            </Button>
          </View>
        )}

        {/* ─── Raffle Details Card ──────────────────────────────── */}
        <Card style={styles.detailCard}>
          <Card.Content>
            <View style={styles.detailHeader}>
              <Icon source="information-outline" size={20} color={COLORS.primary} />
              <Text style={styles.detailTitle}>Raffle Details</Text>
            </View>
            <Divider style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Raffle ID</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Title</Text>
              <Text style={styles.detailValue} numberOfLines={2}>
                {donationForm.title || 'Untitled'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Draw Date</Text>
              <Text style={styles.detailValue}>
                {donationForm.draw_date
                  ? formatDate(donationForm.draw_date, 'MMMM D, YYYY')
                  : '—'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>
                {donationForm.raffleLocation || '—'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Min Ticket</Text>
              <Text style={styles.detailValue}>
                ${donationForm.min_ticket_price ?? 5}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              {isExpired ? (
                <Chip
                  icon="check-circle"
                  style={styles.chipCompleted}
                  textStyle={styles.chipTextCompleted}
                  compact
                >
                  Completed
                </Chip>
              ) : (
                <Chip
                  icon="clock-outline"
                  style={styles.chipActive}
                  textStyle={styles.chipTextActive}
                  compact
                >
                  Active
                </Chip>
              )}
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Stripe</Text>
              {hasStripe ? (
                <View style={styles.stripeLinked}>
                  <Icon source="check-circle" size={16} color={COLORS.success} />
                  <Text style={styles.stripeLinkText}>Connected</Text>
                </View>
              ) : (
                <Text style={[styles.detailValue, { color: COLORS.warning }]}>
                  Not connected
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* ─── Charity Information ──────────────────────────────── */}
        {donationForm.charity_info ? (
          <Card style={styles.contentCard}>
            <Card.Content>
              <View style={styles.sectionHeader}>
                <Icon source="heart-outline" size={20} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Charity Information</Text>
              </View>
              <Divider style={styles.detailDivider} />
              <HtmlContent html={donationForm.charity_info} />
            </Card.Content>
          </Card>
        ) : null}

        {/* ─── Share & QR Code ──────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.shareRow}>
            <Button
              mode="outlined"
              onPress={handleShare}
              icon="share-variant"
              style={styles.shareBtn}
              textColor={COLORS.primary}
            >
              Share Raffle
            </Button>
            <Button
              mode="outlined"
              onPress={() => setShowQR(!showQR)}
              icon="qrcode"
              style={styles.shareBtn}
              textColor={COLORS.primary}
            >
              {showQR ? 'Hide QR' : 'QR Code'}
            </Button>
          </View>
        </View>

        {showQR && (
          <Card style={styles.qrCard}>
            <Card.Content style={styles.qrContent}>
              <Text style={styles.qrTitle}>Share with your friends</Text>
              <Divider style={{ marginVertical: 12 }} />
              <QRCode
                value={`${API_BASE_URL}/donation/${id}`}
                size={180}
                backgroundColor="white"
                color={COLORS.foreground}
              />
              <Divider style={{ marginVertical: 12 }} />
              <Text style={styles.qrLink}>
                {`${API_BASE_URL}/donation/${id}`}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* ─── Rules link (bottom) ──────────────────────────────── */}
        <Text
          style={styles.rulesLink}
          onPress={() => {
            if (donationForm.rules) {
              Alert.alert(
                'Rules & Regulation',
                stripHtml(donationForm.rules) || 'No rules provided.',
              );
            }
          }}
        >
          Get to know more about the rules here
        </Text>

        {/* ─── Branding footer ──────────────────────────────────── */}
        <View style={styles.brandFooter}>
          <Image
            source={chaffleLogo}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={styles.footerText}>Powered by Chaffle</Text>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ─── Floating Share FAB ─────────────────────────────────── */}
      <View style={styles.fabRow}>
        <IconButton
          icon="share-variant"
          iconColor={COLORS.white}
          size={22}
          style={styles.fab}
          onPress={handleShare}
        />
      </View>
    </View>
  );
}

/* ================================================================== */
/*  Styles                                                            */
/* ================================================================== */
const TILE_SIZE = (SCREEN_WIDTH - 48) / 2; // 16 padding + 16 gap + 16 padding

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  /* ─── Hero ───────────────────────────── */
  hero: {
    height: 280,
    backgroundColor: COLORS.primary,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  heroLogoTop: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  heroLogoSmall: {
    width: 180,
    height: 75,
    opacity: 0.95,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 50,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  raffleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  raffleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  statusCompleted: {
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    lineHeight: 30,
    letterSpacing: 0.2,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },

  /* ─── Quick Stats ────────────────────── */
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.teal800,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  /* ─── 2×2 Tile Grid ──────────────────── */
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  infoTile: {
    width: TILE_SIZE,
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  tileLabelTop: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 4,
  },
  tileBigValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 4,
  },
  tileSublabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    textAlign: 'center',
  },
  tileDivider: {
    width: 30,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginVertical: 6,
  },

  /* ─── Get a Winner ───────────────────── */
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  buyButton: {
    borderRadius: 12,
    marginBottom: 12,
  },
  winnerButton: {
    borderRadius: 12,
  },
  winnerButtonContent: {
    paddingVertical: 6,
  },
  winnerButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },

  /* ─── Detail Card ────────────────────── */
  detailCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    elevation: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  detailDivider: {
    marginVertical: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.foreground,
    flex: 1.5,
    textAlign: 'right',
  },
  chipCompleted: {
    backgroundColor: '#dcfce7',
  },
  chipTextCompleted: {
    color: COLORS.success,
    fontSize: 11,
  },
  chipActive: {
    backgroundColor: '#fef3c7',
  },
  chipTextActive: {
    color: COLORS.warning,
    fontSize: 11,
  },
  stripeLinked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stripeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
  },

  /* ─── Content Cards ──────────────────── */
  contentCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.foreground,
  },

  /* ─── Share ──────────────────────────── */
  shareRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    borderRadius: 10,
    borderColor: COLORS.primary,
  },

  /* ─── QR ─────────────────────────────── */
  qrCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    elevation: 2,
  },
  qrContent: {
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  qrLink: {
    fontSize: 12,
    color: COLORS.primary,
    textAlign: 'center',
  },

  /* ─── Rules Link ─────────────────────── */
  rulesLink: {
    fontSize: 14,
    color: '#2563EB',
    textAlign: 'center',
    marginTop: 20,
    textDecorationLine: 'underline',
  },

  /* ─── Branding Footer ────────────────── */
  brandFooter: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 16,
  },
  footerLogo: {
    width: 140,
    height: 60,
    marginBottom: 4,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textLight,
  },

  /* ─── FAB ────────────────────────────── */
  fabRow: {
    position: 'absolute',
    right: 16,
    bottom: 20,
  },
  fab: {
    backgroundColor: '#F59E0B',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
