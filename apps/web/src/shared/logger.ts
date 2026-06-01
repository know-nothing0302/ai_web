const dev = import.meta.env.DEV;

export const logger = {
  error: (tag: string, detail?: unknown): void => {
    if (dev) console.error(`[${tag}]`, detail);
  },
  warn: (tag: string, detail?: unknown): void => {
    if (dev) console.warn(`[${tag}]`, detail);
  },
  info: (tag: string, detail?: unknown): void => {
    if (dev) console.info(`[${tag}]`, detail);
  },
};
