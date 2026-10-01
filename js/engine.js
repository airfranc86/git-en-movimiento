/**
 * Motor: un mini-Git en memoria.
 *
 * No toca disco ni red. Modela solo lo necesario para explicar el grafo:
 * commits (con padres), ramas locales, ramas remotas (origin/*), lo último
 * que el repo local "vio" del remoto (tracked, usado por --force-with-lease)
 * y un área de trabajo simplificada (working directory / staging).
 *
 * Cada operación muta el estado S. `build()` ejecuta un escenario completo
 * y devuelve una foto inmutable por paso, que es lo que dibuja la UI.
 *
 * Funciona como script clásico en el navegador (expone `GitSim`) y como
 * módulo CommonJS en Node para los tests.
 */
(function (root) {
'use strict';

const clone = o => JSON.parse(JSON.stringify(o));
const S0 = () => ({commits:{},branches:{},remotes:{},tracked:{},head:'main',lanes:{main:0},seq:0,n:0,mn:0,rn:0,sn:0,hl:[],out:null,area:{wd:[],idx:[]}});
const tip = (S,r) => (r in S.branches) ? S.branches[r] : (r in S.remotes) ? S.remotes[r] : r;
const headId = S => S.branches[S.head];
function anc(S,id){const set=new Set(),st=[id];while(st.length){const x=st.pop();if(!x||set.has(x)||!S.commits[x])continue;set.add(x);S.commits[x].parents.forEach(p=>st.push(p));}return set;}
const isAnc = (S,a,b) => anc(S,b).has(a);
function mk(S,o){S.seq++;const c={id:o.id,parents:o.parents,lane:o.lane,seq:S.seq,msg:o.msg,author:o.author||'vos',remoteOnly:!!o.remoteOnly,kind:o.kind||'normal'};S.commits[c.id]=c;S.hl.push(c.id);return c;}
function cid(S,id){let n=id+"'";while(S.commits[n])n+="'";return n;}
function between(S,from,base){const ex=anc(S,base);return [...anc(S,from)].filter(x=>!ex.has(x)).map(x=>S.commits[x]).filter(c=>c.parents.length<2).sort((a,b)=>a.seq-b.seq);}
const TO='To github.com:equipo/app.git\n';
const op={
  commit(S,msg,o={}){const id=o.id||('C'+(++S.n));const p=headId(S);mk(S,{id,parents:p?[p]:[],lane:o.lane??S.lanes[S.head],msg,kind:o.kind});S.branches[S.head]=id;S.out=`[${S.head} ${id}] ${msg}`;},
  branch(S,name,lane){S.branches[name]=headId(S);S.lanes[name]=lane;},
  sw(S,name){S.head=name;S.out=`Switched to branch '${name}'`;},
  swc(S,name,lane){op.branch(S,name,lane);S.head=name;S.out=`Switched to a new branch '${name}'`;},
  merge(S,ref,o={}){const t=tip(S,ref),c=headId(S);
    if(isAnc(S,t,c)){S.out='Already up to date.';return;}
    if(isAnc(S,c,t)&&!o.noff){S.branches[S.head]=t;S.out=`Updating ${c}..${t}\nFast-forward`;return;}
    const id='M'+(++S.mn);mk(S,{id,parents:[c,t],lane:S.lanes[S.head],msg:o.msg||`Merge ${ref}`,kind:'merge'});S.branches[S.head]=id;S.out="Merge made by the 'ort' strategy.";},
  rebase(S,onto){const base=tip(S,onto);let b=base;for(const c of between(S,headId(S),base)){const n=cid(S,c.id);mk(S,{id:n,parents:[b],lane:S.lanes[S.head],msg:c.msg,author:c.author});b=n;}S.branches[S.head]=b;S.out=`Successfully rebased and updated refs/heads/${S.head}.`;},
  cherry(S,id){const c=S.commits[id],n=cid(S,id);mk(S,{id:n,parents:[headId(S)],lane:S.lanes[S.head],msg:c.msg,author:c.author});S.branches[S.head]=n;S.out=`[${S.head} ${n}] ${c.msg}`;},
  reset(S,to){S.branches[S.head]=to;S.out=`HEAD is now at ${to} ${S.commits[to].msg}`;},
  revert(S,id){const n='R'+(++S.rn),msg=`Revert "${S.commits[id].msg}"`;mk(S,{id:n,parents:[headId(S)],lane:S.lanes[S.head],msg,kind:'revert'});S.branches[S.head]=n;S.out=`[${S.head} ${n}] ${msg}`;},
  push(S,br,mode){const k='origin/'+br,l=S.branches[br],r=S.remotes[k];
    if(r===undefined){S.remotes[k]=S.tracked[k]=l;S.out=TO+` * [new branch]      ${br} -> ${br}`;return true;}
    if(r===l){S.out='Everything up-to-date';return true;}
    if(isAnc(S,r,l)){S.remotes[k]=S.tracked[k]=l;S.out=TO+`   ${r}..${l}  ${br} -> ${br}`;return true;}
    if(mode==='force'||(mode==='lease'&&S.tracked[k]===r)){S.remotes[k]=S.tracked[k]=l;S.out=TO+` + ${r}...${l} ${br} -> ${br} (forced update)`;return true;}
    const why=mode==='lease'?'stale info':(S.tracked[k]===r?'non-fast-forward':'fetch first');
    S.out=TO+` ! [rejected]        ${br} -> ${br} (${why})\nerror: failed to push some refs`;return false;},
  rcommit(S,br,msg,author,lane){const k='origin/'+br,prev=S.remotes[k],id='C'+(++S.n);mk(S,{id,parents:[prev],lane,msg,author,remoteOnly:true});S.remotes[k]=id;S.out=TO+`   ${prev}..${id}  ${br} -> ${br}`;},
  fetch(S){const ch=Object.keys(S.remotes).filter(k=>S.tracked[k]!==S.remotes[k]);const lines=ch.map(k=>`   ${S.tracked[k]||'*'}..${S.remotes[k]}  ${k.replace('origin/','')} -> ${k}`);S.tracked={...S.remotes};Object.values(S.commits).forEach(c=>c.remoteOnly=false);S.out=lines.length?'From github.com:equipo/app\n'+lines.join('\n'):'';},
  del(S,n){delete S.branches[n];S.out=`Deleted branch ${n}.`;},
  delR(S,k){delete S.remotes[k];delete S.tracked[k];},
  ghMerge(S,br,msg){const m=S.remotes['origin/main'],t=S.remotes['origin/'+br],id='M'+(++S.mn);mk(S,{id,parents:[m,t],lane:0,msg,kind:'merge'});S.remotes['origin/main']=id;S.out=`Pull request #42 merged (${id})`;},
  ghSquash(S,br,msg){const m=S.remotes['origin/main'],id='S'+(++S.sn);mk(S,{id,parents:[m],lane:0,msg,kind:'squash'});S.remotes['origin/main']=id;S.out=`Pull request #42 squashed and merged (${id})`;},
  ghRebase(S,br){const m=S.remotes['origin/main'],t=S.remotes['origin/'+br];let b=m;for(const c of between(S,t,m)){const n=cid(S,c.id);mk(S,{id:n,parents:[b],lane:0,msg:c.msg,author:c.author});b=n;}S.remotes['origin/main']=b;S.out=`Pull request #42 rebased and merged (${b})`;},
  pull(S,br){op.fetch(S);const r=S.remotes['origin/'+br],l=S.branches[br];S.branches[br]=r;S.out=(S.out?S.out+'\n':'')+`Updating ${l}..${r}\nFast-forward`;},
};
function reachable(S){const roots=[...Object.values(S.branches),...Object.values(S.remotes)];const set=new Set();roots.forEach(r=>anc(S,r).forEach(x=>set.add(x)));return set;}

/** Ejecuta un escenario y devuelve una foto (snapshot) por paso. */
function build(sc){
  const S=S0();sc.setup(S);S.hl=[];S.out=null;
  const snaps=[];
  sc.steps.forEach(st=>{
    S.hl=[];S.out=null;
    if(st.op)st.op(S);
    if(st.area)S.area=clone(st.area);
    snaps.push(clone(S));
  });
  return snaps;
}

const api={clone,S0,tip,headId,anc,isAnc,between,op,reachable,build};
root.GitSim=Object.assign(root.GitSim||{},api);
if(typeof module!=='undefined'&&module.exports)module.exports=root.GitSim;
})(typeof globalThis!=='undefined'?globalThis:this);
