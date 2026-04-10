/**
 * useStripeReader — Custom hook for Stripe Terminal reader lifecycle.
 *
 * Manages: discovery → connection → payment collection → processing → cleanup.
 * Uses the official @stripe/stripe-terminal-react-native SDK.
 *
 * Set EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED=true in .env
 * to use a virtual reader for development without physical hardware.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
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
 * Request Bluetooth + location permissions required by the Stripe Terminal SDK
 * on Android 12+ (API 31+). Returns true if all granted.
 */
async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ];

    const results = await PermissionsAndroid.requestMultiple(permissions);

    const allGranted = Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );

    if (!allGranted) {
      terminalLog.error('Bluetooth permissions not fully granted', results);
    } else {
      terminalLog.discovery('All Bluetooth permissions granted');
    }

    return allGranted;
  } catch (err) {
    terminalLog.error('Error requesting Bluetooth permissions', err);
    return false;
  }
}

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

interface UseStripeReaderOptions {
  stripeAccount?: string;
}

export function useStripeReader(options: UseStripeReaderOptions = {}) {
  const { stripeAccount } = options;

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
    },
    onFinishDiscoveringReaders: (error) => {
      setIsDiscovering(false);
      if (error) {
        if (error.code === 'CANCELED' || error.nativeErrorCode === 'USER_ERROR.CANCELED') {
          terminalLog.discovery('Discovery cancelled');
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
        terminalLog.connection('Reader disconnected (requested)');
        return;
      }

      terminalLog.error('Reader disconnected unexpectedly', reason);
      handleAutoReconnect();
    },
    onDidRequestReaderInput: (inputOptions) => {
      terminalLog.payment(`Reader requesting input: ${inputOptions.join(', ')}`);
    },
    onDidRequestReaderDisplayMessage: (message) => {
      terminalLog.payment(`Reader display message: ${message}`);
    },
    onDidStartReaderReconnect: (reader) => {
      terminalLog.connection(`Reconnecting to ${reader.serialNumber}…`);
      setConnectionStatus('connecting');
    },
    onDidSucceedReaderReconnect: (reader) => {
      terminalLog.connection(`Reconnected to ${reader.serialNumber}`);
      setConnectedReader(reader);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    },
    onDidFailReaderReconnect: (reader) => {
      terminalLog.error(`Failed to reconnect to ${reader.serialNumber}`);
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

  // Keep ref in sync with state so async functions always read the latest value
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

  // Auto-initialize on mount
  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);

  // ── Reader Discovery ───────────────────────────────────────────────

  const discoverReaders = useCallback(async () => {
    const ready = await ensureInitialized();
    if (!ready) {
      setPaymentError('Failed to initialize Terminal SDK. Please restart the app.');
      return;
    }

    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) {
      setPaymentError('Bluetooth permissions are required to scan for readers. Please grant them in Settings.');
      return;
    }

    try {
      setIsDiscovering(true);
      setDiscoveredReaders([]);
      setPaymentError(null);
      terminalLog.discovery(
        `Starting Bluetooth scan${STRIPE_TERMINAL_SIMULATED ? ' (simulated)' : ''}…`
      );

      const { error } = await sdkDiscoverReaders({
        discoveryMethod: 'bluetoothScan',
        simulated: STRIPE_TERMINAL_SIMULATED,
      });

      if (error) {
        if (error.code === 'CANCELED' || error.nativeErrorCode === 'USER_ERROR.CANCELED') {
          terminalLog.discovery('Discovery cancelled by user');
          return;
        }
        terminalLog.error('Discovery failed', error);
        throw new Error(error.message || 'Failed to discover readers');
      }
    } catch (err: any) {
      if (err.message?.includes('canceled')) {
        terminalLog.discovery('Discovery cancelled by user');
        return;
      }
      setPaymentError(err.message || 'Failed to scan for readers');
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

  // ── Reader Connection ──────────────────────────────────────────────

  const connectToReader = useCallback(
    async (reader: Reader.Type) => {
      try {
        setConnectionStatus('connecting');
        setPaymentError(null);
        terminalLog.connection(`Connecting to ${reader.serialNumber}…`);

        // 1. Cancel any active discovery — SDK requires discovery to be stopped before connecting
        if (isDiscoveringRef.current) {
          terminalLog.connection('Cancelling active discovery before connecting…');
          try {
            await cancelDiscovering();
            setIsDiscovering(false);
          } catch {
            // Discovery may already be finished
          }
          // Brief pause to let the native SDK finish cleanup
          await new Promise((r) => setTimeout(r, 500));
        }

        // 2. Resolve a valid locationId (required for Bluetooth readers)
        let locationId = reader.locationId ?? reader.location?.id;

        if (!locationId && !STRIPE_TERMINAL_SIMULATED) {
          terminalLog.connection('Reader has no location — fetching location…');
          try {
            // Location is on the connected account for direct charges
            locationId = await withTimeout(
              stripeApi.getOrCreateTerminalLocation(stripeAccount),
              10_000,
              'getOrCreateTerminalLocation',
            );
            terminalLog.connection(`Using location: ${locationId}`);
          } catch (locErr: any) {
            terminalLog.error('Failed to get terminal location', locErr);
            throw new Error(
              `Could not get a Terminal location: ${locErr.message}. ` +
              'Ensure the reader is registered to a Stripe location in the Dashboard.'
            );
          }
        }

        if (!locationId && !STRIPE_TERMINAL_SIMULATED) {
          throw new Error(
            'No location ID available. Register the reader to a location in the Stripe Dashboard.'
          );
        }

        // 3. Connect with a timeout so the UI never spins forever
        terminalLog.connection(`Calling connectReader (locationId=${locationId})…`);

        const { reader: connected, error } = await withTimeout(
          sdkConnectReader({
            discoveryMethod: 'bluetoothScan',
            reader,
            locationId: locationId || 'tml_placeholder',
            autoReconnectOnUnexpectedDisconnect: true,
          }),
          CONNECT_TIMEOUT_MS,
          'connectReader',
        );

        if (error) {
          terminalLog.error('Connection failed', error);
          setConnectionStatus('not_connected');
          throw new Error(error.message || 'Failed to connect to reader');
        }

        if (connected) {
          terminalLog.connection(`Connected to ${connected.serialNumber}`);
          setConnectedReader(connected);
          lastConnectedReader.current = connected;
          setConnectionStatus('connected');
          reconnectAttempts.current = 0;
        }
      } catch (err: any) {
        setConnectionStatus('not_connected');
        setPaymentError(err.message || 'Connection failed');
        terminalLog.error('Connect error', err);
      }
    },
    [sdkConnectReader, cancelDiscovering, stripeAccount]
  );

  const disconnectReader = useCallback(async () => {
    try {
      terminalLog.connection('Disconnecting reader…');
      await sdkDisconnectReader();
      setConnectedReader(null);
      lastConnectedReader.current = null;
      setConnectionStatus('not_connected');
      setDiscoveredReaders([]);
      terminalLog.connection('Reader disconnected');
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
        setPaymentError('Reader disconnected. Please reconnect manually.');
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

  /**
   * Full payment lifecycle:
   *   1. Create PaymentIntent on backend (card_present)
   *   2. Retrieve PaymentIntent in SDK
   *   3. Collect payment method via the connected reader
   *   4. Confirm payment
   */
  const collectPayment = useCallback(
    async (
      amountInDollars: number,
      metadata?: Record<string, string>,
      isApplicationAmount?: boolean,
    ): Promise<TerminalPaymentResult> => {
      if (connectionStatus !== 'connected') {
        throw new Error('No reader connected. Please connect a reader first.');
      }

      try {
        // Step 1: Create PaymentIntent on backend
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

        // Step 2: Retrieve PaymentIntent in SDK
        const { paymentIntent: retrievedPI, error: retrieveError } =
          await retrievePaymentIntent(intentData.client_secret);

        if (retrieveError || !retrievedPI) {
          throw new Error(retrieveError?.message || 'Failed to retrieve payment intent');
        }

        setPaymentStatus('waiting_for_input');
        terminalLog.payment('Waiting for card tap/insert…');

        const { paymentIntent: collectedPI, error: collectError } =
          await collectPaymentMethod({ paymentIntent: retrievedPI });

        if (collectError || !collectedPI) {
          throw new Error(collectError?.message || 'Failed to collect payment method');
        }

        // Step 4: Confirm payment
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
    disconnectReader,
    paymentStatus,
    paymentResult,
    paymentError,
    collectPayment,
    cancelPayment,
    resetPayment,
  };
}
