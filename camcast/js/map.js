const CamMap=(()=>{let map,cluster;const icons={Traffic:'🚗',Weather:'🌨️',City:'🏙️',Airport:'✈️',Satellite:'🛰️'};
function init(){map=L.map('map',{worldCopyJump:true}).setView([37.5,-119],6);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
 cluster=L.markerClusterGroup({showCoverageOnHover:false});map.addLayer(cluster)}
function render(cams){cluster.clearLayers();cams.forEach(c=>{const m=L.marker([c.lat,c.lon],{icon:L.divIcon({className:'',html:'<div style="font-size:22px">'+(icons[c.category]||'📷')+'</div>',iconSize:[26,26]}),title:c.name});
 m.on('click',()=>Viewer.open(c));cluster.addLayer(m)})}
function fix(){map&&map.invalidateSize()}return{init,render,fix,icons}})();
