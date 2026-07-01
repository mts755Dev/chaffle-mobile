/**
 * Merchant education for Tap to Pay (Apple §4.1–4.5).
 * Uses Apple's official ProximityReaderDiscovery UI when available (iOS 18+).
 * Custom in-app guide is fallback only when Apple's system tutorial cannot run.
 */

import { InteractionManager, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { terminalLog } from './stripeTerminal';

type ProximityReaderDiscoveryModule = {
  show: (topic: 'paymentHowToTap') => Promise<void>;
};

function getProximityReaderDiscoveryModule(): ProximityReaderDiscoveryModule | null {
  if (Platform.OS !== 'ios' || Platform.isPad) {
    return null;
  }

  try {
    return requireOptionalNativeModule<ProximityReaderDiscoveryModule>(
      'RnProximityReaderDiscovery',
    );
  } catch {
    return null;
  }
}

export type PresentEducationResult =
  | { source: 'apple-proximity-reader-discovery' }
  | { source: 'unavailable'; reason: string };

export type PresentEducationOptions = {
  /** Wait before first attempt — use after T&C so Stripe's sheet can dismiss. */
  initialDelayMs?: number;
  maxAttempts?: number;
};

/** ContentError 4 = systemBusy; 1 = contentDisplayFailed — both retry after T&C/setup. */
const RETRYABLE_EDUCATION_ERROR =
  /ContentError error [14]|contentDisplayFailed|systemBusy|system.?busy|already presenting/i;

const DEFAULT_INITIAL_DELAY_MS = 0;
const DEFAULT_MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Could not show Apple education';
}

function isRetryableEducationError(message: string): boolean {
  return RETRYABLE_EDUCATION_ERROR.test(message);
}

async function waitForUiSettled(initialDelayMs: number): Promise<void> {
  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
  }

  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

function getIosMajorVersion(): number {
  const version = Platform.Version;
  if (typeof version === 'string') {
    const major = parseInt(version.split('.')[0] ?? '0', 10);
    return Number.isNaN(major) ? 0 : major;
  }
  return typeof version === 'number' ? version : 0;
}

/** True when Apple's ProximityReaderDiscovery module is compiled into this iOS build. */
export function supportsAppleProximityReaderDiscovery(): boolean {
  if (Platform.OS !== 'ios' || Platform.isPad || getIosMajorVersion() < 18) {
    return false;
  }

  return getProximityReaderDiscoveryModule() != null;
}

/**
 * Presents Apple's official Tap to Pay on iPhone merchant education (4.3–4.5).
 * This is the marketing-guideline-compliant system UI Apple expects in review videos.
 */
export async function presentAppleTapToPayEducation(
  options: PresentEducationOptions = {},
): Promise<PresentEducationResult> {
  if (Platform.OS !== 'ios') {
    return { source: 'unavailable', reason: 'Tap to Pay on iPhone education is only available on iPhone.' };
  }

  if (getIosMajorVersion() < 18) {
    return {
      source: 'unavailable',
      reason: 'Apple Tap to Pay on iPhone education requires iOS 18 or later on this device.',
    };
  }

  if (!supportsAppleProximityReaderDiscovery()) {
    return {
      source: 'unavailable',
      reason:
        'Apple Tap to Pay on iPhone education is not in this app build. Install a new iOS development build (eas build -p ios --profile development), then try again.',
    };
  }

  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  await waitForUiSettled(initialDelayMs);

  let lastMessage = 'Could not show Apple education';

  const discoveryModule = getProximityReaderDiscoveryModule();
  if (!discoveryModule) {
    return {
      source: 'unavailable',
      reason:
        'Apple Tap to Pay on iPhone education is not in this app build. Install a new iOS development build (eas build -p ios --profile development), then try again.',
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      terminalLog.connection(
        `Presenting Apple ProximityReaderDiscovery education (attempt ${attempt}/${maxAttempts})…`,
      );
      await discoveryModule.show('paymentHowToTap');
      terminalLog.connection('Apple Tap to Pay merchant education completed');
      return { source: 'apple-proximity-reader-discovery' };
    } catch (err: unknown) {
      lastMessage = errorMessage(err);
      const retryable = isRetryableEducationError(lastMessage);

      if (!retryable || attempt === maxAttempts) {
        terminalLog.error('Apple Tap to Pay education failed', err);
        return { source: 'unavailable', reason: lastMessage };
      }

      terminalLog.connection(
        `Apple education busy — retrying in ${RETRY_DELAY_MS}ms (${lastMessage})`,
      );
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { source: 'unavailable', reason: lastMessage };
}

/** Auto-present Apple education once per session (4.1). Returns true if shown. */
export async function autoPresentAppleMerchantEducationIfNeeded(
  alreadyPresented: () => boolean,
  markPresented: () => void,
  options: PresentEducationOptions = {},
): Promise<boolean> {
  if (alreadyPresented()) return false;

  const result = await presentAppleTapToPayEducation({
    initialDelayMs: 2500,
    maxAttempts: 6,
    ...options,
  });
  if (result.source === 'apple-proximity-reader-discovery') {
    markPresented();
    return true;
  }

  terminalLog.error('Auto merchant education unavailable', result.reason);
  return false;
}
