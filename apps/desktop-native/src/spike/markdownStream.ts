/**
 * Point 4 fixtures: deterministic markdown content and stream timing results.
 */

import { parseMarkdownLine, type MarkdownLine } from '../markdown/MinimalMarkdown.tsx'

/** Build a deterministic 5000-line markdown corpus with mixed block kinds. */
export function generateMarkdownLines(count: number): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  for (let index = 0; index < count; index += 1) {
    if (index % 97 === 0) lines.push(parseMarkdownLine(`# Section ${String(Math.floor(index / 97))}`))
    else if (index % 41 === 0) lines.push(parseMarkdownLine(`## Subsection ${String(index)}`))
    else if (index % 7 === 0) lines.push(parseMarkdownLine(`    const value${String(index)} = compute(${String(index)})`))
    else if (index % 3 === 0) lines.push(parseMarkdownLine(`- bullet item ${String(index)} with several words to render`))
    else lines.push(parseMarkdownLine(`Paragraph line ${String(index)} carrying representative streamed markdown text.`))
  }
  return lines
}

/** Timing observed while streaming markdown into the native view tree. */
export interface MarkdownStreamMetrics {
  readonly lines: number
  readonly chunks: number
  readonly totalMs: number
  readonly frames: number
  readonly avgFrameMs: number
  readonly maxFrameMs: number
  readonly droppedFrames: number
}
