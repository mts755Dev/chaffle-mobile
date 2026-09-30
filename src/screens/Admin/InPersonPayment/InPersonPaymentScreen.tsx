import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Icon,
  Snackbar,
  Divider,
  Chip,
  Checkbox,
} from 'react-native-paper';
import TextInput from '../../../components/AppTextInput';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useStripeTerminalAccountScope } from '../../../contexts/StripeTerminalAccountContext';
import { useAuthStore } from '../../../store/authStore';
import { blockWorkerFromForeignRaffle } from '../../../utils/workerAccess';
import {
  canUseInPersonPayment,
  isTapToPayPaymentReady,
  resolveTapToPayOrganizationId,
  showOrgStripeRequiredAlert,
  usesOrganizationStripe,
} from '../../../utils/tapToPayAccess';
import { COLORS, TICKET_TIERS, CUSTOM_TICKET_DOLLARS_MIN, customTicketQuantityFromDollars } from '../../../constants';
import { RootStackParamList, DonationForm } from '../../../types';
import { raffleApi, ticketApi } from '../../../services/api/raffleApi';
import { stripeApi } from '../../../services/api/stripeApi';
import { useRaffleStore } from '../../../store/raffleStore';
import { formatCurrency, formatNumber, getPublicIp, getTicketReferenceId, getOrgLogoUrl } from '../../../utils';
import LoadingScreen from '../../../components/LoadingScreen';
import ErrorScreen from '../../../components/ErrorScreen';
import { useStripeReader } from '../../../hooks/useStripeReader';
import ReaderConnectionStatus from '../../../components/ReaderConnectionStatus';
import PaymentStatusOverlay from '../../../components/PaymentStatus';
import TapToPayCheckoutButton from '../../../components/TapToPayCheckoutButton';
import PaymentChargeSummary from '../../../components/PaymentChargeSummary';
import { computeChargeBreakdown, formatChargeCents } from '../../../utils/paymentFees';
import TapToPayIcon from '../../../components/TapToPayIcon';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type InPersonPaymentRouteProp = RouteProp<RootStackParamList, 'InPersonPayment'>;

type Step = 'tickets' | 'details';

/**
 * Loads the raffle, then scopes the app-wide Terminal token provider to this
 * raffle's connected Stripe account for direct charges.
 */
export default function InPersonPaymentScreen() {
  const route = useRoute<InPersonPaymentRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { id } = route.params;
  const { role, raffleId: workerRaffleId } = useAuthStore();

  const [raffle, setRaffle] = useState<DonationForm | null>(null);
  const [isLoadingRaffle, setIsLoadingRaffle] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workerBlocked, setWorkerBlocked] = useState(false);

  const loadRaffle = useCallback(async () => {
    if (
      !blockWorkerFromForeignRaffle(role, workerRaffleId, id, () =>
        navigation.goBack(),
      )
    ) {
      setWorkerBlocked(true);
      setIsLoadingRaffle(false);
      return;
    }

    setIsLoadingRaffle(true);
    setLoadError(null);
    try {
      const form = await raffleApi.getDonationFormById(id);
      if (!form) { setLoadError('Raffle not found'); return; }
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
  }, [id, navigation, role, workerRaffleId]);

  useEffect(() => { loadRaffle(); }, [loadRaffle]);

  if (workerBlocked) return null;
  if (isLoadingRaffle) return <LoadingScreen message="Loading raffle…" />;
  if (loadError) return <ErrorScreen message={loadError} onRetry={loadRaffle} />;
  if (!raffle) return <ErrorScreen message="Raffle not found" />;

  return <InPersonPaymentContent raffle={raffle} />;
}

