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

type Draft = {
  name: string;
  email: string;
  phone: string;
  groupId: string;
  isActive: boolean;
  color: string;
  notes: string;
};

export const PlanningGroupResources: React.FC<Props> = ({
  groupId,
  isAdmin,
}) => {
  const assignees = usePlannerStore(state => state.assignees);
  const memberGroups = usePlannerStore(state => state.memberGroups);
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

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

  function closeEditor() {
    setEditingId(null);
    setDraft(null);
    setError('');
  }

  async function openEditor(person: typeof planningResources[number]) {
    if (saving) return;
    if (editingId === person.id) {
      closeEditor();
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { data, error: loadError } = await supabase
        .from('assignees')
        .select('notes')
        .eq('id', person.id)
        .eq('workspace_id', workspaceId!)
        .is('user_id', null)
        .single();

      if (loadError) throw loadError;

      setDraft({
        name: person.name,
        email: person.email ?? '',
        phone: person.phone ?? '',
        groupId: person.groupId ?? '',
        isActive: person.isActive,
        color: person.color ?? '',
        notes: data?.notes ?? '',
      });
      setEditingId(person.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to open profile'
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!isAdmin || !workspaceId || !editingId || !draft || saving) {
      return;
    }

    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }

    const color = draft.color.trim();
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
      setError('Colour must be a six-digit hex code, such as #4F86C6.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const original = planningResources.find(
        person => person.id === editingId
      );

      const update = {
        name: draft.name.trim(),
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        group_id: draft.groupId || null,
        is_active: draft.isActive,
        color: color || null,
        notes: draft.notes,
        deactivated_at: draft.isActive
          ? null
          : original?.isActive
            ? new Date().toISOString()
            : undefined,
      };

      const { data, error: updateError } = await supabase
        .from('assignees')
        .update(update)
        .eq('id', editingId)
        .eq('workspace_id', workspaceId)
        .is('user_id', null)
        .select('id');

      if (updateError) throw updateError;
      if (!data?.length) {
        throw new Error('Profile was not updated. Check permissions.');
      }

      await refreshAssignees();
      closeEditor();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save profile'
      );
    } finally {
      setSaving(false);
    }
  }

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
        throw new Error('Resource was not updated.');
      }

      await refreshAssignees();
      setAdding(false);
      setSearch('');
      if (editingId === resourceId) closeEditor();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to change group'
      );
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

  return (
    <section className="mt-5 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">
            Planning resources ({assigned.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Click a person to view or edit their details
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
              className="rounded-lg border px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left"
                  disabled={saving}
                  aria-expanded={editingId === person.id}
                  onClick={() => void openEditor(person)}
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

              {editingId === person.id && draft && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-medium">Name</span>
                      <Input
                        value={draft.name}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, name: event.target.value
                        })}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium">Email</span>
                      <Input
                        type="email"
                        value={draft.email}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, email: event.target.value
                        })}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium">Phone</span>
                      <Input
                        value={draft.phone}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, phone: event.target.value
                        })}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium">Group</span>
                      <select
                        className={fieldClass}
                        value={draft.groupId}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, groupId: event.target.value
                        })}
                      >
                        <option value="">No group</option>
                        {memberGroups.map(group => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-medium">
                        Colour (hex)
                      </span>
                      <Input
                        placeholder="Automatic"
                        value={draft.color}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, color: event.target.value
                        })}
                      />
                    </label>

                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        disabled={!isAdmin || saving}
                        onChange={event => setDraft({
                          ...draft, isActive: event.target.checked
                        })}
                      />
                      <span className="text-sm">Active resource</span>
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="text-xs font-medium">Notes</span>
                    <textarea
                      className={fieldClass}
                      rows={5}
                      placeholder="Skills, qualifications, availability, project experience..."
                      value={draft.notes}
                      disabled={!isAdmin || saving}
                      onChange={event => setDraft({
                        ...draft, notes: event.target.value
                      })}
                    />
                  </label>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={closeEditor}
                    >
                      Close
                    </Button>

                    {isAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={saving || !draft.name.trim()}
                        onClick={() => void saveProfile()}
                      >
                        {saving ? 'Saving...' : 'Save changes'}
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
