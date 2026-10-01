'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/scenarios.js');
const { SC, ROUTE, LEVEL, LV_NAME, build } = G;

const playable = SC.filter(s => !s.compare);

test('la ruta incluye cada escenario una sola vez', () => {
  assert.deepEqual([...ROUTE].sort(), playable.map(s => s.id).sort());
  assert.equal(new Set(ROUTE).size, ROUTE.length);
});

test('cada escenario tiene un nivel válido', () => {
  for (const id of ROUTE) assert.ok(LV_NAME[LEVEL[id]], `nivel faltante en ${id}`);
});

test('la ruta está ordenada por nivel (acumulativo)', () => {
  const lv = ROUTE.map(id => LEVEL[id]);
  assert.deepEqual(lv, [...lv].sort((a, b) => a - b));
});

for (const sc of playable) {
  test(`escenario "${sc.id}" se ejecuta completo y es coherente`, () => {
    const snaps = build(sc);
    assert.equal(snaps.length, sc.steps.length);
    for (const s of snaps) {
      // toda rama apunta a un commit existente
      for (const at of [...Object.values(s.branches), ...Object.values(s.remotes)])
        assert.ok(s.commits[at], `${sc.id}: ref a commit inexistente ${at}`);
      // HEAD apunta a una rama existente
      assert.ok(s.branches[s.head], `${sc.id}: HEAD apunta a una rama borrada`);
      // todo padre existe
      for (const c of Object.values(s.commits))
        for (const p of c.parents) assert.ok(s.commits[p], `${sc.id}: padre inexistente ${p}`);
    }
    assert.ok(sc.info.pros.length && sc.info.cons.length && sc.info.when);
  });
}
