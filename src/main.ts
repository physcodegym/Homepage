import './style.css';
import results from './data/results.json';
import content from './data/content.json';
import home from './data/home.json';
import {setupOverview} from './overview';
import {SyncPlayer, escapeHtml as esc, assetUrl, type CaseStudy} from './player';
import {modelIcon, harnessIcon} from './icons';
import {groupTasks} from './tasks';
import {renderPhysicalEvidence} from './evidence';
const $=<T extends Element = HTMLElement>(s:string)=>document.querySelector<T>(s)!;
let tasks:ReturnType<typeof groupTasks>=[];
let catalogState:'loading'|'ready'|'error'='loading';
let catalogRequest:AbortController|undefined;
// Keep each name intact and render affiliation / contribution markers consistently.
const plainMarkers=(value:string)=>value.replace(/[¹²³⁴⁵⁶]/g, marker=>String('¹²³⁴⁵⁶'.indexOf(marker)+1));
const authorName=(value:string)=>{
  const parts=value.match(/^(.*?)([¹²³⁴⁵⁶*†‡]+)$/);
  return parts ? `${esc(parts[1])}<sup>${esc([...plainMarkers(parts[2])].join(','))}</sup>` : esc(value);
};
const affiliation=(value:string)=>{
  const parts=value.match(/^([¹²³⁴⁵⁶]+)\s+(.*)$/);
  return parts ? `<sup>${esc(plainMarkers(parts[1]))}</sup>${esc(parts[2])}` : esc(value);
};
$('#authors-content').innerHTML=`<div class="author-names">${content.authors.map((row,i)=>`<p class="author-row">${row.map((a,j)=>`<span>${authorName(a)}${i<content.authors.length-1||j<row.length-1?',':''}</span>`).join(' ')}</p>`).join('')}</div><div class="affiliations">${[content.affiliations.slice(0,3),content.affiliations.slice(3)].map(row=>`<p class="affiliation-row">${row.map(a=>`<span>${affiliation(a)}</span>`).join(' ')}</p>`).join('')}</div><div class="author-roles">${content.roles.map(role=>`<p><sup>${esc(role.symbol)}</sup> ${esc(role.text)}</p>`).join('')}<p class="equal-contribution-note">${esc(content.equalContributionNote)}</p></div>`;
$('#bibtex').textContent=content.bibtex;
const domainLabels: Record<string,string>={'Rigid body':'Rigid body','Liquid':'Liquid','Deformable':'Deformable','Wind-driven':'Wind-driven'};
const domains=home.domains;
$('#domain-cards').innerHTML=domains.map(d=>`<button class="domain-card" data-domain="${esc(d.label)}" aria-controls="case-grid" aria-pressed="false" aria-label="Filter scenes: ${esc(d.label)}"><img src="${assetUrl(d.poster)}" alt="${esc(d.title)} reference frame" loading="lazy"><div><h3>${esc(d.label)}<span class="domain-check" aria-hidden="true">✓</span></h3><p>${d.total} benchmark tasks</p></div></button>`).join('');
$('#coverage-rows').innerHTML=home.submissions.map(c=>`<tr><th scope="row">${esc(c.model)}</th><td>${esc(c.harness)}</td><td>${c.submitted} / ${c.total}</td></tr>`).join('');
$('#metric-groups').innerHTML=['visual','physical'].map((group,i)=>`<article class="metric-group ${group}"><div class="metric-group-heading"><h3>${i?'Physical reconstruction':'Visual reconstruction'}</h3><span>${i?'S_phys':'S_vis'}</span></div>${content.metrics.filter(m=>m.group===group).map(m=>`<div class="metric-row"><span class="metric-label">${m.label}</span><div><h4>${m.name}</h4><p>${m.description}</p><small>${m.source}</small></div></div>`).join('')}</article>`).join('');
type ResultKey='overall'|'visual'|'physical'|'object'|'event'|'motion';
function renderResults(key:ResultKey){
 const sorted=[...results].sort((a,b)=>b[key]-a[key]);
 $('#result-rows').innerHTML=sorted.map((r,i)=>`<tr><td class="rank-col">${i+1}</td><th scope="row"><div><span class="model-identity">${modelIcon(r.model)}${esc(r.model)}</span></div></th><td class="harness-col"><span class="harness-identity">${harnessIcon(r.harness)}${esc(r.harness)}</span></td>${(['ssim','lpips','object','visual','event','motion','validity','physical','overall'] as const).map(k=>`<td class="${k==='visual'?'visual-col':k==='physical'?'physical-col':k===key?'sorted-col':''}">${r[k].toFixed(3)}</td>`).join('')}</tr>`).join('');
}
renderResults('overall');$('#result-sort').addEventListener('change',e=>renderResults((e.target as HTMLSelectElement).value as ResultKey));
let filter='all';let expanded=false;
function renderGallery(){
 $('#all-scenes').setAttribute('aria-pressed',String(filter==='all'));
 document.querySelectorAll<HTMLElement>('.domain-card').forEach(card=>{
  const selected=card.dataset.domain===filter;
  card.setAttribute('aria-pressed',String(selected));
 });
 if(catalogState!=='ready'){
  $('#case-count').textContent=catalogState==='loading'?'Loading task catalog…':'Task catalog unavailable';
  $('#gallery-more').hidden=true;$('#empty-state').hidden=true;return;
 }
 const filtered=tasks.filter(c=>filter==='all'||c.domain===filter);
 const shown=expanded?filtered:filtered.slice(0,10);
 $('#case-count').textContent=`${filter==='all'?'All scenes':domainLabels[filter]} · ${filtered.length} available scenes${shown.length<filtered.length?` · showing ${shown.length}`:''}`;
 $('#gallery-more').hidden=filtered.length<=10;
 $('#gallery-more').textContent=expanded?'Show fewer tasks ↑':`Show all ${filtered.length} tasks ↓`;
 $('#gallery-more').setAttribute('aria-expanded',String(expanded));
 $('#empty-state').hidden=filtered.length>0;
 $('#case-grid').innerHTML=shown.map(c=>`<button class="case-card" data-case="${c.id}" aria-label="Open task: ${esc(c.title)}"><div class="case-cover"><img src="${assetUrl(c.poster)}" alt="${esc(c.title)} — reference frame" loading="lazy"><span class="card-open" aria-hidden="true">↗</span></div></button>`).join('');
}
renderGallery();
$('#gallery-more').addEventListener('click',()=>{expanded=!expanded;renderGallery();if(!expanded)$('#explore').scrollIntoView();});
$('#domain-cards').addEventListener('click',e=>{
 const card=(e.target as HTMLElement).closest<HTMLElement>('[data-domain]');
 if(!card)return;
 filter=filter===card.dataset.domain?'all':card.dataset.domain!;
 expanded=false;renderGallery();
});
$('#all-scenes').addEventListener('click',()=>{filter='all';expanded=false;renderGallery();});
const dialog=$<HTMLDialogElement>('#case-dialog');let modalPlayer:SyncPlayer|undefined;let opener:HTMLElement|undefined;
const overviewVideo=$<HTMLVideoElement>('#overview-player');
const overview=setupOverview(overviewVideo,()=>!dialog.open,()=>modalPlayer?.pause());
function openCase(id:string,trigger:HTMLElement){
 const evidenceStudy=trigger.dataset.evidenceCase?home.failures.find(x=>x.id===id) as CaseStudy|undefined:undefined;
 const c=evidenceStudy??tasks.find(x=>x.aliases.includes(id));if(!c)return;
 opener=trigger;modalPlayer?.dispose();modalPlayer=undefined;overview.pause();
 $('#dialog-title').textContent=c.title;$('#dialog-domain').textContent=`${domainLabels[c.domain]} / ${evidenceStudy?'Physical verification':'Task comparison'}`;
 dialog.dataset.view=evidenceStudy?'physical':'comparison';
 if(evidenceStudy){
  $('#dialog-content').innerHTML=renderPhysicalEvidence(evidenceStudy);
 }else{
  $('#dialog-content').innerHTML='<div id="detail-player"></div>';
  modalPlayer=new SyncPlayer($('#detail-player'),c,results);
 }
 dialog.showModal();document.body.classList.add('modal-open');$('#dialog-content').scrollTop=0;
 if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)modalPlayer?.start();
}
function cleanupDialog(){modalPlayer?.dispose();modalPlayer=undefined;document.body.classList.remove('modal-open');opener?.focus({preventScroll:true});overview.refresh();}
$('#close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',cleanupDialog);
dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();dialog.close();}});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-case],[data-evidence-case]');if(b)openCase(b.dataset.evidenceCase??b.dataset.case!,b);});
$('#failure-list').innerHTML=home.failures.map(c=>`<button data-evidence-case="${c.id}"><div><h3>${esc(c.title)}</h3><p><span class="model-identity">${modelIcon(c.models[0].name)}${esc(c.models[0].name)}</span> · Object = Event = 1</p></div><span aria-hidden="true">↗</span></button>`).join('');
$('#copy-citation').addEventListener('click',async()=>{
 try {await navigator.clipboard.writeText(content.bibtex);$('#copy-citation .copy-label').textContent='Copied ✓';$('#copy-status').textContent='BibTeX copied to clipboard.';}
 catch {$('#copy-status').classList.remove('sr-only');$('#copy-status').textContent='Clipboard unavailable. Select and copy the BibTeX below.';}
});
async function loadCatalog(){
 if(catalogRequest)return;
 const controller=new AbortController();catalogRequest=controller;catalogState='loading';
 $('#catalog-status').textContent='';$('#retry-catalog').hidden=true;renderGallery();
 const timer=window.setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch(assetUrl('data/cases.json'),{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw new Error(`Task catalog: HTTP ${response.status}`);
  tasks=groupTasks(await response.json() as CaseStudy[]);catalogState='ready';
 }catch(error){
  catalogState='error';$('#catalog-status').textContent='The task catalog could not load. Please try again.';
  $('#retry-catalog').hidden=false;console.error(error);
 }finally{clearTimeout(timer);catalogRequest=undefined;renderGallery();}
}
$('#retry-catalog').addEventListener('click',()=>void loadCatalog());
void loadCatalog();
