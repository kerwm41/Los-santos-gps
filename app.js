/* Los Santos GPS v2.0 — browser PWA. Requires HTTPS for geolocation. */
const $=id=>document.getElementById(id);
const state={map:null,position:null,heading:0,watch:null,destination:null,route:null,routeOptions:[],routeIndex:0,following:false,minimap:false,lastReroute:0,pendingCinema:false,activeWeather:'clear'};
const msg=(s)=>{const e=$('toast');e.textContent=s;e.hidden=false;clearTimeout(msg.timer);msg.timer=setTimeout(()=>e.hidden=true,5200)};
const fmtDist=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;
const fmtTime=s=>s<3600?`${Math.max(1,Math.round(s/60))} dk`:`${Math.floor(s/3600)} sa ${Math.round((s%3600)/60)} dk`;
const styleURL='https://tiles.openfreemap.org/styles/liberty';
let compassActive=false, compassHeading=null, lastCompassAt=0;
const wrapDegrees=n=>(n%360+360)%360;
function currentHeading(){return compassActive&&compassHeading!==null?compassHeading:state.heading;}
function applyDayNightTheme(dayFlag=null){
  const isDay = dayFlag!==null ? !!dayFlag : ((weatherState.data?.current?.is_day===1) || ((new Date()).getHours()>=7 && (new Date()).getHours()<20));
  document.body.classList.toggle('day-theme',isDay);
  document.body.classList.toggle('night-theme',!isDay);
  if(state.map&&state.map.getLayer('ls-3d-buildings')){try{state.map.setPaintProperty('ls-3d-buildings','fill-extrusion-color',isDay?'#3f4045':'#26272b');}catch(_){}}
}
function currentSeason(date=new Date()){const m=date.getMonth()+1;return m===12||m<=2?'winter':m<=5?'spring':m<=8?'summer':'autumn';}
function updateSeasonClass(){const s=currentSeason();document.body.classList.remove('season-winter','season-spring','season-summer','season-autumn');document.body.classList.add('season-'+s);return s;}
function updateMarkerHeading(){if(playerMarker)playerMarker.setRotation(currentHeading());}
function handleOrientation(e){
  let h=null;
  // iOS Safari supplies magnetic-north compass heading in clockwise degrees.
  if(typeof e.webkitCompassHeading==='number'&&Number.isFinite(e.webkitCompassHeading)){
    if(typeof e.webkitCompassAccuracy==='number'&&e.webkitCompassAccuracy<0)return;
    h=e.webkitCompassHeading;
  }else if(e.absolute===true&&typeof e.alpha==='number'&&Number.isFinite(e.alpha)){
    // Absolute alpha increases counter-clockwise; compensate for screen orientation.
    const a=(screen.orientation&&typeof screen.orientation.angle==='number')?screen.orientation.angle:0;
    h=360-e.alpha+a;
  }
  if(h===null)return;
  compassHeading=wrapDegrees(h);lastCompassAt=Date.now();
  updateMarkerHeading();
  if(state.following&&state.map)state.map.easeTo({bearing:compassHeading,duration:180});
  const b=$('heading');b.classList.add('on');b.setAttribute('aria-label','Pusula açık — yönü takip et');
}
async function enableCompass(){
 if(!window.DeviceOrientationEvent){msg('Bu tarayıcı pusula sensörünü desteklemiyor.');return false;}
 try{
   // Must run from a direct button tap on iOS.
   if(typeof DeviceOrientationEvent.requestPermission==='function'){
     const result=await DeviceOrientationEvent.requestPermission();
     if(result!=='granted'){msg('Pusula izni verilmedi. Safari’de izin verip tekrar dene.');return false;}
   }
   window.removeEventListener('deviceorientation',handleOrientation,true);
   window.removeEventListener('deviceorientationabsolute',handleOrientation,true);
   window.addEventListener('deviceorientation',handleOrientation,true);
   window.addEventListener('deviceorientationabsolute',handleOrientation,true);
   compassActive=true;
   msg('Pusula açıldı. Telefonunu sağa sola döndür.');
   setTimeout(()=>{if(!lastCompassAt||Date.now()-lastCompassAt>3500)msg('Pusula verisi gelmedi. iPhone Safari hareket ve yön erişimini kontrol et.');},3800);
   return true;
 }catch(err){console.warn('Compass permission:',err);msg('Pusula izni alınamadı. Safari ayarlarından Hareket ve Yön erişimini kontrol et.');return false;}
}

// Repaint the already-loaded working map; leave original sources and URLs untouched.
// Per-layer exceptions are isolated so an unusual layer cannot blank the entire map.
function applyGTATint(map){
  const layers=map.getStyle()?.layers||[];
  let done=0;
  for(const layer of layers){
    const id=layer.id.toLowerCase();
    const src=(layer['source-layer']||'').toLowerCase();
    const tag=id+' '+src;
    const set=(k,v)=>{try{map.setPaintProperty(layer.id,k,v);done++;}catch(err){console.warn('Theme layer:',layer.id,k,err);}};
    if(layer.type==='background'){set('background-color','#303033');continue;}
    if(layer.type==='fill'){
      if(/water|ocean|river|lake/.test(tag))set('fill-color','#232931');
      else if(/building/.test(tag))set('fill-color','#242427');
      else if(/park|forest|wood|grass|pitch|landcover|landuse|vegetation/.test(tag))set('fill-color','#38393b');
      else if(/road|transport|bridge|tunnel/.test(tag))set('fill-color','#c7c6c5');
      else set('fill-color','#303033');
      if(layer.paint&&layer.paint['fill-pattern']!==undefined)set('fill-pattern',null);
    } else if(layer.type==='line'){
      if(/road|street|highway|transport|bridge|tunnel/.test(tag)){
        const casing=/casing|outline|border/.test(tag);
        const major=/motorway|trunk|primary|major/.test(tag);
        set('line-color',casing?'#68696c':major?'#e0dfdd':'#c1c0bf');
      }else if(/water|river|stream/.test(tag))set('line-color','#2b3139');
      else if(/rail/.test(tag))set('line-color','#7d7d80');
      else set('line-color','#5a5a5d');
    }else if(layer.type==='symbol'){
      if(/poi|airport|transit|housenumber/.test(tag)){
        // Hide decorative labels and icons; retain district/street labels.
        try{map.setLayoutProperty(layer.id,'visibility','none');}catch(_e){}
      }else{
        set('text-color','#e2e1e4');set('text-halo-color','#242428');set('text-halo-width',1.1);
      }
    }else if(layer.type==='fill-extrusion')set('fill-extrusion-color','#242427');
  }
  console.info('GTA theme applied:',done,'paint properties');
}

// Preserve street labels at high zoom; do not invent street names missing from source.
function improveStreetLabels(map){
 for(const layer of map.getStyle()?.layers||[]){
  const tag=(layer.id+' '+(layer['source-layer']||'')).toLowerCase();
  if(layer.type!=='symbol'||!/road|street|transport|highway/.test(tag)||!/label|name|text/.test(tag))continue;
  try{
   if(layer.layout?.['text-field']!==undefined){
    if(layer.minzoom>15)map.setLayerZoomRange(layer.id,15,layer.maxzoom||24);
    map.setPaintProperty(layer.id,'text-color','#e7e7ea');
    map.setPaintProperty(layer.id,'text-halo-color','#222329');
    map.setPaintProperty(layer.id,'text-halo-width',1.4);
    map.setLayoutProperty(layer.id,'text-optional',true);
   }
  }catch(err){console.warn('Street label fallback',err);}
 }
}

