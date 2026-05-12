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
import { terminalLog } from '../services/stripeTerminal';
import { STRIPE_TERMINAL_SIMULATED } from '../constants';
import type {
  ReaderConnectionStatus,
  TerminalPaymentStatus,
  TerminalPaymentResult,
} from '../types';

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;
const CONNECT_TIMEOUT_MS = 30_000;

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

interface UseStripeReaderOptions {
  stripeAccount?: string;
}

export function useStripeReader(options: UseStripeReaderOptions = {}) {
  const { stripeAccount } = options;

  // Ref to track whether auto-connect is in progress so the
  // onUpdateDiscoveredReaders callback can trigger connection directly.
  const autoConnectingRef = useRef(false);
  const connectToReaderRef = useRef<(reader: Reader.Type) => Promise<void>>(undefined);

  const {
    initialize: sdkInitialize,
    isInitialized,
    discoverReaders: sdkDiscoverReaders,
    cancelDiscovering,
    connectReader: sdkConnectReader,
    disconnectReader: sdkDisconnectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
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
          return;
        }
        terminalLog.error('Discovery finished with error', error);
      } else {
        terminalLog.discovery('Discovery finished');
      }
    },
    onDidChangeConnectionStatus: (status) => {
      terminalLog.connection(`Connection status changed: ${status}`);
    },
    onDidDisconnect: (reason) => {
      setConnectedReader(null);
      setConnectionStatus('not_connected');

      if (reason === 'disconnectRequested') {
        terminalLog.connection('Tap to Pay disconnected (requested)');
        return;
      }

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
      setConnectedReader(reader);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    },
    onDidFailReaderReconnect: () => {
      terminalLog.error('Failed to reconnect Tap to Pay');
      setConnectedReader(null);
      setConnectionStatus('not_connected');
    },
  });

  // ── State ──────────────────────────────────────────────────────────
  const [discoveredReaders, setDiscoveredReaders] = useState<Reader.Type[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [connectedReader, setConnectedReader] = useState<Reader.Type | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ReaderConnectionStatus>('not_connected');
  const [paymentStatus, setPaymentStatus] = useState<TerminalPaymentStatus>('idle');
  const [paymentResult, setPaymentResult] = useState<TerminalPaymentResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const reconnectAttempts = useRef(0);
  const lastConnectedReader = useRef<Reader.Type | null>(null);
  const currentPaymentIntentId = useRef<string | null>(null);
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  const isDiscoveringRef = useRef(false);

  useEffect(() => {
    isDiscoveringRef.current = isDiscovering;
  }, [isDiscovering]);

  // ── SDK Initialization ────────────────────────────────────────────
  const ensureInitialized = useCallback(async (): Promise<boolean> => {
    if (sdkReady || isInitialized) {
      if (!sdkReady) setSdkReady(true);
      return true;
    }

    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    const promise = (async () => {
      try {
        terminalLog.connection('Initializing Stripe Terminal SDK…');
        const { error } = await sdkInitialize();
        if (error) {
          terminalLog.error('SDK initialization failed', error);
          setPaymentError(`SDK init failed: ${error.message}`);
          return false;
        }
        terminalLog.connection('SDK initialized successfully');
        setSdkReady(true);
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
  }, [sdkReady, isInitialized, sdkInitialize]);

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
        throw new Error(error.message || 'Failed to discover Tap to Pay reader');
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('canceled')) return;
      setPaymentError(err.message || 'Failed to set up Tap to Pay');
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
          }),
          CONNECT_TIMEOUT_MS,
          'connectReader',
        );

        if (error) {
          terminalLog.error('Tap to Pay connection failed', error);
          setConnectionStatus('not_connected');
          throw new Error(error.message || 'Failed to connect Tap to Pay');
        }

        if (connected) {
          terminalLog.connection('Tap to Pay connected successfully');
          setConnectedReader(connected);
          lastConnectedReader.current = connected;
          setConnectionStatus('connected');
          reconnectAttempts.current = 0;
        }
      } catch (err: any) {
        setConnectionStatus('not_connected');
        setPaymentError(err.message || 'Tap to Pay connection failed');
        terminalLog.error('Connect error', err);
      }
    },
    [sdkConnectReader, cancelDiscovering, stripeAccount]
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
    if (connectedReader || connectionStatus === 'connected') {
      terminalLog.connection('Already connected — skipping auto-connect');
      return;
    }

    const ready = await ensureInitialized();
    if (!ready) {
      setPaymentError('Failed to initialize Terminal SDK. Please restart the app.');
      return;
    }

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

      if (error && !isBenignDiscoveryError(error)) {
        throw new Error(error.message || 'Failed to discover Tap to Pay reader');
      }
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('canceled') ||
          err.message?.toLowerCase().includes('already connected')) {
        return;
      }
      autoConnectingRef.current = false;
      setPaymentError(err.message || 'Failed to set up Tap to Pay');
      setConnectionStatus('not_connected');
      terminalLog.error('Auto-connect discovery error', err);
    } finally {
      setIsDiscovering(false);
    }
  }, [connectedReader, connectionStatus, ensureInitialized, sdkDiscoverReaders]);

  const disconnectReader = useCallback(async () => {
    try {
      terminalLog.connection('Disconnecting Tap to Pay…');
      await sdkDisconnectReader();
      setConnectedReader(null);
      lastConnectedReader.current = null;
      setConnectionStatus('not_connected');
      setDiscoveredReaders([]);
      terminalLog.connection('Tap to Pay disconnected');
    } catch (err: any) {
      terminalLog.error('Disconnect error', err);
    }
  }, [sdkDisconnectReader]);

  // ── Auto Reconnect ─────────────────────────────────────────────────

  const handleAutoReconnect = useCallback(async () => {
    const reader = lastConnectedReader.current;
    if (!reader || reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
      if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
        terminalLog.error(`Auto-reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        setPaymentError('Tap to Pay disconnected. Please try reconnecting.');
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

  // ── Payment Flow ───────────────────────────────────────────────────

  const collectPayment = useCallback(
    async (
      amountInDollars: number,
      metadata?: Record<string, string>,
      isApplicationAmount?: boolean,
    ): Promise<TerminalPaymentResult> => {
      if (connectionStatus !== 'connected') {
        throw new Error('Tap to Pay is not ready. Please wait for connection.');
      }

      try {
        setPaymentStatus('creating_intent');
        setPaymentError(null);
        setPaymentResult(null);
        terminalLog.payment(`Creating PaymentIntent for $${amountInDollars}…`);

        const intentData = await stripeApi.createTerminalPaymentIntent({
          amount: amountInDollars,
          description: metadata?.description || 'Chaffle in-person ticket purchase',
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
        setPaymentStatus('success');
        currentPaymentIntentId.current = null;
        return result;
      } catch (err: any) {
        terminalLog.error('Payment failed', err);
        setPaymentError(err.message || 'Payment failed');
        setPaymentStatus('error');
        throw err;
      }
    },
    [connectionStatus, stripeAccount, retrievePaymentIntent, collectPaymentMethod, confirmPaymentIntent]
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
    currentPaymentIntentId.current = null;
  }, []);

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
    disconnectReader,
    paymentStatus,
    paymentResult,
    paymentError,
    collectPayment,
    cancelPayment,
    resetPayment,
  };
}
