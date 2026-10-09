/**
 * Env se saari keys automatically uthata hai:
 *   PREFIX, PREFIX1, PREFIX2, ... PREFIX{max}
 * Aur optional comma-separated list: PREFIXS="key1,key2,key3"
 * (e.g. GEMINI_API_KEYS=...)
 */
export function collectKeys(prefix: string, max = 100): string[] {
  const names = [
    prefix,
    ...Array.from({ length: max }, (_, i) => `${prefix}${i + 1}`),
  ];

  const keys: (string | undefined)[] = names.map((name) => process.env[name]);

  const list = process.env[`${prefix}S`];
  if (list) keys.push(...list.split(","));

  return [
    ...new Set(
      keys
        .map((key) => key?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  ];
}

/** Har request alag key se shuru ho, taaki load barabar bante. */
export function rotateKeys<T>(keys: T[]): T[] {
  if (keys.length < 2) return keys;
  const start = Math.floor(Math.random() * keys.length);
  return [...keys.slice(start), ...keys.slice(0, start)];
}