// Vector road labels: OpenMapTiles transportation_name includes street names not present in the default visible layers.

function addLocalStreetNames(map){
  const style=map.getStyle(); if(!style) return;
  const source=(style.layers.find(l=>l['source-layer']==='transportation_name')||style.layers.find(l=>/transportation/.test(l['source-layer']||'')))?.source;
  if(!source) return;
  const add=(id,layout,paint,flt)=>{ if(map.getLayer(id)) return; try{ map.addLayer({id,type:'symbol',source,'source-layer':'transportation_name',minzoom:13.2,filter:flt||['has','name'],layout,paint}); }catch(err){ console.warn('Street layer',id,err);} };
  add('ls-street-names-line',{
    'symbol-placement':'line','symbol-spacing':220,'text-field':['coalesce',['get','name:tr'],['get','name']],
    'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],13.2,10,15,12,18,15],
    'text-max-angle':35,'text-rotation-alignment':'map','text-allow-overlap':false,'text-ignore-placement':false
  },{'text-color':'#f1f2f6','text-halo-color':'#1a1c22','text-halo-width':2,'text-opacity':['interpolate',['linear'],['zoom'],13.2,.55,15,.98]},['has','name']);
  add('ls-street-names-point',{
    'symbol-placement':'point','text-field':['coalesce',['get','name:tr'],['get','name']],'text-font':['Noto Sans Regular'],
    'text-size':['interpolate',['linear'],['zoom'],14,10,17,12],'text-allow-overlap':false,'text-ignore-placement':false
  },{'text-color':'#f4f4f6','text-halo-color':'#1a1c22','text-halo-width':2,'text-opacity':['interpolate',['linear'],['zoom'],14,0,15.2,.75,17,.92]},['has','name']);
}
function add3DBuildings(map){
  if(map.getLayer('ls-3d-buildings')) return;
  const layers=map.getStyle()?.layers||[];
  const base=layers.find(l=>/building/.test(((l['source-layer']||'')+' '+l.id).toLowerCase()) && ['fill','line'].includes(l.type));
  if(!base) return;
  try{
    map.addLayer({id:'ls-3d-buildings',type:'fill-extrusion',source:base.source,'source-layer':base['source-layer'],minzoom:14.2,
      paint:{
        'fill-extrusion-color': document.body.classList.contains('day-theme') ? '#3f4045' : '#26272b',
        'fill-extrusion-height':['coalesce',['to-number',['get','render_height'],0],['to-number',['get','height'],0],12],
        'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],
        'fill-extrusion-opacity':['interpolate',['linear'],['zoom'],14.2,.75,17,.96]
      }
    });
  }catch(err){console.warn('3D buildings unavailable',err);}
}
async function start(){

  const status=$('status');
  if(typeof window.maplibregl==='undefined'){
    status.textContent='HARİTA MOTORU YÜKLENEMEDİ';
    msg('Harita kütüphanesi yüklenemedi. Safari’de sayfayı yenile veya başka ağ dene.');
    return;
  }
  const initialize=(style)=>{
    state.map=new maplibregl.Map({container:'map',style,center:[29.394,40.773],zoom:13,pitch:0,bearing:0,attributionControl:false,dragRotate:true,pitchWithRotate:true,touchPitch:true});
    state.map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
    let hasLoaded=false;
    state.map.on('load',()=>{
      hasLoaded=true;
      try{applyGTATint(state.map);improveStreetLabels(state.map);addLocalStreetNames(state.map);addWaterDepthBands(state.map);add3DBuildings(state.map);}catch(e){console.warn('GTA theme unavailable; basic map remains visible',e);}
      ensureZoneLayers(state.map);
      try{state.map.dragRotate.enable();state.map.touchZoomRotate.enableRotation();state.map.touchPitch.enable();}catch(_){ }
      state.map.addSource('route',{type:'geojson',data:emptyGeo()});
      state.map.addLayer({id:'route-halo',type:'line',source:'route',paint:{'line-color':'#2a102e','line-width':12,'line-opacity':.95},layout:{'line-cap':'round','line-join':'round'}});
      state.map.addLayer({id:'route-main',type:'line',source:'route',paint:{'line-color':'#a957e9','line-width':7,'line-opacity':.94},layout:{'line-cap':'round','line-join':'round'}});
      status.textContent='HEDEF SEÇ VEYA ARA';
    });
    state.map.on('click',e=>{if(!state.destination)setDestination(e.lngLat.lng,e.lngLat.lat,'Haritada seçilen hedef')});
    state.map.on('error',e=>{console.error('Map error',e.error);if(!hasLoaded){status.textContent='HARİTA VERİ HATASI';msg('Harita sunucusuna erişilemiyor. Ağını kontrol edip sayfayı yenile.')}});
    setTimeout(()=>{if(!hasLoaded&&status.textContent==='HARİTA YÜKLENİYOR'){status.textContent='HARİTA SUNUCUSU YANIT VERMİYOR';msg('Harita yüklenmedi. Safari’de sayfayı yeniden yükle.')}},16000);
  };
  try{initialize(styleURL);}catch(err){console.error(err);status.textContent='HARİTA HATASI';msg('Harita açılmadı. Safari sayfasını yenile.');}
}

