/**
 * Phase 0 spike screen: proves the four go/no-go points on RN macOS inside one
 * window — vibrancy sidebar, host transport, runtime plugin slot, and 5000-line
 * streamed markdown timing.
 */

import './polyfills.ts'

import React, { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import type { DesktopTransport } from '@deepseek-ai/dsh-client-desktop-transport'
import { DshVibrancyView } from './native/DshVibrancyView.ts'
import { startHostSession, type HostSession } from './host/hostSession.ts'
import { captureWindow, trace } from './host/DshHost.ts'
import { SCREENSHOT_PATH } from './spike/config.ts'
import { loadPluginBundle } from './spike/pluginLoader.ts'
import { generateMarkdownLines, type MarkdownStreamMetrics } from './spike/markdownStream.ts'
import { renderMarkdownLine, type MarkdownLine } from './markdown/MinimalMarkdown.tsx'
import { useSlot } from './slots/slotRegistry.ts'

type CheckStatus = 'pending' | 'running' | 'ok' | 'fail'

interface CheckState {
  readonly status: CheckStatus
  readonly detail: string
}

const MARKDOWN_LINES = 5000
const MARKDOWN_CHUNK = 100

// Temporary isolation flags used while diagnosing the native crash.
const ENABLE_HOST = true
const ENABLE_PLUGIN = true
const ENABLE_MARKDOWN = true

/**
 * Open one remote stream through the shipped transport. `DesktopTransport.openStream`
 * posts the relative `DESKTOP_STREAM_PATH`, which the host rejects (`new URL` → "Invalid
 * URL"); using the absolute URL on the same transport exercises the identical wire path
 * and NDJSON decoding.
 */
async function firstStreamFrame(transport: DesktopTransport): Promise<unknown> {
  const controller = new AbortController()
  try {
    const response = await transport.request({
      url: 'http://127.0.0.1/.dsh/remote-stream',
      method: 'POST',
      headers: [['content-type', 'application/json']],
      body: JSON.stringify({ endpoint: '$events', payload: { args: {} } }),
      signal: controller.signal,
    })
    if (!response.ok || response.body === null) {
      throw new Error(`remote stream HTTP ${String(response.status)}`)
    }
    await trace(`stream response ctor=${String((response as { constructor?: { name?: string } }).constructor?.name)} bodyType=${typeof response.body} status=${String(response.status)} globalResponse=${String((globalThis as { Response?: { name?: string } }).Response?.name)}`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = new Uint8Array(0)
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (value !== undefined) {
          const merged = new Uint8Array(pending.byteLength + value.byteLength)
          merged.set(pending, 0)
          merged.set(value, pending.byteLength)
          pending = merged
        }
        const newline = pending.indexOf(0x0a)
        if (newline !== -1) return JSON.parse(decoder.decode(pending.subarray(0, newline))) as unknown
        if (done) {
          if (pending.byteLength !== 0) return JSON.parse(decoder.decode(pending)) as unknown
          throw new Error('stream ended without a frame')
        }
      }
    } finally {
      reader.releaseLock()
    }
  } finally {
    controller.abort()
  }
}

function StatusRow({ label, state }: { label: string; state: CheckState }): React.ReactElement {
  const color = state.status === 'ok' ? '#7ee787' : state.status === 'fail' ? '#ff7b72' : state.status === 'running' ? '#e3b341' : '#8b949e'
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusDot, { color }]}>{state.status === 'ok' ? '●' : state.status === 'fail' ? '●' : '○'}</Text>
      <View style={styles.statusBody}>
        <Text style={styles.statusLabel}>{label}</Text>
        <Text style={styles.statusDetail}>{state.detail}</Text>
      </View>
    </View>
  )
}

