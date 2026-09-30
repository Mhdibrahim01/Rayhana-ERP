/*
 * seed-checkout-tests.js
 * Close the app first, then run:  node seed-checkout-tests.js
 * It writes 12 test reservations (S1-S12) covering every checkout path.
 */
'use strict';

const path = require('path');
const os   = require('os');
const db   = require('./db');

function today(offsetDays) {
  offsetDays = offsetDays || 0;
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

async function seed() {
  const appData  = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const dbPath   = path.join(appData, 'rayhana-suites', 'rayhana_erp.sqlite');

  await db.init(dbPath);
  console.log('DB connected: ' + dbPath);

  const conn   = require('./db/connection');
  const rawDb  = conn.db;
  const qOne   = conn.queryOne;
  const qAll   = conn.queryAll;

  // --- helpers ---------------------------------------------------------------

  var gCounter = 900;

  function insertGuest(name) {
    gCounter++;
    var phone = '0501234' + String(gCounter).padStart(3, '0');
    var idNum = String(1000000000 + gCounter);
    var existing = qOne('SELECT id FROM guests WHERE id_number = ?', [idNum]);
    if (existing) return existing.id;
    var stmt = rawDb.prepare('INSERT INTO guests (name, phone, id_number) VALUES (?, ?, ?)');
    stmt.run([name, phone, idNum]);
    stmt.free();
    return qOne('SELECT id FROM guests WHERE id_number = ?', [idNum]).id;
  }

  function ensureRoom(number, type, rate, status) {
    var existing = qOne('SELECT id FROM rooms WHERE room_number = ?', [number]);
    if (existing) return existing.id;
    var stmt = rawDb.prepare('INSERT INTO rooms (room_number, type, price_per_night, status) VALUES (?, ?, ?, ?)');
    stmt.run([number, type, rate, status || 'available']);
    stmt.free();
    return qOne('SELECT id FROM rooms WHERE room_number = ?', [number]).id;
  }

  function insertReservation(opts) {
    var guestId   = opts.guestId;
    var roomId    = opts.roomId;
    var checkIn   = opts.checkIn;
    var checkOut  = opts.checkOut  || null;
    var total     = opts.total;
    var paid      = opts.paid      || 0;
    var status    = opts.status    || 'confirmed';
    var bookType  = opts.bookType  || 'regular';
    var custRate  = opts.custRate  || null;
    var discount  = opts.discount  || 0;
    var discReason= opts.discReason|| null;
    var method    = opts.method    || 'cash';
    var origCalc  = opts.origCalc  || null;

    var payStatus;
    if (paid === 0)         payStatus = 'unpaid';
    else if (paid >= total) payStatus = 'paid';
    else                    payStatus = 'partial';

    // Use Arabic status values expected by the app
    var dbStatus   = status   === 'confirmed' ? '\u0645\u0624\u0643\u062f'
                   : status   === 'completed' ? '\u0645\u0643\u062a\u0645\u0644'
                   : '\u0645\u0624\u0643\u062f';
    var dbBook     = bookType === 'monthly'   ? '\u062d\u062c\u0632 \u0634\u0647\u0631\u064a'
                   : bookType === 'open'      ? '\u0639\u0642\u062f \u0645\u0641\u062a\u0648\u062d'
                   : '\u0639\u0627\u062f\u064a';
    var dbPaySt    = payStatus === 'paid'     ? '\u0645\u062f\u0641\u0648\u0639 \u0628\u0627\u0644\u0643\u0627\u0645\u0644'
                   : payStatus === 'partial'  ? '\u0645\u062f\u0641\u0648\u0639 \u062c\u0632\u0626\u064a\u0627\u064b'
                   : '\u063a\u064a\u0631 \u0645\u062f\u0641\u0648\u0639';
    var dbMethod   = method === 'cash'        ? '\u0646\u0642\u062f\u0627\u064b' : method;

    var stmt = rawDb.prepare(
      'INSERT INTO reservations ' +
      '(guest_id, room_id, check_in_date, check_out_date, total_price, paid_amount, ' +
      ' payment_method, payment_status, status, booking_type, ' +
      ' custom_nightly_price, discount_amount, discount_reason, original_calculated_charge) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    stmt.run([
      guestId, roomId, checkIn, checkOut, total, paid,
      dbMethod, dbPaySt, dbStatus, dbBook,
      custRate, discount, discReason, origCalc
    ]);
    stmt.free();

    var res   = qOne('SELECT id FROM reservations ORDER BY id DESC LIMIT 1');
    var resId = res.id;

    // Mark room occupied (Arabic: 'مشغولة')
    if (status === 'confirmed') {
      var rs = rawDb.prepare('UPDATE rooms SET status = ? WHERE id = ?');
      rs.run(['\u0645\u0634\u063a\u0648\u0644\u0629', roomId]);
      rs.free();
    }

    // Initial payment ledger row
    if (paid > 0) {
      var year  = new Date().getFullYear();
      var recNo = 'SEED-' + year + '-' + String(resId).padStart(4, '0') + '-0001';
      var ps    = rawDb.prepare(
        'INSERT OR IGNORE INTO payments ' +
        '(receipt_number, reservation_id, amount, payment_method, payment_date, notes) ' +
        "VALUES (?, ?, ?, ?, datetime('now','localtime'), ?)"
      );
      ps.run([recNo, resId, paid, dbMethod, 'seed payment']);
      ps.free();
    }

    return resId;
  }

  // --- room ids --------------------------------------------------------------

  var rooms = qAll('SELECT id, room_number, price_per_night FROM rooms ORDER BY room_number');

  function room(num) {
    var r = rooms.find(function(x) { return x.room_number === num; });
    if (!r) throw new Error('Room ' + num + ' not found -- run reset-db.js first');
    return r;
  }

  var r101 = room('101');  // rate 250
  var r102 = room('102');  // rate 250
  var r103 = room('103');  // rate 450
  var r104 = room('104');  // rate 450
  var r201 = room('201');  // rate 750
  var r202 = room('202');  // rate 1200
  var r203 = room('203');  // rate 600

  // Extra test rooms (created if absent)
  var id108 = ensureRoom('108', 'Test Single',  250,  'available');
  var id109 = ensureRoom('109', 'Test Double',  450,  'available');
  var id110 = ensureRoom('110', 'Test Suite',   750,  'available');
  var id111 = ensureRoom('111', 'Test Closed',  250,  'cleaning');
  var id112 = ensureRoom('112', 'Test Custom',  450,  'available');

  var d0  = today(0);
  var dm2 = today(-2);
  var dm3 = today(-3);
  var dm5 = today(-5);

  // --------------------------------------------------------------------------
  // S1: rate=250, paid=250 -- settled, simple confirm path
  var g1  = insertGuest('S1 settled');
  var id1 = insertReservation({ guestId: g1,  roomId: r101.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 250,  paid: 250 });
  console.log('S1 settled (simple confirm)             #' + id1  + '  room 101  paid=250 net=250');

  // S2: rate=250, paid=0 -- collect 250
  var g2  = insertGuest('S2 collect now');
  var id2 = insertReservation({ guestId: g2,  roomId: r102.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 250,  paid: 0   });
  console.log('S2 collect 250                          #' + id2  + '  room 102  paid=0   net=250');

  // S3: monthly, custom_rate=150, paid=4500 -- 1 night => net=150, refund=4350
  var g3  = insertGuest('S3 refund big');
  var id3 = insertReservation({ guestId: g3,  roomId: r103.id, checkIn: d0,  checkOut: addDays(d0,30), total: 4500, paid: 4500, bookType: 'monthly', custRate: 150 });
  console.log('S3 refund 4350 (monthly, custom 150)    #' + id3  + '  room 103  paid=4500 net=150');

  // S4: rate=250, paid=250 -- settled exact
  var g4  = insertGuest('S4 settled exact');
  var id4 = insertReservation({ guestId: g4,  roomId: r104.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 250,  paid: 250 });
  console.log('S4 settled exact                        #' + id4  + '  room 104  paid=250 net=250');

  // S5: custom_rate=200, paid=200 -- Admin: discount 50 => net=150, refund=50
  var g5  = insertGuest('S5 admin discount');
  var id5 = insertReservation({ guestId: g5,  roomId: r201.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 200,  paid: 200, custRate: 200 });
  console.log('S5 admin discount 50 => refund 50       #' + id5  + '  room 201  paid=200 custRate=200');

  // S6: custom_rate=200, paid=200 -- non-Admin: discount hidden, settled
  var g6  = insertGuest('S6 non-admin settled');
  var id6 = insertReservation({ guestId: g6,  roomId: r202.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 200,  paid: 200, custRate: 200 });
  console.log('S6 non-admin settled                    #' + id6  + '  room 202  paid=200 custRate=200');

  // S7: rate=600, paid=0 -- defer (ajil)
  var g7  = insertGuest('S7 defer ajil');
  var id7 = insertReservation({ guestId: g7,  roomId: r203.id, checkIn: d0,  checkOut: addDays(d0,1),  total: 600,  paid: 0   });
  console.log('S7 defer owed 600                       #' + id7  + '  room 203  paid=0   net=600');

  // S8: monthly, 3 days ago, rate=250, paid=7500 -- 3 nights => net=750, refund=6750
  var g8  = insertGuest('S8 monthly early');
  var id8 = insertReservation({ guestId: g8,  roomId: id108,   checkIn: dm3, checkOut: addDays(dm3,30), total: 7500, paid: 7500, bookType: 'monthly' });
  console.log('S8 monthly refund 6750                  #' + id8  + '  room 108  paid=7500 net=750');

  // S9: regular, 2 days ago, rate=450, paid=900 -- settled
  var g9  = insertGuest('S9 two nights settled');
  var id9 = insertReservation({ guestId: g9,  roomId: id109,   checkIn: dm2, checkOut: addDays(dm2,2),  total: 900,  paid: 900 });
  console.log('S9 2-night settled                      #' + id9  + '  room 109  paid=900 net=900');

  // S10: open contract, 5 days ago, paid=2000
  var g10 = insertGuest('S10 open contract');
  var id10 = insertReservation({ guestId: g10, roomId: id110,  checkIn: dm5, checkOut: null,            total: 0,    paid: 2000, bookType: 'open' });
  console.log('S10 open contract 5 nights              #' + id10 + '  room 110  paid=2000');

  // S11: already-closed -- safety net test
  var g11 = insertGuest('S11 already closed');
  var id11 = insertReservation({ guestId: g11, roomId: id111,  checkIn: today(-2), checkOut: today(-1), total: 250,  paid: 250, status: 'completed' });
  rawDb.run('UPDATE rooms SET status = ? WHERE id = ?', ['\u062a\u0646\u0638\u064a\u0641', id111]);
  console.log('S11 already closed (blocks re-checkout) #' + id11 + '  room 111  status=completed');

  // S12: custom_rate=200 stored, room_rate=450, paid=0 -- verify stored rate wins
  var g12 = insertGuest('S12 custom rate check');
  var id12 = insertReservation({ guestId: g12, roomId: id112,  checkIn: d0,  checkOut: addDays(d0,1),  total: 200,  paid: 0,   custRate: 200 });
  console.log('S12 custom rate 200 (room rate 450)     #' + id12 + '  room 112  paid=0 net=200');

  // --- save and close --------------------------------------------------------
  conn.saveToFile();
  rawDb.close();

  console.log('');
  console.log('Seed complete. Start the app to see the 12 test reservations.');
  console.log('');
  console.log('Test checklist:');
  console.log('  S1  #' + id1  + ' -- simple confirm (settled)');
  console.log('  S2  #' + id2  + ' -- settle modal, collect 250');
  console.log('  S3  #' + id3  + ' -- settle modal, refund 4350');
  console.log('  S4  #' + id4  + ' -- simple confirm (exact)');
  console.log('  S5  #' + id5  + ' -- login as admin, add discount 50 -> refund 50');
  console.log('  S6  #' + id6  + ' -- login as staff/user, discount hidden, simple confirm');
  console.log('  S7  #' + id7  + ' -- settle modal, click defer (ajil)');
  console.log('  S8  #' + id8  + ' -- settle modal, refund 6750');
  console.log('  S9  #' + id9  + ' -- simple confirm (2-night settled)');
  console.log('  S10 #' + id10 + ' -- open-contract settle modal');
  console.log('  S11 #' + id11 + ' -- DevTools: window.api.checkoutReservation(' + id11 + ',{settleMode:"defer"}) => error');
  console.log('  S12 #' + id12 + ' -- settle modal, collect 200 (NOT 450)');
}

seed().catch(function(err) {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
