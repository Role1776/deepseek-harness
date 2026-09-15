/**
 * Minimal native markdown line renderer for the Phase 0 perf point. It parses
 * one line into a block kind and renders an RN `Text`; it is deliberately not
 * the production markdown renderer (that is Phase 2 work).
 */

import React from 'react'
import { Text, type TextStyle } from 'react-native'

/** Parsed block kind of one markdown line. */
export type MarkdownBlockKind = 'h1' | 'h2' | 'paragraph' | 'bullet' | 'code'

/** One parsed markdown line. */
export interface MarkdownLine {
  readonly kind: MarkdownBlockKind
  readonly text: string
}

const BASE: TextStyle = { color: '#d6d6d6', fontSize: 14, lineHeight: 20 }

const STYLES: Record<MarkdownBlockKind, TextStyle> = {
  h1: { ...BASE, color: '#ffffff', fontSize: 24, lineHeight: 30, fontWeight: '700', marginTop: 8 },
  h2: { ...BASE, color: '#ffffff', fontSize: 18, lineHeight: 24, fontWeight: '600', marginTop: 6 },
  paragraph: BASE,
  bullet: { ...BASE, paddingLeft: 12 },
  code: { ...BASE, color: '#9be7a0', fontFamily: 'Menlo' },
}

/** Parse one raw markdown line into a block kind plus display text. */
export function parseMarkdownLine(raw: string): MarkdownLine {
  if (raw.startsWith('# ')) return { kind: 'h1', text: raw.slice(2) }
  if (raw.startsWith('## ')) return { kind: 'h2', text: raw.slice(3) }
  if (raw.startsWith('- ')) return { kind: 'bullet', text: `• ${raw.slice(2)}` }
  if (raw.startsWith('    ')) return { kind: 'code', text: raw.slice(4) }
  return { kind: 'paragraph', text: raw }
}

/** Render one parsed line as an RN `Text`. */
export function renderMarkdownLine(line: MarkdownLine, key: number): React.ReactElement {
  return React.createElement(Text, { key, style: STYLES[line.kind] }, line.text)
}
