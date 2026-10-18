import { useCallback, useState } from 'react';

/**
 * A boolean preference remembered in this browser.
 *
 * <p>Storage can be unavailable or throw outright (private windows, blocked site data), so every
 * access is guarded and the default is used when it fails — a preference is never worth breaking the
 * page over.
 */
export function useStoredFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [flag, setFlag] = useState<boolean>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? initial : stored === 'true';
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (value: boolean) => {
      setFlag(value);
      try {
        window.localStorage.setItem(key, String(value));
      } catch {
        // Preference is kept for this session only.
      }
    },
    [key],
  );

  return [flag, update];
}
