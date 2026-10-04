import { Transform, type Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

/**
 * codex-acp reports shell commands that keep running after the agent's turn as
 * "async tasks", but only to a client that advertises this capability.
 */
export const CODEX_ASYNC_TASKS_CLIENT_META = {
  jetbrains: { air: { version: 1, capabilities: ['asyncTasks'] } },
};

/** `_meta` key the translated updates carry; read back by `enrichCodexUpdate`. */
export const CODEX_ASYNC_TASK_META_KEY = 'emdashCodexAsyncTask';

export type CodexAsyncTaskMeta = {
  id: string;
  state: string;
  /** Present on the announcement only. */
  name?: string;
  spawned?: true;
};

/**
 * The async-task notices are `session/update` variants outside the ACP schema, which
 * the SDK rejects. Rewrite each into a `tool_call_update` on the command's own tool
 * call, with the task in `_meta`, so it survives validation and reaches the enrich hook.
 */
export function rewriteCodexAsyncTaskLine(line: string): string {
  if (!line.includes('"async_task_')) return line;
  let message: {
    method?: unknown;
    params?: { update?: Record<string, unknown> };
  };
  try {
    message = JSON.parse(line);
  } catch {
    return line;
  }
  const update = message.params?.update;
  if (message.method !== 'session/update' || !update) return line;
  const kind = update.sessionUpdate;
  if (kind !== 'async_task_spawned' && kind !== 'async_task_state_update') return line;
  const id = update.asyncTaskId;
  if (typeof id !== 'string') return line;

  const task: CodexAsyncTaskMeta =
    kind === 'async_task_spawned'
      ? {
          id,
          state: 'running',
          spawned: true,
          ...(typeof update.name === 'string' ? { name: update.name } : {}),
        }
      : { id, state: typeof update.state === 'string' ? update.state : 'completed' };
  message.params!.update = {
    sessionUpdate: 'tool_call_update',
    toolCallId: typeof update.toolCallId === 'string' ? update.toolCallId : id,
    _meta: { [CODEX_ASYNC_TASK_META_KEY]: task },
  };
  return JSON.stringify(message);
}

/** The adapter's stdout with async-task notices rewritten line by line. */
export function translateCodexAsyncTasks(stdout: Readable): Readable {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const translated = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      pending += decoder.write(chunk);
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      callback(
        null,
        lines.length > 0 ? `${lines.map(rewriteCodexAsyncTaskLine).join('\n')}\n` : undefined
      );
    },
    flush(callback) {
      const rest = pending + decoder.end();
      callback(null, rest ? rewriteCodexAsyncTaskLine(rest) : undefined);
    },
  });
  stdout.on('error', (error) => translated.destroy(error));
  return stdout.pipe(translated);
}
