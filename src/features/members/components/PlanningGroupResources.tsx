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
  const [notesPersonId, setNotesPersonId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState('');

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

  async function openNotes(personId: string) {
    if (notesBusy || !workspaceId) return;

    if (notesPersonId === personId) {
      setNotesPersonId(null);
      setNotesError('');
      return;
    }

    setNotesBusy(true);
    setNotesError('');

    try {
      const { data, error: loadError } = await supabase
        .from('assignees')
        .select('notes')
        .eq('id', personId)
        .eq('workspace_id', workspaceId)
        .is('user_id', null)
        .single();

      if (loadError) throw loadError;

      setNotesDraft(data?.notes ?? '');
      setNotesPersonId(personId);
    } catch (err) {
      setNotesError(
        err instanceof Error ? err.message : 'Unable to load notes'
      );
    } finally {
      setNotesBusy(false);
    }
  }

  async function saveNotes() {
    if (!isAdmin || !notesPersonId || !workspaceId || notesBusy) return;

    setNotesBusy(true);
    setNotesError('');

    try {
      const { data, error: saveError } = await supabase
        .from('assignees')
        .update({ notes: notesDraft })
        .eq('id', notesPersonId)
        .eq('workspace_id', workspaceId)
        .is('user_id', null)
        .select('id');

      if (saveError) throw saveError;
      if (!data?.length) {
        throw new Error('Notes could not be saved. Check permissions.');
      }

      setNotesPersonId(null);
      setNotesDraft('');
    } catch (err) {
      setNotesError(
        err instanceof Error ? err.message : 'Unable to save notes'
      );
    } finally {
      setNotesBusy(false);
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

      {notesError && (
        <p role="alert" className="text-sm text-destructive">
          {notesError}
        </p>
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
              className="rounded-lg border px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                title="Double-click to view or edit notes"
                disabled={notesBusy}
                onDoubleClick={() => void openNotes(person.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    void openNotes(person.id);
                  }
                }}
              >
                <div className="truncate text-sm font-semibold">
                  {person.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {person.phone || person.email || 'Planning-only resource'}
                  {!person.isActive ? ' · Disabled' : ''}
                </div>
              </button>

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

              {notesPersonId === person.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <label
                    htmlFor={`notes-${person.id}`}
                    className="text-sm font-semibold"
                  >
                    Notes for {person.name}
                  </label>
                  <textarea
                    id={`notes-${person.id}`}
                    className="w-full rounded-md border bg-background p-3 text-sm"
                    rows={5}
                    placeholder="Skills, qualifications, availability, project experience..."
                    value={notesDraft}
                    disabled={!isAdmin || notesBusy}
                    onChange={event => setNotesDraft(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={notesBusy}
                      onClick={() => {
                        setNotesPersonId(null);
                        setNotesError('');
                      }}
                    >
                      Cancel
                    </Button>
                    {isAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={notesBusy}
                        onClick={() => void saveNotes()}
                      >
                        {notesBusy ? 'Saving...' : 'Save notes'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
