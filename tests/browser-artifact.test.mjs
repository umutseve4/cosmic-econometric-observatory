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
