/**
 * Single app-wide Stripe Terminal provider (iOS) for warm-up + In-Person Payment.
 */

import React, { type ReactNode } from 'react';
import { Platform } from 'react-native';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import { StripeTerminalAccountProvider, useStripeTerminalAccount } from '../contexts/StripeTerminalAccountContext';
import { fetchConnectionToken } from '../services/stripeTerminal';
import TapToPayWarmup from './TapToPayWarmup';
import TapToPayPostTermsEducation from './TapToPayPostTermsEducation';

function StripeTerminalProviderInner({ children }: { children: ReactNode }) {
  const { stripeAccountId } = useStripeTerminalAccount();

  return (
    <StripeTerminalProvider
      logLevel={__DEV__ ? 'verbose' : 'none'}
      tokenProvider={() => fetchConnectionToken(stripeAccountId)}
    >
      <>
        <TapToPayWarmup />
        <TapToPayPostTermsEducation />
        {children}
      </>
    </StripeTerminalProvider>
  );
}

export default function StripeTerminalRoot({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') {
    return <>{children}</>;
  }

  return (
    <StripeTerminalAccountProvider>
      <StripeTerminalProviderInner>{children}</StripeTerminalProviderInner>
    </StripeTerminalAccountProvider>
  );
}
