export function selectAxisLabels<T>(labels: T[], maxCount: number): T[] {
  const limit = Math.max(1, Math.floor(maxCount));
  if (labels.length <= limit) return labels;
  if (limit === 1) return labels.slice(-1);
  const last = labels.length - 1;
  const stride = Math.ceil(last / (limit - 1));
  const indices: number[] = [];
  for (let i = 0; i < last; i += stride) indices.push(i);
  if (indices.length > 1 && last - indices[indices.length - 1] < stride) indices.pop();
  return [...indices, last].map((index) => labels[index]);
}

export function getTimeLabelLimit(width: number, fontSize: number, labels: { label: string }[], dense: boolean): number {
  if (width <= 0) return 2;
  const longest = Math.max(1, ...labels.map((label) => label.label.length));
  const labelWidth = longest * fontSize * 0.62 + 16;
  return Math.max(1, Math.min(dense ? 2 : 7, Math.floor(width * 0.92 / labelWidth)));
}
