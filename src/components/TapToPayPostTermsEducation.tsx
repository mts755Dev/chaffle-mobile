/**
 * Apple merchant education (4.1) — auto-presented once per session:
 * - After Tap to Pay T&C acceptance and setup settle (Stripe modals dismissed)
 * - After Tap to Pay setup completes on device
 */

import { useCallback, useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { autoPresentAppleMerchantEducationIfNeeded } from '../services/tapToPayEducation';
import { subscribeTapToPaySetupComplete } from '../services/tapToPayPrefs';
import {
  getTapToPayTermsAcceptedFromApple,
  markPostTermsEducationAutoPresented,
  subscribeTapToPayTermsAccepted,
  wasPostTermsEducationAutoPresented,
} from '../services/tapToPayTermsState';

/** Debounce so T&C + connect + reader update can finish before Apple education. */
const POST_SETUP_EDUCATION_DELAY_MS = 3000;

export default function TapToPayPostTermsEducation() {
  const autoAlertShownRef = useRef(false);
  const scheduleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presentingRef = useRef(false);

  const tryPresentEducation = useCallback(async () => {
    if (presentingRef.current || wasPostTermsEducationAutoPresented()) return;

    presentingRef.current = true;
    try {
      const shown = await autoPresentAppleMerchantEducationIfNeeded(
        wasPostTermsEducationAutoPresented,
        markPostTermsEducationAutoPresented,
      );

      if (!shown && !autoAlertShownRef.current) {
        autoAlertShownRef.current = true;
        Alert.alert(
          'Tap to Pay on iPhone — Merchant Education',
          'Apple\'s official tutorial could not be shown automatically. Open Tap to Pay on iPhone in Settings, then tap View Apple Tap to Pay on iPhone Tutorial.',
          [{ text: 'OK' }],
        );
      }
    } finally {
      presentingRef.current = false;
    }
  }, []);

  const scheduleEducation = useCallback(() => {
    if (wasPostTermsEducationAutoPresented()) return;

    if (scheduleTimerRef.current) {
      clearTimeout(scheduleTimerRef.current);
    }

    scheduleTimerRef.current = setTimeout(() => {
      scheduleTimerRef.current = null;
      void tryPresentEducation();
    }, POST_SETUP_EDUCATION_DELAY_MS);
  }, [tryPresentEducation]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const unsubTerms = subscribeTapToPayTermsAccepted(() => {
      scheduleEducation();
    });

    const unsubSetup = subscribeTapToPaySetupComplete(() => {
      if (getTapToPayTermsAcceptedFromApple() === true) {
        scheduleEducation();
      }
    });

    return () => {
      unsubTerms();
      unsubSetup();
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current);
        scheduleTimerRef.current = null;
      }
    };
  }, [scheduleEducation]);

  return null;
}