function InPersonPaymentContent({ raffle }: { raffle: DonationForm }) {
  const route = useRoute<InPersonPaymentRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { id } = route.params;
  const {
    isAdmin,
    role,
    organizationId,
    orgStripeConnected,
    orgStripeAccountId,
  } = useAuthStore();

  const tapToPayOrgId = resolveTapToPayOrganizationId(
    raffle.organization_id,
    organizationId,
  );
  const isOrgScoped = usesOrganizationStripe(role, tapToPayOrgId);
  // Org raffles often have no per-raffle Stripe — charge on the org connected account.
  const stripeAccountId =
    ((raffle.stripeAccount as any)?.id as string | undefined) ??
    (isOrgScoped ? orgStripeAccountId ?? undefined : undefined);
  const merchantDisplayName = raffle.title?.trim() || 'Raffle';
  useStripeTerminalAccountScope(stripeAccountId);

  const orgStripeReady = isTapToPayPaymentReady(
    role,
    orgStripeConnected,
    orgStripeAccountId,
    tapToPayOrgId,
    raffle.stripeAccount,
  );

  useEffect(() => {
    if (isOrgScoped && !orgStripeReady) {
      showOrgStripeRequiredAlert(() => navigation.goBack(), role);
      return;
    }
    if (!stripeAccountId) {
      Alert.alert(
        'Stripe required',
        isOrgScoped
          ? 'Your organization does not have Stripe connected yet. Ask your organization admin to connect Stripe before using Tap to Pay on iPhone.'
          : 'This raffle does not have Stripe connected. Link Stripe on the raffle before using Tap to Pay on iPhone.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  }, [stripeAccountId, isOrgScoped, orgStripeReady, role, navigation]);

  useEffect(() => {
    if (
      !canUseInPersonPayment(
        isAdmin,
        role,
        orgStripeConnected,
        orgStripeAccountId,
        tapToPayOrgId,
        raffle.stripeAccount,
      )
    ) {
      navigation.goBack();
    }
  }, [
    isAdmin,
    role,
    orgStripeConnected,
    orgStripeAccountId,
    tapToPayOrgId,
    raffle.stripeAccount,
    navigation,
  ]);

  if (
    !canUseInPersonPayment(
      isAdmin,
      role,
      orgStripeConnected,
      orgStripeAccountId,
      tapToPayOrgId,
      raffle.stripeAccount,
    )
  ) {
    return null;
  }

  if (!orgStripeReady || !stripeAccountId) {
    return null;
  }

  // Ticket selection
  const [selectedTier, setSelectedTier] = useState<{ price: number; quantity: number } | null>(null);
  const [customAmountText, setCustomAmountText] = useState('');
  const [customAmountError, setCustomAmountError] = useState('');
  const [customAmountActive, setCustomAmountActive] = useState(false);
  const [customAmountBlurToken, setCustomAmountBlurToken] = useState(0);
  const [platformFee, setPlatformFee] = useState(true);
  const customAmountInputRef = useRef<any>(null);

  const isCustomAmountSelected =
    customAmountActive ||
    (!!selectedTier &&
      !TICKET_TIERS.some(
        (t) => t.price === selectedTier.price && t.quantity === selectedTier.quantity,
      ));

  const selectPresetTier = (price: number, quantity: number) => {
    Keyboard.dismiss();
    customAmountInputRef.current?.blur?.();
    setCustomAmountText('');
    setCustomAmountError('');
    setCustomAmountActive(false);
    setCustomAmountBlurToken((n) => n + 1);
    setSelectedTier({ price, quantity });
  };

  const beginCustomAmount = () => {
    setCustomAmountActive(true);
    setSelectedTier(null);
    setCustomAmountError('');
  };

  const applyCustomAmount = (raw: string) => {
    // Digits only — whole dollars
    const cleaned = raw.replace(/[^0-9]/g, '');
    setCustomAmountText(cleaned);
    setCustomAmountActive(true);

    if (!cleaned) {
      setCustomAmountError('');
      setSelectedTier(null);
      return;
    }

    const dollars = Number(cleaned);
    if (!Number.isFinite(dollars) || dollars <= CUSTOM_TICKET_DOLLARS_MIN) {
      setCustomAmountError(
        `Enter more than $${CUSTOM_TICKET_DOLLARS_MIN}. For $${CUSTOM_TICKET_DOLLARS_MIN} or less, choose a package above.`,
      );
      setSelectedTier(null);
      return;
    }

    setCustomAmountError('');
    setSelectedTier({
      price: dollars,
      quantity: customTicketQuantityFromDollars(dollars),
    });
  };

  // Flow step
  const [currentStep, setCurrentStep] = useState<Step>('tickets');

  // Buyer details
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const emailRef = useRef<any>(null);
  const phoneRef = useRef<any>(null);
  const addressRef = useRef<any>(null);

  // Snackbar
  const [snackMessage, setSnackMessage] = useState('');

  // ── Stripe Terminal Hook ────────────────────────────────────────────
  const {
    connectedReader,
    connectionStatus,
    autoConnect,
    disconnectReader,
    paymentStatus,
    paymentOutcome,
    paymentResult,
    paymentError,
    readerUpdateProgress,
    collectPaymentWithReaderReady,
    cancelPayment,
    resetPayment,
  } = useStripeReader({ stripeAccount: stripeAccountId, merchantDisplayName });

  const hasAutoConnectedRef = useRef<string | undefined>(undefined);
  const lastTicketIdRef = useRef<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Auto-connect after raffle Stripe account is scoped (avoids platform/connected mismatch)
  useEffect(() => {
    if (!stripeAccountId) return;
    if (hasAutoConnectedRef.current === stripeAccountId) return;
    hasAutoConnectedRef.current = stripeAccountId;
    void autoConnect();
  }, [stripeAccountId, autoConnect]);

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
  const ensureTicket = async (): Promise<string> => {
    if (lastTicketIdRef.current) return lastTicketIdRef.current;
    if (!selectedTier) throw new Error('No ticket package selected');

    const ip = await getPublicIp().catch(() => 'in-person');

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
    lastTicketIdRef.current = ticket.id;
    return ticket.id;
  };

  const handleCollectPayment = async () => {
    if (!buyerName.trim()) { Alert.alert('Required', 'Name is required'); return; }
    if (!buyerEmail.trim() || !buyerEmail.includes('@')) { Alert.alert('Required', 'Valid email is required'); return; }
    if (!buyerPhone.trim()) { Alert.alert('Required', 'Phone number is required'); return; }
    if (!buyerAddress.trim() || buyerAddress.length < 5) { Alert.alert('Required', 'Please enter a valid address'); return; }
    if (!selectedTier) return;

    setCheckoutBusy(true);

    try {
      const ticketId = await ensureTicket();

      const result = await collectPaymentWithReaderReady(
        selectedTier.price,
        {
          raffleId: id,
          raffleName: merchantDisplayName,
          description: `${merchantDisplayName} — in-person ticket purchase`,
          buyerEmail,
          buyerName,
          quantity: String(selectedTier.quantity),
          ticketId,
        },
        platformFee,
      );

      await ticketApi.updateTicket(ticketId, {
        paid: true,
        stripeSession: { paymentIntentId: result.paymentIntentId },
      });

      // Keep admin/worker dashboard pot + ticket counts fresh without re-signin
      void useRaffleStore.getState().fetchTicketTotals(id);

      stripeApi.sendPurchaseEmail({
        email: buyerEmail,
        quantity: selectedTier.quantity,
        ticketNumber: getTicketReferenceId(ticketId),
        raffleId: id,
        ticketId,
        organizationLogoUrl: getOrgLogoUrl(raffle.backgroundImage),
      }).catch((err) => console.warn('Confirmation email failed:', err.message));

      setSnackMessage(
        `Payment successful! ${selectedTier.quantity} ticket(s) for ${buyerName}`
      );
    } catch {
      // Payment error is surfaced via PaymentStatusOverlay (declined / timed out).
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleSendEmailReceipt = async () => {
    if (!buyerEmail.trim() || !selectedTier) {
      throw new Error('Customer email is required to send a receipt.');
    }
    const ticketNumber = lastTicketIdRef.current;
    if (!ticketNumber) {
      throw new Error('No ticket reference for this payment.');
    }
    await stripeApi.sendPurchaseEmail({
      email: buyerEmail.trim(),
      quantity: selectedTier.quantity,
      ticketNumber: getTicketReferenceId(ticketNumber),
      raffleId: id,
      ticketId: ticketNumber,
      organizationLogoUrl: getOrgLogoUrl(raffle.backgroundImage),
    });
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
    lastTicketIdRef.current = null;
    setCurrentStep('tickets');
    setBuyerName('');
    setBuyerEmail('');
    setBuyerPhone('');
    setBuyerAddress('');
    setSelectedTier(null);
    setPlatformFee(true);
  };

  const isConnected = connectionStatus === 'connected';
  const showCheckoutFooter =
    paymentStatus === 'idle' && currentStep === 'details' && !!selectedTier;
  const paymentActive = paymentStatus !== 'idle';
  const customerChargeBreakdown = selectedTier
    ? computeChargeBreakdown(selectedTier.price, {
        includePlatformFee: platformFee,
        channel: 'terminal',
      })
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          showCheckoutFooter && styles.contentWithFooter,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.heading} children="Tap to Pay on iPhone" />
          <Text style={styles.subtitle} children="Accept card payments using Tap to Pay on iPhone" />
          <Text
            style={styles.raffleName}
            children={`Raffle: ${raffle.title || 'Untitled Raffle'}`}
          />
        </View>

        {/* ── Tap to Pay Connection Status ─────────────────────────── */}
        <Card
          style={styles.readerCard}
          children={
            <Card.Content
              children={
                <>
                  <ReaderConnectionStatus
                    status={connectionStatus}
                    reader={connectedReader}
                    onDisconnect={disconnectReader}
                    updateProgress={readerUpdateProgress}
                  />

                  {!isConnected && connectionStatus !== 'connecting' && (
                    <>
                      <Divider style={styles.readerDivider} />
                      <Button
                        mode="outlined"
                        icon={({ size, color }) => (
                          <TapToPayIcon size={size} color={color} />
                        )}
                        onPress={autoConnect}
                        style={{ borderColor: COLORS.border, borderRadius: 8 }}
                        children="Reconnect Tap to Pay on iPhone"
                      />
                    </>
                  )}
                </>
              }
            />
          }
        />

        {/* ── Payment Status Overlay ──────────────────────────────── */}
        {paymentActive && (
          <PaymentStatusOverlay
            status={paymentStatus}
            outcome={paymentOutcome}
            error={paymentError}
            result={paymentResult}
            customerChargeCents={customerChargeBreakdown?.totalCents ?? 0}
            ticketQuantity={selectedTier?.quantity || 0}
            buyerName={buyerName}
            buyerEmail={buyerEmail}
            ticketId={lastTicketIdRef.current ?? undefined}
            onSendEmailReceipt={handleSendEmailReceipt}
            onCancel={handleCancelPayment}
            onRetry={handleRetryPayment}
            onNewSale={handleNewSale}
          />
        )}

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
                  const isSelected =
                    !isCustomAmountSelected &&
                    selectedTier?.price === tier.price &&
                    selectedTier?.quantity === tier.quantity;
                  return (
                    <View
                      key={tier.price}
                      style={[
                        styles.tierCard,
                        isSelected && styles.tierCardSelected,
                      ]}
                    >
                      <Button
                        mode="text"
                        onPress={() => selectPresetTier(tier.price, tier.quantity)}
                        style={styles.tierButton}
                        contentStyle={styles.tierButtonContent}
                      >
                        <View style={styles.tierInner}>
                          <Text style={styles.tierQty}>
                            Ticket(s): {formatNumber(tier.quantity)}
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

              {/* Custom amount — 3 tickets / $1, must be greater than $250 */}
              <View
                style={[
                  styles.customAmountCard,
                  isCustomAmountSelected && styles.customAmountCardSelected,
                ]}
              >
                <Text style={styles.customAmountTitle}>Or enter any amount</Text>
                <Text style={styles.customAmountHint}>
                  3 tickets for every $1
                </Text>
                <TextInput
                  ref={customAmountInputRef}
                  key={`custom-amount-${customAmountBlurToken}`}
                  mode="outlined"
                  label="Amount ($)"
                  value={customAmountText}
                  onChangeText={applyCustomAmount}
                  onFocus={beginCustomAmount}
                  keyboardType="number-pad"
                  placeholder={`e.g. 1250`}
                  style={styles.customAmountInput}
                  outlineColor={
                    customAmountError
                      ? COLORS.error
                      : isCustomAmountSelected
                        ? COLORS.primary
                        : COLORS.border
                  }
                  activeOutlineColor={
                    customAmountError ? COLORS.error : COLORS.primary
                  }
                  textColor={COLORS.foreground}
                  left={<TextInput.Affix text="$" />}
                  error={!!customAmountError}
                />
                {customAmountError ? (
                  <Text style={styles.customAmountError}>{customAmountError}</Text>
                ) : null}
                {isCustomAmountSelected && selectedTier ? (
                  <Text style={styles.customAmountPreview}>
                    {formatCurrency(selectedTier.price)} →{' '}
                    {formatNumber(selectedTier.quantity)} tickets
                  </Text>
                ) : null}
              </View>

              {/* Platform fee checkbox */}
              <View style={styles.feeRow}>
                <Checkbox.Android
                  status={platformFee ? 'checked' : 'unchecked'}
                  onPress={() => setPlatformFee(!platformFee)}
                  color={COLORS.primary}
                  uncheckedColor={COLORS.textSecondary}
                  disabled={!isConnected}
                />
                <Text style={styles.feeLabel}>
                  Help support our platform by donating 10%
                </Text>
              </View>

              {/* Selected ticket summary */}
              {selectedTier && (
                <View style={styles.selectedSummary}>
                  <PaymentChargeSummary
                    baseAmount={selectedTier.price}
                    includePlatformFee={platformFee}
                    channel="terminal"
                    compact
                  />
                </View>
              )}

              {/* Continue button */}
              <Button
                mode="contained"
                icon="account"
                onPress={handleProceedToDetails}
                disabled={!selectedTier}
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
                    {customerChargeBreakdown
                      ? formatChargeCents(customerChargeBreakdown.totalCents)
                      : formatCurrency(selectedTier.price)}
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
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emailRef.current?.focus()}
              />

              <TextInput
                ref={emailRef}
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
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => phoneRef.current?.focus()}
              />

              <TextInput
                ref={phoneRef}
                mode="outlined"
                label="Phone Number *"
                value={buyerPhone}
                onChangeText={setBuyerPhone}
                // ponytail: default (not phone-pad) so Return/Next exists and advances to Address
                keyboardType="default"
                textContentType="telephoneNumber"
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => addressRef.current?.focus()}
              />

              <TextInput
                ref={addressRef}
                mode="outlined"
                label="Address *"
                value={buyerAddress}
                onChangeText={setBuyerAddress}
                placeholder="H-XXX St-XXX Zip Code"
                style={styles.input}
                outlineColor={COLORS.border}
                activeOutlineColor={COLORS.primary}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={() => Keyboard.dismiss()}
              />

              <Button
                mode="outlined"
                onPress={handleBackToTickets}
                style={styles.backButtonOnly}
              >
                Back to tickets
              </Button>
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
              'Tap to Pay on iPhone connects automatically when this screen opens',
              'Select the ticket package for the customer',
              "Enter the buyer's details (name, email, phone, address)",
              'Tap "Tap to Pay on iPhone" — hold the customer\'s card near the top of your iPhone',
              'Keep the card near the phone until the payment is confirmed',
            ].map((step, i) => (
              <View key={i} style={styles.instructionRow}>
                <Text style={styles.instructionNum}>{i + 1}.</Text>
                <Text style={styles.instructionText}>{step}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>
      </ScrollView>

      {showCheckoutFooter && (
        <TapToPayCheckoutButton
          amountFormatted={
            customerChargeBreakdown
              ? formatChargeCents(customerChargeBreakdown.totalCents)
              : '$0.00'
          }
          onPress={handleCollectPayment}
          loading={checkoutBusy}
        />
      )}

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
  contentWithFooter: { paddingBottom: 16 },

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
  tierCard: {
    width: '31%',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  // Same golden selected state as Buy Tickets (TicketTierSelector)
  tierCardSelected: {
    backgroundColor: '#ff9900',
    borderColor: '#ff9900',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  tierCardDisabled: { opacity: 0.45 },
  tierButton: { borderRadius: 0, margin: 0 },
  tierButtonContent: { paddingVertical: 6 },
  tierInner: { alignItems: 'center' },
  tierQty: { fontSize: 12, fontWeight: '600', color: COLORS.white, fontFamily: 'monospace' },
  tierSep: { height: 1, width: '100%', backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 4 },
  tierPrice: { fontSize: 15, fontWeight: '700', color: COLORS.white },

  customAmountCard: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.surfaceMuted,
  },
  customAmountCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(70,151,175,0.08)',
  },
  customAmountTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.foreground,
  },
  customAmountHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  customAmountInput: {
    backgroundColor: COLORS.surface,
  },
  customAmountError: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 6,
  },
  customAmountPreview: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 8,
  },

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

  backButtonOnly: { marginTop: 12, borderColor: COLORS.border, borderRadius: 8 },

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
