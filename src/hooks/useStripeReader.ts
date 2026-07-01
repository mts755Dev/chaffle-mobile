/**
 * useStripeReader — Custom hook for Stripe Terminal Tap to Pay lifecycle.
 *
 * Manages: initialization → discovery → connection → payment collection → cleanup.
 * Uses the official @stripe/stripe-terminal-react-native SDK with Tap to Pay on iPhone.
 *
 * Set EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED=true in .env
 * to use a virtual reader for development without physical hardware.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  useStripeTerminal,
  type Reader,
} from '@stripe/stripe-terminal-react-native';
import { stripeApi } from '../services/api/stripeApi';
import {
  terminalLog,
  getSdkSessionScope,
  setSdkSessionScope,
} from '../services/stripeTerminal';
import {
  notifyTapToPayTermsAcceptedFromApple,
  setTapToPayTermsAcceptedFromAppleSynced,
  getTapToPayTermsAcceptedFromApple,
  clearTapToPayTermsSession,
} from '../services/tapToPayTermsState';
import { STRIPE_TERMINAL_SIMULATED } from '../constants';
import { classifyTerminalPaymentError } from '../utils/terminalPaymentOutcome';
import { markTapToPaySetupComplete, clearTapToPayOnboardingPrefs } from '../services/tapToPayPrefs';
import type {
  ReaderConnectionStatus,
  TerminalPaymentStatus,
  TerminalPaymentResult,
  TerminalPaymentOutcome,
} from '../types';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
/** First-time Tap to Pay can install reader software for 1–2+ minutes. */
const CONNECT_TIMEOUT_MS = 180_000;

/**
 * Wrap a promise with a timeout. Rejects with a message if not settled in time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

function isBenignDiscoveryError(error: any): boolean {
  const code = error?.code ?? '';
  const nativeCode = error?.nativeErrorCode ?? '';
  const msg = (error?.message ?? '').toLowerCase();
  return (
    code === 'CANCELED' ||
    code === 'ALREADY_CONNECTED_TO_READER' ||
    nativeCode === 'USER_ERROR.CANCELED' ||
    msg.includes('canceled') ||
    msg.includes('already connected')
  );
}

function isOsVersionNotSupportedError(error: any): boolean {
  const code = (error?.code ?? '').toString();
  const nativeCode = (error?.nativeErrorCode ?? '').toString();
  const msg = (error?.message ?? '').toLowerCase();
  return (
    code.includes('OS_VERSION') ||
    nativeCode.includes('OS_VERSION') ||
    msg.includes('osversionnotsupported') ||
    msg.includes('os version not supported')
  );
}

function formatTerminalErrorMessage(error: any, fallback: string): string {
  if (isOsVersionNotSupportedError(error)) {
    return 'Tap to Pay on iPhone requires a newer version of iOS. Please update your iPhone to the latest iOS and try again.';
  }
  return error?.message || fallback;
}

function isAlreadyConnectedError(error: any): boolean {
  const code = error?.code ?? '';
  const msg = (error?.message ?? '').toLowerCase();
  return code === 'ALREADY_CONNECTED_TO_READER' || msg.includes('already connected');
}

function isConnectedReaderPayload(
  value: Reader.Type | { error?: unknown } | null | undefined
): value is Reader.Type {
  return (
    value != null &&
    typeof value === 'object' &&
    'deviceType' in value &&
    !('error' in value && (value as { error?: unknown }).error)
  );
}

interface UseStripeReaderOptions {
  stripeAccount?: string;
  /** Shown on the Apple/Stripe payment sheet — use the raffle / NGO name at checkout. */
  merchantDisplayName?: string;
}

function resolveMerchantDisplayName(name?: string, fallback = 'Chaffle'): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed.slice(0, 64);
  }
  return fallback;
}

