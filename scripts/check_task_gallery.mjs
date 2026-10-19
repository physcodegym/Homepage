import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=await build({stdin:{contents:"export {groupTasks} from './src/tasks'; export {reconstructionSlots,artifactConfiguration} from './src/player';",resolveDir:root},bundle:true,write:false,format:'esm',platform:'node'});
const {groupTasks,reconstructionSlots,artifactConfiguration}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const cases=JSON.parse(await readFile(new URL('../src/data/cases.json',import.meta.url)));
const roster=JSON.parse(await readFile(new URL('../src/data/results.json',import.meta.url)));
const catalog=JSON.parse(await readFile(new URL('../qa/video-catalog-manifest.json',import.meta.url)));
const tasks=groupTasks(cases);
const home=JSON.parse(await readFile(new URL('../src/data/home.json',import.meta.url)));
assert.deepEqual(home.failures,cases.filter(c=>c.kind==='Physical failure'));
for(const row of home.submissions){
 assert.equal(row.submitted,catalog.main_matches.filter(m=>m.model===row.model&&m.harness===row.harness).length);
 assert.equal(row.total,156);
}
assert.equal(tasks.length,new Set(cases.map(c=>c.caseId)).size);
assert.equal(tasks.length,156);
assert.deepEqual(Object.fromEntries(['Rigid body','Liquid','Deformable','Wind-driven'].map(d=>[d,tasks.filter(t=>t.domain===d).length])),{'Rigid body':95,'Liquid':40,'Deformable':12,'Wind-driven':9});
for(const c of cases){
 const task=tasks.find(t=>t.caseId===c.caseId);assert(task.aliases.includes(c.id));
 for(const m of c.models){
  const actual=task.models.find(a=>a.sha256===m.sha256&&a.setting===m.setting);assert(actual);
  for(const key of ['video','poster','scores','scoreNote','job','trial'])assert.deepEqual(actual[key],m[key]);
  assert.equal(actual.evidence,m.evidence??c.evidence);
  assert.equal(actual.source,m.source??c.source);
 }
 const slots=reconstructionSlots(task,roster);
 assert.equal(slots.filter(s=>s.artifact).length,task.models.length);
 assert(slots.filter(s=>!s.artifact).every(s=>!('scores' in s)));
}
const eggs=tasks.find(t=>t.id==='rolling_egg');
assert.equal(eggs.models.filter(m=>m.evidence).length,1);
assert.equal(eggs.models.find(m=>m.evidence).name,'GPT-5.6-Sol');
const blue=tasks.find(t=>t.id==='13_rigid_eggs_blue');
const slots=reconstructionSlots(blue,roster);
assert(slots.some(s=>s.config.model==='GLM-5.3-Flash'&&s.config.harness==='Claude Code'&&s.artifact));
assert(slots.some(s=>s.config.model==='GLM-5.3-Flash'&&s.config.harness==='Codex'&&s.artifact));
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
for(const entry of catalog.main_matches){
 const task=tasks.find(t=>t.caseId===entry.caseId);
 assert(task);
 const slot=reconstructionSlots(task,roster).find(s=>s.artifact?.sha256===entry.sha256&&s.config.model===entry.model&&normalize(s.config.harness)===normalize(entry.harness));
 assert(slot,`Missing ${entry.caseId}: ${entry.model} / ${entry.harness}`);
 assert.equal(slot.artifact.job,entry.job);assert.equal(slot.artifact.trial,entry.trial);
}
for(const entry of catalog.missing_slots){
 const task=tasks.find(t=>t.caseId===entry.caseId);
 assert(task.unavailable.some(c=>c.model===entry.model&&c.harness===entry.harness));
 assert(reconstructionSlots(task,roster).some(s=>s.config.model===entry.model&&s.config.harness===entry.harness&&!s.artifact));
}
for(const failure of cases.filter(c=>c.kind==='Physical failure')){
 const task=tasks.find(t=>t.caseId===failure.caseId);
 const linked=task.models.filter(m=>m.evidence===failure.evidence);
 assert.equal(linked.length,1,`Evidence leaked to other submissions: ${failure.id}`);
 assert.equal(linked[0].sha256,failure.models[0].sha256);
}
assert.equal(catalog.main_matches.length+catalog.missing_slots.length,156*9);
console.log(`Verified ${tasks.length} tasks, ${catalog.main_matches.length} main-table videos, ${tasks.reduce((n,t)=>n+t.models.length,0)} total artifacts and six isolated failure-evidence mappings.`);
