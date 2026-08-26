import { compareCodePoints } from './canonical.js';
import type { BrowserDomPort, PreparedBrowserProjection } from './browser-renderer.js';
import type { ProjectionEdgeDescriptor, ProjectionNodeDescriptor } from './projections.js';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_ELEMENTS = new Set(['nav','ol','li','a','main','article','h2','p','section','ul']);
const SVG_ELEMENTS = new Set(['svg','g','circle','title','path']);
const HTML_ATTRIBUTES = new Set(['id','href','tabindex','role','aria-label','data-node-id','data-edge-id','data-semantic-kind']);
const SVG_ATTRIBUTES = new Set(['id','tabindex','role','aria-label','data-node-id','data-edge-id','data-semantic-kind','data-source','data-target','cx','cy','r','viewbox','preserveaspectratio','d','fill','stroke','stroke-width']);
type DomKind = 'html' | 'svg';
interface Metadata { nodeIds: string[]; edgeIds: string[]; focusOrderNodeIds: string[]; nodeDescriptors: ProjectionNodeDescriptor[]; edgeDescriptors: ProjectionEdgeDescriptor[]; }

export function createBrowserDomPort(document: Document): BrowserDomPort<Node> {
  return { prepareHtml: (content) => prepare(document, content, 'html'), prepareSvg: (content) => prepare(document, content, 'svg') };
}
function prepare(document: Document, content: string, kind: DomKind): PreparedBrowserProjection<Node> {
  if (content.length === 0 || content.length > 2_000_000) fail(kind, 'content-size');
  const template = document.createElement('template'); template.innerHTML = content;
  const roots = Array.from(template.content.childNodes); validateTree(roots, kind);
  const metadata = kind === 'html' ? inspectHtml(roots) : inspectSvg(roots);
  return Object.freeze({ roots: Object.freeze(roots), nodeIds: Object.freeze(metadata.nodeIds), edgeIds: Object.freeze(metadata.edgeIds), focusOrderNodeIds: Object.freeze(metadata.focusOrderNodeIds), nodeDescriptors: Object.freeze(metadata.nodeDescriptors), edgeDescriptors: Object.freeze(metadata.edgeDescriptors) });
}
function validateTree(nodes: ArrayLike<Node>, kind: DomKind): void {
  const ns = kind === 'html' ? HTML_NS : SVG_NS, allowed = kind === 'html' ? HTML_ELEMENTS : SVG_ELEMENTS, attributes = kind === 'html' ? HTML_ATTRIBUTES : SVG_ATTRIBUTES;
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) continue;
    if (node.nodeType !== 1) fail(kind, 'node-type');
    const element = node as Element;
    if (element.namespaceURI !== ns) fail(kind, 'namespace');
    if (!allowed.has(element.localName)) fail(kind, 'element');
    for (const raw of element.getAttributeNames()) { const name = raw.toLowerCase(); if (name.startsWith('on') || name === 'style' || !attributes.has(name)) fail(kind, 'attribute'); }
    validateTree(element.childNodes, kind);
  }
}
function inspectHtml(nodes: readonly Node[]): Metadata {
  const roots = elements(nodes, 'html', false); if (roots.length !== 3 || names(roots) !== 'nav,main,section') fail('html','roots');
  const [nav, main, section] = roots as [Element,Element,Element]; attrs(nav,'html',['aria-label']); attrs(main,'html',['aria-label']); attrs(section,'html',['aria-label']);
  const navChildren=elements(nav.childNodes,'html',false), mainChildren=elements(main.childNodes,'html',false), sectionChildren=elements(section.childNodes,'html',false);
  if(navChildren.length!==1||navChildren[0]!.localName!=='ol')fail('html','navigation'); if(sectionChildren.length!==1||sectionChildren[0]!.localName!=='ul')fail('html','relations'); attrs(navChildren[0]!,'html',[]); attrs(sectionChildren[0]!,'html',[]);
  const focusOrderNodeIds:string[]=[];
  for(const item of elements(navChildren[0]!.childNodes,'html',false)){ if(item.localName!=='li')fail('html','navigation'); attrs(item,'html',[]); const links=elements(item.childNodes,'html',false); if(links.length!==1||links[0]!.localName!=='a')fail('html','navigation'); const link=links[0]!; attrs(link,'html',['href','data-node-id']); if(elements(link.childNodes,'html',true).length!==0)fail('html','navigation-text'); const id=identifier(link.getAttribute('data-node-id'),'html','node-id'); if(link.getAttribute('href')!==`#${id}`)fail('html','href'); focusOrderNodeIds.push(id); }
  const nodeDescriptors:ProjectionNodeDescriptor[]=[];
  for(const article of mainChildren){ if(article.localName!=='article')fail('html','articles'); attrs(article,'html',['id','tabindex','data-node-id','data-semantic-kind']); const id=identifier(article.getAttribute('data-node-id'),'html','node-id'), kind=identifier(article.getAttribute('data-semantic-kind'),'html','node-kind'); if(article.getAttribute('id')!==id||article.getAttribute('tabindex')!=='-1')fail('html','article-metadata'); const details=elements(article.childNodes,'html',false); if(details.length!==2||names(details)!=='h2,p')fail('html','article-structure'); attrs(details[0]!,'html',[]); attrs(details[1]!,'html',[]); if(elements(details[0]!.childNodes,'html',true).length!==0||elements(details[1]!.childNodes,'html',true).length!==0)fail('html','article-text'); const label=textValue(details[0]!); if(textValue(details[1]!)!==kind)fail('html','article-kind'); nodeDescriptors.push({id,label,kind}); }
  unique(nodeDescriptors.map(({id})=>id),'html','node-id'); unique(focusOrderNodeIds,'html','focus-order'); nodeDescriptors.sort(byId); const nodeIds=nodeDescriptors.map(({id})=>id); if(!sameSet(nodeIds,focusOrderNodeIds))fail('html','node-set');
  const edgeDescriptors:ProjectionEdgeDescriptor[]=[];
  for(const item of elements(sectionChildren[0]!.childNodes,'html',true)){ if(item.localName!=='li')fail('html','relations'); attrs(item,'html',['data-edge-id','data-semantic-kind']); const id=identifier(item.getAttribute('data-edge-id'),'html','edge-id'); const links=elements(item.childNodes,'html',true); if(links.length!==2||links.some((link)=>link.localName!=='a'))fail('html','relation-shape'); const endpoints=links.map((link)=>{attrs(link,'html',['href']); if(elements(link.childNodes,'html',true).length!==0)fail('html','relation-text'); const href=link.getAttribute('href'); if(href===null||!href.startsWith('#')||!nodeIds.includes(href.slice(1)))fail('html','relation-target'); return href.slice(1);}); edgeDescriptors.push({id,source:endpoints[0]!,target:endpoints[1]!}); }
  unique(edgeDescriptors.map(({id})=>id),'html','edge-id'); edgeDescriptors.sort(byId); return {nodeIds,edgeIds:edgeDescriptors.map(({id})=>id),focusOrderNodeIds,nodeDescriptors,edgeDescriptors};
}
function inspectSvg(nodes:readonly Node[]):Metadata{
  const roots=elements(nodes,'svg',false); if(roots.length!==1||roots[0]!.localName!=='svg')fail('svg','roots'); const svg=roots[0]!; attrs(svg,'svg',['role','aria-label','viewbox','preserveaspectratio']); const groups=elements(svg.childNodes,'svg',false); if(groups.length!==2||groups.some((g)=>g.localName!=='g'))fail('svg','groups'); const [nodeGroup,edgeGroup]=groups as [Element,Element]; attrs(nodeGroup,'svg',['role','aria-label']); attrs(edgeGroup,'svg',['role','aria-label']); if(nodeGroup.getAttribute('role')!=='list'||edgeGroup.getAttribute('role')!=='group')fail('svg','groups');
  const focusOrderNodeIds:string[]=[],nodeDescriptors:ProjectionNodeDescriptor[]=[];
  for(const node of elements(nodeGroup.childNodes,'svg',false)){ if(node.localName!=='g')fail('svg','nodes'); attrs(node,'svg',['id','role','tabindex','data-node-id','data-semantic-kind','aria-label']); const id=identifier(node.getAttribute('data-node-id'),'svg','node-id'),kind=identifier(node.getAttribute('data-semantic-kind'),'svg','node-kind'); if(node.getAttribute('id')!==id||node.getAttribute('role')!=='listitem'||node.getAttribute('tabindex')!=='0')fail('svg','node-metadata'); const children=elements(node.childNodes,'svg',false); if(children.length!==2||names(children)!=='circle,title')fail('svg','node-structure'); attrs(children[0]!,'svg',['cx','cy','r']); attrs(children[1]!,'svg',[]); if(elements(children[0]!.childNodes,'svg',false).length!==0||elements(children[1]!.childNodes,'svg',true).length!==0)fail('svg','node-children'); focusOrderNodeIds.push(id); nodeDescriptors.push({id,label:textValue(children[1]!),kind}); }
  unique(focusOrderNodeIds,'svg','node-id'); nodeDescriptors.sort(byId); const nodeIds=nodeDescriptors.map(({id})=>id); const edgeDescriptors:ProjectionEdgeDescriptor[]=[];
  for(const edge of elements(edgeGroup.childNodes,'svg',false)){ if(edge.localName!=='path')fail('svg','edges'); attrs(edge,'svg',['data-edge-id','data-semantic-kind','data-source','data-target','d','fill','stroke','stroke-width']); if(elements(edge.childNodes,'svg',false).length!==0)fail('svg','edge-children'); const id=identifier(edge.getAttribute('data-edge-id'),'svg','edge-id'),source=identifier(edge.getAttribute('data-source'),'svg','edge-source'),target=identifier(edge.getAttribute('data-target'),'svg','edge-target'); if(!nodeIds.includes(source)||!nodeIds.includes(target))fail('svg','edge-endpoint'); edgeDescriptors.push({id,source,target}); }
  unique(edgeDescriptors.map(({id})=>id),'svg','edge-id'); edgeDescriptors.sort(byId); return{nodeIds,edgeIds:edgeDescriptors.map(({id})=>id),focusOrderNodeIds,nodeDescriptors,edgeDescriptors};
}
function elements(nodes:ArrayLike<Node>,kind:DomKind,allowText:boolean):Element[]{const result:Element[]=[];for(const node of Array.from(nodes)){if(node.nodeType===1){const e=node as Element;if(e.namespaceURI!==(kind==='html'?HTML_NS:SVG_NS))fail(kind,'namespace');result.push(e);}else if(node.nodeType===3){if(!allowText&&(node.textContent??'').trim()!=='')fail(kind,'text');}else fail(kind,'node-type');}return result;}
function attrs(element:Element,kind:DomKind,allowed:readonly string[]):void{const set=new Set(allowed);for(const raw of element.getAttributeNames()){const name=raw.toLowerCase();if(name.startsWith('on')||name==='style'||!set.has(name))fail(kind,'attribute');}if(element.getAttributeNames().length!==allowed.length||allowed.some((name)=>element.getAttribute(name)===null))fail(kind,'attribute');}
function textValue(element:Element):string{return Array.from(element.childNodes).map((node)=>node.nodeType===3?(node.textContent??''):textValue(node as Element)).join('');}
function identifier(value:string|null,kind:DomKind,reason:string):string{if(value===null||value.length===0||/[\u0000-\u0020#\u007f]/u.test(value))fail(kind,reason);return value;}
function unique(values:readonly string[],kind:DomKind,reason:string):void{if(new Set(values).size!==values.length)fail(kind,reason);}
function sameSet(sorted:readonly string[],values:readonly string[]):boolean{const copy=[...values].sort(compareCodePoints);return sorted.length===copy.length&&sorted.every((value,index)=>value===copy[index]);}
function names(values:readonly Element[]):string{return values.map((value)=>value.localName).join(',');}
function byId<T extends{id:string}>(a:T,b:T):number{return compareCodePoints(a.id,b.id);}
function fail(kind:DomKind,reason:string):never{throw new Error(`BROWSER_DOM_INVALID_CONTENT:${kind}:${reason}`);}
