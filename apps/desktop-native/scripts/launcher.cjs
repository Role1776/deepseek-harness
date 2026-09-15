'use strict'

// Phase 0 spike launcher. The native module (NSTask) cannot easily hand the
// host exactly fd 3/4 plus a Node IPC channel, so this process owns that spawn
// and relays bytes:
//   native stdin  -> host fd3 (request pipe)
//   host fd4      -> native stdout (response pipe)
//   host stderr   -> native stderr, prefixed
//   host readiness is announced as a single `DSH_READY {json}` stderr line.
//
// It also prepares the isolated desktop profile and heals the profile module
// fallback exactly like the desktop-transport integration test does.

const { spawn } = require('node:child_process')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

const [hostEntry, runtimeDir, projectDir] = process.argv.slice(2)
if (hostEntry === undefined || runtimeDir === undefined || projectDir === undefined) {
  process.stderr.write('DSH_FATAL launcher: expected host entry, runtime dir, and project dir\n')
  process.exit(2)
}

async function prepareProfile() {
  const home = projectDir
  const profileDir = join(projectDir, 'profiles', 'spike')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-desktop-native-spike',
    version: '0.0.0',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }) + '\n')
  const appBoot = await import(pathToFileURL(join(runtimeDir, '..', '..', 'packages', 'boot', 'app-boot', 'lib', 'index.js')).href)
  const installAnchor = join(runtimeDir, '..', 'cli', 'package.json')
  const profile = appBoot.loadProfileDirectory('dsh desktop', profileDir, installAnchor)
  await appBoot.healProfilesModuleFallback({ installAnchor, profile, home })
  return { home, profileDir }
}

async function main() {
  const { home, profileDir } = await prepareProfile()
  const child = spawn(process.execPath, [hostEntry, runtimeDir, profileDir, '--allow-linked-profile'], {
    cwd: profileDir,
    env: { ...process.env, DSH_HOME: home },
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'ipc'],
  })

  const toHost = child.stdio[3]
  const fromHost = child.stdio[4]

  process.stdin.on('data', (chunk) => {
    if (toHost.writable) toHost.write(chunk)
  })
  process.stdin.on('end', () => {
    if (toHost.writable) toHost.end()
  })

  fromHost.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  fromHost.on('end', () => {
    process.stdout.end()
  })
  fromHost.on('error', (error) => {
    process.stderr.write(`DSH_FATAL response pipe failed: ${error.message}\n`)
  })

  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.length > 0) process.stderr.write(`[host] ${line}\n`)
    }
  })

  child.on('message', (message) => {
    if (message !== null && typeof message === 'object' && message.type === 'ready') {
      process.stderr.write(`DSH_READY ${JSON.stringify({ version: message.dshVersion, protocolVersion: message.protocolVersion })}\n`)
    } else if (message !== null && typeof message === 'object' && message.type === 'fatal') {
      process.stderr.write(`DSH_FATAL ${String(message.message)}\n`)
    }
  })

  child.on('exit', (code, signal) => {
    process.stderr.write(`DSH_FATAL host exited code=${String(code)} signal=${String(signal)}\n`)
    process.exit(code === null ? 1 : code)
  })

  let shuttingDown = false
  function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    try {
      child.send({ type: 'shutdown' })
    } catch {
      child.kill('SIGKILL')
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // The child already exited; nothing to kill.
      }
    }, 8000)
    timer.unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  process.stderr.write(`DSH_FATAL launcher failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
