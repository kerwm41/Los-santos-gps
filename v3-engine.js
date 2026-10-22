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
function paintSea(){
// Real coastline-bound, subdued shallow-water halo. Offshore water remains flat.
const layers=map.getStyle()?.layers||[];
for(const l of layers.filter(l=>/^ls-sea-|^water-depth-band-|^ls-shore-/.test(l.id))){try{map.removeLayer(l.id)}catch(_){}}
const bases=layers.filter(l=>l.type==='fill' && /water|ocean|lake/.test((l.id+' '+(l['source-layer']||'')).toLowerCase()));
for(const base of bases){
 try{map.setPaintProperty(base.id,'fill-pattern',null);map.setPaintProperty(base.id,'fill-color','#0b3144');map.setPaintProperty(base.id,'fill-opacity',1)}catch(_){}
 if(!base.source||!base['source-layer'])continue;
 // Pixel widths scale with zoom to represent approx. 10-55 meters rather than filling the ocean.
 // Smooth translucent halos, layered from dark offshore to light coast.
 const widths=[60,43,27,14];const colors=['#164a60','#26758b','#4b9caa','#80bfc2'];
 for(let i=0;i<4;i++){
  const meters=widths[i];const width=['interpolate',['exponential',2],['zoom'],10,meters/76,12,meters/19,14,meters/4.8,16,meters/1.2,18,meters*3.3];
  try{map.addLayer({id:`ls-shore-${base.id}-${i}`,type:'line',source:base.source,'source-layer':base['source-layer'],
    ...(base.filter?{filter:base.filter}:{}),minzoom:9,
    paint:{'line-color':colors[i],'line-width':width,'line-opacity':.35+i*.10,'line-blur':2.2+i*.35}},base.id);}catch(e){console.warn('shoreline band',e)}
 }
}
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
function insidePolygon(p,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function featureModels(){const z=map.getZoom(),bounds=map.getBounds(),models=[],seen=new Set();if(z<13.4)return models;
// Forest density is sampled INSIDE mapped forest polygons, not a single point per forest.
let forestCount=0;
for(const layer of ['landcover','landuse'])for(const f of featureList(layer)){
 if(forestCount>=175)break;
 const p=f.properties||{};if(!/wood|forest/.test(String(p.class||p.subclass||p.type||'')))continue;
 const polygons=f.geometry?.type==='Polygon'?[f.geometry.coordinates]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:[];
 for(const polygon of polygons){const ring=polygon[0];if(!ring||ring.length<4)continue;
 const lo=Math.max(bounds.getWest(),Math.min(...ring.map(v=>v[0]))),hi=Math.min(bounds.getEast(),Math.max(...ring.map(v=>v[0])));
 const bot=Math.max(bounds.getSouth(),Math.min(...ring.map(v=>v[1]))),top=Math.min(bounds.getNorth(),Math.max(...ring.map(v=>v[1])));
 if(hi<=lo||top<=bot)continue;
 // Roughly 18–35 meter intervals when zoomed in; more space at lower zoom.
 const latitude=(bot+top)*.5;const metersLongitude=111320*Math.cos(latitude*Math.PI/180),metersLatitude=111320;
 const spacing=z>15?28:z>14?45:84;const nx=Math.min(45,Math.ceil((hi-lo)*metersLongitude/spacing));const ny=Math.min(45,Math.ceil((top-bot)*metersLatitude/spacing));
 if(nx<1||ny<1)continue;
 const srcid=p.osm_id||f.id||`${lo.toFixed(4)}-${bot.toFixed(4)}`;
 for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
 if(forestCount>=175)break;
 const seed=(ix*1699+iy*983+String(srcid).length*577)|0;
 const rand=Math.abs(Math.sin(seed*1.334)*100000)%1;
 const coord=[lo+(ix+.2+.6*rand)/nx*(hi-lo),bot+(iy+.2+.6*((rand*7.919)%1))/ny*(top-bot)];
 if(!insidePolygon(coord,ring))continue;const key=coord.map(v=>v.toFixed(5)).join(':');if(seen.has(key))continue;seen.add(key);
 models.push({type:'tree',coord,id:key});forestCount++;
 }
 }
}
for(const f of featureList('poi')){
 const p=f.properties||{},category=categoryOf(p);if(!['worship','landmark'].includes(category)||!categoryOn[category])continue;
 const coord=lngLat(f);if(!coord||!bounds.contains(coord))continue;
 const name=readableName(p).toLowerCase(),sub=String(p.subclass||p.class).toLowerCase();
 let type=/liberty|özgürlük/.test(name)?'liberty':/christ|cristo|jesus/.test(name)?'christ':/kaaba|kabe/.test(name)?'kaaba':/castle|fort|kale/.test(name+' '+sub)?'castle':/bridge|köprü/.test(name+' '+sub)?'bridge':category==='worship'?'mosque':'monument';
 const id=coord.join()+type;if(seen.has(id))continue;seen.add(id);models.push({type,coord,id});if(models.length>=440)break;
}
const hour=window.lsPreviewTime?.(),night=hour===null||hour===undefined?document.body.classList.contains('night-theme'):(hour<360||hour>=1080);
if(z>=14.6 && night){
 let used=0;
 for(const f of featureList('building')){if(used>=210)break;
 const c=lngLat(f);if(!c||!bounds.contains(c))continue;
 const poly=f.geometry?.type==='Polygon'?f.geometry.coordinates[0]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates[0][0]:null;
 if(!poly||poly.length<4)continue;
 models.push({type:'lightbuilding',coord:c,id:'b'+(f.id||used),outline:poly,height:+(f.properties?.render_height||f.properties?.height)||7});used++;
 }
 for(const f of featureList('transportation')){if(used>=235)break;const p=f.properties||{};
 if(!(p.brunnel==='bridge'||p.bridge===1||p.bridge==='yes'||p.subclass==='bridge'))continue;
 const c=lngLat(f)|| (f.geometry?.type==='LineString'?f.geometry.coordinates[Math.floor(f.geometry.coordinates.length/2)]:null);
 if(c&&bounds.contains(c)){models.push({type:'lightbridge',coord:c,id:'bridge'+used});used++}
 }
}
return models;}
function initThreeLayer(){if(!window.THREE||modelLayer)return;const T=THREE;const scene=new T.Scene();const camera=new T.Camera();const lights=new T.AmbientLight(0xffffff,1.4);scene.add(lights);const rendererConfig={};let renderer=null;const groups=[];
function mat(c){return new T.MeshLambertMaterial({color:c,flatShading:true})}const stone=mat(0x494b50),stone2=mat(0x383b40), roof=mat(0x55585d), tree=mat(0x444b49),trunk=mat(0x383b39), gold=mat(0x77777b),black=mat(0x292b2e),bronze=mat(0x5d6264);
function cube(group,x,y,z,w,h,d,material){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function cone(group,x,y,z,r,h,material,verts=5){const mesh=new T.Mesh(new T.ConeGeometry(r,h,verts),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function sphere(group,x,y,z,r,material){const mesh=new T.Mesh(new T.SphereGeometry(r,8,6),material);mesh.position.set(x,y,z);group.add(mesh);return mesh}
function geometry(type,id){const g=new T.Group();if(type==='tree'){const seed=id.split('').reduce((a,c)=>a+c.charCodeAt(0),0),h=9+seed%7;cube(g,0,1.9,0,1.6,3.8,1.6,trunk);cone(g,0,h*.48,0,5.4,h*.74,tree,5);cone(g,0,h*.72,0,4.0,h*.58,tree,5);cone(g,0,h*.99,0,2.8,h*.48,tree,5)}
else if(type==='mosque'){cube(g,0,5,0,30,10,22,stone);sphere(g,0,12,0,9,roof);for(const x of [-18,18]){cube(g,x,11,0,3,22,3,stone);cone(g,x,23,0,2.9,5,roof,6)}}
else if(type==='castle'){cube(g,0,5,0,28,10,20,stone);for(const x of [-14,14])for(const z of [-10,10]){cube(g,x,11,z,7,23,7,stone2);cone(g,x,24,z,5,8,roof,4)}}
else if(type==='kaaba'){cube(g,0,7,0,19,14,18,black);cube(g,0,10,9.1,19,.8,.5,gold)}
else if(type==='liberty'||type==='christ'){cube(g,0,3,0,12,6,12,stone2);cube(g,0,16,0,4,22,4,bronze);sphere(g,0,29,0,3,bronze);if(type==='christ')cube(g,0,23,0,27,3.6,3,bronze);else{cube(g,5,28,0,2,14,2,bronze);sphere(g,5,36,0,2,gold)}}
else if(type==='bridge'){cube(g,0,12,0,46,3,13,stone);for(const x of [-18,-7,7,18]){cube(g,x,18,5,1,12,1,stone2);sphere(g,x,24,5,1.6,gold)}}
else if(type==='lightbuilding'){ /* windows generated on exact polygon walls below */ }
else if(type==='lightbridge'){for(let i=-3;i<=3;i++){cube(g,i*6,3,0,.6,6,.6,stone2);sphere(g,i*6,6,0,1.3,gold)}}
else{cube(g,0,6,0,14,12,14,stone);cone(g,0,15,0,8,7,roof,5)}return g}
const windowMat=new T.MeshBasicMaterial({color:0xffdf72,side:T.DoubleSide,depthTest:true,depthWrite:false});
function addWindows(g,m){const ring=m.outline,height=Math.min(55,Math.max(5,m.height)),center=m.coord;
 if(!ring)return;const mx=111320*Math.cos(center[1]*Math.PI/180),my=111320;
 for(let e=0;e<ring.length-1;e++){
  const a=ring[e],b=ring[e+1],dx=(b[0]-a[0])*mx,dz=(b[1]-a[1])*my,length=Math.hypot(dx,dz);
  if(length<2.1||length>180)continue;
  const cols=Math.max(1,Math.min(12,Math.floor(length/3.1))),floors=Math.max(1,Math.min(12,Math.floor((height-1)/3.0)));
  for(let col=0;col<cols;col++)for(let floor=0;floor<floors;floor++){
   const seed=(e*41+col*13+floor*29 + ring.length*7)%11;if(seed<3)continue;
   const t=(col+.5)/cols,x=(a[0]+t*(b[0]-a[0])-center[0])*mx,z=(a[1]+t*(b[1]-a[1])-center[1])*my;
   const face=new T.Mesh(new T.PlaneGeometry(Math.min(1.1,length/cols*.48),Math.min(1.2,height*.21)),windowMat);
   // Offset away from the building wall to prevent z-fighting.
   face.position.set(x+(dz/length)*.16,Math.min(height-.6,2.2+floor*3.0),z-(dx/length)*.16);
   face.rotation.y=-Math.atan2(dz,dx);g.add(face);
  }
 }
}
modelLayer={id:'ls-anchored-models',type:'custom',renderingMode:'3d',onAdd(m,gl){renderer=new T.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:false});renderer.autoClear=false;renderer.setPixelRatio(1);},render(gl,args){if(!renderer)return;const matrix=args?.defaultProjectionData?.mainMatrix||args?.matrix;if(!matrix)return;camera.projectionMatrix.fromArray(matrix);renderer.resetState();renderer.render(scene,camera);map.triggerRepaint()}};
map.addLayer(modelLayer);
const modelCache=new Map();
window.lsUpdateThree=models=>{
 const z=map.getZoom(), desired=new Set();const C=maplibregl.MercatorCoordinate;
 if(z>=13.6)for(const m of models){ const key=m.type+':'+m.id;desired.add(key);if(modelCache.has(key))continue;
  const mc=C.fromLngLat(m.coord,0),scale=mc.meterInMercatorCoordinateUnits();const g=geometry(m.type,m.id);
  if(m.type==='lightbuilding')addWindows(g,m);
  g.position.set(mc.x,mc.y,mc.z);g.rotation.x=Math.PI/2;g.scale.setScalar(scale);scene.add(g);modelCache.set(key,g);
 }
 for(const [key,g] of modelCache){if(desired.has(key))continue;scene.remove(g);g.traverse(o=>{if(o.geometry)o.geometry.dispose()});modelCache.delete(key)}
 map.triggerRepaint();
};
}
function refreshModels(){if(!map)return;if(window.lsUpdateThree)window.lsUpdateThree(featureModels());}
function init(){if(ready)return;map=state.map;if(!map?.isStyleLoaded())return;ready=true;replaceOldMarkers();initLayers();paintSea();makeControls();initSearch();
let timer;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{drawPOIs();refreshModels()},180)};
map.on('moveend',refresh);map.on('sourcedata',e=>{if(e.sourceId!=='ls-pois' && e.isSourceLoaded && !map.isMoving())refresh()});drawPOIs();
const three=document.createElement('script');three.src='https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';three.onload=()=>{initThreeLayer();refreshModels()};three.onerror=()=>console.warn('Three.js unavailable; native POI layer remains active');document.head.appendChild(three);
// Update as data changes, without resurrecting the old detached DOM markers.
setInterval(()=>{if(!map||!map.isStyleLoaded())return;drawPOIs();
const d=weatherState?.data;if(!d)return;const local=new Date(Date.now()+(d.utc_offset_seconds||0)*1000);const t=local.toISOString().slice(0,16);renderSkyBar({...d,current:{...d.current,time:t}});
if(window.lsPreviewTime()==null){const sun=d.daily?.sunrise?.[0]?.slice(11,16)||'06:00',set=d.daily?.sunset?.[0]?.slice(11,16)||'18:00',h=t.slice(11,16);applyDayNightTheme(h>=sun&&h<set);refreshModels();} },60000);
}
const poll=setInterval(()=>{if(state.map?.isStyleLoaded()){clearInterval(poll);init()}},350);
})();
