export type NodeSelectionState = Readonly<{ selectedNodeId: string | null }>;
export type NodeSelectionCommand =
  | Readonly<{ type: 'select'; nodeId: string; expectedSnapshotId: string }>
  | Readonly<{ type: 'clear'; expectedSnapshotId: string }>;
export type NodeSelectionReceipt =
  | Readonly<{ outcome: 'committed'; previous: NodeSelectionState; current: NodeSelectionState; logicalCommitCount: 1 }>
  | Readonly<{ outcome: 'noop'; state: NodeSelectionState; logicalCommitCount: 0 }>
  | Readonly<{ outcome: 'rejected'; code: 'NODE_SELECTION_UNKNOWN_NODE_ID' | 'NODE_SELECTION_STALE_SNAPSHOT'; state: NodeSelectionState; logicalCommitCount: 0 }>;

export interface NodeSelectionController {
  getState(): NodeSelectionState;
  dispatch(command: NodeSelectionCommand): NodeSelectionReceipt;
}

export type NodeSelectionTransition = Readonly<{ previous: NodeSelectionState; current: NodeSelectionState }>;

export function createNodeSelectionController(input: Readonly<{
  snapshotId: string;
  nodeIds: readonly string[];
  initialSelectedNodeId?: string | null;
  commit(transition: NodeSelectionTransition): void;
}>): NodeSelectionController {
  const snapshotId = validateSnapshotId(input.snapshotId);
  const nodeIds = validateNodeIds(input.nodeIds);
  const registry = new Set(nodeIds);
  const initialSelectedNodeId = input.initialSelectedNodeId ?? null;
  if (initialSelectedNodeId !== null && !registry.has(initialSelectedNodeId)) throw new Error('NODE_SELECTION_UNKNOWN_INITIAL_NODE_ID');
  let state = freezeState(initialSelectedNodeId);

  return Object.freeze({
    getState(): NodeSelectionState { return state; },
    dispatch(command: NodeSelectionCommand): NodeSelectionReceipt {
      if (command === null || typeof command !== 'object' || (command.type !== 'select' && command.type !== 'clear')) throw new Error('NODE_SELECTION_INVALID_COMMAND');
      if (command.expectedSnapshotId !== snapshotId) return Object.freeze({ outcome: 'rejected', code: 'NODE_SELECTION_STALE_SNAPSHOT', state, logicalCommitCount: 0 });
      let selectedNodeId: string | null;
      if (command.type === 'select') {
        if (!registry.has(command.nodeId)) return Object.freeze({ outcome: 'rejected', code: 'NODE_SELECTION_UNKNOWN_NODE_ID', state, logicalCommitCount: 0 });
        selectedNodeId = command.nodeId;
      } else {
        selectedNodeId = null;
      }
      if (selectedNodeId === state.selectedNodeId) return Object.freeze({ outcome: 'noop', state, logicalCommitCount: 0 });
      const previous = state;
      const current = freezeState(selectedNodeId);
      input.commit(Object.freeze({ previous, current }));
      state = current;
      return Object.freeze({ outcome: 'committed', previous, current, logicalCommitCount: 1 });
    }
  });
}

export type NodeSelectionProjection = 'html' | 'svg';
export interface NodeSelectionBinding {
  apply(state: NodeSelectionState): void;
  dispose(): void;
}

