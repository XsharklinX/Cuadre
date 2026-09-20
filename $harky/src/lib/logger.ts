const dev = import.meta.env.DEV

export const log = {
  error: (msg: string, err?: unknown): void => {
    if (dev) console.error('[sharky]', msg, err)
  },
  warn: (msg: string, ctx?: unknown): void => {
    if (dev) console.warn('[sharky]', msg, ctx)
  },
}
