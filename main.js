import { ZONES, ZONE_ORDER, ZONE_BG_PARTICLES } from './zones.js';

const C  = document.getElementById('c');
const cx = C.getContext('2d');
C.width  = window.innerWidth;
C.height = window.innerHeight;
let W  = C.width, H = C.height;
let GY = H - 100;   
const PSZ= 36;        

const rnd   = (a,b)=>a+Math.random()*(b-a);
const ov    = (ax,ay,aw,ah,bx,by,bw,bh)=>ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;
const cirR  = (px,py,pr,rx,ry,rw,rh)=>{
  const nx=Math.max(rx,Math.min(px,rx+rw)), ny=Math.max(ry,Math.min(py,ry+rh));
  return (px-nx)**2+(py-ny)**2<pr*pr;
};
const lerp  = (a,b,t)=>a+(b-a)*t;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

let gState   = 'start';
let score    = 0, best = 0;
let gTime    = 0, gSpeed = 1;
let lives    = 3;
let zIdx     = 0, zKey = 'green';
let zTimer   = 0;
let zDur     = 20000; // UPDATED: Every single zone now cleanly lasts exactly 20 seconds!
let invTimer = 0;
let lastTS   = 0;
let graceMS  = 3200;   
let introFreeze = true; 
let currentCW = 850;
let shakeTimer = 0; 
let bgZoneTimeout = null; 

let phys   = { g:0.50, jf:-12.5, ms:4.4, fr:0.855 };
let tPhys  = { ...phys };

let chunks   = [];
let patCur   = { green: 0, blue: 0, yellow: 0, gray: 0, echo: 0 };
let lastPattern = { green: null, blue: null, yellow: null, gray: null, echo: null }; 
const CW     = 850;   
const SPAWN  = W + 1400;

let P = {};
let fragCount = 0, fragScore = 0;

window.addEventListener('resize', () => {
  C.width = window.innerWidth;
  C.height = window.innerHeight;
  W = C.width;
  H = C.height;
  GY = H - 100;
});

function spawnZoneParticle(container, cfg){
  if(!container || !container.isConnected) return;
  const el = document.createElement('div');
  const streak = cfg.streakColor && Math.random() < 0.28;
  el.className = 'zbg-p';
  const w = window.innerWidth, h = window.innerHeight;
  const sz  = streak ? (16 + Math.random()*45) : (1.5 + Math.random()*4.2);
  const ht  = streak ? (1.5 + Math.random()*2)  : sz;
  const sx  = (-0.08 + Math.random()*1.16) * w;
  const sy  = (-0.15 + Math.random()*0.65) * h;
  const dx  = 55 + Math.random()*220;
  const dy  = 35 + Math.random()*160;
  const dur = 4 + Math.random()*6;
  const del = Math.random()*dur;
  el.style.cssText = `left:${sx}px;top:${sy}px;width:${sz}px;height:${ht}px;--dx:${dx}px;--dy:${dy}px;
    animation-duration:${dur}s;animation-delay:-${del}s;opacity:0;background:${streak?cfg.streakColor:cfg.color};
    ${streak?'border-radius:40%;transform:rotate(-18deg);':''}`;
  container.appendChild(el);
  setTimeout(()=>{ el.remove(); spawnZoneParticle(container, cfg); }, (dur+del+1)*1000);
}

function spawnZoneStars(skyEl, n){
  for(let i=0;i<n;i++){
    const s = document.createElement('div');
    s.className='zbg-star';
    const sz = 1 + Math.random()*2.4;
    s.style.cssText = `left:${Math.random()*100}%;top:${Math.random()*70}%;width:${sz}px;height:${sz}px;
      --d:${2+Math.random()*3}s;--delay:${Math.random()*4}s;--lo:${0.15+Math.random()*0.2};--hi:${0.7+Math.random()*0.3};`;
    skyEl.appendChild(s);
  }
}

const bgInited = {};
function initZoneBg(key){
  if(bgInited[key]) return;
  bgInited[key] = true;
  const el = document.getElementById('bg-'+key);
  if(!el) return;
  const container = el.querySelector('.zbg-particles');
  const cfg = ZONE_BG_PARTICLES[key];
  if(container && cfg){
    const n = Math.min(cfg.count, Math.floor(window.innerWidth/14));
    for(let i=0;i<n;i++) spawnZoneParticle(container, cfg);
  }
  if(key==='gray' || key==='echo'){
    const sky = el.querySelector('.zbg-sky');
    if(sky) spawnZoneStars(sky, key==='gray'?70:45);
  }
}

let curBgKey = null;
function activateZoneBg(key){
  if(curBgKey===key) return;
  const prevEl = curBgKey ? document.getElementById('bg-'+curBgKey) : null;
  const nextEl = document.getElementById('bg-'+key);
  initZoneBg(key);
  if(nextEl) nextEl.classList.add('active');
  if(prevEl) prevEl.classList.remove('active');
  curBgKey = key;
}

let bgParts  = [];

const mkSpike  = (x,y,f='up')=>({type:'spike',  x,y,w:28,h:24,facing:f});
const mkEnemy  = (x,y,range,spd)=>({type:'enemy', x,y,w:34,h:34,bx:x,range,spd,dir:1});
const mkSaw    = (x,y,r,range,spd)=>({type:'saw',   x,y,r,bx:x,range,spd,dir:1,ang:0});
const mkLaser  = (x,onT,offT)=>({type:'laser', x,y:0,w:10,h:GY,on:false,onT,offT,t:onT*.5});
const mkPlat   = (x,y,w,mov=false)=>({x,y,w,h:12,mov,by:y,rng:mov?55:0,spd:mov?1.1:0,ph:x%(Math.PI*2)});
const mkIceBlock = (x,h2)=>({type:'iceblock',x,y:GY-h2,w:46,h:h2,bx:x,range:60,spd:2.0,dir:1});
const mkPit = (x,w)=>({type:'pit',x,w});
const mkSnowball = (x,r)=>({type:'snowball',x,y:GY-r,r,bx:x,vx:-2.2,ang:0});
const mkDrone = (x,y,rx,ry,spd)=>({type:'drone',x,y,w:50,h:26,bx:x,by:y,rx,ry,spd,dx:1,ang:0});
const mkCSpike = (x)=>({type:'spike',x,y:38,w:28,h:28,facing:'down'});
const mkAsteroid = (x,y,r,vx)=>({type:'asteroid',x,y,r,vx,by:y,bx:x,minX:x-r*6,maxX:x+r*6,ang:0,angV:rnd(.012,.04)*(Math.random()<.5?1:-1)});
const mkMeteor = (x,y,r,vx,vy)=>({type:'meteor',x,y,r,vx,vy,ang:0});
const mkFragment = (x,y)=>({x,y,r:11,got:false,ph:rnd(0,6.28)});

function spawnFragment(key, startX, frags){
  const x = startX + rnd(180, CW-180);
  let y;
  if(key==='yellow')      y = yellowDipY(0.3);
  else if(key==='gray')   y = spaceY(0.5 + rnd(-0.12,0.12));
  else                    y = GY - PSZ - 60; 
  frags.push(mkFragment(x, y));
}

