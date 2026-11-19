export const NEUTRAL_TIMELINE_COLOR = '#D9DDE2';

type TimelineColorInput = {
  mode: 'people' | 'project';
  projectColor?: string | null;
  assigneeIds: readonly string[];
  assigneeGroupMap: ReadonlyMap<string, string>;
  memberGroups: readonly {
    id: string;
    color?: string | null;
  }[];
};

const validColor = (color?: string | null): string =>
  color && /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : NEUTRAL_TIMELINE_COLOR;

export function resolveTimelineColor({
  mode,
  projectColor,
  assigneeIds,
  assigneeGroupMap,
  memberGroups,
}: TimelineColorInput): string {
  if (mode === 'people') {
    return validColor(projectColor);
  }

  if (!assigneeIds.length) {
    return NEUTRAL_TIMELINE_COLOR;
  }

  const groupIds = new Set(
    assigneeIds.map(id => assigneeGroupMap.get(id))
  );

  if (groupIds.size !== 1 || groupIds.has(undefined)) {
    return NEUTRAL_TIMELINE_COLOR;
  }

  const groupId = assigneeGroupMap.get(assigneeIds[0]);

  return validColor(
    memberGroups.find(group => group.id === groupId)?.color
  );
}