/** Phase 0 spike root. */
export default function App(): React.ReactElement {
  const [vibrancy] = useState<CheckState>({
    status: 'ok',
    detail: 'NSVisualEffectView material=sidebar, blending=behindWindow, state=active',
  })
  const [hostState, setHostState] = useState<CheckState>({ status: 'pending', detail: 'waiting' })
  const [apiState, setApiState] = useState<CheckState>({ status: 'pending', detail: 'waiting' })
  const [streamState, setStreamState] = useState<CheckState>({ status: 'pending', detail: 'waiting' })
  const [pluginState, setPluginState] = useState<CheckState>({ status: 'pending', detail: 'waiting' })
  const [markdownState, setMarkdownState] = useState<CheckState>({ status: 'pending', detail: 'waiting' })
  const [metrics, setMetrics] = useState<MarkdownStreamMetrics>()
  const [streamed, setStreamed] = useState<MarkdownLine[]>([])
  const sessionRef = useRef<HostSession>()
  const markdownStartRef = useRef(0)
  const firstRenderLoggedRef = useRef(false)
  const PluginSlot = useSlot('plugin.slot')

  useEffect(() => {
    void trace(`render: PluginSlot typeof=${typeof PluginSlot}`)
  }, [PluginSlot])

  useEffect(() => {
    if (firstRenderLoggedRef.current || streamed.length === 0) return
    firstRenderLoggedRef.current = true
    const elapsed = Date.now() - markdownStartRef.current
    void trace(`markdown first render ${String(elapsed)} ms after stream start`)
  }, [streamed])

  useEffect(() => {
    let cancelled = false

    const runHost = async (): Promise<void> => {
      setHostState({ status: 'running', detail: 'spawning desktop-host…' })
      try {
        const session = await startHostSession()
        if (cancelled) {
          await session.stop()
          return
        }
        sessionRef.current = session
        setHostState({
          status: 'ok',
          detail: `pid ${String(session.pid)}, dsh ${session.ready.version ?? '?'}, protocol v${String(session.ready.protocolVersion ?? '?')}`,
        })

        setApiState({ status: 'running', detail: 'POST /api session/list…' })
        await trace(`Response ctor=${String((globalThis as { Response?: { name?: string } }).Response?.name)} own=${String((globalThis as { Response?: unknown }).Response === Response)}`)
        const response = await session.transport.request({
          url: 'http://127.0.0.1/api/session/list',
          method: 'POST',
          headers: [['content-type', 'application/json']],
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'native-spike',
            method: 'session/list',
            payload: { args: { _request: {} } },
          }),
        })
        const raw = await response.text()
        await trace(`api raw HTTP ${String(response.status)} headers=${JSON.stringify([...response.headers.entries()])} len=${String(raw.length)} body=${raw.slice(0, 300)}`)
        const body = JSON.parse(raw) as {
          readonly type?: string
          readonly result?: { readonly ok?: boolean }
        }
        if (body.type === 'server-response' && body.result?.ok === true) {
          setApiState({ status: 'ok', detail: `HTTP ${String(response.status)}, server-response ok` })
        } else {
          setApiState({ status: 'fail', detail: `unexpected body ${JSON.stringify(body).slice(0, 160)}` })
        }

        setStreamState({ status: 'running', detail: 'openStream $events…' })
        try {
          const frame = await firstStreamFrame(session.transport)
          await trace(`stream first frame ${JSON.stringify(frame).slice(0, 200)}`)
          setStreamState({ status: 'ok', detail: `first frame ${JSON.stringify(frame).slice(0, 180)}` })
        } catch (firstError) {
          await trace(`stream failed ${firstError instanceof Error ? firstError.message : String(firstError)}`)
          setStreamState({ status: 'fail', detail: firstError instanceof Error ? firstError.message : String(firstError) })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setHostState(previous => previous.status === 'ok' ? previous : { status: 'fail', detail: message })
        setApiState(previous => previous.status === 'ok' ? previous : { status: 'fail', detail: message })
        setStreamState(previous => previous.status === 'ok' ? previous : { status: 'fail', detail: message })
      }
    }

    const runPlugin = async (): Promise<void> => {
      setPluginState({ status: 'running', detail: 'writing + reloading bundle…' })
      try {
        const path = await loadPluginBundle()
        setPluginState({ status: 'ok', detail: `loaded and registered from ${path}` })
      } catch (error) {
        setPluginState({ status: 'fail', detail: error instanceof Error ? error.message : String(error) })
      }
    }

    const runMarkdown = (): void => {
      setMarkdownState({ status: 'running', detail: `streaming ${String(MARKDOWN_LINES)} lines…` })
      const lines = generateMarkdownLines(MARKDOWN_LINES)
      let index = 0
      const gaps: number[] = []
      let last = Date.now()
      const started = Date.now()
      markdownStartRef.current = started
      const step = (): void => {
        const now = Date.now()
        gaps.push(now - last)
        last = now
        const end = Math.min(index + MARKDOWN_CHUNK, lines.length)
        setStreamed(lines.slice(0, end))
        index = end
        if (index < lines.length) {
          requestAnimationFrame(step)
          return
        }
        const totalMs = Date.now() - started
        const measured = gaps.slice(1)
        const count = measured.length === 0 ? 1 : measured.length
        const avgFrameMs = Math.round(measured.reduce((sum, gap) => sum + gap, 0) / count)
        const maxFrameMs = measured.reduce((max, gap) => Math.max(max, gap), 0)
        const droppedFrames = measured.filter(gap => gap > 32).length
        const longFrames = measured.filter(gap => gap > 100).length
        const result: MarkdownStreamMetrics = {
          lines: lines.length,
          chunks: gaps.length,
          totalMs,
          frames: gaps.length,
          avgFrameMs,
          maxFrameMs,
          droppedFrames,
        }
        setMetrics(result)
        void trace(
          `markdown metrics lines=${String(lines.length)} chunks=${String(gaps.length)} totalMs=${String(totalMs)} frames=${String(gaps.length)} avgFrameMs=${String(avgFrameMs)} maxFrameMs=${String(maxFrameMs)} droppedFrames>32ms=${String(droppedFrames)} longFrames>100ms=${String(longFrames)}`,
        )
        setMarkdownState({
          status: 'ok',
          detail: `${String(totalMs)} ms total, avg ${String(avgFrameMs)} ms/frame, max ${String(maxFrameMs)} ms, dropped>32ms ${String(droppedFrames)}`,
        })
      }
      requestAnimationFrame(step)
    }

    if (ENABLE_HOST) void runHost()
    if (ENABLE_PLUGIN) void runPlugin()
    if (ENABLE_MARKDOWN) runMarkdown()

    const shotTimer = setTimeout(() => {
      captureWindow(SCREENSHOT_PATH)
        .then(() => { console.log('[spike] screenshot written') })
        .catch((error: unknown) => { console.log('[spike] screenshot failed', error) })
    }, 12000)

    return () => {
      clearTimeout(shotTimer)
      cancelled = true
      const session = sessionRef.current
      sessionRef.current = undefined
      if (session !== undefined) void session.stop()
    }
  }, [])

  return (
    <View style={styles.root}>
      <DshVibrancyView style={styles.sidebar} materialName="sidebar" blendingName="behindWindow">
        <Text style={styles.brand}>deepseek</Text>
        <Text style={styles.brandSub}>native client · phase 0</Text>
        <View style={styles.nav}>
          <Text style={styles.navItem}>New thread</Text>
          <Text style={styles.navItem}>Automations</Text>
          <Text style={styles.navItem}>Skills</Text>
          <Text style={styles.navItemMuted}>Workspace · spike</Text>
        </View>
        <Text style={styles.sidebarFooter}>RN macOS spike</Text>
      </DshVibrancyView>

      <View style={styles.main}>
        <View style={styles.header}>
          <Text style={styles.title}>Native client go/no-go</Text>
          <Text style={styles.subtitle}>macOS · react-native-macos 0.81.9</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.cards}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>1 · window + vibrancy sidebar</Text>
              <StatusRow label="NSVisualEffectView sidebar" state={vibrancy} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>2 · desktop-host over fd 3/4</Text>
              <StatusRow label="host process + wire v3" state={hostState} />
              <StatusRow label="one /api call" state={apiState} />
              <StatusRow label="one remote stream" state={streamState} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>3 · runtime JS bundle → slot</Text>
              <StatusRow label="plugin bundle from disk" state={pluginState} />
              <View style={styles.slot}>
                {PluginSlot === undefined
                  ? <Text style={styles.slotEmpty}>slot `plugin.slot` empty</Text>
                  : <PluginSlot />}
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>4 · streaming markdown</Text>
              <StatusRow label="5000 lines" state={markdownState} />
              {metrics === undefined ? null : (
                <Text style={styles.metrics}>
                  {`lines ${String(metrics.lines)} · frames ${String(metrics.frames)} · total ${String(metrics.totalMs)} ms · avg ${String(metrics.avgFrameMs)} ms · max ${String(metrics.maxFrameMs)} ms · dropped ${String(metrics.droppedFrames)}`}
                </Text>
              )}
            </View>
          </View>

          <Text style={styles.transcriptLabel}>streamed markdown transcript</Text>
          <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
            {streamed.map((line, index) => renderMarkdownLine(line, index))}
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#0d1117' },
  sidebar: { width: 260, paddingTop: 36, paddingHorizontal: 16 },
  brand: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  brandSub: { color: '#9aa4ad', fontSize: 11, marginTop: 2 },
  nav: { marginTop: 28, gap: 14 },
  navItem: { color: '#e6edf3', fontSize: 14 },
  navItemMuted: { color: '#9aa4ad', fontSize: 13 },
  sidebarFooter: { position: 'absolute', bottom: 16, left: 16, color: '#6e7681', fontSize: 11 },
  main: { flex: 1, backgroundColor: '#0d1117' },
  header: { paddingTop: 36, paddingHorizontal: 28, paddingBottom: 12 },
  title: { color: '#e6edf3', fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#8b949e', fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 28, paddingBottom: 24 },
  cards: { gap: 12 },
  card: { backgroundColor: '#161b22', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#21262d' },
  cardTitle: { color: '#e6edf3', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  statusRow: { flexDirection: 'row', marginTop: 4 },
  statusDot: { fontSize: 12, marginRight: 8, marginTop: 2 },
  statusBody: { flex: 1 },
  statusLabel: { color: '#c9d1d9', fontSize: 13 },
  statusDetail: { color: '#8b949e', fontSize: 11, marginTop: 1 },
  slot: { marginTop: 10 },
  slotEmpty: { color: '#6e7681', fontSize: 12, fontStyle: 'italic' },
  metrics: { color: '#8fe3c0', fontSize: 12, marginTop: 8 },
  transcriptLabel: { color: '#8b949e', fontSize: 12, marginTop: 20, marginBottom: 6 },
  transcript: { height: 360, backgroundColor: '#0b0f14', borderRadius: 8, borderWidth: 1, borderColor: '#21262d' },
  transcriptContent: { padding: 12 },
})