function buildPattern(name, sx, plats, obs){
  const d = clamp(gTime*.036 + Math.floor(score/150)*.04, 0, 1);
  switch(name){
    case 'G_SINGLE_SPIKE':{
      const x = sx+320, n=1+Math.floor(d*2);
      for(let i=0;i<n;i++) obs.push(mkSpike(x+i*28, GY-24));
      break;
    }
    case 'G_SPIKE_ROW':{
      const x=sx+340, n=2+Math.floor(d*3);
      for(let i=0;i<n;i++) obs.push(mkSpike(x+i*28, GY-24));
      plats.push(mkPlat(x-20, GY-130, 120+n*28));
      break;
    }
    case 'G_ENEMY_JUMP':{
      const x=sx+320;
      obs.push(mkEnemy(x, GY-PSZ-2, 80+d*40, 1.5+d*.6));
      if(d>.4) obs.push(mkSpike(x+260, GY-24));
      break;
    }
    case 'G_PLATFORM_OVER':{
      const x=sx+300, n=3+Math.floor(d*3);
      for(let i=0;i<n;i++) obs.push(mkSpike(x+i*28, GY-24));
      plats.push(mkPlat(x-15, GY-132, 150+n*14));
      if(d>.5) obs.push(mkSaw(x+30, GY-172, 16, 60, 1.8+d));
      break;
    }
    case 'G_SAW_PLATFORM':{
      const x=sx+280;
      plats.push(mkPlat(x, GY-120, 160));
      obs.push(mkSaw(x+50, GY-160, 18, 70, 2+d));
      obs.push(mkSpike(x+220, GY-24));
      break;
    }
    case 'G_LASER_DODGE':{
      const x=sx+360;
      obs.push(mkLaser(x, 800-d*180, 700+d*80));
      obs.push(mkEnemy(x-220, GY-PSZ-2, 70, 1.4+d*.5));
      break;
    }
    case 'G_ENEMY_PAIR':{
      const x=sx+300;
      obs.push(mkEnemy(x,     GY-PSZ-2, 70, 1.4+d*.5));
      obs.push(mkEnemy(x+220, GY-PSZ-2, 60, 1.6+d*.4));
      if(d>.4) obs.push(mkLaser(x+500, 850-d*150, 750+d*60));
      break;
    }
    case 'G_CHAIN':{
      const x=sx+260;
      obs.push(mkSpike(x,    GY-24));
      obs.push(mkSpike(x+28, GY-24));
      plats.push(mkPlat(x-10, GY-130, 140));
      obs.push(mkSaw(x+40, GY-170, 17, 55, 2.2+d));
      const x2=x+480;
      obs.push(mkSpike(x2,    GY-24));
      if(d>.4) obs.push(mkSpike(x2+28, GY-24));
      break;
    }
    case 'B_ICE_BLOCK':{
      const x=sx+500; const bH=70+Math.floor(d*55);
      obs.push(mkIceBlock(x, bH));
      plats.push(mkPlat(x-50, GY-bH-85, 140));
      if(d>.35) obs.push(mkSpike(x+230, GY-24));
      break;
    }
    case 'B_FREEZE_GAP':{
      const x=sx+520; const pw=120+Math.floor(d*70);
      obs.push(mkPit(x, pw));
      obs.push(mkSpike(x+pw+55, GY-24));
      if(d>.5){ const x2=x+pw+300; obs.push(mkPit(x2, 100+Math.floor(d*40))); }
      break;
    }
    case 'B_DOUBLE_BLOCK':{
      const x=sx+480; const h1=55+Math.floor(d*40), h2=65+Math.floor(d*45);
      obs.push(mkIceBlock(x, h1)); obs.push(mkIceBlock(x+200, h2));
      plats.push(mkPlat(x+80, GY-Math.max(h1,h2)-90, 110));
      break;
    }
    case 'B_SLIP_AND_JUMP':{
      const x=sx+460;
      obs.push(mkSpike(x,    GY-24)); obs.push(mkSpike(x+28, GY-24));
      obs.push(mkSpike(x+380, GY-24));
      if(d>.3) obs.push(mkSpike(x+408, GY-24));
      if(d>.6) obs.push(mkIceBlock(x+620, 60+Math.floor(d*40)));
      break;
    }
    case 'Y_SINGLE_DRONE':{
      obs.push(mkDrone(sx+320, yellowDipY(0.55), 130+d*50, 28, 2.0+d*.7));
      break;
    }
    case 'Y_DRONE_PAIR':{
      const x=sx+300;
      obs.push(mkDrone(x, yellowDipY(0.35), 110+d*40, 22, 2.0+d*.6));
      obs.push(mkDrone(x+320, yellowDipY(0.70), 100+d*30, 26, 2.2+d*.5));
      break;
    }
    case 'Y_CEIL_SPIKE':{
      const x=sx+320, n=2+Math.floor(d*2);
      for(let i=0;i<n;i++) obs.push(mkCSpike(x+i*38));
      if(d>.2) obs.push(mkDrone(x+n*38+240, yellowDipY(0.5), 90, 20, 1.9+d*.5));
      break;
    }
    case 'Y_DRONE_GAUNTLET':{
      const x=sx+280;
      obs.push(mkDrone(x,     yellowDipY(0.20),      100, 16, 2.2+d*.6));  
      obs.push(mkDrone(x+280, yellowDipY(0.65, true), 110, 24, 2.0+d*.5));  
      obs.push(mkDrone(x+550, yellowDipY(0.30),       90,  20, 2.4+d*.4));  
      break;
    }
    case 'Y_MIXED':{
      const x=sx+280;
      obs.push(mkCSpike(x)); obs.push(mkCSpike(x+38));
      plats.push(mkPlat(x-10, yellowDipY(0.45), 140));  
      obs.push(mkDrone(x+280, yellowDipY(0.55), 110+d*40, 22, 2.2+d*.6));
      if(d>.4){ obs.push(mkCSpike(x+560)); obs.push(mkDrone(x+700, yellowDipY(0.6), 90, 18, 2.0+d*.4)); }
      break;
    }
    case 'S_ASTEROID_WAVE':{
      const x=sx+240; const rows=2+Math.floor(d*2);
      const skip=Math.floor(rows/2);        
      for(let i=0;i<=rows;i++){
        if(i===skip) continue;
        const y=spaceY(i/rows);             
        const r=20+Math.floor(d*10);
        const vx=(i%2===0?1:-1)*(1.1+d*.8);
        obs.push(mkAsteroid(x+(i%2)*200, y, r, vx));
      }
      break;
    }
    case 'S_METEOR_STREAK':{
      const x=sx+200; const n=2+Math.floor(d*3);
      for(let i=0;i<n;i++){
        const y=spaceY(i/Math.max(n-1,1));
        obs.push(mkMeteor(x+i*180, y, 14+Math.floor(d*7), -(3.5+d*1.5), (i%2===0?.55:-.55)*(1+d*.4)));
      }
      break;
    }
    case 'S_DEBRIS_CORRIDOR':{
      const x=sx+220, n=3+Math.floor(d*2);
      for(let i=0;i<n;i++){
        const ax=x+i*170, r=16+Math.floor(d*8);
        obs.push(mkAsteroid(ax,     spaceY(0.32+rnd(0,0.1)), r, (Math.random() < 0.5 ? 0.5 : -0.5)));
        obs.push(mkAsteroid(ax+85,  spaceY(0.58+rnd(0,0.1)), r, (Math.random() < 0.5 ? 0.4 : -0.4)));
      }
      break;
    }
    case 'S_MIXED_FIELD':{
      const x=sx+200;
      obs.push(mkAsteroid(x,     spaceY(0.12), 22+Math.floor(d*8),  1.0+d*.6));
      obs.push(mkAsteroid(x+160, spaceY(0.88), 20+Math.floor(d*7), -1.0+d*.5));
      obs.push(mkAsteroid(x+320, spaceY(0.30), 18+Math.floor(d*6),  .8+d*.5));
      obs.push(mkMeteor(x+450, spaceY(0.5), 13+Math.floor(d*5), -(2.8+d), .4*(d>.3?1:0)));
      if(d>.4) obs.push(mkAsteroid(x+550, spaceY(0.70), 18, -.9));
      break;
    }
    case 'E_SPIKE_ECHO':{
      const x=sx+320, n=1+Math.floor(d*2), gap=190+d*50;
      for(let i=0;i<n;i++) obs.push(mkSpike(x+i*28, GY-24));
      for(let i=0;i<n;i++){ const e=mkSpike(x+gap+i*28, GY-24); e.echo=true; obs.push(e); }
      break;
    }
    case 'E_ENEMY_ECHO':{
      const x=sx+300, gap=240+d*50;
      obs.push(mkEnemy(x, GY-PSZ-2, 80+d*30, 1.6+d*.5));
      const e=mkEnemy(x+gap, GY-PSZ-2, 80+d*30, 1.6+d*.5); e.echo=true; obs.push(e);
      break;
    }
    case 'E_SAW_ECHO':{
      const x=sx+300, gap=260+d*50;
      plats.push(mkPlat(x-20, GY-120, 120));
      obs.push(mkSaw(x+30, GY-160, 17, 60, 2+d));
      plats.push(mkPlat(x+gap-20, GY-120, 120));
      const e=mkSaw(x+gap+30, GY-160, 17, 60, 2+d); e.echo=true; obs.push(e);
      break;
    }
    case 'E_MIXED_ECHO':{
      const x=sx+280, gap=280+d*50;
      obs.push(mkSpike(x,    GY-24));
      obs.push(mkSpike(x+28, GY-24));
      const e1=mkSpike(x+gap,    GY-24); e1.echo=true; obs.push(e1);
      const e2=mkSpike(x+gap+28, GY-24); e2.echo=true; obs.push(e2);
      if(d>.5) obs.push(mkEnemy(x+gap+240, GY-PSZ-2, 70, 1.6+d*.4));
      break;
    }
  }
}

