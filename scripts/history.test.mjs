import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHistory, encodeHistory, upsertHistory } from '../src/lib/history-model.ts';

const entry = (id, extra = {}) => ({ id, title: 'Sample math photo', createdAt: '2026-09-12T20:00:00Z', thumbnail: 'data:image/jpeg;base64,AAAA', mode: 'Step by step', language: '한국어', explanation: 'x = 4', followUps: [], ...extra });

test('saved entries survive serialization with multilingual metadata and every follow-up', () => {
  const saved = entry('one', { followUps: [{ question: '왜?', answer: '양변을 2로 나눠요.', language: '한국어', createdAt: '2026-09-12T20:01:00Z' }, { question: 'Check it?', answer: '2 × 4 + 6 = 14.', language: 'English', createdAt: '2026-09-12T20:02:00Z' }] });
  assert.deepEqual(decodeHistory(encodeHistory([saved])), [saved]);
});
test('adding a follow-up updates the same saved entry, preserving creation time', () => {
  const original = entry('one');
  const updated = { ...original, followUps: [{ question: 'Why?', answer: 'Because.', language: 'English', createdAt: '2026-09-12T20:01:00Z' }] };
  const result = upsertHistory([entry('two'), original], updated);
  assert.equal(result.length, 2);
  assert.equal(result[1].createdAt, original.createdAt);
  assert.equal(result[1].followUps.length, 1);
});
test('history keeps the newest 20 records', () => {
  let entries = [];
  for (let i = 0; i < 25; i++) entries = upsertHistory(entries, entry(String(i)));
  assert.equal(entries.length, 20);
  assert.equal(entries[0].id, '24');
  assert.equal(entries.at(-1).id, '5');
});
test('large history stays bounded and does not evict the record being updated', () => {
  let entries = [];
  for (let i = 0; i < 20; i++) entries = upsertHistory(entries, entry(String(i), { explanation: 'a'.repeat(80_000) }));
  const id = entries.at(-1).id;
  entries = upsertHistory(entries, entry(id, { explanation: 'b'.repeat(200_000) }));
  assert.ok(encodeHistory(entries).length <= 750_000);
  assert.ok(entries.some(item => item.id === id));
  assert.throws(() => upsertHistory(entries, entry('huge', { explanation: 'a'.repeat(800_000) })));
});
test('empty storage is valid; corrupt storage fails instead of silently replacing history', () => {
  assert.deepEqual(decodeHistory(null), []);
  assert.throws(() => decodeHistory('{invalid'));
  assert.throws(() => decodeHistory('{"version":2,"entries":[]}'));
  assert.throws(() => decodeHistory(encodeHistory([entry('bad', { thumbnail: 'file:///temporary-photo.jpg' })])));
});
test('individual deletion and clearing survive reload', () => {
  const saved = [entry('a'), entry('b')];
  assert.deepEqual(decodeHistory(encodeHistory(saved.filter(item => item.id !== 'a'))).map(item => item.id), ['b']);
  assert.deepEqual(decodeHistory(encodeHistory([])), []);
});
