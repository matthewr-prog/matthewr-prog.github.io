// Viewer: hls | iframe | image-refresh | youtube, plus snapshot playback
const Viewer=(()=>{let hls,timer,ptimer;const $=id=>document.getElementById(id);
function stop(){if(hls){hls.destroy();hls=null}clearInterval(timer);clearInterval(ptimer);$('vStage').innerHTML='';$('vPlay').innerHTML=''}
function bust(u){return u+(u.includes('?')?'&':'?')+'t='+Date.now()}
function liveImg(u,sec=(30)){const im=new Image();im.src=bust(u);im.alt='live';$('vStage').appendChild(im);timer=setInterval(()=>im.src=bust(u),sec*1000);return im}
function ytFail(c,code){const st=$('vStage');st.innerHTML='';const m=document.createElement('div');m.style.cssText='padding:20px;text-align:center;color:#c9d1d9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';m.textContent='This live stream can\'t play inside CamCast right now (YouTube error '+code+'). It may have ended or the owner limits embedding.';const a=document.createElement('a');a.href=c.openUrl;a.target='_blank';a.rel='noopener';a.textContent=c.openLabel||(c.streamType==='youtube'?'▶ Open in YouTube':'↗ Open site');a.style.cssText='background:#f85149;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700';m.append(a);st.append(m)}
function open(c){stop();$('vName').textContent=c.name;$('vMeta').textContent=(c.live?'🔴 LIVE VIDEO · ':'📷 Snapshot · ')+c.category+' · '+c.region;$('vAttr').textContent='Source: '+c.attribution;
 const st=$('vStage');
 if(c.streamType==='hls'){const v=document.createElement('video');v.controls=v.muted=v.autoplay=v.playsInline=true;st.appendChild(v);
  if(v.canPlayType('application/vnd.apple.mpegurl'))v.src=c.streamUrl;
  else if(window.Hls&&Hls.isSupported()){hls=new Hls({lowLatencyMode:true});hls.loadSource(c.streamUrl);hls.attachMedia(v);
   hls.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal&&c.snapshotUrl){stop();st.innerHTML='';liveImg(c.snapshotUrl);addPlay(c,'Video unavailable, showing snapshots.')}})}
  v.play().catch(()=>{})}
 else if(c.streamType==='iframe'||c.streamType==='youtube'){const yt=c.streamType==='youtube';const f=document.createElement('iframe');
  f.referrerPolicy='strict-origin-when-cross-origin';f.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';f.allowFullscreen=true;
  if(yt){f.id='ytf'+Date.now();f.src=c.streamUrl+(location.origin.startsWith('http')?'&origin='+encodeURIComponent(location.origin):'')}else f.src=c.streamUrl;st.appendChild(f);
  if(yt){const hook=()=>{try{new YT.Player(f.id,{events:{onError:e=>ytFail(c,e.data)}})}catch(_){}};if(window.YT&&YT.Player)hook();else{const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{prev&&prev();hook()}}}}
 else if(c.streamType==='link'){st.innerHTML='<div class="muted" style="padding:24px;text-align:center">This cam is only viewable on the owner\'s site. Tap the button below to open it.</div>'}
 else liveImg(c.streamUrl,c.category==='Satellite'?300:30);
 addPlay(c);if(c.openUrl){const a=document.createElement('a');a.href=c.openUrl;a.target='_blank';a.rel='noopener';a.textContent=c.openLabel||(c.streamType==='youtube'?'▶ Open in YouTube':'↗ Open site');$('vPlay').append(a)}$('viewer').hidden=false}
function addPlay(c,msg){const p=$('vPlay');p.innerHTML='';
 if(c.archiveFrames&&c.archiveFrames.length){const fr=c.archiveFrames;const b=document.createElement('button');b.textContent='⏪ Playback';p.append(b);
  const n=document.createElement('span');n.className='muted';n.textContent=(msg?msg+' ':'')+(c.playbackNote||'');p.append(n);
  b.onclick=()=>{stop();const st=$('vStage');const im=new Image();st.appendChild(im);p.innerHTML='';
   const r=document.createElement('input');r.type='range';r.min=0;r.max=fr.length-1;r.value=0;const lab=document.createElement('span');const pl=document.createElement('button');pl.textContent='⏸';const lv=document.createElement('button');lv.textContent='● Live';
   const show=i=>{im.src=bust(fr[i]);lab.textContent=(fr.length-i)+' frames ago';r.value=i};let i=0,run=true;show(0);
   ptimer=setInterval(()=>{if(run){i=(i+1)%fr.length;show(i)}},900);r.oninput=()=>{i=+r.value;show(i)};pl.onclick=()=>{run=!run;pl.textContent=run?'⏸':'▶'};lv.onclick=()=>open(c);
   p.append(pl,r,lab,lv)}}
 else if(c.clipUrl){const b=document.createElement('button');b.textContent='⏪ Play latest clip';p.append(b);const n=document.createElement('span');n.className='muted';n.textContent=c.playbackNote||'';p.append(n);
  b.onclick=()=>{stop();const v=document.createElement('video');v.src=c.clipUrl;v.controls=v.muted=v.autoplay=v.playsInline=v.loop=true;$('vStage').appendChild(v);const lv=document.createElement('button');lv.textContent='● Live';lv.onclick=()=>open(c);$('vPlay').append(lv)}}
 else if(c.archiveUrl){p.innerHTML='<span class="live">● LIVE</span>';const a=document.createElement('a');a.href=c.archiveUrl;a.target='_blank';a.rel='noopener';a.textContent='Loops / archive ↗';p.append(a)}
 else p.innerHTML=c.streamType==='link'?'<span class="muted">🔗 Viewable on the owner\'s site</span>':c.live?'<span class="live">● LIVE VIDEO</span>':'<span class="muted">📷 Live snapshot (auto-refresh)</span>'}
document.addEventListener('DOMContentLoaded',()=>{$('vClose').onclick=()=>{stop();$('viewer').hidden=true};$('viewer').onclick=e=>{if(e.target.id==='viewer')$('vClose').click()}});
return{open,stop}})();