const JUMP_MAG = 12.5, GRAV_MAG = 0.50;
const SINGLE_REACH = (JUMP_MAG*JUMP_MAG)/(2*GRAV_MAG);   
const DOUBLE_REACH = SINGLE_REACH * 1.8;                  
const CEIL_Y = 38; 

function yellowDipY(frac, useDouble=false){
  const maxReach = (useDouble ? DOUBLE_REACH : SINGLE_REACH) * 0.82;
  return CEIL_Y + clamp(frac,0,1) * maxReach;
}

const SPACE_Y_MIN = 0.22, SPACE_Y_MAX = 0.78;
function spaceY(frac){ return H*(SPACE_Y_MIN + clamp(frac,0,1)*(SPACE_Y_MAX-SPACE_Y_MIN)); }

function pickPattern(key){
  const patterns = ZONES[key].patterns;
  if(patterns.length===1) return patterns[0];
  let choice;
  do { choice = patterns[Math.floor(Math.random()*patterns.length)]; }
  while(choice===lastPattern[key]);
  lastPattern[key]=choice;
  return choice;
}

function genChunk(startX){
  const plats=[], obs=[], frags=[];
  buildPattern(pickPattern(zKey), startX, plats, obs);
  spawnFragment(zKey, startX, frags);
  return { startX, plats, obs, frags, zone:zKey };
}

function initGame(){
  gState='playing'; score=0; gTime=0; gSpeed=1;
  lives=3; zIdx=0; zKey='green'; zTimer=0; zDur=20000; 
  invTimer=0; graceMS=3200; introFreeze=true; shakeTimer=0;
  patCur={green:0,blue:0,yellow:0,gray:0,echo:0};
  lastPattern={green:null,blue:null,yellow:null,gray:null,echo:null};
  fragCount=0; fragScore=0;
  chunks=[];

  const z=ZONES[zKey];
  phys  ={g:z.gravity,jf:z.jump,ms:z.speed,fr:z.friction};
  tPhys ={...phys};

  P={x:160, y:GY-PSZ, vx:0, vy:0, onGnd:false, sz:PSZ, trail:[], jumps:0};

  for(let i=0;i<3;i++) addChunk();
  applyTheme(zKey, true);
  updateHUD();
  document.getElementById('overlay').classList.remove('show');
  document.getElementById('flash').style.opacity=0;
  spawnBg();
  camera=0;
}

let camera=0;

function addChunk(){
  const last = chunks.length ? chunks[chunks.length-1] : null;
  const sx   = last ? last.startX+CW : 0;
  chunks.push(genChunk(sx));
}

function applyTheme(key, instant){
  const z=ZONES[key];
  document.documentElement.style.setProperty('--zc', z.accent);
  ['zone-label','ov-title'].forEach(id=>document.getElementById(id).style.setProperty('--zc',z.accent));
  const el=document.getElementById('zone-label');
  el.textContent=z.name; el.classList.remove('show');
  if(!instant){
    const zf=document.getElementById('zone-flash');
    zf.style.background=z.accent; zf.style.opacity=0.45;
    setTimeout(()=>zf.style.opacity=0, 500);
  }
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 3200);
  }));
  activateZoneBg(key);
  spawnBg();
}

function advanceZone(){
  zIdx = (zIdx+1) % ZONE_ORDER.length;
  zKey = ZONE_ORDER[zIdx];
  const z = ZONES[zKey];

  tPhys = {g:z.gravity, jf:z.jump, ms:z.speed, fr:z.friction};
  patCur[zKey] = 0;
  lastPattern[zKey] = null;
  chunks = [];

  if(z.flipped){ P.y = 38; P.vy = 0; } 
  else if(ZONES[ZONE_ORDER[(zIdx-1+ZONE_ORDER.length)%ZONE_ORDER.length]].flipped){ P.y = GY-PSZ; P.vy = 0; }
  if(z.floaty){ P.vy = 0; }

  if(zKey === 'green') { currentCW = 450; } else { currentCW = 850; }

  graceMS = 1800;
  const freshStart = Math.floor(camera/CW)*CW;
  for(let i=0; i<4; i++){
    const sx = freshStart + i*CW;
    chunks.push(genChunk(sx));
  }

  applyTheme(zKey, false);
  playSfx('zonechange');
  updateBgZone();
  zDur = 20000; 
}

function spawnBg(){
  bgParts=[];
  const t=ZONES[zKey].bg;
  for(let i=0;i<50;i++){
    const p={x:rnd(0,W),y:rnd(0,H),ph:rnd(0,Math.PI*2)};
    if(t==='leaves')    {p.sz=rnd(4,8); p.vx=rnd(-.3,.1); p.vy=rnd(.2,.55); p.rot=rnd(0,6.28);}
    if(t==='snow')      {p.sz=rnd(2,5); p.vx=rnd(-.35,.35); p.vy=rnd(.15,.55);}
    if(t==='neon_stars'){p.sz=rnd(1,2.5);}
    if(t==='debris')    {p.sz=rnd(3,8); p.vx=rnd(-.5,.5); p.vy=rnd(-.4,.4); p.rot=rnd(0,6.28);}
    bgParts.push(p);
  }
}
function tickBg(dt){
  const t=ZONES[zKey].bg;
  for(const p of bgParts){
    if(t=='leaves'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=.018*dt;if(p.y>H+8)p.y=-8;if(p.x<-8)p.x=W+8;}
    if(t=='snow'){p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.y>H+8)p.y=-8;if(p.x<-8)p.x=W+8;if(p.x>W+8)p.x=-8;}
    if(t=='debris'){p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=.025*dt;if(p.x>W+8)p.x=-8;if(p.x<-8)p.x=W+8;if(p.y>H+8)p.y=-8;if(p.y<-8)p.y=H+8;}
  }
}

const K={};
window.addEventListener('keydown',e=>{
  K[e.code]=true;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
});
window.addEventListener('keyup',e=>K[e.code]=false);
const touch=(id,code)=>{
  const el=document.getElementById(id);
  el.addEventListener('touchstart',e=>{K[code]=true;e.preventDefault();},{passive:false});
  el.addEventListener('touchend',  e=>{K[code]=false;e.preventDefault();},{passive:false});
};
touch('tl','ArrowLeft'); touch('tr','ArrowRight'); touch('tj','Space');

