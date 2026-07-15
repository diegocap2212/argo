const APP_PATH = /^\/(dash|maturity)(\/|$)/;
const ENCODED_PATH_SEPARATOR = /%(2f|5c|2e)/i;

/** Accept only canonical, same-origin destinations owned by the two portal apps. */
export function safeNextPath(value: string | null): string | null {
  if (!value || !APP_PATH.test(value)) return null;
  if (value.includes('\\') || value.includes('#') || ENCODED_PATH_SEPARATOR.test(value)) return null;

  try {
    const url = new URL(value, 'https://neo.invalid');
    const normalized = `${url.pathname}${url.search}`;
    if (url.origin !== 'https://neo.invalid' || normalized !== value) return null;
    return APP_PATH.test(url.pathname) ? normalized : null;
  } catch {
    return null;
  }
}
