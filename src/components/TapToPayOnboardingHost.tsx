/**
 * App-wide Tap to Pay first-run onboarding (Apple announcement / enable prompt).
 * Intro and enable prompt each show at most once until setup is complete (persisted).
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
  hasSeenTapToPayEnablePrompt,
  hasSeenTapToPayIntro,
  markTapToPayEnablePromptSeen,
  markTapToPayIntroSeen,
  subscribeTapToPayOnboardingReset,
  subscribeTapToPaySetupComplete,
} from '../services/tapToPayPrefs';
import {
  canSetupTapToPayOnDevice,
} from '../utils/tapToPayAccess';
import { getTapToPayTermsAcceptedFromApple } from '../services/tapToPayTermsState';
import { raffleApi } from '../services/api/raffleApi';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function TapToPayOnboardingHost() {
  const navigation = useNavigation<NavigationProp>();
  const { isAdmin, role, organizationId, organizationName, orgStripeAccountId, raffleId, isLoading, refreshOrgState } =
    useAuthStore();
  const [showIntro, setShowIntro] = useState(false);
  const [showEnable, setShowEnable] = useState(false);

  const eligible =
    Platform.OS === 'ios'
    && !isLoading
    && canSetupTapToPayOnDevice(isAdmin, role);

  useEffect(() => {
    if (isLoading) return;
    if ((role === 'org_admin' || role === 'worker') && organizationId && !orgStripeAccountId) {
      void refreshOrgState();
    }
  }, [isLoading, role, organizationId, orgStripeAccountId, refreshOrgState]);

  const openTapToPaySettings = useCallback(async () => {
    if (role === 'super_admin') {
      navigation.navigate('AdminTapToPay', { startSetup: true });
      return;
    }

    let stripeAccountId = orgStripeAccountId ?? undefined;
    let merchantDisplayName = organizationName ?? undefined;
    let raffleOrganizationId: string | null | undefined = organizationId;

    if (role === 'worker' && raffleId) {
      const form = await raffleApi.getDonationFormById(raffleId);
      if (form?.stripeAccount?.id) {
        stripeAccountId = form.stripeAccount.id;
        merchantDisplayName = form.title?.trim() || merchantDisplayName;
      }
      raffleOrganizationId = form?.organization_id ?? organizationId;
    }

    navigation.navigate('AdminTapToPay', {
      stripeAccountId,
      merchantDisplayName,
      raffleOrganizationId,
      startSetup: true,
    });
  }, [
    navigation,
    role,
    orgStripeAccountId,
    organizationName,
    organizationId,
    raffleId,
  ]);

  const refreshOnboardingState = useCallback(async () => {
    if (!eligible) {
      setShowIntro(false);
      setShowEnable(false);
      return;
    }

    const setupComplete = await hasCompletedTapToPaySetup();
    const termsAccepted = getTapToPayTermsAcceptedFromApple();
    if (setupComplete && termsAccepted === true) {
      setShowIntro(false);
      setShowEnable(false);
      return;
    }

    const introSeen = await hasSeenTapToPayIntro();
    if (!introSeen) {
      setShowIntro(true);
      setShowEnable(false);
      return;
    }

    const enableSeen = await hasSeenTapToPayEnablePrompt();
    setShowIntro(false);
    setShowEnable(!enableSeen);
  }, [eligible]);

  useEffect(() => {
    if (!eligible) {
      setShowIntro(false);
      setShowEnable(false);
      return;
    }

    void refreshOnboardingState();

    const unsubscribeComplete = subscribeTapToPaySetupComplete(() => {
      void refreshOnboardingState();
    });

    const unsubscribeReset = subscribeTapToPayOnboardingReset(() => {
      void refreshOnboardingState();
    });

    return () => {
      unsubscribeComplete();
      unsubscribeReset();
    };
  }, [eligible, refreshOnboardingState]);

  const handleIntroGetStarted = () => {
    setShowIntro(false);
    void markTapToPayIntroSeen();
    void openTapToPaySettings();
  };

  const handleIntroDismiss = () => {
    setShowIntro(false);
    void (async () => {
      await markTapToPayIntroSeen();
      const enableSeen = await hasSeenTapToPayEnablePrompt();
      setShowEnable(!enableSeen);
    })();
  };

  const handleEnableSetUp = () => {
    void markTapToPayEnablePromptSeen();
    setShowEnable(false);
    void openTapToPaySettings();
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
