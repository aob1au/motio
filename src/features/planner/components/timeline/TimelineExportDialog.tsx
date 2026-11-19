import React, { useState } from 'react';
import { addDays, format, parseISO, differenceInCalendarDays } from 'date-fns';
import { FileDown } from 'lucide-react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { useFilteredAssignees } from '@/features/planner/hooks/useFilteredAssignees';
import {
  buildAssigneeGroupMap,
  selectFilteredTasks,
  selectVisibleAssignees,
  selectTimelineGroupItems,
  groupTasksByTimelineRow,
  selectArchivedProjectIds,
  resolveCurrentUserAssigneeId,
} from '@/features/planner/lib/timelineSelectors';
import { formatProjectLabel } from '@/shared/lib/projectLabels';
import type { GroupMode } from '@/features/planner/types/planner';

export function TimelineExportDialog() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paper, setPaper] = useState<'a3' | 'a4'>('a3');
  const [title, setTitle] = useState('Resource & Project Allocation');
  const [start, setStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(addDays(new Date(), 27), 'yyyy-MM-dd'));

  const assignees = usePlannerStore(state => state.assignees);
  const filteredAssignees = useFilteredAssignees(assignees);

  const liveFilters = usePlannerStore(state => state.filters);
  const liveProjects = usePlannerStore(state => state.projects);
  const liveGroups = usePlannerStore(state => state.memberGroups);
  const liveStatuses = usePlannerStore(state => state.statuses);

  const describeFilter = (
    ids: string[],
    items: Array<{ id: string; name: string }>
  ) => ids.length
    ? ids.map(id => items.find(item => item.id === id)?.name ?? id).join(', ')
    : 'All';

  async function generate() {
    setError('');
    setBusy(true);

    try {
      const state = usePlannerStore.getState();
      const auth = useAuthStore.getState();
      const days = differenceInCalendarDays(parseISO(end), parseISO(start)) + 1;

      if (!Number.isFinite(days) || days < 1 || days > 62) {
        throw new Error('Please select a valid reporting period of 1 to 62 days.');
      }

      if (
        state.loading ||
        !state.loadedRange ||
        state.loadedRange.workspaceId !== auth.currentWorkspaceId ||
        start < state.loadedRange.start ||
        end > state.loadedRange.end
      ) {
        throw new Error(
          'The requested period is outside the loaded timeline window. ' +
          'Navigate to that period in Motio before exporting.',
        );
      }

      const groupMap = buildAssigneeGroupMap(
        state.assignees,
        state.memberGroupAssignments,
      );

      const teamNames = new Map(
        state.memberGroups.map(group => [group.id, group.name]),
      );

      const inRange = state.tasks.filter(task =>
        task.startDate <= end && task.endDate >= start,
      );

      const activeAssignees = filteredAssignees.filter(person => person.isActive);

      const filters = state.filters;



      const hasProjectFilter = filters.projectIds.length > 0;

      const hasResourceFilter =
        filters.assigneeIds.length > 0 ||
        filters.groupIds.length > 0;

      const hasTaskFilter =
        filters.statusIds.length > 0 ||
        filters.typeIds.length > 0 ||
        filters.tagIds.length > 0;

      const restrictTeamRows =
        hasProjectFilter || hasTaskFilter;

      const restrictProjectRows =
        hasResourceFilter || hasTaskFilter;

      const eligibleAssignees = selectVisibleAssignees({
        groupMode: 'assignee',
        filteredAssignees: activeAssignees,
        filters,
        assigneeGroupMap: groupMap,
      }).filter(person => {
        const team = teamNames.get(groupMap.get(person.id) ?? '');
        return Boolean(team && team.trim().toLowerCase() !== 'unassigned');
      });

      const eligibleAssigneeIds = new Set(
        eligibleAssignees.map(person => person.id)
      );

      const eligibleProjects = state.projects.filter(project =>
        !project.archived &&
        (!hasProjectFilter ||
          filters.projectIds.includes(project.id))
      );

      const eligibleProjectIds = new Set(
        eligibleProjects.map(project => project.id)
      );

      function buildRows(groupMode: GroupMode) {
        const filteredTasks = selectFilteredTasks(
          inRange,
          state.filters,
          groupMap,
          state.assignees,
          {
            hiddenProjectIds: groupMode === 'project'
              ? selectArchivedProjectIds(state.projects)
              : undefined,
          },
        );

        const matchingTasks = filteredTasks
          .filter(task =>
            !hasProjectFilter ||
            Boolean(task.projectId &&
              filters.projectIds.includes(task.projectId))
          )
          .filter(task =>
            groupMode !== 'project' ||
            !task.projectId ||
            eligibleProjectIds.has(task.projectId)
          )
          .filter(task =>
            !hasResourceFilter ||
            task.assigneeIds.some(id => eligibleAssigneeIds.has(id))
          )
          .map(task =>
            hasResourceFilter
              ? {
                  ...task,
                  assigneeIds: task.assigneeIds.filter(
                    id => eligibleAssigneeIds.has(id)
                  ),
                }
              : task
          );

        const matchingAssigneeIds = new Set(
          matchingTasks.flatMap(task => task.assigneeIds)
        );

        const matchingProjectIds = new Set(
          matchingTasks.map(task => task.projectId)
        );

        const visibleAssignees = eligibleAssignees.filter(person =>
          !restrictTeamRows || matchingAssigneeIds.has(person.id)
        );

        const visibleProjects = eligibleProjects.filter(project =>
          !restrictProjectRows || matchingProjectIds.has(project.id)
        );

        const groupItems = selectTimelineGroupItems({
          groupMode,
          visibleAssignees,
          projects: visibleProjects,
          myAssigneeId: resolveCurrentUserAssigneeId(
            state.assignees,
            auth.user?.id,
          ),
        });

        return groupTasksByTimelineRow({
          filteredTasks: matchingTasks,
          groupItems,
          groupMode,
          layoutRange: { startDate: start, endDate: end },
        });
      }

      const peopleTasks = buildRows('assignee');
      const projectTasks = buildRows('project');

      const teamRows = Object.entries(peopleTasks).map(([id, tasks]) => ({
        name: state.assignees.find(person => person.id === id)?.name ?? 'Unassigned',
        assigneeId: id,
        team: teamNames.get(groupMap.get(id) ?? '') ?? 'Unassigned',
        tasks,
        timeOff: (state.timeOff ?? []).filter(record =>
          record.assigneeId === id &&
          record.startDate <= end &&
          record.endDate >= start,
        ),
      }));

      // Include visible active people even without allocations.
      const exportAssignees = selectVisibleAssignees({
        groupMode: 'assignee',
        filteredAssignees: activeAssignees,
        filters: state.filters,
        assigneeGroupMap: groupMap,
      });

      for (const person of exportAssignees) {
        if (!eligibleAssigneeIds.has(person.id)) continue;
        if (restrictTeamRows) continue;
        if (teamRows.some(row => row.assigneeId === person.id)) continue;

        const timeOff = (state.timeOff ?? []).filter(record =>
          record.assigneeId === person.id &&
          record.startDate <= end &&
          record.endDate >= start,
        );

        {
          teamRows.push({
            name: person.name,
            assigneeId: person.id,
            team: teamNames.get(groupMap.get(person.id) ?? '') ?? 'Unassigned',
            tasks: [],
            timeOff,
          });
        }
      }

      teamRows.sort((a, b) => {
        if (a.team === 'Unassigned' && b.team !== 'Unassigned') return 1;
        if (b.team === 'Unassigned' && a.team !== 'Unassigned') return -1;
        return a.team.localeCompare(b.team) || a.name.localeCompare(b.name);
      });

      const projectRows = Object.entries(projectTasks)
        .filter(([id, tasks]) => {
          if (id === 'unassigned') {
            return !hasProjectFilter && tasks.length > 0;
          }

          if (!eligibleProjectIds.has(id)) return false;
          if (restrictProjectRows && tasks.length === 0) return false;

          return true;
        })
        .map(([id, tasks]) => {
          const project = state.projects.find(p => p.id === id);
          return {
            name: project
              ? formatProjectLabel(project.name, project.code)
              : 'No project',
            tasks,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      // Include projects without scheduled allocations.
      for (const project of eligibleProjects) {
        if (restrictProjectRows) continue;
        if (project.archived) continue;

        if (
          state.filters.projectIds.length &&
          !state.filters.projectIds.includes(project.id)
        ) continue;

        if (Object.prototype.hasOwnProperty.call(
          projectTasks, project.id
        )) continue;

        projectRows.push({
          name: formatProjectLabel(project.name, project.code),
          tasks: [],
        });
      }

      projectRows.sort((a, b) => a.name.localeCompare(b.name));

      // Avoid displaying empty synthetic unassigned rows.
      for (let i = teamRows.length - 1; i >= 0; i--) {
        const row = teamRows[i];
        if (
          row.assigneeId === 'unassigned' &&
          !row.tasks.length &&
          !row.timeOff.length
        ) {
          teamRows.splice(i, 1);
        }
      }

      for (let i = projectRows.length - 1; i >= 0; i--) {
        if (
          projectRows[i].name === 'No project' &&
          !projectRows[i].tasks.length
        ) {
          projectRows.splice(i, 1);
        }
      }

      const milestones = state.milestones.filter(milestone =>
        milestone.date >= start &&
        milestone.date <= end &&
        (!state.filters.projectIds.length ||
          state.filters.projectIds.includes(milestone.projectId)),
      );


      exportTimelinePdf({
        startDate: start,
        endDate: end,
        paper,
        title: [
          auth.workspaces.find(
            workspace => workspace.id === auth.currentWorkspaceId
          )?.name,
          title.trim() || 'Resource & Project Allocation',
        ].filter(Boolean).join(' - '),
        teamRows: teamRows.filter(row =>
          row.assigneeId !== 'unassigned' &&
          eligibleAssigneeIds.has(row.assigneeId) &&
          row.team?.trim().toLowerCase() !== 'unassigned' &&
          (!restrictTeamRows || row.tasks.length > 0)
        ),
        projectRows,
        projects: state.projects,
        assignees: state.assignees,
        statuses: state.statuses,
        milestones,
      });

      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(''); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <FileDown className="h-4 w-4" />
        Export PDF
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Export timeline PDF"
        >
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold">Export timeline to PDF</h2>

            <label className="block text-sm">
              Report title
              <input
                className="mt-1 w-full rounded-md border bg-background p-2"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Start date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                />
              </label>

              <label className="block text-sm">
                End date
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                />
              </label>
            </div>

            <label className="block text-sm">
              Paper size
              <select
                className="mt-1 w-full rounded-md border bg-background p-2"
                value={paper}
                onChange={e => setPaper(e.target.value as 'a3' | 'a4')}
              >
                <option value="a3">A3 landscape (recommended)</option>
                <option value="a4">A4 landscape</option>
              </select>
            </label>

            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="font-semibold">Report contents</div>
              <div>1. Team allocation</div>
              <div>2. Project overview</div>
              <div className="text-muted-foreground text-xs">
                Current filters applied. Automatic pagination.
                Empty rows included where relevant to active filters.
              </div>
            </div>

            <div className="rounded-md border p-3 text-xs space-y-2">
              <div className="text-sm font-semibold">Active filters</div>
              <div>Projects: {describeFilter(liveFilters.projectIds, liveProjects)}</div>
              <div>People: {describeFilter(liveFilters.assigneeIds, assignees)}</div>
              <div>Team groups: {describeFilter(liveFilters.groupIds, liveGroups)}</div>
              <div>Statuses: {describeFilter(liveFilters.statusIds, liveStatuses)}</div>
              <div>Task types selected: {liveFilters.typeIds.length || 'All'}</div>
              <div>Tags selected: {liveFilters.tagIds.length || 'All'}</div>
              <div>Hide unassigned: {liveFilters.hideUnassigned ? 'Yes' : 'No'}</div>
            </div>

            {error && (
              <div className="text-sm text-red-600">{error}</div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={generate}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                {busy ? 'Generating...' : 'Download PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
