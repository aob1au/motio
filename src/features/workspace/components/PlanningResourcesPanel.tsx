import React, { useEffect, useState } from 'react';
import { supabase } from '@/shared/lib/supabaseClient';
import { useAuthStore } from '@/features/auth/store/authStore';
import { usePlannerStore } from '@/features/planner/store/plannerStore';

export const PlanningResourcesPanel: React.FC = () => {
  const role = useAuthStore(s => s.currentWorkspaceRole);
  const workspaceId = useAuthStore(s => s.currentWorkspaceId);
  const assignees = usePlannerStore(s => s.assignees);
  const addAssignee = usePlannerStore(s => s.addAssignee);
  const updateAssignee = usePlannerStore(s => s.updateAssignee);
  const refreshAssignees = usePlannerStore(s => s.refreshAssignees);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState<Array<{id:string;name:string}>>([]);

  useEffect(() => {
    let alive = true;
    setGroups([]);
    if (!workspaceId) return;
    void supabase.from('member_groups')
      .select('id,name')
      .eq('workspace_id', workspaceId)
      .order('name')
      .then(({data,error}) => {
        if (!alive) return;
        if (error) { setMessage(error.message); return; }
        setGroups((data ?? []).map(g => ({id:g.id,name:g.name})));
      });
    return () => { alive = false; };
  }, [workspaceId]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const canEdit = role === 'admin' || role === 'editor';
  const people = assignees
    .filter(p => !p.userId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const reset = () => {
    setEditingId(null);
    setGroupId('');
    setName('');
    setEmail('');
    setPhone('');
  };

  const edit = (person: typeof people[number]) => {
    setEditingId(person.id);
    setGroupId(person.groupId ?? '');
    setName(person.name);
    setEmail(person.email ?? '');
    setPhone(person.phone ?? '');
    setMessage('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !canEdit || busy) return;
    setBusy(true);
    setMessage('');

    try {
      if (editingId) {
        const result = await updateAssignee(editingId, {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
        });
        if (result.error) throw new Error(result.error);
        const {error: groupError} = await supabase.from('assignees')
          .update({group_id: groupId || null})
          .eq('id', editingId).eq('workspace_id', workspaceId!);
        if (groupError) throw groupError;
      } else {
        const before = new Set(assignees.map(p => p.id));
        await addAssignee({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          userId: null,
          isActive: true,
        });
        await refreshAssignees();
        const after = usePlannerStore.getState().assignees;
        const created = after.find(p => !before.has(p.id));
        if (!created) throw new Error('Resource was not created. Check permissions.');
        if (groupId) {
          const {error: groupError} = await supabase.from('assignees')
            .update({group_id:groupId})
            .eq('id',created.id).eq('workspace_id',workspaceId!);
          if (groupError) throw groupError;
        }
      }

      await refreshAssignees();
      reset();
      setMessage('Resource saved successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    if (!canEdit || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await updateAssignee(id, { isActive: !isActive });
      if (result.error) throw new Error(result.error);
      await refreshAssignees();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const resourceForm = (
        <form onSubmit={save} className="flex flex-wrap gap-2">
          <input
            className="rounded border bg-background px-3 py-2"
            placeholder="Full name"
            aria-label="Resource name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <input
            className="rounded border bg-background px-3 py-2"
            placeholder="Email (optional)"
            aria-label="Resource email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <input
            className="rounded border bg-background px-3 py-2"
            placeholder="Phone (optional)"
            aria-label="Resource phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
          <select
            aria-label="Resource group"
            className="rounded border bg-background px-3 py-2"
            value={groupId}
            onChange={e => setGroupId(e.target.value)}
          >
            <option value="">No group</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          >
            {editingId ? 'Save changes' : 'Add person'}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className="rounded border px-3 py-2">
              Cancel
            </button>
          )}
        </form>
  );
  return (
    <section className="rounded-lg border bg-background p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Planning-only resources</h3>
        <p className="text-xs text-muted-foreground">
          Manage people without creating login accounts or invitations.
        </p>
      </div>

      {canEdit && !editingId && resourceForm}

      {message && !editingId && (
        <p role="status" className="text-sm">{message}</p>
      )}

      <div className="space-y-2">
        {people.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No planning-only resources yet.
          </p>
        )}
        {people.map(person => (
          <div key={person.id} className="rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{person.name}</div>
              <div className="text-xs text-muted-foreground">
                {person.isActive ? 'Active' : 'Inactive'}
                {' · ' + (groups.find(g => g.id === person.groupId)?.name ?? 'No group')}
                {person.email ? ` · ${person.email}` : ''}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button type="button" onClick={() => edit(person)}
                  disabled={busy} className="rounded border px-3 py-1">
                  Edit
                </button>
                <button type="button"
                  onClick={() => toggleActive(person.id, person.isActive)}
                  disabled={busy} className="rounded border px-3 py-1">
                  {person.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            )}
            </div>
            {canEdit && editingId === person.id && (
              <div className="mt-3 border-t pt-3">
                <div className="mb-3 text-sm font-semibold">
                  Editing {person.name}
                </div>
                {resourceForm}
                {message && (
                  <p role="status" className="mt-2 text-sm">
                    {message}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