export function bindNodeSelectionSurface(input: Readonly<{
  root: ParentNode & EventTarget;
  projection: NodeSelectionProjection;
  snapshotId: string;
  focusOrderNodeIds: readonly string[];
  dispatch(command: NodeSelectionCommand): NodeSelectionReceipt;
  initialState: NodeSelectionState;
}>): NodeSelectionBinding {
  const snapshotId = validateSnapshotId(input.snapshotId);
  const focusOrderNodeIds = validateNodeIds(input.focusOrderNodeIds);
  const registry = new Set(focusOrderNodeIds);
  const selector = input.projection === 'html'
    ? 'nav a[data-node-id]'
    : input.projection === 'svg'
      ? 'svg g[role="listitem"][data-node-id]'
      : failUnsupportedProjection();
  const activationTargets = [...input.root.querySelectorAll(selector)];
  const activationIds = activationTargets.map((element) => requiredNodeId(element));
  if (new Set(activationIds).size !== activationIds.length) throw new Error('NODE_SELECTION_DUPLICATE_TARGET');
  if (!sameStrings(activationIds, focusOrderNodeIds)) throw new Error('NODE_SELECTION_TARGET_SET_MISMATCH');
  const targetIds = new Map<EventTarget, string>(activationTargets.map((element, index) => [element, activationIds[index]!]));
  const paintTargets = [...input.root.querySelectorAll('[data-node-id]')];
  for (const target of paintTargets) if (!registry.has(requiredNodeId(target))) throw new Error('NODE_SELECTION_UNKNOWN_PAINT_TARGET');
  validateState(input.initialState, registry);
  let disposed = false;

  const apply = (state: NodeSelectionState): void => {
    if (disposed) throw new Error('NODE_SELECTION_BINDING_DISPOSED');
    validateState(state, registry);
    for (const target of paintTargets) {
      if (requiredNodeId(target) === state.selectedNodeId) target.setAttribute('data-selected', 'true');
      else target.removeAttribute('data-selected');
    }
    for (const target of activationTargets) {
      if (targetIds.get(target) === state.selectedNodeId) target.setAttribute('aria-current', 'true');
      else target.removeAttribute('aria-current');
    }
  };

  const onKeyDown = (rawEvent: Event): void => {
    if (disposed || !(rawEvent instanceof KeyboardEvent) || rawEvent.repeat) return;
    if (rawEvent.key === 'Escape') {
      input.dispatch(Object.freeze({ type: 'clear', expectedSnapshotId: snapshotId }));
      return;
    }
    if (rawEvent.key !== 'Enter' && rawEvent.key !== ' ' && rawEvent.key !== 'Space' && rawEvent.key !== 'Spacebar') return;
    const target = rawEvent.composedPath().find((candidate) => targetIds.has(candidate));
    if (!(target instanceof Element)) return;
    const nodeId = targetIds.get(target);
    if (nodeId === undefined || !contains(input.root, target) || target.getAttribute('data-node-id') !== nodeId) return;
    if (rawEvent.key !== 'Enter') rawEvent.preventDefault();
    input.dispatch(Object.freeze({ type: 'select', nodeId, expectedSnapshotId: snapshotId }));
  };

  apply(input.initialState);
  input.root.addEventListener('keydown', onKeyDown);
  return Object.freeze({
    apply,
    dispose(): void {
      if (disposed) return;
      input.root.removeEventListener('keydown', onKeyDown);
      disposed = true;
    }
  });
}

function validateSnapshotId(value: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('NODE_SELECTION_INVALID_SNAPSHOT_ID');
  return value;
}
function validateNodeIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length === 0) throw new Error('NODE_SELECTION_EMPTY_NODE_IDS');
  const copy = values.map((value) => {
    if (typeof value !== 'string' || value.length === 0) throw new Error('NODE_SELECTION_INVALID_NODE_ID');
    return value;
  });
  if (new Set(copy).size !== copy.length) throw new Error('NODE_SELECTION_DUPLICATE_NODE_ID');
  return Object.freeze(copy);
}
function freezeState(selectedNodeId: string | null): NodeSelectionState { return Object.freeze({ selectedNodeId }); }
function requiredNodeId(element: Element): string {
  const value = element.getAttribute('data-node-id');
  if (value === null || value.length === 0) throw new Error('NODE_SELECTION_INVALID_TARGET_ID');
  return value;
}
function validateState(state: NodeSelectionState, registry: ReadonlySet<string>): void {
  if (state === null || typeof state !== 'object' || (state.selectedNodeId !== null && !registry.has(state.selectedNodeId))) throw new Error('NODE_SELECTION_UNKNOWN_STATE_NODE_ID');
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function contains(root: ParentNode & EventTarget, element: Element): boolean {
  return root instanceof Node && root.contains(element);
}
function failUnsupportedProjection(): never { throw new Error('NODE_SELECTION_UNSUPPORTED_PROJECTION'); }
