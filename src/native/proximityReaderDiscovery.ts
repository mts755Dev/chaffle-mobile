/**
 * Safe loader for RnProximityReaderDiscovery (Apple ProximityReaderDiscovery).
 * Avoids top-level import so older dev clients without a native rebuild do not crash.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type ProximityReaderDiscoveryModule = {
  show: (topic: string) => Promise<void>;
};

let moduleAvailability: boolean | null = null;

function getNativeModule(): ProximityReaderDiscoveryModule | null {
  if (Platform.OS !== 'ios' || Platform.isPad || Platform.isTV || Platform.isVision) {
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

/** True when the native module is compiled into the current iOS binary. */
export function isProximityReaderDiscoveryAvailable(): boolean {
  if (moduleAvailability !== null) {
    return moduleAvailability;
  }
  moduleAvailability = getNativeModule() != null;
  return moduleAvailability;
}

export async function presentProximityReaderEducation(): Promise<void> {
  const native = getNativeModule();
  if (!native) {
    throw new Error(
      'Apple Tap to Pay education requires a new iOS build with ProximityReaderDiscovery. Rebuild with: eas build -p ios --profile development',
    );
  }
  await native.show('paymentHowToTap');
}
