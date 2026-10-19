export function setupOverview(video:HTMLVideoElement, canPlay:()=>boolean, onPlay:()=>void) {
  const status=document.querySelector<HTMLElement>('#overview-status')!;
  const retry=document.querySelector<HTMLButtonElement>('#retry-overview')!;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible=false;
  let manuallyPaused=false;
  let automaticPause=false;
  video.muted=true;

  function pause(){
    if(!video.paused){automaticPause=true;video.pause();}
  }
  function refresh(){
    if(!visible||document.hidden||!canPlay()){pause();return;}
    if(motion.matches||manuallyPaused||video.error)return;
    void video.play().catch(()=>{status.textContent='Select Play to start the overview video.';});
  }
  video.addEventListener('play',()=>{manuallyPaused=false;status.textContent='';onPlay();});
  video.addEventListener('pause',()=>{
    if(automaticPause)automaticPause=false;
    else manuallyPaused=true;
  });
  video.addEventListener('loadeddata',()=>{retry.hidden=true;});
  video.addEventListener('error',()=>{
    status.textContent='The overview video could not load. Retry or open the video directly.';
    retry.hidden=false;
  });
  retry.addEventListener('click',()=>{
    manuallyPaused=false;video.load();
    void video.play().catch(()=>{status.textContent='Select Play to start the overview video.';});
  });
  new IntersectionObserver(entries=>{
    visible=entries[0].isIntersecting&&entries[0].intersectionRatio>=.25;
    refresh();
  },{threshold:[0,.25]}).observe(video);
  document.addEventListener('visibilitychange',refresh);
  motion.addEventListener('change',()=>{if(motion.matches)pause();else refresh();});
  return {pause,refresh};
}
