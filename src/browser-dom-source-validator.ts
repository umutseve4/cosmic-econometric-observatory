type DomKind = 'html' | 'svg';

function fail(kind: DomKind): never {
  throw new Error(`BROWSER_DOM_INVALID_CONTENT:${kind}:attribute`);
}

function whitespace(value: string | undefined): boolean {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r' || value === '\f';
}

function nameCharacter(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9:_-]/u.test(value);
}

/** Reject source-level duplicate attributes before a browser parser can collapse them. */
export function validateSourceAttributes(content: string, kind: DomKind): void {
  let cursor = 0;
  while (cursor < content.length) {
    const opening = content.indexOf('<', cursor);
    if (opening < 0) return;
    cursor = opening + 1;

    if (content.startsWith('!--', cursor)) {
      const end = content.indexOf('-->', cursor + 3);
      if (end < 0) fail(kind);
      cursor = end + 3;
      continue;
    }

    const closingTag = content[cursor] === '/';
    if (closingTag) cursor += 1;
    if (!/[A-Za-z]/u.test(content[cursor] ?? '')) fail(kind);
    while (nameCharacter(content[cursor])) cursor += 1;

    if (closingTag) {
      while (whitespace(content[cursor])) cursor += 1;
      if (content[cursor] !== '>') fail(kind);
      cursor += 1;
      continue;
    }

    const attributes = new Set<string>();
    let terminated = false;
    while (cursor < content.length) {
      while (whitespace(content[cursor])) cursor += 1;
      if (content[cursor] === '>') {
        cursor += 1;
        terminated = true;
        break;
      }
      if (content[cursor] === '/' && content[cursor + 1] === '>') {
        cursor += 2;
        terminated = true;
        break;
      }

      const start = cursor;
      while (nameCharacter(content[cursor])) cursor += 1;
      if (cursor === start) fail(kind);
      const canonical = content.slice(start, cursor).toLowerCase();
      if (attributes.has(canonical)) fail(kind);
      attributes.add(canonical);

      while (whitespace(content[cursor])) cursor += 1;
      if (content[cursor] !== '=') fail(kind);
      cursor += 1;
      while (whitespace(content[cursor])) cursor += 1;
      const quote = content[cursor];
      if (quote !== '"' && quote !== "'") fail(kind);
      cursor += 1;
      const valueEnd = content.indexOf(quote, cursor);
      if (valueEnd < 0) fail(kind);
      cursor = valueEnd + 1;
    }
    if (!terminated) fail(kind);
  }
}
