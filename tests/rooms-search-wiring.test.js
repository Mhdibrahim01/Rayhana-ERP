'use strict';
/**
 * The rooms search box did nothing.
 *
 * dashboard-rooms.js binds its filter to App.DOM.searchRoomsInput, but dashboard.js
 * populated that with getElementById('search-rooms-input') while the markup declares
 * id="search-rooms". The lookup returned null, the `if (App.DOM.searchRoomsInput)`
 * guard in dashboard-rooms.js silently skipped the listener, and typing in the box did
 * nothing at all - no error, just a dead input.
 *
 * The guard is the reason this survived: a missing element is normally swallowed.
 * So this test asserts the two halves of the contract directly - the id in the markup
 * and the id the script looks up must be the same string - instead of driving the UI.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
const dash = fs.readFileSync(path.join(ROOT, 'dashboard.js'), 'utf8');
const rooms = fs.readFileSync(path.join(ROOT, 'dashboard-rooms.js'), 'utf8');

test('rooms search: the element id in the markup exists exactly once', () => {
  const ids = [...html.matchAll(/id="([^"]*search-rooms[^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(
    ids,
    ['search-rooms'],
    'dashboard.html must declare exactly one search-rooms input, found: ' + JSON.stringify(ids)
  );
});

test('rooms search: dashboard.js looks up the id the markup actually declares', () => {
  const lookups = [...dash.matchAll(/searchRoomsInput\s*=\s*document\.getElementById\('([^']+)'\)/g)]
    .map((m) => m[1]);

  assert.ok(
    lookups.length > 0,
    'expected at least one searchRoomsInput assignment via getElementById'
  );

  const wrong = lookups.filter((id) => !html.includes(`id="${id}"`));
  assert.deepStrictEqual(
    wrong,
    [],
    'searchRoomsInput is assigned from element(s) that do not exist in dashboard.html: ' +
      JSON.stringify(wrong)
  );
});

test('rooms search: dashboard.js exposes the input on DashboardApp.DOM', () => {
  // dashboard-rooms.js reads App.DOM.searchRoomsInput. A correct lookup that is never
  // published there leaves the module looking at undefined, which is the same failure
  // as the null lookup it replaced.
  assert.match(
    dash,
    /DashboardApp\.DOM\.searchRoomsInput\s*=\s*document\.getElementById\('search-rooms'\)/,
    'DashboardApp.DOM.searchRoomsInput must be published from the real element id'
  );
});

test('rooms search: dashboard-rooms.js binds an input listener to that element', () => {
  const binds = /App\.DOM\.searchRoomsInput\.addEventListener\('input'/.test(rooms);
  assert.ok(binds, "dashboard-rooms.js must attach an 'input' listener to App.DOM.searchRoomsInput");

  // And it must not sit behind a guard that can silently skip it.
  assert.match(
    rooms,
    /if \(App\.DOM\.searchRoomsInput\)[\s\S]{0,200}addEventListener\('input'/,
    'the listener must be reachable; a null element currently skips it silently'
  );
});

test('rooms search: the filter matches room number and type', () => {
  // Guard against "fixing" the wiring by removing the filter entirely.
  assert.match(rooms, /currentRoomSearch/, 'rooms module must keep a search term state');
  assert.match(rooms, /room_number[\s\S]{0,200}includes\(searchTerm\)/,
    'filter must match on room_number');
  assert.match(rooms, /\.type[\s\S]{0,200}includes\(searchTerm\)/,
    'filter must match on room type');
});
