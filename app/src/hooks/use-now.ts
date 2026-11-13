import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { toIsoDate } from '@/domain';

export type Now = { date: string; time: string };

function read(): Now {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: toIsoDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** The local date ("YYYY-MM-DD") and time ("HH:MM"), refreshed every half minute and when the app returns to the foreground. */
export function useNow(): Now {
  const [now, setNow] = useState(read);
  useEffect(() => {
    const update = () =>
      setNow((current) => {
        const next = read();
        return next.date === current.date && next.time === current.time ? current : next;
      });
    const timer = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && update());
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
  return now;
}