function update(ts){
  const raw=ts-lastTS; lastTS=ts;
  if(raw>200||gState!=='playing') return;
  const dt=clamp(raw/16.667, .1, 2.5);

  gTime  += raw / 1000; 
  const scoreBoost = score * 0.0008;   
  const timeBoost  = gTime * 0.004;    
  const prevSpeed  = gSpeed;
  gSpeed  = clamp(1 + timeBoost + scoreBoost, 1, 3.2);
  const speedTier = Math.floor(gSpeed * 4) / 4; 
  if(speedTier > Math.floor(prevSpeed * 4)/4 && gSpeed > 1.25) playSfx('speedup');
  
  zTimer += raw; 
  if(graceMS>0) graceMS-=raw;
  if(graceMS<=0) introFreeze=false; 
  if(zTimer>=zDur){ zTimer=0; advanceZone(); }

  const lp=clamp(dt*.08, 0, .18);
  phys.g  = lerp(phys.g,  tPhys.g,  lp);
  phys.jf = lerp(phys.jf, tPhys.jf, lp);
  phys.ms = lerp(phys.ms, tPhys.ms, lp);
  phys.fr = lerp(phys.fr, tPhys.fr, lp);

  const z      = ZONES[zKey];
  const isFlip = z.flipped;
  const isFloat= z.floaty;
  const ms     = phys.ms * gSpeed;

  const accelK = {green:.28, blue:.025, yellow:.26, gray:.18, echo:.27};
  const acc    = (accelK[zKey]||.28) * ms;

  if(!introFreeze){
    if(K['ArrowLeft']||K['KeyA'])  P.vx -= acc*dt;
    if(K['ArrowRight']||K['KeyD']) P.vx += acc*dt;
    P.vx  = clamp(P.vx, -ms, ms);
    P.vx *= Math.pow(phys.fr, dt);
    if(Math.abs(P.vx)<.018) P.vx=0;
  } else {
    P.vx = 0; 
  }

  const jp = !introFreeze && (K['Space']||K['ArrowUp']||K['KeyW']);

  if(!isFloat){
    if(!introFreeze){
      P.vy += phys.g * dt;
      P.vy  = clamp(P.vy, -22, 22);
      if(P.onGnd) P.jumps = 0;
      if(jp && !K.prevJp){ 
        if(P.onGnd || P.jumps < 2){ 
          P.vy = phys.jf; 
          P.onGnd = false;
          P.jumps++;
        }
      }
    }
    K.prevJp = jp; 
  }
  else {
    if(!introFreeze){
      if (K['ArrowUp'] || K['KeyW'] || K['Space']) P.vy -= 0.5 * dt;
      if (K['ArrowDown'] || K['KeyS']) P.vy += 0.5 * dt;
      P.vy *= Math.pow(0.95, dt); 
      P.vy = clamp(P.vy, -8, 8);
    }
    if(P.y < H*0.2) { P.y = H*0.2; P.vy = 0; }
    if(P.y + P.sz > H*0.8) { P.y = H*0.8 - P.sz; P.vy = 0; }
  }
  if(!introFreeze){
    P.x += P.vx*dt;
    P.y += P.vy*dt;
    if(P.x < camera+20){ P.x=camera+20; P.vx=0; }
  }

  const tsec=ts/1000;
  P.onGnd=false;
  for(const ch of chunks){
    if(ch.plats) for(const p of ch.plats) if(p.mov) p.y=p.by+Math.sin(tsec*p.spd+p.ph)*p.rng*.5;
    if(ch.obs)   for(const o of ch.obs)   tickObs(o, dt, ts);
  }

  if(!isFlip && !isFloat){
    if(P.y+P.sz >= GY){ P.y=GY-P.sz; P.vy=0; P.onGnd=true; }
    if(P.y<0){ P.y=0; P.vy=0; }
  } else if(isFlip){
    if(P.y <= 38){ P.y = 38; P.vy = 0; P.onGnd = true; }
    if(P.y + P.sz >= H){ P.y = H - P.sz; P.vy = 0; }
  } else {
    P.y = clamp(P.y, 0, H-P.sz);
  }

  if(!isFloat){
    for(const ch of chunks){
      if(!ch.plats) continue;
      for(const p of ch.plats){
        if(!ov(P.x,P.y,P.sz,P.sz, p.x,p.y,p.w,p.h)) continue;
        const oL=(P.x+P.sz)-p.x, oR=(p.x+p.w)-P.x;
        const oT=(P.y+P.sz)-p.y, oB=(p.y+p.h)-P.y;
        const mV=Math.min(oT,oB), mH=Math.min(oL,oR);
        if(!isFlip){
          if(mV<mH){
            if(oT<oB){ P.y=p.y-P.sz; if(P.vy>0){P.vy=0;P.onGnd=true;} }
            else      { P.y=p.y+p.h; if(P.vy<0)P.vy=0; }
          } else {
            if(oL<oR) P.x=p.x-P.sz; else P.x=p.x+p.w; P.vx=0;
          }
        } else {
          if(mV<mH){
            if(oB<oT){ P.y=p.y+p.h; if(P.vy<0){P.vy=0;P.onGnd=true;} }
            else      { P.y=p.y-P.sz; if(P.vy>0)P.vy=0; }
          } else {
            if(oL<oR) P.x=p.x-P.sz; else P.x=p.x+p.w; P.vx=0;
          }
        }
      }
    }
  }

  if(invTimer<=0 && graceMS<=0){
    let hit=false;
    outer: for(const ch of chunks)
      if(ch.obs) for(const o of ch.obs)
        if(hitCheck(o)){ hit=true; break outer; }
    if(hit){ playSfx('obstacle'); hurtPlayer(); }
  }
  if(invTimer>0) invTimer-=dt;

  for(const ch of chunks){
    if(!ch.frags) continue;
    for(const f of ch.frags){
      if(f.got) continue;
      const px=P.x+P.sz/2, py=P.y+P.sz/2;
      if(cirR(px,py,P.sz*.55, f.x-f.r,f.y-f.r,f.r*2,f.r*2)){
        f.got=true; fragCount++; fragScore+=15;
        playSfx('pickup');
      }
    }
  }

  if(!isFlip&&!isFloat&&P.y>H+60){ hurtPlayer(); respawn(); }
  if(isFlip && P.y<-H*.4)        { hurtPlayer(); respawn(); }

  camera += (P.x - W*.33 - camera) * clamp(.09*dt, 0, .16);
  score = Math.max(score, Math.round((P.x-160)/12));
  const totalScore = score + fragScore;
  if(totalScore>best) best=totalScore;
  document.getElementById('score-val').textContent=totalScore+'m';
  document.getElementById('best-val').textContent='BEST: '+best+'m';
  document.getElementById('frag-val').textContent='⚡ '+fragCount;

  const lastCh=chunks[chunks.length-1];
  if(lastCh && lastCh.startX+CW < camera+SPAWN) addChunk();
  chunks=chunks.filter(c=>c.startX+CW > camera-500);

  tickBg(dt);
  P.trail.push({x:P.x, y:P.y+P.sz/2});
  if(P.trail.length>18) P.trail.shift();
}

function tickObs(o, dt, ts){
  switch(o.type){
    case 'enemy':
      o.x += o.spd*o.dir*dt*gSpeed;
      if(o.x>o.bx+o.range){o.x=o.bx+o.range;o.dir=-1;}
      if(o.x<o.bx-o.range*.35){o.x=o.bx-o.range*.35;o.dir=1;}
      break;
    case 'saw':
      o.x   += o.spd*o.dir*dt; o.ang += .09*dt*o.dir;
      if(o.x>o.bx+o.range){o.x=o.bx+o.range;o.dir=-1;}
      if(o.x<o.bx-o.range*.3){o.x=o.bx-o.range*.3;o.dir=1;}
      break;
    case 'laser':
      o.t += dt*16.667; o.on = (o.t%(o.onT+o.offT))<o.onT;
      break;
    case 'iceblock':
      o.x += o.spd*o.dir*dt*gSpeed;
      if(o.x>o.bx+o.range){o.x=o.bx+o.range;o.dir=-1;}
      if(o.x<o.bx-o.range*.3){o.x=o.bx-o.range*.3;o.dir=1;}
      break;
    case 'snowball':
      o.x += o.vx*dt*gSpeed; o.ang += .12*dt;
      break;
    case 'drone':
      o.x += o.spd*o.dx*dt*gSpeed;
      if(o.x>o.bx+o.rx){o.x=o.bx+o.rx;o.dx=-1;}
      if(o.x<o.bx-o.rx*.5){o.x=o.bx-o.rx*.5;o.dx=1;}
      o.y   = o.by + Math.sin(ts*.0020 + o.bx*.011)*o.ry;
      o.ang += .06*dt;
      break;
    case 'asteroid':
      o.x   += o.vx*dt; o.ang += o.angV*dt;
      if(o.x>o.maxX){o.vx=-Math.abs(o.vx);}
      if(o.x<o.minX){o.vx= Math.abs(o.vx);}
      o.y = o.by + Math.sin(ts*.0014+o.bx*.006)*20;
      break;
    case 'meteor':
      o.x += o.vx*dt*gSpeed; o.y += o.vy*dt; o.ang += .10*dt;
      if(o.y>H+40) o.vy=-Math.abs(o.vy);
      if(o.y<-40)  o.vy= Math.abs(o.vy);
      break;
  }
}