export function useStripeReader(options: UseStripeReaderOptions = {}) {
  const { stripeAccount, merchantDisplayName } = options;
  const terminalMerchantName = resolveMerchantDisplayName(
    merchantDisplayName,
    stripeAccount ? 'Raffle' : 'Chaffle',
  );

  // Ref to track whether auto-connect is in progress so the
  // onUpdateDiscoveredReaders callback can trigger connection directly.
  const autoConnectingRef = useRef(false);
  const connectToReaderRef = useRef<(reader: Reader.Type) => Promise<void>>(undefined);
  const readerUpdateInProgressRef = useRef(false);
  const pendingReaderForConnectRef = useRef<Reader.Type | null>(null);
  const connectInProgressRef = useRef(false);
  const syncConnectionFromSdkRef = useRef<() => Promise<boolean>>(async () => false);
  /** True when user explicitly triggered setup/connect (not warmup). */
  const userInitiatedConnectRef = useRef(false);
  /** True during beginTapToPaySetup — blocks stale SDK sync from skipping T&C. */
  const setupFlowActiveRef = useRef(false);

  const {
    initialize: sdkInitialize,
    isInitialized,
    discoverReaders: sdkDiscoverReaders,
    cancelDiscovering,
    connectReader: sdkConnectReader,
    easyConnect: sdkEasyConnect,
    disconnectReader: sdkDisconnectReader,
    getConnectedReader: sdkGetConnectedReader,
    getConnectionStatus: sdkGetConnectionStatus,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    clearCachedCredentials: sdkClearCachedCredentials,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      terminalLog.discovery(
        `Found ${readers.length} reader(s)`,
        readers.map((r) => r.serialNumber)
      );
      setDiscoveredReaders(readers);

      // If auto-connecting, grab the first reader and connect immediately
      if (autoConnectingRef.current && readers.length > 0) {
        autoConnectingRef.current = false;
        connectToReaderRef.current?.(readers[0]);
      }
    },
    onFinishDiscoveringReaders: (error) => {
      setIsDiscovering(false);
      if (error) {
        if (isBenignDiscoveryError(error)) {
          terminalLog.discovery('Discovery ended (connecting or already connected)');
          if (!setupFlowActiveRef.current) {
            void syncConnectionFromSdkRef.current();
          }
          return;
        }
        terminalLog.error('Discovery finished with error', error);
      } else {
        terminalLog.discovery('Discovery finished');
        if (!setupFlowActiveRef.current) {
          void syncConnectionFromSdkRef.current();
        }
      }
    },
    onDidChangeConnectionStatus: (status) => {
      terminalLog.connection(`Connection status changed: ${status}`);
      if (status === 'connected' && userInitiatedConnectRef.current) {
        if (setupFlowActiveRef.current) {
          void (async () => {
            const readerResult = await sdkGetConnectedReader();
            if (isConnectedReaderPayload(readerResult)) {
              applyConnectedReader(readerResult);
            }
          })();
        } else {
          void syncConnectionFromSdkRef.current();
        }
      } else if (status === 'notConnected') {
        if (!readerUpdateInProgressRef.current && !connectInProgressRef.current) {
          setConnectionStatus('not_connected');
          setConnectedReader(null);
        }
      } else if (
        status === 'connecting' ||
        status === 'discovering' ||
        status === 'reconnecting'
      ) {
        setConnectionStatus('connecting');
      }
    },
    onDidDisconnect: (reason) => {
      setConnectedReader(null);

      if (reason === 'disconnectRequested') {
        setConnectionStatus('not_connected');
        terminalLog.connection('Tap to Pay disconnected (requested)');
        return;
      }

      if (readerUpdateInProgressRef.current || connectInProgressRef.current) {
        terminalLog.connection('Tap to Pay disconnect during setup (ignored for reconnect)');
        return;
      }

      setConnectionStatus('not_connected');
      terminalLog.error('Tap to Pay disconnected unexpectedly', reason);
      handleAutoReconnect();
    },
    onDidRequestReaderInput: (inputOptions) => {
      terminalLog.payment(`Reader requesting input: ${inputOptions.join(', ')}`);
    },
    onDidRequestReaderDisplayMessage: (message) => {
      terminalLog.payment(`Reader display message: ${message}`);
    },
    onDidStartReaderReconnect: () => {
      terminalLog.connection('Reconnecting Tap to Pay…');
      setConnectionStatus('connecting');
    },
    onDidSucceedReaderReconnect: (reader) => {
      terminalLog.connection('Tap to Pay reconnected');
      applyConnectedReader(reader);
    },
    onDidFailReaderReconnect: () => {
      terminalLog.error('Failed to reconnect Tap to Pay');
      setConnectedReader(null);
      setConnectionStatus('not_connected');
    },
    onDidAcceptTermsOfService: () => {
      terminalLog.connection('Tap to Pay Terms & Conditions accepted (Apple)');
      notifyTapToPayTermsAcceptedFromApple();
      void markTapToPaySetupComplete();
    },
    onDidStartInstallingUpdate: (update) => {
      readerUpdateInProgressRef.current = true;
      connectInProgressRef.current = false;
      setReaderUpdateProgress(0);
      setConnectionStatus('connecting');
      setPaymentError(null);
      autoConnectingRef.current = false;
      terminalLog.connection(
        `Installing Tap to Pay software (${update.estimatedUpdateTime ?? 'in progress'})…`
      );
    },
    onDidReportReaderSoftwareUpdateProgress: (progress) => {
      const value = parseFloat(progress);
      if (!Number.isNaN(value)) {
        setReaderUpdateProgress(value);
      }
    },
    onDidFinishInstallingUpdate: (result) => {
      readerUpdateInProgressRef.current = false;
      setReaderUpdateProgress(null);
      connectInProgressRef.current = false;

      if (result.error) {
        terminalLog.error('Tap to Pay software update failed', result.error);
        setConnectionStatus('not_connected');
        setPaymentError(result.error.message || 'Tap to Pay on iPhone software update failed');
        return;
      }

      terminalLog.connection(
        'Tap to Pay software update finished — SDK will resume connectReader automatically'
      );
    },
  });

  // ── State ──────────────────────────────────────────────────────────
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectedReader, setConnectedReader] = useState<Reader.Type | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReaderConnectionStatus>('not_connected');
  const [paymentStatus, setPaymentStatus] = useState<TerminalPaymentStatus>('idle');
  const [paymentOutcome, setPaymentOutcome] = useState<TerminalPaymentOutcome | null>(null);
  const [paymentResult, setPaymentResult] = useState<TerminalPaymentResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [readerUpdateProgress, setReaderUpdateProgress] = useState<number | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const reconnectAttempts = useRef(0);
  const lastConnectedReader = useRef<Reader.Type | null>(null);
  const currentPaymentIntentId = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const isDiscoveringRef = useRef(false);
  const connectionStatusRef = useRef<ReaderConnectionStatus>(connectionStatus);
  /** Stripe Connect account the reader was connected under (undefined = platform token). */
  const connectedStripeAccountRef = useRef<string | undefined>(undefined);
  const connectedMerchantDisplayNameRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    isDiscoveringRef.current = isDiscovering;
  }, [isDiscovering]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  const resetTerminalConnectionState = useCallback(() => {
    setConnectedReader(null);
    lastConnectedReader.current = null;
    pendingReaderForConnectRef.current = null;
    setConnectionStatus('not_connected');
    setDiscoveredReaders([]);
    connectedStripeAccountRef.current = undefined;
    connectedMerchantDisplayNameRef.current = undefined;
    setSdkSessionScope(undefined);
    autoConnectingRef.current = false;
    connectInProgressRef.current = false;
    userInitiatedConnectRef.current = false;
  }, []);

  /**
   * PaymentIntents are created on the connected account. The Terminal SDK must use
   * the same account (connection token scope). Reconnect when scope changes.
   *
   * Checks both local refs AND the global SDK session scope to detect mismatches
   * caused by a previous hook instance (e.g. AdminTapToPayScreen connecting on
   * platform scope before InPersonPaymentScreen needs a connected-account scope).
   */
  const reconcileStripeAccountScope = useCallback(async (): Promise<void> => {
    const targetAccount = stripeAccount;
    const globalScope = getSdkSessionScope();

    const localScopeMatches = connectedStripeAccountRef.current === targetAccount;
    const globalScopeMatches = globalScope === targetAccount;

    if (localScopeMatches && globalScopeMatches) {
      return;
    }

    const sdkMayBeConnected =
      globalScope !== undefined ||
      connectionStatusRef.current === 'connected' ||
      connectionStatusRef.current === 'connecting' ||
      connectInProgressRef.current;

    if (!localScopeMatches || !globalScopeMatches) {
      if (sdkMayBeConnected) {
        terminalLog.connection(
          `Stripe account scope mismatch (local: ${connectedStripeAccountRef.current ?? 'platform'}, ` +
          `global: ${globalScope ?? 'platform'} → target: ${targetAccount ?? 'platform'}), resetting Terminal session…`,
        );
        try { await cancelDiscovering(); } catch { /* ignore */ }
        try { await sdkDisconnectReader(); } catch { /* ignore */ }
        try { await sdkClearCachedCredentials(); } catch { /* ignore */ }
        resetTerminalConnectionState();
      }
    }
  }, [
    stripeAccount,
    cancelDiscovering,
    sdkDisconnectReader,
    sdkClearCachedCredentials,
    resetTerminalConnectionState,
  ]);

  useEffect(() => {
    void reconcileStripeAccountScope();
  }, [reconcileStripeAccountScope]);

  const applyConnectedReader = useCallback(
    (reader: Reader.Type, options?: { markTermsAccepted?: boolean }) => {
      connectedStripeAccountRef.current = stripeAccount;
      connectedMerchantDisplayNameRef.current = terminalMerchantName;
      setSdkSessionScope(stripeAccount);
      setConnectedReader(reader);
      lastConnectedReader.current = reader;
      pendingReaderForConnectRef.current = null;
      setConnectionStatus('connected');
      setReaderUpdateProgress(null);
      readerUpdateInProgressRef.current = false;
      autoConnectingRef.current = false;
      connectInProgressRef.current = false;
      setupFlowActiveRef.current = false;
      setPaymentError(null);
      reconnectAttempts.current = 0;

      if (options?.markTermsAccepted) {
        setTapToPayTermsAcceptedFromAppleSynced();
      } else if (getTapToPayTermsAcceptedFromApple() !== true) {
        // Connect succeeded without T&C sheet — Apple reports account already linked.
        setTapToPayTermsAcceptedFromAppleSynced();
      }

      void markTapToPaySetupComplete();
    },
    [stripeAccount, terminalMerchantName],
  );

  const syncConnectionFromSdk = useCallback(async (): Promise<boolean> => {
    if (setupFlowActiveRef.current) {
      terminalLog.connection('Setup in progress — not syncing existing SDK connection');
      return false;
    }

    if (!sdkReady && !isInitialized) {
      return false;
    }

    try {
      const readerResult = await sdkGetConnectedReader();
      if (isConnectedReaderPayload(readerResult)) {
        const globalScope = getSdkSessionScope();
        if (globalScope !== undefined && globalScope !== stripeAccount) {
          terminalLog.connection(
            `SDK connected on ${globalScope ?? 'platform'} but this screen needs ${stripeAccount ?? 'platform'} — not accepting stale connection`,
          );
          return false;
        }
        applyConnectedReader(readerResult, { markTermsAccepted: true });
        terminalLog.connection('Tap to Pay already connected (synced from SDK)');
        return true;
      }

      const statusResult = await sdkGetConnectionStatus();
      const sdkStatus =
        typeof statusResult === 'string'
          ? statusResult
          : (statusResult as { error?: unknown })?.error
            ? null
            : (statusResult as string);

      if (sdkStatus === 'connected') {
        const retryReader = await sdkGetConnectedReader();
        if (isConnectedReaderPayload(retryReader)) {
          const globalScope = getSdkSessionScope();
          if (globalScope !== undefined && globalScope !== stripeAccount) {
            terminalLog.connection(
              `SDK connected on ${globalScope ?? 'platform'} but this screen needs ${stripeAccount ?? 'platform'} — not accepting stale connection`,
            );
            return false;
          }
          applyConnectedReader(retryReader, { markTermsAccepted: true });
          terminalLog.connection('Tap to Pay connected (synced status from SDK)');
          return true;
        }
      }

      if (sdkStatus === 'notConnected' && !readerUpdateInProgressRef.current) {
        setConnectionStatus((prev) => (prev === 'connecting' ? 'not_connected' : prev));
        autoConnectingRef.current = false;
      }

      return false;
    } catch (err: any) {
      terminalLog.error('Failed to sync Tap to Pay connection from SDK', err);
      return false;
    }
  }, [sdkReady, isInitialized, sdkGetConnectedReader, sdkGetConnectionStatus, applyConnectedReader, stripeAccount]);

  useEffect(() => {
    syncConnectionFromSdkRef.current = syncConnectionFromSdk;
  }, [syncConnectionFromSdk]);

  // ── SDK Initialization ────────────────────────────────────────────
  const ensureInitialized = useCallback(async (): Promise<boolean> => {
    if (sdkReady || isInitialized) {
      if (!sdkReady) setSdkReady(true);
      await syncConnectionFromSdk();
      return true;
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    const promise = (async () => {
      try {
        terminalLog.connection('Initializing Stripe Terminal SDK…');
        const initResult = await sdkInitialize();
        if (initResult.error) {
          terminalLog.error('SDK initialization failed', initResult.error);
          setPaymentError(`SDK init failed: ${initResult.error.message}`);
          return false;
        }
        terminalLog.connection('SDK initialized successfully');
        setSdkReady(true);
        if (initResult.reader && userInitiatedConnectRef.current) {
          applyConnectedReader(initResult.reader);
        } else if (!initResult.reader) {
          if (userInitiatedConnectRef.current) {
            await syncConnectionFromSdk();
          }
        }
        return true;
      } catch (err: any) {
        terminalLog.error('SDK initialization error', err);
        setPaymentError(err.message || 'Failed to initialize Terminal SDK');
        return false;
      } finally {
        initPromiseRef.current = null;
      }
    })();

    initPromiseRef.current = promise;
    return promise;
  }, [
    sdkReady,
    isInitialized,
    sdkInitialize,
    syncConnectionFromSdk,
    applyConnectedReader,
  ]);

  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);

  // ── Tap to Pay Discovery ──────────────────────────────────────────

  const discoverReaders = useCallback(async () => {
    const ready = await ensureInitialized();
    if (!ready) {
      setPaymentError('Failed to initialize Terminal SDK. Please restart the app.');
      return;
    }

    try {
      setIsDiscovering(true);
      setDiscoveredReaders([]);
      setPaymentError(null);
      terminalLog.discovery(
        `Starting Tap to Pay discovery${STRIPE_TERMINAL_SIMULATED ? ' (simulated)' : ''}…`
      );

      const { error } = await sdkDiscoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: STRIPE_TERMINAL_SIMULATED,
      });

      if (error && !isBenignDiscoveryError(error)) {
        terminalLog.error('Discovery failed', error);
        throw new Error(formatTerminalErrorMessage(error, 'Failed to discover Tap to Pay on iPhone reader'));
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('canceled')) return;
      setPaymentError(formatTerminalErrorMessage(err, 'Failed to set up Tap to Pay on iPhone'));
      terminalLog.error('Discovery error', err);
    } finally {
      setIsDiscovering(false);
    }
  }, [ensureInitialized, sdkDiscoverReaders]);

  const cancelDiscovery = useCallback(async () => {
    try {
      await cancelDiscovering();
      setIsDiscovering(false);
      terminalLog.discovery('Discovery cancelled');
    } catch (err: any) {
      terminalLog.error('Cancel discovery error', err);
    }
  }, [cancelDiscovering]);

  // ── Tap to Pay Connection ─────────────────────────────────────────

  const connectToReader = useCallback(
    async (reader: Reader.Type) => {
      if (connectInProgressRef.current) {
        terminalLog.connection('Connect already in progress — skipping duplicate');
        return;
      }

      connectInProgressRef.current = true;
      pendingReaderForConnectRef.current = reader;
      lastConnectedReader.current = reader;

      try {
        setConnectionStatus('connecting');
        setPaymentError(null);
        terminalLog.connection('Connecting Tap to Pay…');

        if (isDiscoveringRef.current) {
          terminalLog.connection('Cancelling active discovery before connecting…');
          try {
            await cancelDiscovering();
            setIsDiscovering(false);
          } catch {
            // Discovery may already be finished
          }
          await new Promise((r) => setTimeout(r, 300));
        }

        let locationId = reader.locationId ?? reader.location?.id;

        if (!locationId && !STRIPE_TERMINAL_SIMULATED) {
          terminalLog.connection('No location on reader — fetching one…');
          try {
            locationId = await withTimeout(
              stripeApi.getOrCreateTerminalLocation(stripeAccount),
              10_000,
              'getOrCreateTerminalLocation',
            );
          } catch (locErr: any) {
            terminalLog.error('Failed to get terminal location', locErr);
            throw new Error(
              `Could not get a Terminal location: ${locErr.message}. ` +
              'Ensure a location exists in the Stripe Dashboard.'
            );
          }
        }

        if (!locationId && !STRIPE_TERMINAL_SIMULATED) {
          throw new Error('No location ID available. Create one in the Stripe Dashboard.');
        }

        const { reader: connected, error } = await withTimeout(
          sdkConnectReader({
            discoveryMethod: 'tapToPay',
            reader,
            locationId: locationId || 'tml_placeholder',
            autoReconnectOnUnexpectedDisconnect: true,
            tosAcceptancePermitted: true,
            merchantDisplayName: terminalMerchantName,
          }),
          CONNECT_TIMEOUT_MS,
          'connectReader',
        );

        if (error) {
          terminalLog.error('Tap to Pay connection failed', error);
          setConnectionStatus('not_connected');
          throw new Error(formatTerminalErrorMessage(error, 'Failed to connect Tap to Pay on iPhone'));
        }

        if (connected) {
          terminalLog.connection(
            `Tap to Pay connected successfully${stripeAccount ? ` (account: ${stripeAccount})` : ' (platform)'}`,
          );
          applyConnectedReader(connected);
        }
      } catch (err: any) {
        if (readerUpdateInProgressRef.current) {
          terminalLog.connection('Connect waiting on reader software update…');
          return;
        }
        setConnectionStatus('not_connected');
        setPaymentError(formatTerminalErrorMessage(err, 'Tap to Pay on iPhone connection failed'));
        terminalLog.error('Connect error', err);
      } finally {
        connectInProgressRef.current = false;
      }
    },
    [sdkConnectReader, cancelDiscovering, stripeAccount, terminalMerchantName, applyConnectedReader]
  );

  // Keep the ref in sync so the SDK callback can call connectToReader
  useEffect(() => {
    connectToReaderRef.current = connectToReader;
  }, [connectToReader]);

  /**
   * Auto-connect: discover the Tap to Pay reader and connect in one step.
   * Sets a ref flag so that onUpdateDiscoveredReaders triggers connection
   * directly, avoiding the race condition with useEffect.
   */
  const autoConnect = useCallback(async () => {
    await reconcileStripeAccountScope();

    const wrongMerchantLabel =
      !!merchantDisplayName &&
      connectedMerchantDisplayNameRef.current != null &&
      connectedMerchantDisplayNameRef.current !== terminalMerchantName;

    if (wrongMerchantLabel && (connectedReader || connectionStatus === 'connected')) {
      terminalLog.connection(
        `Reconnecting Tap to Pay for merchant "${terminalMerchantName}"…`,
      );
      try { await sdkDisconnectReader(); } catch { /* ignore */ }
      resetTerminalConnectionState();
    } else if (connectedReader || connectionStatus === 'connected') {
      terminalLog.connection('Already connected — skipping auto-connect');
      return;
    }

    if (readerUpdateInProgressRef.current || connectInProgressRef.current) {
      terminalLog.connection('Tap to Pay setup in progress — skipping auto-connect');
      return;
    }

    const ready = await ensureInitialized();
    if (!ready) {
      setPaymentError('Failed to initialize Terminal SDK. Please restart the app.');
      return;
    }

    if (await syncConnectionFromSdk()) {
      if (
        !merchantDisplayName ||
        connectedMerchantDisplayNameRef.current === terminalMerchantName
      ) {
        terminalLog.connection('Tap to Pay already connected — skipping discovery');
        return;
      }
      try { await sdkDisconnectReader(); } catch { /* ignore */ }
      resetTerminalConnectionState();
    }

    userInitiatedConnectRef.current = true;
    autoConnectingRef.current = true;
    setConnectionStatus('connecting');
    setPaymentError(null);
    terminalLog.connection('Starting Tap to Pay auto-connect…');

    try {
      setIsDiscovering(true);
      setDiscoveredReaders([]);

      const { error } = await sdkDiscoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: STRIPE_TERMINAL_SIMULATED,
      });

      if (error && isAlreadyConnectedError(error)) {
        await syncConnectionFromSdk();
        return;
      }

      if (error && !isBenignDiscoveryError(error)) {
        throw new Error(formatTerminalErrorMessage(error, 'Failed to discover Tap to Pay on iPhone reader'));
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('canceled') ||
          err.message?.toLowerCase().includes('already connected')) {
        await syncConnectionFromSdk();
        return;
      }
      autoConnectingRef.current = false;
      setPaymentError(formatTerminalErrorMessage(err, 'Failed to set up Tap to Pay on iPhone'));
      setConnectionStatus('not_connected');
      terminalLog.error('Auto-connect discovery error', err);
    } finally {
      setIsDiscovering(false);
      await syncConnectionFromSdk();
    }
  }, [
    connectedReader,
    connectionStatus,
    ensureInitialized,
    sdkDiscoverReaders,
    syncConnectionFromSdk,
    reconcileStripeAccountScope,
    merchantDisplayName,
    terminalMerchantName,
    sdkDisconnectReader,
    resetTerminalConnectionState,
  ]);

  const disconnectReader = useCallback(async () => {
    try {
      terminalLog.connection('Disconnecting Tap to Pay…');
      await sdkDisconnectReader();
      try {
        await sdkClearCachedCredentials();
      } catch {
        // ignore
      }
      resetTerminalConnectionState();
      terminalLog.connection('Tap to Pay disconnected');
    } catch (err: any) {
      terminalLog.error('Disconnect error', err);
      resetTerminalConnectionState();
    }
  }, [sdkDisconnectReader, sdkClearCachedCredentials, resetTerminalConnectionState]);

  // ── Auto Reconnect ─────────────────────────────────────────────────

  const handleAutoReconnect = useCallback(async () => {
    if (readerUpdateInProgressRef.current || connectInProgressRef.current) {
      terminalLog.connection('Skipping auto-reconnect during reader software update');
      return;
    }

    const reader = lastConnectedReader.current;
    if (!reader || reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        terminalLog.error(`Auto-reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        setPaymentError('Tap to Pay on iPhone disconnected. Please try reconnecting.');
      }
      return;
    }

    reconnectAttempts.current += 1;
    terminalLog.connection(
      `Auto-reconnect attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS}`
    );

    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));

    try {
      await connectToReader(reader);
    } catch {
      handleAutoReconnect();
    }
  }, [connectToReader]);

  const waitForReaderReady = useCallback(
    async (timeoutMs: number = CONNECT_TIMEOUT_MS): Promise<boolean> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (connectionStatusRef.current === 'connected') {
          return true;
        }
        await syncConnectionFromSdk();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return false;
    },
    [syncConnectionFromSdk],
  );

  // ── Payment Flow ───────────────────────────────────────────────────

  const collectPayment = useCallback(
    async (
      amountInDollars: number,
      metadata?: Record<string, string>,
      isApplicationAmount?: boolean,
    ): Promise<TerminalPaymentResult> => {
      if (!stripeAccount) {
        throw new Error(
          'This raffle does not have Stripe connected. Link Stripe on the raffle before using Tap to Pay on iPhone.',
        );
      }

      await reconcileStripeAccountScope();

      if (connectionStatusRef.current !== 'connected') {
        throw new Error('Tap to Pay on iPhone is not ready. Please wait for connection.');
      }

      const globalScope = getSdkSessionScope();
      if (
        connectedStripeAccountRef.current !== stripeAccount ||
        (globalScope !== undefined && globalScope !== stripeAccount)
      ) {
        throw new Error(
          'Tap to Pay on iPhone session does not match this raffle\'s Stripe account. ' +
          'Disconnect Tap to Pay on iPhone (or leave and re-open this screen), ' +
          'wait until it shows Ready, then try again.',
        );
      }

      try {
        setPaymentStatus('creating_intent');
        setPaymentError(null);
        setPaymentResult(null);
        setPaymentOutcome(null);
        terminalLog.payment(
          `Creating PaymentIntent for $${amountInDollars} on account ${stripeAccount}…`,
        );

        const intentData = await stripeApi.createTerminalPaymentIntent({
          amount: amountInDollars,
          description: metadata?.description || metadata?.raffleName || 'In-person ticket purchase',
          metadata,
          stripeAccount,
          isApplicationAmount,
        });

        currentPaymentIntentId.current = intentData.id;
        terminalLog.payment(`PaymentIntent created: ${intentData.id}`);

        const { paymentIntent: retrievedPI, error: retrieveError } =
          await retrievePaymentIntent(intentData.client_secret);

        if (retrieveError || !retrievedPI) {
          throw new Error(retrieveError?.message || 'Failed to retrieve payment intent');
        }

        setPaymentStatus('waiting_for_input');
        terminalLog.payment('Waiting for card tap…');

        const { paymentIntent: collectedPI, error: collectError } =
          await collectPaymentMethod({ paymentIntent: retrievedPI });

        if (collectError || !collectedPI) {
          throw new Error(collectError?.message || 'Failed to collect payment method');
        }

        setPaymentStatus('processing');
        terminalLog.payment('Confirming payment…');

        const { paymentIntent: confirmedPI, error: confirmError } =
          await confirmPaymentIntent({ paymentIntent: collectedPI });

        if (confirmError || !confirmedPI) {
          throw new Error(confirmError?.message || 'Failed to confirm payment');
        }

        terminalLog.payment(
          `Payment confirmed: ${confirmedPI.id} — status: ${confirmedPI.status}`
        );

        const result: TerminalPaymentResult = {
          paymentIntentId: confirmedPI.id,
          status: confirmedPI.status ?? 'unknown',
          amount: intentData.amount,
        };

        setPaymentResult(result);
        setPaymentOutcome('approved');
        setPaymentStatus('success');
        currentPaymentIntentId.current = null;
        return result;
      } catch (err: any) {
        terminalLog.error('Payment failed', err);
        const { outcome, message } = classifyTerminalPaymentError(err);
        setPaymentOutcome(outcome);
        setPaymentError(message);
        setPaymentStatus('error');
        throw err;
      }
    },
    [
      stripeAccount,
      reconcileStripeAccountScope,
      retrievePaymentIntent,
      collectPaymentMethod,
      confirmPaymentIntent,
    ]
  );

  /** Ensures reader is ready (5.7), then collects payment (5.6 warm-up assumed at app launch). */
  const collectPaymentWithReaderReady = useCallback(
    async (
      amountInDollars: number,
      metadata?: Record<string, string>,
      isApplicationAmount?: boolean,
    ): Promise<TerminalPaymentResult> => {
      await reconcileStripeAccountScope();

      if (connectionStatusRef.current !== 'connected') {
        setPaymentStatus('initializing');
        setPaymentError(null);
        setPaymentOutcome(null);

        if (connectionStatusRef.current === 'not_connected') {
          await autoConnect();
        }

        const ready = await waitForReaderReady();
        if (!ready) {
          const { outcome, message } = classifyTerminalPaymentError(
            new Error('Tap to Pay on iPhone timed out while initializing'),
          );
          setPaymentOutcome(outcome);
          setPaymentError(message);
          setPaymentStatus('error');
          throw new Error(message);
        }
      }

      return collectPayment(amountInDollars, metadata, isApplicationAmount);
    },
    [autoConnect, waitForReaderReady, collectPayment, reconcileStripeAccountScope],
  );

  const cancelPayment = useCallback(async () => {
    try {
      terminalLog.payment('Cancelling payment…');

      try {
        await cancelCollectPaymentMethod();
      } catch {
        // May not be collecting
      }

      if (currentPaymentIntentId.current) {
        try {
          await stripeApi.cancelTerminalPayment(
            currentPaymentIntentId.current,
            stripeAccount
          );
        } catch {
          // Already cancelled
        }
        currentPaymentIntentId.current = null;
      }

      setPaymentStatus('idle');
      setPaymentError(null);
      setPaymentResult(null);
      setPaymentOutcome(null);
      terminalLog.payment('Payment cancelled');
    } catch (err: any) {
      terminalLog.error('Cancel payment error', err);
      setPaymentStatus('idle');
    }
  }, [stripeAccount, cancelCollectPaymentMethod]);

  const resetPayment = useCallback(() => {
    setPaymentStatus('idle');
    setPaymentError(null);
    setPaymentResult(null);
    setPaymentOutcome(null);
    currentPaymentIntentId.current = null;
  }, []);

  const beginTapToPaySetup = useCallback(async () => {
    await reconcileStripeAccountScope();

    try { await cancelDiscovering(); } catch { /* ignore */ }
    try { await sdkDisconnectReader(); } catch { /* ignore */ }
    try { await sdkClearCachedCredentials(); } catch { /* ignore */ }
    resetTerminalConnectionState();
    clearTapToPayTermsSession();

    terminalLog.connection('Tap to Pay setup: cleared session — reconnecting fresh…');
    await new Promise((resolve) => setTimeout(resolve, 800));

    userInitiatedConnectRef.current = true;
    setupFlowActiveRef.current = true;
    setConnectionStatus('connecting');
    setPaymentError(null);
    terminalLog.connection('Starting Tap to Pay setup connect…');

    try {
      const ready = await ensureInitialized();
      if (!ready) {
        throw new Error('Failed to initialize Terminal SDK');
      }

      terminalLog.connection('Preparing Tap to Pay account relink (allow_relinking)…');
      try {
        await stripeApi.createTerminalOnboardingLink({
          stripeAccount,
          allowRelinking: true,
          merchantDisplayName: 'Chaffle',
        });
      } catch (relinkErr: unknown) {
        terminalLog.error('Relink prep failed (continuing with connect)', relinkErr);
      }

      let locationId: string;
      if (STRIPE_TERMINAL_SIMULATED) {
        locationId = 'tml_placeholder';
      } else {
        locationId = await withTimeout(
          stripeApi.getOrCreateTerminalLocation(stripeAccount),
          10_000,
          'getOrCreateTerminalLocation',
        );
      }

      connectInProgressRef.current = true;
      const { reader: connected, error } = await withTimeout(
        sdkEasyConnect({
          discoveryMethod: 'tapToPay',
          locationId,
          simulated: STRIPE_TERMINAL_SIMULATED,
          tosAcceptancePermitted: true,
          merchantDisplayName: 'Chaffle',
          autoReconnectOnUnexpectedDisconnect: true,
        }),
        CONNECT_TIMEOUT_MS,
        'easyConnect',
      );

      if (error) {
        terminalLog.error('Tap to Pay setup connection failed', error);
        setConnectionStatus('not_connected');
        throw new Error(formatTerminalErrorMessage(error, 'Failed to set up Tap to Pay on iPhone'));
      }

      if (connected) {
        terminalLog.connection(
          `Tap to Pay connected successfully${stripeAccount ? ` (account: ${stripeAccount})` : ' (platform)'}`,
        );
        applyConnectedReader(connected);
      }
    } catch (err: any) {
      if (readerUpdateInProgressRef.current) {
        terminalLog.connection('Setup waiting on reader software update…');
        return;
      }
      setupFlowActiveRef.current = false;
      connectInProgressRef.current = false;
      setConnectionStatus('not_connected');
      setPaymentError(formatTerminalErrorMessage(err, 'Failed to set up Tap to Pay on iPhone'));
      terminalLog.error('Setup connect error', err);
    }
  }, [
    reconcileStripeAccountScope,
    cancelDiscovering,
    sdkDisconnectReader,
    sdkClearCachedCredentials,
    resetTerminalConnectionState,
    ensureInitialized,
    sdkEasyConnect,
    stripeAccount,
    applyConnectedReader,
  ]);

  /** Sync SDK state first; only disconnect/reconnect when Tap to Pay is not already active. */
  const ensureTapToPaySetup = useCallback(async () => {
    await reconcileStripeAccountScope();
    const ready = await ensureInitialized();
    if (!ready) return;

    const alreadyConnected = await syncConnectionFromSdk();
    if (alreadyConnected) {
      terminalLog.connection('Tap to Pay already connected — setup not required');
      return;
    }

    await beginTapToPaySetup();
  }, [
    reconcileStripeAccountScope,
    ensureInitialized,
    syncConnectionFromSdk,
    beginTapToPaySetup,
  ]);

  const resetTapToPayDeviceState = useCallback(async (): Promise<void> => {
    terminalLog.connection('Resetting Tap to Pay device state (disconnect + keychain)…');

    try { await cancelDiscovering(); } catch { /* ignore */ }
    try { await sdkDisconnectReader(); } catch { /* ignore */ }
    try { await sdkClearCachedCredentials(); } catch { /* ignore */ }

    resetTerminalConnectionState();
    clearTapToPayTermsSession();
    await clearTapToPayOnboardingPrefs();

    terminalLog.connection('Tap to Pay device state reset complete');
  }, [
    cancelDiscovering,
    sdkDisconnectReader,
    sdkClearCachedCredentials,
    resetTerminalConnectionState,
  ]);

  return {
    sdkReady,
    discoveredReaders,
    isDiscovering,
    discoverReaders,
    cancelDiscovery,
    connectedReader,
    connectionStatus,
    connectToReader,
    autoConnect,
    beginTapToPaySetup,
    ensureTapToPaySetup,
    resetTapToPayDeviceState,
    disconnectReader,
    paymentStatus,
    paymentOutcome,
    paymentResult,
    paymentError,
    readerUpdateProgress,
    collectPayment,
    collectPaymentWithReaderReady,
    cancelPayment,
    resetPayment,
  };
}
