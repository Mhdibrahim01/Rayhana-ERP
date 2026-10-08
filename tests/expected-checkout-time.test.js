'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('F-18: Expected checkout time and day-use cutoff policies', async t => {
  const appPath = path.join(__dirname, '..', 'dashboard-app.js');
  const appContent = fs.readFileSync(appPath, 'utf8');

  const resPath = path.join(__dirname, '..', 'dashboard-reservations.js');
  const resContent = fs.readFileSync(resPath, 'utf8');

  const overviewPath = path.join(__dirname, '..', 'dashboard-overview.js');
  const overviewContent = fs.readFileSync(overviewPath, 'utf8');

  await t.test('dashboard-app.js defines and exports getExpectedCheckoutTime helper', () => {
    assert.ok(
      appContent.includes('function getExpectedCheckoutTime(reservation)'),
      'dashboard-app.js must define getExpectedCheckoutTime'
    );
    assert.ok(
      appContent.includes('App.Helpers.getExpectedCheckoutTime = getExpectedCheckoutTime;'),
      'dashboard-app.js must export getExpectedCheckoutTime'
    );
  });

  await t.test('dashboard-reservations.js uses getExpectedCheckoutTime', () => {
    assert.ok(
      resContent.includes('App.Helpers.getExpectedCheckoutTime'),
      'dashboard-reservations.js must call App.Helpers.getExpectedCheckoutTime'
    );
  });

  await t.test('dashboard-overview.js uses getExpectedCheckoutTime', () => {
    assert.ok(
      overviewContent.includes('App.Helpers.getExpectedCheckoutTime'),
      'dashboard-overview.js must call App.Helpers.getExpectedCheckoutTime'
    );
  });

  await t.test('evaluating getExpectedCheckoutTime behavior across booking types', () => {
    // Mock minimal environment to execute helper
    const window = { DashboardApp: { Helpers: {} } };
    const fn = new Function('window', `${appContent}; return window.DashboardApp.Helpers.getExpectedCheckoutTime;`);
    const getExpectedCheckoutTime = fn(window);

    // 1. Regular confirmed stay defaults to 14:00
    assert.equal(
      getExpectedCheckoutTime({ status: 'مؤكد', booking_type: 'عادي', check_out_date: '2026-10-15' }),
      '14:00',
      'Regular stay expected checkout time must be 14:00'
    );

    // 2. Day use booking expected checkout time is 18:00
    assert.equal(
      getExpectedCheckoutTime({ status: 'مؤكد', booking_type: 'استخدام يومي', check_out_date: '2026-10-08' }),
      '18:00',
      'Day use booking expected checkout time must be 18:00'
    );

    // 3. Stay with agreed late checkout fee expects 18:00
    assert.equal(
      getExpectedCheckoutTime({ status: 'مؤكد', booking_type: 'عادي', check_out_date: '2026-10-08', late_checkout_fee: 100 }),
      '18:00',
      'Stay with late checkout fee expected checkout time must be 18:00'
    );

    // 4. Open contract has no fixed checkout time
    assert.equal(
      getExpectedCheckoutTime({ status: 'مؤكد', booking_type: 'عقد مفتوح', check_out_date: 'مفتوح' }),
      '',
      'Open contract must not have a fixed expected checkout time'
    );

    // 5. Non-confirmed / completed stay returns empty
    assert.equal(
      getExpectedCheckoutTime({ status: 'مكتمل', booking_type: 'عادي', check_out_date: '2026-10-08' }),
      '',
      'Completed stay must not have an expected checkout time'
    );
  });
});
