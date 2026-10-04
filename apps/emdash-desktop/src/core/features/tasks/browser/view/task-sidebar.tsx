import { Resizable, useCollapsiblePanelBinding } from '@emdash/ui/react/primitives';
import { observer } from 'mobx-react-lite';
import { useMemo } from 'react';
import { SidebarConversationsList } from '@core/features/conversations/contributions/browser/sidebar-conversations-list';
import { EditorFileTree } from '@core/features/editor/contributions/browser/editor-file-tree';
import { getTaskPrAssociationStore } from '@core/features/source-control/api/browser/stores/task-source-control-selectors';
import { ChangesPanel } from '@core/features/source-control/contributions/browser/changes-panel';
import { ChecksPanel } from '@core/features/source-control/contributions/browser/checks-panel';
import { gitCheckoutStoreToken } from '@core/features/source-control/contributions/browser/workspace-store-tokens';
import { getTaskStore } from '@core/features/tasks/api/browser/task-state/task-selectors';
import type { SidebarTab } from '@core/features/tasks/api/browser/types';
import { useTaskViewContext } from '@core/features/tasks/contributions/browser/task-view-context';
import { taskPanelLayoutsMemento } from '@core/features/tasks/contributions/mementos';
import { TerminalsPanel } from '@core/features/terminals/contributions/browser/task-terminal/terminal-panel';
import {
  useTaskComposition,
  useWorkspace,
} from '@core/features/workbench/api/browser/task-composition-context';
import { createLayoutStorage } from '@core/primitives/mementos/browser';
import { cn } from '@core/primitives/styling/browser/cn';
import { selectCurrentPr } from '@root/src/core/services/pull-requests/api';

// Drag-to-close threshold for the terminal drawer, in percent of the sidebar's
// height. Below ~10% only the drawer tab bar and a row or two of terminal remain
// visible, so a drag settling there reads as intent to close rather than a resize.
const TERMINAL_DRAWER_CLOSE_THRESHOLD = 10;

const TABS: readonly { id: SidebarTab; label: string }[] = [
  { id: 'files', label: 'All files' },
  { id: 'changes', label: 'Changes' },
  { id: 'checks', label: 'Checks' },
  { id: 'conversations', label: 'Chats' },
];

/**
 * Task sidebar: a tab strip (All files / Changes / Checks / Chats) over the tab
 * body, with the terminal drawer docked underneath. Mounted only while the
 * sidebar is expanded (the panel is conditionally rendered in
 * `ReadyTaskMainPanel`), so there is no collapsed/hidden representation here.
 *
 * The active tab is store-driven conditional rendering, per the sync contract
 * (no display:none visibility in workbench surfaces), so switching tabs
 * remounts the previous body. Remount cost is modest by design: the
 * conversations list and file tree render from MobX stores (tree expansion
 * persists via the tasks.editor-tree memento) and lose only ephemeral
 * selection and scroll position; the changes panel's section sizes persist
 * via the shared layout storage (task panel-layouts memento) and survive the
 * remount. No tab body owns a Monaco instance.
 */
export const TaskSidebar = observer(function TaskSidebar() {
  const taskView = useTaskComposition();
  const activeTab = taskView.sidebarTab;

  // One storage facade per composition; the sidebar renders below the task
  // view's space.isHydrated gate, so synchronous reads are safe by contract.
  const layoutStorage = useMemo(
    () => createLayoutStorage(taskView.space, taskPanelLayoutsMemento),
    [taskView.space]
  );
  const drawerBinding = useCollapsiblePanelBinding({
    storageKey: 'task-sidebar-vertical',
    storage: layoutStorage,
    panelIds: ['task-sidebar-content', 'task-terminal-drawer'],
    collapsiblePanelId: 'task-terminal-drawer',
    open: taskView.isTerminalDrawerOpen,
    onCloseRequest: () => taskView.chrome.commands.closeTerminalDrawer(),
    closeThreshold: TERMINAL_DRAWER_CLOSE_THRESHOLD,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TaskSidebarTabs />
      <div className="min-h-0 flex-1">
        <Resizable.Group
          orientation="vertical"
          id="task-sidebar-vertical"
          {...drawerBinding.groupProps}
        >
          <Resizable.Panel id="task-sidebar-content" minSize="20%">
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {activeTab === 'changes' && <ChangesSummary />}
              <div className="min-h-0 flex-1 overflow-hidden">
                {activeTab === 'conversations' && <SidebarConversationsList />}
                {activeTab === 'changes' && <ChangesPanel />}
                {activeTab === 'files' && <EditorFileTree />}
                {activeTab === 'checks' && <ChecksPanel />}
              </div>
            </div>
          </Resizable.Panel>
          {/* Closed = panel AND handle unmounted (sync contract: never program
              the panels). Terminal content survives the unmount because each
              PTY session's xterm DOM is reparented to the off-screen host, not
              disposed (see usePty). */}
          {taskView.isTerminalDrawerOpen && (
            <>
              <Resizable.Handle />
              <Resizable.Panel
                {...drawerBinding.collapsiblePanelProps}
                defaultSize={drawerBinding.collapsiblePanelProps.defaultSize ?? '40%'}
              >
                <TerminalsPanel />
              </Resizable.Panel>
            </>
          )}
        </Resizable.Group>
      </div>
    </div>
  );
});

const TaskSidebarTabs = observer(function TaskSidebarTabs() {
  const taskView = useTaskComposition();
  const workspace = useWorkspace();
  const { projectId, taskId } = useTaskViewContext();
  const changedFiles = workspace.get(gitCheckoutStoreToken).fileChanges.length;
  const task = getTaskStore(projectId, taskId);
  const pr = task ? selectCurrentPr(getTaskPrAssociationStore(task).pullRequests) : undefined;
  const counts: Partial<Record<SidebarTab, number>> = {
    changes: changedFiles,
    checks: pr?.checks.length ?? 0,
  };

  return (
    <div
      role="tablist"
      aria-label="Task sidebar"
      className="flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2"
    >
      {TABS.map((tab) => {
        const isActive = taskView.sidebarTab === tab.id;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm transition-colors',
              isActive
                ? 'bg-background-tertiary-2 font-medium text-foreground'
                : 'text-foreground-tertiary-muted hover:bg-background-tertiary-1 hover:text-foreground'
            )}
            onClick={() => taskView.chrome.commands.openSidebarTab(tab.id)}
          >
            {tab.label}
            {count > 0 && (
              <span className="text-xs text-foreground-tertiary-passive tabular-nums">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});

const ChangesSummary = observer(function ChangesSummary() {
  const gitCheckout = useWorkspace().get(gitCheckoutStoreToken);
  const files = gitCheckout.fileChanges.length;
  if (files === 0) return null;
  return (
    <div className="flex h-9 shrink-0 items-center justify-between px-3 text-sm">
      <span className="text-foreground-tertiary">
        {files} {files === 1 ? 'file' : 'files'} changed
      </span>
      <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
        <span className="text-foreground-diff-added">+{gitCheckout.totalLinesAdded}</span>
        <span className="text-foreground-diff-deleted">-{gitCheckout.totalLinesDeleted}</span>
      </span>
    </div>
  );
});
