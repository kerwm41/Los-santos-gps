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
function featureList(sourceLayer){const layers=map.getStyle()?.layers||[];const s=layers.find(l=>l['source-layer']===sourceLayer)?.source;if(!s)return[];try{return (map.querySourceFeatures(s,{sourceLayer})||[]).flatMap(f=>sourceLayer==='building'&&f.geometry?.type==='MultiPolygon'?f.geometry.coordinates.map((poly,i)=>({type:'Feature',id:String(f.id??'')+':'+i,properties:f.properties,geometry:{type:'Polygon',coordinates:poly}})):[f])}catch{return[]}}
function initLayers(){if(map.getSource('ls-pois'))return;
for(const [id] of cats){const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 27px sans-serif';ctx.fillText(({hospital:'+',pharmacy:'E',restaurant:'',cafe:'☕',school:'▤',culture:'◆',worship:'◒',shopping:'▦',nature:'♣',landmark:'★'})[id],24,25);if(id==='restaurant'){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(14,10);ctx.lineTo(14,37);ctx.moveTo(8,10);ctx.lineTo(8,21);ctx.lineTo(20,21);ctx.lineTo(20,10);ctx.moveTo(32,10);ctx.lineTo(32,37);ctx.moveTo(32,10);ctx.lineTo(27,24);ctx.lineTo(32,24);ctx.stroke();}map.addImage('poi-'+id,ctx.getImageData(0,0,48,48),{pixelRatio:2});}
map.addSource('ls-pois',{type:'geojson',data:empty()});
map.addLayer({id:'ls-poi-points',type:'circle',source:'ls-pois',minzoom:12.5,paint:{'circle-radius':['interpolate',['linear'],['zoom'],12.5,3.5,15,6,17,8], 'circle-color':['match',['get','category'],'hospital','#e85b67','pharmacy','#68d3a4','restaurant','#f39b60','cafe','#d5a46e','school','#8cb3f5','culture','#b0a0ff','worship','#d6caa3','nature','#7ab48e','shopping','#be8edc','landmark','#e1c086','#bcbec9'],'circle-stroke-color':'#1a1d23','circle-stroke-width':2,'circle-opacity':.96}});
map.addLayer({id:'ls-poi-text',type:'symbol',source:'ls-pois',minzoom:14,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],14,10,17,13],'text-offset':[0,1.8],'text-anchor':'top','text-max-width':11,'text-allow-overlap':false,'text-optional':true},paint:{'text-color':'#f4f1f4','text-halo-color':'#1a1c20','text-halo-width':1.8}});
map.addLayer({id:'ls-poi-icons',type:'symbol',source:'ls-pois',minzoom:14,layout:{'icon-image':['concat','poi-',['get','category']],'icon-size':.65,'icon-allow-overlap':true,'icon-ignore-placement':true}});
map.on('click','ls-poi-points',e=>{const p=e.features?.[0]?.properties;if(!p)return;const o=JSON.parse(p.payload);openPOI(o);});
map.on('mouseenter','ls-poi-points',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','ls-poi-points',()=>map.getCanvas().style.cursor='');
}
const detailCache=new Map();let detailToken=0;
async function openPOI(item){
 const token=++detailToken,key=item.lon.toFixed(5)+','+item.lat.toFixed(5),cached=detailCache.get(key);
 showPOI(cached||item);if(cached)return;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const q=`[out:json][timeout:9];nwr(around:25,${item.lat},${item.lon})[name];out center 30;`;
 const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q,signal:controller.signal});if(!res.ok)return;const d=await res.json();
 const match=(d.elements||[]).find(e=>e.tags?.name===item.tags?.name||e.tags?.['name:tr']===item.tags?.name);
 if(!match)return;const full={...match,lon:item.lon,lat:item.lat};detailCache.set(key,full);
 if(token===detailToken&&!$('infoSheet').hidden&&$('sheetTitle').textContent===(item.tags.name||'İsimsiz mekân'))showPOI(full);
 }catch(e){console.warn('Mekân ayrıntısı alınamadı',e.message);}finally{clearTimeout(timer);}
}
function drawPOIs(){if(!map.getSource('ls-pois'))return;const z=map.getZoom();if(z<12){map.getSource('ls-pois').setData(empty());return;}
const items=featureList('poi');const bounds=map.getBounds();const seen=new Set();const features=[];
for(const item of items){if(features.length>=160)break;const p=item.properties||{};const category=categoryOf(p);if(!category||!categoryOn[category])continue;const c=lngLat(item);if(!c||!bounds.contains(c))continue;const name=readableName(p)||cats.find(a=>a[0]===category)?.[1]||'Mekân';const key=name+':'+c.map(v=>v.toFixed(4)).join(',');if(seen.has(key))continue;seen.add(key);
const tags={...p,name,amenity:p.subclass||p.class};if(category==='shopping')tags.shop=p.subclass||p.class;if(category==='landmark')tags.historic=p.subclass||p.class;const data={lon:c[0],lat:c[1],tags};
features.push({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{name,category,payload:JSON.stringify(data)}});
}
map.getSource('ls-pois').setData({type:'FeatureCollection',features});
}
let coastController=null,coastCenter=null,coastAt=0;
function paintSea(){
 const layers=map.getStyle()?.layers||[];
 for(const l of layers.filter(l=>l.type==='fill'&&l['source-layer']==='water')){map.setPaintProperty(l.id,'fill-color','#0b2634');map.setPaintProperty(l.id,'fill-opacity',1);}
 map.addSource('ls-coast',{type:'geojson',data:empty()});
 const before=layers.find(l=>l.type!=='background'&&l['source-layer']!=='water'&&/transportation|building/.test(l['source-layer']||''))?.id;
 map.addLayer({id:'ls-coast-shallows',type:'fill',source:'ls-coast',minzoom:10,paint:{'fill-color':['interpolate',['linear'],['get','band'],0,'#659fa7',5,'#397487',10,'#204b60',15,'#0b2634'],'fill-opacity':.82,'fill-antialias':false}},before);
 refreshCoast();
}
async function refreshCoast(){
 if(map.getZoom()<10)return;const center=map.getCenter().toArray();
 if(coastCenter&&distanceMeters(center,coastCenter)<3500)return;
 if(Date.now()-coastAt<15000)return;coastAt=Date.now();
 coastController?.abort();coastController=new AbortController();
 const timer=setTimeout(()=>coastController.abort(),20000);
 try{const q=`[out:json][timeout:15];way(around:12000,${center[1]},${center[0]})[natural=coastline];out geom;`;
 const r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q,signal:coastController.signal});if(!r.ok)throw Error('Coastline '+r.status);const data=await r.json();
 const features=(data.elements||[]).flatMap(w=>LSGeo.coastBands((w.geometry||[]).map(p=>[p.lon,p.lat]),40));
 map.getSource('ls-coast')?.setData({type:'FeatureCollection',features});coastCenter=center;
 }catch(e){if(e.name!=='AbortError')console.warn('Kıyı verisi alınamadı',e);}finally{clearTimeout(timer);}
}
let buildingFetchAt=0,buildingCenter=null,supplemental=[];
async function refreshMissingBuildings(){
 if(map.getZoom()<15)return;const c=map.getCenter().toArray();if(buildingCenter&&distanceMeters(c,buildingCenter)<450)return;if(Date.now()-buildingFetchAt<30000)return;buildingFetchAt=Date.now();
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{const q=`[out:json][timeout:12];way(around:900,${c[1]},${c[0]})[building];out geom;`;
 const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q,signal:controller.signal});if(!res.ok)throw Error('Buildings '+res.status);const d=await res.json();
 supplemental=(d.elements||[]).filter(w=>w.geometry?.length>=4).map(w=>({type:'Feature',id:w.id,properties:{...w.tags,height:LSGeo.height(w.tags),base:LSGeo.base(w.tags)},geometry:{type:'Polygon',coordinates:[w.geometry.map(p=>[p.lon,p.lat])]}}));buildingCenter=c;syncMissingBuildings();refreshModels();
 }catch(e){console.warn('Ek bina verisi alınamadı',e.message);}finally{clearTimeout(timer);}
}
function missingBuildings(){
 const native=featureList('building');
 return supplemental.filter(f=>{const center=lngLat(f);return !native.some(n=>{const polygons=n.geometry?.type==='Polygon'?[n.geometry.coordinates]:n.geometry?.type==='MultiPolygon'?n.geometry.coordinates:[];return polygons.some(poly=>LSGeo.inside(center,poly[0])||f.geometry.coordinates[0].some(pt=>LSGeo.inside(pt,poly[0]))||poly[0].some(pt=>LSGeo.inside(pt,f.geometry.coordinates[0])));});});
}
function syncMissingBuildings(){map.getSource('ls-extra-buildings')?.setData({type:'FeatureCollection',features:missingBuildings()});}
function initMissingBuildings(){map.addSource('ls-extra-buildings',{type:'geojson',data:empty()});map.addLayer({id:'ls-extra-buildings-3d',type:'fill-extrusion',source:'ls-extra-buildings',minzoom:14.2,paint:{'fill-extrusion-color':'#34363b','fill-extrusion-height':['get','height'],'fill-extrusion-base':['get','base'],'fill-extrusion-opacity':1}});}
function makeControls(){const aside=document.querySelector('.tools');const b=document.createElement('button');b.id='filterToggle';b.title='Haritada gösterilecek yerler';b.textContent='☷';aside.prepend(b);
const panel=document.createElement('section');panel.id='filterPanel';panel.hidden=true;panel.innerHTML='<div class="filter-head"><strong>HARİTA KATMANLARI</strong><button id="filterClose" aria-label="Kapat">×</button></div><small>Görmek istediklerini seç</small><div id="filterList"></div>';
document.body.append(panel);const l=$('filterList');for(const [id,label] of cats){const row=document.createElement('label');row.className='filter-row';const cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.onchange=()=>{categoryOn[id]=cb.checked;drawPOIs();refreshModels()};row.append(cb,document.createTextNode(label));l.append(row)}
b.onclick=()=>panel.hidden=!panel.hidden;$('filterClose').onclick=()=>panel.hidden=true;
window.lsPreviewTime=()=>null;
}
const searchCache=new Map();
let searchController=null,searchSequence=0,lastSearchAt=0;
async function smartSearch(event){event.preventDefault();if(Date.now()-lastSearchAt<1100)return;lastSearchAt=Date.now();searchController?.abort();searchController=new AbortController();const sequence=++searchSequence;const query=$('query').value.trim();if(!query)return;const area=$('results');area.hidden=false;area.textContent='Haritada aranıyor…';const c=map.getCenter();const normalized=query.toLocaleLowerCase('tr');const words={hospital:/hastane|hospital|klinik/,pharmacy:/eczane|pharmacy/,restaurant:/restoran|restaurant|yemek/,cafe:/kafe|cafe|kahve/,school:/okul|school|üniversite/,culture:/kültür|muz[eé]|tiyatro|kütüphane/,worship:/cami|mosque/,shopping:/market|mağaza/};const key=Object.keys(words).find(k=>words[k].test(normalized));let candidates=[];try{candidates=map.querySourceFeatures('ls-pois')||[]}catch(_){};
if(key){const matched=candidates.filter(f=>f.properties?.category===key);if(matched.length){area.replaceChildren();area.textContent='Yakın çevredeki sonuçlar';for(const f of matched.slice(0,12)){const p=f.properties;const coords=f.geometry.coordinates;const btn=document.createElement('button');btn.textContent=p.name;btn.onclick=()=>{setDestination(coords[0],coords[1],p.name);area.hidden=true;};area.append(btn)}return;}}
try{const near=`viewbox=${encodeURIComponent([c.lng-.16,c.lat+.09,c.lng+.16,c.lat-.09].join(','))}&bounded=0`;
const cacheKey=query.toLocaleLowerCase('tr')+':'+c.lng.toFixed(2)+':'+c.lat.toFixed(2);
let list=searchCache.get(cacheKey);if(!list){const resp=await fetch(`${window.LSConfig.searchURL}?format=jsonv2&addressdetails=1&limit=12&accept-language=tr&${near}&q=${encodeURIComponent(query)}`,{signal:searchController.signal});if(!resp.ok)throw Error(String(resp.status));list=await resp.json();searchCache.set(cacheKey,list);}if(sequence!==searchSequence)return;area.replaceChildren();if(!list.length){area.textContent='Sonuç bulunamadı';return;}list.sort((a,b)=>{const d=o=>(+o.lon-c.lng)**2+(+o.lat-c.lat)**2;return d(a)-d(b)});for(const item of list){const b=document.createElement('button');const strong=document.createElement('strong');strong.textContent=item.name||item.display_name.split(',')[0];const small=document.createElement('small');small.textContent=item.display_name;b.append(strong,small);b.onclick=()=>{setDestination(+item.lon,+item.lat,item.name||item.display_name.split(',')[0]);area.hidden=true;$('query').blur()};area.append(b)}}catch(e){if(sequence!==searchSequence||e.name==='AbortError')return;area.textContent='Arama servisi şu anda yanıt vermiyor.';console.warn(e)}}
function initSearch(){const old=$('searchForm');const copy=old.cloneNode(true);old.parentNode.replaceChild(copy,old);copy.addEventListener('submit',smartSearch);
// Public Nominatim: explicit searches only, no autocomplete requests.
}
function insidePolygon(p,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function featureModels(){const z=map.getZoom(),bounds=map.getBounds(),models=[],seen=new Set();if(z<13.4)return models;
let forestCount=0;
if(categoryOn.nature)for(const layer of ['landcover','landuse'])for(const f of featureList(layer)){
 const p=f.properties||{};if(!/wood|forest/.test(String(p.class||p.subclass||p.type||'')))continue;
 const polygons=f.geometry?.type==='Polygon'?[f.geometry.coordinates]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates:[];
 for(const polygon of polygons)for(const m of LSGeo.trees(polygon,[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],500)){
 if(seen.has(m.id)||forestCount>=500)continue;seen.add(m.id);models.push(m);forestCount++;}
}
window.lsTreeCount=forestCount;
for(const f of featureList('poi')){
 const p=f.properties||{},category=categoryOf(p);if(!['worship','landmark'].includes(category)||!categoryOn[category])continue;
 const coord=lngLat(f);if(!coord||!bounds.contains(coord))continue;
 const name=readableName(p).toLowerCase(),sub=String(p.subclass||p.class).toLowerCase();
 let type=/liberty|özgürlük/.test(name)?'liberty':/christ|cristo|jesus/.test(name)?'christ':/kaaba|kabe/.test(name)?'kaaba':/castle|fort|kale/.test(name+' '+sub)?'castle':/bridge|köprü/.test(name+' '+sub)?'bridge':/mosque|cami/.test(name+' '+sub)?'mosque':'monument';
 const id=coord.join()+type;if(seen.has(id))continue;seen.add(id);models.push({type,coord,id});if(models.length>=440)break;
}
const hour=window.lsPreviewTime?.(),night=hour===null||hour===undefined?document.body.classList.contains('night-theme'):(hour<360||hour>=1080);
if(z>=14.6 && night){
 let used=0;
 for(const f of [...featureList('building'),...missingBuildings()]){if(used>=210)break;
 const c=lngLat(f);if(!c||!bounds.contains(c))continue;
 const poly=f.geometry?.type==='Polygon'?f.geometry.coordinates[0]:f.geometry?.type==='MultiPolygon'?f.geometry.coordinates[0][0]:null;
 if(!poly||poly.length<4)continue;
 const id='b'+(f.id??f.properties?.osm_id??'')+':'+poly.map(p=>p.map(n=>n.toFixed(7)).join(',')).join(';');if(seen.has(id))continue;seen.add(id);models.push({type:'lightbuilding',coord:c,id,outline:poly,height:LSGeo.height(f.properties),base:LSGeo.base(f.properties)});used++;
 }
 for(const f of featureList('transportation')){if(used>=235)break;const p=f.properties||{};
 if(!(p.brunnel==='bridge'||p.bridge===1||p.bridge==='yes'||p.subclass==='bridge'))continue;
 const c=lngLat(f)|| (f.geometry?.type==='LineString'?f.geometry.coordinates[Math.floor(f.geometry.coordinates.length/2)]:null);
 if(c&&bounds.contains(c)&&f.geometry.type==='LineString'){const id='bridge'+f.geometry.coordinates.map(p=>p.join(',')).join(';');if(seen.has(id))continue;seen.add(id);models.push({type:'lightbridge',coord:c,id,outline:f.geometry.coordinates});used++}
 }
}
return models;}
function initThreeLayer(){if(!window.THREE||modelLayer)return;const T=THREE;const scene=new T.Scene();const camera=new T.Camera();const lights=new T.AmbientLight(0xffffff,1.4);scene.add(lights);const rendererConfig={};let renderer=null;const groups=[];
function mat(c){return new T.MeshLambertMaterial({color:c,flatShading:true})}const stone=mat(0x424449),stone2=stone,roof=stone,tree=stone,trunk=stone,gold=stone,black=stone,bronze=stone;
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
else if(type==='lightbridge'){ /* lamps follow actual bridge geometry below */ }
else{cube(g,0,6,0,14,12,14,stone);cone(g,0,15,0,8,7,roof,5)}return g}
const windowMat=new T.MeshBasicMaterial({color:0xffdf72,side:T.DoubleSide,depthTest:true,depthWrite:false});
function addWindows(g,m){const ring=m.outline,height=m.height,center=m.coord,base=m.base||0;
 if(height<=base+.9)return;
 if(!ring)return;const vertices=[];const mx=111320*Math.cos(center[1]*Math.PI/180),my=-111320;
 const signedArea=ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0);const outward=signedArea>0?-1:1;
 for(let e=0;e<ring.length-1;e++){
  const a=ring[e],b=ring[e+1],dx=(b[0]-a[0])*mx,dz=(b[1]-a[1])*my,length=Math.hypot(dx,dz);
  if(length<2.1||length>180)continue;
  const cols=Math.max(1,Math.min(12,Math.floor(length/3.1))),floors=Math.max(1,Math.min(12,Math.floor((height-base-1)/3.0)));
  for(let col=0;col<cols;col++)for(let floor=0;floor<floors;floor++){
   const seed=(e*41+col*13+floor*29 + ring.length*7)%11;if(seed<3)continue;
   const t=(col+.5)/cols,x=(a[0]+t*(b[0]-a[0])-center[0])*mx,z=(a[1]+t*(b[1]-a[1])-center[1])*my;
   const face=new T.Mesh(new T.PlaneGeometry(Math.min(1.1,length/cols*.48),Math.min(1.2,height*.21)),windowMat);
   // Offset away from the building wall to prevent z-fighting.
   face.position.set(x+outward*(dz/length)*.18,Math.min(height-.6,base+2.2+floor*3.0),z-outward*(dx/length)*.18);
   face.rotation.y=-Math.atan2(dz,dx);face.updateMatrix();
   const attr=face.geometry.attributes.position,indices=face.geometry.index.array;for(const index of indices){const v=new T.Vector3().fromBufferAttribute(attr,index).applyMatrix4(face.matrix);vertices.push(v.x,v.y,v.z);}face.geometry.dispose();
  }
 }
 if(vertices.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.add(new T.Mesh(geo,windowMat));}
}
// Keep world translations in the double precision camera matrix. GPU vertices stay local.
let anchor=null,anchorScale=1;
modelLayer={id:'ls-anchored-models',type:'custom',renderingMode:'3d',
 onAdd(m,gl){renderer=new T.WebGLRenderer({canvas:m.getCanvas(),context:gl,antialias:false});renderer.autoClear=false;},
 render(gl,args){if(!renderer||!anchor)return;const matrix=args?.defaultProjectionData?.mainMatrix||args?.matrix;if(!matrix)return;
 const world=new T.Matrix4().makeTranslation(anchor.x,anchor.y,anchor.z).scale(new T.Vector3(anchorScale,-anchorScale,anchorScale)).multiply(new T.Matrix4().makeRotationX(Math.PI/2));
 camera.projectionMatrix.fromArray(matrix).multiply(world);renderer.resetState();renderer.render(scene,camera);renderer.resetState();
 },onRemove(){for(const g of modelCache.values())g.traverse(o=>o.geometry?.dispose());modelCache.clear();window.lsUpdateThree=null;renderer?.dispose();}};
