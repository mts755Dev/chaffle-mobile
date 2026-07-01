/**
 * Patches @nitrique/rn-proximity-reader-discovery to present from the correct
 * view controller (walk presentedViewController chain, skip dismissing modals).
 * Required for ProximityReaderDiscovery after Stripe T&C sheets dismiss.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

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

function withProximityReaderDiscoveryFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const swiftPath = path.join(
        config.modRequest.projectRoot,
        'node_modules/@nitrique/rn-proximity-reader-discovery/ios/RnProximityReaderDiscoveryModule.swift',
      );

      if (!fs.existsSync(swiftPath)) {
        console.warn(
          '[withProximityReaderDiscoveryFix] Swift module not found — skip patch',
        );
        return config;
      }

      const source = fs.readFileSync(swiftPath, 'utf8');
      if (source.includes('isBeingDismissed')) {
        return config;
      }

      if (!source.includes(ORIGINAL)) {
        console.warn(
          '[withProximityReaderDiscoveryFix] Unexpected module source — skip patch',
        );
        return config;
      }

      fs.writeFileSync(swiftPath, source.replace(ORIGINAL, PATCHED));
      return config;
    },
  ]);
}

module.exports = withProximityReaderDiscoveryFix;
