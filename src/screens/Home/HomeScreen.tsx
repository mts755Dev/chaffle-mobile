import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  TouchableOpacity,
  Linking,
  Animated,
  Image,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Snackbar,
  Icon,
  Surface,
} from 'react-native-paper';

// Chaffle logo — same asset used in web navbar & footer
const chaffleLogo = require('../../../assets/chaffle-logo.png');
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { COLORS, SOCIAL_LINKS } from '../../constants';
import { RootStackParamList } from '../../types';
import { raffleApi } from '../../services/api/raffleApi';
import { formatCurrency } from '../../utils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [charityId, setCharityId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ totalRaised: 455000, totalPaidOut: 389999 });

  // Animated counters
  const raisedAnim = useRef(new Animated.Value(0)).current;
  const paidAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadStats();
    // Animate counters on mount
    Animated.parallel([
      Animated.timing(raisedAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(paidAnim, {
        toValue: 1,
        duration: 1200,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadStats = async () => {
    try {
      const totals = await raffleApi.getTicketsAmountByRaffle();
      const totalRaised = totals.reduce((sum: number, t: any) => sum + (t._sum.amount || 0), 0);
      const totalPaidOut = Math.floor(totalRaised / 2);
      if (totalRaised > 0) {
        setStats({ totalRaised, totalPaidOut });
      }
    } catch {
      // Keep default stats
    }
  };

  const handleSearch = async () => {
    if (!charityId.trim()) {
      setError('Please enter a Charity ID');
      return;
    }

    setIsSearching(true);
    setError('');

    try {
      const form = await raffleApi.getDonationFormById(charityId.trim());

      if (!form) {
        setError('Raffle not found. Please check the ID and try again.');
        setIsSearching(false);
        return;
      }

      if (!(form.stripeAccount as any)?.id) {
        setError('This raffle is not yet configured for payments.');
        setIsSearching(false);
        return;
      }

      navigation.navigate('Raffle', { id: form.id });
    } catch {
      setError('Unable to find raffle. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <Image
              source={chaffleLogo}
              style={styles.heroLogo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>
              Smarter raffles.{'\n'}Bigger impact.
            </Text>
            <View style={styles.taglineDivider} />
            <Text style={styles.subTagline}>
              50/50 Charity Raffles
            </Text>
          </View>
        </View>

        {/* ── Search Card — floating over hero ──────────  */}
        <View style={styles.searchWrapper}>
          <Surface style={styles.searchCard} elevation={3}>
            <Text style={styles.searchHeading}>Enter Raffle</Text>
            <Text style={styles.searchSubtext}>
              Paste or type the charity ID to join a raffle
            </Text>

            <TextInput
              mode="outlined"
              placeholder="e.g. a1b2c3d4-e5f6-7890..."
              value={charityId}
              onChangeText={(text) => {
                setCharityId(text);
                if (error) setError('');
              }}
              style={styles.searchInput}
              outlineColor={COLORS.border}
              activeOutlineColor={COLORS.primary}
              textColor={COLORS.foreground}
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              dense
            />

            <Button
              mode="contained"
              onPress={handleSearch}
              loading={isSearching}
              disabled={isSearching}
              style={styles.searchButton}
              contentStyle={styles.searchButtonInner}
              buttonColor={COLORS.primary}
              textColor={COLORS.white}
              icon="magnify"
            >
              Find Raffle
            </Button>
          </Surface>
        </View>

        {/* ── Stats Band ───────────────────────────────── */}
        <View style={styles.statsBand}>
          <Animated.View
            style={[
              styles.statBlock,
              { opacity: raisedAnim, transform: [{ translateY: raisedAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
            ]}
          >
            <Text style={styles.statNumber}>
              {formatCurrency(stats.totalRaised)}
            </Text>
            <Text style={styles.statCaption}>
              Total raised for charities
            </Text>
          </Animated.View>

          <View style={styles.statDivider} />

          <Animated.View
            style={[
              styles.statBlock,
              { opacity: paidAnim, transform: [{ translateY: paidAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
            ]}
          >
            <Text style={styles.statNumber}>
              {formatCurrency(stats.totalPaidOut)}
            </Text>
            <Text style={styles.statCaption}>
              Total paid to winners
            </Text>
          </Animated.View>
        </View>

        {/* ── Quick Steps  ─────────────────────────────── */}
        <View style={styles.stepsSection}>
          {STEPS.map((step, i) => (
            <View key={i} style={styles.stepCard}>
              <View style={[styles.stepIconBg, { backgroundColor: step.bg }]}>
                <Icon source={step.icon} size={24} color={step.color} />
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Footer  ──────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>CHAFFLE</Text>
          <Text style={styles.footerSubtitle}>50/50 CHARITY RAFFLES</Text>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.facebook)}
            >
              <Icon source="facebook" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.instagram)}
            >
              <Icon source="instagram" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.twitter)}
            >
              <Icon source="twitter" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          <Text style={styles.footerCopy}>
            All rights reserved. Chaffle LLC registered in 2024
          </Text>
        </View>
      </ScrollView>

      {/* Snackbar */}
      <Snackbar
        visible={!!error}
        onDismiss={() => setError('')}
        duration={3500}
        action={{ label: 'Dismiss', onPress: () => setError('') }}
        style={styles.snackbar}
      >
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

/* ── Step data ──────────────────────────────────────── */
const STEPS = [
  {
    icon: 'magnify',
    title: 'Find a Raffle',
    desc: 'Enter the Charity ID shared by the organization',
    bg: '#EEF7FA',
    color: COLORS.primary,
  },
  {
    icon: 'ticket-confirmation-outline',
    title: 'Buy Tickets',
    desc: 'Choose your tier and pay securely with Stripe',
    bg: '#F0FAF0',
    color: COLORS.success,
  },
  {
    icon: 'trophy-outline',
    title: 'Win Big',
    desc: '50% goes to charity, 50% to the lucky winner!',
    bg: '#FFF8E7',
    color: '#D97706',
  },
];

/* ── Styles ─────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    flexGrow: 1,
  },

  /* Hero */
  hero: {
    backgroundColor: COLORS.primary,
    paddingTop: 28,
    paddingBottom: 60,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroInner: {
    alignItems: 'center',
  },
  heroLogo: {
    width: 200,
    height: 88,
    marginTop: 16,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 34,
    letterSpacing: 0.3,
  },
  taglineDivider: {
    width: 48,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
    marginVertical: 12,
  },
  subTagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '500',
  },

  /* Search Card */
  searchWrapper: {
    marginTop: -40,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  searchCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: COLORS.white,
  },
  searchHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 2,
  },
  searchSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  searchInput: {
    backgroundColor: COLORS.white,
    fontSize: 14,
    marginBottom: 12,
  },
  searchButton: {
    borderRadius: 10,
  },
  searchButtonInner: {
    paddingVertical: 6,
  },

  /* Stats Band */
  statsBand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    marginHorizontal: 20,
    marginTop: 24,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
  },
  statCaption: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 15,
  },

  /* Steps */
  stepsSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 8,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  /* Footer */
  footer: {
    backgroundColor: COLORS.primary,
    marginTop: 16,
    borderTopLeftRadius: 40,
    paddingTop: 36,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  footerBrand: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 4,
  },
  footerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    letterSpacing: 1,
    fontFamily: 'serif',
  },
  socialRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 16,
  },
  socialIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerCopy: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 20,
    textAlign: 'center',
  },

  /* Snackbar */
  snackbar: {
    backgroundColor: COLORS.destructive,
  },
});
