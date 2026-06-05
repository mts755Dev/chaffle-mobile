/**
 * Merchant education for Tap to Pay (Apple §4).
 * iOS 18+: ProximityReaderDiscovery when present in the native build.
 * Fallback: in-app reference screen with Apple-aligned copy.
 */

import { Platform } from 'react-native';
import {
  isProximityReaderDiscoveryAvailable,
  presentProximityReaderEducation,
} from '../native/proximityReaderDiscovery';
import { terminalLog } from './stripeTerminal';

export type PresentEducationResult =
  | { source: 'apple-proximity-reader-discovery' }
  | { source: 'unavailable'; reason: string };

function getIosMajorVersion(): number {
  const version = Platform.Version;
  if (typeof version === 'string') {
    const major = parseInt(version.split('.')[0] ?? '0', 10);
    return Number.isNaN(major) ? 0 : major;
  }
  return typeof version === 'number' ? version : 0;
}

export function supportsAppleProximityReaderDiscovery(): boolean {
  return (
    Platform.OS === 'ios' &&
    getIosMajorVersion() >= 18 &&
    isProximityReaderDiscoveryAvailable()
  );
}

/**
 * Presents Apple's system Tap to Pay education (4.1, 4.5–4.8 when using Discovery).
 */
export async function presentAppleTapToPayEducation(): Promise<PresentEducationResult> {
  if (Platform.OS !== 'ios') {
    return { source: 'unavailable', reason: 'Tap to Pay education is only available on iPhone.' };
  }

  if (getIosMajorVersion() < 18) {
    return {
      source: 'unavailable',
      reason: 'Apple Tap to Pay education requires iOS 18 or later on this device.',
    };
  }

  if (!isProximityReaderDiscoveryAvailable()) {
    return {
      source: 'unavailable',
      reason:
        'Apple Tap to Pay education is not in this app build yet. Install a new iOS development build (eas build -p ios --profile development), then try again.',
    };
  }

  try {
    terminalLog.connection('Presenting Apple ProximityReaderDiscovery education…');
    await presentProximityReaderEducation();
    terminalLog.connection('Apple Tap to Pay education dismissed');
    return { source: 'apple-proximity-reader-discovery' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not show Apple education';
    terminalLog.error('Apple Tap to Pay education failed', err);
    return { source: 'unavailable', reason: message };
  }
}
