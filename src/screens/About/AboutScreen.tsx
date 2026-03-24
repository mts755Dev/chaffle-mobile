import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { Text, Card, Icon, Divider } from 'react-native-paper';
import { COLORS, SOCIAL_LINKS } from '../../constants';

const chaffleLogo = require('../../../assets/chaffle-logo.png');

/* ── Content from the web home page ──────────────────────────────── */
const MISSION_TEXT =
  'Our Mission is to harness the power of cutting-edge technology to ' +
  'connect charities and nonprofits with untapped markets via creative, ' +
  'engaging, and easy to use online 50/50 raffles that maximize ' +
  'fundraising potential.';

const VISION_TEXT =
  'Our Vision is to revolutionize the way that charities and non-profits ' +
  'fundraise by pioneering innovative 50/50 raffle strategies.';

/* ── "How It Works" steps ────────────────────────────────────────── */
const HOW_IT_WORKS = [
  {
    icon: 'account-group' as const,
    title: 'Charities Sign Up',
    desc: 'Non-profits create a raffle through the Chaffle platform and share a unique link or ID with supporters.',
    bg: '#EEF7FA',
    color: COLORS.primary,
  },
  {
    icon: 'ticket-confirmation-outline' as const,
    title: 'Supporters Buy Tickets',
    desc: 'Anyone can enter the raffle by purchasing tickets online — securely processed through Stripe.',
    bg: '#F0FAF0',
    color: COLORS.success,
  },
  {
    icon: 'cash-multiple' as const,
    title: '50 / 50 Split',
    desc: '50% of every dollar goes directly to the charity. The other 50% builds the prize pool for the winner.',
    bg: '#FFF8E7',
    color: '#D97706',
  },
  {
    icon: 'trophy-outline' as const,
    title: 'Winner Is Drawn',
    desc: 'On draw day the lucky winner takes home half the pot — and the charity keeps the other half. Everyone wins!',
    bg: '#F5F0FF',
    color: '#7C3AED',
  },
];

/* ── Values ──────────────────────────────────────────────────────── */
const VALUES = [
  { icon: 'shield-check', label: 'Transparent' },
  { icon: 'lightning-bolt', label: 'Innovative' },
  { icon: 'heart', label: 'Impactful' },
  { icon: 'handshake', label: 'Community' },
];

export default function AboutScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero Banner ─────────────────────────────────────────── */}
      <View style={styles.hero}>
        <Image source={chaffleLogo} style={styles.logo} resizeMode="contain" />
        <Text style={styles.heroTitle}>About Chaffle</Text>
        <Text style={styles.heroSubtitle}>
          Empowering charities through{'\n'}innovative 50/50 raffles
        </Text>
      </View>

      {/* ── Mission ─────────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#EEF7FA' }]}>
              <Icon source="flag-outline" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.sectionTitle}>Mission</Text>
          </View>
          <Divider style={styles.divider} />
          <Text style={styles.bodyText}>{MISSION_TEXT}</Text>
        </Card.Content>
      </Card>

      {/* ── Our Vision ──────────────────────────────────────────── */}
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#F5F0FF' }]}>
              <Icon source="eye-outline" size={22} color="#7C3AED" />
            </View>
            <Text style={styles.sectionTitle}>Our Vision</Text>
          </View>
          <Divider style={styles.divider} />
          <Text style={styles.bodyText}>{VISION_TEXT}</Text>
        </Card.Content>
      </Card>

      {/* ── Core Values ─────────────────────────────────────────── */}
      <Text style={styles.groupHeading}>Our Core Values</Text>
      <View style={styles.valuesRow}>
        {VALUES.map((v) => (
          <View key={v.label} style={styles.valueItem}>
            <View style={styles.valueBubble}>
              <Icon source={v.icon} size={26} color={COLORS.primary} />
            </View>
            <Text style={styles.valueLabel}>{v.label}</Text>
          </View>
        ))}
      </View>

      {/* ── How It Works ────────────────────────────────────────── */}
      <Text style={styles.groupHeading}>How It Works</Text>
      {HOW_IT_WORKS.map((step, i) => (
        <View key={i} style={styles.stepCard}>
          <View style={styles.stepNumberBubble}>
            <Text style={styles.stepNumber}>{i + 1}</Text>
          </View>
          <View style={[styles.stepIconBg, { backgroundColor: step.bg }]}>
            <Icon source={step.icon} size={24} color={step.color} />
          </View>
          <View style={styles.stepText}>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDesc}>{step.desc}</Text>
          </View>
        </View>
      ))}

      {/* ── Connect With Us ─────────────────────────────────────── */}
      <Card style={[styles.card, styles.connectCard]}>
        <Card.Content style={styles.connectContent}>
          <Text style={styles.connectTitle}>Connect With Us</Text>
          <Text style={styles.connectSubtitle}>
            Follow Chaffle on social media for updates, success stories, and upcoming raffles.
          </Text>
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
            <TouchableOpacity
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.website)}
            >
              <Icon source="web" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </Card.Content>
      </Card>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Chaffle LLC — Registered 2024
        </Text>
        <Text style={styles.footerText}>
          All rights reserved.
        </Text>
      </View>
    </ScrollView>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 32,
  },

  /* Hero */
  hero: {
    backgroundColor: COLORS.primary,
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  logo: {
    width: 160,
    height: 70,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },

  /* Cards */
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    elevation: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  divider: {
    marginVertical: 12,
  },
  bodyText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 24,
    textAlign: 'justify',
  },

  /* Group heading */
  groupHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.foreground,
    marginTop: 28,
    marginBottom: 12,
    marginHorizontal: 16,
  },

  /* Values */
  valuesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  valueItem: {
    alignItems: 'center',
    flex: 1,
  },
  valueBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(70,151,175,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  valueLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.foreground,
  },

  /* How it works steps */
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 1,
  },
  stepNumberBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 10,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  stepIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.foreground,
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },

  /* Connect card */
  connectCard: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    marginTop: 28,
  },
  connectContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  connectTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  connectSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 14,
  },
  socialIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Footer */
  footer: {
    alignItems: 'center',
    marginTop: 28,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
  },
});
