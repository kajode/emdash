import { AgentStatus } from '@emdash/ui/react/components';
import { GitBranch } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { taskAgentStatus } from '@core/features/conversations/api/browser/conversation-selectors';
import {
  getProjectStore,
  projectData,
} from '@core/features/projects/api/browser/stores/project-selectors';
import { projectViewDef } from '@core/features/projects/contributions/views';
import { useAppSettingsKey } from '@core/features/settings/api/browser/use-app-settings-key';
import {
  getTaskGitCheckoutStore,
  getTaskPrAssociationStore,
} from '@core/features/source-control/api/browser/stores/task-source-control-selectors';
import { type TaskStore } from '@core/features/tasks/api/browser/stores/task-store';
import {
  getTaskManagerStore,
  getTaskStore,
} from '@core/features/tasks/api/browser/task-state/task-selectors';
import { TaskContextMenu } from '@core/features/tasks/contributions/browser/task-context-menu';
import { TaskGitDiffStats } from '@core/features/tasks/contributions/browser/task-git-diff-stats';
import { taskViewDef } from '@core/features/tasks/contributions/views';
import { getTaskWorkspace } from '@core/features/workbench/api/browser/task-composition-selectors';
import { TaskSidebarTrailingSlot } from '@core/features/workbench/browser/sidebar/task-sidebar-agent-status';
import { getSidebarStore } from '@core/features/workbench/contributions/browser/app-stores';
import { useOpenModal } from '@core/manifests/browser/modal-api';
import {
  useNavigate,
  useViewParams,
  useWorkspaceSlots,
} from '@core/primitives/navigation/browser/navigation-hooks';
import { cn } from '@core/primitives/styling/browser/cn';
import { selectCurrentPr } from '@root/src/core/services/pull-requests/api';
import { PrBadge } from '@root/src/core/services/pull-requests/browser/components/pr-badge';
import { SidebarMenuAction, SidebarMenuRow } from './sidebar-primitives';

interface SidebarTaskItemProps {
  taskId: string;
  projectId: string;
  /** Pinned strip uses tighter padding than tasks nested under a project. */
  rowVariant?: 'underProject' | 'pinned';
}

