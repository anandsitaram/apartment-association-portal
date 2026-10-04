import { useState, type Dispatch, type SetStateAction } from "react";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback));
  const setPersisted: Dispatch<SetStateAction<T>> = (next) => {
    setValue((current) => {
      const value =
        typeof next === "function" ? (next as (value: T) => T)(current) : next;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Ignore storage failures; in-memory state still works.
      }
      return value;
    });
  };
  return [value, setPersisted];
}