map.addLayer(modelLayer);
const modelCache=new Map();
window.lsSceneStats=()=>({count:modelCache.size,anchor:anchor?[anchor.x,anchor.y]:null});
window.lsUpdateThree=models=>{
 stone.color.set(document.body.classList.contains('night-theme')?'#26272b':'#3f4045');
 const z=map.getZoom(),desired=new Set(),C=maplibregl.MercatorCoordinate;
 const center=map.getCenter().toArray();
 if(!anchor||distanceMeters(center,anchor.toLngLat().toArray())>15000){anchor=C.fromLngLat(center,0);anchorScale=anchor.meterInMercatorCoordinateUnits();for(const g of modelCache.values()){scene.remove(g);g.traverse(o=>o.geometry?.dispose());}modelCache.clear();}
 if(z>=13.6)for(const m of models){const key=m.type+':'+m.id;desired.add(key);if(modelCache.has(key))continue;
 const mc=C.fromLngLat(m.coord,0),scale=mc.meterInMercatorCoordinateUnits()/anchorScale,g=geometry(m.type,m.id);
 if(m.type==='lightbuilding')addWindows(g,m);
 if(m.type==='lightbridge'){const line=m.outline;for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],length=distanceMeters(a,b),n=Math.max(1,Math.floor(length/18));for(let j=0;j<n;j++){const t=j/n,lon=a[0]+t*(b[0]-a[0]),lat=a[1]+t*(b[1]-a[1]),x=(lon-m.coord[0])*111320*Math.cos(m.coord[1]*Math.PI/180),south=-(lat-m.coord[1])*111320;const lamp=sphere(g,x,7,south,.55,windowMat);}}}
 g.position.set((mc.x-anchor.x)/anchorScale,0,(mc.y-anchor.y)/anchorScale);g.scale.setScalar(scale);scene.add(g);modelCache.set(key,g);
 }
 for(const [key,g] of modelCache){if(desired.has(key))continue;scene.remove(g);g.traverse(o=>o.geometry?.dispose());modelCache.delete(key);}
 map.triggerRepaint();
};
}
function refreshModels(){if(!map)return;if(window.lsUpdateThree)window.lsUpdateThree(featureModels());}
function init(){if(ready)return;map=state.map;if(!map?.isStyleLoaded())return;ready=true;initLayers();paintSea();initMissingBuildings();makeControls();initSearch();
let timer;const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{syncMissingBuildings();drawPOIs();refreshModels();refreshCoast();refreshMissingBuildings()},180)};
map.on('moveend',refresh);map.on('sourcedata',e=>{if(map.getSource(e.sourceId)?.type==='vector' && e.isSourceLoaded && !map.isMoving())refresh()});drawPOIs();
const three=document.createElement('script');three.src='./vendor/three.min.js';three.onload=()=>{initThreeLayer();refreshModels()};three.onerror=()=>console.warn('Three.js unavailable; native POI layer remains active');document.head.appendChild(three);
// Update as data changes, without resurrecting the old detached DOM markers.
setInterval(()=>{if(!map||!map.isStyleLoaded())return;drawPOIs();
const d=weatherState?.data;if(!d)return;const local=new Date(Date.now()+(d.utc_offset_seconds||0)*1000);const t=local.toISOString().slice(0,16);renderSkyBar({...d,current:{...d.current,time:t}});
if(window.lsPreviewTime()==null){const sun=d.daily?.sunrise?.[0]?.slice(11,16)||'06:00',set=d.daily?.sunset?.[0]?.slice(11,16)||'18:00',h=t.slice(11,16);applyDayNightTheme(h>=sun&&h<set);refreshModels();} },60000);
}
window.lsRefreshModels=refreshModels;
const poll=setInterval(()=>{if(state.map?.isStyleLoaded()){clearInterval(poll);init()}},350);
})();