export const SidebarTaskItem = observer(function SidebarTaskItem({
  taskId,
  projectId,
  rowVariant = 'underProject',
}: SidebarTaskItemProps) {
  const { navigate } = useNavigate();
  const openRename = useOpenModal('renameTaskModal');
  const openDeleteTask = useOpenModal('deleteTaskModal');

  const { currentView } = useWorkspaceSlots();
  const params = useViewParams(taskViewDef);
  const { value: interfaceSettings } = useAppSettingsKey('interface');
  const isActive =
    currentView === 'task' && params?.taskId === taskId && params.projectId === projectId;

  const task = getTaskStore(projectId, taskId)!;
  const taskManager = getTaskManagerStore(projectId);

  const taskName = task.data.name;

  const openTask = () => {
    navigate(taskViewDef({ projectId, taskId }));
  };

  const handleArchive = () => {
    if (isActive) navigate(projectViewDef({ projectId }));
    void taskManager?.archiveTask(taskId);
  };

  const handleRename = () => {
    void openRename({ projectId, taskId, currentName: taskName });
  };

  const handleDelete = () => {
    void openDeleteTask({
      projectId,
      tasks: [{ taskId, taskName }],
    }).then((outcome) => {
      if (!outcome.success) return;
      const { deleteWorktree, deleteBranch, deleteConversations } = outcome.data;
      void taskManager?.deleteTasks([taskId], {
        deleteWorktree,
        deleteBranch,
        deleteConversations,
      });
      if (isActive) navigate(projectViewDef({ projectId }));
    });
  };

  const canPin = task.state !== 'unregistered';

  const workspaceStore = getTaskWorkspace(projectId, taskId);
  const git = getTaskGitCheckoutStore(projectId, taskId);
  const showLineChanges = interfaceSettings?.showLeftSidebarLineChanges ?? true;
  const showPrStatus = interfaceSettings?.showLeftSidebarPrStatus ?? true;
  const showTimestamps = interfaceSettings?.showLeftSidebarTimestamps ?? true;
  const branchName = git?.branchName ?? undefined;
  // Status-grouped rows sit directly under a status header, with no project row above
  // them: the row itself carries what the agent is doing and which project it is in.
  const isGrouped = rowVariant === 'underProject' && getSidebarStore().groupTasksByStatus;
  const handleReconnect =
    workspaceStore?.connectionState != null ? () => workspaceStore.reconnect() : undefined;

  return (
    <TaskContextMenu
      isPinned={task.data.isPinned}
      canPin={canPin}
      isArchived={false}
      branchName={branchName}
      onPin={() => void task.setPinned(true)}
      onUnpin={() => void task.setPinned(false)}
      onRename={handleRename}
      onArchive={handleArchive}
      onReconnect={handleReconnect}
      onConvertAutomation={undefined}
      status={task.data.status}
      onSetStatus={canPin ? (status) => void task.updateStatus(status) : undefined}
      onDelete={handleDelete}
    >
      <SidebarMenuRow
        className={cn(
          'group/row flex items-center justify-between px-1 py-1.5 h-8 gap-1',
          rowVariant === 'pinned' || isGrouped ? 'pl-2' : 'pl-8'
        )}
        isActive={isActive}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openTask}
      >
        <SidebarMenuAction
          aria-label={`Open task ${taskName || 'task'}`}
          className={cn('overflow-hidden', isGrouped ? 'gap-2' : 'gap-1')}
        >
          {isGrouped && getSidebarStore().hasMultipleProjects && (
            <ProjectInitial projectId={projectId} />
          )}
          {isGrouped && <LeadingActivity task={task} />}
          <span
            className={cn(
              'min-w-0 truncate text-left transition-colors',
              task.isBootstrapping && 'text-foreground/40'
            )}
          >
            {taskName}
          </span>
        </SidebarMenuAction>
        <div className="ml-2 flex shrink-0 items-center justify-end gap-1.5">
          {showLineChanges && <TaskGitDiffStats task={task} />}
          {showPrStatus && !isGrouped && <RenderPrBadge task={task} />}
          <TaskSidebarTrailingSlot
            task={task}
            showTimestamp={showTimestamps}
            showAgentStatus={!isGrouped}
          />
        </div>
      </SidebarMenuRow>
    </TaskContextMenu>
  );
});

/** What the task is doing right now: a live agent status, else its PR, else just a branch. */
const LeadingActivity = observer(function LeadingActivity({ task }: { task: TaskStore }) {
  const status = taskAgentStatus(task);
  const pr = selectCurrentPr(getTaskPrAssociationStore(task).pullRequests);
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {status !== null ? (
        <AgentStatus status={status} tooltip />
      ) : pr ? (
        <span onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <PrBadge variant="compact" pr={pr} hoverDelay={100} />
        </span>
      ) : (
        <GitBranch className="size-3.5 text-foreground-tertiary-passive" />
      )}
    </span>
  );
});

const ProjectInitial = observer(function ProjectInitial({ projectId }: { projectId: string }) {
  const store = getProjectStore(projectId);
  const name = (store ? projectData(store)?.name : undefined) ?? '';
  return (
    <span
      title={name}
      className="flex size-4 shrink-0 items-center justify-center rounded bg-background-tertiary-3 text-[10px] font-medium text-foreground-tertiary uppercase"
    >
      {name.charAt(0)}
    </span>
  );
});

const RenderPrBadge = observer(function RenderPrBadge({ task }: { task: TaskStore }) {
  const pr = selectCurrentPr(getTaskPrAssociationStore(task).pullRequests);
  return pr ? (
    <span onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <PrBadge variant="compact" pr={pr} hoverDelay={100} />
    </span>
  ) : null;
});
