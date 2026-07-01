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

patchProximityReaderDiscovery();
