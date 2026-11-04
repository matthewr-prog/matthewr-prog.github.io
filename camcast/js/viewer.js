
// Digital pan & zoom (CSS transform on a wrapper; works for img/video/iframe)
const Zoom=(()=>{const $=id=>document.getElementById(id);let s=1,x=0,y=0,mode=false,type='image',ptrs=new Map(),last=null,lastTap=0;const MAX=5;
function mount(){const st=$('vStage');st.innerHTML='<div id="vZoom"></div><div id="vGest"></div>';
 let zc=$('vZC');if(!zc){st.insertAdjacentHTML('afterend','<div id="vZC"><button data-z="in" title="Zoom in">➕</button><button data-z="out" title="Zoom out">➖</button><button data-z="u">⬆️</button><button data-z="d">⬇️</button><button data-z="l">⬅️</button><button data-z="r">➡️</button><button data-z="reset">Reset</button><button data-z="mode" id="vZMode" title="Pan/Zoom mode">✋ Pan/Zoom</button></div>')}
 s=1;x=y=0;mode=false;ptrs.clear();bind();apply()}
function setType(t){type=t;const zc=$('vZC');if(zc)zc.hidden=(t==='link');apply()}
function clamp(){const st=$('vStage'),w=st.clientWidth,h=st.clientHeight;const mx=w*(s-1)/2,my=h*(s-1)/2;x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y))}
function apply(){const z=$('vZoom'),g=$('vGest');if(!z)return;s=Math.max(1,Math.min(MAX,s));if(s===1){x=y=0}clamp();z.style.transform=`translate(${x}px,${y}px) scale(${s})`;
 // overlay catches gestures: always for still images; for video/iframe only when zoomed or mode on, so normal taps reach player controls
 const on=type==='image-refresh'||type==='image'||s>1.001||mode;g.style.pointerEvents=on?'auto':'none';g.dataset.on=on?'1':'0';$('vStage').dataset.zoom=s.toFixed(2);const m=$('vZMode');if(m)m.classList.toggle('on',mode)}
function zoomAt(f,cx,cy){const st=$('vStage').getBoundingClientRect();const px=(cx??st.left+st.width/2)-st.left-st.width/2,py=(cy??st.top+st.height/2)-st.top-st.height/2;const ns=Math.max(1,Math.min(MAX,s*f));const k=ns/s;x=px-(px-x)*k;y=py-(py-y)*k;s=ns;apply()}
function reset(){s=1;x=y=0;apply()}
function bind(){const g=$('vGest');const st=$('vStage');
 $('vZC').onclick=e=>{const b=e.target.closest('button');if(!b)return;e.stopPropagation();const d=$('vStage').clientWidth*0.15;({in:()=>zoomAt(1.5),out:()=>zoomAt(1/1.5),u:()=>{y+=d;apply()},d:()=>{y-=d;apply()},l:()=>{x+=d;apply()},r:()=>{x-=d;apply()},reset,mode:()=>{mode=!mode;apply()}})[b.dataset.z]()};
 st.addEventListener('wheel',e=>{if(type==='link')return;e.preventDefault();zoomAt(e.deltaY<0?1.2:1/1.2,e.clientX,e.clientY)},{passive:false});
 g.onpointerdown=e=>{g.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:Date.now(),multi:ptrs.size>0});last=null;if(ptrs.size>1)ptrs.forEach(q=>q.multi=true)};
 g.onpointermove=e=>{if(!ptrs.has(e.pointerId))return;const p=ptrs.get(e.pointerId);const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(ptrs.size>=2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(last)zoomAt(d/last,(a.x+b.x)/2,(a.y+b.y)/2);last=d}
  else if(s>1){x+=dx;y+=dy;apply()}};
 g.onpointerup=g.onpointercancel=e=>{const q=ptrs.get(e.pointerId);ptrs.delete(e.pointerId);last=null;try{g.releasePointerCapture(e.pointerId)}catch(_){}
  if(e.type==='pointerup'&&q&&!q.multi&&Math.hypot(e.clientX-q.sx,e.clientY-q.sy)<10&&Date.now()-q.t<250){const t=Date.now();if(t-lastTap<350){reset();lastTap=0}else lastTap=t}};
 g.ondblclick=e=>{e.preventDefault();reset()}}
