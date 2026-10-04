import type { EnrichHook, NormalizedEvent } from '@emdash/core/runtimes/acp/api';
import { CODEX_ASYNC_TASK_META_KEY, type CodexAsyncTaskMeta } from './async-tasks';

/**
 * codex-acp represents startup diagnostics as synthetic failed tool calls, and
 * background shell commands as async tasks (see `async-tasks.ts`).
 */
export const enrichCodexUpdate: EnrichHook = (event, raw) => {
  const task = (raw._meta as Record<string, unknown> | null | undefined)?.[
    CODEX_ASYNC_TASK_META_KEY
  ] as CodexAsyncTaskMeta | undefined;
  if (task && event.kind === 'tool_update') return asyncTaskEvent(event.toolCallId, task);

  if (
    event.kind !== 'tool_call' ||
    event.status !== 'failed' ||
    event.toolKind !== 'other' ||
    event.parentToolCallId !== null ||
    !event.toolCallId.startsWith('mcp_startup.')
  )
    return event;

  let server: string;
  try {
    server = decodeURIComponent(event.toolCallId.slice('mcp_startup.'.length));
  } catch {
    return event;
  }
  if (!server || event.title !== `mcp__${server}__startup`) return event;
  const error =
    raw.sessionUpdate === 'tool_call'
      ? raw.content
          ?.flatMap((entry) =>
            entry.type === 'content' && entry.content.type === 'text' ? [entry.content.text] : []
          )
          .join('\n')
      : undefined;
  return {
    kind: 'mcp_startup_failure',
    server,
    error: error || 'MCP server failed to start.',
  };
};

function asyncTaskEvent(toolCallId: string, task: CodexAsyncTaskMeta): NormalizedEvent {
  if (task.spawned) {
    return {
      kind: 'subagent',
      operation: 'update',
      toolCallId,
      title: task.name ?? '',
      status: 'in_progress',
      parentToolCallId: null,
      background: true,
      job: true,
      agentId: task.id,
    };
  }
  return {
    kind: 'subagent_update',
    agentId: task.id,
    toolCallId,
    status:
      task.state === 'running' || task.state === 'stopping'
        ? 'in_progress'
        : task.state === 'failed'
          ? 'failed'
          : 'completed',
  };
}