function emptyGeo(){return{type:'FeatureCollection',features:[]}}
let playerMarker=null,destMarker=null;
function locate(){if(!navigator.geolocation){msg('Bu tarayıcıda GPS kullanılamıyor.');return;}
 if(state.watch!==null){state.following=true;state.pendingCinema=cinema.auto;if(state.position){state.map?.flyTo({center:state.position,zoom:16});if(state.pendingCinema&&!cinema.busy){state.pendingCinema=false;cinema.played=true;setTimeout(()=>playCinema(cinema.mode),120);}}return;}
 state.pendingCinema=cinema.auto;$('status').textContent='KONUM ALINIYOR';
 state.watch=navigator.geolocation.watchPosition(p=>{
  const pos=[p.coords.longitude,p.coords.latitude];state.position=pos;state.heading=Number.isFinite(p.coords.heading)?p.coords.heading:state.heading;
  $('speed').innerHTML=`${Math.max(0,Math.round((p.coords.speed||0)*3.6))} <small>km/sa</small>`;
  $('gpsDot').style.color=p.coords.accuracy<60?'#81e6ad':'#ebbb66';$('status').textContent=`GPS ±${Math.round(p.coords.accuracy)} M`;
  if(!playerMarker){const el=document.createElement('div');el.className='player';playerMarker=new maplibregl.Marker({element:el,rotationAlignment:'map'}).setLngLat(pos).addTo(state.map);}else playerMarker.setLngLat(pos);
  if(playerMarker)updateMarkerHeading();
  if(state.following)state.map.easeTo({center:pos,zoom:state.minimap?17:16,bearing:currentHeading(),pitch:state.minimap?35:0,duration:650});
  if(state.pendingCinema&&state.map?.isStyleLoaded()&&!cinema.busy){state.pendingCinema=false;cinema.played=true;setTimeout(()=>playCinema(cinema.mode),180);}
  if(state.destination&&!state.route)calculateRoute();
  if(state.route&&state.following)updateGuidance(pos);
 },err=>{console.error(err);$('status').textContent='GPS İZNİ GEREKLİ';msg('Konum alınamadı: Safari ayarlarında konum izni ver ve HTTPS kullan.');},{enableHighAccuracy:true,maximumAge:1500,timeout:16000});
}
function setDestination(lng,lat,name){if(!state.map)return;state.destination=[lng,lat];state.route=null;$('destination').textContent=name;$('routepanel').hidden=false;$('distance').textContent='...';$('duration').textContent='...';$('instruction').textContent='Rota hazırlanıyor';if(destMarker)destMarker.remove();const el=document.createElement('div');el.className='destinationMarker';el.textContent='◆';el.style.color='#b85df5';destMarker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(state.map);state.map.flyTo({center:[lng,lat],zoom:15});if(state.position)calculateRoute();else{$('instruction').textContent='Rota için GPS konumunu aç.';msg('Rota oluşturmak için ◎ konum düğmesine dokun.');}}
async function calculateRoute(){if(!state.position||!state.destination)return;
 const [a,b]=[state.position,state.destination];const url=`https://router.project-osrm.org/route/v1/driving/${a.join(',')};${b.join(',')}?overview=full&geometries=geojson&steps=true&alternatives=true`;
 try{const resp=await fetch(url);if(!resp.ok)throw Error('Rota servisi yanıt vermedi');const data=await resp.json();if(data.code!=='Ok'||!data.routes?.length)throw Error('Uygun araç rotası bulunamadı');state.routeOptions=data.routes;state.routeIndex=0;applyRoute();}
 catch(err){console.error(err);$('instruction').textContent='Rota alınamadı';msg('Rota servisi şu anda kullanılamıyor. Daha sonra tekrar dene.');}
}
function applyRoute(){const r=state.routeOptions[state.routeIndex];if(!r)return;state.route=r;const src=state.map.getSource('route');if(!src)return;src.setData({type:'Feature',geometry:r.geometry,properties:{}});$('distance').textContent=fmtDist(r.distance);$('duration').textContent=fmtTime(r.duration);$('instruction').textContent=`${state.routeOptions.length>1?'Alternatif rotalar bulundu. ':''}Tahmini araç rotası hazır.`;state.map.fitBounds(r.geometry.coordinates.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(r.geometry.coordinates[0],r.geometry.coordinates[0])),{padding:{top:240,bottom:150,left:40,right:65},maxZoom:16,duration:650});}
function clearRoute(){state.destination=null;state.route=null;state.routeOptions=[];state.following=false;$('routepanel').hidden=true;if(destMarker){destMarker.remove();destMarker=null}state.map?.getSource('route')?.setData(emptyGeo());$('followRoute').textContent='▶ NAVİGASYONU BAŞLAT';}
function rad(n){return n*Math.PI/180}function distanceMeters(a,b){const dlat=rad(b[1]-a[1]),dlon=rad(b[0]-a[0]);const v=Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(v)));}
function updateGuidance(pos){if(!state.route)return;let best=Infinity;for(const pt of state.route.geometry.coordinates){const d=distanceMeters(pos,pt);if(d<best)best=d;}if(best>85&&Date.now()-state.lastReroute>30000){state.lastReroute=Date.now();$('instruction').textContent='Rota yeniden hesaplanıyor';calculateRoute();return;}
 const steps=state.route.legs?.flatMap(l=>l.steps)||[];let next=null;for(const step of steps){if(distanceMeters(pos,step.maneuver.location)>20){next=step;break}}if(next){const m=next.maneuver;const dist=distanceMeters(pos,m.location);$('instruction').textContent=`${fmtDist(dist)} sonra ${translateManeuver(m)}`;}else $('instruction').textContent='Hedefe yaklaşıyorsunuz';}
function translateManeuver(m){const mod=m.modifier||'';const direction=mod.includes('left')?'sola':mod.includes('right')?'sağa':'';if(m.type==='arrive')return 'hedefe ulaşın';if(m.type==='roundabout'||m.type==='rotary')return 'döner kavşağa girin';if(m.type==='depart')return 'yola devam edin';if(m.type==='turn'||m.type==='fork'||m.type==='end of road')return `${direction||'düz'} dönün`;return direction?`${direction} devam edin`:'düz devam edin';}
async function search(e){e.preventDefault();const query=$('query').value.trim();if(query.length<3){msg('En az 3 karakter yaz.');return;}const area=$('results');area.hidden=false;area.textContent='Aranıyor...';try{const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=tr&q=${encodeURIComponent(query)}`;const res=await fetch(url,{headers:{Accept:'application/json'}});if(!res.ok)throw Error('Arama servisinde hata');const data=await res.json();area.replaceChildren();if(!data.length){area.textContent='Sonuç bulunamadı';return;}for(const p of data){const b=document.createElement('button');const strong=document.createElement('strong');strong.textContent=p.name||p.display_name.split(',')[0];const small=document.createElement('small');small.textContent=p.display_name;b.append(strong,small);b.onclick=()=>{setDestination(Number(p.lon),Number(p.lat),strong.textContent);area.hidden=true;$('query').blur();};area.appendChild(b);}}catch(err){console.error(err);area.textContent='Arama başarısız. Biraz sonra tekrar deneyin.';}}
$('searchForm').addEventListener('submit',search);$('locate').onclick=locate;$('clearRoute').onclick=clearRoute;$('zoomIn').onclick=()=>state.map?.zoomIn();$('zoomOut').onclick=()=>state.map?.zoomOut();
$('mode').onclick=()=>{state.minimap=!state.minimap;document.body.classList.toggle('minimap',state.minimap);$('mode').classList.toggle('on',state.minimap);$('mode').setAttribute('aria-pressed',String(state.minimap));state.map?.easeTo({zoom:state.minimap?17:14,pitch:state.minimap?35:0,bearing:state.minimap?currentHeading():0});};
$('heading').onclick=async()=>{const ok=await enableCompass();if(!ok)return;state.following=true;if(state.position)state.map?.easeTo({center:state.position,bearing:currentHeading(),zoom:16});else locate();};
$('followRoute').onclick=()=>{if(!state.route){msg('Önce geçerli bir rota oluştur.');return;}state.following=!state.following;$('followRoute').textContent=state.following?'■ NAVİGASYONU DURDUR':'▶ NAVİGASYONU BAŞLAT';if(state.following){if(state.watch===null)locate();state.map.easeTo({center:state.position||state.destination,bearing:currentHeading(),zoom:17,pitch:35});msg('Canlı navigasyon açık. Ekran kilitliyken web uygulaması durabilir.');}};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
start();


/* v0.7 — two opt-in cinematic camera transitions. GPS and routes work as before. */
const cinema={busy:false,mode:'heavy',auto:true,played:false,weather:'auto',coastal:false};
const delay=t=>new Promise(resolve=>setTimeout(resolve,t));
function cinemaTarget(){return state.position||state.map?.getCenter()?.toArray()||[29.394,40.773];}
function cameraStep(options){return new Promise(resolve=>{
  if(!state.map){resolve();return;}
  const duration=options.duration||700;
  state.map.easeTo({...options,essential:true});
  setTimeout(resolve,duration+90); // finite fallback even if animation interrupted
});}

// Real weather uses current GPS coordinates; graceful fallback if permission or service fails.
let latestWeather={at:0,key:'',type:'cloud'};
function weatherKind(code,clouds=0){
 if([95,96,99].includes(code))return 'storm';
 if([71,73,75,77,85,86].includes(code))return 'snow';
 if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rain';
 if([45,48].includes(code))return 'fog';
 return clouds>=70?'cloud':clouds>=30?'cloud':'clear';
}
async function getWeather(){
 if(cinema.weather!=='auto')return cinema.weather;
 if(!state.position)return 'cloud';
 const key=state.position.map(v=>v.toFixed(2)).join(',');
 if(latestWeather.key===key&&Date.now()-latestWeather.at<600000)return latestWeather.type;
 const [lon,lat]=state.position;
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),3300);
 try{
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=weather_code,cloud_cover&timezone=auto`;
  const res=await fetch(url,{signal:controller.signal});if(!res.ok)throw Error('Weather unavailable');
  const data=await res.json();const type=weatherKind(data.current?.weather_code,data.current?.cloud_cover);
  latestWeather={key,at:Date.now(),type};return type;
 }catch(err){console.warn('Weather fallback:',err);return 'cloud';}finally{clearTimeout(timeout)}
}
function buildWeatherParticles(type){
 const parent=$('weatherParticles');parent.replaceChildren();
 if(!['rain','storm','snow'].includes(type))return;
 const count=type==='snow'?35:type==='storm'?62:42;
 const frag=document.createDocumentFragment();
 for(let i=0;i<count;i++){
  const part=document.createElement('i');part.className='particle';
  const rand=n=>((Math.sin(i*93.17+n*21.8)*43758.5453)%1+1)%1;
  const isSnow=type==='snow';
  part.style.setProperty('--x',`${rand(1)*105}%`);part.style.setProperty('--w',`${isSnow?2+rand(2)*5:1}px`);
  part.style.setProperty('--h',`${isSnow?2+rand(3)*5:12+rand(3)*26}px`);
  part.style.setProperty('--a',`${.2+rand(4)*.65}`);
  part.style.setProperty('--d',`${isSnow?3+rand(5)*3:.55+rand(5)*.7}s`);
  part.style.setProperty('--delay',`${-rand(6)*5}s`);frag.appendChild(part);
 }
 parent.appendChild(frag);
}
const weatherSelect=$('weatherMode'); if(weatherSelect) weatherSelect.addEventListener('change',e=>{cinema.weather=e.target.value;});


