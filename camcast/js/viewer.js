// Viewer: hls | iframe | image-refresh | youtube, plus snapshot playback
const Viewer=(()=>{let hls,timer,ptimer;const $=id=>document.getElementById(id);
function stop(){if(hls){hls.destroy();hls=null}clearInterval(timer);clearInterval(ptimer);$('vStage').innerHTML='';$('vPlay').innerHTML=''}
function bust(u){return u+(u.includes('?')?'&':'?')+'t='+Date.now()}
function liveImg(u,sec=(30)){const im=new Image();im.src=bust(u);im.alt='live';$('vStage').appendChild(im);timer=setInterval(()=>im.src=bust(u),sec*1000);return im}
function open(c){stop();$('vName').textContent=c.name;$('vMeta').textContent=c.category+' · '+c.region;$('vAttr').textContent='Source: '+c.attribution;
 const st=$('vStage');
 if(c.streamType==='hls'){const v=document.createElement('video');v.controls=v.muted=v.autoplay=v.playsInline=true;st.appendChild(v);
  if(v.canPlayType('application/vnd.apple.mpegurl'))v.src=c.streamUrl;
  else if(window.Hls&&Hls.isSupported()){hls=new Hls({lowLatencyMode:true});hls.loadSource(c.streamUrl);hls.attachMedia(v);
   hls.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal&&c.snapshotUrl){stop();st.innerHTML='';liveImg(c.snapshotUrl);addPlay(c,'Video unavailable, showing snapshots.')}})}
  v.play().catch(()=>{})}
 else if(c.streamType==='iframe'||c.streamType==='youtube'){const f=document.createElement('iframe');f.src=c.streamUrl+(c.streamType==='youtube'?'&autoplay=1&mute=1':'');f.allow='autoplay; fullscreen; encrypted-media';f.allowFullscreen=true;st.appendChild(f)}
 else liveImg(c.streamUrl,c.category==='Satellite'?300:30);
 addPlay(c);$('viewer').hidden=false}
function addPlay(c,msg){const p=$('vPlay');p.innerHTML='';
 if(c.archiveFrames&&c.archiveFrames.length){const fr=c.archiveFrames;const b=document.createElement('button');b.textContent='⏪ Playback';p.append(b);
  const n=document.createElement('span');n.className='muted';n.textContent=(msg?msg+' ':'')+(c.playbackNote||'');p.append(n);
  b.onclick=()=>{stop();const st=$('vStage');const im=new Image();st.appendChild(im);p.innerHTML='';
   const r=document.createElement('input');r.type='range';r.min=0;r.max=fr.length-1;r.value=0;const lab=document.createElement('span');const pl=document.createElement('button');pl.textContent='⏸';const lv=document.createElement('button');lv.textContent='● Live';
   const show=i=>{im.src=bust(fr[i]);lab.textContent=(fr.length-i)+' frames ago';r.value=i};let i=0,run=true;show(0);
   ptimer=setInterval(()=>{if(run){i=(i+1)%fr.length;show(i)}},900);r.oninput=()=>{i=+r.value;show(i)};pl.onclick=()=>{run=!run;pl.textContent=run?'⏸':'▶'};lv.onclick=()=>open(c);
   p.append(pl,r,lab,lv)}}
 else if(c.archiveUrl){p.innerHTML='<span class="live">● LIVE</span>';const a=document.createElement('a');a.href=c.archiveUrl;a.target='_blank';a.rel='noopener';a.textContent='Loops / archive ↗';p.append(a)}
 else p.innerHTML='<span class="live">● LIVE</span> <span class="muted">Live only</span>'}
document.addEventListener('DOMContentLoaded',()=>{$('vClose').onclick=()=>{stop();$('viewer').hidden=true};$('viewer').onclick=e=>{if(e.target.id==='viewer')$('vClose').click()}});
return{open,stop}})();