function hitCheck(o){
  const px=P.x+5, py=P.y+5, ps=P.sz-10;
  switch(o.type){
    case 'spike':
      if(o.facing==='down') return ov(px+2,py,ps-4,ps-4, o.x+5,o.y,o.w-10,o.h-4);
      return ov(px+2,py+4,ps-4,ps-5, o.x+5,o.y+8,o.w-10,o.h-8);
    case 'enemy': return ov(px,py,ps,ps, o.x+2,o.y+2,o.w-4,o.h-4);
    case 'saw': return cirR(o.x+o.r,o.y+o.r,o.r-5, px,py,ps,ps);
    case 'laser': return o.on && ov(px,py,ps,ps, o.x-2,0,o.w+4,GY);
    case 'iceblock': return ov(px,py,ps,ps, o.x+2,o.y,o.w-4,o.h);
    case 'snowball': return cirR(o.x,o.y,o.r-3, px,py,ps,ps);
    case 'drone': return ov(px,py,ps,ps, o.x+5,o.y+5,o.w-10,o.h-10);
    case 'asteroid': return cirR(o.x,o.y,o.r-4, px,py,ps,ps);
    case 'meteor': return cirR(o.x,o.y,o.r-3, px,py,ps,ps);
    case 'pit': return P.y+P.sz>=GY-3 && P.x+ps>o.x+5 && P.x<o.x+o.w-5;
  }
  return false;
}

function hurtPlayer(){
  if(invTimer>0) return;
  lives--; invTimer=130; updateHUD();
  shakeTimer = 22; 
  const fl=document.getElementById('flash');
  fl.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:15;background:rgba(255,30,30,.52);opacity:1;transition:opacity .1s;';
  setTimeout(()=>fl.style.opacity=0, 250);
  if(lives<=0){ playSfx('die'); gameOver(); }
  else playSfx('hurt');
}
function updateHUD(){
  for(let i=1;i<=3;i++) document.getElementById('h'+i).classList.toggle('dead',i>lives);
}
function respawn(){
  P.x  = camera+W*.22;
  P.y  = ZONES[zKey].flipped ? 2 : GY-PSZ;
  P.vx = 0; P.vy = 0;
}
const FRACTURE_PUNCHLINES = [
  [0,   "Base reality rejected you. Calibration failed early."],
  [30,  "Thermal shift detected. You failed to adapt to the ice."],
  [80,  "Spatial disorientation. Inverted gravity and vacuum broke your streak."],
  [150, "Echo sequence complete. You survived the first cycle of physics."],
  [300, "Anomaly detected. The runner has synchronized with all environments."]
];
function gameOver(){
  gState='gameover';
  stopBgMusic();
  const totalScore = score + fragScore;
  document.getElementById('ov-dist').textContent='Distance: '+totalScore+'m ('+fragCount+' fragments)';
  document.getElementById('ov-best').textContent='Best: '+best+'m';
  let line = FRACTURE_PUNCHLINES[0][1];
  for(const [thresh, txt] of FRACTURE_PUNCHLINES){ if(totalScore>=thresh) line = txt; }
  document.getElementById('ov-punch').textContent = line;
  document.getElementById('overlay').classList.add('show');
}

function draw(){
  const cam = Math.round(camera);
  const z   = ZONES[zKey];
  cx.clearRect(0,0,W,H); 

  cx.save();
  if (shakeTimer > 0) {
    const dx = (Math.random() - 0.5) * 10;
    const dy = (Math.random() - 0.5) * 10;
    cx.translate(dx, dy);
    shakeTimer--;
  }

  if(!z.flipped && !z.floaty){
    cx.save(); cx.globalAlpha=.10; cx.fillStyle=z.accent; cx.fillRect(0,GY,W,H-GY); cx.restore();
    cx.save(); cx.shadowBlur=14; cx.shadowColor=z.aGlow; cx.fillStyle=z.gndLine; cx.fillRect(0,GY,W,3); cx.restore();
  }

  if(z.flipped){
    cx.save(); cx.shadowBlur=14; cx.shadowColor=z.aGlow; cx.fillStyle=z.gndLine; cx.fillRect(0,35,W,3); cx.restore();
    const cg=cx.createLinearGradient(0,0,0,H*.32);
    cg.addColorStop(0,'rgba(255,200,0,.14)'); cg.addColorStop(1,'rgba(0,0,0,0)');
    cx.fillStyle=cg; cx.fillRect(0,0,W,H*.32);
  }

  if(z.floaty){
    const vg=cx.createRadialGradient(W/2,H/2,H*.08,W/2,H/2,H*.75);
    vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.4)');
    cx.fillStyle=vg; cx.fillRect(0,0,W,H);
    cx.save(); cx.globalAlpha=.1; cx.fillStyle=z.accent; cx.fillRect(0,GY,W,1); cx.restore();
  }

  if(zKey==='blue'){
    cx.save(); cx.globalAlpha=.1; cx.fillStyle='#99ddff';
    cx.fillRect(0,0,W,6); cx.fillRect(0,H-6,W,6); cx.fillRect(0,0,6,H); cx.fillRect(W-6,0,6,H);
    cx.restore();
  }

  for(const ch of chunks) drawChunk(ch, cam, z);

  cx.save();
  for(let i=1;i<P.trail.length;i++){
    const a=i/P.trail.length; cx.globalAlpha=a*.25; cx.fillStyle=z.pColor;
    const sz=P.sz*a*.5; const tp=P.trail[i];
    cx.save(); cx.translate(Math.round(tp.x-cam), Math.round(tp.y)); cx.rotate(Math.PI/4);
    cx.fillRect(-sz/2,-sz/2,sz,sz); cx.restore();
  }
  cx.restore();

  if(!(invTimer>0 && Math.floor(invTimer/6)%2===0)){
    const px=Math.round(P.x-cam), py=Math.round(P.y);
    const ctrX=px+P.sz/2, ctrY=py+P.sz/2, r=P.sz/2;
    cx.save(); cx.translate(ctrX, ctrY);
    cx.save(); cx.globalAlpha=.35; cx.fillStyle='#000';
    cx.beginPath(); cx.arc(0,0, r*1.15, 0, Math.PI*2); cx.fill(); cx.restore();

    const ot = performance.now()*0.0032;
    for(let i=0;i<2;i++){
      const ang = ot + i*Math.PI; const ox = Math.cos(ang)*r*1.6, oy = Math.sin(ang)*r*0.9;
      cx.save(); cx.translate(ox,oy); cx.rotate(ang*2.2); cx.globalAlpha=.7; cx.fillStyle=z.pColor;
      cx.beginPath(); cx.moveTo(0,-4); cx.lineTo(3,2); cx.lineTo(-3,2); cx.closePath(); cx.fill(); cx.restore();
    }
    cx.globalAlpha=1;

    cx.save(); 
    cx.rotate(Math.PI/4); 
    cx.shadowBlur=24; 
    cx.shadowColor=z.pGlow; 
    cx.fillStyle=z.pColor;
    
    if (Math.abs(P.vx) > 0.5) {
      cx.scale(1 + (Math.abs(P.vx) * 0.06), 1);
    }

    cx.beginPath(); cx.moveTo(0,-r); cx.lineTo(r*0.72, -r*0.15); cx.lineTo(r, r*0.15); cx.lineTo(r*0.3, r); cx.lineTo(-r*0.3, r); cx.lineTo(-r, r*0.15); cx.lineTo(-r*0.72, -r*0.15); cx.closePath(); cx.fill();
    cx.shadowBlur=0; cx.lineWidth=2.5; cx.strokeStyle='rgba(255,255,255,0.95)'; cx.stroke();
    cx.globalAlpha=.22; cx.fillStyle='#000';
    cx.beginPath(); cx.moveTo(0,-r); cx.lineTo(r*0.72,-r*0.15); cx.lineTo(r,r*0.15); cx.lineTo(r*0.3,r); cx.lineTo(0,r*0.4); cx.closePath(); cx.fill(); cx.globalAlpha=1;
    cx.restore();

    const pulse = 0.8 + Math.sin(performance.now()*0.006)*0.2;
    cx.fillStyle='#ffffff'; cx.globalAlpha=.9;
    cx.beginPath(); cx.arc(0,0, r*0.24*pulse, 0, Math.PI*2); cx.fill(); cx.globalAlpha=1;
    cx.restore();
  }

  if(graceMS>0){
    cx.save(); cx.globalAlpha=clamp(graceMS/1200, 0, 1); cx.fillStyle=z.accent;
    cx.font="bold 20px 'Orbitron',sans-serif"; cx.textAlign='center'; cx.shadowBlur=18; cx.shadowColor=z.aGlow;
    cx.fillText('GET READY', W/2, H*.5-12); cx.restore();
  }

  drawSpeedBar();
  cx.restore(); 
}

