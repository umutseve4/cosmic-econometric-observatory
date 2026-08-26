import { compareCodePoints } from './canonical.js';
import type { BrowserThreePreparationPort, PreparedBrowserProjection } from './browser-renderer.js';

interface DisposableLike { dispose(): void; }
interface PositionLike { set(x: number, y: number, z: number): void; }
interface Object3DLike { name: string; userData: Record<string, unknown>; readonly position: PositionLike; }
interface SceneLike { add(...objects: Object3DLike[]): void; }
interface CameraLike extends Object3DLike { lookAt(x: number, y: number, z: number): void; }
interface BufferGeometryLike extends DisposableLike { setFromPoints(points: readonly VectorLike[]): BufferGeometryLike; }
interface VectorLike {}
interface RendererLike extends DisposableLike {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
  render(scene: SceneLike, camera: CameraLike): void;
}

export interface BrowserThreeRuntime {
  readonly Scene: new () => SceneLike;
  readonly PerspectiveCamera: new (fieldOfView: number, aspect: number, near: number, far: number) => CameraLike;
  readonly WebGLRenderer: new (options: { canvas: HTMLCanvasElement; antialias: boolean; preserveDrawingBuffer: boolean }) => RendererLike;
  readonly SphereGeometry: new (radius: number, widthSegments: number, heightSegments: number) => DisposableLike;
  readonly MeshBasicMaterial: new (options: { color: number }) => DisposableLike;
  readonly Mesh: new (geometry: DisposableLike, material: DisposableLike) => Object3DLike;
  readonly BufferGeometry: new () => BufferGeometryLike;
  readonly Vector3: new (x: number, y: number, z: number) => VectorLike;
  readonly LineBasicMaterial: new (options: { color: number }) => DisposableLike;
  readonly Line: new (geometry: BufferGeometryLike, material: DisposableLike) => Object3DLike;
}

export interface BrowserCanvasDocument { createElement(name: 'canvas'): HTMLCanvasElement; }

type NodePayload = {
  id: string;
  semanticKind: string;
  label: string;
  position: { x: number; y: number; z: number };
  focusOrder: number;
  capabilities: string[];
};
type EdgePayload = { id: string; semanticKind: string; source: string; target: string };
type ThreePayload = { scene: string; nodes: NodePayload[]; edges: EdgePayload[] };

export function createBrowserThreePort(
  documentLike: BrowserCanvasDocument,
  runtime: BrowserThreeRuntime
): BrowserThreePreparationPort<HTMLCanvasElement> {
  return Object.freeze({
    prepareThree(payload: unknown): PreparedBrowserProjection<HTMLCanvasElement> {
      let renderer: RendererLike | undefined;
      const disposables: DisposableLike[] = [];
      try {
        const canonical = validatePayload(payload);
        const canvas = documentLike.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.dataset.projection = 'three';
        const scene = new runtime.Scene();

        for (const node of canonical.nodes) {
          const geometry = new runtime.SphereGeometry(0.16, 12, 8);
          disposables.push(geometry);
          const material = new runtime.MeshBasicMaterial({ color: node.semanticKind === 'program' ? 0x4f8cff : 0x62d49b });
          disposables.push(material);
          const mesh = new runtime.Mesh(geometry, material);
          mesh.name = node.id;
          mesh.userData = Object.freeze({ id: node.id, semanticKind: node.semanticKind, label: node.label });
          mesh.position.set(node.position.x, node.position.y, node.position.z);
          scene.add(mesh);
        }

        for (const edge of canonical.edges) {
          const source = canonical.nodes.find(({ id }) => id === edge.source)!;
          const target = canonical.nodes.find(({ id }) => id === edge.target)!;
          const geometry = new runtime.BufferGeometry();
          disposables.push(geometry);
          geometry.setFromPoints([
            new runtime.Vector3(source.position.x, source.position.y, source.position.z),
            new runtime.Vector3(target.position.x, target.position.y, target.position.z)
          ]);
          const material = new runtime.LineBasicMaterial({ color: 0x8b93a7 });
          disposables.push(material);
          const line = new runtime.Line(geometry, material);
          line.name = edge.id;
          line.userData = Object.freeze({ id: edge.id, semanticKind: edge.semanticKind, source: edge.source, target: edge.target });
          scene.add(line);
        }

        const camera = new runtime.PerspectiveCamera(50, 4 / 3, 0.1, 1000);
        const extent = Math.max(4, ...canonical.nodes.flatMap(({ position }) => [Math.abs(position.x), Math.abs(position.y), Math.abs(position.z)]));
        camera.position.set(0, extent, extent * 2);
        camera.lookAt(0, 0, 0);
        renderer = new runtime.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(960, 720, false);
        renderer.render(scene, camera);
        canvas.dataset.frame = 'rendered';
        canvas.dataset.nodeCount = String(canonical.nodes.length);
        canvas.dataset.edgeCount = String(canonical.edges.length);

        const nodesById = [...canonical.nodes].sort((left, right) => compareCodePoints(left.id, right.id));
        const edgesById = [...canonical.edges].sort((left, right) => compareCodePoints(left.id, right.id));
        return Object.freeze({
          roots: Object.freeze([canvas]),
          nodeIds: Object.freeze(nodesById.map(({ id }) => id)),
          edgeIds: Object.freeze(edgesById.map(({ id }) => id)),
          focusOrderNodeIds: Object.freeze([...canonical.nodes].sort((left, right) => left.focusOrder - right.focusOrder).map(({ id }) => id)),
          nodeDescriptors: Object.freeze(nodesById.map(({ id, label, semanticKind }) => Object.freeze({ id, label, kind: semanticKind }))),
          edgeDescriptors: Object.freeze(edgesById.map(({ id, source, target }) => Object.freeze({ id, source, target })))
        });
      } catch (error) {
        throw new Error('BROWSER_THREE_PREPARE_FAILED', { cause: error });
      } finally {
        for (const disposable of disposables.reverse()) disposable.dispose();
        renderer?.dispose();
      }
    }
  });
}

