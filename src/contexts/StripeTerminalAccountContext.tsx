import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setTerminalAccountScope } from '../services/stripeTerminal';

interface StripeTerminalAccountContextValue {
  stripeAccountId: string | undefined;
  setStripeAccountId: (id: string | undefined) => void;
}

const StripeTerminalAccountContext = createContext<StripeTerminalAccountContextValue | null>(
  null,
);

export function StripeTerminalAccountProvider({ children }: { children: ReactNode }) {
  const [stripeAccountId, setStripeAccountId] = useState<string | undefined>();

  const value = useMemo(
    () => ({ stripeAccountId, setStripeAccountId }),
    [stripeAccountId],
  );

  return (
    <StripeTerminalAccountContext.Provider value={value}>
      {children}
    </StripeTerminalAccountContext.Provider>
  );
}

export function useStripeTerminalAccount(): StripeTerminalAccountContextValue {
  const ctx = useContext(StripeTerminalAccountContext);
  if (!ctx) {
    throw new Error('useStripeTerminalAccount must be used within StripeTerminalAccountProvider');
  }
  return ctx;
}

/**
 * Sets connected-account scope for Terminal tokens while In-Person Payment is open.
 * The module-level scope is updated synchronously during render so the tokenProvider
 * closure always reads the correct account before any effects (autoConnect) fire.
 */
export function useStripeTerminalAccountScope(stripeAccountId: string | undefined) {
  const { setStripeAccountId } = useStripeTerminalAccount();

  setTerminalAccountScope(stripeAccountId);

  useEffect(() => {
    setStripeAccountId(stripeAccountId);
    setTerminalAccountScope(stripeAccountId);
    return () => {
      setStripeAccountId(undefined);
      setTerminalAccountScope(undefined);
    };
  }, [stripeAccountId, setStripeAccountId]);
}
