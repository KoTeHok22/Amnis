// Лёгкий логгер: пишет в консоль только в dev-сборке.
// В проде (import.meta.env.PROD) все вызовы — no-op, чтобы не светить отладку.
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => { if (isDev) console.log(...args); },
  error: (...args: unknown[]) => { if (isDev) console.error(...args); },
  warn: (...args: unknown[]) => { if (isDev) console.warn(...args); },
  info: (...args: unknown[]) => { if (isDev) console.info(...args); },
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args); },
};
