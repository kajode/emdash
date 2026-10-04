import { observable, runInAction } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import { taskManagerStoreToken } from '@core/features/tasks/contributions/browser/project-store-tokens';
import type { WorkbenchSidebarState } from '@core/features/workbench/contributions/mementos';
import type { MementoHandle } from '@core/primitives/mementos/browser';
import { SidebarStore, type SidebarRow } from './sidebar-store';

type SidebarProjectManager = ConstructorParameters<typeof SidebarStore>[0];

vi.mock('@core/features/conversations/browser/acp/acp-chat-store', () => ({
  AcpChatStore: class {
    conversationId = '';
    dispose() {}
    bootstrap() {}
  },
}));

vi.mock('@core/features/conversations/browser/acp/acp-chat-panel', () => ({
  AcpChatPanel: () => null,
}));

function projectManager(projects: { id: string; createdAt: string }[]): SidebarProjectManager {
  return {
    projects: new Map(projects.map((p) => [p.id, { ...p, context: null }])),
  } as unknown as SidebarProjectManager;
}

function task(id: string, createdAt: string) {
  return {
    state: 'provisioned',
    data: {
      id,
      type: 'coding-agent',
      isPinned: false,
      createdAt,
      updatedAt: createdAt,
    },
  };
}

function projectManagerWithTasks(
  projects: { id: string; createdAt: string; taskIds: string[] }[]
): SidebarProjectManager {
  return {
    projects: new Map(
      projects.map((project) => {
        const taskManager = {
          tasks: new Map(
            project.taskIds.map((taskId, index) => [
              taskId,
              task(taskId, `2026-01-01T00:00:0${index}.000Z`),
            ])
          ),
        };
        return [
          project.id,
          {
            id: project.id,
            createdAt: project.createdAt,
            context: {
              kind: 'available',
              context: {
                get: (token: unknown) =>
                  token === taskManagerStoreToken ? taskManager : undefined,
              },
            },
          },
        ];
      })
    ),
  } as unknown as SidebarProjectManager;
}

function mementoHandle(initial: WorkbenchSidebarState): MementoHandle<WorkbenchSidebarState> {
  let value = initial;
  return {
    get value() {
      return value;
    },
    ready: Promise.resolve(),
    isPending: false,
    hasStoredValue: true,
    read: () => value,
    update: (next) => {
      value = typeof next === 'function' ? next(value) : next;
    },
    reset: async () => {},
    flush: async () => {},
    autoPersist: () =>
      (() => {}) as ReturnType<MementoHandle<WorkbenchSidebarState>['autoPersist']>,
    dispose: async () => {},
  };
}

describe('SidebarStore project ordering', () => {
  it('keeps a restored collapsed project collapsed during initial task hydration', () => {
    const tasks = observable.map<string, ReturnType<typeof task>>();
    const project = observable({
      id: 'project-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      context: null as null | {
        kind: 'available';
        context: { get: () => { tasks: typeof tasks } };
      },
    });
    const manager = {
      projects: observable.map([['project-1', project]]),
    } as unknown as SidebarProjectManager;
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: [],
      projectOrder: [],
      taskOrderByProject: {},
      taskSortBy: 'created-at',
    });
    const store = new SidebarStore(manager);
    store.attachMemento(handle);

    runInAction(() => {
      project.context = {
        kind: 'available',
        context: { get: () => ({ tasks }) },
      };
    });
    runInAction(() => {
      tasks.set('task-1', task('task-1', '2026-01-01T00:00:00.000Z'));
    });

    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('reads and writes through an attached memento', () => {
    const store = new SidebarStore(projectManager([]));
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: ['project-1'],
      projectOrder: ['project-1'],
      taskOrderByProject: {},
      taskSortBy: 'updated-at',
    });

    store.attachMemento(handle);
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(store.taskSortBy).toBe('updated-at');

    store.setTaskSortBy('created-at');
    expect(handle.value.taskSortBy).toBe('created-at');
  });

  it('reveals a project without changing its persisted expansion preference', () => {
    const store = new SidebarStore(projectManager([{ id: 'project-1', createdAt: '2026-01-01' }]));
    const handle = mementoHandle({
      version: '1',
      expandedProjectIds: [],
      projectOrder: [],
      taskOrderByProject: {},
      taskSortBy: 'created-at',
    });
    store.attachMemento(handle);

    store.revealProject('project-1');
    expect([...store.expandedProjectIds]).toEqual(['project-1']);
    expect(handle.value.expandedProjectIds).toEqual([]);

    store.toggleProjectExpanded('project-1');
    expect([...store.expandedProjectIds]).toEqual([]);
    expect(handle.value.expandedProjectIds).toEqual([]);
  });

  it('sorts projects newest first by default', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-02T00:00:00.000Z' },
      ])
    );

    expect(store.orderedProjects.map((project) => project.id)).toEqual(['new', 'old']);
  });

  it('places projects missing from a saved manual order first', () => {
    const store = new SidebarStore(
      projectManager([
        { id: 'old', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'manual', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'new', createdAt: '2026-01-03T00:00:00.000Z' },
      ])
    );

    store.setProjectOrder(['manual', 'old']);

    expect(store.orderedProjects.map((project) => project.id)).toEqual(['new', 'manual', 'old']);
  });

  it('returns visible task entries in rendered project-tree order', () => {
    const store = new SidebarStore(
      projectManagerWithTasks([
        {
          id: 'project-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          taskIds: ['task-1a', 'task-1b'],
        },
        {
          id: 'project-2',
          createdAt: '2026-01-02T00:00:00.000Z',
          taskIds: ['task-2a'],
        },
      ])
    );

    store.setProjectOrder(['project-1', 'project-2']);
    store.toggleProjectExpanded('project-1');
    store.toggleProjectExpanded('project-2');
    store.setTaskOrder('project-1', ['task-1a', 'task-1b']);

    expect(store.visibleTaskEntries).toEqual([
      { projectId: 'project-1', taskId: 'task-1a' },
      { projectId: 'project-1', taskId: 'task-1b' },
      { projectId: 'project-2', taskId: 'task-2a' },
    ]);
  });

  it('excludes pinned automation runs from every sidebar selector', () => {
    const manager = projectManagerWithTasks([
      {
        id: 'project-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        taskIds: ['regular-task', 'automation-task'],
      },
    ]);
    const project = manager.projects.get('project-1')!;
    const context = project.context?.kind === 'available' ? project.context.context : undefined;
    const tasks = context!.get(taskManagerStoreToken).tasks;
    tasks.get('regular-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.isPinned = true;
    tasks.get('automation-task')!.data.type = 'automation-run';

    const store = new SidebarStore(manager);
    store.toggleProjectExpanded('project-1');

    expect(store.pinnedSidebarEntries).toEqual([
      { projectId: 'project-1', taskId: 'regular-task' },
    ]);
    expect(store.visibleTaskIdsForProject('project-1')).toEqual([]);
    expect(store.sidebarRows).toEqual([{ kind: 'project', projectId: 'project-1' }]);
  });
});

