import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Icon,
  Snackbar,
  Divider,
  Chip,
  Checkbox,
} from 'react-native-paper';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StripeTerminalProvider, type Reader } from '@stripe/stripe-terminal-react-native';
import { COLORS, TICKET_TIERS } from '../../../constants';
import { RootStackParamList, DonationForm } from '../../../types';
import { raffleApi, ticketApi } from '../../../services/api/raffleApi';
import { stripeApi } from '../../../services/api/stripeApi';
import { formatCurrency, getPublicIp } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';
import ErrorScreen from '../../../components/ErrorScreen';
import { useStripeReader } from '../../../hooks/useStripeReader';
import ReaderScanner from '../../../components/ReaderScanner';
import ReaderList from '../../../components/ReaderList';
import ReaderConnectionStatus from '../../../components/ReaderConnectionStatus';
import PaymentStatusOverlay from '../../../components/PaymentStatus';
import { fetchConnectionToken } from '../../../services/stripeTerminal';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type InPersonPaymentRouteProp = RouteProp<RootStackParamList, 'InPersonPayment'>;

type Step = 'tickets' | 'details';

export default function InPersonPaymentScreen() {
  return (
    <StripeTerminalProvider
      logLevel={__DEV__ ? 'verbose' : 'none'}
      tokenProvider={fetchConnectionToken}
    >
      <InPersonPaymentContent />
    </StripeTerminalProvider>
  );
}