async function detectCoastalMood(target){
 try{
   if(!state.map||!target) return false;
   const pt=state.map.project(target);
   const box=[[pt.x-130,pt.y-130],[pt.x+130,pt.y+130]];
   const feats=state.map.queryRenderedFeatures(box);
   return feats.some(f=>{
     const id=(f.layer&&f.layer.id||'').toLowerCase();
     const src=(f.layer&&f.layer['source-layer']||'').toLowerCase();
     const all=id+' '+src;
     return /water|ocean|river|lake|sea|coast/.test(all);
   });
 }catch(err){console.warn('Coast detect fallback',err);return false;}
}

async function playCinema(kind=cinema.mode){
 if(cinema.busy||!state.map||!state.map.isStyleLoaded()){msg('Haritanın yüklenmesini bekle.');return;}
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){state.map.easeTo({center:cinemaTarget(),zoom:16,duration:250});return;}
 cinema.busy=true;cinema.mode=kind;
 const scene=$('cinemaScene');scene.classList.remove('light','heavy','active','out');
 scene.classList.add(kind,'active');document.body.classList.add('cinema-running');
 const weather=await getWeather();
 const target=cinemaTarget();
 cinema.coastal=await detectCoastalMood(target);
 scene.classList.remove('weather-rain','weather-snow','weather-clear','weather-cloud','weather-fog','weather-storm','coastal');
 scene.classList.add('weather-'+weather);
 if(cinema.coastal) scene.classList.add('coastal');
 buildWeatherParticles(weather);
 try{
   if(kind==='light'){
     await cameraStep({zoom:Math.max(9,Math.min(11,state.map.getZoom()-2.5)),pitch:0,duration:650});
     await delay(210);
     await cameraStep({center:target,zoom:16,pitch:28,bearing:state.following?currentHeading():0,duration:1450});
   }else{
     await cameraStep({zoom:7.5,pitch:0,bearing:0,duration:950});
     await delay(390);
     await cameraStep({center:target,zoom:11.5,pitch:12,duration:850});
     await delay(180);
     await cameraStep({center:target,zoom:16.5,pitch:48,bearing:state.following?currentHeading():0,duration:1580});
   }
 }finally{
   scene.classList.add('out');
   await delay(600);
   scene.classList.remove('active','out','light','heavy','weather-rain','weather-snow','weather-clear','weather-cloud','weather-fog','weather-storm','coastal');$('weatherParticles').replaceChildren();
   document.body.classList.remove('cinema-running');cinema.busy=false;
 }
}



