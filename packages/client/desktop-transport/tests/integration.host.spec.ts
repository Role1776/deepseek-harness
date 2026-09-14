import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { healProfilesModuleFallback, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import {
  DESKTOP_REQUEST_PIPE_FD,
  DESKTOP_RESPONSE_PIPE_FD,
  DesktopTransport,
  type DesktopTransportCarrier,
} from '../src/index.ts'

const REPOSITORY = fileURLToPath(new URL('../../../../', import.meta.url))
const RUNTIME_DIR = resolve(REPOSITORY, 'apps/desktop-host')
const HOST_ENTRY = resolve(RUNTIME_DIR, 'lib/index.js')
const INSTALL_ANCHOR = resolve(REPOSITORY, 'apps/cli/package.json')

// The spawn needs the built desktop host and a built host graph on disk; a
// source-only checkout cannot provide either, so the case self-skips there.
const BUILT = existsSync(HOST_ENTRY) && existsSync(resolve(REPOSITORY, 'packages/core/session/lib/index.js'))

const roots: string[] = []
const children = new Set<ChildProcess>()

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  children.clear()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Carrier over one spawned host's request and response descriptors. */
function carrierFor(child: ChildProcess): DesktopTransportCarrier {
  const requestPipe = child.stdio[DESKTOP_REQUEST_PIPE_FD]
  const responsePipe = child.stdio[DESKTOP_RESPONSE_PIPE_FD]
  if (!(requestPipe instanceof Writable) || !(responsePipe instanceof Readable)) {
    throw new Error('spawned host did not expose the byte pipes')
  }
  return {
    write: frame => new Promise<void>((resolveWrite) => {
      if (requestPipe.write(frame)) resolveWrite()
      else requestPipe.once('drain', () => { resolveWrite() })
    }),
    onBytes: (listener) => {
      responsePipe.on('data', listener)
      return () => { responsePipe.off('data', listener) }
    },
    onClose: (listener) => {
      const end = (): void => { listener() }
      const error = (failure: Error): void => { listener(failure) }
      responsePipe.once('end', end)
      responsePipe.once('error', error)
      return () => {
        responsePipe.off('end', end)
        responsePipe.off('error', error)
      }
    },
  }
}

/** Resolve once the host reports readiness, rejecting on fatal or early exit. */
function readiness(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolveReady, rejectReady) => {
    child.on('message', (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) {
        rejectReady(new Error('host sent an invalid IPC message'))
        return
      }
      const candidate = message as { type: string; message?: string }
      if (candidate.type === 'ready') resolveReady()
      else if (candidate.type === 'fatal') rejectReady(new Error(candidate.message ?? 'host failed'))
    })
    child.once('exit', (code) => { rejectReady(new Error(`host exited before readiness with ${String(code)}`)) })
  })
}

/** Gracefully stop the host and await its exit. */
async function shutdown(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.send({ type: 'shutdown' })
  await new Promise<void>((resolveExit) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolveExit() }, 10_000)
    timer.unref()
    child.once('exit', () => { clearTimeout(timer); resolveExit() })
  })
}

describe.runIf(BUILT)('desktop host wire v3 integration', () => {
  it('boots the real built host over fd 3/4 and performs one /api call', async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-transport-'))
    roots.push(home)
    const projectDir = join(home, 'profiles', 'test')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
      name: 'dsh-desktop-transport-test',
      version: '0.0.0',
      private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    }) + '\n')
    const profile = loadProfileDirectory('dsh desktop', projectDir, INSTALL_ANCHOR)
    await healProfilesModuleFallback({ installAnchor: INSTALL_ANCHOR, profile, home })

    const child = spawn(process.execPath, [
      HOST_ENTRY,
      RUNTIME_DIR,
      projectDir,
      '--allow-linked-profile',
    ], {
      cwd: projectDir,
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
    })
    children.add(child)
    const transport = new DesktopTransport(carrierFor(child))
    await readiness(child)

    const response = await transport.request({
      url: 'http://127.0.0.1/api/session/list',
      method: 'POST',
      headers: [['content-type', 'application/json']],
      body: JSON.stringify({
        type: 'client-request',
        rpcId: 'desktop-transport-integration',
        method: 'session/list',
        payload: { args: { _request: {} } },
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      readonly type: string
      readonly result: { readonly ok: boolean }
    }
    expect(body.type).toBe('server-response')
    expect(body.result.ok).toBe(true)

    transport.dispose()
    await shutdown(child)
  }, 60_000)
})
