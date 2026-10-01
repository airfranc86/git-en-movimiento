'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { S0, op, isAnc, reachable } = require('../js/engine.js');

/** main: C1-C2-C5 / feature: C2-C3-C4 (ramas divergentes) */
function divergent() {
  const S = S0();
  op.commit(S, 'a'); op.commit(S, 'b');
  op.swc(S, 'feature', 1); op.commit(S, 'c'); op.commit(S, 'd');
  op.sw(S, 'main'); op.commit(S, 'e');
  return S;
}

test('commit avanza solo la rama donde está HEAD', () => {
  const S = divergent();
  assert.equal(S.branches.main, 'C5');
  assert.equal(S.branches.feature, 'C4');
  assert.deepEqual(S.commits.C5.parents, ['C2']);
});

test('merge sin divergencia hace fast-forward y no crea commits', () => {
  const S = S0();
  op.commit(S, 'a'); op.swc(S, 'feature', 1); op.commit(S, 'b'); op.sw(S, 'main');
  const before = Object.keys(S.commits).length;
  op.merge(S, 'feature');
  assert.equal(S.branches.main, 'C2');
  assert.equal(Object.keys(S.commits).length, before);
});

test('merge --no-ff fuerza un merge commit aunque se pueda hacer fast-forward', () => {
  const S = S0();
  op.commit(S, 'a'); op.swc(S, 'feature', 1); op.commit(S, 'b'); op.sw(S, 'main');
  op.merge(S, 'feature', { noff: true });
  assert.equal(S.branches.main, 'M1');
  assert.deepEqual(S.commits.M1.parents, ['C1', 'C2']);
});

test('merge con divergencia crea un commit con dos padres', () => {
  const S = divergent();
  op.merge(S, 'feature');
  assert.deepEqual(S.commits.M1.parents, ['C5', 'C4']);
  assert.equal(S.commits.M1.kind, 'merge');
});

test('rebase crea commits nuevos y deja huérfanos a los originales', () => {
  const S = divergent();
  op.sw(S, 'feature'); op.rebase(S, 'main');
  assert.equal(S.branches.feature, "C4'");
  assert.deepEqual(S.commits["C3'"].parents, ['C5']);
  const r = reachable(S);
  assert.ok(!r.has('C3') && !r.has('C4'));
  assert.ok(isAnc(S, 'C5', "C4'"));
});

test('squash crea un único commit y la rama no queda integrada', () => {
  const S = divergent();
  op.commit(S, 'squash', { id: 'S1', kind: 'squash' });
  assert.deepEqual(S.commits.S1.parents, ['C5']);
  assert.ok(!isAnc(S, 'C4', S.branches.main));
});

test('cherry-pick copia el commit sobre la rama actual', () => {
  const S = divergent();
  op.cherry(S, 'C3');
  assert.equal(S.branches.main, "C3'");
  assert.equal(S.commits["C3'"].msg, S.commits.C3.msg);
  assert.equal(S.branches.feature, 'C4');
});

test('reset mueve el puntero y deja huérfano lo que queda adelante', () => {
  const S = S0();
  op.commit(S, 'a'); op.commit(S, 'b'); op.commit(S, 'c');
  op.reset(S, 'C2');
  assert.equal(S.branches.main, 'C2');
  assert.ok(!reachable(S).has('C3'));
});

test('revert agrega un commit y no reescribe nada', () => {
  const S = S0();
  op.commit(S, 'a'); op.commit(S, 'b'); op.commit(S, 'c');
  op.revert(S, 'C2');
  assert.deepEqual(S.commits.R1.parents, ['C3']);
  assert.ok(reachable(S).has('C2'));
});

/** feature pusheada, Ana pushea C6 y vos rebaseás sobre main */
function shared() {
  const S = divergent();
  op.push(S, 'main');
  op.sw(S, 'feature');
  S.remotes['origin/feature'] = S.tracked['origin/feature'] = 'C4';
  op.rcommit(S, 'feature', 'ana', 'Ana', 2);
  op.rebase(S, 'main');
  return S;
}

test('push normal se rechaza si el remoto tiene trabajo que no tenés', () => {
  const S = shared();
  assert.equal(op.push(S, 'feature'), false);
  assert.equal(S.remotes['origin/feature'], 'C6');
  assert.match(S.out, /fetch first/);
});

test('push --force pisa el remoto y deja huérfano el commit ajeno', () => {
  const S = shared();
  assert.equal(op.push(S, 'feature', 'force'), true);
  assert.equal(S.remotes['origin/feature'], "C4'");
  assert.ok(!reachable(S).has('C6'));
});

test('--force-with-lease rechaza si el remoto se movió desde el último fetch', () => {
  const S = shared();
  assert.equal(op.push(S, 'feature', 'lease'), false);
  assert.match(S.out, /stale info/);
});

test('--force-with-lease pasa después de fetch (por eso existe --force-if-includes)', () => {
  const S = shared();
  op.fetch(S);
  assert.equal(op.push(S, 'feature', 'lease'), true);
});

test('fetch marca como conocidos los commits que estaban solo en el remoto', () => {
  const S = shared();
  assert.equal(S.commits.C6.remoteOnly, true);
  op.fetch(S);
  assert.equal(S.commits.C6.remoteOnly, false);
});
