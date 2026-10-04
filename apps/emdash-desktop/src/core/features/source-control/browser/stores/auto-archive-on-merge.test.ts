import { describe, expect, it } from 'vitest';
import { shouldAutoArchiveOnMerge } from './auto-archive-on-merge';

const merged = { status: 'merged', updatedAt: '2026-10-04T12:00:00Z' };

describe('shouldAutoArchiveOnMerge', () => {
  it('archives a task untouched since its pull request merged', () => {
    expect(shouldAutoArchiveOnMerge({ updatedAt: '2026-10-04 11:59:59' }, merged)).toBe(true);
  });

  it('reads the database timestamp as UTC, not local time', () => {
    expect(shouldAutoArchiveOnMerge({ updatedAt: '2026-10-04 12:00:01' }, merged)).toBe(false);
  });

  it('leaves a task alone once it was touched after the merge, such as a restore', () => {
    expect(shouldAutoArchiveOnMerge({ updatedAt: '2026-10-04T12:30:00Z' }, merged)).toBe(false);
  });

  it('does nothing for an open or closed pull request, or none at all', () => {
    const task = { updatedAt: '2026-10-01 00:00:00' };
    expect(shouldAutoArchiveOnMerge(task, { ...merged, status: 'open' })).toBe(false);
    expect(shouldAutoArchiveOnMerge(task, { ...merged, status: 'closed' })).toBe(false);
    expect(shouldAutoArchiveOnMerge(task, null)).toBe(false);
  });

  it('does nothing for a task that is already archived', () => {
    expect(
      shouldAutoArchiveOnMerge(
        { updatedAt: '2026-10-01 00:00:00', archivedAt: '2026-10-02 00:00:00' },
        merged
      )
    ).toBe(false);
  });

  it('does nothing when a timestamp cannot be read', () => {
    expect(shouldAutoArchiveOnMerge({ updatedAt: 'not a date' }, merged)).toBe(false);
  });
});
