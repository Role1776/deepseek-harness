/**
 * WorkflowRunPanel's injected business face. The keyed
 * `conversation.chat.node` slot and its data map are declared and typed by
 * ui-chat and ui-conversation; this package contributes the entry and the
 * `workflow-run` payload shape, so no SlotMap merge lives here.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Navigation action injected from the plugin's own Session Controller access. */
export interface WorkflowRunInjected {
  readonly openSession: (id: SessionId) => void
}
