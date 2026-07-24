import type { ChromeEvent } from '../../shared/types'

declare global {
  interface Window {
    nyx: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cmd(channel: string, payload?: unknown): Promise<any>
      onEvent(cb: (ev: ChromeEvent) => void): () => void
    }
  }
}

export {}
