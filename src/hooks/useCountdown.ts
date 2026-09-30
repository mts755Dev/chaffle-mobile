import { useState, useEffect, useRef } from 'react';
import { parseRaffleDrawDate } from '../lib/raffleDates';

interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

/** Countdown to raffle draw — target is always US Eastern wall clock. */
export function useCountdown(targetDate: string | null): CountdownState {
  const [countdown, setCountdown] = useState<CountdownState>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetDate?.trim()) {
      setCountdown({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: true,
      });
      return;
    }

    const targetMs = parseRaffleDrawDate(targetDate).getTime();
    if (Number.isNaN(targetMs)) {
      setCountdown({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: true,
      });
      return;
    }

    const calculate = () => {
      const diffSec = Math.floor((targetMs - Date.now()) / 1000);

      if (!Number.isFinite(diffSec) || diffSec <= 0) {
        setCountdown({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
        });
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const days = Math.floor(diffSec / 86400);
      const hours = Math.floor((diffSec % 86400) / 3600);
      const minutes = Math.floor((diffSec % 3600) / 60);
      const seconds = diffSec % 60;

      setCountdown({ days, hours, minutes, seconds, isExpired: false });
    };

    calculate();
    intervalRef.current = setInterval(calculate, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetDate]);

  return countdown;
}
