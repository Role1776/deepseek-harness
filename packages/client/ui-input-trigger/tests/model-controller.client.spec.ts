/**
 * InputTriggerController edge cases: disposal guards, roster drift between
 * track and pick, programmatic launcher refresh, reference serialization,
 * lexicon notification teardown, and superseded candidate rejections. These
 * exercise the defensive and liveness arms the service-level spec does not.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { InputTriggerController } from '../src/model/controller.ts'
import type { SourceRoster } from '../src/model/controller.ts'
import type { TriggerHit } from '../src/model/contract.ts'
import type { InputTriggerCandidate, InputTriggerSource } from '../src/types.ts'

const sid = (k: string): SessionId => k as SessionId

/** Minimal source with overridable hooks. */
function makeSource(over: Partial<InputTriggerSource> = {}): InputTriggerSource {
  return {
    trigger: '/',
    name: 'command',
    candidates: () => Promise.resolve([]),
    onPick: () => undefined,
    ...over,
  }
}

/** Direct controller bench with a live roster array. */
function bench(sources: InputTriggerSource[]) {
  const actx = new Context()
  const roster: SourceRoster = {
    sources: trigger => sources.filter(s => s.trigger === trigger),
    all: () => sources,
  }
  const controller = new InputTriggerController({ actx, sessionId: sid('a'), roster })
  return { controller, sources, actx }
}

const hit = (query = ''): TriggerHit => ({
  trigger: '/', query, quoted: false, position: 'leading', span: { start: 0, end: 0, draftRev: 1 },
})

/** One microtask hop for settled candidate promises. */
const tick = () => Promise.resolve()

describe('InputTriggerController guards', () => {
  it('toggleSource is inert after dispose and dismisses for an unregistered source', () => {
    const disposed = bench([makeSource()])
    disposed.controller.dispose()
    disposed.controller.toggleSource('command', hit())

    const fresh = bench([makeSource()])
    fresh.controller.toggleSource('ghost', hit())
    expect(fresh.controller.menu.getSnapshot().open).toBe(false)
    expect(fresh.controller.launcher.getSnapshot()).toBeNull()
  })

  it('pick and pickCrumb stop when the roster lost the source after the menu opened', async () => {
    const { controller, sources } = bench([makeSource({ candidates: () => Promise.resolve([{ name: 'goal' }]) })])
    controller.track('/g', 2, { tier: 'plain' }, 1)
    await tick()
    sources.splice(0)
    controller.pick('command', 0)
    expect(controller.menu.getSnapshot().open).toBe(true)
  })

  it('pickCrumb ignores an absent crumb, the current step, and a stale roster', async () => {
    const ready = { candidates: () => Promise.resolve([{ name: 'x' }]) }
    const bare = bench([makeSource({ trigger: '@', name: 'reference', ...ready })])
    bare.controller.track('@x', 2, { tier: 'plain' }, 1)
    await tick()
    bare.controller.pickCrumb('reference', 0)

    const current = bench([makeSource({
      trigger: '@', name: 'reference', ...ready, header: () => [{ label: 'cur', value: 'cur', current: true }],
    })])
    current.controller.track('@x', 2, { tier: 'plain' }, 1)
    await tick()
    current.controller.pickCrumb('reference', 0)

    const stale = bench([makeSource({
      trigger: '@', name: 'reference', ...ready, header: () => [{ label: 'src', value: 'src' }],
    })])
    stale.controller.track('@x', 2, { tier: 'plain' }, 1)
    await tick()
    stale.sources.splice(0)
    stale.controller.pickCrumb('reference', 0)
    expect(stale.controller.menu.getSnapshot().open).toBe(true)
  })

  it('arbitrate passes when the highlight index vanished from a ready group', async () => {
    const { controller } = bench([makeSource({ candidates: () => Promise.resolve([{ name: 'goal' }]) })])
    controller.track('/g', 2, { tier: 'plain' }, 1)
    await tick()
    controller.menu.set({ ...controller.menu.getSnapshot(), highlight: { source: 'command', index: 5 } })
    expect(controller.arbitrate('tab', false)).toBe('pass')
  })

  it('onSpace answers false when no source claims the leading token', () => {
    const { controller } = bench([makeSource({ matchSpace: () => undefined })])
    controller.track('/goal', 5, { tier: 'plain' }, 1)
    expect(controller.onSpace()).toBe(false)
  })

  it('dismiss is inert after dispose', () => {
    const { controller } = bench([makeSource()])
    controller.dispose()
    controller.dismiss()
    expect(controller.menu.getSnapshot().open).toBe(false)
  })
})

