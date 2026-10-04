type ArchivableTask = { archivedAt?: string; updatedAt: string };
type ObservedPr = { status: string; updatedAt: string };

/** SQLite's CURRENT_TIMESTAMP is UTC without a zone marker; `Date` would read it as local. */
function toEpochMs(timestamp: string): number {
  const iso = timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

/**
 * A task is archived once when its pull request merges. "Once" is decided by time:
 * anything that touches the task after the merge (restoring it, renaming it, moving
 * its status) makes the task newer than the pull request, so it is left alone.
 */
export function shouldAutoArchiveOnMerge(task: ArchivableTask, pr: ObservedPr | null): boolean {
  if (!pr || pr.status !== 'merged' || task.archivedAt) return false;
  const taskUpdatedAt = toEpochMs(task.updatedAt);
  const prUpdatedAt = toEpochMs(pr.updatedAt);
  if (Number.isNaN(taskUpdatedAt) || Number.isNaN(prUpdatedAt)) return false;
  return taskUpdatedAt < prUpdatedAt;
}
