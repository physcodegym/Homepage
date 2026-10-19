export function setupOverview(video:HTMLVideoElement, canPlay:()=>boolean, onPlay:()=>void) {
  const status=document.querySelector<HTMLElement>('#overview-status')!;
  const retry=document.querySelector<HTMLButtonElement>('#retry-overview')!;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible=false;
  let manuallyPaused=false;
  let automaticPause=false;
  let autoplayBlocked=false;
  video.muted=true;

  function pause(){
    if(!video.paused){automaticPause=true;video.pause();}
  }
  function refresh(){
    const rect=video.getBoundingClientRect();
    const visibleHeight=Math.max(0,Math.min(window.innerHeight,rect.bottom)-Math.max(0,rect.top));
    visible=rect.height>0&&visibleHeight/rect.height>=.25;
    if(!visible||document.hidden||!canPlay()){pause();return;}
    if(motion.matches||manuallyPaused||autoplayBlocked||video.error||!video.paused)return;
    void video.play().catch(error=>{
      if(error?.name==='AbortError')return;
      autoplayBlocked=true;status.textContent='Select Play to start the overview video.';
    });
  }
  video.addEventListener('play',()=>{manuallyPaused=false;autoplayBlocked=false;status.textContent='';onPlay();});
  video.addEventListener('pause',()=>{
    if(automaticPause)automaticPause=false;
    else if(visible&&!document.hidden&&canPlay())manuallyPaused=true;
  });
  video.addEventListener('loadeddata',()=>{retry.hidden=true;refresh();});
  video.addEventListener('error',()=>{
    status.textContent='The overview video could not load. Retry or open the video directly.';
    retry.hidden=false;
  });
  retry.addEventListener('click',()=>{
    manuallyPaused=false;video.load();
    void video.play().catch(()=>{status.textContent='Select Play to start the overview video.';});
  });
  new IntersectionObserver(refresh,{threshold:[0,.25]}).observe(video);
  window.addEventListener('scroll',refresh,{passive:true});
  window.addEventListener('resize',refresh);
  document.addEventListener('visibilitychange',refresh);
  motion.addEventListener('change',()=>{if(motion.matches)pause();else refresh();});
  return {pause,refresh};
}
