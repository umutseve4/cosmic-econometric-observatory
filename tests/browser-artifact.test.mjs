import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { generateBrowserArtifact } from '../scripts/generate-browser-artifact.mjs';

const root = resolve(process.cwd());

test('browser artifact is deterministic and satisfies the exact curriculum oracle', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cosmic-browser-artifact-'));
  try {
    const firstDirectory = join(temporary, 'first');
    const secondDirectory = join(temporary, 'second');
    mkdirSync(firstDirectory); mkdirSync(secondDirectory);
    const firstPath = join(firstDirectory, 'curriculum-observatory.json');
    const secondPath = join(secondDirectory, 'curriculum-observatory.json');
    const first = generateBrowserArtifact(root, firstPath);
    const second = generateBrowserArtifact(root, secondPath);
    assert.deepEqual(first, second);
    assert.deepEqual(readFileSync(firstPath), readFileSync(secondPath));
    assert.deepEqual(first.oracle, {
      nodes: 147, edges: 146, curriculum_relations: 144, required: 41, elective: 103,
      duplicate_stable_ids: 0, dangling_edges: 0, missing_required_provenance: 0,
      schema_validation_errors: 0, silent_fallbacks: 0
    });
    assert.equal(first.scene.nodes.length, 147);
    assert.equal(first.scene.edges.length, 146);
    assert.equal(first.courses.length, 144);
    assert.equal(new Set(first.courses.map(({ id }) => id)).size, 144);
    assert.equal(first.courses.every(({ provenance }) => /^sha256:[0-9a-f]{64}$/u.test(provenance.contentHash)), true);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

// The published anomaly section renders three things the artifact never states outright: a
// kind, a subject heading and a "show it in the explorer" button. Each of those is derived,
// and each derivation degrades silently when its assumption breaks — an unrecognised id
// prefix falls through to the ECTS branch, an id without a course code is titled
// "Müfredat toplamı", and an entityRef that resolves to no scene node is dropped instead of
// becoming a button. Nothing throws, so the page would still look finished while saying the
// wrong thing or offering no navigation at all. This test pins those three derivations to
// the compiler's real output.
test('published anomalies carry the kind, subject and navigation targets the page derives', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cosmic-anomaly-surface-'));
  try {
    const artifact = generateBrowserArtifact(root, join(temporary, 'curriculum-observatory.json'));
    const ids = artifact.anomalies.map(({ id }) => id);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);

    // Partition, not sampling: every id must be claimed by exactly one rendered kind, so a
    // new anomaly family cannot inherit the ECTS copy by falling through the prefix table.
    const duplicates = ids.filter((id) => id.startsWith('anomaly-duplicate-'));
    const typos = ids.filter((id) => id.startsWith('anomaly-typo-'));
    const remainder = ids.filter((id) => !id.startsWith('anomaly-duplicate-') && !id.startsWith('anomaly-typo-'));
    assert.equal(duplicates.length, 6);
    assert.equal(typos.length, 3);
    assert.deepEqual(remainder, ['anomaly-curriculum-ay33-total-ects']);

    // `offering-` anomalies are timetable reconciliation, a different claim with a different
    // evidence base; the section promises curriculum-source contradictions only.
    assert.equal(ids.some((id) => id.startsWith('offering-')), false);

    // The heading is `id.match(/[a-z]{3}\d{4}/u)` upper-cased. Exactly one anomaly is allowed
    // to have no course code, and the six duplicates must name the three real colliding codes.
    const codeOf = (id) => id.match(/[a-z]{3}\d{4}/u)?.[0] ?? null;
    assert.deepEqual(ids.filter((id) => codeOf(id) === null), ['anomaly-curriculum-ay33-total-ects']);
    assert.deepEqual([...new Set(duplicates.map(codeOf))].sort(), ['eko2004', 'eko4305', 'ikt3306']);
    assert.deepEqual([...new Set(typos.map(codeOf))].sort(), ['eko3310', 'eko4115', 'ikt3306']);

    // Navigation contract: a button is only rendered for a ref that resolves to a scene node,
    // so an anomaly whose refs all miss would publish a record with no way to reach it.
    const nodes = new Set(artifact.scene.nodes.map(({ id }) => id));
    for (const anomaly of artifact.anomalies) {
      assert.equal(anomaly.entityRefs.length > 0, true, `no entityRefs:${anomaly.id}`);
      const resolvable = anomaly.entityRefs.filter((ref) => nodes.has(ref));
      assert.equal(resolvable.length > 0, true, `no navigable entityRef:${anomaly.id}:${anomaly.entityRefs.join('|')}`);
      // The compiler message is printed verbatim as the evidence line, so it must be present.
      assert.equal(typeof anomaly.message === 'string' && anomaly.message.trim().length > 0, true, `empty message:${anomaly.id}`);
      assert.equal(typeof anomaly.code === 'string' && anomaly.code.length > 0, true, `empty code:${anomaly.id}`);
      assert.equal(typeof anomaly.severity === 'string' && anomaly.severity.length > 0, true, `empty severity:${anomaly.id}`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
