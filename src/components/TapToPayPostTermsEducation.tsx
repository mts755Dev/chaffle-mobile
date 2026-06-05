/**
 * Presents Apple merchant education after Tap to Pay T&C acceptance (4.2).
 * Mounted app-wide so education runs from Admin Tap to Pay or In-Person Payment.
 */

import { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { presentAppleTapToPayEducation } from '../services/tapToPayEducation';
import {
  markPostTermsEducationAutoPresented,
  subscribeTapToPayTermsAccepted,
  wasPostTermsEducationAutoPresented,
} from '../services/tapToPayTermsState';

export default function TapToPayPostTermsEducation() {
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    return subscribeTapToPayTermsAccepted(() => {
      if (wasPostTermsEducationAutoPresented()) return;
      markPostTermsEducationAutoPresented();

      void (async () => {
        const result = await presentAppleTapToPayEducation();
        if (result.source === 'unavailable') {
          Alert.alert(
            'Tap to Pay — Merchant education',
            `${result.reason}\n\nOpen Tap to Pay on iPhone in settings, then tap Open Merchant Guide for full instructions.`,
            [{ text: 'OK' }],
          );
        }
      })();
    });
  }, []);

  return null;
}