function drawBg(z){
  cx.save(); const t=z.bg;
  for(const p of bgParts){
    if(t=='leaves'){
      cx.save(); cx.translate(p.x,p.y); cx.rotate(p.rot); cx.globalAlpha=.45; cx.fillStyle=z.accent;
      cx.beginPath(); cx.ellipse(0,0,p.sz,p.sz*.4,0,0,Math.PI*2); cx.fill(); cx.restore();
    } else if(t=='snow'){
      cx.globalAlpha=.45; cx.fillStyle='#c0e8ff'; cx.beginPath(); cx.arc(p.x,p.y,p.sz,0,Math.PI*2); cx.fill();
    } else if(t=='neon_stars'){
      cx.globalAlpha=.18+Math.sin(p.ph+performance.now()*.001)*.24; cx.fillStyle='#fff';
      cx.beginPath(); cx.arc(p.x,p.y,p.sz,0,Math.PI*2); cx.fill();
    } else if(t=='debris'){
      cx.save(); cx.translate(p.x,p.y); cx.rotate(p.rot); cx.globalAlpha=.18; cx.fillStyle=z.accent;
      cx.fillRect(-p.sz/2,-p.sz/2,p.sz,p.sz); cx.restore();
    }
  }
  cx.globalAlpha=1; cx.restore();
}

function drawChunk(ch, cam, z){
  if(ch.plats) for(const p of ch.plats){
    const px=p.x-cam; if(px>W+10||px+p.w<-10) continue;
    cx.save(); cx.shadowBlur=8; cx.shadowColor=z.accent+'44'; cx.fillStyle=z.platFill; cx.fillRect(px,p.y,p.w,p.h);
    cx.fillStyle=z.platTop; cx.fillRect(px,p.y,p.w,3); cx.shadowBlur=0;
    if(p.mov){ cx.globalAlpha=.5;cx.fillStyle=z.accent;cx.fillRect(px+p.w/2-10,p.y+4,20,4); }
    cx.restore();
  }
  if(ch.frags) for(const f of ch.frags) drawFragment(f, cam, z);
  if(ch.obs) for(const o of ch.obs) drawObs(o, cam, z);
}

function drawFragment(f, cam, z){
  if(f.got) return;
  const fx=f.x-cam; if(fx>W+40||fx<-40) return;
  const pulse = 0.75+Math.sin(performance.now()*0.006+f.ph)*0.25;
  cx.save(); cx.translate(fx, f.y); cx.shadowBlur=20*pulse; cx.shadowColor=z.aGlow; cx.fillStyle=z.accent;
  cx.beginPath();
  for(let i=0;i<4;i++){ const a=i/4*Math.PI*2 + performance.now()*0.0015; const r=f.r*pulse; i===0?cx.moveTo(Math.cos(a)*r,Math.sin(a)*r):cx.lineTo(Math.cos(a)*r,Math.sin(a)*r); }
  cx.closePath(); cx.fill(); cx.fillStyle='rgba(255,255,255,.85)';
  cx.beginPath(); cx.arc(0,0,f.r*0.32*pulse,0,Math.PI*2); cx.fill(); cx.restore();
}

function drawObs(o, cam, z){
  const ox=o.x-cam; if(o.type!=='pit' && (ox>W+140||ox+140<-140)) return;
  cx.save(); if(o.echo) cx.globalAlpha = 0.5;

  switch(o.type){
    case 'spike':{
      cx.save(); cx.shadowBlur=10; cx.shadowColor=z.accent; cx.fillStyle=z.aGlow;
      if(o.facing==='down'){ cx.beginPath(); cx.moveTo(ox,o.y); cx.lineTo(ox+14,o.y+o.h); cx.lineTo(ox+28,o.y); cx.closePath(); cx.fill(); } 
      else { cx.beginPath(); cx.moveTo(ox,o.y+o.h); cx.lineTo(ox+14,o.y); cx.lineTo(ox+28,o.y+o.h); cx.closePath(); cx.fill(); }
      cx.restore(); break;
    }
    case 'enemy':{
      cx.save(); cx.shadowBlur=14; cx.shadowColor='#ff2200'; cx.fillStyle='#cc2008'; cx.fillRect(ox,o.y,o.w,o.h);
      cx.shadowBlur=0; cx.fillStyle='#fff'; cx.fillRect(ox+5,o.y+7,8,8); cx.fillRect(ox+o.w-13,o.y+7,8,8);
      cx.fillStyle='#000'; cx.fillRect(ox+7,o.y+9,5,5); cx.fillRect(ox+o.w-11,o.y+9,5,5); cx.fillStyle='#ff4422';
      cx.beginPath();cx.moveTo(ox+5,o.y);cx.lineTo(ox+10,o.y-11);cx.lineTo(ox+15,o.y);cx.fill();
      cx.beginPath();cx.moveTo(ox+o.w-15,o.y);cx.lineTo(ox+o.w-10,o.y-11);cx.lineTo(ox+o.w-5,o.y);cx.fill();
      cx.restore(); break;
    }
    case 'saw':{
      cx.save(); cx.translate(ox+o.r, o.y+o.r); cx.rotate(o.ang); cx.shadowBlur=14; cx.shadowColor='rgba(255,40,20,.8)'; cx.fillStyle='rgba(210,40,20,.94)';
      cx.beginPath();
      for(let i=0; i<10; i++){ const a1=i/10*Math.PI*2, a2=(i+.5)/10*Math.PI*2; cx.lineTo(Math.cos(a1)*o.r, Math.sin(a1)*o.r); cx.lineTo(Math.cos(a2)*(o.r-8),Math.sin(a2)*(o.r-8)); }
      cx.closePath(); cx.fill(); cx.fillStyle='rgba(255,150,130,.5)'; cx.beginPath(); cx.arc(0,0,7,0,Math.PI*2); cx.fill(); cx.restore(); break;
    }
    case 'laser':{
      if(!o.on){ cx.save(); cx.globalAlpha=.12; cx.fillStyle='#ff6600'; cx.fillRect(ox-2,0,o.w+4,GY); cx.restore(); } 
      else { cx.save(); cx.shadowBlur=22; cx.shadowColor='rgba(255,100,0,1)'; cx.fillStyle='rgba(255,100,20,.94)'; cx.fillRect(ox-2,0,o.w+4,GY); cx.fillStyle='rgba(255,220,140,.7)'; cx.fillRect(ox+1,0,o.w-2,GY); cx.restore(); }
      break;
    }
    case 'iceblock':{
      cx.save(); cx.shadowBlur=18; cx.shadowColor='rgba(60,160,255,.9)'; cx.fillStyle='rgba(80,170,255,.72)'; cx.fillRect(ox,o.y,o.w,o.h);
      cx.fillStyle='rgba(160,220,255,.35)'; cx.fillRect(ox+3,o.y+3,o.w-6,o.h-6); cx.fillStyle='rgba(255,255,255,.55)'; cx.fillRect(ox+5,o.y+6,12,4); cx.fillRect(ox+o.w-16,o.y+6,9,4);
      cx.strokeStyle='rgba(200,240,255,.35)'; cx.lineWidth=1; cx.beginPath(); cx.moveTo(ox+o.w*.4,o.y+8); cx.lineTo(ox+o.w*.6,o.y+o.h-10); cx.stroke(); cx.restore(); break;
    }
    case 'pit':{
      const px2=o.x-cam; if(px2>W+10||px2+o.w<-10) break;
      cx.save(); cx.fillStyle='#00040e'; cx.fillRect(px2,GY,o.w,H-GY);
      const dg=cx.createLinearGradient(px2,GY,px2,GY+80); dg.addColorStop(0,'rgba(0,20,80,.95)'); dg.addColorStop(1,'rgba(0,0,0,0)'); cx.fillStyle=dg; cx.fillRect(px2,GY,o.w,80);
      cx.strokeStyle='rgba(80,170,255,.7)'; cx.lineWidth=2; cx.beginPath(); cx.moveTo(px2,GY);
      for(let dx=0; dx<=o.w; dx+=5) cx.lineTo(px2+dx, GY+Math.sin(dx*.75)*2.8);
      cx.stroke(); cx.restore(); break;
    }
    case 'snowball':{
      cx.save(); cx.translate(ox,o.y); cx.rotate(o.ang); cx.shadowBlur=12; cx.shadowColor='rgba(180,220,255,.7)'; cx.fillStyle='rgba(220,240,255,.92)';
      cx.beginPath(); cx.arc(0,0,o.r,0,Math.PI*2); cx.fill(); cx.fillStyle='rgba(140,180,220,.5)'; cx.beginPath(); cx.arc(-o.r*.25,-o.r*.2,o.r*.35,0,Math.PI*2); cx.fill(); cx.restore(); break;
    }
    case 'drone':{
      cx.save(); cx.shadowBlur=20; cx.shadowColor=z.accent+'cc'; cx.fillStyle=z.accent+'dd';
      cx.beginPath(); const hx=ox+o.w/2, hy=o.y+o.h/2, hr=o.h/2+2;
      for(let i=0; i<6; i++){ const a=i/6*Math.PI*2-Math.PI/6; i===0?cx.moveTo(hx+Math.cos(a)*hr,hy+Math.sin(a)*hr):cx.lineTo(hx+Math.cos(a)*hr,hy+Math.sin(a)*hr); }
      cx.closePath(); cx.fill(); cx.fillStyle='rgba(255,255,160,.95)'; cx.beginPath(); cx.arc(hx,hy,5,0,Math.PI*2); cx.fill();
      cx.save(); cx.translate(hx,hy); cx.rotate(o.ang); cx.strokeStyle=z.aGlow+'bb'; cx.lineWidth=3;
      for(let i=0; i<4; i++){ const a=i/4*Math.PI*2; cx.beginPath(); cx.moveTo(0,0); cx.lineTo(Math.cos(a)*(o.h/2+8), Math.sin(a)*(o.h/2+8)); cx.stroke(); }
      cx.fillStyle=z.accent; for(let i=0; i<4; i++){ const a=i/4*Math.PI*2; cx.beginPath(); cx.arc(Math.cos(a)*(o.h/2+8),Math.sin(a)*(o.h/2+8),4,0,Math.PI*2); cx.fill(); }
      cx.restore(); cx.restore(); break;
    }
    case 'asteroid':{
      cx.save(); cx.translate(ox,o.y); cx.rotate(o.ang); cx.shadowBlur=10; cx.shadowColor='rgba(160,160,160,.5)'; cx.fillStyle='rgba(105,105,105,.94)';
      cx.beginPath();
      for(let i=0; i<10; i++){ const a=i/10*Math.PI*2; const r2=o.r*(0.70+((i*6271)%100)*.003); i===0?cx.moveTo(Math.cos(a)*r2,Math.sin(a)*r2):cx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2); }
      cx.closePath(); cx.fill(); cx.fillStyle='rgba(55,55,55,.55)'; cx.beginPath(); cx.arc(-o.r*.25,-o.r*.2,o.r*.22,0,Math.PI*2); cx.fill(); cx.beginPath(); cx.arc( o.r*.28, o.r*.18,o.r*.14,0,Math.PI*2); cx.fill(); cx.restore(); break;
    }
    case 'meteor':{
      cx.save(); cx.translate(ox,o.y); cx.rotate(Math.atan2(o.vy,o.vx)); cx.shadowBlur=22; cx.shadowColor='rgba(255,120,20,.85)';
      const tg=cx.createLinearGradient(o.r*2.5,0,-o.r,0); tg.addColorStop(0,'rgba(255,140,20,0)'); tg.addColorStop(1,'rgba(255,140,20,.6)'); cx.fillStyle=tg;
      cx.beginPath(); cx.ellipse(o.r*.8,0,o.r*1.8,o.r*.38,0,0,Math.PI*2); cx.fill(); cx.fillStyle='rgba(255,170,40,.96)'; cx.beginPath(); cx.arc(0,0,o.r,0,Math.PI*2); cx.fill();
      cx.fillStyle='rgba(255,240,120,.85)'; cx.beginPath(); cx.arc(-o.r*.18,-o.r*.18,o.r*.4,0,Math.PI*2); cx.fill(); cx.restore(); break;
    }
  }
  cx.restore();
}

