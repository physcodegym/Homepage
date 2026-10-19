import {modelIcon, harnessIcon} from './icons';

export interface ModelArtifact {
  name: string; setting: string; job: string; trial: string; sha256: string;
  video: string; videoSource?: string; videoPreviewSha256?: string; poster: string; scores: Record<string, number>; scoreNote: string;
  source?: string; differences?: string; evidence?: string; studyTitle?: string;
}
export interface CaseStudy {
  id: string; caseId: string; title: string; domain: string; kind: string;
  description: string; differences: string; source: string; reference: string;
  poster: string; models: ModelArtifact[]; evidence?: string; intervention?: boolean;
  referenceSha256?: string; referenceSource?: string; referencePreviewSha256?: string;
  unavailable?: (Configuration & {reason: string})[];
}
interface Configuration {model: string; harness: string; effort: string}
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const assetUrl = (path: string) => new URL(path, document.baseURI).href;
const metricNames: Record<string,string> = {S_SSIM:'SSIM', S_LPIPS:'1 − LPIPS', S_obj:'Object', S_vis:'S_vis', S_evt:'Event', S_mot:'Motion', S_val:'Validity'};
const normalized = (s:string) => s.toLowerCase().replace(/\s*\(historical\)/g,'').replace(/[^a-z0-9]/g,'');
export function artifactConfiguration(m:ModelArtifact): Configuration {
  const parts=m.setting.split('|').map(s=>s.trim());
  const raw=parts[1] ?? '';
  const harness=({'codex':'Codex','claudecode':'Claude Code','kimicode':'Kimi Code'} as Record<string,string>)[normalized(raw)] ?? raw;
  return {model:m.name.replace(/\s*\(historical\)$/i,''),harness,effort:parts[2] ?? 'unspecified'};
}
const configKey=(c:Configuration)=>[c.model,c.harness,c.effort].map(normalized).join('|');
export function reconstructionSlots(study:CaseStudy, roster:Configuration[]) {
  const slots:{config:Configuration; artifact?:ModelArtifact}[]=[];
  const used=new Set<ModelArtifact>();
  for(const config of roster){
    const matches=study.models.filter(m=>configKey(artifactConfiguration(m))===configKey(config));
    if(matches.length)for(const artifact of matches){slots.push({config:artifactConfiguration(artifact),artifact});used.add(artifact);}
    else slots.push({config});
  }
  for(const artifact of study.models)if(!used.has(artifact))slots.push({config:artifactConfiguration(artifact),artifact});
  return slots;
}
function artifactScores(m:ModelArtifact) {
  return `<div class="artifact-scores">${Object.entries(m.scores).map(([key,value])=>`<div><span>${metricNames[key]??escapeHtml(key)}</span><strong>${value.toFixed(3)}</strong></div>`).join('')}</div>`;
}
function artifactProvenance(m:ModelArtifact, study:CaseStudy) {
  const e=escapeHtml;
  return `<details><summary>Artifact identity and provenance <span>＋</span></summary><dl class="provenance"><dt>Task</dt><dd>${e(study.caseId)}</dd><dt>Setting</dt><dd>${e(m.setting)}</dd><dt>Job / trial</dt><dd>${e(m.job)} / ${e(m.trial)}</dd><dt>Submission SHA-256</dt><dd>${e(m.sha256)}</dd><dt>Source</dt><dd>${e(m.source??study.source)}</dd></dl></details>`;
}
function artifactDetails(m:ModelArtifact, study:CaseStudy) {
  return `<details class="artifact-details"><summary>Scores <span>＋</span></summary>${artifactScores(m)}<p class="score-note fineprint">${escapeHtml(m.scoreNote)}</p>${artifactProvenance(m,study)}</details>`;
}

function mediaFrame(path:string, poster:string, label:string, source?:string) {
  const e=escapeHtml;
  return `<div class="video-frame"><video muted playsinline preload="none" poster="${assetUrl(poster)}" data-src="${assetUrl(path)}" aria-label="${e(label)}"></video></div>
    <div class="video-actions"><span class="video-state">Ready to load</span><button class="retry-video" hidden aria-label="Retry ${e(label)}">Retry</button><a href="${assetUrl(path)}" target="_blank" rel="noopener" aria-label="Open ${e(label)}">Open video ↗</a>${source?`<a href="${assetUrl(source)}" target="_blank" rel="noopener" aria-label="Original source for ${e(label)}">Original ↗</a>`:''}</div>`;
}

