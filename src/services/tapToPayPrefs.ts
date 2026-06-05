/**
 * One-time Tap to Pay announcements (intro / enable prompt) for eligible admins.
 * Separate from Apple T&C state in tapToPayTermsState.ts.
 */

import * as SecureStore from 'expo-secure-store';

const INTRO_SEEN_KEY = 'chaffle_tap_to_pay_intro_seen_v1';
const ENABLE_PROMPT_SEEN_KEY = 'chaffle_tap_to_pay_enable_prompt_seen_v1';

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
