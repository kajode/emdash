import type { SidebarTab } from '@core/features/tasks/api/browser/types';
import {
  taskChromeMemento,
  type TaskChromeState,
} from '@core/features/tasks/contributions/mementos';
import { defineChromeStore } from '@core/primitives/chrome-stores/api';
import type { ChromeStore } from '@core/primitives/chrome-stores/browser';

export type TaskFocusedRegion = 'main' | 'bottom';

type TaskChromeEphemeral = { focusedRegion: TaskFocusedRegion };

/**
 * Task chrome command store (spec §Chrome command stores): the `tasks.chrome`
 * memento document mutated only through named commands, one instance per task
 * subject. Invariants live here — selecting a sidebar tab always expands the
 * sidebar, the terminal drawer lives inside the sidebar so opening it expands the
 * sidebar too, and the drawer owns the focused-region coupling — so call sites
 * never coordinate multiple setters.
 *
 * `focusedRegion` is ephemeral (observable, never persisted) and has no write
 * path outside these commands.
 */
export const taskChromeStore = defineChromeStore({
  memento: taskChromeMemento,
  ephemeral: { focusedRegion: 'main' } as TaskChromeEphemeral,
  commands: {
    toggleSidebar: ({ state }) => ({
      state: { ...state, sidebarCollapsed: !state.sidebarCollapsed },
    }),
    collapseSidebar: ({ state }) => ({
      state: { ...state, sidebarCollapsed: true },
    }),
    expandSidebar: ({ state }) => ({
      state: { ...state, sidebarCollapsed: false },
    }),
    // Invariant: selecting a sidebar tab always expands the sidebar.
    openSidebarTab: ({ state }, tab: SidebarTab) => ({
      state: { ...state, sidebarTab: tab, sidebarCollapsed: false },
    }),
    // Collapses when the selected tab is already open; otherwise opens it.
    toggleSidebarTab: ({ state }, tab: SidebarTab) => {
      if (!state.sidebarCollapsed && state.sidebarTab === tab) {
        return { state: { ...state, sidebarCollapsed: true } };
      }
      return { state: { ...state, sidebarTab: tab, sidebarCollapsed: false } };
    },
    openTerminalDrawer: ({ state }) => ({
      state: { ...state, terminalDrawerOpen: true, sidebarCollapsed: false },
      ephemeral: { focusedRegion: 'bottom' as const },
    }),
    closeTerminalDrawer: ({ state }) => ({
      state: { ...state, terminalDrawerOpen: false },
      ephemeral: { focusedRegion: 'main' as const },
    }),
    toggleTerminalDrawer: ({ state }) => {
      // A drawer left open inside a collapsed sidebar is not visible: toggling shows it.
      const open = !state.terminalDrawerOpen || state.sidebarCollapsed;
      return {
        state: {
          ...state,
          terminalDrawerOpen: open,
          sidebarCollapsed: open ? false : state.sidebarCollapsed,
        },
        ephemeral: { focusedRegion: open ? ('bottom' as const) : ('main' as const) },
      };
    },
    focusRegion: (_current, region: TaskFocusedRegion) => ({
      ephemeral: { focusedRegion: region },
    }),
  },
});

export type TaskChromeStore = ChromeStore<
  TaskChromeState,
  TaskChromeEphemeral,
  (typeof taskChromeStore)['commands']
>;
