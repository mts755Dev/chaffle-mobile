/**
 * App-wide Tap to Pay first-run onboarding (Apple announcement / enable prompt).
 * Intro stays visible until Tap to Pay setup is fully complete on this device.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import TapToPayIntroModal from './TapToPayIntroModal';
import TapToPayEnablePromptModal from './TapToPayEnablePromptModal';
import { useAuthStore } from '../store/authStore';
import { RootStackParamList } from '../types';
import {
  hasCompletedTapToPaySetup,
  markTapToPayEnablePromptSeen,
  subscribeTapToPayOnboardingReset,
  subscribeTapToPaySetupComplete,
} from '../services/tapToPayPrefs';
import {
  canSetupTapToPayOnDevice,
  isOrgTapToPayReady,
} from '../utils/tapToPayAccess';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TapToPayOnboardingHost() {
  const navigation = useNavigation<NavigationProp>();
  const { isAdmin, role, orgStripeConnected, orgStripeAccountId } = useAuthStore();
  const [showIntro, setShowIntro] = useState(false);
  const [showEnable, setShowEnable] = useState(false);
  const [skippedIntroThisSession, setSkippedIntroThisSession] = useState(false);

  const eligible =
    Platform.OS === 'ios'
    && canSetupTapToPayOnDevice(isAdmin, role)
    && isOrgTapToPayReady(role, orgStripeConnected, orgStripeAccountId);

  const openTapToPaySettings = useCallback(() => {
    navigation.navigate('AdminTapToPay', { startSetup: true });
  }, [navigation]);

  const refreshOnboardingState = useCallback(async () => {
    if (!eligible) {
      setShowIntro(false);
      setShowEnable(false);
      return;
    }

    const setupComplete = await hasCompletedTapToPaySetup();
    if (setupComplete) {
      setShowIntro(false);
      setShowEnable(false);
      return;
    }

    if (!skippedIntroThisSession) {
      setShowIntro(true);
      setShowEnable(false);
      return;
    }

    setShowIntro(false);
    setShowEnable(true);
  }, [eligible, skippedIntroThisSession]);

  useEffect(() => {
    if (!eligible) return;

    setSkippedIntroThisSession(false);
    void refreshOnboardingState();

    const unsubscribeComplete = subscribeTapToPaySetupComplete(() => {
      void refreshOnboardingState();
    });

    const unsubscribeReset = subscribeTapToPayOnboardingReset(() => {
      setSkippedIntroThisSession(false);
      void (async () => {
        const setupComplete = await hasCompletedTapToPaySetup();
        if (!setupComplete) {
          setShowIntro(true);
          setShowEnable(false);
        }
      })();
    });

    return () => {
      unsubscribeComplete();
      unsubscribeReset();
    };
  }, [eligible, isAdmin, role, orgStripeConnected, orgStripeAccountId, refreshOnboardingState]);

  useEffect(() => {
    if (!eligible) return;
    void refreshOnboardingState();
  }, [eligible, skippedIntroThisSession, refreshOnboardingState]);

  const handleIntroGetStarted = () => {
    setShowIntro(false);
    openTapToPaySettings();
  };

  const handleIntroDismiss = () => {
    setShowIntro(false);
    setSkippedIntroThisSession(true);
    setShowEnable(true);
  };

  const handleEnableSetUp = () => {
    void markTapToPayEnablePromptSeen();
    setShowEnable(false);
    openTapToPaySettings();
  };

  const handleEnableLater = () => {
    void markTapToPayEnablePromptSeen();
    setShowEnable(false);
  };

  if (!eligible) return null;

  return (
    <>
      <TapToPayIntroModal
        visible={showIntro}
        onGetStarted={handleIntroGetStarted}
        onDismiss={handleIntroDismiss}
      />
      <TapToPayEnablePromptModal
        visible={showEnable && !showIntro}
        onSetUp={handleEnableSetUp}
        onLater={handleEnableLater}
      />
    </>
  );
}
