/** Display helpers only. Server attempt transitions and grading remain authoritative. */
export function remainingSeconds(deadline: string | null, now = Date.now()): number | null {
  if (!deadline) return null;
  const end = Date.parse(deadline);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : null;
}

export function validateSchedule(availableFrom?: string | null, dueAt?: string | null) {
  const start = availableFrom ? Date.parse(availableFrom) : null;
  const due = dueAt ? Date.parse(dueAt) : null;
  if ((start !== null && !Number.isFinite(start)) || (due !== null && !Number.isFinite(due))) throw new Error('Enter valid availability and due dates.');
  if (start !== null && due !== null && due <= start) throw new Error('Due date must be later than availability.');
}

export function scorePercentage(earned: number, total: number): number | null {
  return total > 0 ? Math.round(earned / total * 10000) / 100 : null;
}