function InPersonPaymentContent() {
  const route = useRoute<InPersonPaymentRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { id } = route.params;

  // Raffle data
  const [raffle, setRaffle] = useState<DonationForm | null>(null);
  const [isLoadingRaffle, setIsLoadingRaffle] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reader selection (UI state for selecting before connecting)
  const [selectedReader, setSelectedReader] = useState<Reader.Type | null>(null);

  // Ticket selection
  const [selectedTier, setSelectedTier] = useState<{ price: number; quantity: number } | null>(null);
  const [platformFee, setPlatformFee] = useState(true);

  // Flow step
  const [currentStep, setCurrentStep] = useState<Step>('tickets');

  // Buyer details
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');

  // Snackbar
  const [snackMessage, setSnackMessage] = useState('');

  // ── Stripe Terminal Hook ────────────────────────────────────────────
  const stripeAccountId = (raffle?.stripeAccount as any)?.id;

  const {
    discoveredReaders,
    isDiscovering,
    discoverReaders,
    cancelDiscovery,
    connectedReader,
    connectionStatus,
    connectToReader,
    disconnectReader,
    paymentStatus,
    paymentResult,
    paymentError,
    collectPayment,
    cancelPayment,
    resetPayment,
  } = useStripeReader({ stripeAccount: stripeAccountId });

  // ── Load raffle ─────────────────────────────────────────────────────
  useEffect(() => {
    loadRaffle();
  }, [id]);

  const loadRaffle = async () => {
    setIsLoadingRaffle(true);
    setLoadError(null);
    try {
      const form = await raffleApi.getDonationFormById(id);
      if (!form) {
        setLoadError('Raffle not found');
        return;
      }
      const hasWinner = await ticketApi.hasRaffleWinner(id);
      if (hasWinner) {
        Alert.alert('Raffle Completed', 'This raffle already has a winner.');
        navigation.goBack();
        return;
      }
      setRaffle(form);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load raffle');
    } finally {
      setIsLoadingRaffle(false);
    }
  };

  // ── Reader handlers ─────────────────────────────────────────────────
  const handleDiscover = () => {
    setSelectedReader(null);
    discoverReaders();
  };

  const handleConnect = () => {
    if (!selectedReader) {
      Alert.alert('Select a Reader', 'Please select a reader from the list first');
      return;
    }
    connectToReader(selectedReader);
  };

  // ── Step navigation ─────────────────────────────────────────────────
  const handleProceedToDetails = () => {
    if (!selectedTier) {
      Alert.alert('Select Tickets', 'Please select a ticket package first');
      return;
    }
    setCurrentStep('details');
  };

  const handleBackToTickets = () => {
    setCurrentStep('tickets');
  };

  // ── Payment handler ─────────────────────────────────────────────────
  const handleCollectPayment = async () => {
    // Validate form
    if (!buyerName.trim()) { Alert.alert('Required', 'Name is required'); return; }
    if (!buyerEmail.trim() || !buyerEmail.includes('@')) { Alert.alert('Required', 'Valid email is required'); return; }
    if (!buyerPhone.trim()) { Alert.alert('Required', 'Phone number is required'); return; }
    if (!buyerAddress.trim() || buyerAddress.length < 5) { Alert.alert('Required', 'Please enter a valid address'); return; }
    if (!selectedTier) return;

    if (connectionStatus !== 'connected') {
      Alert.alert('No Reader', 'Please connect a card reader first');
      return;
    }

    try {
      const ip = await getPublicIp().catch(() => 'in-person');

      // 1. Create ticket record in the database (unpaid)
      const ticket = await ticketApi.createTicket({
        email: buyerEmail,
        name: buyerName,
        phone: buyerPhone,
        address: buyerAddress,
        amount: selectedTier.price,
        quantity: selectedTier.quantity,
        raffleId: id,
        ip: ip || 'in-person',
        paid: false,
      });

      // 2. Calculate total with optional platform fee
      const fee = platformFee ? Math.round(selectedTier.price * 0.1) : 0;
      const totalAmount = selectedTier.price + fee;

      // 3. Collect payment via the connected Stripe Terminal reader
      const result = await collectPayment(totalAmount, {
        raffleId: id,
        buyerEmail,
        buyerName,
        quantity: String(selectedTier.quantity),
        ticketId: ticket.id,
      });

      // 4. Mark ticket as paid in the database
      await ticketApi.updateTicket(ticket.id, {
        paid: true,
        stripeSession: { paymentIntentId: result.paymentIntentId },
      });

      // 5. Send confirmation email (fire-and-forget, don't block success)
      stripeApi.sendPurchaseEmail({
        email: buyerEmail,
        quantity: selectedTier.quantity,
        ticketNumber: ticket.id,
      }).catch((err) => console.warn('Confirmation email failed:', err.message));

      setSnackMessage(
        `Payment successful! ${selectedTier.quantity} ticket(s) for ${buyerName}`
      );
    } catch {
      // Payment error is already surfaced via paymentError state from the hook.
      // The admin can retry or cancel from the PaymentStatusOverlay.
    }
  };

  const handleCancelPayment = () => {
    cancelPayment();
  };

  const handleRetryPayment = () => {
    resetPayment();
    handleCollectPayment();
  };

  const handleNewSale = () => {
    resetPayment();
    setCurrentStep('tickets');
    setBuyerName('');
    setBuyerEmail('');
    setBuyerPhone('');
    setBuyerAddress('');
    setSelectedTier(null);
    setPlatformFee(true);
  };

  // ── Loading / error states ──────────────────────────────────────────
  if (isLoadingRaffle) {
    return <LoadingScreen message="Loading raffle…" />;
  }
  if (loadError) {
    return <ErrorScreen message={loadError} onRetry={loadRaffle} />;
  }
  if (!raffle) {
    return <ErrorScreen message="Raffle not found" />;
  }

  const isConnected = connectionStatus === 'connected';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.heading}>In-Person Payment</Text>
          <Text style={styles.subtitle}>
            Accept card payments using Stripe Terminal
          </Text>
          <Text style={styles.raffleName}>
            Raffle: {raffle.title || 'Untitled Raffle'}
          </Text>
        </View>

        {/* ── Card Reader Connection ──────────────────────────────── */}
        <Card style={styles.readerCard}>
          <Card.Content>
            <ReaderConnectionStatus
              status={connectionStatus}
              reader={connectedReader}
              onDisconnect={disconnectReader}
            />

            <Divider style={styles.readerDivider} />

            {!isConnected && (
              <View>
                <ReaderScanner
                  isDiscovering={isDiscovering}
                  onDiscover={handleDiscover}
                  onCancel={cancelDiscovery}
                  disabled={connectionStatus === 'connecting'}
                />

                {discoveredReaders.length > 0 && (
                  <ReaderList
                    readers={discoveredReaders}
                    selectedReader={selectedReader}
                    onSelectReader={setSelectedReader}
                    onConnect={handleConnect}
                    isConnecting={connectionStatus === 'connecting'}
                  />
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* ── Payment Status Overlay ──────────────────────────────── */}
        <PaymentStatusOverlay
          status={paymentStatus}
          error={paymentError}
          result={paymentResult}
          amountInDollars={selectedTier?.price || 0}
          ticketQuantity={selectedTier?.quantity || 0}
          onCancel={handleCancelPayment}
          onRetry={handleRetryPayment}
          onNewSale={handleNewSale}
        />

        {paymentStatus === 'idle' && currentStep === 'tickets' ? (
          /* ── Step 1: Select Tickets ─────────────────────────────── */
          <Card style={styles.stepCard}>
            <Card.Content>
              <View style={styles.stepHeader}>
                <Icon source="ticket" size={20} color={COLORS.foreground} />
                <View>
                  <Text style={styles.stepTitle}>Select Tickets</Text>
                  <Text style={styles.stepDesc}>
                    Choose the ticket package for the customer
                  </Text>
                </View>
              </View>

              <Divider style={styles.stepDivider} />

              {/* Ticket tier grid */}
              <View style={styles.tierGrid}>
                {TICKET_TIERS.map((tier) => {
                  const isSelected = selectedTier?.price === tier.price;
                  const disabled = !isConnected;
                  return (
                    <View
                      key={tier.price}
                      style={[
                        styles.tierCard,
                        isSelected && styles.tierCardSelected,
                        disabled && styles.tierCardDisabled,
                      ]}
                    >
                      <Button
                        mode="text"
                        onPress={() =>
                          !disabled &&
                          setSelectedTier({
                            price: tier.price,
                            quantity: tier.quantity,
                          })
                        }
                        style={styles.tierButton}
                        contentStyle={styles.tierButtonContent}
                        disabled={disabled}
                      >
                        <View style={styles.tierInner}>
                          <Text style={styles.tierQty}>
                            Ticket(s): {tier.quantity}
                          </Text>
                          <View style={styles.tierSep} />
                          <Text style={styles.tierPrice}>
                            {formatCurrency(tier.price)}
                          </Text>
                        </View>
                      </Button>
                    </View>
                  );
                })}
              </View>

              {/* Platform fee checkbox */}
              <View style={styles.feeRow}>
                <Checkbox
                  status={platformFee ? 'checked' : 'unchecked'}
                  onPress={() => setPlatformFee(!platformFee)}
                  color={COLORS.primary}
                  disabled={!isConnected}
                />
                <Text style={styles.feeLabel}>
                  Help support our platform by donating 10%
                </Text>
              </View>

              {/* Selected ticket summary */}
              {selectedTier && (
                <View style={styles.selectedSummary}>
                  <Text style={styles.selectedLabel}>Selected:</Text>
                  <Text style={styles.selectedValue}>
                    {selectedTier.quantity} Ticket
                    {selectedTier.quantity > 1 ? 's' : ''} –{' '}
                    {formatCurrency(selectedTier.price)}
                  </Text>
                </View>
              )}

              {/* Continue button */}
              <Button
                mode="contained"
                icon="account"
                onPress={handleProceedToDetails}
                disabled={!isConnected || !selectedTier}
                style={styles.continueButton}
                contentStyle={styles.continueContent}
              >
                Continue to Buyer Details
              </Button>
            </Card.Content>
          </Card>
        ) : paymentStatus === 'idle' ? (
          /* ── Step 2: Buyer Details ──────────────────────────────── */
          <Card style={styles.stepCard}>
            <Card.Content>
              <View style={styles.stepHeaderRow}>
                <View>
                  <View style={styles.stepHeader}>
                    <Icon
                      source="account"
                      size={20}
                      color={COLORS.foreground}
                    />
                    <View>
                      <Text style={styles.stepTitle}>Buyer Details</Text>
                      <Text style={styles.stepDesc}>
                        Enter the customer information
                      </Text>
                    </View>
                  </View>
                </View>
                {selectedTier && (
                  <Chip
                    style={styles.selectedChip}
                    textStyle={styles.selectedChipText}
                    compact
                  >
                    {selectedTier.quantity} ticket
                    {selectedTier.quantity > 1 ? 's' : ''} –{' '}
                    {formatCurrency(selectedTier.price)}
                  </Chip>
                )}
              </View>

              <Divider style={styles.stepDivider} />

              <TextInput
                mode="outlined"
                label="Name *"
                value={buyerName}
                onChangeText={setBuyerName}
                placeholder="John Doe"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
              />

              <TextInput
                mode="outlined"
                label="Email *"
                value={buyerEmail}
                onChangeText={setBuyerEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="john@email.com"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
              />

              <TextInput
                mode="outlined"
                label="Phone Number *"
                value={buyerPhone}
                onChangeText={setBuyerPhone}
                keyboardType="phone-pad"
                placeholder="+1 (555) 000-0000"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
              />

              <TextInput
                mode="outlined"
                label="Address *"
                value={buyerAddress}
                onChangeText={setBuyerAddress}
                placeholder="H-XXX St-XXX Zip Code"
                multiline
                numberOfLines={3}
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
              />

              {/* Back + Collect buttons */}
              <View style={styles.detailActions}>
                <Button
                  mode="outlined"
                  onPress={handleBackToTickets}
                  style={styles.backButton}
                >
                  Back
                </Button>
                <Button
                  mode="contained"
                  icon="credit-card"
                  onPress={handleCollectPayment}
                  disabled={!isConnected}
                  style={styles.collectButton}
                  contentStyle={styles.collectContent}
                >
                  {`Collect ${formatCurrency(selectedTier?.price || 0)}`}
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {/* ── Error display ───────────────────────────────────────── */}
        {paymentError && paymentStatus === 'idle' && (
          <Card style={styles.errorCard}>
            <Card.Content>
              <Text style={styles.errorText}>{paymentError}</Text>
            </Card.Content>
          </Card>
        )}

        {/* ── How to use instructions ─────────────────────────────── */}
        <Card style={styles.instructionsCard}>
          <Card.Content>
            <Text style={styles.instructionsTitle}>
              How to use:
            </Text>
            {[
              'Turn on your Stripe M2 reader and ensure Bluetooth is enabled',
              'Tap "Find Readers" to scan for nearby readers',
              'Select the reader and tap "Connect"',
              'Select the ticket package for the customer',
              "Enter the buyer's details (name, email, phone, address)",
              'Tap "Collect" — the customer taps or inserts their card on the M2',
            ].map((step, i) => (
              <View key={i} style={styles.instructionRow}>
                <Text style={styles.instructionNum}>{i + 1}.</Text>
                <Text style={styles.instructionText}>{step}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      </ScrollView>

      <Snackbar
        visible={!!snackMessage}
        onDismiss={() => setSnackMessage('')}
        duration={3000}
      >
        {snackMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  /* Header */
  header: { alignItems: 'center', marginBottom: 20 },
  heading: { fontSize: 24, fontWeight: 'bold', color: COLORS.foreground },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  raffleName: { fontSize: 13, fontWeight: '600', color: COLORS.primary, marginTop: 4 },

  /* Reader card */
  readerCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginBottom: 16, elevation: 2, borderWidth: 1.5, borderColor: COLORS.border },
  readerDivider: { marginVertical: 12 },

  /* Step card */
  stepCard: { backgroundColor: COLORS.surface, borderRadius: 12, marginBottom: 16, elevation: 2, borderWidth: 1.5, borderColor: COLORS.border },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stepTitle: { fontSize: 16, fontWeight: '700', color: COLORS.foreground },
  stepDesc: { fontSize: 12, color: COLORS.textSecondary },
  stepDivider: { marginVertical: 12 },

  /* Tier grid */
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tierCard: { width: '31%', backgroundColor: COLORS.primary, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  tierCardSelected: { borderColor: COLORS.foreground, transform: [{ scale: 1.03 }] },
  tierCardDisabled: { opacity: 0.45 },
  tierButton: { borderRadius: 0, margin: 0 },
  tierButtonContent: { paddingVertical: 6 },
  tierInner: { alignItems: 'center' },
  tierQty: { fontSize: 12, fontWeight: '600', color: COLORS.white, fontFamily: 'monospace' },
  tierSep: { height: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 4 },
  tierPrice: { fontSize: 15, fontWeight: '700', color: COLORS.white },

  /* Platform fee */
  feeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  feeLabel: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },

  /* Selected summary */
  selectedSummary: { backgroundColor: 'rgba(70,151,175,0.08)', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 12 },
  selectedLabel: { fontSize: 12, color: COLORS.textSecondary },
  selectedValue: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary, marginTop: 2 },

  /* Continue button */
  continueButton: { backgroundColor: COLORS.primary, borderRadius: 8 },
  continueContent: { paddingVertical: 8 },

  /* Buyer details chip */
  selectedChip: { backgroundColor: 'rgba(70,151,175,0.12)' },
  selectedChipText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  /* Input */
  input: { backgroundColor: COLORS.surface, marginBottom: 8 },

  /* Detail actions */
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  backButton: { flex: 1, borderColor: COLORS.border, borderRadius: 8 },
  collectButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 8 },
  collectContent: { paddingVertical: 8 },

  /* Error */
  errorCard: { backgroundColor: '#FEF2F2', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { fontSize: 13, color: '#DC2626' },

  /* Instructions */
  instructionsCard: { backgroundColor: COLORS.surfaceMuted, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  instructionsTitle: { fontSize: 15, fontWeight: '600', color: COLORS.foreground, marginBottom: 10 },
  instructionRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  instructionNum: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600', minWidth: 18 },
  instructionText: { fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 18 },
});