describe('SidebarStore status grouping', () => {
  function storeWithStatuses(groupTasksByStatus: boolean | undefined) {
    const tasks = new Map(
      (
        [
          ['progress-old', 'in_progress', '2026-01-01T00:00:01.000Z'],
          ['review-old', 'review', '2026-01-01T00:00:02.000Z'],
          ['done', 'done', '2026-01-01T00:00:03.000Z'],
          ['progress-new', 'in_progress', '2026-01-01T00:00:04.000Z'],
          ['review-new', 'review', '2026-01-01T00:00:05.000Z'],
        ] as const
      ).map(([id, status, createdAt]) => [
        id,
        { ...task(id, createdAt), data: { ...task(id, createdAt).data, status } },
      ])
    );
    const manager = {
      projects: new Map([
        [
          'project-1',
          {
            id: 'project-1',
            createdAt: '2026-01-01T00:00:00.000Z',
            context: {
              kind: 'available',
              context: {
                get: (token: unknown) => (token === taskManagerStoreToken ? { tasks } : undefined),
              },
            },
          },
        ],
      ]),
    } as unknown as SidebarProjectManager;
    const store = new SidebarStore(manager);
    store.attachMemento(
      mementoHandle({
        version: '1',
        expandedProjectIds: ['project-1'],
        projectOrder: [],
        taskOrderByProject: {},
        taskSortBy: 'created-at',
        ...(groupTasksByStatus !== undefined && { groupTasksByStatus }),
      })
    );
    return store;
  }

  const label = (row: SidebarRow) => {
    if (row.kind === 'task') return row.taskId;
    if (row.kind === 'status') return `[${row.status} ${row.count}]`;
    if (row.kind === 'projects-label') return '[projects]';
    return row.projectId;
  };

  it('keeps the project tree when grouping is off or was never stored', () => {
    for (const stored of [undefined, false]) {
      expect(storeWithStatuses(stored).sidebarRows.map(label)).toEqual([
        'project-1',
        'review-new',
        'progress-new',
        'done',
        'review-old',
        'progress-old',
      ]);
    }
  });

  it('lists status groups first, sort order kept inside, then the projects', () => {
    const store = storeWithStatuses(true);

    expect(store.sidebarRows.map(label)).toEqual([
      '[done 1]',
      'done',
      '[review 2]',
      'review-new',
      'review-old',
      '[in_progress 2]',
      'progress-new',
      'progress-old',
      '[projects]',
      'project-1',
    ]);
    expect(store.visibleTaskIdsForProject('project-1')).toEqual([
      'done',
      'review-new',
      'review-old',
      'progress-new',
      'progress-old',
    ]);
  });

  it('hides the tasks of a collapsed status group but keeps its header and count', () => {
    const store = storeWithStatuses(true);

    store.toggleStatusGroupCollapsed('review');

    expect(store.sidebarRows.map(label).slice(0, 4)).toEqual([
      '[done 1]',
      'done',
      '[review 2]',
      '[in_progress 2]',
    ]);

    store.toggleStatusGroupCollapsed('review');

    expect(store.sidebarRows.map(label)).toContain('review-new');
  });

  it('toggles grouping through the memento', () => {
    const store = storeWithStatuses(false);

    store.setGroupTasksByStatus(true);

    expect(store.groupTasksByStatus).toBe(true);
    expect(store.sidebarRows.filter((row) => row.kind === 'status')).toHaveLength(3);
  });
});
