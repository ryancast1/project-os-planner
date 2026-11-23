const DIVIDER_MARKER = "\n\n<!-- project-os:task-divider:v1 -->";

export function hasTaskDivider(notes: string | null) {
  return notes?.endsWith(DIVIDER_MARKER) ?? false;
}

export function taskNoteText(notes: string | null) {
  if (notes?.endsWith(DIVIDER_MARKER)) return notes.slice(0, -DIVIDER_MARKER.length) || null;
  return notes;
}

export function setTaskDivider(notes: string | null, active: boolean) {
  const text = taskNoteText(notes);
  return active ? `${text ?? ""}${DIVIDER_MARKER}` : text;
}