return{mount,setType,reset,zoomAt,state:()=>({s,x,y,mode})}})();
// Angle groups: cams within ~300 m that share a meaningful name token
const Angles=(()=>{const $=id=>document.getElementById(id);let groups=new Map();
const STOP=new Set('live cam cams camera webcam view views from the and with 24/7 hd 4k stream streaming new now near east west north south street st ave road rd at on of in to de la le du der die webcamera road highway hwy bypass tunnel flyover interchange along looking bound overbridge appr weather beach city tour walking travel surveillancemap earthcam nest public cctv 🔴live 🔴 ✈️ - | • · @'.split(' '));
const tok=n=>new Set(n.toLowerCase().replace(/[()\[\],.:!|•·–—"'/]/g,' ').split(/\s+/).filter(w=>w.length>=3&&!STOP.has(w)&&!/^\d+$/.test(w)));
function km(a,b){const R=6371,r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function build(all){const par=all.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));const T=all.map(c=>tok(c.name));
 const idx=all.map((c,i)=>i).filter(i=>all[i].streamType!=='link'||true).sort((a,b)=>all[a].lat-all[b].lat);
 for(let a=0;a<idx.length;a++)for(let b=a+1;b<idx.length;b++){const A=all[idx[a]],B=all[idx[b]];if(B.lat-A.lat>0.01)break;const d=km(A,B);if(d>1)continue;const sh=[...T[idx[a]]].filter(w=>T[idx[b]].has(w)).length;
  if(A.group&&A.group===B.group||(d<0.03&&A.category===B.category&&A.category!=='Traffic')||(d<=0.3&&sh>=1)||(sh>=2&&d<=0.6&&A.category!=='Traffic'))par[f(idx[a])]=f(idx[b])}
 const m=new Map();all.forEach((c,i)=>{const r=f(i);if(!m.has(r))m.set(r,[]);m.get(r).push(c)});groups=new Map();let n=0;
 m.forEach(arr=>{if(arr.length<2)return;n++;const g=arr[0].group||('g'+n);arr.forEach(c=>{c.group=g;groups.set(c.id,arr)})});window.CAM_GROUPS=n;return n}
function show(c){let el=$('vAngles');if(!el){el=document.createElement('div');el.id='vAngles';$('vStage').before(el)}const arr=groups.get(c.id);
 if(!arr){el.hidden=true;el.innerHTML='';return}el.hidden=false;el.innerHTML='<span class="muted">Angles:</span>';
 arr.forEach((o,i)=>{const b=document.createElement('button');b.textContent=i+1;b.title=o.name;if(o.id===c.id)b.className='on';b.onclick=()=>Viewer.open(o);el.append(b)})}
function next(c,bad){const arr=groups.get(c.id);if(!arr)return null;const i=arr.findIndex(o=>o.id===c.id);for(let k=1;k<arr.length;k++){const o=arr[(i+k)%arr.length];if(!(o.youtubeId&&bad.includes(o.youtubeId)))return o}return null}
return{build,show,next}})();
// Viewer: hls | iframe | image-refresh | youtube, plus snapshot playback
const Viewer=(()=>{let hls,timer,ptimer;const $=id=>document.getElementById(id);
function stop(){if(hls){hls.destroy();hls=null}clearInterval(timer);clearInterval(ptimer);Zoom.mount();$('vPlay').innerHTML=''}
function bust(u){return u+(u.includes('?')?'&':'?')+'t='+Date.now()}
function liveImg(u,sec=(30)){const im=new Image();im.src=bust(u);im.alt='live';$('vZoom').appendChild(im);timer=setInterval(()=>im.src=bust(u),sec*1000);return im}
const BAD_KEY='camcast_badyt';function badYT(){return _bad}
const _bad=[];function markBad(id){if(!_bad.includes(id))_bad.push(id)}
function ytURL(c,nocookie){const id=c.youtubeId||(c.streamUrl.match(/embed\/([^?]+)/)||[])[1];const o=location.origin.startsWith('http')?'&origin='+encodeURIComponent(location.origin)+'&widget_referrer='+encodeURIComponent(location.href.split('#')[0]):'';
 return 'https://www.youtube'+(nocookie?'-nocookie':'')+'.com/embed/'+id+'?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1'+o}
function ytFail(c,code){if(!c._retried&&[150,151,152,153].includes(+code)){c._retried=true;open(c,true);return}c._retried=false;
 markBad(c.youtubeId);const nxt=Angles.next(c,badYT());if(nxt){open(nxt);const m=document.getElementById('vMeta');if(m)m.textContent='↪ Switched angle (previous cam blocks playback here) · '+m.textContent;return}
 ytFailMsg(c,code)}
function ytFailMsg(c,code){const st=$('vZoom');st.innerHTML='';const m=document.createElement('div');m.style.cssText='padding:20px;text-align:center;color:#c9d1d9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px';m.innerHTML='<b style="font-size:17px">Owner blocks playback in other apps</b><span>This stream can only be watched on YouTube (error '+code+'). CamCast will hide it on this device next time.</span>';const a=document.createElement('a');a.href=c.openUrl;a.target='_blank';a.rel='noopener';a.textContent=c.openLabel||(c.streamType==='youtube'?'▶ Open in YouTube':'↗ Open site');a.style.cssText='background:#f85149;color:#fff;padding:16px 28px;font-size:18px;border-radius:8px;text-decoration:none;font-weight:700';m.append(a);st.append(m)}
function open(c,alt){stop();Zoom.setType(c.streamType);Angles.show(c);$('vName').textContent=c.name;$('vMeta').textContent=(c.live?'🔴 LIVE VIDEO · ':'📷 Snapshot · ')+c.category+' · '+c.region;$('vAttr').textContent='Source: '+c.attribution;
 const st=$('vZoom');
 if(c.streamType==='hls'){const v=document.createElement('video');v.controls=v.muted=v.autoplay=v.playsInline=true;st.appendChild(v);
  if(v.canPlayType('application/vnd.apple.mpegurl'))v.src=c.streamUrl;
  else if(window.Hls&&Hls.isSupported()){hls=new Hls({lowLatencyMode:true});hls.loadSource(c.streamUrl);hls.attachMedia(v);
   hls.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal&&c.snapshotUrl){stop();st.innerHTML='';liveImg(c.snapshotUrl);addPlay(c,'Video unavailable, showing snapshots.')}})}
  v.play().catch(()=>{})}
 else if(c.streamType==='iframe'||c.streamType==='youtube'){const yt=c.streamType==='youtube';const f=document.createElement('iframe');
  f.referrerPolicy='strict-origin-when-cross-origin';f.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';f.allowFullscreen=true;
  if(yt){f.id='ytf'+Date.now();f.src=ytURL(c,alt)}else f.src=c.streamUrl;st.appendChild(f);
  if(yt){const hook=()=>{try{new YT.Player(f.id,{events:{onError:e=>ytFail(c,e.data)}})}catch(_){}};if(window.YT&&YT.Player)hook();else{const prev=window.onYouTubeIframeAPIReady;window.onYouTubeIframeAPIReady=()=>{prev&&prev();hook()}}}}
 else if(c.streamType==='link'){st.innerHTML='<div class="muted" style="padding:24px;text-align:center">This cam is only viewable on the owner\'s site. Tap the button below to open it.</div>'}
 else liveImg(c.streamUrl,c.category==='Satellite'?300:30);
 addPlay(c);if(c.openUrl){const a=document.createElement('a');a.href=c.openUrl;a.target='_blank';a.rel='noopener';a.textContent=c.openLabel||(c.streamType==='youtube'?'▶ Open in YouTube':'↗ Open site');$('vPlay').append(a)}$('viewer').hidden=false}
function addPlay(c,msg){const p=$('vPlay');p.innerHTML='';
 if(c.archiveFrames&&c.archiveFrames.length){const fr=c.archiveFrames;const b=document.createElement('button');b.textContent='⏪ Playback';p.append(b);
  const n=document.createElement('span');n.className='muted';n.textContent=(msg?msg+' ':'')+(c.playbackNote||'');p.append(n);
  b.onclick=()=>{stop();const st=$('vZoom');Zoom.setType('image');const im=new Image();st.appendChild(im);p.innerHTML='';
   const r=document.createElement('input');r.type='range';r.min=0;r.max=fr.length-1;r.value=0;const lab=document.createElement('span');const pl=document.createElement('button');pl.textContent='⏸';const lv=document.createElement('button');lv.textContent='● Live';
   const show=i=>{im.src=bust(fr[i]);lab.textContent=(fr.length-i)+' frames ago';r.value=i};let i=0,run=true;show(0);
   ptimer=setInterval(()=>{if(run){i=(i+1)%fr.length;show(i)}},900);r.oninput=()=>{i=+r.value;show(i)};pl.onclick=()=>{run=!run;pl.textContent=run?'⏸':'▶'};lv.onclick=()=>open(c);
   p.append(pl,r,lab,lv)}}
 else if(c.clipUrl){const b=document.createElement('button');b.textContent='⏪ Play latest clip';p.append(b);const n=document.createElement('span');n.className='muted';n.textContent=c.playbackNote||'';p.append(n);
  b.onclick=()=>{stop();const v=document.createElement('video');v.src=c.clipUrl;v.controls=v.muted=v.autoplay=v.playsInline=v.loop=true;$('vZoom').appendChild(v);const lv=document.createElement('button');lv.textContent='● Live';lv.onclick=()=>open(c);$('vPlay').append(lv)}}
 else if(c.archiveUrl){p.innerHTML='<span class="live">● LIVE</span>';const a=document.createElement('a');a.href=c.archiveUrl;a.target='_blank';a.rel='noopener';a.textContent='Loops / archive ↗';p.append(a)}
 else p.innerHTML=c.streamType==='link'?'<span class="muted">🔗 Viewable on the owner\'s site</span>':c.live?'<span class="live">● LIVE VIDEO</span>':'<span class="muted">📷 Live snapshot (auto-refresh)</span>'}
document.addEventListener('DOMContentLoaded',()=>{$('vClose').onclick=()=>{stop();$('viewer').hidden=true};$('viewer').onclick=e=>{if(e.target.id==='viewer')$('vClose').click()}});
return{open:c=>open(c),stop,badYT,setCams:a=>Angles.build(a)}})();
