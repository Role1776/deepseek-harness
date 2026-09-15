import { describe, expect, it } from 'vitest'
import { findModelPurityViolations, isForbiddenModule } from './verify-client-model-purity.ts'

describe('client model purity', () => {
  it('rejects a react-dom value import, including a subpath', () => {
    const violations = findModelPurityViolations(
      'packages/client/ui-example/src/model/store.ts',
      'import { createPortal } from "react-dom"\nimport { flushSync } from "react-dom/client"\n',
    )
    expect(violations.map(v => v.what)).toEqual(['imports "react-dom"', 'imports "react-dom/client"'])
    expect(isForbiddenModule('react-dom')).toBe(true)
    expect(isForbiddenModule('react-dom/server')).toBe(true)
    expect(isForbiddenModule('react')).toBe(false)
  })

  it('rejects a DOM global reference but not a same-named property or member', () => {
    const global = findModelPurityViolations(
      'packages/client/ui-example/src/model/store.ts',
      'const el: HTMLElement = document.createElement("div")\nwindow.localStorage.setItem("k", "v")\n',
    )
    expect(global.map(v => v.what)).toEqual([
      'references DOM global "HTMLElement"',
      'references DOM global "document"',
      'references DOM global "window"',
    ])

    const member = findModelPurityViolations(
      'packages/client/ui-example/src/model/store.ts',
      'const node = { document: 1 }\nconst text = view.window\ntype T = { window: string }\n',
    )
    expect(member).toEqual([])
  })

  it('rejects a .tsx model file and accepts a clean .ts model file', () => {
    const tsx = findModelPurityViolations(
      'packages/client/ui-example/src/model/View.tsx',
      'export const View = () => null\n',
    )
    expect(tsx.map(v => v.what)).toEqual(['model files must be .ts, never .tsx'])

    const clean = findModelPurityViolations(
      'packages/client/ui-example/src/model/select.ts',
      'export function selectPlan(plan: { pending: boolean; active: boolean }): boolean {\n  return plan.pending ? !plan.active : plan.active\n}\n',
    )
    expect(clean).toEqual([])
  })

  it('detects a CommonJS require of a forbidden module', () => {
    const violations = findModelPurityViolations(
      'packages/client/ui-example/src/model/store.ts',
      'const dom = require("react-dom")\n',
    )
    expect(violations.map(v => v.what)).toEqual(['requires "react-dom"'])
  })
})
