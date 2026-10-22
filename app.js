/* Los Santos GPS v0.6 — browser PWA. Requires HTTPS for geolocation. */
const $=id=>document.getElementById(id);
const state={map:null,position:null,heading:0,watch:null,destination:null,route:null,routeOptions:[],routeIndex:0,following:false,minimap:false,lastReroute:0};
const msg=(s)=>{const e=$('toast');e.textContent=s;e.hidden=false;clearTimeout(msg.timer);msg.timer=setTimeout(()=>e.hidden=true,5200)};
const fmtDist=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;
const fmtTime=s=>s<3600?`${Math.max(1,Math.round(s/60))} dk`:`${Math.floor(s/3600)} sa ${Math.round((s%3600)/60)} dk`;
const styleURL='https://tiles.openfreemap.org/styles/liberty';
let compassActive=false, compassHeading=null, lastCompassAt=0;
const wrapDegrees=n=>(n%360+360)%360;
function currentHeading(){return compassActive&&compassHeading!==null?compassHeading:state.heading;}
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

async function start(){
  const status=$('status');
  if(typeof window.maplibregl==='undefined'){
    status.textContent='HARİTA MOTORU YÜKLENEMEDİ';
    msg('Harita kütüphanesi yüklenemedi. Safari’de sayfayı yenile veya başka ağ dene.');
    return;
  }
  const initialize=(style)=>{
    state.map=new maplibregl.Map({container:'map',style,center:[29.394,40.773],zoom:13,pitch:0,bearing:0,attributionControl:false});
    state.map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
    let hasLoaded=false;
    state.map.on('load',()=>{
      hasLoaded=true;
      try{applyGTATint(state.map);improveStreetLabels(state.map);}catch(e){console.warn('GTA theme unavailable; basic map remains visible',e);}
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
 if(state.watch!==null){state.following=true;if(state.position)state.map?.flyTo({center:state.position,zoom:16});msg('GPS takibi açık.');return;}
 $('status').textContent='GPS BEKLENİYOR';
 state.watch=navigator.geolocation.watchPosition(p=>{
  const pos=[p.coords.longitude,p.coords.latitude];state.position=pos;state.heading=Number.isFinite(p.coords.heading)?p.coords.heading:state.heading;
  $('speed').innerHTML=`${Math.max(0,Math.round((p.coords.speed||0)*3.6))} <small>km/sa</small>`;
  $('gpsDot').style.color=p.coords.accuracy<60?'#81e6ad':'#ebbb66';$('status').textContent=`GPS ±${Math.round(p.coords.accuracy)} M`;
  if(!playerMarker){const el=document.createElement('div');el.className='player';playerMarker=new maplibregl.Marker({element:el,rotationAlignment:'map'}).setLngLat(pos).addTo(state.map);}else playerMarker.setLngLat(pos);
  if(playerMarker)updateMarkerHeading();
  if(state.following)state.map.easeTo({center:pos,zoom:state.minimap?17:16,bearing:currentHeading(),pitch:state.minimap?35:0,duration:650});
  if(cinema.auto&&!cinema.played&&state.map?.isStyleLoaded()){cinema.played=true;setTimeout(()=>playCinema(cinema.mode),120);}
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
  let resp;try{resp=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,is_day&hourly=temperature_2m,precipitation_probability,weather_code&forecast_days=1&timezone=auto`,{signal:controller.signal});}finally{clearTimeout(t)}
  if(!resp.ok)throw new Error('Weather HTTP '+resp.status);
  const data=await resp.json();weatherState.data=data;weatherState.updated=Date.now();weatherState.coordinate=[...p];
  $('weatherIcon').textContent=weatherSymbol(data.current?.weather_code,data.current?.is_day===1);$('weatherTemp').textContent=Math.round(data.current?.temperature_2m??0)+'°';return data;
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
function poiClass(tags){if(tags.historic||tags.tourism==='museum'||tags.tourism==='attraction'||tags.tourism==='viewpoint')return ['🏛','Tarihi / turistik yer'];if(tags.amenity==='restaurant')return ['🍽','Restoran'];if(tags.amenity==='cafe')return ['☕','Kafe'];if(tags.amenity==='pharmacy')return ['✚','Eczane'];if(tags.amenity==='hospital')return ['🏥','Hastane'];if(tags.amenity==='school')return ['🎓','Okul'];if(tags.shop)return ['🛒','Mağaza'];return ['📍','Mekân'];}
async function showPOI(item){
 const t=item.tags||{},name=t['name:tr']||t.name||'İsimsiz mekân',category=poiClass(t)[1];
 const details=[t['addr:street'],t['addr:housenumber'],t['addr:city']].filter(Boolean).join(' ');
 const links=[];if(t.website||t['contact:website']){let url=t.website||t['contact:website'];if(/^https?:\/\//i.test(url))links.push(`<a class="sheet-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">Resmî site ↗</a>`);}
 if(t.phone||t['contact:phone']){const phone=t.phone||t['contact:phone'];links.push(`<a class="sheet-link" href="tel:${escapeHTML(phone.replace(/[^+\d]/g,''))}">${escapeHTML(phone)}</a>`);}
 let base=`<p class="sheet-muted">${escapeHTML(category)}</p>${details?`<p>${escapeHTML(details)}</p>`:''}${t.opening_hours?`<p>🕒 ${escapeHTML(t.opening_hours)}</p>`:''}${t.description?`<p>${escapeHTML(t.description)}</p>`:''}${links.length?`<p>${links.join(' · ')}</p>`:''}<p class="sheet-muted">OpenStreetMap topluluk verisi · bilgiler güncel olmayabilir.</p><button class="sheet-action" id="poiGo">📍 Buraya rota oluştur</button>`;
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
 const q=`[out:json][timeout:12];(nwr(around:1100,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[amenity~"^(restaurant|cafe|pharmacy|hospital|school)$"];nwr(around:1100,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[historic];nwr(around:1100,${c.lat.toFixed(5)},${c.lng.toFixed(5)})[tourism~"^(museum|attraction|viewpoint)$"];);out center 65;`;
 try{const resp=await fetch('https://overpass.kumi.systems/api/interpreter',{method:'POST',body:q,signal:nearbyController.signal});if(!resp.ok)throw Error('Overpass '+resp.status);const data=await resp.json();if(!state.map||state.map.getZoom()<13)return;clearPOIs();
  for(const item of (data.elements||[]).slice(0,55)){const lng=item.lon??item.center?.lon,lat=item.lat??item.center?.lat;if(!Number.isFinite(lng)||!Number.isFinite(lat))continue;const el=document.createElement('button');el.className='poi-marker';const [icon,category]=poiClass(item.tags||{});el.textContent=icon;el.type='button';el.title=item.tags?.name||category;el.setAttribute('aria-label',el.title);el.onclick=e=>{e.stopPropagation();showPOI(item);};poiMarkers.push(new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]).addTo(state.map));}
 }catch(e){if(e.name!=='AbortError')console.warn('POI data temporarily unavailable',e);}
}
// Wait for asynchronous map startup without blocking map rendering.
(function initDiscover(){let tries=0;const timer=setInterval(()=>{tries++;if(state.map?.isStyleLoaded()){clearInterval(timer);state.map.on('moveend',loadNearbyPOIs);loadNearbyPOIs();updateWeather();}else if(tries>35)clearInterval(timer);},700);})();
