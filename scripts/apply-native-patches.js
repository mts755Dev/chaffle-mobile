/**
 * Applies native patches after npm install (local + EAS).
 * Keeps node_modules in sync with plugins/ config plugins run at prebuild.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function patchProximityReaderDiscovery() {
  const swiftPath = path.join(
    ROOT,
    'node_modules/@nitrique/rn-proximity-reader-discovery/ios/RnProximityReaderDiscoveryModule.swift',
  );

  if (!fs.existsSync(swiftPath)) {
    console.warn('[apply-native-patches] RnProximityReaderDiscovery Swift not found — skip');
    return;
  }

  const ORIGINAL = `@MainActor
  private func getCurrentViewController() throws -> UIViewController {
    guard let viewController = appContext?.utilities?.currentViewController() else {
      throw ViewControllerNotFoundException()
    }
    return viewController
  }`;

  const PATCHED = `@MainActor
  private func getCurrentViewController() throws -> UIViewController {
    guard var viewController = appContext?.utilities?.currentViewController() else {
      throw ViewControllerNotFoundException()
    }
    while let presented = viewController.presentedViewController {
      if presented.isBeingDismissed {
        break
      }
      viewController = presented
    }
    return viewController
  }`;

  const source = fs.readFileSync(swiftPath, 'utf8');
  if (source.includes('isBeingDismissed')) {
    console.log('[apply-native-patches] ProximityReaderDiscovery VC fix already applied');
    return;
  }

  if (!source.includes(ORIGINAL)) {
    console.warn('[apply-native-patches] ProximityReaderDiscovery source changed — skip patch');
    return;
  }

  fs.writeFileSync(swiftPath, source.replace(ORIGINAL, PATCHED));
  console.log('[apply-native-patches] ProximityReaderDiscovery VC fix applied');
}

/**
 * Xcode 26+: StripeSwiftInterop.h forward-declares STPPaymentStatus as NSUInteger,
 * but StripePayments defines it as NSInteger. That mismatch is now a hard error.
 * Fixed upstream in stripe-react-native 0.61.0; Expo still pins 0.50.3.
 * @see https://github.com/stripe/stripe-react-native/issues/2357
 */
function patchStripePaymentStatusEnum() {
  const headerPath = path.join(
    ROOT,
    'node_modules/@stripe/stripe-react-native/ios/StripeSwiftInterop.h',
  );

  if (!fs.existsSync(headerPath)) {
    console.warn('[apply-native-patches] StripeSwiftInterop.h not found — skip');
    return;
  }

  const source = fs.readFileSync(headerPath, 'utf8');
  const broken = 'typedef NS_ENUM(NSUInteger, STPPaymentStatus);';
  const fixed = 'typedef NS_ENUM(NSInteger, STPPaymentStatus);';

  if (source.includes(fixed) && !source.includes(broken)) {
    console.log('[apply-native-patches] Stripe STPPaymentStatus fix already applied');
    return;
  }

  if (!source.includes(broken)) {
    console.warn('[apply-native-patches] StripeSwiftInterop.h changed — skip patch');
    return;
  }

  fs.writeFileSync(headerPath, source.replace(broken, fixed));
  console.log('[apply-native-patches] Stripe STPPaymentStatus Xcode 26 fix applied');
}

patchProximityReaderDiscovery();
patchStripePaymentStatusEnum();
