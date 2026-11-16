import React, { useMemo, useState } from 'react';
import { usePlannerStore } from '@/features/planner/store/plannerStore';
import { useAuthStore } from '@/features/auth/store/authStore';
import { supabase } from '@/shared/lib/supabaseClient';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

type Props = {
  groupId: string;
  isAdmin: boolean;
};

export const PlanningGroupResources: React.FC<Props> = ({
  groupId,
  isAdmin,
}) => {
  const assignees = usePlannerStore(state => state.assignees);
  const refreshAssignees = usePlannerStore(
    state => state.refreshAssignees
  );
  const workspaceId = useAuthStore(
    state => state.currentWorkspaceId
  );

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const planningResources = useMemo(
    () => assignees.filter(person => !person.userId),
    [assignees]
  );

  const assigned = useMemo(
    () => planningResources
      .filter(person => person.groupId === groupId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [planningResources, groupId]
  );

  const available = useMemo(
    () => planningResources
      .filter(person => person.groupId !== groupId)
      .filter(person => person.isActive)
      .filter(person =>
        person.name.toLowerCase().includes(search.toLowerCase()) ||
        (person.email ?? '').toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
    [planningResources, groupId, search]
  );

  async function changeGroup(
    resourceId: string,
    nextGroupId: string | null
  ) {
    if (!isAdmin || !workspaceId || saving) return;

    setSaving(true);
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('assignees')
        .update({ group_id: nextGroupId })
        .eq('id', resourceId)
        .eq('workspace_id', workspaceId)
        .is('user_id', null)
        .select('id');

      if (updateError) throw updateError;
      if (!data?.length) {
        throw new Error(
          'Resource was not updated. Check workspace permissions.'
        );
      }

      await refreshAssignees();
      setAdding(false);
      setSearch('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update resource'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-5 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            Planning resources ({assigned.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            People without login accounts
          </p>
        </div>

        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => setAdding(value => !value)}
          >
            {adding ? 'Cancel' : 'Add resource'}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {adding && isAdmin && (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            placeholder="Search planning resources..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />

          <div className="max-h-56 space-y-1 overflow-auto">
            {available.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No available planning resources.
              </p>
            )}

            {available.map(person => (
              <button
                key={person.id}
                type="button"
                disabled={saving}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
                onClick={() => void changeGroup(person.id, groupId)}
              >
                <span className="font-medium">{person.name}</span>
                <span className="text-xs text-muted-foreground">
                  {person.groupId ? 'Move here' : 'Add'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No planning resources in this group.
        </p>
      ) : (
        <div className="space-y-2">
          {assigned.map(person => (
            <div
              key={person.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {person.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {person.phone || person.email || 'Planning-only resource'}
                  {!person.isActive ? ' · Disabled' : ''}
                </div>
              </div>

              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void changeGroup(person.id, null)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