describe('serializeReference', () => {
  it('rejects without an owner or a codec, then delegates to the owner codec', async () => {
    const signal = new AbortController().signal
    const missing = bench([makeSource()])
    await expect(missing.controller.serializeReference('ghost', 'ref', signal)).rejects.toThrow(/no serializer/)
    await expect(missing.controller.serializeReference('command', 'ref', signal)).rejects.toThrow(/no serializer/)

    const serialize = vi.fn((_ref: string, _signal: AbortSignal) => Promise.resolve('<skill>ref</skill>'))
    const owned = bench([makeSource({ codec: { clipboardText: () => 'ref', serialize } })])
    await expect(owned.controller.serializeReference('command', 'ref', signal)).resolves.toBe('<skill>ref</skill>')
    expect(serialize).toHaveBeenCalledWith('ref', signal)
  })
})

describe('refreshOpenMenu', () => {
  it('re-fetches only the launched source, and returns when the roster is empty', async () => {
    const commandFetch = vi.fn(() => Promise.resolve<readonly InputTriggerCandidate[]>([]))
    const skillFetch = vi.fn(() => Promise.resolve<readonly InputTriggerCandidate[]>([]))
    const { controller, sources } = bench([
      makeSource({ name: 'command', candidates: commandFetch }),
      makeSource({ name: 'skill', candidates: skillFetch }),
    ])
    controller.toggleSource('command', hit())
    commandFetch.mockClear()
    skillFetch.mockClear()
    controller.refreshOpenMenu()
    expect(commandFetch).toHaveBeenCalledTimes(1)
    expect(skillFetch).not.toHaveBeenCalled()

    sources.splice(0)
    controller.refreshOpenMenu()
  })
})

describe('lexicon failure and teardown', () => {
  it('drops a throwing lexicon source with a console record', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { controller } = bench([makeSource({
      lexicon: () => { throw new Error('boom') },
    })])
    expect(controller.lexicon.getSnapshot().size).toBe(0)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('lexicon failed'), expect.any(Error))
    spy.mockRestore()
  })

  it('a lexicon notification closes out when no open menu matches, and after dispose', async () => {
    let notify: (() => void) | undefined
    const { controller } = bench([makeSource({
      name: 'skill',
      candidates: () => Promise.resolve([{ name: 'x' }]),
      lexicon: () => ['x'],
      subscribeLexicon: (_session, listener) => {
        notify = listener
        return () => { notify = undefined }
      },
    })])
    const listener = notify
    listener?.()
    await tick()

    controller.track('/', 1, { tier: 'plain' }, 1)
    await tick()
    listener?.()
    controller.dispose()
    await tick()
    expect(controller.menu.getSnapshot().open).toBe(false)
  })
})

describe('fetch supersession', () => {
  it('ignores a candidate rejection once its fetch was aborted', async () => {
    const pending: ((error: unknown) => void)[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { controller } = bench([makeSource({
      candidates: () => new Promise<readonly InputTriggerCandidate[]>((_resolve, reject) => { pending.push(reject) }),
    })])
    controller.track('/g', 2, { tier: 'plain' }, 1)
    controller.dismiss()
    pending[0]?.(new Error('late'))
    await tick()
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('rejects adjudication on a non-Error abort reason', async () => {
    const { controller } = bench([makeSource()])
    const abort = new AbortController()
    abort.abort('halt')
    await expect(controller.adjudicate('/goal', abort.signal, { attachments: 0 }))
      .rejects.toThrow('slash adjudication aborted')
  })
})
