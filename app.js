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
      try{applyGTATint(state.map);}catch(e){console.warn('GTA theme unavailable; basic map remains visible',e);}
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


/* v0.6 — two opt-in cinematic camera transitions. GPS and routes work as before. */
const cinema={busy:false,mode:'light',auto:false,played:false};
const delay=t=>new Promise(resolve=>setTimeout(resolve,t));
function cinemaTarget(){return state.position||state.map?.getCenter()?.toArray()||[29.394,40.773];}
function cameraStep(options){return new Promise(resolve=>{
  if(!state.map){resolve();return;}
  const duration=options.duration||700;
  state.map.easeTo({...options,essential:true});
  setTimeout(resolve,duration+90); // finite fallback even if animation interrupted
});}
async function playCinema(kind=cinema.mode){
 if(cinema.busy||!state.map||!state.map.isStyleLoaded()){msg('Haritanın yüklenmesini bekle.');return;}
 cinema.busy=true;cinema.mode=kind;
 const scene=$('cinemaScene');scene.classList.remove('light','heavy','active','out');
 scene.classList.add(kind,'active');document.body.classList.add('cinema-running');
 $('cinemaPanel').hidden=true;
 const target=cinemaTarget();
 try{
   if(kind==='light'){
     await cameraStep({zoom:Math.max(9,Math.min(11,state.map.getZoom()-2.5)),pitch:0,duration:650});
     await delay(210);
     await cameraStep({center:target,zoom:16,pitch:28,bearing:state.following?currentHeading():0,duration:1350});
   }else{
     await cameraStep({zoom:7.5,pitch:0,bearing:0,duration:950});
     await delay(390);
     await cameraStep({center:target,zoom:11.5,pitch:12,duration:850});
     await delay(180);
     await cameraStep({center:target,zoom:16.5,pitch:48,bearing:state.following?currentHeading():0,duration:1450});
   }
 }finally{
   scene.classList.add('out');
   await delay(600);
   scene.classList.remove('active','out','light','heavy');
   document.body.classList.remove('cinema-running');cinema.busy=false;
 }
}
$('cinemaMenu').onclick=()=>{$('cinemaPanel').hidden=!$('cinemaPanel').hidden;};
$('cinemaClose').onclick=()=>{$('cinemaPanel').hidden=true;};
function selectCinema(kind){cinema.mode=kind;$('cinemaSelection').textContent='Seçili: '+(kind==='light'?'Hafif Sinematik':'GTA Kamera');playCinema(kind);}
$('cinemaLight').onclick=()=>selectCinema('light');
$('cinemaHeavy').onclick=()=>selectCinema('heavy');
$('cinemaAuto').onchange=e=>{cinema.auto=e.target.checked;cinema.played=false;};
// The existing location button still starts geolocation. The camera effect is optional.
$('locate').addEventListener('click',()=>{
 if(cinema.auto&&!cinema.played){
   cinema.played=true;
   const waitForFix=()=>{if(state.position)playCinema(cinema.mode);else setTimeout(()=>{if(state.position)playCinema(cinema.mode);else msg('GPS konumu alındıktan sonra efekti EFEKTLER menüsünden başlatabilirsin.');},2400);};
   setTimeout(waitForFix,550);
 }
});
