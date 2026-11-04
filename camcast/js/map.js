const CamMap=(()=>{let map,cluster;const icons={Traffic:'🚗',Weather:'🌨️',City:'🏙️',Airport:'✈️',Satellite:'🛰️'};
function init(){map=L.map('map',{worldCopyJump:true}).setView([35,-45],2);
 const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 let fails=0;osm.on('tileerror',()=>{if(++fails===3){map.removeLayer(osm);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors'}).addTo(map)}});
 cluster=L.markerClusterGroup({showCoverageOnHover:false,chunkedLoading:true,removeOutsideVisibleBounds:true,maxClusterRadius:60,disableClusteringAtZoom:15});map.addLayer(cluster)}
function render(cams){cluster.clearLayers();const ms=[];cams.forEach(c=>{const m=L.marker([c.lat,c.lon],{icon:L.divIcon({className:'',html:'<div class="pin'+(c.live?' lv':'')+'">'+(c.live?'🎥':(icons[c.category]||'📷'))+(c.live?'<i>LIVE</i>':'')+'</div>',iconSize:[30,30]}),title:(c.live?'[LIVE VIDEO] ':'[Snapshot] ')+c.name});
 m.on('click',()=>Viewer.open(c));ms.push(m)});cluster.addLayers(ms)}
function fly(lat,lon,z){map.flyTo([lat,lon],z||11)}
function me(lat,lon){L.circleMarker([lat,lon],{radius:8,color:'#58a6ff',fillOpacity:.8}).addTo(map)}
function fix(){map&&map.invalidateSize()}return{init,render,fix,icons,fly,me}})();
