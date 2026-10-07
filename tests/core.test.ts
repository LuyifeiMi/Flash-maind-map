import test from 'node:test';
import assert from 'node:assert/strict';
import { getDescendants, isTreeEdge, canConnect, normalizeEdges, applyVisibility, parseGraph } from '../src/lib/graph';
import { getLayoutedElements } from '../src/lib/layout';
import { isReviewable, isDue, rateCard, learningStatus, shuffle } from '../src/lib/review';
import { graphContent, readMap, readStoredMaps } from '../src/lib/storage';
import { validateCards } from '../src/lib/generated';
import type { FlashNode } from '../src/types';
import type { Edge } from '@xyflow/react';

const node = (id: string, data = {}): FlashNode => ({ id, type: 'custom', position: { x: 0, y: 0 }, data: { label: id, question: '问题', answer: '答案', ...data } });
const edge = (source: string, target: string, kind = 'tree'): Edge => ({ id: source + '-' + target, source, target, data: { kind } });

test('tree connections reject cycles and multiple parents while relationships are independent', () => {
  const edges = [edge('a','b'), edge('b','c'), edge('c','a','relationship')];
  assert.equal(canConnect('c','a',edges), false);
  assert.equal(canConnect('d','b',edges), false);
  assert.equal(canConnect('a','d',edges), true);
  assert.deepEqual(new Set(getDescendants('a',edges)), new Set(['b','c']));
  assert.deepEqual(getDescendants('c',edges), []);
});
test('legacy cyclic and shared-node graphs preserve nodes and demote non-tree links', () => {
  const nodes = [node('a'),node('b'),node('s')];
  const edges = ['a-s','b-s','s-a'].map(id => ({id,source:id[0],target:id[2]}));
  const normalized = normalizeEdges(nodes,edges);
  assert.equal(normalized.filter(isTreeEdge).length, 1);
  const result = getLayoutedElements(nodes,edges);
  assert.equal(result.nodes.length,3);
  assert.equal(new Set(result.nodes.map(n => n.id)).size,3);
  assert.equal(result.edges.length,3);
  assert.ok(result.nodes.every(n=>Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
});
test('summary links never create duplicate layout nodes', () => {
  const nodes = [node('a'),node('b'),node('s')];
  const result = getLayoutedElements(nodes,[edge('a','s','summary'),edge('b','s','summary')]);
  assert.equal(result.nodes.length,3);
  assert.ok(result.edges.every(e => e.type === 'bezier'));
});
test('imported node IDs cannot alter the layout adjacency prototype', () => {
  const result = getLayoutedElements([node('__proto__'),node('constructor')],[edge('__proto__','constructor')]);
  assert.equal(result.nodes.length,2);
  assert.ok(result.nodes.every(n=>Number.isFinite(n.position.x) && Number.isFinite(n.position.y)));
});
test('nested collapse stays collapsed when its ancestor is expanded', () => {
  const nodes = [node('a',{isCollapsed:false}),node('b',{isCollapsed:true}),node('c'),node('d')];
  const result = applyVisibility(nodes,[edge('a','b'),edge('b','c'),edge('a','d','relationship')]);
  assert.equal(result.nodes.find(n=>n.id==='b')?.hidden,false);
  assert.equal(result.nodes.find(n=>n.id==='c')?.hidden,true);
  assert.equal(result.nodes.find(n=>n.id==='d')?.hidden,false);
});
test('invalid imports are rejected and dangling edges are removed', () => {
  assert.throws(()=>parseGraph({nodes:{},edges:[]}));
  assert.throws(()=>parseGraph({nodes:[node('a'),node('a')],edges:[]}));
  assert.throws(()=>parseGraph({nodes:[node('a',{question:23})],edges:[]}));
  assert.throws(()=>parseGraph({nodes:[node('a',{reviewHistory:[null]})],edges:[]}));
  const result=parseGraph({nodes:[node('a')],edges:[edge('a','missing')]});
  assert.equal(result.edges.length,0);
});
test('empty, suspended and knowledge-only cards are excluded from review', () => {
  for(const data of [{question:''},{answer:' '},{isSuspended:true},{reviewEnabled:false}]) assert.equal(isReviewable(node('a',data)),false);
  assert.equal(isReviewable(node('a')),true);
  assert.equal(isDue(node('a',{nextReviewDate:100}),99),false);
  assert.equal(isDue(node('a',{nextReviewDate:100}),100),true);
});
test('failed reviews persist immediately and successful ratings have increasing intervals', () => {
  const forgot = rateCard('a',{srsLevel:5},'forgot',1000);
  assert.equal(forgot.srsLevel,0); assert.equal(forgot.nextReviewDate,61_000);
  assert.equal(forgot.reviewHistory?.[0].rating,'forgot');
  assert.equal(learningStatus(node('a',forgot),1000).label,'最近答错');
  const hard = rateCard('a',{srsLevel:3},'hard',1000);
  const good = rateCard('a',{srsLevel:3},'good',1000);
  const easy = rateCard('a',{srsLevel:3},'easy',1000);
  assert.ok(hard.nextReviewDate! < good.nextReviewDate! && good.nextReviewDate! < easy.nextReviewDate!);
});
test('review histories are bounded and replayed using the latest saved state', () => {
  let data = node('a').data;
  for(let i=0;i<220;i++) data={...data,...rateCard('a',data,'good',i*1000)};
  assert.equal(data.reviewHistory?.length,200);
  assert.equal(data.reviewHistory?.at(-1)?.at,219000);
  assert.ok(data.srsLevel! <=9);
});
test('shuffle keeps each card exactly once without mutating the source', () => {
  const items=[1,2,3,4,5];assert.deepEqual(shuffle(items).sort(),items);assert.deepEqual(items,[1,2,3,4,5]);
});
test('persisted graph retains study data and omits transient editor state', () => {
  const card={...node('a',{lastRating:'forgot',nextReviewDate:100}),selected:true,dragging:true};
  const map={id:'map',title:'标题',updatedAt:new Date().toISOString(),...graphContent([card],[])};
  const restored=readMap(map);
  assert.equal(restored.nodes[0].data.lastRating,'forgot');
  assert.equal(restored.nodes[0].data.nextReviewDate,100);
  assert.equal(JSON.parse(map.nodes)[0].selected,undefined);
});
test('corrupt local storage has a recovery copy rather than silently losing the original', () => {
  const values=new Map([['maps','broken-json']]);
  const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value)}};
  assert.deepEqual(readStoredMaps(storage,'maps'),[]);
  assert.ok([...values.keys()].some(k=>k.startsWith('maps-recovery-')));
  assert.equal(values.get('maps'),'broken-json');
});
test('AI data validation rejects missing parents, cycles and excessive cards', () => {
  const card={id:'a',parentId:null,label:'知识点',question:'问题',answer:'答案'};
  assert.equal(validateCards([card])[0].id,'a');
  assert.throws(()=>validateCards([{...card,parentId:'missing'}]));
  assert.throws(()=>validateCards([{...card,parentId:'a'}]));
  assert.throws(()=>validateCards([{...card,question:''}]));
  assert.throws(()=>validateCards([card,{...card,id:'b'}],1));
});
