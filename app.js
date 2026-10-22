/* ---------- Ayarlar ve yardımcılar ---------- */
const CFG = { center: [28.9740, 41.0215], minZ: 15, cell: 0.006, maxCells: 14, maxBld: 3500, maxTrees: 6000 };
const [LNG0, LAT0] = CFG.center;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
const L = (lat, lon) => [(lon - LNG0) * KX, (lat - LAT0) * KY];          // x doğu, y kuzey (metre)
const hr = (a, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7 + 1.7) * 43758.5453; return x - Math.floor(x); };
const $ = id => document.getElementById(id);
let isNight = true;

/* ---------- Harita ---------- */
const tiles = (p) => ['a', 'b', 'c', 'd'].map(s => `https://${s}.basemaps.cartocdn.com/${p}/{z}/{x}/{y}.png`);
const map = new maplibregl.Map({
  container: 'map', center: CFG.center, zoom: 16.2, pitch: 62, bearing: -24, maxPitch: 75,
  style: { version: 8,
    sources: {
      dark: { type: 'raster', tiles: tiles('dark_nolabels'), tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap © CARTO' },
      day:  { type: 'raster', tiles: tiles('rastertiles/voyager_nolabels'), tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap © CARTO' }
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#1d2024' } },
      { id: 'dark', type: 'raster', source: 'dark', paint: { 'raster-saturation': -0.5, 'raster-brightness-max': 0.85 } },
      { id: 'day', type: 'raster', source: 'day', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.65 } }
    ] }
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true, positionOptions: { enableHighAccuracy: true } }), 'top-right');

/* ---------- Three.js sahnesi ---------- */
const scene = new THREE.Scene(), camera = new THREE.Camera();
const amb = new THREE.AmbientLight(0x8fa3c4, 0.3);
const sun = new THREE.DirectionalLight(0xb7c4dc, 0.35); sun.position.set(-0.4, -0.6, 1);
scene.add(amb, sun);
const OR = maplibregl.MercatorCoordinate.fromLngLat(CFG.center, 0), SC = OR.meterInMercatorCoordinateUnits();
let renderer;
const worldLayer = {
  id: 'world', type: 'custom', renderingMode: '3d',
  onAdd(m, gl) { renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true }); renderer.autoClear = false; },
  render(gl, matrix) {
    const l = new THREE.Matrix4().makeTranslation(OR.x, OR.y, OR.z).scale(new THREE.Vector3(SC, -SC, SC));
    camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
    renderer.resetState(); renderer.render(scene, camera);
  }
};

