/**
 * One-time Tap to Pay announcements (intro / enable prompt) for eligible admins.
 * Separate from Apple T&C state in tapToPayTermsState.ts.
 */

import * as SecureStore from 'expo-secure-store';

const INTRO_SEEN_KEY = 'chaffle_tap_to_pay_intro_seen_v2';
const ENABLE_PROMPT_SEEN_KEY = 'chaffle_tap_to_pay_enable_prompt_seen_v2';
const SETUP_COMPLETE_KEY = 'chaffle_tap_to_pay_setup_complete_v1';

type SetupListener = () => void;
const setupCompleteListeners = new Set<SetupListener>();
const onboardingResetListeners = new Set<SetupListener>();

export function subscribeTapToPaySetupComplete(listener: SetupListener): () => void {
  setupCompleteListeners.add(listener);
  return () => {
    setupCompleteListeners.delete(listener);
  };
}

export function subscribeTapToPayOnboardingReset(listener: SetupListener): () => void {
  onboardingResetListeners.add(listener);
  return () => {
    onboardingResetListeners.delete(listener);
  };
}

export async function hasCompletedTapToPaySetup(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(SETUP_COMPLETE_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markTapToPaySetupComplete(): Promise<void> {
  try {
    await SecureStore.setItemAsync(SETUP_COMPLETE_KEY, '1');
    await SecureStore.setItemAsync(INTRO_SEEN_KEY, '1');
    await SecureStore.setItemAsync(ENABLE_PROMPT_SEEN_KEY, '1');
    setupCompleteListeners.forEach((listener) => listener());
  } catch {
    // Non-fatal
  }
}

export async function hasSeenTapToPayIntro(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(INTRO_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markTapToPayIntroSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(INTRO_SEEN_KEY, '1');
  } catch {
    // Non-fatal
  }
}

export async function hasSeenTapToPayEnablePrompt(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLE_PROMPT_SEEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markTapToPayEnablePromptSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ENABLE_PROMPT_SEEN_KEY, '1');
  } catch {
    // Non-fatal
  }
}

/** Clears one-time intro / enable flags (e.g. for QA or re-testing onboarding). */
export async function clearTapToPayOnboardingPrefs(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(INTRO_SEEN_KEY);
    await SecureStore.deleteItemAsync(ENABLE_PROMPT_SEEN_KEY);
    await SecureStore.deleteItemAsync(SETUP_COMPLETE_KEY);
    onboardingResetListeners.forEach((listener) => listener());
  } catch {
    // Non-fatal
  }
}