let audioCtx = null; let bgGain = null; let bgNodes = []; let musicPlaying = false;
let delayNode = null, delayFeedback = null, delayWet = null, noiseBuffer = null, masterOut = null;

function ensureAudio(){ 
  try {
    if(audioCtx) return; 
    audioCtx = new (window.AudioContext||window.webkitAudioContext)(); 
    // shared master bus - keeps every layer (music + sfx) glued together and stops clipping
    masterOut = audioCtx.createDynamicsCompressor();
    masterOut.threshold.value = -18; masterOut.knee.value = 20; masterOut.ratio.value = 4;
    masterOut.attack.value = 0.004; masterOut.release.value = 0.2;
    masterOut.connect(audioCtx.destination);
    bgGain = audioCtx.createGain(); 
    bgGain.gain.value = 0.35; 
    bgGain.connect(masterOut); 
    // shared echo bus - gives the whole score a sense of collapsing, cavernous space
    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.value = 0.3;
    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.3;
    delayWet = audioCtx.createGain();
    delayWet.gain.value = 0.3;
    delayNode.connect(delayFeedback); delayFeedback.connect(delayNode);
    delayNode.connect(delayWet); delayWet.connect(masterOut);
    bgGain.connect(delayNode);
  } catch(e) { console.error("Web Audio Context blocked:", e); }
}

function getNoiseBuffer(){
  if(noiseBuffer) return noiseBuffer;
  const len = Math.floor(audioCtx.sampleRate * 0.3);
  noiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for(let i=0;i<len;i++){ data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2); }
  return noiseBuffer;
}

function startBgMusic(){
  ensureAudio(); 
  if(!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if(musicPlaying) return;
  musicPlaying = true; 
  stopBgMusic();
  
  const zoneFreqs = { 
    green: [55, 110, 138.6, 164.8, 220],   
    blue: [41.2, 82.4, 103.8, 123.5, 164.8],  
    yellow: [65.4, 130.8, 164.8, 196, 246.9], 
    gray: [36.7, 73.4, 55, 73.4, 87.3],        
    echo: [48.9, 97.9, 146.8, 174.6, 220]    
  };
  
  const freqs = zoneFreqs[zKey] || zoneFreqs.green;

  // Layer 1: Bass loop hum - slow filter "breathing" + gentle stereo width so it isn't a flat drone
  freqs.slice(0, 2).forEach((baseFreq, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth'; 
    osc.frequency.value = baseFreq;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 150; 
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.1 + i * 0.06;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 55;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    lfo.start(); bgNodes.push(lfo);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.22;
    osc.connect(filter);
    if(audioCtx.createStereoPanner){
      const pan = audioCtx.createStereoPanner();
      pan.pan.value = i === 0 ? -0.25 : 0.25;
      filter.connect(pan); pan.connect(gainNode);
    } else { filter.connect(gainNode); }
    gainNode.connect(bgGain);
    osc.start(); bgNodes.push(osc);
  });

  // Layer 2: soft kick + off-beat noise tick - gives the run a pulse that quickens as the collapse speeds up
  schedulePulse();

  // Layer 3: arpeggio chord rhythm, tempo & brightness now tied to run speed
  scheduleArp(freqs);
}

let pulseTimeout = null;
function schedulePulse(){
  if(!musicPlaying || !audioCtx) return;
  const now = audioCtx.currentTime;
  const speed = gSpeed || 1;
  const beat = 0.72 / speed; // "the collapse accelerates as you go" - pulse quickens with it

  const kick = audioCtx.createOscillator();
  kick.type = 'sine';
  kick.frequency.setValueAtTime(110, now);
  kick.frequency.exponentialRampToValueAtTime(38, now + 0.16);
  const kickGain = audioCtx.createGain();
  kickGain.gain.setValueAtTime(0.32, now);
  kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  kick.connect(kickGain); kickGain.connect(bgGain);
  kick.start(now); kick.stop(now + 0.2);

  const tick = audioCtx.createBufferSource();
  tick.buffer = getNoiseBuffer();
  const tickFilter = audioCtx.createBiquadFilter();
  tickFilter.type = 'highpass';
  tickFilter.frequency.value = 2500 + speed * 900;
  const tickGain = audioCtx.createGain();
  tickGain.gain.setValueAtTime(0.001, now);
  tickGain.gain.setValueAtTime(0.14, now + beat * 0.5);
  tickGain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.5 + 0.05);
  tick.connect(tickFilter); tickFilter.connect(tickGain); tickGain.connect(bgGain);
  tick.start(now + beat * 0.5); tick.stop(now + beat * 0.5 + 0.06);

  bgNodes.push(kick, tick);
  pulseTimeout = setTimeout(() => { if(musicPlaying) schedulePulse(); }, beat * 1000);
}