function validatePayload(input: unknown): ThreePayload {
  if (!isRecord(input) || !hasOnlyKeys(input, ['scene', 'nodes', 'edges']) || typeof input.scene !== 'string' || input.scene.length === 0 || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new Error('BROWSER_THREE_INVALID_PAYLOAD:shape');
  }
  const nodeIds = new Set<string>();
  const focusOrders = new Set<number>();
  const nodes = input.nodes.map((value): NodePayload => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'semanticKind', 'label', 'position', 'focusOrder', 'capabilities']) ||
        typeof value.id !== 'string' || value.id.length === 0 || typeof value.semanticKind !== 'string' || typeof value.label !== 'string' ||
        !isRecord(value.position) || !hasOnlyKeys(value.position, ['x', 'y', 'z']) ||
        !isFiniteNumber(value.position.x) || !isFiniteNumber(value.position.y) || !isFiniteNumber(value.position.z) ||
        !Number.isSafeInteger(value.focusOrder) || (value.focusOrder as number) <= 0 ||
        !Array.isArray(value.capabilities) || !value.capabilities.every((capability) => typeof capability === 'string') ||
        nodeIds.has(value.id) || focusOrders.has(value.focusOrder as number)) {
      throw new Error('BROWSER_THREE_INVALID_PAYLOAD:nodes');
    }
    nodeIds.add(value.id);
    focusOrders.add(value.focusOrder as number);
    return { id: value.id, semanticKind: value.semanticKind, label: value.label,
      position: { x: value.position.x, y: value.position.y, z: value.position.z },
      focusOrder: value.focusOrder as number, capabilities: [...value.capabilities] as string[] };
  });
  const edgeIds = new Set<string>();
  const edges = input.edges.map((value): EdgePayload => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'semanticKind', 'source', 'target']) ||
        typeof value.id !== 'string' || value.id.length === 0 || typeof value.semanticKind !== 'string' ||
        typeof value.source !== 'string' || typeof value.target !== 'string' || edgeIds.has(value.id) ||
        !nodeIds.has(value.source) || !nodeIds.has(value.target)) {
      throw new Error('BROWSER_THREE_INVALID_PAYLOAD:edges');
    }
    edgeIds.add(value.id);
    return { id: value.id, semanticKind: value.semanticKind, source: value.source, target: value.target };
  });
  return { scene: input.scene, nodes, edges };
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
