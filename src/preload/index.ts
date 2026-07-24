import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nyx', {
  cmd: (channel: string, payload?: unknown) => ipcRenderer.invoke('nyx:cmd', channel, payload),
  onEvent: (cb: (ev: unknown) => void) => {
    const listener = (_e: unknown, ev: unknown): void => cb(ev)
    ipcRenderer.on('nyx:event', listener)
    return () => ipcRenderer.removeListener('nyx:event', listener)
  }
})