type StreamState='idle'|'loading'|'ready'|'error';
interface Stream {
  video:HTMLVideoElement; card:HTMLElement; label:HTMLElement; retry:HTMLButtonElement;
  state:StreamState; blocked:boolean; version:number; message:string;
  cancelLoad?:()=>void; playPending?:Promise<void>;
}
const activePlayers=new Set<SyncPlayer>();

export class SyncPlayer {
  private streams:Stream[];
  private toggle:HTMLButtonElement;
  private range:HTMLInputElement;
  private clock:HTMLElement;
  private status:HTMLElement;
  private retryAll:HTMLButtonElement;
  private abort=new AbortController();
  private frame=0;
  private wantsPlay=false;
  private duration=8;
  private position=0;
  private disposed=false;
  private finished=false;

  constructor(root:HTMLElement, study:CaseStudy, roster:Configuration[]) {
    const slots=reconstructionSlots(study,roster);
    const e=escapeHtml;
    root.innerHTML=`<div class="task-player">
      <div class="task-overview"><div class="task-overview-copy">
        <p class="dialog-description">${e(study.description)}</p>
        <p class="comparison-coverage">${study.models.length} reconstruction${study.models.length===1?'':'s'} available · ${slots.filter(s=>!s.artifact).length} without a submitted video.</p>
        <p class="comparison-hint">Videos start muted when possible. Ready videos play together; slower videos join when loaded. Use the shared controls to pause or seek.</p>
      </div><article class="reconstruction-card reference-card"><h3>Reference</h3><p class="configuration-label">Task input · 8 seconds</p>${mediaFrame(study.reference,study.poster,'Reference video',study.referenceSource)}</article></div>
      <div class="player-controls"><button class="play-button" aria-label="Play all available videos">▶ <span>Play all</span></button><button class="reset-button" aria-label="Reset all videos">↺</button><input type="range" min="0" max="8" step="0.033333" value="0" aria-label="Shared video timeline"><output aria-live="off">0.00 / 8.00 s</output><span class="sync-indicator">SYNC</span></div>
      <p class="player-status" role="status"></p><button class="button retry-videos" hidden>Retry failed videos</button>
      <div class="reconstruction-grid">${slots.map(({config,artifact:m})=>`<article class="reconstruction-card${m?'':' pending-reconstruction'}"${m?` data-artifact="${m.sha256}"`:''}>
        <h3 class="model-identity">${modelIcon(config.model)}${e(config.model)}</h3><p class="configuration-label"><span class="harness-identity">${harnessIcon(config.harness)}${e(config.harness)}</span> · ${e(config.effort)}</p>
        ${m?`${mediaFrame(m.video,m.poster,`${config.model} reconstruction — ${config.harness} — ${config.effort}`,m.videoSource)}${artifactDetails(m,study)}`:`<div class="reconstruction-placeholder" role="img" aria-label="${e(config.model)} ${e(config.harness)} reconstruction video unavailable"><span>Reconstruction</span><strong>No submitted video</strong></div>`}
      </article>`).join('')}</div></div>`;
    this.toggle=root.querySelector('.play-button')!;
    this.range=root.querySelector('input')!;
    this.clock=root.querySelector('output')!;
    this.status=root.querySelector('.player-status')!;
    this.retryAll=root.querySelector('.retry-videos')!;
    this.streams=[...root.querySelectorAll('video')].map(video=>{
      video.muted=true;
      const card=video.closest<HTMLElement>('.reconstruction-card')!;
      return {video,card,label:card.querySelector<HTMLElement>('.video-state')!,retry:card.querySelector<HTMLButtonElement>('.retry-video')!,state:'idle',blocked:false,version:0,message:''};
    });
    const opts={signal:this.abort.signal};
    this.toggle.addEventListener('click',()=>this.wantsPlay?this.pause():this.start(),opts);
    this.retryAll.addEventListener('click',()=>this.start(),opts);
    root.querySelector('.reset-button')!.addEventListener('click',()=>this.seek(0),opts);
    this.range.addEventListener('input',()=>this.seek(Number(this.range.value)),opts);
    this.range.addEventListener('change',()=>this.seek(Number(this.range.value)),opts);
    let dragging=false;
    const seekAt=(clientX:number)=>{
      const rect=this.range.getBoundingClientRect();
      if(clientX<rect.left||clientX>rect.right)return;
      const track=Math.max(1,rect.width-16);
      this.seek(Math.max(0,Math.min(1,(clientX-rect.left-8)/track))*this.duration);
    };
    this.range.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();dragging=true;this.range.focus({preventScroll:true});
      try{this.range.setPointerCapture(event.pointerId);}catch{/* Synthetic pointers may not support capture. */}
      seekAt(event.clientX);
    },opts);
    this.range.addEventListener('pointermove',event=>{if(dragging)seekAt(event.clientX);},opts);
    this.range.addEventListener('pointerup',event=>{if(dragging)seekAt(event.clientX);dragging=false;},opts);
    this.range.addEventListener('pointercancel',()=>{dragging=false;},opts);
    this.range.addEventListener('click',event=>{if(event.detail)seekAt(event.clientX);},opts);
    for(const stream of this.streams){
      stream.retry.addEventListener('click',()=>{
        this.load(stream,true);
        this.start();
      },opts);
      stream.video.addEventListener('error',()=>{
        if(stream.state!=='loading'&&stream.state!=='error'&&!this.disposed)this.fail(stream,'Video could not load.');
      },opts);
      stream.video.addEventListener('ended',()=>{
        if(this.wantsPlay&&stream.state==='ready')this.finish();
      },opts);
    }
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},opts);
    activePlayers.add(this);
  }

  start(){
    if(this.disposed)return;
    activePlayers.forEach(p=>{if(p!==this)p.pause();});
    if(this.finished||this.position>=this.duration-.06){this.position=0;this.finished=false;this.alignReady();}
    this.wantsPlay=true;
    for(const stream of this.streams){
      stream.blocked=false;
      if(stream.state==='ready')this.resume(stream);
      else this.load(stream,stream.state==='error');
    }
    this.updateStatus();this.schedule();
  }

  private load(stream:Stream, force=false){
    if(this.disposed||(!force&&(stream.state==='loading'||stream.state==='ready')))return;
    stream.cancelLoad?.();stream.version++;
    const video=stream.video;
    video.pause();video.removeAttribute('src');video.load();
    stream.state='loading';stream.blocked=false;stream.message='';this.renderStream(stream);
    let settled=false;
    const events=['loadeddata','canplay'] as const;
    const cleanup=()=>{clearTimeout(timer);events.forEach(event=>video.removeEventListener(event,done));video.removeEventListener('error',failed);stream.cancelLoad=undefined;};
    const done=()=>{
      if(settled||video.readyState<2)return;
      settled=true;cleanup();
      if(this.disposed)return;
      stream.state='ready';
      this.duration=Math.min(8,...this.streams.filter(s=>s.state==='ready').map(s=>Number.isFinite(s.video.duration)?s.video.duration:8));
      this.range.max=String(this.duration);
      this.position=Math.min(this.position,this.duration);
      if(Math.abs(video.currentTime-this.position)>.03)video.currentTime=Math.min(this.position,Math.max(0,this.duration-.001));
      this.renderStream(stream);
      if(this.wantsPlay)this.resume(stream);
      this.updateStatus();this.schedule();
    };
    const failed=()=>{
      if(settled)return;
      settled=true;cleanup();
      const message=video.error?.code===3?'This browser could not decode the video.':'Video could not load. Retry or open it directly.';
      this.fail(stream,message);
    };
    const timer=window.setTimeout(()=>{
      if(settled)return;
      settled=true;cleanup();this.fail(stream,'Video loading timed out.');
    },20000);
    stream.cancelLoad=()=>{settled=true;cleanup();};
    events.forEach(event=>video.addEventListener(event,done));video.addEventListener('error',failed,{once:true});
    video.preload='auto';video.src=video.dataset.src!;video.load();
    this.updateStatus();
  }

  private fail(stream:Stream,message:string){
    if(this.disposed)return;
    stream.cancelLoad?.();stream.version++;
    stream.state='error';stream.message=message;stream.blocked=false;
    stream.video.pause();stream.video.removeAttribute('src');stream.video.load();
    this.renderStream(stream);
    if(this.streams.every(s=>s.state==='error'))this.wantsPlay=false;
    this.updateStatus();
  }

  private resume(stream:Stream){
    if(!this.wantsPlay||this.disposed||stream.state!=='ready'||stream.blocked||stream.playPending||!stream.video.paused)return;
    const version=stream.version;
    const pending=stream.video.play().then(()=>{
      if(!this.wantsPlay||this.disposed)stream.video.pause();
    }).catch(error=>{
      if(this.disposed||!this.wantsPlay||version!==stream.version)return;
      if(error?.name==='AbortError')return;
      stream.blocked=true;stream.message='Select Play all to start.';this.renderStream(stream);
      const ready=this.streams.filter(s=>s.state==='ready');
      if(ready.every(s=>s.blocked)&&!this.streams.some(s=>s.state==='loading'))this.wantsPlay=false;
      this.updateStatus();
    }).finally(()=>{if(stream.playPending===pending)stream.playPending=undefined;});
    stream.playPending=pending;
  }

  private renderStream(stream:Stream){
    stream.card.dataset.videoState=stream.state;
    stream.label.textContent=stream.state==='loading'?'Loading…':stream.state==='error'?stream.message:stream.blocked?stream.message:stream.state==='ready'?'Loaded':'Ready to load';
    stream.retry.hidden=stream.state!=='error';
  }

  private updateStatus(){
    if(this.disposed)return;
    const ready=this.streams.filter(s=>s.state==='ready').length;
    const loading=this.streams.filter(s=>s.state==='loading').length;
    const failed=this.streams.filter(s=>s.state==='error').length;
    const blocked=this.streams.some(s=>s.blocked);
    let message=loading?`${ready} of ${this.streams.length} videos loaded. ${this.wantsPlay?'Ready videos play while the rest load.':'Playback paused.'}`:
      ready===0&&failed?'Videos could not load. Retry or use the direct video links.':
      blocked&&!this.wantsPlay?'Autoplay was blocked. Select Play all to start.':
      this.finished?'Playback finished. Select Play all to replay.':
      this.wantsPlay?`Playing ${ready} of ${this.streams.length} available videos.`:ready?'Playback paused.':'';
    if(failed&&ready)message+=` ${failed} video${failed===1?'':'s'} could not load; retry or open the direct links.`;
    if(this.status.textContent!==message)this.status.textContent=message;
    this.retryAll.hidden=failed===0;
    this.toggle.innerHTML=this.wantsPlay?'Ⅱ <span>Pause all</span>':'▶ <span>Play all</span>';
    this.toggle.setAttribute('aria-label',this.wantsPlay?'Pause all available videos':'Play all available videos');
  }

  private schedule(){cancelAnimationFrame(this.frame);if(this.wantsPlay&&!this.disposed)this.frame=requestAnimationFrame(this.tick);}
  private tick=()=>{
    if(!this.wantsPlay||this.disposed)return;
    const playing=this.streams.filter(s=>s.state==='ready'&&!s.video.paused&&s.video.readyState>=3);
    if(playing.length)this.position=Math.min(this.duration,Math.max(this.position,...playing.map(s=>s.video.currentTime)));
    for(const stream of this.streams){
      if(stream.state!=='ready')continue;
      if(!stream.video.seeking&&stream.video.readyState>=2&&Math.abs(stream.video.currentTime-this.position)>.12)stream.video.currentTime=Math.min(this.position,Math.max(0,this.duration-.001));
      this.resume(stream);
    }
    this.updateClock();
    if(this.position>=this.duration-.015){this.finish();return;}
    this.frame=requestAnimationFrame(this.tick);
  };
  private updateClock(){this.range.value=String(this.position);this.clock.textContent=`${this.position.toFixed(2)} / ${this.duration.toFixed(2)} s`;}
  private alignReady(){for(const s of this.streams)if(s.state==='ready')s.video.currentTime=Math.min(this.position,Math.max(0,this.duration-.001));this.updateClock();}
  private finish(){this.pause();this.finished=true;this.position=this.duration;this.updateClock();this.updateStatus();}
  pause(){
    this.wantsPlay=false;this.streams.forEach(s=>s.video.pause());cancelAnimationFrame(this.frame);this.updateStatus();
  }
  private seek(time:number){
    this.pause();this.finished=false;this.position=Math.max(0,Math.min(time,this.duration));this.alignReady();
    for(const s of this.streams)if(s.state==='idle')this.load(s);
    this.updateStatus();
  }
  dispose(){
    this.disposed=true;this.wantsPlay=false;cancelAnimationFrame(this.frame);this.abort.abort();
    for(const s of this.streams){s.cancelLoad?.();s.video.pause();s.video.removeAttribute('src');s.video.load();}
    activePlayers.delete(this);
  }
}
