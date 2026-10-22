/* Shared, deterministic geometry. No network or browser dependencies. */
(function(root){
 'use strict';
 const R=6378137, rad=Math.PI/180;
 const xy=p=>[R*p[0]*rad,R*Math.log(Math.tan(Math.PI/4+p[1]*rad/2))];
 const ll=p=>[p[0]/R/rad,(2*Math.atan(Math.exp(p[1]/R))-Math.PI/2)/rad];
 function height(p={}){for(const k of ['render_height','height']){const n=Number(p[k]);if(Number.isFinite(n)&&n>0)return n;}const n=Number(p['building:levels']);return n>0?n*3:9;}
 function base(p={}){const n=Number(p.render_min_height??p.min_height??0);return Number.isFinite(n)&&n>0?n:0;}
 const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
 function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
 function trees(polygon,bounds,limit=400){
  if(!polygon?.[0]?.length)return[];
  const ring=polygon[0].map(xy), sw=xy([bounds[0],bounds[1]]),ne=xy([bounds[2],bounds[3]]);
  // A global grid has a permanent origin: panning and zooming cannot reseed it.
  const step=42, xmin=Math.max(sw[0],Math.min(...ring.map(p=>p[0]))),xmax=Math.min(ne[0],Math.max(...ring.map(p=>p[0]))),ymin=Math.max(sw[1],Math.min(...ring.map(p=>p[1]))),ymax=Math.min(ne[1],Math.max(...ring.map(p=>p[1]))),out=[];
  for(let y=Math.floor(ymin/step);y<=Math.floor(ymax/step)&&out.length<limit;y++)for(let x=Math.floor(xmin/step);x<=Math.floor(xmax/step)&&out.length<limit;x++){
   const id=x+':'+y,h=hash(id),p=ll([(x+.2+(h%600)/1000)*step,(y+.2+((h>>>10)%600)/1000)*step]);
   if(p[0]<bounds[0]||p[0]>bounds[2]||p[1]<bounds[1]||p[1]>bounds[3])continue;
   if(inside(p,polygon[0])&&!polygon.slice(1).some(hole=>inside(p,hole)))out.push({type:'tree',coord:p,id});
  }return out;
 }
 function coastBands(coords,width=40){
  // OSM coastline direction: land left, sea right. Offset only to the right.
  const clean=coords.filter((p,i)=>!i||p[0]!==coords[i-1][0]||p[1]!==coords[i-1][1]);if(clean.length<2)return[];
  const pts=clean.map(xy), normals=[];
  for(let i=0;i<pts.length-1;i++){const dx=pts[i+1][0]-pts[i][0],dy=pts[i+1][1]-pts[i][1],d=Math.hypot(dx,dy);normals.push([dy/d,-dx/d]);}
  const offset=meters=>pts.map((p,i)=>{const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)],nx=a[0]+b[0],ny=a[1]+b[1],len=Math.hypot(nx,ny),n=len>1e-5?[nx/len,ny/len]:b;
   const scale=meters/Math.cos(clean[i][1]*rad)/Math.max(.65,n[0]*b[0]+n[1]*b[1]);return ll([p[0]+n[0]*scale,p[1]+n[1]*scale]);});
  const result=[];for(let i=0;i<16;i++){const inner=offset(width*i/16),outer=offset(width*(i+1)/16);const ring=[...inner,...outer.reverse(),inner[0]];result.push({type:'Feature',properties:{band:i},geometry:{type:'Polygon',coordinates:[ring]}});}return result;
 }
 function nearestOnRoute(pos,coords){let best={distance:Infinity,index:0,t:0,along:0},along=0;const lat=pos[1]*rad,kx=111320*Math.cos(lat),ky=111320;
  for(let i=0;i<coords.length-1;i++){const a=coords[i],b=coords[i+1],ax=(a[0]-pos[0])*kx,ay=(a[1]-pos[1])*ky,dx=(b[0]-a[0])*kx,dy=(b[1]-a[1])*ky,l2=dx*dx+dy*dy,t=l2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/l2)):0,d=Math.hypot(ax+t*dx,ay+t*dy),length=Math.sqrt(l2);if(d<best.distance)best={distance:d,index:i,t,along:along+t*length};along+=length;}return best;
 }
 root.LSGeo={height,base,hash,inside,trees,coastBands,nearestOnRoute};
 if(typeof module!=='undefined')module.exports=root.LSGeo;
})(typeof window!=='undefined'?window:globalThis);
