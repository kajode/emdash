import { Readable } from 'node:stream';
import type { SessionUpdate } from '@agentclientprotocol/sdk';
import type { NormalizedEvent } from '@emdash/core/runtimes/acp/api';
import { describe, expect, it } from 'vitest';
import { enrichCodexUpdate } from './acp-enrich';
import {
  CODEX_ASYNC_TASK_META_KEY,
  rewriteCodexAsyncTaskLine,
  translateCodexAsyncTasks,
} from './async-tasks';

const notice = (update: Record<string, unknown>) =>
  JSON.stringify({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 's1', update } });

const spawned = notice({
  sessionUpdate: 'async_task_spawned',
  asyncTaskId: 'task-1',
  name: 'pnpm dev',
  taskType: 'shell',
  toolCallId: 'call-1',
});
const finished = notice({
  sessionUpdate: 'async_task_state_update',
  asyncTaskId: 'task-1',
  state: 'completed',
  toolCallId: 'call-1',
});

function updateOf(line: string): SessionUpdate {
  return JSON.parse(line).params.update as SessionUpdate;
}

const toolUpdate = (toolCallId: string): NormalizedEvent => ({
  kind: 'tool_update',
  toolCallId,
  title: null,
  toolKind: null,
  status: null,
  parentToolCallId: null,
  diffs: [],
});

describe('rewriteCodexAsyncTaskLine', () => {
  it('turns the announcement into a schema-valid tool call update carrying the task', () => {
    expect(updateOf(rewriteCodexAsyncTaskLine(spawned))).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      _meta: {
        [CODEX_ASYNC_TASK_META_KEY]: {
          id: 'task-1',
          state: 'running',
          spawned: true,
          name: 'pnpm dev',
        },
      },
    });
  });

  it('carries the end state of a finished task', () => {
    expect(updateOf(rewriteCodexAsyncTaskLine(finished))._meta).toEqual({
      [CODEX_ASYNC_TASK_META_KEY]: { id: 'task-1', state: 'completed' },
    });
  });

  it('passes every other line through byte for byte', () => {
    const message = notice({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'async_task' },
    });
    const broken = '{"method":"session/update","async_task_';

    expect(rewriteCodexAsyncTaskLine(message)).toBe(message);
    expect(rewriteCodexAsyncTaskLine(broken)).toBe(broken);
  });
});

describe('translateCodexAsyncTasks', () => {
  it('rewrites notices split across chunks and keeps line framing', async () => {
    const wire = `${spawned}\n${notice({ sessionUpdate: 'plan', entries: [] })}\n`;
    const half = Math.floor(spawned.length / 2);
    const source = Readable.from([Buffer.from(wire.slice(0, half)), Buffer.from(wire.slice(half))]);

    let out = '';
    for await (const chunk of translateCodexAsyncTasks(source)) out += String(chunk);

    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(updateOf(lines[0]!).sessionUpdate).toBe('tool_call_update');
    expect(updateOf(lines[1]!).sessionUpdate).toBe('plan');
    expect(lines[2]).toBe('');
  });
});

describe('enrichCodexUpdate async tasks', () => {
  it('reports a spawned task as a running background job on its command', () => {
    const raw = updateOf(rewriteCodexAsyncTaskLine(spawned));

    expect(enrichCodexUpdate(toolUpdate('call-1'), raw)).toEqual({
      kind: 'subagent',
      operation: 'update',
      toolCallId: 'call-1',
      title: 'pnpm dev',
      status: 'in_progress',
      parentToolCallId: null,
      background: true,
      job: true,
      agentId: 'task-1',
    });
  });

  it('settles the job when the task reaches an end state', () => {
    const settle = (state: string) =>
      enrichCodexUpdate(
        toolUpdate('call-1'),
        updateOf(
          rewriteCodexAsyncTaskLine(
            notice({
              sessionUpdate: 'async_task_state_update',
              asyncTaskId: 'task-1',
              state,
              toolCallId: 'call-1',
            })
          )
        )
      );

    expect(settle('completed')).toMatchObject({
      kind: 'subagent_update',
      agentId: 'task-1',
      status: 'completed',
    });
    expect(settle('stopped')).toMatchObject({ status: 'completed' });
    expect(settle('failed')).toMatchObject({ status: 'failed' });
    expect(settle('stopping')).toMatchObject({ status: 'in_progress' });
  });
});
