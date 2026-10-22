/* Los Santos GPS v3: native-map filters, search, sea bands and anchored 3D scenery */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const cats=[['hospital','✚ Hastane'],['pharmacy','✚ Eczane'],['restaurant','🍴 Restoran'],['cafe','☕ Kafe'],['school','▤ Okul'],['culture','◈ Kültür'],['worship','☪ İbadet'],['shopping','▦ Mağaza'],['nature','♣ Doğa'],['landmark','◆ Tarihî / İkonik']];
const categoryOn=Object.fromEntries(cats.map(([id])=>[id,true]));
const categoryOf=p=>{let s=String([p.class,p.subclass,p.amenity,p.shop,p.tourism,p.historic].filter(Boolean).join(' ')).toLowerCase();if(/hospital|clinic|doctors|dentist/.test(s))return'hospital';if(/pharmacy/.test(s))return'pharmacy';if(/restaurant|fast_food|food_court/.test(s))return'restaurant';if(/cafe|coffee|pub|bar/.test(s))return'cafe';if(/school|college|university|kindergarten/.test(s))return'school';if(/library|museum|theatre|cinema|arts_centre|community_centre|culture|cultural|community|social_centre/.test(s))return'culture';if(/mosque|place_of_worship|church|temple|synagogue/.test(s))return'worship';if(/supermarket|marketplace|shop|mall|bakery|convenience/.test(s))return'shopping';if(/forest|wood|park|nature|garden/.test(s))return'nature';if(/castle|fort|monument|memorial|attraction|statue|historic/.test(s))return'landmark';return null;};
let map, lastDraw='', sceneAnchor=null, modelLayer=null, ready=false;const rendered=new Map();
const empty=()=>({type:'FeatureCollection',features:[]});
const lngLat=f=>{if(!f?.geometry)return null;const g=f.geometry; if(g.type==='Point')return g.coordinates;if(g.type==='MultiPoint')return g.coordinates[0];const ring=(g.type==='Polygon'?g.coordinates[0]:g.type==='MultiPolygon'?g.coordinates[0][0]:null);if(!ring?.length)return null;let lon=0,lat=0;for(const p of ring){lon+=p[0];lat+=p[1]}return[lon/ring.length,lat/ring.length];};
const readableName=p=>p['name:tr']||p.name||p['name:latin']||p['name:en']||'';
function featureList(sourceLayer){const layers=map.getStyle()?.layers||[];const s=layers.find(l=>l['source-layer']===sourceLayer)?.source;if(!s)return[];try{return map.querySourceFeatures(s,{sourceLayer})||[]}catch{return[]}}
function initLayers(){if(map.getSource('ls-pois'))return;
map.addSource('ls-pois',{type:'geojson',data:empty()});
map.addLayer({id:'ls-poi-points',type:'circle',source:'ls-pois',minzoom:12.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12.5,3.5,15,6,17,8], 'circle-color':['match',['get','category'],'hospital','#e85b67','pharmacy','#68d3a4','restaurant','#f39b60','cafe','#d5a46e','school','#8cb3f5','culture','#b0a0ff','worship','#d6caa3','nature','#7ab48e','shopping','#be8edc','landmark','#e1c086','#bcbec9'],'circle-stroke-color':'#1a1d23','circle-stroke-width':2,'circle-opacity':.96}});
map.addLayer({id:'ls-poi-text',type:'symbol',source:'ls-pois',minzoom:14,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],14,10,17,13],'text-offset':[0,1.8],'text-anchor':'top','text-max-width':11,'text-allow-overlap':false,'text-optional':true},paint:{'text-color':'#f4f1f4','text-halo-color':'#1a1c20','text-halo-width':1.8}});
map.on('click','ls-poi-points',e=>{const p=e.features?.[0]?.properties;if(!p)return;const o=JSON.parse(p.payload);showPOI(o);});
map.on('mouseenter','ls-poi-points',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','ls-poi-points',()=>map.getCanvas().style.cursor='');
}
function drawPOIs(){if(!map.getSource('ls-pois'))return;const z=map.getZoom();if(z<12){map.getSource('ls-pois').setData(empty());return;}
const items=featureList('poi');const bounds=map.getBounds();const seen=new Set();const features=[];
for(const item of items){if(features.length>=160)break;const p=item.properties||{};const category=categoryOf(p);if(!category||!categoryOn[category])continue;const c=lngLat(item);if(!c||!bounds.contains(c))continue;const name=readableName(p)||cats.find(a=>a[0]===category)?.[1]||'Mekân';const key=name+':'+c.map(v=>v.toFixed(4)).join(',');if(seen.has(key))continue;seen.add(key);
const tags={name,amenity:p.subclass||p.class,shop:p.subclass||p.class,tourism:p.class, historic:p.subclass};const data={lon:c[0],lat:c[1],tags};
features.push({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{name,category,payload:JSON.stringify(data)}});
}
map.getSource('ls-pois').setData({type:'FeatureCollection',features});
}
function replaceOldMarkers(){try{clearPOIs();clearForestMarkers();clearLandmarks();clearBuildingLights();}catch(_){};try{loadNearbyPOIs=()=>{};loadForestMarkers=()=>{};loadLandmarks=()=>{};refreshBuildingLights=()=>{};displayTileFallbacks=()=>{};}catch(_){} }
function paintSea(){const layers=map.getStyle()?.layers||[];let water=layers.filter(l=>l.type==='fill'&&/water|ocean|lake/.test((l.id+' '+(l['source-layer']||'')).toLowerCase()));
for(const layer of water){try{map.setPaintProperty(layer.id,'fill-color','#113452');map.setPaintProperty(layer.id,'fill-opacity',1)}catch(_){}}
for(const layer of layers.filter(l=>/^water-depth-band-/.test(l.id))){try{map.removeLayer(layer.id)}catch(_){}}
const base=water[0];if(!base)return;
const stages=[['deep','#1b4c75',46,.60],['mid','#287daf',29,.67],['shallow','#55b8d1',16,.75],['coast','#a4e5e0',5,.85]];
for(const [name,color,width,opacity] of stages){try{map.addLayer({id:'ls-sea-'+name,type:'line',source:base.source,'source-layer':base['source-layer'],paint:{'line-color':color,'line-width':['interpolate',['linear'],['zoom'],4,width*.1,9,width*.45,15,width], 'line-opacity':opacity,'line-blur':1.5}})}catch(e){console.warn('Sea band',e)}}
// Styled coastline bands are NOT bathymetric measurements.
}
function makeControls(){const aside=document.querySelector('.tools');const b=document.createElement('button');b.id='filterToggle';b.title='Haritada gösterilecek yerler';b.textContent='☷';aside.prepend(b);
const panel=document.createElement('section');panel.id='filterPanel';panel.hidden=true;panel.innerHTML='<div class="filter-head"><strong>HARİTA KATMANLARI</strong><button id="filterClose" aria-label="Kapat">×</button></div><small>Görmek istediklerini seç</small><div id="filterList"></div>';
document.body.append(panel);const l=$('filterList');for(const [id,label] of cats){const row=document.createElement('label');row.className='filter-row';const cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.onchange=()=>{categoryOn[id]=cb.checked;drawPOIs()};row.append(cb,document.createTextNode(label));l.append(row)}
b.onclick=()=>panel.hidden=!panel.hidden;$('filterClose').onclick=()=>panel.hidden=true;
// Top sky time scrubber: manual offset for preview, automatic reset.
const sky=$('skybar');const controls=document.createElement('div');controls.className='sky-controls';controls.innerHTML='<button id="skyAuto" title="Gerçek saate dön">AUTO</button><input id="skyScrub" aria-label="Saat seç" type="range" min="0" max="1439" value="720" step="5"><span id="skyRead">12:00</span>';sky.append(controls);
let manual=false;const scr=$('skyScrub');scr.oninput=()=>{manual=true;const m=+scr.value;$('skyRead').textContent=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');document.body.classList.toggle('night-theme',m<360||m>=1080);document.body.classList.toggle('day-theme',m>=360&&m<1080);if(map.getLayer('ls-3d-buildings'))map.setPaintProperty('ls-3d-buildings','fill-extrusion-color',m<360||m>=1080?'#24282e':'#424247');$('skyAuto').textContent='MANUEL'; refreshModels();};
$('skyAuto').onclick=()=>{manual=false;$('skyAuto').textContent='AUTO';applyDayNightTheme();refreshModels()};
window.lsPreviewTime=()=>manual? +scr.value : null;
}
async function smartSearch(event){event.preventDefault();const query=$('query').value.trim();if(!query)return;const area=$('results');area.hidden=false;area.textContent='Haritada aranıyor…';const c=map.getCenter();const normalized=query.toLocaleLowerCase('tr');const words={hospital:/hastane|hospital|klinik/,pharmacy:/eczane|pharmacy/,restaurant:/restoran|restaurant|yemek/,cafe:/kafe|cafe|kahve/,school:/okul|school|üniversite/,culture:/kültür|muz[eé]|tiyatro|kütüphane/,worship:/cami|mosque/,shopping:/market|mağaza/};const key=Object.keys(words).find(k=>words[k].test(normalized));let candidates=[];try{candidates=map.querySourceFeatures('ls-pois')||[]}catch(_){};
if(key){const matched=candidates.filter(f=>f.properties?.category===key);if(matched.length){area.replaceChildren();area.textContent='Yakın çevredeki sonuçlar';for(const f of matched.slice(0,12)){const p=f.properties;const coords=f.geometry.coordinates;const btn=document.createElement('button');btn.textContent=p.name;btn.onclick=()=>{map.flyTo({center:coords,zoom:16.4,pitch:44});area.hidden=true;};area.append(btn)}return;}}
try{const near=`viewbox=${encodeURIComponent([c.lng-.16,c.lat+.09,c.lng+.16,c.lat-.09].join(','))}&bounded=0`;
const resp=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12&accept-language=tr&${near}&q=${encodeURIComponent(query)}`);if(!resp.ok)throw Error(String(resp.status));const list=await resp.json();area.replaceChildren();if(!list.length){area.textContent='Sonuç bulunamadı';return;}list.sort((a,b)=>{const d=o=>(+o.lon-c.lng)**2+(+o.lat-c.lat)**2;return d(a)-d(b)});for(const item of list){const b=document.createElement('button');const strong=document.createElement('strong');strong.textContent=item.name||item.display_name.split(',')[0];const small=document.createElement('small');small.textContent=item.display_name;b.append(strong,small);b.onclick=()=>{map.flyTo({center:[+item.lon,+item.lat],zoom:16});area.hidden=true;$('query').blur()};area.append(b)}}catch(e){area.textContent='Arama servisi şu anda yanıt vermiyor.';console.warn(e)}}
function initSearch(){const old=$('searchForm');const copy=old.cloneNode(true);old.parentNode.replaceChild(copy,old);copy.addEventListener('submit',smartSearch);
const input=$('query');input.addEventListener('input',()=>{if(input.value.length<3){$('results').hidden=true;return;}clearTimeout(input._t);input._t=setTimeout(()=>{if(input.value.trim().length>2)smartSearch({preventDefault(){}})},440)});
}
function featureModels(){const z=map.getZoom();if(z<13.6)return[];const bounds=map.getBounds(),models=[],seen=new Set();
for(const layer of ['landcover','landuse'])for(const f of featureList(layer)){const p=f.properties||{};if(!/wood|forest/.test(String(p.class||p.subclass||p.type||'')))continue;const coord=lngLat(f);if(!coord||!bounds.contains(coord))continue;const k=coord.map(v=>v.toFixed(4)).join(',');if(seen.has(k))continue;seen.add(k);models.push({type:'tree',coord,id:k});if(models.length>=55)break;}
for(const f of featureList('poi')){const p=f.properties||{};const category=categoryOf(p);if(!['worship','landmark'].includes(category)||!categoryOn[category])continue;const coord=lngLat(f);if(!coord||!bounds.contains(coord))continue;let n=readableName(p).toLowerCase(),sub=String(p.subclass||p.class).toLowerCase();let type=/liberty|özgürlük/.test(n)?'liberty':/christ|cristo|jesus/.test(n)?'christ':/kaaba|kabe/.test(n)?'kaaba':/castle|fort|kale/.test(n+' '+sub)?'castle':/bridge|köprü/.test(n+' '+sub)?'bridge':category==='worship'?'mosque':'monument';models.push({type,coord,id:coord.join()+type});if(models.length>=76)break;}
if(z>=15.7 && document.body.classList.contains('night-theme')){
 for(const f of featureList('building')){if(models.length>=95)break;const c=lngLat(f);if(!c||!bounds.contains(c))continue;models.push({type:'lightbuilding',coord:c,id:c.join(':')})}
}return models;}
function initThreeLayer(){if(!window.THREE||modelLayer)return;const T=THREE;const scene=new T.Scene();const camera=new T.Camera();const lights=new T.AmbientLight(0xffffff,1.4);scene.add(lights);const rendererConfig={};let renderer=null;const groups=[];
function mat(c){return new T.MeshLambertMaterial({color:c,flatShading:true})}const stone=mat(0xc9c4b3),stone2=mat(0xaea99c), roof=mat(0x8197ac), tree=mat(0x516858),trunk=mat(0x715a4a), gold=mat(0xe5cb80),black=mat(0x26272a),bronze=mat(0x8fae98);
function cube(group,x,y,z,w,h,d,material){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function cone(group,x,y,z,r,h,material,verts=5){const mesh=new T.Mesh(new T.ConeGeometry(r,h,verts),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function sphere(group,x,y,z,r,material){const mesh=new T.Mesh(new T.SphereGeometry(r,8,6),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function geometry(type,id){const g=new T.Group();if(type==='tree'){let seed=id.split('').reduce((a,c)=>a+c.charCodeAt(0),0);for(let i=0;i<5;i++){const x=((seed*(i+3)*7)%29)-14,z=((seed*(i+5)*11)%29)-14,h=11+(i%4)*3;cube(g,x,2,z,2,4,2,trunk);cone(g,x,h*.54,z,6,h,tree,5)}}
else if(type==='mosque'){cube(g,0,5,0,30,10,22,stone);sphere(g,0,12,0,9,roof);for(const x of [-18,18]){cube(g,x,11,0,3,22,3,stone);cone(g,x,23,0,2.9,5,roof,6)}}
else if(type==='castle'){cube(g,0,5,0,28,10,20,stone);for(const x of [-14,14])for(const z of [-10,10]){cube(g,x,11,z,7,23,7,stone2);cone(g,x,24,z,5,8,roof,4)}}
else if(type==='kaaba'){cube(g,0,7,0,19,14,18,black);cube(g,0,10,9.1,19,.8,.5,gold)}
else if(type==='liberty'||type==='christ'){cube(g,0,3,0,12,6,12,stone2);cube(g,0,16,0,4,22,4,bronze);sphere(g,0,29,0,3,bronze);if(type==='christ')cube(g,0,23,0,27,3.6,3,bronze);else{cube(g,5,28,0,2,14,2,bronze);sphere(g,5,36,0,2,gold)}}
else if(type==='bridge'){cube(g,0,12,0,46,3,13,stone);for(const x of [-18,-7,7,18]){cube(g,x,18,5,1,12,1,stone2);sphere(g,x,24,5,1.6,gold)}}
else if(type==='lightbuilding'){for(let side of [-1,1])for(let x of [-3,0,3])for(let y of [5,9,13,17]){if((x+y+side)%4===0)continue;cube(g,x,y,side*8,.9,1.25,.22,gold)}}
else{cube(g,0,6,0,14,12,14,stone);cone(g,0,15,0,8,7,roof,5)}return g}
modelLayer={id:'ls-anchored-models',type:'custom',renderingMode:'3d',onAdd(m,gl){renderer=new T.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:false});renderer.autoClear=false;renderer.setPixelRatio(1);},render(gl,args){if(!renderer)return;const matrix=args?.defaultProjectionData?.mainMatrix||args?.matrix;if(!matrix)return;camera.projectionMatrix.fromArray(matrix);renderer.resetState();renderer.render(scene,camera)}};
map.addLayer(modelLayer);
window.lsUpdateThree=models=>{for(const g of groups)scene.remove(g);groups.length=0;const z=map.getZoom();if(z<13.6)return;const C=maplibregl.MercatorCoordinate;for(const m of models){const mc=C.fromLngLat(m.coord,0), scale=mc.meterInMercatorCoordinateUnits();const g=geometry(m.type,m.id);g.position.set(mc.x,mc.y,mc.z);g.rotation.x=Math.PI/2;g.scale.setScalar(scale);scene.add(g);groups.push(g)} };
}
function refreshModels(){if(!map)return;if(window.lsUpdateThree)window.lsUpdateThree(featureModels());}
function init(){if(ready)return;map=state.map;if(!map?.isStyleLoaded())return;ready=true;replaceOldMarkers();initLayers();paintSea();makeControls();initSearch();
let timer;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{drawPOIs();refreshModels()},180)};
map.on('moveend',refresh);map.on('sourcedata',e=>{if(e.sourceId!=='ls-pois' && e.isSourceLoaded && !map.isMoving())refresh()});drawPOIs();
const three=document.createElement('script');three.src='https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';three.onload=()=>{initThreeLayer();refreshModels()};three.onerror=()=>console.warn('Three.js unavailable; native POI layer remains active');document.head.appendChild(three);
// Update as data changes, without resurrecting the old detached DOM markers.
setInterval(()=>{if(!map||!map.isStyleLoaded())return;drawPOIs();
const d=weatherState?.data;if(!d)return;const local=new Date(Date.now()+(d.utc_offset_seconds||0)*1000);const t=local.toISOString().slice(0,16);renderSkyBar({...d,current:{...d.current,time:t}});
if(window.lsPreviewTime()==null){const sun=d.daily?.sunrise?.[0]?.slice(11,16)||'06:00',set=d.daily?.sunset?.[0]?.slice(11,16)||'18:00',h=t.slice(11,16);applyDayNightTheme(h>=sun&&h<set);} },60000);
}
const poll=setInterval(()=>{if(state.map?.isStyleLoaded()){clearInterval(poll);init()}},350);
})();
