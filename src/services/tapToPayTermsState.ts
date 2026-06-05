/**
 * Tap to Pay Terms & Conditions — session state driven by Apple / Stripe Terminal SDK only.
 * Do not persist to AsyncStorage or use local UI checkboxes as the source of truth.
 */

type Listener = () => void;

/** null = unknown until SDK reports; true = accepted on this device per Apple/SDK */
let acceptedFromApple: boolean | null = null;
let postTermsEducationAutoPresented = false;
const termsAcceptedListeners = new Set<Listener>();

/** Sync when SDK reports an already-linked reader (1.6) — does not trigger post-T&C education. */
export function setTapToPayTermsAcceptedFromAppleSynced(): void {
  acceptedFromApple = true;
}

/** User just accepted Apple Tap to Pay T&C (4.2) — triggers education listeners. */
export function notifyTapToPayTermsAcceptedFromApple(): void {
  const wasAccepted = acceptedFromApple === true;
  acceptedFromApple = true;
  if (!wasAccepted) {
    termsAcceptedListeners.forEach((fn) => fn());
  }
}

export function clearTapToPayTermsSession(): void {
  acceptedFromApple = null;
  postTermsEducationAutoPresented = false;
}

export function wasPostTermsEducationAutoPresented(): boolean {
  return postTermsEducationAutoPresented;
}

export function markPostTermsEducationAutoPresented(): void {
  postTermsEducationAutoPresented = true;
}

export function getTapToPayTermsAcceptedFromApple(): boolean | null {
  return acceptedFromApple;
}

/** Subscribe to new Tap to Pay T&C acceptance (4.2 post-terms education). */
export function subscribeTapToPayTermsAccepted(listener: Listener): () => void {
  termsAcceptedListeners.add(listener);
  return () => {
    termsAcceptedListeners.delete(listener);
  };
}
