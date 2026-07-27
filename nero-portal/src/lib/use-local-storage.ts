"use client";

import { useCallback, useSyncExternalStore } from "react";

// Notificador de mesma aba: o evento nativo "storage" só dispara em OUTRAS abas,
// então mantemos um conjunto de listeners para re-renderizar quem usa o hook
// quando a própria aba grava (via setLocalStorage).
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Grava em localStorage e notifica os hooks da própria aba. */
export function setLocalStorage(key: string, value: string) {
  localStorage.setItem(key, value);
  for (const cb of listeners) cb();
}

/**
 * Lê um valor de localStorage de forma compatível com SSR/hidratação.
 *
 * `serverValue` é o que o servidor (e o primeiro render de hidratação) enxerga —
 * o `useSyncExternalStore` re-renderiza no cliente com o valor real logo em
 * seguida, sem o mismatch de hidratação nem o setState-dentro-de-effect.
 */
export function useLocalStorage(key: string, serverValue: string | null = null): string | null {
  const getSnapshot = useCallback(() => localStorage.getItem(key), [key]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
