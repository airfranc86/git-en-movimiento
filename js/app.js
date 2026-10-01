/**
 * UI: dibuja las fotos del motor sobre un SVG, maneja la terminal,
 * los controles de reproducción, la ruta de aprendizaje y la comparativa.
 */
(function () {
'use strict';
const {build,reachable,clone,SC,ROUTE,LEVEL,LV_NAME,RUTA}=window.GitSim;

/** Todo lo ajustable está acá. */
const CONFIG={
  graph:{DX:92,DY:120,TOP:100,LEFT:100}, // separación entre commits, entre carriles y márgenes del SVG
  autoplayMs:2800,                          // tiempo entre pasos en modo reproducir
  storagePrefix:'gitsim:',                  // prefijo de claves en localStorage
};

/** localStorage tolerante a fallos (modo privado, cuota llena, bloqueado). */
const store={
  get(k){try{return localStorage.getItem(CONFIG.storagePrefix+k);}catch(e){return null;}},
  set(k,v){try{localStorage.setItem(CONFIG.storagePrefix+k,String(v));}catch(e){}},
};

const NS='http://www.w3.org/2000/svg';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=s=>esc(s).replace(/\|([^|]+)\|/g,'<code>$1</code>');
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);if(attrs)for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
const trunc=(s,n)=>s.length>n?s.slice(0,n-1)+'…':s;
const {DX,DY,TOP,LEFT}=CONFIG.graph;
const pos=c=>({x:LEFT+(c.seq-1)*DX,y:TOP+c.lane*DY});
const RISK={bajo:'Riesgo bajo',medio:'Riesgo medio',alto:'Riesgo alto'};

const ST={sc:null,snaps:[],i:0,timer:null,L:null,M:null};
const svg=$('#graph');

function initSvg(){
  svg.innerHTML='';
  let maxSeq=1,maxLane=ST.sc.lanes.length-1;
  ST.snaps.forEach(s=>Object.values(s.commits).forEach(c=>{maxSeq=Math.max(maxSeq,c.seq);maxLane=Math.max(maxLane,c.lane);}));
  const W=LEFT+(maxSeq-1)*DX+90, H=TOP+maxLane*DY+62;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('width',W);svg.setAttribute('height',H);
  const L={lanes:el('g',{},svg),edges:el('g',{},svg),nodes:el('g',{},svg),refs:el('g',{},svg)};
  ST.sc.lanes.forEach((name,i)=>{const y=TOP+i*DY;el('line',{class:'lane-line',x1:LEFT-20,x2:W-10,y1:y,y2:y},L.lanes);const t=el('text',{class:'lane-lbl',x:12,y:y+4},L.lanes);t.textContent=name;});
  ST.L=L;ST.M={nodes:new Map(),edges:new Map(),refs:new Map()};ST.fresh=true;
}

function edgePath(p,c,pi){
  const a=pos(p),b=pos(c);
  if(a.y===b.y)return `M${a.x} ${a.y} L${b.x} ${b.y}`;
  if(pi>0){const sx=b.x-DX;return `M${a.x} ${a.y} L${sx} ${a.y} C${sx+DX/2} ${a.y} ${sx+DX/2} ${b.y} ${b.x} ${b.y}`;}
  const ex=a.x+DX;return `M${a.x} ${a.y} C${a.x+DX/2} ${a.y} ${a.x+DX/2} ${b.y} ${ex} ${b.y} L${b.x} ${b.y}`;
}

function renderGraph(){
  const s=ST.snaps[ST.i],{L,M}=ST;
  const reach=reachable(s),prev=ST.i>0?reachable(ST.snaps[ST.i-1]):null,anim=ST.i>0&&!ST.fresh;ST.fresh=false;
  // nodos
  for(const [id,g] of M.nodes)if(!s.commits[id]){g.remove();M.nodes.delete(id);}
  const wantE=new Set();
  Object.values(s.commits).forEach(c=>{
    c.parents.forEach((p,pi)=>{if(!s.commits[p])return;const k=p+'>'+c.id;wantE.add(k);
      let e=M.edges.get(k),isNew=false;
      if(!e){e=el('path',{d:edgePath(s.commits[p],c,pi)},L.edges);M.edges.set(k,e);isNew=true;}
      const lane=pi>0?s.commits[p].lane:c.lane;
      e.setAttribute('class',`edge lane${lane}${reach.has(c.id)?'':' orphan'}${isNew&&anim?' enter':''}`);
    });
    let g=M.nodes.get(c.id),isNew=false;
    if(!g){isNew=true;const {x,y}=pos(c);
      g=el('g',{transform:`translate(${x},${y})`},L.nodes);
      el('circle',{class:'ring',r:16},g);el('circle',{class:'outer',r:20},g);el('circle',{class:'dot',r:15},g);
      const t=el('text',{class:'cid','text-anchor':'middle',dy:'0.35em'},g);t.textContent=c.id;
      const m=el('text',{class:'cmsg','text-anchor':'middle',y:34},g);m.textContent=trunc(c.msg,15);
      if(c.author!=='vos'){const a=el('text',{class:'cauth','text-anchor':'middle',y:47},g);a.textContent=c.author;}
      const cl=el('text',{class:'cloud','text-anchor':'middle',x:17,y:-12},g);cl.textContent='☁';
      const ti=el('title',{},g);ti.textContent=`${c.id}: ${c.msg} (autor: ${c.author})`;
      M.nodes.set(c.id,g);}
    const lost=prev&&prev.has(c.id)&&!reach.has(c.id);
    g.setAttribute('class',['node','lane'+c.lane,'k-'+c.kind,reach.has(c.id)?'':'orphan',c.remoteOnly?'remote':'',s.hl.includes(c.id)?'hl':'',lost?'lost':'',isNew&&anim?'enter':''].filter(Boolean).join(' '));
  });
  for(const [k,e] of M.edges)if(!wantE.has(k)){e.remove();M.edges.delete(k);}
  // refs
  const refs=[];
  Object.entries(s.branches).forEach(([n,at])=>refs.push({key:'b:'+n,label:(n===s.head?'HEAD -> ':'')+n,at,kind:n===s.head?'head':'local',o:n===s.head?0:1}));
  Object.entries(s.remotes).forEach(([n,at])=>refs.push({key:'r:'+n,label:n,at,kind:'remote',o:2}));
  refs.sort((a,b)=>a.o-b.o||a.label.localeCompare(b.label));
  const stack={},want=new Set();
  refs.forEach(r=>{
    want.add(r.key);const c=s.commits[r.at];if(!c)return;
    const idx=stack[r.at]=(stack[r.at]??-1)+1;
    const w=r.label.length*6.4+16,{x,y}=pos(c),tx=x-w/2,ty=y-40-idx*22;
    let g=M.refs.get(r.key);
    if(!g){g=el('g',{},L.refs);el('rect',{height:18,rx:9},g);el('text',{y:12.5},g);M.refs.set(r.key,g);
      g.style.transition='none';g.style.transform=`translate(${tx}px,${ty}px)`;g.getBoundingClientRect();g.style.transition='';
      if(anim)g.classList.add('enter');}
    g.setAttribute('class',`ref ${r.kind}${g.classList.contains('enter')?' enter':''}`);
    const rect=g.querySelector('rect'),t=g.querySelector('text');
    rect.setAttribute('width',w);t.setAttribute('x',w/2);t.setAttribute('text-anchor','middle');t.textContent=r.label;
    g.style.transform=`translate(${tx}px,${ty}px)`;
  });
  for(const [k,g] of M.refs)if(!want.has(k)){g.remove();M.refs.delete(k);}
}

function prompt(st){
  if(st.who==='ana')return '<span class="pr ana">ana $</span>';
  if(st.who==='gh')return '<span class="pr gh">github.com ▸</span>';
  return '<span class="pr">$</span>';
}
function outCls(o){return /rejected|error:/.test(o)?' rej':/forced update/.test(o)?' frc':'';}
function renderTerm(){
  const {sc,snaps,i}=ST;let h='';
  sc.steps.forEach((st,k)=>{
    const cls=k===i?'cur':k>i?'future':'';
    if(!st.cmd)h+=`<div class="tl ${cls}" data-k="${k}"><span class="cm"># estado inicial</span></div>`;
    else st.cmd.split('\n').forEach(line=>{h+=`<div class="tl ${cls}" data-k="${k}">${prompt(st)}${esc(line)}</div>`;});
    const o=st.out??snaps[k].out;
    if(o&&k<=i)h+=`<pre class="to${outCls(o)}">${esc(o)}</pre>`;
  });
  const t=$('#term');t.innerHTML=h;
  t.scrollTop=t.scrollHeight;
}
function renderExplain(){
  const {sc,i}=ST,st=sc.steps[i];
  $('#stepN').textContent=i===0?'Punto de partida':`Paso ${i} de ${sc.steps.length-1}`;
  $('#stepCmd').textContent=st.cmd?(st.who==='gh'?'GitHub: ':st.who==='ana'?'Ana: ':'')+st.cmd.replace(/\n/g,'  &&  '):'';
  $('#stepCmd').hidden=!st.cmd;
  $('#stepD').innerHTML=`<p>${fmt(st.d)}</p>`;
  $('#alert').innerHTML=st.alert?`<div class="alert ${st.alert.t}"><strong>${esc(st.alert.h)}</strong>${fmt(st.alert.m)}</div>`:'';
  let nx='';
  if(i===sc.steps.length-1){
    const n=nextInRoute(sc.id),title=id=>esc(SC.find(s=>s.id===id).title);
    if(n)nx=`<p>Escenario completado.</p><button type="button" data-load="${n}">Siguiente: ${title(n)}</button>`;
    else if(ST.lv<3)nx=`<p>Completaste la ruta ${RUTA[ST.lv]}.</p><button type="button" data-lvup="1">Seguir con la ruta ${RUTA[ST.lv+1]}</button><button type="button" class="sec" data-load="compare">Ver comparativa</button>`;
    else nx=`<p>Completaste la ruta completa.</p><button type="button" data-load="compare">Ver comparativa</button>`;
    nx=`<div class="next">${nx}</div>`;
  }
  $('#next').innerHTML=nx;
  renderScNav();
}
function renderArea(){
  const a=$('#area');if(!ST.sc.showArea){a.hidden=true;return;}
  a.hidden=false;const s=ST.snaps[ST.i],hc=s.commits[s.branches[s.head]];
  const files=l=>l.length?l.map(f=>`<span class="file">${esc(f)}</span>`).join(''):'<span class="empty">vacío</span>';
  a.innerHTML=`<div class="abox${s.area.wd.length?' has':''}"><h4>Working directory</h4><small>Lo que modificaste en disco</small>${files(s.area.wd)}</div>
  <div class="abox${s.area.idx.length?' has':''}"><h4>Staging (índice)</h4><small>Lo que entra en el próximo commit</small>${files(s.area.idx)}</div>
  <div class="abox"><h4>Repositorio (HEAD)</h4><small>Último commit de ${esc(s.head)}</small><span class="file">${esc(hc.id)}</span> <span class="empty">${esc(hc.msg)}</span></div>`;
}
function renderControls(){
  const {sc,i}=ST,n=sc.steps.length;
  const last=i===n-1,nb=$('#bNext');
  $('#bPrev').disabled=i===0;$('#bReset').disabled=i===0;
  nb.disabled=false;
  nb.textContent=last?advanceLabel():'Siguiente paso ›';
  nb.classList.toggle('go',last);
  $('#bPlay').textContent=ST.timer?'Pausar':(i===n-1?'Repetir':'Reproducir');
  $('#dots').innerHTML=sc.steps.map((_,k)=>`<button type="button" class="${k===i?'now':k<i?'done':''}" data-k="${k}" aria-label="Ir al paso ${k}">${k}</button>`).join('');
}
function markDone(){
  if(ST.i===ST.sc.steps.length-1&&!ST.done.has(ST.sc.id)){ST.done.add(ST.sc.id);save();renderNav();renderProgress();}
}
function render(){renderGraph();renderTerm();renderExplain();renderArea();renderControls();markDone();}
function go(k){
  const n=ST.sc.steps.length;k=Math.max(0,Math.min(n-1,k));
  if(k<ST.i-1||k>ST.i+1){ST.i=k;initSvg();}else ST.i=k;
  // al saltar hacia atrás o adelante varios pasos, se redibuja de cero para evitar animaciones engañosas
  render();
}
function stop(){if(ST.timer){clearInterval(ST.timer);ST.timer=null;}}
function play(){
  if(ST.timer){stop();renderControls();return;}
  if(ST.i===ST.sc.steps.length-1)go(0);
  ST.timer=setInterval(()=>{if(ST.i>=ST.sc.steps.length-1){stop();renderControls();return;}go(ST.i+1);},CONFIG.autoplayMs);
  renderControls();
}

function renderInfo(sc){
  $('#scGroup').textContent=sc.group;$('#scTitle').textContent=sc.title;$('#scWhat').innerHTML=fmt(sc.what);
  const b=[`<span class="badge lvl"><b>${LV_NAME[LEVEL[sc.id]]}</b></span>`];
  if(sc.risk!=='none')b.push(`<span class="badge r-${sc.risk}"><b>${RISK[sc.risk]}</b></span>`);
  b.push(`<span class="badge">Reescribe historia: <b>${esc(sc.rewrites)}</b></span>`);
  b.push(`<span class="badge">Force push: <b>${esc(sc.force)}</b></span>`);
  $('#badges').innerHTML=b.join('');
  const I=sc.info;
  $('#info').innerHTML=`<section class="pros"><h3>${sc.id==='basics'?'Ideas clave':'Pros'}</h3><ul>${I.pros.map(x=>`<li>${fmt(x)}</li>`).join('')}</ul></section>
  <section class="cons"><h3>${sc.id==='basics'?'Errores comunes':'Contras'}</h3><ul>${I.cons.map(x=>`<li>${fmt(x)}</li>`).join('')}</ul></section>
  <section class="when"><h3>Cuándo usarlo</h3><p>${fmt(I.when)}</p></section>`;
}

function renderCompare(){
  const rows=[
    ['ff','Merge fast-forward','n:No','n:No','Lineal','n:Sí','Ramas cortas sin divergencia'],
    ['merge','Merge sin rebase','n:No','n:No','Ramificada, con merge commits','n:Sí','Ramas compartidas, trazabilidad'],
    ['rebase','Rebase + fast-forward','y:Sí, la rama','m:Si estaba pusheada','Lineal','y:No','Ramas personales'],
    ['rebase-noff','Rebase + --no-ff','y:Sí, la rama','m:Si estaba pusheada','Semi-lineal (burbujas)','y:No','Lineal pero agrupado por feature'],
    ['squash','Squash merge','m:En la práctica','n:No','Lineal, 1 commit por feature','n:Sí, sobre main','PRs con commits desprolijos'],
    ['pull-merge','git pull (merge)','n:No','n:No','Merges triviales','n:Sí','Equipos sin reescritura'],
    ['pull-rebase','git pull --rebase','m:Solo local','n:No','Lineal','n:Sí','Sincronizar con el remoto'],
    ['cherry','Cherry-pick','n:No (copia)','n:No','Duplica commits','n:Sí','Hotfix y backports'],
    ['revert','Revert','n:No','n:No','Agrega un commit inverso','n:Sí','Deshacer algo público'],
    ['reset','Reset','y:Sí','m:Si estaba pusheado','Recorta la punta','y:No','Deshacer algo local'],
    ['force','push --force','y:Sí, en GitHub','y:Es el force','Lo que tenga tu copia local','y:No','Solo ramas 100% tuyas'],
    ['lease','--force-with-lease','y:Sí, en GitHub','m:Con verificación','Lo que tenga tu copia, si nadie pusheó','m:Con cuidado','Cualquier force necesario'],
    ['pr-merge','PR: merge commit','n:No','n:No','Ramificada','n:Sí','Default de GitHub'],
    ['pr-squash','PR: squash','m:En la práctica','n:No','Lineal, 1 commit por PR','n:Sí','Repos open source, PRs chicos'],
    ['pr-rebase','PR: rebase','y:Sí (nuevos SHAs)','n:No','Lineal','n:Sí','Commits atómicos y cuidados'],
  ];
  const vis=rows.filter(r=>LEVEL[r[0]]<=ST.lv);
  const cell=v=>{const [k,t]=v.split(':');return `<td><span class="${k}">${esc(t)}</span></td>`;};
  $('#compare').innerHTML=`<p class="grp">Resumen</p><h2>Comparativa general</h2>
  <p class="what">Operaciones de la ruta ${RUTA[ST.lv]}${ST.lv<3?' (cambiá de nivel arriba para ver más)':''}. Tocá el nombre para ver la animación.</p>
  <div class="tbl-wrap"><table><thead><tr><th>Operación</th><th>Reescribe historia</th><th>Requiere force push</th><th>Forma de la historia</th><th>Seguro en ramas compartidas</th><th>Ideal para</th></tr></thead><tbody>
  ${vis.map(r=>`<tr><td><button type="button" data-go="${r[0]}">${esc(r[1])}</button></td>${cell(r[2])}${cell(r[3])}<td>${esc(r[4])}</td>${cell(r[5])}<td>${esc(r[6])}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="rules">
    <div><h3>Regla de oro</h3><p>No reescribas historia que otra persona ya bajó. Rebase, reset, amend y force son libres solo en commits que nadie más tiene.</p></div>
    <div><h3>En main</h3><p>Merge, squash o revert. Nunca reset ni force push: activá branch protection en GitHub para que sea imposible.</p></div>
    <div><h3>En tu rama</h3><p>Rebaseá libremente sobre main para ponerte al día, y pusheá con <code>--force-with-lease --force-if-includes</code>.</p></div>
  </div>
  <div class="decide"><h3>Cómo elegir la estrategia de merge de un equipo</h3><ol>
    <li>¿Necesitás saber exactamente qué se revisó y cuándo se integró? Merge commit.</li>
    <li>¿Querés main legible como changelog y los PRs suelen tener commits desprolijos? Squash and merge.</li>
    <li>¿El equipo escribe commits atómicos y quiere historia lineal? Rebase and merge, o rebase + --no-ff si querés ver los límites de cada feature.</li>
    <li>Sea cual sea, configurá <code>pull.rebase true</code> para sincronizar sin merges triviales.</li>
  </ol></div>`;
}

function load(id){
  stop();const sc=SC.find(s=>s.id===id)||SC[0];ST.sc=sc;
  markCurrent();
  if(sc.compare){$('#scenario').hidden=true;$('#compare').hidden=false;renderCompare();return;}
  $('#scenario').hidden=false;$('#compare').hidden=true;
  ST.snaps=build(sc);ST.i=0;initSvg();renderInfo(sc);render();
  $('#graphWrap').scrollLeft=0;
  store.set('scenario',id);
}

// ruta y navegación
ST.lv=1;ST.done=new Set();
ST.lv=+store.get('level')||1;if(!LV_NAME[ST.lv])ST.lv=1;
try{ST.done=new Set(JSON.parse(store.get('done')||'[]'));}catch(e){ST.done=new Set();}
function save(){store.set('level',ST.lv);store.set('done',JSON.stringify([...ST.done]));}
const visible=()=>ROUTE.filter(id=>LEVEL[id]<=ST.lv);
function nextInRoute(id){const v=visible(),k=v.indexOf(id);return k>=0&&k<v.length-1?v[k+1]:null;}
function prevInRoute(id){const v=visible(),k=v.indexOf(id);return k>0?v[k-1]:null;}
/** Texto del botón principal cuando terminaste el escenario. */
function advanceLabel(){
  if(nextInRoute(ST.sc.id))return 'Siguiente escenario ›';
  return ST.lv<3?`Seguir con ruta ${RUTA[ST.lv+1]} ›`:'Ver comparativa ›';
}
/** Avanza al próximo escenario de la ruta; al final de un nivel, sube de nivel. */
function advance(){
  const n=nextInRoute(ST.sc.id);
  if(n)load(n);
  else if(ST.lv<3){setLevel(ST.lv+1);load(firstPending());}
  else load('compare');
  $('.route').scrollIntoView({behavior:'smooth',block:'start'});
}
/** Navegador de escenarios en la cabecera: ‹ 3 de 6 › */
function renderScNav(){
  const v=visible(),k=v.indexOf(ST.sc.id),p=prevInRoute(ST.sc.id),n=nextInRoute(ST.sc.id);
  $('#scPos').textContent=`Escenario ${k+1} de ${v.length}`;
  $('#scPrev').disabled=!p;$('#scNext').disabled=!n;
  $('#scPrev').title=p?SC.find(s=>s.id===p).title:'';$('#scNext').title=n?SC.find(s=>s.id===n).title:'';
}
const firstPending=()=>{const v=visible();return v.find(id=>!ST.done.has(id))||v[0];};
function markCurrent(){
  const id=ST.sc?ST.sc.id:null;
  document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.id===id?'true':'false'));
  if(id)$('#navSelect').value=id;
}
function renderNav(){
  let h='',o='',n=0;
  for(let lv=1;lv<=ST.lv;lv++){
    const ids=ROUTE.filter(id=>LEVEL[id]===lv),d=ids.filter(id=>ST.done.has(id)).length;
    h+=`<h3>${LV_NAME[lv]} <span>${d}/${ids.length}</span></h3>`;o+=`<optgroup label="${LV_NAME[lv]}">`;
    ids.forEach(id=>{n++;const s=SC.find(x=>x.id===id),ok=ST.done.has(id);
      h+=`<button type="button" data-id="${id}"><span class="num${ok?' done':''}" aria-label="${ok?'completado':'pendiente'}">${ok?'✓':n}</span>${esc(s.title)}</button>`;
      o+=`<option value="${id}">${n}. ${esc(s.title)}${ok?' ✓':''}</option>`;});
    o+='</optgroup>';
  }
  h+=`<h3>Resumen</h3><button type="button" data-id="compare"><span class="num sum">Σ</span>Comparativa general</button>`;
  o+=`<optgroup label="Resumen"><option value="compare">Comparativa general</option></optgroup>`;
  $('#nav').innerHTML=h;$('#navSelect').innerHTML=o;markCurrent();
}
function renderProgress(){
  const v=visible(),d=v.filter(id=>ST.done.has(id)).length;
  $('#progTxt').innerHTML=`Ruta ${RUTA[ST.lv]}: <b>${d} de ${v.length}</b> escenarios completados`;
  $('#progBar').style.width=(v.length?d/v.length*100:0)+'%';
  document.querySelectorAll('.lv button').forEach(b=>b.setAttribute('aria-checked',+b.dataset.lv===ST.lv?'true':'false'));
}
function setLevel(lv){
  ST.lv=lv;save();renderNav();renderProgress();
  if(!ST.sc)return;
  if(ST.sc.compare)renderCompare();
  else if(LEVEL[ST.sc.id]>lv)load(firstPending());
  else renderExplain();
}
document.querySelector('.lv').addEventListener('click',e=>{const b=e.target.closest('[data-lv]');if(b)setLevel(+b.dataset.lv);});
$('#progReset').onclick=()=>{ST.done=new Set();save();renderNav();renderProgress();load(visible()[0]);};
$('#nav').addEventListener('click',e=>{const b=e.target.closest('button');if(b)load(b.dataset.id);});
$('#navSelect').addEventListener('change',e=>load(e.target.value));
$('#next').addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.lvup){setLevel(ST.lv+1);load(firstPending());}else load(b.dataset.load);
  $('.route').scrollIntoView({behavior:'smooth',block:'start'});
});
renderNav();renderProgress();
$('#bNext').onclick=()=>{stop();if(ST.i<ST.sc.steps.length-1)go(ST.i+1);else advance();};
$('#scPrev').onclick=()=>{const p=prevInRoute(ST.sc.id);if(p)load(p);};
$('#scNext').onclick=()=>{const n=nextInRoute(ST.sc.id);if(n)load(n);};
$('#bPrev').onclick=()=>{stop();go(ST.i-1);};
$('#bReset').onclick=()=>{stop();ST.i=0;initSvg();render();};
$('#bPlay').onclick=play;
$('#dots').addEventListener('click',e=>{const b=e.target.closest('button');if(b){stop();go(+b.dataset.k);}});
$('#term').addEventListener('click',e=>{const l=e.target.closest('.tl');if(l&&!l.classList.contains('future')){stop();go(+l.dataset.k);}});
$('#compare').addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){load(b.dataset.go);window.scrollTo({top:0,behavior:'smooth'});}});
document.addEventListener('keydown',e=>{
  if(e.target.closest('select,input,textarea')||ST.sc?.compare)return;
  if(e.key==='ArrowRight'){stop();if(ST.i<ST.sc.steps.length-1)go(ST.i+1);else advance();e.preventDefault();}
  else if(e.key==='ArrowLeft'){stop();go(ST.i-1);e.preventDefault();}
  else if(e.key===' '&&!e.target.closest('button')){play();e.preventDefault();}
});
// tema
(function(){
  const t=store.get('theme');
  if(t)document.documentElement.dataset.theme=t;
  $('#themeBtn').onclick=()=>{
    const dark=document.documentElement.dataset.theme?document.documentElement.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
    const n=dark?'light':'dark';document.documentElement.dataset.theme=n;store.set('theme',n);
  };
})();
const start=store.get('scenario');
load(start&&(start==='compare'||LEVEL[start]<=ST.lv)?start:firstPending());
})();