let arpTimeout = null;
function scheduleArp(freqs){
  if(!musicPlaying || !audioCtx) return;
  const now = audioCtx.currentTime; 
  const speed = gSpeed || 1;
  const tempo = 0.18 / Math.sqrt(speed); // arpeggio quickens as the run speeds up
  const brighten = 1 + (speed - 1) * 0.06;
  const pattern = [0, 2, 1, 3, 2, 1]; 
  const masterG = audioCtx.createGain();
  masterG.gain.value = 0.4; 
  masterG.connect(bgGain);
  
  pattern.forEach((fi, i) => {
    const osc = audioCtx.createOscillator(); 
    osc.type = 'square'; 
    osc.frequency.value = freqs[fi % freqs.length] * 4 * brighten;
    const env = audioCtx.createGain(); 
    env.gain.setValueAtTime(0, now + i * tempo); 
    env.gain.linearRampToValueAtTime(0.6, now + i * tempo + 0.02); 
    env.gain.linearRampToValueAtTime(0, now + i * tempo + tempo * 0.7);
    if(audioCtx.createStereoPanner){
      const pan = audioCtx.createStereoPanner();
      pan.pan.value = (i % 2 === 0) ? -0.3 : 0.3;
      osc.connect(env); env.connect(pan); pan.connect(masterG);
    } else {
      osc.connect(env); env.connect(masterG); 
    }
    osc.start(now + i * tempo); osc.stop(now + i * tempo + tempo); 
    bgNodes.push(osc);
  });
  
  const loopMs = pattern.length * tempo * 1000; 
  arpTimeout = setTimeout(() => { if(musicPlaying) scheduleArp(freqs); }, loopMs);
}

function stopBgMusic(){ 
  if(arpTimeout){ clearTimeout(arpTimeout); arpTimeout = null; }
  if(pulseTimeout){ clearTimeout(pulseTimeout); pulseTimeout = null; }
  bgNodes.forEach(n => { try{ n.stop(); }catch(e){} }); 
  bgNodes = []; 
  musicPlaying = false; 
}

function updateBgZone(){ 
  if(audioCtx && bgGain){
    const now = audioCtx.currentTime;
    bgGain.gain.cancelScheduledValues(now);
    bgGain.gain.setValueAtTime(bgGain.gain.value, now);
    bgGain.gain.linearRampToValueAtTime(0.0001, now + 0.18);
  }
  stopBgMusic(); 
  if (bgZoneTimeout) clearTimeout(bgZoneTimeout);
  bgZoneTimeout = setTimeout(() => {
    startBgMusic();
    if(audioCtx && bgGain){
      const now2 = audioCtx.currentTime;
      bgGain.gain.cancelScheduledValues(now2);
      bgGain.gain.setValueAtTime(0.0001, now2);
      bgGain.gain.linearRampToValueAtTime(0.35, now2 + 0.35);
    }
  }, 200); 
}

function playSfx(type){
  if(!audioCtx) return; const now = audioCtx.currentTime; const master = audioCtx.createGain(); master.connect(masterOut || audioCtx.destination);
  switch(type){
    case 'jump': { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(260, now); o.frequency.exponentialRampToValueAtTime(540, now + 0.1); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.20, now); g.gain.linearRampToValueAtTime(0, now + 0.1); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.12); master.gain.value = 0.5; break; }
    case 'doublejump': { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(380, now); o.frequency.exponentialRampToValueAtTime(700, now + 0.08); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.18, now); g.gain.linearRampToValueAtTime(0, now + 0.08); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.1); master.gain.value = 0.5; break; }
    case 'land': { const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(120, now); o.frequency.linearRampToValueAtTime(60, now + 0.05); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.15, now); g.gain.linearRampToValueAtTime(0, now + 0.05); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.06); master.gain.value = 0.4; break; }
    case 'hurt': { const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, now); o.frequency.linearRampToValueAtTime(50, now + 0.25); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.3, now); g.gain.linearRampToValueAtTime(0, now + 0.25); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.26); master.gain.value = 0.5; break; }
    case 'die': { const o = audioCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(40, now + 0.5); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.35, now); g.gain.linearRampToValueAtTime(0, now + 0.5); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.55); master.gain.value = 0.6; break; }
    case 'zonechange': { [0, 0.1].forEach((d, i) => { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = [293.6, 440][i]; const g = audioCtx.createGain(); g.gain.setValueAtTime(0.2, now + d); g.gain.linearRampToValueAtTime(0, now + d + 0.3); o.connect(g); g.connect(master); o.start(now + d); o.stop(now + d + 0.35); }); master.gain.value = 0.5; break; }
    case 'speedup': { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(700, now); o.frequency.exponentialRampToValueAtTime(1200, now + 0.06); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.12, now); g.gain.linearRampToValueAtTime(0, now + 0.07); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.08); master.gain.value = 0.3; break; }
    case 'pickup': { const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(587.3, now); o.frequency.exponentialRampToValueAtTime(1174.7, now + 0.08); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.15, now); g.gain.linearRampToValueAtTime(0, now + 0.09); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.1); master.gain.value = 0.4; break; }
    case 'obstacle': { const o = audioCtx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(800, now); o.frequency.exponentialRampToValueAtTime(200, now + 0.05); const g = audioCtx.createGain(); g.gain.setValueAtTime(0.15, now); g.gain.linearRampToValueAtTime(0, now + 0.06); o.connect(g); g.connect(master); o.start(now); o.stop(now + 0.07); master.gain.value = 0.4; break; }
  }
}

let _wasOnGnd = true; let _prevJumps = 0;
function tickAudio(){ if(!audioCtx || gState !== 'playing') return; const jumpsNow = P.jumps || 0; if(!_wasOnGnd && P.onGnd){ playSfx('land'); } if(jumpsNow === 1 && _prevJumps === 0){ playSfx('jump'); } if(jumpsNow === 2 && _prevJumps === 1){ playSfx('doublejump'); } _wasOnGnd = P.onGnd; _prevJumps = jumpsNow; }

function drawSpeedBar(){
  if(gState !== 'playing') return;
  const barW = 100, barH = 6, x = W - 130, y = 52; const pct = (gSpeed - 1) / 2.2;
  cx.save(); cx.globalAlpha = 0.3; cx.fillStyle = '#fff'; cx.fillRect(x, y, barW, barH);
  const spd = clamp(pct, 0, 1); const r = Math.floor(lerp(60, 255, spd)); const g2 = Math.floor(lerp(220, 40, spd));
  cx.globalAlpha = 0.85; cx.fillStyle = `rgb(${r},${g2},60)`; cx.fillRect(x, y, barW * spd, barH);
  cx.globalAlpha = 1; cx.strokeStyle = 'rgba(255,255,255,0.4)'; cx.lineWidth = 1; cx.strokeRect(x, y, barW, barH);
  cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.font = '9px "Share Tech Mono", monospace'; cx.textAlign = 'right'; cx.fillText(`SPEED ×${gSpeed.toFixed(2)}`, x + barW, y - 3); cx.textAlign = 'left'; cx.restore();
}

function loop(ts){ update(ts); tickAudio(); draw(); requestAnimationFrame(loop); }

initGame();
requestAnimationFrame(loop);

document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('start-overlay').style.display = 'none';
  ensureAudio(); 
  initGame(); 
  startBgMusic(); 
  lastTS = performance.now(); 
  gState = 'playing';
});

document.getElementById('ov-btn').addEventListener('click', () => {
  ensureAudio(); 
  initGame(); 
  startBgMusic(); 
  lastTS = performance.now(); 
  gState = 'playing';
});
