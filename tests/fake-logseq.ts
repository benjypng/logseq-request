export interface FakeCall {
  method: string
  pluginId: string
  options: Record<string, unknown>
}

export interface FakeLogseqOptions {
  /** Value delivered to the task callback. Ignored when respond is false. */
  response?: unknown
  /** When false, the callback never fires (simulates a dead IPC). */
  respond?: boolean
}

/**
 * Installs a fake `logseq` global mimicking the exper_request IPC:
 * `_execCallableAPIAsync` records the call and returns a request id;
 * `Request.once('task_callback_<id>', cb)` fires cb(response) on the
 * microtask queue, like the real async IPC. Returns the recorded calls.
 */
export const installFakeLogseq = (
  opts: FakeLogseqOptions = {},
): { calls: FakeCall[] } => {
  const { response, respond = true } = opts
  const calls: FakeCall[] = []

  const fake = {
    baseInfo: { id: 'test-plugin' },
    Request: {
      once: (_event: string, cb: (res: unknown) => void) => {
        if (respond) queueMicrotask(() => cb(response))
      },
    },
    _execCallableAPIAsync: async (
      method: string,
      pluginId: string,
      options: Record<string, unknown>,
    ) => {
      calls.push({ method, pluginId, options })
      return 42
    },
  }

  ;(globalThis as Record<string, unknown>).logseq = fake
  return { calls }
}

export const uninstallFakeLogseq = () => {
  delete (globalThis as Record<string, unknown>).logseq
}
