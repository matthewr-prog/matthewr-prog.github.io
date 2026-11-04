(async()=>{const $=id=>document.getElementById(id);const CATS=['All','Live','Erie','Traffic','Weather','City','Airport','Park','Harbor','Polar','Satellite'];let cat='All',all=[],limit=120;
 all=await (await fetch('data/cameras.json')).json();try{localStorage.removeItem('camcast_badyt')}catch(_){}CamMap.init();Viewer.setCams(all);
 $('cats').innerHTML=CATS.map(c=>`<button data-c="${c}" class="${c===cat?'on':''}">${c==='All'?'All':c==='Live'?'🔴 Live video':c==='Erie'?'📍 Erie area':CamMap.icons[c]+' '+c}</button>`).join('');
 $('cats').onclick=e=>{const b=e.target.closest('button');if(!b)return;cat=b.dataset.c;[...$('cats').children].forEach(x=>x.classList.toggle('on',x===b));limit=120;apply();if(cat==='Erie')CamMap.fly(42.02,-80.05,9)};
 $('q').oninput=()=>{limit=120;apply()};
 [...new Set(all.map(c=>c.country))].sort().forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=k+' ('+all.filter(c=>c.country===k).length+')';$('country').append(o)});
 $('country').onchange=()=>{limit=120;apply();const f=cur();if(f.length&&$('country').value){const la=f.map(c=>c.lat),lo=f.map(c=>c.lon);CamMap.fly((Math.min(...la)+Math.max(...la))/2,(Math.min(...lo)+Math.max(...lo))/2,$('country').value==='Global'?2:6)}};
 const hav=(a,b,c,d)=>{const r=Math.PI/180,x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 12742*Math.asin(Math.sqrt(x))};
 $('near').onclick=()=>{if(!navigator.geolocation)return alert('Location not available');$('near').textContent='📍 Locating…';
  navigator.geolocation.getCurrentPosition(p=>{const{latitude:la,longitude:lo}=p.coords;$('near').textContent='📍 Near me';CamMap.me(la,lo);
   const n=all.filter(c=>c.category!=='Satellite').map(c=>[hav(la,lo,c.lat,c.lon),c]).sort((a,b)=>a[0]-b[0]).slice(0,10);
   $('nearList').innerHTML='';n.forEach(([d,c])=>{const b=document.createElement('button');b.textContent=c.name.slice(0,28)+' · '+(d<10?d.toFixed(1):Math.round(d))+' km';b.onclick=()=>{CamMap.fly(c.lat,c.lon,14);Viewer.open(c)};$('nearList').append(b)});
   CamMap.fly(la,lo,n.length&&n[0][0]<100?10:5)},e=>{$('near').textContent='📍 Near me';alert('Could not get location: '+e.message)},{enableHighAccuracy:false,timeout:15000})};
 function cur(){const q=$('q').value.trim().toLowerCase(),co=$('country').value;return all.filter(c=>(cat==='All'||(cat==='Live'?c.live:cat==='Erie'?!!c.county:cat==='Polar'?(c.lat>=66.56||c.lat<=-60):c.category===cat))&&(!co||c.country===co)&&(!q||[c.name,c.region,c.county||'',c.country||'',c.category,...(c.tags||[])].join(' ').toLowerCase().includes(q)))}
 function apply(){const f=cur();
  $('count').textContent=f.length+' / '+all.length+' cams';CamMap.render(f);
  const g=$('grid');g.innerHTML='';f.slice(0,limit).forEach(c=>{const d=document.createElement('div');d.className='card'+(c.live?' livec':'');const im=document.createElement('img');im.loading='lazy';im.alt='';
   const th=c.snapshotUrl||(c.streamType==='image-refresh'?c.streamUrl:'');if(th)im.src=th;else im.src='icons/icon.svg';
   const t=document.createElement('div');t.className='t';t.textContent=c.name;const b=document.createElement('div');b.className='badge';b.textContent=c.category+' · '+(c.live?'video':'snapshot');if(c.live){const l=document.createElement('span');l.className='lbadge';l.textContent='● LIVE VIDEO';d.append(l)}t.append(document.createElement('br'),b);
   d.append(im,t);d.onclick=()=>Viewer.open(c);g.append(d)});
  if(f.length>limit){const m=document.createElement('button');m.id='more';m.textContent='Show more ('+(f.length-limit)+' left)';m.onclick=()=>{limit+=120;apply()};g.append(m)}}
 apply();
 $('tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===b.dataset.v));[...$('tabs').children].forEach(x=>x.classList.toggle('on',x===b));CamMap.fix()};
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>document.addEventListener('visibilitychange',()=>r.update()));
})();
