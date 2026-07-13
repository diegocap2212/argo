import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Extrai uma mensagem legível de um erro desconhecido (evita `catch (e: any)`). */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Log só em desenvolvimento — evita ruído no console em produção. */
export function devWarn(...args: unknown[]) {
  if (import.meta.env.DEV) console.warn(...args);
}
