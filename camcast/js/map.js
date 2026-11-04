const CamMap=(()=>{let map,cluster;const icons={Traffic:'🚗',Weather:'🌨️',City:'🏙️',Airport:'✈️',Satellite:'🛰️'};
function init(){map=L.map('map',{worldCopyJump:true}).setView([30,0],2);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
 cluster=L.markerClusterGroup({showCoverageOnHover:false,chunkedLoading:true,removeOutsideVisibleBounds:true,maxClusterRadius:60,disableClusteringAtZoom:15});map.addLayer(cluster)}
function render(cams){cluster.clearLayers();const ms=[];cams.forEach(c=>{const m=L.marker([c.lat,c.lon],{icon:L.divIcon({className:'',html:'<div style="font-size:22px">'+(icons[c.category]||'📷')+'</div>',iconSize:[26,26]}),title:c.name});
 m.on('click',()=>Viewer.open(c));ms.push(m)});cluster.addLayers(ms)}
function fly(lat,lon,z){map.flyTo([lat,lon],z||11)}
function me(lat,lon){L.circleMarker([lat,lon],{radius:8,color:'#58a6ff',fillOpacity:.8}).addTo(map)}
function fix(){map&&map.invalidateSize()}return{init,render,fix,icons,fly,me}})();