/* v1.0 — discreet weather, in-app details and nearby real OSM points. */
const weatherState={data:null,updated:0,coordinate:null};
let lastNearbyFetch=0, nearbyController=null, poiMarkers=[];
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sheet(title,content){$('sheetTitle').textContent=title;$('sheetBody').innerHTML=content;$('infoBackdrop').hidden=false;$('infoSheet').hidden=false;}
function closeSheet(){$('infoBackdrop').hidden=true;$('infoSheet').hidden=true;}
$('sheetClose').onclick=closeSheet;$('infoBackdrop').onclick=closeSheet;
function weatherSymbol(code,isDay=true){if([95,96,99].includes(code))return '⛈';if([71,73,75,77,85,86].includes(code))return '❄';if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '🌧';if([45,48].includes(code))return '🌫';if([1,2].includes(code))return isDay?'🌤':'☁';if(code===3)return '☁';return isDay?'☀':'☾';}
async function updateWeather(force=false){
 const p=state.position||state.map?.getCenter()?.toArray();if(!p)return null;
 if(!force&&weatherState.data&&Date.now()-weatherState.updated<10*60*1000&&weatherState.coordinate&&distanceMeters(p,weatherState.coordinate)<10000)return weatherState.data;
 try{
  const [lon,lat]=p;const controller=new AbortController();const t=setTimeout(()=>controller.abort(),6000);
  let resp;try{resp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=sunrise,sunset&forecast_days=1&timezone=auto`,{signal:controller.signal});}finally{clearTimeout(t)}
  if(!resp.ok)throw new Error('Weather HTTP '+resp.status);
  const data=await resp.json();weatherState.data=data;weatherState.updated=Date.now();weatherState.coordinate=[...p];
  $('weatherIcon').textContent=weatherSymbol(data.current?.weather_code,data.current?.is_day===1);$('weatherTemp').textContent=Math.round(data.current?.temperature_2m??0)+'°';
  state.activeWeather=weatherKind(data.current?.weather_code,data.current?.cloud_cover);
  applyDayNightTheme(data.current?.is_day===1); updateSeasonClass(); renderSkyBar(data); renderEnvironmentalEffects(); refreshBuildingLights(); return data;
 }catch(e){console.warn('Weather unavailable',e);$('weatherTemp').textContent='—°';return weatherState.data;}
}
$('weatherChip').onclick=async()=>{
 sheet('Hava durumu','<p>Güncel hava bilgileri yükleniyor…</p>');
 const data=await updateWeather();if($('infoSheet').hidden||$('sheetTitle').textContent!=='Hava durumu')return;
 if(!data){$('sheetBody').innerHTML='<p>Hava durumu verisi alınamadı. İnternetini kontrol edip tekrar deneyebilirsin.</p>';return;}
 const w=data.current||{};const rows=[['Hissedilen',Math.round(w.apparent_temperature??0)+'°C'],['Nem',String(w.relative_humidity_2m??'—')+'%'],['Rüzgâr',String(w.wind_speed_10m??'—')+' km/sa'],['Bulutluluk',String(w.cloud_cover??'—')+'%'],['Yağış',String(w.precipitation??'—')+' mm']];
 const hourly=data.hourly||{};const nowTime=data.current?.time||'';const first=(hourly.time||[]).findIndex(t=>t>=nowTime.slice(0,13)+':00');const start=Math.max(0,first);let hourlyHTML='';
 for(let i=start;i<Math.min(start+5,(hourly.time||[]).length);i++){const hour=hourly.time[i].slice(11,16);hourlyHTML+=`<span class="sheet-pill">${hour} ${weatherSymbol(hourly.weather_code?.[i],true)} ${Math.round(hourly.temperature_2m?.[i]??0)}° · 🌧%${hourly.precipitation_probability?.[i]??'—'}</span>`;}
 $('sheetBody').innerHTML=`<p style="font-size:24px">${weatherSymbol(w.weather_code,w.is_day===1)} ${Math.round(w.temperature_2m??0)}°C</p><div class="sheet-list">${rows.map(r=>`<div class="sheet-row"><span>${r[0]}</span><strong>${r[1]}</strong></div>`).join('')}</div><h3>Saatlik tahmin</h3>${hourlyHTML}<p class="sheet-muted">Kaynak: Open-Meteo · yaklaşık bölgesel tahmin</p>`;
};
$('travelChip').onclick=()=>{
 const hasTarget=!!state.destination;let walking='—';if(hasTarget&&state.position){const metres=distanceMeters(state.position,state.destination);walking='≈ '+Math.max(1,Math.round(metres*1.3/83.33))+' dk*';}
 const driving=state.route?fmtTime(state.route.duration):'—';
 sheet('Ulaşım seçenekleri',`<p>${hasTarget?'Seçtiğin hedefe ulaşım karşılaştırması':'Önce haritada bir hedef seç veya adres ara.'}</p><div class="sheet-list">
 <div class="sheet-row"><span>🚶 Yürüyerek</span><strong>${walking}</strong></div>
 <div class="sheet-row"><span>🚗 Arabayla</span><strong>${driving}</strong></div>
 <div class="sheet-row"><span>🚌 Otobüsle</span><strong>Sefer verisi yok</strong></div>
 <div class="sheet-row"><span>🚆 Trenle</span><strong>Sefer verisi yok</strong></div></div>
 <p class="sheet-muted">*Yürüyüş yalnızca kuş uçuşu uzaklıktan yaklaşık tahmindir, gerçek yürüme rotası değildir. Araç süresi OSRM rotasından gelir; canlı trafik içermez. Otobüs/tren için güvenilir tarife entegrasyonu henüz yok.</p>`);
};
function poiClass(t){
 const a=t.amenity||'', shop=t.shop||'', tourism=t.tourism||'';
 if(['hospital','clinic','doctors','dentist','pharmacy'].includes(a)||t.healthcare)return ['✚',a==='pharmacy'?'Eczane':'Sağlık','health'];
 if(['restaurant','fast_food','food_court'].includes(a))return ['🍴','Restoran','food'];
 if(['cafe','bar','pub','ice_cream'].includes(a))return ['☕','Kafe / içecek','food'];
 if(a==='library')return ['▤','Kütüphane','culture'];
 if(['school','university','college','kindergarten'].includes(a))return ['▣','Eğitim','culture'];
 if(t.historic||['museum','attraction','viewpoint','gallery'].includes(tourism))return ['◆','Tarihî / turistik','nature'];
 if(['park','nature_reserve'].includes(t.leisure)||['wood','peak','waterfall','beach'].includes(t.natural)||t.landuse==='forest')return ['♣','Doğa','nature'];
 if(['supermarket','convenience','bakery','mall'].includes(shop))return ['▦','Market / mağaza','shopping'];
 if(a==='fuel'||a==='parking')return ['▰','Ulaşım','travel'];
 if(shop)return ['▦','Mağaza','shopping'];
 return ['●','Mekân','other'];
}
function safeExternal(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
function statusHours(raw){
 if(!raw)return 'Çalışma saati paylaşılmamış';
 if(raw==='24/7')return '24 saat açık';
 return 'Çalışma saatleri: '+raw;
}
function openingState(raw){ if(!raw) return 'Durum bilinmiyor'; if(raw==='24/7') return 'Şu an açık'; return 'Saat bilgisi mevcut'; }
async function showPOI(item){
 const t=item.tags||{},name=t['name:tr']||t.name||'İsimsiz mekân',category=poiClass(t)[1];
 const details=[t['addr:street'],t['addr:housenumber'],t['addr:city']].filter(Boolean).join(' ');
 const links=[];if(t.website||t['contact:website']){const url=safeExternal(t.website||t['contact:website']);if(url)links.push(`<a class="sheet-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">Resmî site ↗</a>`);}
 if(t.phone||t['contact:phone']){const phone=t.phone||t['contact:phone'];links.push(`<a class="sheet-link" href="tel:${escapeHTML(phone.replace(/[^+\d]/g,''))}">${escapeHTML(phone)}</a>`);}
 const menu=safeExternal(t['website:menu']||t['menu:website']||t['menu:url']||t.menu||'');if(menu)links.push(`<a class="sheet-link" href="${escapeHTML(menu)}" target="_blank" rel="noopener">Menüyü görüntüle ↗</a>`);
 const cover=safeExternal(t.image||'');const image=cover?`<img class="sheet-img" src="${escapeHTML(cover)}" loading="lazy" alt="${escapeHTML(name)}">`:'';
 let base=`${image}<p class="sheet-muted">${escapeHTML(category)}</p>${details?`<p>${escapeHTML(details)}</p>`:''}<p>🕒 ${escapeHTML(statusHours(t.opening_hours))}</p><p>• ${escapeHTML(openingState(t.opening_hours))}</p>${t.description?`<p>${escapeHTML(t.description)}</p>`:''}${links.length?`<p>${links.join(' · ')}</p>`:''}<p class="sheet-muted">Açık/kapalı durumu yalnızca veri varsa gösterilir. OpenStreetMap bilgileri eksik veya eski olabilir.</p><button class="sheet-action" id="poiGo">📍 Buraya rota oluştur</button>`;
 sheet(name,base);$('poiGo').onclick=()=>{setDestination(item.lon??item.center?.lon,item.lat??item.center?.lat,name);closeSheet();};
 const wiki=t.wikipedia;if(!wiki||!/^([a-z-]+):(.+)$/.test(wiki))return;
 const language=wiki.split(':')[0],title=wiki.slice(language.length+1);
 if(!/^(tr|en|de|fr)$/.test(language))return;
 try{const resp=await fetch(`https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g,'_'))}`);if(!resp.ok)return;const data=await resp.json();if($('infoSheet').hidden||$('sheetTitle').textContent!==name)return;
  const img=data.thumbnail?.source?`<img class="sheet-img" src="${escapeHTML(data.thumbnail.source)}" alt="${escapeHTML(name)}">`:'';
  const desc=data.extract?`<p>${escapeHTML(data.extract.slice(0,750))}</p>`:'';
  $('sheetBody').insertAdjacentHTML('afterbegin',img+desc+'<p class="sheet-muted">Tarihî bilgi: Wikipedia</p>');
 }catch(err){console.warn('Wikipedia info not available',err);}
}
function clearPOIs(){for(const m of poiMarkers)m.remove();poiMarkers=[];}
async function loadNearbyPOIs(){
 if(!state.map||state.map.getZoom()<13){clearPOIs();return;}
 if(Date.now()-lastNearbyFetch<16000)return;lastNearbyFetch=Date.now();
 const c=state.map.getCenter();if(nearbyController)nearbyController.abort();nearbyController=new AbortController();
 const q=`[out:json][timeout:14];(nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[amenity~"^(restaurant|cafe|fast_food|pharmacy|hospital|clinic|doctors|dentist|library|school|university|college|fuel|parking|bank|atm)$"];nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[shop~"^(supermarket|convenience|bakery|mall|clothes|books)$"];nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[historic];nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[tourism~"^(museum|attraction|viewpoint|gallery)$"];nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[amenity=place_of_worship];nwr(around:1300,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[natural~"^(peak|beach|waterfall)$"];);out center 110;`;
 try{const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:q,signal:nearbyController.signal});if(!resp.ok)throw Error('Overpass '+resp.status);const data=await resp.json();if(!state.map||state.map.getZoom()<13)return;clearPOIs();
  for(const item of (data.elements||[]).slice(0,65)){const lng=item.lon??item.center?.lon,lat=item.lat??item.center?.lat;if(!Number.isFinite(lng)||!Number.isFinite(lat))continue;const el=document.createElement('button');el.className='poi-marker';const [icon,category,colorClass]=poiClass(item.tags||{});el.classList.add("poi-"+colorClass);el.textContent=icon;el.type='button';el.title=item.tags?.name||category;el.setAttribute('aria-label',el.title);el.onclick=e=>{e.stopPropagation();showPOI(item);};poiMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(state.map));}
 }catch(e){if(e.name!=='AbortError')console.warn('POI data temporarily unavailable',e);}
}


/* v1.1 — auto cinema fix, layered water, restricted zones, forest markers, traffic status */
let forestMarkers=[]; let restrictedController=null, forestController=null;
function addWaterDepthBands(map){
  if(map.getLayer('water-depth-band-1')) return;
  const layers=map.getStyle()?.layers||[];
  const base=layers.find(l=>l.source && l.type==='fill' && /water/.test(((l['source-layer']||'')+' '+l.id).toLowerCase()));
  if(!base) return;
  const src=base.source, srcLayer=base['source-layer'];
  const defs=[
    ['water-depth-band-1','#7ee0f5',['interpolate',['linear'],['zoom'],6,0,9,0.10,13,0.20,16,0.30],['interpolate',['linear'],['zoom'],6,0.8,10,2.0,13,5.5,16,12]],
    ['water-depth-band-2','#4eb1db',['interpolate',['linear'],['zoom'],6,0,9,0.11,13,0.22,16,0.34],['interpolate',['linear'],['zoom'],6,1.0,10,3.0,13,8.0,16,18]],
    ['water-depth-band-3','#2a7fb1',['interpolate',['linear'],['zoom'],6,0,9,0.10,13,0.20,16,0.30],['interpolate',['linear'],['zoom'],6,1.2,10,4.6,13,11,16,24]],
    ['water-depth-band-4','#193f71',['interpolate',['linear'],['zoom'],6,0,9,0.08,13,0.17,16,0.26],['interpolate',['linear'],['zoom'],6,1.5,10,6.4,13,15,16,34]],
  ];
  for(const [id,color,opacity,width] of defs){
    try{map.addLayer({id,type:'line',source:src,'source-layer':srcLayer,paint:{'line-color':color,'line-opacity':opacity,'line-width':width}}, base.id);}catch(err){console.warn('water band',id,err)}
  }
}
function ensureZoneLayers(map){
  if(!map.getSource('restricted-zones')){
    map.addSource('restricted-zones',{type:'geojson',data:emptyGeo()});
    map.addLayer({id:'restricted-fill',type:'fill',source:'restricted-zones',paint:{'fill-color':'#d91f33','fill-opacity':0.18}});
    map.addLayer({id:'restricted-line',type:'line',source:'restricted-zones',paint:{'line-color':'#ff4d5f','line-width':['interpolate',['linear'],['zoom'],9,1,13,2.5,16,4],'line-opacity':0.82}});
  }
}
function wayGeomToFeature(geom,props={}){
  if(!geom || geom.length<3) return null;
  const coords=geom.map(p=>[p.lon,p.lat]);
  const first=coords[0], last=coords[coords.length-1];
  if(first[0]!==last[0] || first[1]!==last[1]) coords.push([...first]);
  return {type:'Feature',properties:props,geometry:{type:'Polygon',coordinates:[coords]}};
}
async function loadRestrictedZones(){
  if(!state.map || state.map.getZoom()<11 || !state.map.getSource('restricted-zones')) return;
  const c=state.map.getCenter();
  if(restrictedController) restrictedController.abort();
  restrictedController=new AbortController();
  const query=`[out:json][timeout:18];(way(around:4200,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[landuse=military];way(around:4200,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[military];);out geom 80;`;
  try{
    const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:query,signal:restrictedController.signal});
    if(!resp.ok) throw new Error('restricted '+resp.status);
    const data=await resp.json();
    const features=(data.elements||[]).map(el=>wayGeomToFeature(el.geometry,{name:el.tags?.name||'Yasak alan'})).filter(Boolean);
    state.map.getSource('restricted-zones').setData({type:'FeatureCollection',features});
  }catch(err){ if(err.name!=='AbortError') console.warn('Restricted zones unavailable',err); }
}
function clearForestMarkers(){ for(const m of forestMarkers) m.remove(); forestMarkers=[]; }
function makeTreeCluster(item,zoom){
 const el=document.createElement('div'); el.className='tree-cluster'; const seed=Math.abs(Math.floor(((item.id||1)*7)%1000)); const count=zoom>=15?4+(seed%3):2+(seed%2);
 if(currentSeason()==='autumn') el.classList.add('autumn');
 for(let i=0;i<count;i++){ const t=document.createElement('i'); t.className='tree'; t.style.setProperty('--tx',`${(i-(count-1)/2)*8}px`); t.style.setProperty('--tz', String((seed+i)%3)); el.appendChild(t);}
 return el;
}
async function loadForestMarkers(){
  if(!state.map || state.map.getZoom()<12.8){ clearForestMarkers(); return; }
  const c=state.map.getCenter(); const zoom=state.map.getZoom();
  if(forestController) forestController.abort();
  forestController=new AbortController();
  const query=`[out:json][timeout:16];(way(around:3400,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[natural=wood];way(around:3400,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[landuse=forest];relation(around:3400,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[natural=wood];relation(around:3400,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[landuse=forest];);out center 30;`;
  try{
    const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:query,signal:forestController.signal});
    if(!resp.ok) throw new Error('forest '+resp.status);
    const data=await resp.json();
    clearForestMarkers();
    for(const item of (data.elements||[]).slice(0,20)){
      const lng=item.center?.lon||item.lon, lat=item.center?.lat||item.lat; if(!Number.isFinite(lng)||!Number.isFinite(lat)) continue;
      const el=makeTreeCluster(item,zoom); el.setAttribute('aria-label','Ormanlık alan');
      forestMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([lng,lat]).addTo(state.map));
    }
    renderEnvironmentalEffects();
  }catch(err){ if(err.name!=='AbortError') console.warn('Forest markers unavailable',err); }
}


let landmarkMarkers=[], landmarkController=null, buildingLightMarkers=[], buildingController=null;
function parseLocalTimeParts(s){ if(!s) return {h:(new Date()).getHours(), m:(new Date()).getMinutes()}; const m=s.match(/T(\d\d):(\d\d)/); return m?{h:+m[1],m:+m[2]}:{h:(new Date()).getHours(),m:(new Date()).getMinutes()}; }
function renderSkyBar(data=weatherState.data){
  const bar=$('skybar'); if(!bar||!data) return; const sun=$('sunOrb'), moon=$('moonOrb');
  const sunrise=(data.daily?.sunrise||[])[0], sunset=(data.daily?.sunset||[])[0]; const now=data.current?.time; const np=parseLocalTimeParts(now); const current=np.h+np.m/60;
  const rise=sunrise?parseLocalTimeParts(sunrise).h+parseLocalTimeParts(sunrise).m/60:6; const set=sunset?parseLocalTimeParts(sunset).h+parseLocalTimeParts(sunset).m/60:18;
  const moonStart=set, moonEnd=rise+24;
  const posOnArc=(pct)=>{ const x=6+pct*88; const y=28-Math.sin(Math.max(0,Math.min(1,pct))*Math.PI)*20; return {x,y}; };
  const isDay=current>=rise && current<set; const sunP=Math.max(0,Math.min(1,(current-rise)/Math.max(1,set-rise))); const moonCurrent=current<rise?current+24:current; const moonP=Math.max(0,Math.min(1,(moonCurrent-moonStart)/Math.max(1,moonEnd-moonStart)));
  const sp=posOnArc(sunP), mp=posOnArc(moonP); sun.style.left=sp.x+'%'; sun.style.top=sp.y+'px'; moon.style.left=mp.x+'%'; moon.style.top=mp.y+'px';
  sun.style.opacity=isDay?'1':'.14'; moon.style.opacity=isDay?'.14':'1';
  $('sunMeta').textContent=`Gün doğumu ${sunrise?sunrise.slice(11,16):'—'} • Gün batımı ${sunset?sunset.slice(11,16):'—'}`;
}
function renderEnvironmentalEffects(){
  const wx=$('mapWeatherFx'), lf=$('mapLeafFx'), fg=$('mapFogFx'); if(!wx||!state.map) return; wx.replaceChildren(); lf.replaceChildren(); fg.replaceChildren();
  const z=state.map.getZoom(); if(z<14.2 || z>18.4) return; const w=state.activeWeather || 'clear';
  if(['rain','storm','snow'].includes(w)){
    const count=w==='snow'?26:w==='storm'?44:32; for(let i=0;i<count;i++){ const p=document.createElement('i'); p.className='map-particle '+w; p.style.setProperty('--x',`${(i*17.7)%100}%`); p.style.setProperty('--delay',`${-(i%9)*.37}s`); p.style.setProperty('--dur',`${w==='snow'?4.4+(i%5)*.3:1.1+(i%5)*.15}s`); wx.appendChild(p);} }
  if(w==='fog'){ for(let i=0;i<5;i++){ const f=document.createElement('i'); f.className='fog-bank'; f.style.setProperty('--x',`${(i*19)%100}%`); f.style.setProperty('--delay',`${i*.6}s`); fg.appendChild(f);} }
  if(currentSeason()==='autumn' && forestMarkers.length && z>=14.6){ for(let i=0;i<18;i++){ const l=document.createElement('i'); l.className='leaf-particle'; l.style.setProperty('--x',`${(i*13.4)%100}%`); l.style.setProperty('--delay',`${-(i%7)*.45}s`); lf.appendChild(l);} }
}
function landmarkKind(item){ const t=item.tags||{}, name=((t['name:tr']||t.name||'')+' '+(t.wikipedia||'')).toLowerCase();
  if(/jesus|cristo|christ/.test(name)) return ['statue-christ','Anıt']; if(/liberty|özgürlük/.test(name)) return ['statue-liberty','Anıt']; if(/kabe|kaaba/.test(name)) return ['kaaba','Kutsal yapı']; if(/great wall|çin seddi/.test(name)) return ['wall','Tarihî yapı'];
  if(t.historic==='castle' || /kale|castle|fort/.test(name)) return ['castle','Kale']; if(t.amenity==='place_of_worship' || /mosque|cami|camii/.test(name)) return ['mosque','İbadet']; if(t.bridge || /bridge|köprü/.test(name)) return ['bridge','Köprü'];
  if(t.historic || t.tourism==='attraction') return ['monument','İkonik yer']; return ['monument','İkonik yer'];
}
function landmarkElement(kind){ const el=document.createElement('button'); el.className=`landmark-model ${kind}`; el.type='button'; el.innerHTML='<span></span><span></span><span></span>'; return el; }
function clearLandmarks(){ for(const m of landmarkMarkers) m.remove(); landmarkMarkers=[]; }
async function loadLandmarks(){
  if(!state.map || state.map.getZoom()<14.2){ clearLandmarks(); return; }
  const c=state.map.getCenter(); if(landmarkController) landmarkController.abort(); landmarkController=new AbortController();
  const q=`[out:json][timeout:16];(nwr(around:2600,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[historic];nwr(around:2600,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[tourism~"^(attraction|museum|viewpoint)$"];nwr(around:2600,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[amenity=place_of_worship];nwr(around:2600,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[bridge];);out center 45;`;
  try{ const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:q,signal:landmarkController.signal}); if(!resp.ok) throw new Error('landmarks '+resp.status); const data=await resp.json(); clearLandmarks();
    for(const item of (data.elements||[]).slice(0,18)){ const lng=item.lon??item.center?.lon, lat=item.lat??item.center?.lat; if(!Number.isFinite(lng)||!Number.isFinite(lat)) continue; const [kind,label]=landmarkKind(item); const el=landmarkElement(kind); el.title=item.tags?.name||label; el.setAttribute('aria-label',el.title); el.onclick=(e)=>{e.stopPropagation();showPOI(item);}; landmarkMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([lng,lat]).addTo(state.map)); }
  }catch(err){ if(err.name!=='AbortError') console.warn('Landmarks unavailable',err);} }
function clearBuildingLights(){ for(const m of buildingLightMarkers) m.remove(); buildingLightMarkers=[]; }
async function refreshBuildingLights(){
  if(!state.map || document.body.classList.contains('day-theme') || state.map.getZoom()<15.8){ clearBuildingLights(); return; }
  const b=state.map.getBounds(); if(!b) return; if(buildingController) buildingController.abort(); buildingController=new AbortController();
  const q=`[out:json][timeout:14];(way(${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)})[building];);out center 55;`;
  try{ const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:q,signal:buildingController.signal}); if(!resp.ok) throw new Error('building lights '+resp.status); const data=await resp.json(); clearBuildingLights();
    for(const item of (data.elements||[]).slice(0,45)){ const lng=item.center?.lon, lat=item.center?.lat; if(!Number.isFinite(lng)||!Number.isFinite(lat)) continue; const el=document.createElement('div'); el.className='building-light'; const count=2+(item.id%4); for(let i=0;i<count;i++){ const s=document.createElement('span'); s.style.setProperty('--tx',`${(i%2)*6}px`); s.style.setProperty('--ty',`${Math.floor(i/2)*6}px`); el.appendChild(s);} buildingLightMarkers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([lng,lat]).addTo(state.map)); }
  }catch(err){ if(err.name!=='AbortError') console.warn('Building lights unavailable',err); }
}
function refreshScene(){ loadNearbyPOIs(); loadRestrictedZones(); loadForestMarkers(); loadLandmarks(); updateWeather(); }

// Wait for asynchronous map startup without blocking map rendering.
(function initDiscover(){let tries=0;const timer=setInterval(()=>{tries++;if(state.map?.isStyleLoaded()){clearInterval(timer);updateSeasonClass();applyDayNightTheme();state.map.on('moveend',refreshScene);state.map.on('zoomend',()=>{renderEnvironmentalEffects();refreshBuildingLights();loadLandmarks();loadForestMarkers();});state.map.on('rotate',renderEnvironmentalEffects);refreshScene();updateWeather().then(()=>{applyDayNightTheme();renderSkyBar();renderEnvironmentalEffects();refreshBuildingLights();});}else if(tries>35)clearInterval(timer);},700);})();

/* v2.1: offline-service-independent vector tile fallback for visible points */
let visibleFallbackId='', fallbackBusy=false;
function visibleVectorSource(){
 const m=state.map;if(!m)return null;
 const ls=m.getStyle()?.layers||[];
 const candidate=ls.find(l=>l['source-layer']==='poi')||ls.find(l=>l['source-layer']==='landcover');
 return candidate?.source||null;
}
function collectTileFeatures(layer){
 const src=visibleVectorSource();if(!src)return [];
 try{return state.map.querySourceFeatures(src,{sourceLayer:layer})||[];}catch(e){return []}
}
function coordOfFeature(feature){
 const g=feature?.geometry;if(!g)return null;
 if(g.type==='Point')return g.coordinates;
 if(g.type==='MultiPoint')return g.coordinates[0];
 if(g.type==='Polygon') { const ring=g.coordinates[0]||[];return ring.length?[ring.reduce((a,p)=>a+p[0],0)/ring.length,ring.reduce((a,p)=>a+p[1],0)/ring.length]:null; }
 if(g.type==='MultiPolygon') {const ring=g.coordinates[0]?.[0]||[];return ring.length?[ring.reduce((a,p)=>a+p[0],0)/ring.length,ring.reduce((a,p)=>a+p[1],0)/ring.length]:null;}
 return null;
}
function visibleCoords(c){if(!c||!Number.isFinite(c[0])||!Number.isFinite(c[1]))return false;const b=state.map.getBounds();return b&&b.contains(c);}
function poiTagsFromTile(p){const cls=p.class||p.subclass||'';const tag={name:p.name||p['name:latin']||'',amenity:cls,shop:cls,tourism:cls};
 if(['pharmacy','hospital','clinic','doctors'].includes(cls))tag.amenity=cls;
 else if(['restaurant','cafe','fast_food','school','university','library'].includes(cls))tag.amenity=cls;
 else if(['supermarket','bakery','convenience'].includes(cls))tag.shop=cls;
 else if(['castle','monument','memorial','museum','attraction'].includes(cls))tag.historic=cls;
 else if(['mosque','place_of_worship'].includes(cls))tag.amenity='place_of_worship';
 return tag;
}
function tilePoiCategory(p){ const tag=poiTagsFromTile(p);const cls=(p.class||p.subclass||'').toLowerCase();
 if(['pharmacy','hospital','clinic','doctors','dentist','restaurant','cafe','fast_food','school','university','library','supermarket','bakery','convenience','museum','castle','monument','memorial','mosque','attraction'].includes(cls)||tag.historic)return tag;
 return null;
}
function displayTileFallbacks(){
 const m=state.map;if(!m||!m.isStyleLoaded())return;
 const z=m.getZoom();if(z<12.5){clearPOIs();clearForestMarkers();clearLandmarks();return;}
 const pitems=collectTileFeatures('poi'), keys=new Set();const poiNew=[],landNew=[];
 for(const f of pitems){const c=coordOfFeature(f), p=f.properties||{};if(!visibleCoords(c))continue;const t=tilePoiCategory(p);if(!t)continue;
  const key=`${Math.round(c[0]*1e5)},${Math.round(c[1]*1e5)},${p.name||''}`;if(keys.has(key))continue;keys.add(key);
  const item={tags:t,lon:c[0],lat:c[1]};
  const cls=String(p.class||p.subclass||'');const isLandmark=['castle','monument','memorial','mosque'].includes(cls);
  if(isLandmark&&z>=14.5&&landNew.length<24){ const [kind]=landmarkKind(item);const el=landmarkElement(kind);el.title=t.name||'İkonik yapı';el.onclick=e=>{e.stopPropagation();showPOI(item)};landNew.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(c).addTo(m)); }
  else if(poiNew.length<90){const el=document.createElement('button');el.className='poi-marker poi-'+poiClass(t)[2];el.textContent=poiClass(t)[0];el.title=t.name||cls;el.onclick=e=>{e.stopPropagation();showPOI(item)};poiNew.push(new maplibregl.Marker({element:el}).setLngLat(c).addTo(m));}
 }
 if(poiNew.length){clearPOIs();poiMarkers=poiNew;} if(landNew.length){clearLandmarks();landmarkMarkers=landNew;}
 const woods=collectTileFeatures('landcover'),woods2=collectTileFeatures('landuse'),all=[...woods,...woods2];const seen=new Set(),treeNew=[];
 if(z>=13.5)for(const f of all){const p=f.properties||{},tag=String(p.class||p.subclass||p.type||'');if(!/wood|forest|tree/.test(tag))continue;const c=coordOfFeature(f);if(!visibleCoords(c))continue;const key=c.map(x=>x.toFixed(4)).join(':');if(seen.has(key))continue;seen.add(key);const el=makeTreeCluster({id:Math.abs(Math.floor(c[0]*1e6+c[1]*1e5))},z);treeNew.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(c).addTo(m));if(treeNew.length>=45)break;}
 if(treeNew.length){clearForestMarkers();forestMarkers=treeNew;}
 renderEnvironmentalEffects();
}
// Avoid server requests for main visible categories; use currently loaded vector tiles.
loadNearbyPOIs=()=>{displayTileFallbacks();};
loadForestMarkers=()=>{};
loadLandmarks=()=>{};
if(state.map){state.map.on('idle',()=>{if(!fallbackBusy){fallbackBusy=true;try{displayTileFallbacks();}finally{fallbackBusy=false;}}});}
