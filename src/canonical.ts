export function canonicalize(value: unknown): string {
  return JSON.stringify(sort(value));
}

function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => compareCodePoints(a, b)).map(([key, child]) => [key, sort(child)]));
  }
  return value;
}

export function compareCodePoints(a: string, b: string): number {
  const aa = [...a].map((c) => c.codePointAt(0) ?? 0);
  const bb = [...b].map((c) => c.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.max(aa.length, bb.length); index += 1) {
    if (aa[index] === undefined) return -1;
    if (bb[index] === undefined) return 1;
    if (aa[index] !== bb[index]) return aa[index] - bb[index];
  }
  return 0;
}
