import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

/**
 * A robust, strongly typed hook for synchronizing state with localStorage.
 * 
 * Features:
 * - Safe JSON parsing with fallback to initialValue if corrupt/absent.
 * - Automatic persistence on state changes.
 * - Support for functional updates (e.g. setState(prev => ...)).
 * - Error isolation so storage failures do not crash the React component tree.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  serializer?: (val: T) => any
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) {
        return initialValue;
      }
      const parsed = JSON.parse(raw);
      return parsed !== null && parsed !== undefined ? parsed : initialValue;
    } catch (err) {
      console.warn(`[usePersistentState] Error reading key "${key}" from localStorage:`, err);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      if (state === undefined) {
        localStorage.removeItem(key);
      } else {
        const toStore = serializer ? serializer(state) : state;
        localStorage.setItem(key, JSON.stringify(toStore));
      }
    } catch (err) {
      console.warn(`[usePersistentState] Error writing key "${key}" to localStorage:`, err);
    }
  }, [key, state, serializer]);

  return [state, setState];
}
