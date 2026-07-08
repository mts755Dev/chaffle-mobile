import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Image,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Button,
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
import { formatCurrency, formatDate, resolveImageUrl, parseAppDate } from '../../utils';
import LoadingScreen from '../../components/LoadingScreen';
import CountdownTimer from '../../components/CountdownTimer';
import TapToPayIcon from '../../components/TapToPayIcon';
import {
  canSetupTapToPayOnDevice,
  isRaffleStripeChargeable,
  isTapToPayPaymentReady,
  resolveTapToPayOrganizationId,
  showOrgStripeRequiredAlert,
  showRaffleStripeRequiredAlert,
  usesOrganizationStripe,
} from '../../utils/tapToPayAccess';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function getWorkerDisplayName(
  email: string | undefined,
  metadata: Record<string, unknown> | undefined,
): string {
  const first = metadata?.first_name as string | undefined;
  const last = metadata?.last_name as string | undefined;
  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (email) return email.split('@')[0];
  return 'Worker';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || 'W').toUpperCase();
}

const cardShadow = Platform.select({
  ios: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
  default: {
    elevation: 3,
  },
});

function ShadowCard({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: object;
}) {
  return (
    <View style={styles.shadowCardOuter}>
      <View style={[styles.shadowCardInner, contentStyle]}>{children}</View>
    </View>
  );
}

