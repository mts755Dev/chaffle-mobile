/**
 * In-app merchant education (Apple Marketing Guide–aligned fallback when
 * ProximityReaderDiscovery is unavailable, e.g. iOS < 18).
 */

export const TAP_TO_PAY_EDUCATION_REGION = 'US' as const;

export type TapToPayEducationSection = {
  id: string;
  title: string;
  body: string;
  bullets?: string[];
};

export const TAP_TO_PAY_EDUCATION_SECTIONS: TapToPayEducationSection[] = [
  {
    id: 'contactless-cards',
    title: 'Accept contactless cards',
    body:
      'Ask the customer to hold their contactless debit or credit card flat against the top of your iPhone.',
    bullets: [
      'Keep the card near the top edge until you hear a tone or see confirmation in the app.',
      'If the card has a chip that does not support contactless, try another method below.',
    ],
  },
  {
    id: 'wallets',
    title: 'Accept Apple Pay and digital wallets',
    body:
      'Customers can pay with Apple Pay, Google Pay, and other digital wallets the same way as a contactless card.',
    bullets: [
      'Ask them to hold their phone or watch near the top of your iPhone.',
      'Wait for the checkmark or success message before moving the device away.',
    ],
  },
  {
    id: 'pin',
    title: 'PIN entry (when prompted)',
    body:
      'Some cards require a PIN for certain contactless transactions. When prompted, hand the iPhone to the customer so they can enter their PIN on screen.',
    bullets: [
      'Accessibility options are available on the PIN screen (e.g. larger text, VoiceOver).',
      'Follow the on-screen instructions from Apple and Stripe during the payment.',
    ],
  },
  {
    id: 'fallback',
    title: 'If a card cannot be read',
    body:
      'Some cards are not able to complete contactless transactions using a PIN. If this occurs, simply ask the customer if they have an alternative contactless card or digital wallet and continue the transaction using Tap to Pay on iPhone.',
    bullets: [
      'You can also complete the sale online: share the raffle link so the customer pays with a card in their browser (Payment Link).',
      'For in-person sales in Chaffle, open In-Person Payment on the raffle after Tap to Pay is set up.',
    ],
  },
];
