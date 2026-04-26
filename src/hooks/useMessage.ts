import { useState, useRef, useCallback, useEffect } from 'react';

export type ShowMessage = (msg: string) => void;

export function useMessage(timeoutMs = 4000): [string, ShowMessage] {
  const [message, setMessage] = useState('');
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const showMsg = useCallback<ShowMessage>(
    (msg) => {
      setMessage(msg);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setMessage(''), timeoutMs);
    },
    [timeoutMs],
  );

  return [message, showMsg];
}