function WorkerProfileCard({
  displayName,
  organizationName,
  expiresDate,
  onSignOut,
}: {
  displayName: string;
  organizationName: string | null;
  expiresDate: Date | null;
  onSignOut: () => void;
}) {
  return (
    <ShadowCard contentStyle={styles.profileContent}>
      <View style={styles.profileMain}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.profileNameRow}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>Worker</Text>
              </View>
            </View>
            {organizationName ? (
              <View style={styles.orgRow}>
                <Icon source="domain" size={14} color={COLORS.textSecondary} />
                <Text style={styles.orgName} numberOfLines={1}>
                  {organizationName}
                </Text>
              </View>
            ) : (
              <Text style={styles.profileSubtext}>Signed in as worker</Text>
            )}
            {expiresDate ? (
              <View style={styles.expiryInline}>
                <Icon source="clock-outline" size={13} color={COLORS.warning} />
                <Text style={styles.expiryInlineText}>
                  Access expires {formatDate(expiresDate, 'MMM D, YYYY h:mm A')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Divider style={styles.profileDivider} />

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onSignOut}
          style={styles.signOutRow}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Icon source="logout-variant" size={18} color={COLORS.error} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ShadowCard>
  );
}

function CompactMenuRow({
  icon,
  iconComponent,
  title,
  subtitle,
  onPress,
  last,
}: {
  icon?: string;
  iconComponent?: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.menuRow}
      >
        <View style={styles.menuRowIcon}>
          {iconComponent ?? (
            <Icon source={icon!} size={18} color={COLORS.primary} />
          )}
        </View>
        <View style={styles.menuRowText}>
          <Text style={styles.menuRowTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.menuRowSubtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Icon source="chevron-right" size={20} color={COLORS.textLight} />
      </TouchableOpacity>
      {!last ? <Divider style={styles.menuDivider} /> : null}
    </>
  );
}

export default function WorkerDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    user,
    raffleId,
    logout,
    isAdmin,
    role,
    organizationId,
    organizationName,
    orgStripeConnected,
    orgStripeAccountId,
    refreshOrgState,
  } = useAuthStore();
  const [raffle, setRaffle] = useState<DonationForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const showTapToPayFeatures =
    Platform.OS === 'ios' && canSetupTapToPayOnDevice(isAdmin, role);
  const tapToPayOrgId = resolveTapToPayOrganizationId(
    raffle?.organization_id,
    organizationId,
  );
  const needsOrgStripe = usesOrganizationStripe(role, tapToPayOrgId);
  const raffleStripeAccount = raffle?.stripeAccount ?? null;
  const raffleHasStripe = isRaffleStripeChargeable(raffleStripeAccount);
  const orgStripeReady = isTapToPayPaymentReady(
    role,
    orgStripeConnected,
    orgStripeAccountId,
    tapToPayOrgId,
    raffleStripeAccount,
  );
  const canSellInPerson = orgStripeReady && raffleHasStripe;

  const displayName = getWorkerDisplayName(
    user?.email,
    user?.user_metadata as Record<string, unknown> | undefined,
  );

  const expiresAt = user?.user_metadata?.expires_at as string | undefined;
  const expiresDate = expiresAt ? new Date(expiresAt) : null;
  const isExpired = expiresDate ? expiresDate < new Date() : false;
  const drawDate = parseAppDate(raffle?.draw_date);
  const isRaffleCompleted = !!drawDate && drawDate.isBefore(new Date());

  const handleLogout = useCallback(() => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.navigate('MainTabs' as any);
        },
      },
    ]);
  }, [logout, navigation]);

  const loadRaffle = useCallback(async () => {
    if (!raffleId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const form = await raffleApi.getDonationFormById(raffleId);
      if (form && form.id !== raffleId) {
        setRaffle(null);
        return;
      }
      setRaffle(form);
      if (form?.organization_id) {
        await refreshOrgState();
      }
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [raffleId, refreshOrgState]);

  useEffect(() => {
    loadRaffle();
  }, [loadRaffle]);

  const openTapToPaySettings = () => {
    navigation.navigate('AdminTapToPay', {
      stripeAccountId: raffleStripeAccount?.id,
      merchantDisplayName: raffle?.title?.trim() || undefined,
      raffleOrganizationId: raffle?.organization_id ?? null,
    });
  };

  const openInPersonPayment = () => {
    if (!raffle) return;
    if (!orgStripeReady) {
      if (needsOrgStripe) {
        showOrgStripeRequiredAlert(undefined, role);
      } else {
        showRaffleStripeRequiredAlert();
      }
      return;
    }
    if (!raffleHasStripe) {
      showRaffleStripeRequiredAlert();
      return;
    }
    navigation.navigate('InPersonPayment', { id: raffle.id });
  };

  if (isLoading) return <LoadingScreen message="Loading…" />;

  if (isExpired) {
    return (
      <View style={styles.centered}>
        <Icon source="clock-alert-outline" size={48} color={COLORS.error} />
        <Text style={styles.expiredTitle}>Access expired</Text>
        <Text style={styles.expiredText}>
          Contact your organization admin to renew access.
        </Text>
        <Button mode="contained" onPress={handleLogout} style={styles.logoutBtn}>
          Sign out
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Worker profile */}
      <WorkerProfileCard
        displayName={displayName}
        organizationName={organizationName}
        expiresDate={expiresDate}
        onSignOut={handleLogout}
      />

      {/* Tap to Pay — top priority */}
      {showTapToPayFeatures ? (
        <ShadowCard contentStyle={styles.cardPad}>
          <Text style={styles.cardLabel}>Payments</Text>
            <CompactMenuRow
              iconComponent={
                <TapToPayIcon size={18} color={COLORS.primary} filled />
              }
              title="Tap to Pay on iPhone"
              subtitle={
                needsOrgStripe && !orgStripeReady && !raffleHasStripe
                  ? 'Waiting for organization Stripe'
                  : raffleHasStripe
                    ? 'Set up contactless payments on this device'
                    : 'Waiting for raffle Stripe'
              }
              onPress={openTapToPaySettings}
              last={!canSellInPerson}
            />
            {canSellInPerson ? (
              <CompactMenuRow
                icon="contactless-payment"
                title="Charge customer"
                subtitle="Accept an in-person card payment"
                onPress={openInPersonPayment}
                last
              />
            ) : null}
        </ShadowCard>
      ) : null}

      {/* Quick actions */}
      {raffle ? (
        <ShadowCard contentStyle={styles.cardPad}>
          <Text style={styles.cardLabel}>Actions</Text>
            <CompactMenuRow
              icon="ticket-confirmation-outline"
              title="Sell tickets"
              subtitle="Open checkout for this raffle"
              onPress={() => navigation.navigate('PreviewRaffle', { id: raffle.id })}
            />
            <CompactMenuRow
              icon="magnify"
              title="Search tickets"
              subtitle="Look up a buyer or reference"
              onPress={() => navigation.navigate('WorkerTickets')}
              last
            />
        </ShadowCard>
      ) : null}

      {/* Assigned raffle — compact */}
      <Text style={styles.sectionLabel}>Assigned raffle</Text>
      {raffle ? (
        <ShadowCard contentStyle={styles.raffleBody}>
            <View style={styles.raffleTopRow}>
              {resolveImageUrl(raffle.backgroundImage) ? (
                <Image
                  source={{ uri: resolveImageUrl(raffle.backgroundImage) }}
                  style={styles.raffleThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.raffleThumbPlaceholder}>
                  <Icon source="ticket-outline" size={20} color={COLORS.white} />
                </View>
              )}
              <View style={styles.raffleMeta}>
                <Text style={styles.raffleTitle} numberOfLines={2}>
                  {raffle.title?.trim() || 'Untitled raffle'}
                </Text>
                <Chip
                  compact
                  style={[
                    styles.statusChip,
                    isRaffleCompleted
                      ? styles.statusChipDone
                      : styles.statusChipLive,
                  ]}
                  textStyle={
                    isRaffleCompleted
                      ? styles.statusTextDone
                      : styles.statusTextLive
                  }
                >
                  {isRaffleCompleted ? 'Completed' : 'Active'}
                </Chip>
              </View>
            </View>

            <Divider style={styles.raffleDivider} />

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Location</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {raffle.raffleLocation?.trim() || '—'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Draw</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {drawDate
                    ? formatDate(raffle.draw_date, 'MMM D, YYYY')
                    : '—'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Min ticket</Text>
                <Text style={styles.metaValue}>
                  {formatCurrency(raffle.min_ticket_price ?? 5)}
                </Text>
              </View>
            </View>

            {!isRaffleCompleted && drawDate ? (
              <View style={styles.countdownSection}>
                <Text style={styles.countdownLabel}>Draw in</Text>
                <CountdownTimer
                  targetDate={raffle.draw_date}
                  variant="light"
                  showLabel={false}
                  compact
                />
              </View>
            ) : null}
        </ShadowCard>
      ) : (
        <ShadowCard contentStyle={styles.emptyBody}>
          <Text style={styles.emptyText}>No raffle assigned</Text>
        </ShadowCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceMuted,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.surfaceMuted,
  },

  profileContent: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  shadowCardOuter: {
    borderRadius: 12,
    ...cardShadow,
  },
  shadowCardInner: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  profileMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  orgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  orgName: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  profileSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  expiryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  expiryInlineText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.warning,
  },
  profileDivider: {
    marginVertical: 12,
    backgroundColor: COLORS.border,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.error,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: -4,
  },

  cardPad: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  menuRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowText: {
    flex: 1,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.foreground,
  },
  menuRowSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  menuDivider: {
    marginLeft: 54,
    backgroundColor: COLORS.border,
  },

  raffleBody: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  raffleTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  raffleThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
  },
  raffleThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raffleMeta: {
    flex: 1,
    gap: 6,
  },
  raffleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.foreground,
    lineHeight: 20,
  },
  statusChip: {
    alignSelf: 'flex-start',
    height: 24,
  },
  statusChipLive: {
    backgroundColor: '#ECFDF5',
  },
  statusChipDone: {
    backgroundColor: COLORS.accent,
  },
  statusTextLive: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
    marginVertical: 0,
  },
  statusTextDone: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginVertical: 0,
  },
  raffleDivider: {
    marginVertical: 10,
    backgroundColor: COLORS.border,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.foreground,
    marginTop: 2,
  },
  countdownSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  countdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  emptyBody: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  expiredTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.foreground,
    marginTop: 12,
  },
  expiredText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  logoutBtn: {
    borderRadius: 8,
    backgroundColor: COLORS.error,
  },
});