/* ---------- Malzemeler ---------- */
const bldMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: { uNight: { value: 1 } },
  vertexShader: `attribute float aSeed; attribute float aWall; attribute vec2 aWin;
    varying float vS; varying float vW; varying float vZ; varying vec2 vWin;
    void main(){ vS=aSeed; vW=aWall; vZ=position.z; vWin=aWin;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `precision highp float; uniform float uNight;
    varying float vS; varying float vW; varying float vZ; varying vec2 vWin;
    float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    void main(){
      vec3 stone=mix(vec3(.36,.37,.38),vec3(.47,.45,.42),hs(vec2(vS,1.)));
      vec3 c=stone*(0.7+0.3*clamp(vZ/45.,0.,1.))*mix(1.0,0.36,uNight);
      if(vW>.5){
        vec2 id=floor(vWin), f=fract(vWin);
        float m=step(.22,f.x)*step(f.x,.78)*step(.2,f.y)*step(f.y,.72)*step(1.,id.y);
        float occ=0.25+0.5*hs(vec2(vS,9.));
        float on=step(1.-occ,hs(id+vec2(vS*13.,vS*5.)));
        vec3 lit=mix(vec3(1.,.78,.42),vec3(.72,.86,1.),step(.82,hs(id*1.9+vS)));
        c=mix(c,c*.55+vec3(.04,.06,.08),m*(1.-uNight));
        c=mix(c,lit*1.25,m*on*uNight);
        c*=1.-.35*m*(1.-on)*uNight;
      } else { c*=.85; }
      gl_FragColor=vec4(c,1.);
    }`
});
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a4338, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide });
const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide });
const poleMat = new THREE.MeshStandardMaterial({ color: 0x5b5f63, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide });
const headMat = new THREE.MeshBasicMaterial({ color: 0xffc477 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa84a, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });

/* ---------- Paylaşılan geometriler (z yukarı) ---------- */
const G = {
  trunk: new THREE.CylinderGeometry(0.22, 0.32, 2.6, 5).rotateX(Math.PI / 2).translate(0, 0, 1.3),
  round: new THREE.IcosahedronGeometry(2.7, 1).scale(1, 1, 1.15).translate(0, 0, 4.9),
  cone:  new THREE.ConeGeometry(2.3, 7, 6).rotateX(Math.PI / 2).translate(0, 0, 6.0),
  pole:  new THREE.CylinderGeometry(0.1, 0.14, 8, 6).rotateX(Math.PI / 2).translate(0, 0, 4),
  head:  new THREE.SphereGeometry(0.55, 8, 6).translate(0, 0, 8.3),
  glow:  new THREE.SphereGeometry(3.2, 10, 8).translate(0, 0, 8.3)
};

function inst(geo, mat, items, colorFn) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length), d = new THREE.Object3D(), col = new THREE.Color();
  items.forEach((it, n) => {
    d.position.set(it.x, it.y, 0); d.rotation.set(0, 0, it.r || 0); d.scale.setScalar(it.s || 1); d.updateMatrix();
    m.setMatrixAt(n, d.matrix);
    if (colorFn) { colorFn(col, it); m.setColorAt(n, col); }
  });
  m.instanceMatrix.needsUpdate = true; m.frustumCulled = false;
  return m;
}

/* ---------- Geometri yardımcıları ---------- */
const inside = (x, y, P) => { let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++)
    if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c; };
const area = P => { let a = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; } return Math.abs(a) / 2; };
const open = P => (P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) ? P.slice(0, -1) : P;

function buildingGeometry(list) {
  const pos = [], seed = [], wall = [], win = [];
  const push = (x, y, z, s, w, u, v) => { pos.push(x, y, z); seed.push(s); wall.push(w); win.push(u, v); };
  for (const b of list) {
    const P = b.P, n = P.length; let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = P[i], c = P[(i + 1) % n], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u0 = acc / 3.2, u1 = (acc + len) / 3.2, v1 = b.h / 3.4; acc += len;
      push(a[0], a[1], 0, b.s, 1, u0, 0); push(c[0], c[1], 0, b.s, 1, u1, 0); push(c[0], c[1], b.h, b.s, 1, u1, v1);
      push(a[0], a[1], 0, b.s, 1, u0, 0); push(c[0], c[1], b.h, b.s, 1, u1, v1); push(a[0], a[1], b.h, b.s, 1, u0, v1);
    }
    const tri = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tri) for (const k of t) push(P[k][0], P[k][1], b.h, b.s, 0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.setAttribute('aWall', new THREE.Float32BufferAttribute(wall, 1));
  g.setAttribute('aWin', new THREE.Float32BufferAttribute(win, 2));
  return g;
}

/* ---------- Hücre verisi: Overpass ---------- */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function fetchCell(i, j) {
  const c = CFG.cell, b = `${i * c},${j * c},${(i + 1) * c},${(j + 1) * c}`;
  const q = `[out:json][timeout:30];(way["building"](${b});way["natural"="wood"](${b});way["landuse"="forest"](${b});` +
    `way["leisure"~"^(park|garden)$"](${b});node["natural"="tree"](${b});way["highway"]["bridge"]["bridge"!="no"](${b}););out tags geom;`;
  let err;
  for (const url of ENDPOINTS) {
    try { const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) throw new Error(r.status); return await r.json(); } catch (e) { err = e; }
  }
  throw err;
}

function buildCell(i, j, data) {
  const c = CFG.cell, [x0, y0] = L(i * c, j * c), [x1, y1] = L((i + 1) * c, (j + 1) * c);
  const inCell = (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const blds = [], trees = [], lamps = [], areas = [];
  for (const el of data.elements) {
    const t = el.tags || {};
    if (el.type === 'node') {
      if (t.natural === 'tree') { const [x, y] = L(el.lat, el.lon); if (inCell(x, y)) trees.push({ x, y, s: 0.9 + hr(x, y) * 0.5, k: hr(y, x) < 0.2 ? 1 : 0, h: hr(x + 1, y) }); }
      continue;
    }
    if (el.type !== 'way' || !el.geometry) continue;
    const P = open(el.geometry.map(p => L(p.lat, p.lon)));
    if (t.highway && t.bridge) {                                          // köprü lambaları
      let dist = 0, next = 6, n = 0;
      for (let k = 0; k < P.length - 1; k++) {
        const a = P[k], b = P[k + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!len) continue;
        const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
        while (next <= dist + len) {
          const f = next - dist, side = (n++ % 2 ? 1 : -1) * 4.2;
          const x = a[0] + dx * f - dy * side, y = a[1] + dy * f + dx * side;
          if (inCell(x, y)) lamps.push({ x, y }); next += 22;
        }
        dist += len;
      }
    } else if (t.building) {
      if (P.length < 3 || blds.length >= CFG.maxBld) continue;
      const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
      if (!inCell(cx, cy) || area(P) < 15) continue;
      const s = hr(cx, cy);
      let h = parseFloat(t.height) || (parseFloat(t['building:levels']) || 0) * 3.2 || 6 + s * 10;
      blds.push({ P, h: Math.min(Math.max(h, 3), 220), s });
    } else if (P.length >= 3) {
      areas.push({ P, sp: (t.natural === 'wood' || t.landuse === 'forest') ? 8 : 12, ndl: t.leaf_type === 'needleleaved' });
    }
  }
  for (const a of areas) {                                                // alan içine ağaç dağıt
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const p of a.P) { mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); }
    for (let gi = Math.ceil(Math.max(mnx, x0) / a.sp); gi * a.sp <= Math.min(mxx, x1); gi++)
      for (let gj = Math.ceil(Math.max(mny, y0) / a.sp); gj * a.sp <= Math.min(mxy, y1); gj++) {
        if (trees.length >= CFG.maxTrees) break;
        if (hr(gi, gj) < 0.25) continue;
        const x = gi * a.sp + (hr(gi + 3, gj) - 0.5) * a.sp * 0.7, y = gj * a.sp + (hr(gi, gj + 7) - 0.5) * a.sp * 0.7;
        if (inCell(x, y) && inside(x, y, a.P)) trees.push({ x, y, s: 0.8 + hr(gi + 9, gj) * 0.6, k: (a.ndl || hr(gi, gj + 2) < 0.3) ? 1 : 0, h: hr(gi + 5, gj + 5), r: hr(gi, gj) * 6.28 });
      }
  }
  const grp = new THREE.Group();
  if (blds.length) { const m = new THREE.Mesh(buildingGeometry(blds), bldMat); m.frustumCulled = false; grp.add(m); }
  const tint = (col, it) => col.setHSL(0.27 + it.h * 0.07, 0.16, 0.2 + it.h * 0.1);
  const round = trees.filter(t => !t.k), cone = trees.filter(t => t.k);
  [inst(G.trunk, trunkMat, trees), inst(G.round, leafMat, round, tint), inst(G.cone, leafMat, cone, tint),
   inst(G.pole, poleMat, lamps), inst(G.head, headMat, lamps), inst(G.glow, glowMat, lamps)].forEach(m => m && grp.add(m));
  scene.add(grp);
  return { grp, nb: blds.length, nt: trees.length, nl: lamps.length };
}

/* ---------- Yükleme kuyruğu ---------- */
const cells = new Map(), queue = []; let busy = false;
const status = s => { $('status').textContent = s; };
function stats() {
  let b = 0, t = 0, l = 0; cells.forEach(v => { if (v) { b += v.nb; t += v.nt; l += v.nl; } });
  $('stats').textContent = `${b} bina, ${t} ağaç, ${l} köprü lambası`;
}
function dispose(v) { scene.remove(v.grp); v.grp.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.geometry && o.material === bldMat) o.geometry.dispose(); }); }
function trim() {
  while (cells.size > CFG.maxCells) { const k = [...cells.keys()].find(k => cells.get(k)); if (!k) break; dispose(cells.get(k)); cells.delete(k); }
}
function wanted() {
  const b = map.getBounds(), c = CFG.cell, ctr = map.getCenter(), ci = Math.floor(ctr.lat / c), cj = Math.floor(ctr.lng / c), out = [];
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
    const s = i * c, w = j * c; if (w > b.getEast() || w + c < b.getWest() || s > b.getNorth() || s + c < b.getSouth()) continue; out.push([i, j]);
  }
  return out.sort((p, q) => Math.hypot(p[0] - ci, p[1] - cj) - Math.hypot(q[0] - ci, q[1] - cj));
}
async function pump() {
  if (busy) return; busy = true;
  while (queue.length) {
    const [i, j] = queue.shift(), k = i + ',' + j; status('3B veriler yükleniyor…');
    try { cells.set(k, buildCell(i, j, await fetchCell(i, j))); trim(); stats(); map.triggerRepaint(); }
    catch (e) { cells.delete(k); status('Veri alınamadı. Haritayı hareket ettirince tekrar denenecek.'); await new Promise(r => setTimeout(r, 4000)); }
  }
  busy = false; status(''); 
}
function refresh() {
  if (map.getZoom() < CFG.minZ) { status('3B nesneler için biraz daha yakınlaştır'); return; }
  for (const [i, j] of wanted()) { const k = i + ',' + j; if (!cells.has(k)) { cells.set(k, null); queue.push([i, j]); } }
  pump();
}

/* ---------- Gece / gündüz ---------- */
function applyMode() {
  bldMat.uniforms.uNight.value = isNight ? 1 : 0;
  amb.color.set(isNight ? 0x8fa3c4 : 0xffffff); amb.intensity = isNight ? 0.3 : 0.75;
  sun.color.set(isNight ? 0xb7c4dc : 0xfff3df); sun.intensity = isNight ? 0.35 : 0.9;
  glowMat.visible = isNight; headMat.color.set(isNight ? 0xffc477 : 0x7a7c7e);
  map.setLayoutProperty('dark', 'visibility', isNight ? 'visible' : 'none');
  map.setLayoutProperty('day', 'visibility', isNight ? 'none' : 'visible');
  $('mode').textContent = isNight ? 'Gündüz görünümü' : 'Gece görünümü';
  map.triggerRepaint();
}
$('mode').addEventListener('click', () => { isNight = !isNight; applyMode(); });

map.on('load', () => { map.addLayer(worldLayer); applyMode(); refresh(); });
map.on('moveend', refresh);
