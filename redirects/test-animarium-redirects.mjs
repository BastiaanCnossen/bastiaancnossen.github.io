import assert from 'node:assert/strict';
import { redirectDestination, renderRedirect, renderTombstone } from './generate-animarium-redirects.mjs';

const entry = 'https://animarium.org/work/entry/result/';
assert.equal(redirectDestination(entry, {}, '?q=1', '#proof'), entry + '?q=1#proof');
assert.equal(redirectDestination(entry + '#definition', {}, '?q=1', '#old'), entry + '?q=1#definition');
assert.equal(redirectDestination(entry, { 'lem:Old': entry + '#prop:New' }, '?q=1', '#lem%3AOld'), entry + '?q=1#prop:New');
assert.equal(redirectDestination(entry, {}, '', '#%oops'), entry + '#%oops');
assert.equal(redirectDestination(entry, {}, '', '#constructor'), entry + '#constructor');
assert.match(renderRedirect(entry), /<link rel="canonical" href="https:\/\/animarium\.org\/work\/entry\/result\/">/);
assert.match(renderRedirect(entry), /<noscript><meta http-equiv="refresh"/);
const reason = 'The author withdrew <this> result.';
const tombstone = renderTombstone({ Reason: reason, Fragments: [{ Id: 'lem:Old', Reason: reason }] });
assert.ok(tombstone.includes('withdrew &lt;this&gt;'));
assert.ok(tombstone.includes('id="lem:Old"'));
assert.ok(!tombstone.includes('location.replace'));
console.log('Validated migration redirects, fixed and incoming fragments, fallback markup, and withdrawal notices.');
