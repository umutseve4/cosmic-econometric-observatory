import assert from 'node:assert/strict';
import test from 'node:test';
import type { SceneIR } from '../src/index.js';
import { project } from '../src/index.js';

const nodes: SceneIR['nodes']=[{id:'node:b',semanticKind:'course',label:'B',position:{x:2,y:0,z:2},focusOrder:2,capabilities:['inspect']},{id:'node:a',semanticKind:'program',label:'A < & " >',position:{x:1,y:0,z:1},focusOrder:1,capabilities:['inspect']}];
const edges: SceneIR['edges']=[{id:'edge:a-b',semanticKind:'CONTAINS',source:'node:a',target:'node:b'}];
function scene(ns:SceneIR['nodes'],es:SceneIR['edges']):SceneIR{return{schemaVersion:'0.1.0',layoutVersion:'m3e',seed:'m3e',inputHash:`sha256:${'f'.repeat(64)}`,nodes:ns,edges:es};}
test('all projections expose identical canonical semantic descriptors',()=>{const manifests=(['three','svg','html'] as const).map((kind)=>project(scene(nodes,edges),kind));for(const manifest of manifests){assert.deepEqual(manifest.nodeDescriptors,[{id:'node:a',label:'A < & " >',kind:'program'},{id:'node:b',label:'B',kind:'course'}]);assert.deepEqual(manifest.edgeDescriptors,[{id:'edge:a-b',source:'node:a',target:'node:b'}]);}assert.deepEqual(manifests.map(({nodeDescriptors,edgeDescriptors})=>({nodeDescriptors,edgeDescriptors})),Array(3).fill({nodeDescriptors:manifests[0]!.nodeDescriptors,edgeDescriptors:manifests[0]!.edgeDescriptors}));});
test('semantic descriptors and projection bytes are input-order deterministic',()=>{for(const kind of ['three','svg','html'] as const){const left=project(scene(nodes,edges),kind);const right=project(scene([...nodes].reverse(),[...edges].reverse()),kind);assert.deepEqual(right.nodeDescriptors,left.nodeDescriptors);assert.deepEqual(right.edgeDescriptors,left.edgeDescriptors);if(kind!=='three')assert.equal(right.content,left.content);}});
