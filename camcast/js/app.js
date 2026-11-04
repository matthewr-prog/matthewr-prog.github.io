(async()=>{const $=id=>document.getElementById(id);const CATS=['All','Traffic','Weather','City','Airport','Satellite'];let cat='All',all=[];
 all=await (await fetch('data/cameras.json')).json();CamMap.init();
 $('cats').innerHTML=CATS.map(c=>`<button data-c="${c}" class="${c===cat?'on':''}">${c==='All'?'All':CamMap.icons[c]+' '+c}</button>`).join('');
 $('cats').onclick=e=>{const b=e.target.closest('button');if(!b)return;cat=b.dataset.c;[...$('cats').children].forEach(x=>x.classList.toggle('on',x===b));apply()};
 $('q').oninput=apply;
 function apply(){const q=$('q').value.trim().toLowerCase();const f=all.filter(c=>(cat==='All'||c.category===cat)&&(!q||[c.name,c.region,c.category,...(c.tags||[])].join(' ').toLowerCase().includes(q)));
  $('count').textContent=f.length+' / '+all.length+' cams';CamMap.render(f);
  const g=$('grid');g.innerHTML='';f.forEach(c=>{const d=document.createElement('div');d.className='card';const im=document.createElement('img');im.loading='lazy';im.alt='';
   const th=c.snapshotUrl||(c.streamType==='image-refresh'?c.streamUrl:'');if(th)im.src=th;else im.src='icons/icon.svg';
   const t=document.createElement('div');t.className='t';t.textContent=c.name;const b=document.createElement('div');b.className='badge';b.textContent=c.category+' · '+c.streamType;t.append(document.createElement('br'),b);
   d.append(im,t);d.onclick=()=>Viewer.open(c);g.append(d)})}
 apply();
 $('tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===b.dataset.v));[...$('tabs').children].forEach(x=>x.classList.toggle('on',x===b));CamMap.fix()};
 if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>document.addEventListener('visibilitychange',()=>r.update()));
})();
