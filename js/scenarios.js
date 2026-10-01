/**
 * Escenarios: datos puros. Cada uno define un estado inicial (setup),
 * una secuencia de pasos (comando + operación + explicación) y su ficha
 * de pros, contras y cuándo usarlo.
 *
 * ROUTE define el orden de la ruta guiada y LEVEL el nivel de cada
 * escenario. Los niveles son acumulativos: intermedio incluye básico.
 */
(function (root) {
'use strict';
const G=root.GitSim||require('./engine.js');
const {op}=G;

/* setups reutilizables */
function setDiv(S,m={}){op.commit(S,m.c1||'Init proyecto');op.commit(S,m.c2||'Config CI');op.swc(S,'feature',1);op.commit(S,m.c3||'Modelo Pago');op.commit(S,m.c4||'Endpoint /pagos');op.sw(S,'main');op.commit(S,m.c5||'Fix login');}
function setShared(S){op.commit(S,'Init proyecto');op.commit(S,'Config CI');op.push(S,'main');op.swc(S,'feature',1);op.commit(S,'Modelo Pago');op.commit(S,'Endpoint /pagos');op.push(S,'feature');op.sw(S,'main');op.commit(S,'Fix login');op.push(S,'main');}
function setPull(S){op.commit(S,'Init proyecto');op.commit(S,'Config CI');op.push(S,'main');op.rcommit(S,'main','Fix de Ana','Ana',0);op.commit(S,'Tu cambio',{lane:1});}
function setForce(S){setShared(S);op.sw(S,'feature');}

const DIV0 = `|main| avanzó con C5 mientras trabajabas en |feature| (C3, C4). Las ramas divergieron desde C2, su ancestro común (el |merge-base|).`;

/* ============================================================
   ESCENARIOS
   ============================================================ */
const SC = [
{ id:'basics', group:'Fundamentos', title:'Commit, staging y ramas', risk:'none', rewrites:'No', force:'No', showArea:true,
  lanes:['main','feature'],
  what:`Los tres lugares donde vive un cambio (working directory, staging, repositorio) y cómo las ramas son solo punteros que se mueven.`,
  setup:S=>{op.commit(S,'Init proyecto');S.area={wd:['login.py'],idx:[]};},
  steps:[
    {d:`Tenés un repo con un commit (C1) y modificaste |login.py|. El cambio existe solo en tu working directory: Git lo detecta, pero no lo guarda hasta que lo prepares.`},
    {cmd:'git add login.py', area:{wd:[],idx:['login.py']}, out:'', d:`Mueve el cambio al staging (el índice). El staging es el borrador del próximo commit: elegís exactamente qué entra y qué no.`},
    {cmd:'git commit -m "Agrega login"', op:S=>op.commit(S,'Agrega login'), area:{wd:[],idx:[]}, d:`Crea C2: una foto inmutable del staging que apunta a su padre C1. La rama |main| avanza a C2, y |HEAD| (que apunta a main) con ella.`},
    {cmd:'git switch -c feature', op:S=>op.swc(S,'feature',1), d:`Crea |feature| apuntando al mismo commit y mueve |HEAD| ahí. Una rama es un archivo de 41 bytes con un SHA adentro: crearla es instantáneo y no copia nada.`},
    {cmd:'git commit -m "Modelo Pago"', op:S=>op.commit(S,'Modelo Pago'), d:`El commit avanza solo la rama donde está |HEAD|. |main| se queda quieta en C2.`},
    {cmd:'git commit -m "Endpoint /pagos"', op:S=>op.commit(S,'Endpoint /pagos'), d:`Otro commit en |feature|. Cada commit conoce a su padre, nunca a sus hijos: por eso la historia se lee hacia atrás.`},
    {cmd:'git switch main', op:S=>op.sw(S,'main'), d:`|HEAD| vuelve a |main| y tu working directory se reescribe con el contenido de C2. Los commits de feature siguen ahí, solo que no los estás mirando.`},
    {cmd:'git commit -m "Fix login"', op:S=>op.commit(S,'Fix login'), d:`Ahora |main| y |feature| divergieron: cada una tiene commits que la otra no tiene. Este es el punto de partida de todos los escenarios de integración: merge, rebase y squash.`,
     alert:{t:'info',h:'Ojo con --amend',m:`|git commit --amend| no edita el último commit: crea uno nuevo con otro SHA y deja el viejo huérfano. Si ya lo habías pusheado, vas a necesitar force push.`}},
  ],
  info:{pros:[`Commits chicos y atómicos: fáciles de revisar, revertir y bisectar.`,`Ramas baratas: una por tarea, sin miedo.`,`El staging permite commitear solo parte de lo que cambiaste (|git add -p|).`],
        cons:[`Commits gigantes o mezclados hacen inútiles a revert, cherry-pick y bisect.`,`|--amend| reescribe: usalo solo sobre commits que todavía no pusheaste.`],
        when:`Siempre. Todo lo demás (merge, rebase, reset, cherry-pick) es crear commits nuevos o mover estos punteros.`}
},
{ id:'ff', group:'Integrar ramas', title:'Merge fast-forward', risk:'bajo', rewrites:'No', force:'No',
  lanes:['main','feature'],
  what:`Cuando la rama destino no avanzó, Git no necesita combinar nada: simplemente adelanta el puntero.`,
  setup:S=>{op.commit(S,'Init proyecto');op.commit(S,'Config CI');op.swc(S,'feature',1);op.commit(S,'Modelo Pago');op.commit(S,'Endpoint /pagos');op.sw(S,'main');},
  steps:[
    {d:`|main| no avanzó desde que se creó |feature|: C2 es ancestro directo de C4. No hay divergencia.`},
    {cmd:'git merge feature', op:S=>op.merge(S,'feature'), d:`Git desliza el puntero |main| de C2 a C4. Cero commits nuevos, cero conflictos posibles, los SHAs que revisaste son los que quedan.`},
    {cmd:'git branch -d feature', op:S=>op.del(S,'feature'), d:`La rama ya está integrada y se borra sin perder nada. Fijate que en la historia no queda rastro de que alguna vez existió una rama.`},
  ],
  info:{pros:[`Historia perfectamente lineal, sin commits extra.`,`No reescribe nada: mismos SHAs.`,`Imposible tener conflictos.`],
        cons:[`Solo funciona si la rama destino no avanzó: en equipos activos casi nunca pasa sin un rebase previo.`,`Se pierde el agrupamiento: no se ve qué commits formaban la feature.`],
        when:`Ramas cortas de una sola persona. En CI podés exigirlo con |git merge --ff-only| para garantizar historia lineal.`}
},
{ id:'merge', group:'Integrar ramas', title:'Merge a main sin rebase', risk:'bajo', rewrites:'No', force:'No',
  lanes:['main','feature'],
  what:`Merge de tres vías: combina las dos puntas usando el ancestro común y registra la unión en un commit con dos padres.`,
  setup:S=>{setDiv(S);op.push(S,'main');},
  steps:[
    {d:DIV0},
    {cmd:'git merge feature', op:S=>op.merge(S,'feature',{msg:"Merge branch 'feature'"}), d:`Git compara C2 (base), C5 y C4, y crea M1: un commit con dos padres. Si hay conflictos se resuelven una sola vez, acá. C3 y C4 quedan intactos, con los mismos SHAs.`},
    {cmd:'git push origin main', op:S=>op.push(S,'main'), d:`Push normal, sin force: solo agregaste commits encima de lo que ya había en el remoto.`},
  ],
  info:{pros:[`No reescribe historia: seguro en ramas compartidas y ya pusheadas.`,`Conserva el contexto real: cuándo y cómo se integró cada feature.`,`Conflictos se resuelven una sola vez.`,`Se revierte la feature entera con |git revert -m 1 M1|.`],
        cons:[`Historia no lineal, con «vías de tren» difíciles de leer cuando hay muchas ramas.`,`Mergear main dentro de feature seguido llena el log de merges sin valor.`,`|git bisect| y |git log| son menos directos.`],
        when:`Ramas compartidas por varias personas, ramas de release, y equipos que valoran trazabilidad exacta por encima de la estética del log.`}
},
{ id:'rebase', group:'Integrar ramas', title:'Merge a main con rebase', risk:'medio', rewrites:'Sí (la rama)', force:'Si la rama ya estaba pusheada',
  lanes:['main','feature'],
  what:`Primero se re-aplican los commits de la rama encima de main y después el merge es un simple fast-forward: historia lineal.`,
  setup:S=>setDiv(S),
  steps:[
    {d:DIV0},
    {cmd:'git switch feature', op:S=>op.sw(S,'feature'), d:`El rebase se hace desde la rama que querés mover.`},
    {cmd:'git rebase main', op:S=>op.rebase(S,'main'), d:`Toma los commits exclusivos de |feature| (C3, C4), los guarda como parches y los re-aplica uno por uno encima de C5. C3' y C4' son commits NUEVOS: otro SHA, otro padre. Los originales quedan huérfanos.`,
     alert:{t:'warn',h:'Se reescribió historia',m:`Si |feature| ya estaba en GitHub, ahora tu rama y |origin/feature| divergieron y vas a necesitar force push. Mirá el escenario de |--force-with-lease|.`}},
    {cmd:'git switch main', op:S=>op.sw(S,'main'), d:`Volvés a main, que sigue en C5.`},
    {cmd:'git merge feature', op:S=>op.merge(S,'feature'), d:`Como |feature| ahora está «adelante» de main, el merge es fast-forward. Resultado: C1, C2, C5, C3', C4' en una sola línea, sin merge commit.`},
  ],
  info:{pros:[`Historia lineal: |git log| y |git bisect| triviales.`,`Los conflictos aparecen y se resuelven en tu rama, no en main.`,`Sin commits de merge.`],
        cons:[`Reescribe SHAs: si la rama era pública, rompe los clones de los demás y exige force push.`,`Conflictos commit por commit; con ramas largas puede ser tedioso.`,`Los commits re-aplicados nunca se testearon en ese orden, y se pierde cuándo se integró la feature.`],
        when:`Ramas personales antes de abrir o actualizar un PR. Regla de oro: nunca rebasees commits que otra persona ya bajó.`}
},
{ id:'rebase-noff', group:'Integrar ramas', title:'Rebase + merge --no-ff', risk:'medio', rewrites:'Sí (la rama)', force:'Si la rama ya estaba pusheada',
  lanes:['main','feature'],
  what:`Historia semi-lineal: commits en línea recta, pero cada feature queda agrupada en una «burbuja» con su merge commit.`,
  setup:S=>setDiv(S),
  steps:[
    {d:DIV0},
    {cmd:'git switch feature', op:S=>op.sw(S,'feature'), d:`Vas a la rama que querés poner al día.`},
    {cmd:'git rebase main', op:S=>op.rebase(S,'main'), d:`Igual que antes: C3' y C4' re-aplicados sobre C5.`},
    {cmd:'git switch main', op:S=>op.sw(S,'main'), d:`Volvés a main.`},
    {cmd:'git merge --no-ff feature', op:S=>op.merge(S,'feature',{noff:true,msg:"Merge branch 'feature'"}), d:`Aunque se podía hacer fast-forward, |--no-ff| fuerza un merge commit M1. Queda una burbuja: lineal por dentro, pero se ve exactamente qué commits formaron la feature.`},
  ],
  info:{pros:[`Lo mejor de los dos mundos: commits lineales y agrupamiento por feature.`,`|git log --first-parent| muestra solo las integraciones a main.`,`Se revierte la feature entera con un solo |revert -m 1|.`],
        cons:[`Requiere rebase previo (y force push si la rama era pública).`,`Un merge commit extra por feature.`,`Exige disciplina de equipo para sostenerlo.`],
        when:`Cuando querés historia lineal pero auditable. GitLab lo ofrece nativo como «semi-linear history».`}
},
{ id:'squash', group:'Integrar ramas', title:'Squash merge', risk:'medio', rewrites:'En la práctica sí', force:'No', showArea:true,
  lanes:['main','feature'],
  what:`Comprime todos los cambios de la rama en un único commit nuevo sobre main, sin registrar la relación con la rama.`,
  setup:S=>setDiv(S),
  steps:[
    {d:DIV0},
    {cmd:'git merge --squash feature', area:{wd:[],idx:['models/pago.py','api/pagos.py']}, out:'Squash commit -- not updating HEAD\nAutomatic merge went well; stopped before committing as requested', d:`Calcula el resultado combinado de C3 + C4 y lo deja en staging. No crea commit y no anota de qué rama vino.`},
    {cmd:'git commit -m "Feature pagos (#42)"', op:S=>op.commit(S,'Feature pagos (#42)',{id:'S1',kind:'squash'}), area:{wd:[],idx:[]}, d:`S1 contiene todos los cambios de la feature con un único padre (C5). Para Git, |feature| NO fue mergeada: C3 y C4 no son ancestros de main.`},
    {cmd:'git branch -d feature', out:"error: The branch 'feature' is not fully merged.", d:`Por eso |-d| falla: Git no ve a C4 dentro de main.`,
     alert:{t:'warn',h:'Rama «no mergeada»',m:`Si seguís commiteando en |feature| y volvés a squashear, vas a arrastrar C3 y C4 otra vez y ver conflictos ya resueltos. Después de un squash, la rama se descarta.`}},
    {cmd:'git branch -D feature', op:S=>op.del(S,'feature'), d:`|-D| fuerza el borrado. C3 y C4 quedan huérfanos: su contenido vive solo dentro de S1.`},
  ],
  info:{pros:[`main queda con un commit por feature: se lee como un changelog.`,`Esconde commits de «wip» y «fix typo».`,`Revertir la feature es revertir un solo commit.`],
        cons:[`Se pierde granularidad: |git blame| apunta a un commit gigante.`,`Git no sabe que la rama se integró (|branch -d| falla, conflictos al reutilizarla).`,`Los commits originales nunca llegan a main.`],
        when:`PRs con commits desordenados, o equipos con la convención «1 PR = 1 commit en main».`}
},
{ id:'pull-merge', group:'Remoto', title:'git pull (fetch + merge)', risk:'bajo', rewrites:'No', force:'No',
  lanes:['origin','local'],
  what:`Sincronizar tu rama con el remoto cuando alguien más pusheó: pull por defecto trae y mergea.`,
  setup:S=>setPull(S),
  steps:[
    {d:`Ana pusheó C3 a GitHub. Vos, sin saberlo, hiciste C4 en tu |main| local. Tu main y |origin/main| divergieron.`},
    {cmd:'git push', op:S=>op.push(S,'main'), d:`GitHub rechaza el push: el remoto tiene trabajo que vos no tenés y aceptarlo borraría C3.`,
     alert:{t:'warn',h:'Rechazado',m:`Esto es Git protegiéndote. La tentación acá es usar |--force|: no lo hagas, borrarías el commit de Ana.`}},
    {cmd:'git pull', op:S=>{op.fetch(S);op.merge(S,'origin/main',{msg:"Merge branch 'main' of github.com:equipo/app"});}, out:"From github.com:equipo/app\n   C2..C3  main -> origin/main\nMerge made by the 'ort' strategy.", d:`|pull| = |fetch| + |merge|. Trae C3 y crea M1, un merge commit que no representa ninguna feature: solo que dos personas trabajaron en paralelo.`},
    {cmd:'git push', op:S=>op.push(S,'main'), d:`Ahora sí: M1 desciende de C3, así que el push es un avance normal.`},
  ],
  info:{pros:[`Nunca reescribe nada ni necesita force.`,`Comportamiento predecible y por defecto.`],
        cons:[`Llena main de commits «Merge branch 'main' of…» sin valor.`,`Historia enredada aunque todos trabajen en la misma rama.`],
        when:`Si tu equipo prefiere cero reescritura. Se fija con |git config pull.rebase false|.`}
},
{ id:'pull-rebase', group:'Remoto', title:'git pull --rebase', risk:'bajo', rewrites:'Solo commits locales', force:'No',
  lanes:['origin','local'],
  what:`Igual que pull, pero en vez de mergear re-aplica tus commits locales encima de lo que trajo del remoto.`,
  setup:S=>setPull(S),
  steps:[
    {d:`Mismo punto de partida: Ana pusheó C3, vos tenés C4 local sin pushear.`},
    {cmd:'git push', op:S=>op.push(S,'main'), d:`Rechazado, igual que antes.`, alert:{t:'warn',h:'Rechazado',m:`El remoto tiene C3 y tu rama no lo contiene.`}},
    {cmd:'git pull --rebase', op:S=>{op.fetch(S);const f=S.out;op.rebase(S,'origin/main');S.out=f+'\n'+S.out;}, d:`|fetch| + |rebase|: tu C4 se re-aplica encima de C3 como C4'. Historia lineal y sin merge commit. Como C4 nunca salió de tu máquina, reescribirlo es 100% seguro.`},
    {cmd:'git push', op:S=>op.push(S,'main'), d:`Push normal. Nadie más se entera de que hubo un rebase.`},
  ],
  info:{pros:[`Historia lineal sin merges triviales.`,`Seguro: solo reescribe commits locales que nadie más tiene.`],
        cons:[`Conflictos se resuelven commit por commit.`,`Si tus commits locales incluían merges, hace falta |--rebase=merges| para conservarlos.`],
        when:`Casi siempre para sincronizar una rama con su remoto. Configuración recomendada: |git config --global pull.rebase true|.`}
},
{ id:'force', group:'Remoto', title:'Force push', risk:'alto', rewrites:'Sí (en GitHub)', force:'Es el force',
  lanes:['main','feature','Ana'],
  what:`Sobrescribe la rama remota con la tuya, sin importar qué haya ahí. Necesario después de reescribir historia, peligroso en ramas compartidas.`,
  setup:S=>setForce(S),
  steps:[
    {d:`|feature| (C3, C4) está pusheada y Ana también trabaja en ella. |main| avanzó con C5.`},
    {who:'ana', cmd:'git push origin feature', op:S=>op.rcommit(S,'feature','Validación montos','Ana',2), d:`Ana pushea C6 encima de tu C4. Tu repo local todavía no lo sabe: por eso C6 aparece punteado.`},
    {cmd:'git rebase main', op:S=>op.rebase(S,'main'), d:`Rebaseás |feature| sobre main para ponerla al día. Localmente está bien, pero ahora tu feature (C4') y |origin/feature| (C6) divergieron.`},
    {cmd:'git push', op:S=>op.push(S,'feature'), d:`Git frena el push: el remoto tiene commits que vos no tenés.`, alert:{t:'warn',h:'Rechazado',m:`Este rechazo es la última barrera antes de perder trabajo.`}},
    {cmd:'git push --force', op:S=>op.push(S,'feature','force'), d:`|--force| no pregunta: pone |origin/feature| en C4' y listo.`,
     alert:{t:'danger',h:'Se perdió el commit de Ana',m:`C6 ya no está en ninguna rama de GitHub. Nadie recibió un aviso: Ana lo va a descubrir en su próximo pull, cuando su rama diverja de la tuya. Solo se recupera desde la máquina de Ana.`}},
  ],
  info:{pros:[`Imprescindible después de rebase, amend o reset sobre una rama ya pusheada.`,`Útil para limpiar tu rama personal antes del merge.`],
        cons:[`Sobrescribe a ciegas: borra commits ajenos sin aviso.`,`Los clones de los demás quedan divergentes y hay que reconciliarlos a mano.`,`Sobre main o ramas compartidas puede destruir trabajo de todo el equipo.`],
        when:`Solo en ramas que son 100% tuyas, y aun así preferí |--force-with-lease|. Protegé main en GitHub con branch protection para bloquearlo.`}
},
{ id:'lease', group:'Remoto', title:'--force-with-lease', risk:'medio', rewrites:'Sí (en GitHub)', force:'Sí, con verificación',
  lanes:['main','feature','Ana'],
  what:`Un force push condicional: solo sobrescribe si el remoto sigue estando donde vos lo viste por última vez.`,
  setup:S=>setForce(S),
  steps:[
    {d:`Mismo escenario: feature compartida, main avanzó.`},
    {who:'ana', cmd:'git push origin feature', op:S=>op.rcommit(S,'feature','Validación montos','Ana',2), d:`Ana pushea C6 sin que te enteres.`},
    {cmd:'git rebase main', op:S=>op.rebase(S,'main'), d:`Rebaseás feature sobre main: C3' y C4'.`},
    {cmd:'git push --force-with-lease', op:S=>op.push(S,'feature','lease'), d:`El lease compara: «¿|origin/feature| en GitHub sigue en C4, como la última vez que lo vi?». No: Ana lo movió a C6. Se rechaza y no se pierde nada.`,
     alert:{t:'ok',h:'Protección activada',m:`Mismo comando que te hubiera hecho perder el commit de Ana con |--force|, pero acá frena.`}},
    {cmd:'git fetch', op:S=>op.fetch(S), d:`Bajás lo nuevo: ahora tu repo conoce C6.`,
     alert:{t:'warn',h:'Trampa clásica',m:`El fetch actualizó la referencia que usa el lease. Si ahora hicieras |--force-with-lease| sin integrar C6, pasaría y lo borraría igual. Para cubrir eso existe |--force-if-includes|.`}},
    {cmd:'git cherry-pick C6', op:S=>op.cherry(S,'C6'), d:`Incorporás el trabajo de Ana encima de tu rama rebaseada: C6'.`},
    {cmd:'git push --force-with-lease', op:S=>op.push(S,'feature','lease'), d:`Ahora el remoto está en C6, que es lo que viste: el lease coincide y el push forzado pasa. El trabajo de Ana sobrevive como C6'.`,
     alert:{t:'ok',h:'Nada se perdió',m:`C6 queda huérfano, pero su contenido está a salvo en C6'.`}},
  ],
  info:{pros:[`Mismo poder que |--force| pero con verificación (compare-and-swap).`,`Evita pisar commits que nunca viste.`],
        cons:[`Un |git fetch| (o un IDE que hace fetch automático) actualiza la referencia y desactiva la protección: combinalo con |--force-if-includes|.`,`Sigue reescribiendo historia para quienes ya bajaron la rama.`],
        when:`Siempre que necesites forzar. Alias recomendado: |git config --global alias.pushf "push --force-with-lease --force-if-includes"|.`}
},
{ id:'cherry', group:'Selectivo', title:'Cherry-pick', risk:'bajo', rewrites:'No (copia)', force:'No',
  lanes:['main','feature'],
  what:`Copia un commit puntual de otra rama como un commit nuevo sobre la rama actual.`,
  setup:S=>setDiv(S,{c3:'Hotfix XSS',c4:'Pagos (WIP)'}),
  steps:[
    {d:`En |feature| hay un fix urgente (C3) mezclado con trabajo sin terminar (C4). Necesitás solo el fix en main, ya.`},
    {cmd:'git cherry-pick C3', op:S=>op.cherry(S,'C3'), d:`Aplica el diff de C3 como un commit nuevo C3' sobre main. Mismo cambio, distinto SHA, distinto padre. |feature| no se toca.`},
    {cmd:'git merge feature   # semanas después', op:S=>op.merge(S,'feature',{msg:"Merge branch 'feature'"}), d:`Cuando feature se termina y se mergea, la historia tiene el mismo cambio dos veces: C3 y C3'. Git suele resolverlo sin conflicto, pero ensucia el log y confunde |git blame|.`},
  ],
  info:{pros:[`Quirúrgico: traés exactamente un commit.`,`Ideal para backports a ramas de release (|-x| anota el SHA original en el mensaje).`],
        cons:[`Duplica commits: mismo cambio con SHAs distintos.`,`Si el commit depende de otros anteriores, falla o introduce bugs.`,`Usarlo seguido es síntoma de una mala estrategia de ramas.`],
        when:`Hotfixes y backports. Usá siempre |git cherry-pick -x| para trazabilidad.`}
},
{ id:'reset', group:'Deshacer', title:'Reset --soft, --mixed y --hard', risk:'alto', rewrites:'Sí', force:'Si ya estaba pusheado', showArea:true,
  lanes:['main'],
  what:`Mueve la rama actual a otro commit. El modo decide qué pasa con el staging y el working directory.`,
  setup:S=>{op.commit(S,'Init proyecto');op.commit(S,'Login');op.commit(S,'Modelo Pago');op.commit(S,'Endpoint /pagos');},
  steps:[
    {d:`|main| en C4. Working directory y staging limpios.`},
    {cmd:'git reset --soft HEAD~1', op:S=>op.reset(S,'C3'), area:{wd:[],idx:['api/pagos.py']}, d:`|--soft| mueve solo el puntero. Los cambios de C4 quedan en staging, listos para recommitear. Sirve para rehacer el mensaje o juntar varios commits en uno.`},
    {cmd:'git reset --hard ORIG_HEAD', op:S=>op.reset(S,'C4'), area:{wd:[],idx:[]}, d:`Volvemos a C4 para probar el siguiente modo. |ORIG_HEAD| guarda dónde estabas antes del último reset.`},
    {cmd:'git reset HEAD~1', op:S=>op.reset(S,'C3'), area:{wd:['api/pagos.py'],idx:[]}, out:'Unstaged changes after reset:\nM\tapi/pagos.py', d:`|--mixed| (el modo por defecto) mueve el puntero y vacía el staging: los cambios quedan en el working directory como modificados sin preparar.`},
    {cmd:'git reset --hard ORIG_HEAD', op:S=>op.reset(S,'C4'), area:{wd:[],idx:[]}, d:`De nuevo a C4.`},
    {cmd:'git reset --hard HEAD~1', op:S=>op.reset(S,'C3'), area:{wd:[],idx:[]}, d:`|--hard| mueve el puntero, vacía el staging y pisa el working directory. C4 queda huérfano.`,
     alert:{t:'danger',h:'Sin confirmación',m:`Cualquier cambio NO commiteado que tuvieras se pierde para siempre. Lo commiteado (C4) se puede recuperar un tiempo con |git reflog|.`}},
    {cmd:'git reflog\ngit reset --hard HEAD@{1}', op:S=>op.reset(S,'C4'), out:"C3 HEAD@{0}: reset: moving to HEAD~1\nC4 HEAD@{1}: reset: moving to ORIG_HEAD\nHEAD is now at C4 Endpoint /pagos", d:`El salvavidas: |reflog| registra cada movimiento de HEAD durante ~90 días. Con |HEAD@{1}| volvés a donde estabas.`},
  ],
  info:{pros:[`Reescritura local rápida: deshacer commits, rearmar historia, juntar commits con |--soft|.`,`|--soft| y |--mixed| no pierden ningún cambio.`],
        cons:[`|--hard| destruye cambios no commiteados sin pedir confirmación.`,`Sobre commits ya pusheados reescribe historia pública y exige force.`,`Es fácil confundir los tres modos.`],
        when:`Solo sobre commits locales que no pusheaste. Para deshacer algo que ya es público, usá revert.`}
},
{ id:'revert', group:'Deshacer', title:'Revert', risk:'bajo', rewrites:'No', force:'No',
  lanes:['main'],
  what:`Deshace un commit creando otro commit con el cambio inverso. No borra nada.`,
  setup:S=>{op.commit(S,'Init proyecto');op.commit(S,'Login');op.commit(S,'Cambio tarifas');op.commit(S,'Reportes');op.push(S,'main');},
  steps:[
    {d:`C3 introdujo un bug y ya está en GitHub. Otras personas ya bajaron main.`},
    {cmd:'git revert C3', op:S=>op.revert(S,'C3'), d:`Crea R1, que aplica el diff inverso de C3. La historia muestra el error y su corrección: nadie tiene que reconciliar nada.`},
    {cmd:'git push', op:S=>op.push(S,'main'), d:`Push normal: solo se agregó un commit encima.`, alert:{t:'ok',h:'Seguro en ramas públicas',m:`Esta es la forma correcta de deshacer algo que ya está en main.`}},
  ],
  info:{pros:[`No reescribe historia ni necesita force.`,`Auditable: queda registrado qué se deshizo y cuándo.`],
        cons:[`Agrega commits de ruido.`,`Revertir un merge requiere |-m 1|, y para volver a mergear esa rama después hay que revertir el revert.`,`Puede dar conflictos si commits posteriores tocaron lo mismo.`],
        when:`Deshacer cualquier cosa que ya esté en main o en una rama compartida.`}
},
{ id:'pr-merge', group:'Pull Requests en GitHub', title:'PR: Create a merge commit', risk:'bajo', rewrites:'No', force:'No',
  lanes:['main','feature'],
  what:`El botón por defecto de un PR. Equivale a |git merge --no-ff| ejecutado en GitHub.`,
  setup:S=>setShared(S),
  steps:[
    {d:`PR #42 abierto: |feature| (C3, C4) hacia |main|. Mientras tanto main avanzó con C5.`},
    {who:'gh', cmd:'Merge pull request #42', op:S=>op.ghMerge(S,'feature',"Merge pull request #42 from equipo/feature"), d:`GitHub crea M1 directamente en el remoto. Siempre crea merge commit, incluso cuando se podía hacer fast-forward. Tu main local todavía no se enteró.`},
    {cmd:'git pull', op:S=>op.pull(S,'main'), d:`Bajás el resultado: tu main hace fast-forward a M1.`},
    {cmd:'git branch -d feature\ngit push origin --delete feature', op:S=>{op.del(S,'feature');op.delR(S,'origin/feature');}, d:`|-d| funciona porque C4 es ancestro de main. C3 y C4 siguen en la historia como padres de M1.`},
  ],
  info:{pros:[`Trazabilidad completa: el merge commit referencia el PR.`,`Los SHAs revisados en el PR son exactamente los que quedan en main.`,`Sin reescritura.`],
        cons:[`Historia no lineal.`,`Los commits «wip» de la rama llegan a main tal cual.`],
        when:`Default razonable para equipos grandes y ramas de varias personas.`}
},
{ id:'pr-squash', group:'Pull Requests en GitHub', title:'PR: Squash and merge', risk:'medio', rewrites:'En la práctica sí', force:'No',
  lanes:['main','feature'],
  what:`GitHub combina todos los commits del PR en uno solo sobre main, con el título del PR como mensaje.`,
  setup:S=>setShared(S),
  steps:[
    {d:`PR #42 abierto: |feature| (C3, C4) hacia |main|, que avanzó con C5.`},
    {who:'gh', cmd:'Squash and merge #42', op:S=>op.ghSquash(S,'feature','Feature pagos (#42)'), d:`S1 contiene los cambios de C3 + C4 con un único padre (C5). El mensaje es el título del PR y el autor es quien abrió el PR.`},
    {cmd:'git pull', op:S=>op.pull(S,'main'), d:`Tu main local avanza a S1.`},
    {cmd:'git branch -d feature', out:"error: The branch 'feature' is not fully merged.", d:`Tu |feature| local sigue en C4, que no es ancestro de main.`,
     alert:{t:'warn',h:'Git cree que no se mergeó',m:`Activá «Automatically delete head branches» en el repo y borrá la rama local con |-D|. Nunca sigas trabajando sobre una rama ya squasheada.`}},
    {cmd:'git branch -D feature\ngit push origin --delete feature', op:S=>{op.del(S,'feature');op.delR(S,'origin/feature');}, d:`C3 y C4 quedan huérfanos. En main solo existe S1.`},
  ],
  info:{pros:[`main se lee como changelog: un commit por PR.`,`No importa cuán desprolija fue la rama.`,`Revertir un PR es revertir un commit.`],
        cons:[`Se pierde la granularidad de los commits.`,`La rama queda «no mergeada» para Git.`,`Ramas que salen de otra rama squasheada generan conflictos raros.`],
        when:`Equipos que priorizan un main limpio y PRs chicos. Es el modo más usado en repos open source.`}
},
{ id:'pr-rebase', group:'Pull Requests en GitHub', title:'PR: Rebase and merge', risk:'medio', rewrites:'Sí', force:'No',
  lanes:['main','feature'],
  what:`GitHub re-aplica cada commit del PR sobre main, sin merge commit.`,
  setup:S=>setShared(S),
  steps:[
    {d:`PR #42 abierto: |feature| (C3, C4) hacia |main|, que avanzó con C5.`},
    {who:'gh', cmd:'Rebase and merge #42', op:S=>op.ghRebase(S,'feature'), d:`C3' y C4' se crean sobre C5 y main avanza. Ojo: GitHub siempre reescribe (pone un committer nuevo), incluso si podía hacer fast-forward. Los SHAs en main no son los que revisaste en el PR.`},
    {cmd:'git pull', op:S=>op.pull(S,'main'), d:`Tu main avanza a C4'.`},
    {cmd:'git branch -D feature\ngit push origin --delete feature', op:S=>{op.del(S,'feature');op.delR(S,'origin/feature');}, d:`Hace falta |-D|: los SHAs originales C3 y C4 no están en main.`},
  ],
  info:{pros:[`Historia lineal y conservando cada commit individual.`,`Sin merge commits.`],
        cons:[`Cambia los SHAs: las firmas GPG originales no se conservan y las referencias a SHAs del PR quedan colgadas.`,`Commits intermedios pueden no compilar: nunca se testearon en ese orden.`,`Si hay conflictos, el botón no está disponible y hay que rebasear localmente.`],
        when:`Equipos que cuidan cada commit (atómicos y bien escritos) y quieren historia lineal.`}
},
{ id:'compare', group:'Resumen', title:'Comparativa general', compare:true, risk:'none' },
];

/* Ruta de aprendizaje: orden y nivel de cada escenario (niveles acumulativos) */
const ROUTE=['basics','ff','merge','pull-merge','revert','pr-merge','rebase','pull-rebase','squash','pr-squash','pr-rebase','cherry','rebase-noff','reset','force','lease'];
const LEVEL={basics:1,ff:1,merge:1,'pull-merge':1,revert:1,'pr-merge':1,rebase:2,'pull-rebase':2,squash:2,'pr-squash':2,'pr-rebase':2,cherry:2,'rebase-noff':3,reset:3,force:3,lease:3};
const LV_NAME={1:'Básico',2:'Intermedio',3:'Avanzado'};
const RUTA={1:'básica',2:'intermedia',3:'avanzada'};

Object.assign(G,{SC,ROUTE,LEVEL,LV_NAME,RUTA});
if(typeof module!=='undefined'&&module.exports)module.exports=G;
})(typeof globalThis!=='undefined'?globalThis:this);
