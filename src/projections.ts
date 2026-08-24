import type { SceneIR } from './scene.js';

export interface ProjectionManifest { projection: 'three' | 'svg' | 'html'; nodeIds: readonly string[]; edgeIds: readonly string[]; content: string; }

export function project(scene: SceneIR, projection: ProjectionManifest['projection']): ProjectionManifest {
  const nodeIds = scene.nodes.map((node) => node.id);
  const edgeIds = scene.edges.map((edge) => edge.id);
  if (projection === 'three') return { projection, nodeIds, edgeIds, content: JSON.stringify({ scene: scene.schemaVersion, nodes: scene.nodes.map(({ id, position }) => ({ id, position })), edges: scene.edges }) };
  if (projection === 'svg') return { projection, nodeIds, edgeIds, content: `<svg role="img" aria-label="Academic knowledge universe">${scene.edges.map((e) => `<path data-edge-id="${escape(e.id)}" data-source="${escape(e.source)}" data-target="${escape(e.target)}"/>`).join('')}${scene.nodes.map((n) => `<g id="${escape(n.id)}" tabindex="0" aria-label="${escape(n.label)}"><circle cx="${n.position.x}" cy="${n.position.z}" r="1"/><title>${escape(n.label)}</title></g>`).join('')}</svg>` };
  return { projection, nodeIds, edgeIds, content: `<nav aria-label="Academic knowledge universe"><ol>${scene.nodes.map((n) => `<li><a href="#${escape(n.id)}" data-node-id="${escape(n.id)}">${escape(n.label)}</a></li>`).join('')}</ol></nav><section aria-label="Relations">${scene.edges.map((e) => `<p data-edge-id="${escape(e.id)}">${escape(e.source)} → ${escape(e.target)}</p>`).join('')}</section>` };
}

function escape(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
