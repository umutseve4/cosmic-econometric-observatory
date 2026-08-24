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
  const aa = [...a].map((character) => character.codePointAt(0) ?? 0);
  const bb = [...b].map((character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.max(aa.length, bb.length); index += 1) {
    const left = aa[index];
    const right = bb[index];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left !== right) return left - right;
  }
  return 0;
}
