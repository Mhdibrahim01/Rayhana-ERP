'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createCommandPaletteEnv(mockState = {}, mockHelpers = {}, mockApi = null) {
  const App = {
    State: {
      businessDate: '2026-10-08',
      reservationsCache: [],
      roomsCache: [],
      guestsCache: [],
      ...mockState
    },
    Helpers: {
      getLocalDateString: () => '2026-10-08',
      isLateCheckout: (res) => Boolean(res.is_late),
      getExpectedCheckoutTime: () => '14:00',
      escapeHtml: (s) => String(s || ''),
      ...mockHelpers
    }
  };

  const windowMock = {
    DashboardApp: App,
    addEventListener: () => {},
    setTimeout: () => {},
    setInterval: () => {}
  };
  if (mockApi) {
    windowMock.api = mockApi;
  }

  const documentMock = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    readyState: 'complete'
  };

  const code = fs.readFileSync(path.resolve(__dirname, '../command-palette.js'), 'utf8');
  const context = vm.createContext({
    window: windowMock,
    document: documentMock,
    console,
    setTimeout: (fn) => fn(),
    setInterval: () => 1,
    Date,
    Math,
    String,
    Number,
    Array,
    Boolean,
    Set,
    Map,
    RegExp
  });
  vm.runInContext(code, context);

  return { App, CommandPalette: App.CommandPalette };
}

test('Smart Command Palette (Ctrl+K) & Attention Inbox Unit Tests', async t => {

  await t.test('Natural Language & Command Intent Parsing (parseCommandIntent)', async t2 => {
    const { CommandPalette } = createCommandPaletteEnv();
    const parse = CommandPalette.parseCommandIntent;

    await t2.test('Empty input returns empty intent', () => {
      assert.equal(parse('').type, 'empty');
      assert.equal(parse('   ').type, 'empty');
      assert.equal(parse(null).type, 'empty');
    });

    await t2.test('Room inquiries correctly parse room numbers in Arabic & English', () => {
      assert.equal(parse('مين في غرفة 204؟').type, 'room-inquiry');
      assert.equal(parse('مين في غرفة 204؟').roomNumber, '204');

      assert.equal(parse('مين في 204').type, 'room-inquiry');
      assert.equal(parse('مين في 204').roomNumber, '204');

      assert.equal(parse('مين في 202').type, 'room-inquiry');
      assert.equal(parse('مين في 202').roomNumber, '202');

      assert.equal(parse('مين ساكن في 202').type, 'room-inquiry');
      assert.equal(parse('مين ساكن في 202').roomNumber, '202');

      assert.equal(parse('غرفة 302').type, 'room-inquiry');
      assert.equal(parse('غرفة 302').roomNumber, '302');

      assert.equal(parse('رقم 105').type, 'room-inquiry');
      assert.equal(parse('رقم 105').roomNumber, '105');

      assert.equal(parse('204').type, 'room-inquiry');
      assert.equal(parse('204').roomNumber, '204');
    });

    await t2.test('Booking & check-in intents parse room number when supplied', () => {
      const intentWithRoom = parse('تسكين 105');
      assert.equal(intentWithRoom.type, 'booking-intent');
      assert.equal(intentWithRoom.roomNumber, '105');

      const intentWithRoomAr = parse('حجز غرفة 201');
      assert.equal(intentWithRoomAr.type, 'booking-intent');
      assert.equal(intentWithRoomAr.roomNumber, '201');

      const intentWithoutRoom = parse('تسكين');
      assert.equal(intentWithoutRoom.type, 'booking-intent');
      assert.equal(intentWithoutRoom.roomNumber, null);

      const intentBookingEn = parse('checkin 305');
      assert.equal(intentBookingEn.type, 'booking-intent');
      assert.equal(intentBookingEn.roomNumber, '305');
    });

    await t2.test('Cash drawer, shift reports, and audit intents', () => {
      assert.equal(parse('فلوس الدرج').type, 'shift-intent');
      assert.equal(parse('الدرج').type, 'shift-intent');
      assert.equal(parse('تقرير الوردية').type, 'shift-intent');
      assert.equal(parse('الخزينة').type, 'shift-intent');
      assert.equal(parse('الكاش').type, 'shift-intent');
      assert.equal(parse('shift audit').type, 'shift-intent');
      assert.equal(parse('cash drawer').type, 'shift-intent');
    });

    await t2.test('WhatsApp messaging intents parse target guest or room', () => {
      const waRoom = parse('واتساب 102');
      assert.equal(waRoom.type, 'whatsapp-intent');
      assert.equal(waRoom.target, '102');

      const waName = parse('واتساب محمد');
      assert.equal(waName.type, 'whatsapp-intent');
      assert.equal(waName.target, 'محمد');

      const waEn = parse('whatsapp 204');
      assert.equal(waEn.type, 'whatsapp-intent');
      assert.equal(waEn.target, '204');
    });

    await t2.test('Operational query intents (unpaid, departures, late, available, occupied)', () => {
      assert.equal(parse('مين عليه فلوس').type, 'unpaid-intent');
      assert.equal(parse('مين عليه فلوس؟').type, 'unpaid-intent');
      assert.equal(parse('مين عليه مبالغ').type, 'unpaid-intent');
      assert.equal(parse('مين ما دفع').type, 'unpaid-intent');
      assert.equal(parse('المستحقات').type, 'unpaid-intent');
      assert.equal(parse('مديونية').type, 'unpaid-intent');
      assert.equal(parse('ديون').type, 'unpaid-intent');
      assert.equal(parse('unpaid').type, 'unpaid-intent');
      assert.equal(parse('debts').type, 'unpaid-intent');

      assert.equal(parse('مين خارج اليوم').type, 'departures-intent');
      assert.equal(parse('مغادرات اليوم').type, 'departures-intent');
      assert.equal(parse('departures').type, 'departures-intent');

      assert.equal(parse('مين متأخر').type, 'late-intent');
      assert.equal(parse('المتأخرين').type, 'late-intent');
      assert.equal(parse('تأخير').type, 'late-intent');
      assert.equal(parse('late').type, 'late-intent');

      assert.equal(parse('غرف فاضية').type, 'available-intent');
      assert.equal(parse('مين فاضي').type, 'available-intent');
      assert.equal(parse('غرف متاحة').type, 'available-intent');
      assert.equal(parse('available').type, 'available-intent');

      assert.equal(parse('غرف مشغولة').type, 'occupied-intent');
      assert.equal(parse('مين ساكن').type, 'occupied-intent');
      assert.equal(parse('مشغولة').type, 'occupied-intent');
      assert.equal(parse('occupied').type, 'occupied-intent');
    });

    await t2.test('General queries fall back to multi-entity search', () => {
      const res1 = parse('سعد عبدالله');
      assert.equal(res1.type, 'search');
      assert.equal(res1.query, 'سعد عبدالله');

      const res2 = parse('0555123456');
      assert.equal(res2.type, 'search');
      assert.equal(res2.query, '0555123456');
    });
  });

  await t.test('Needs-Attention Inbox Engine (computeAttentionInbox)', async t2 => {
    const bizDate = '2026-10-08';
    const mockReservations = [
      // 1. Late checkout (due yesterday 2026-10-07, active stay)
      {
        id: 101,
        status: 'مؤكد',
        room_id: 1,
        room_number: '101',
        guest_name: 'أحمد المتأخر',
        check_out_date: '2026-10-07',
        booking_type: 'يومي',
        total_price: 500,
        paid_amount: 500,
        is_late: true
      },
      // 2. Departure due today (2026-10-08, not yet late)
      {
        id: 102,
        status: 'مؤكد',
        room_id: 2,
        room_number: '102',
        guest_name: 'سالم المغادر',
        check_out_date: '2026-10-08',
        booking_type: 'يومي',
        total_price: 300,
        paid_amount: 300,
        is_late: false
      },
      // 3. Unpaid balance (checked out in future 2026-10-12, balance = 400)
      {
        id: 103,
        status: 'مؤكد',
        room_id: 3,
        room_number: '103',
        guest_name: 'خالد المدين',
        check_out_date: '2026-10-12',
        booking_type: 'يومي',
        total_price: 800,
        paid_amount: 400,
        is_late: false
      },
      // 4. Monthly rent due soon (expires 2026-10-10, 2 days left)
      {
        id: 104,
        status: 'مؤكد',
        room_id: 4,
        room_number: '104',
        guest_name: 'عبدالرحمن الشهري',
        check_out_date: '2026-10-10',
        booking_type: 'حجز شهري',
        total_price: 4500,
        paid_amount: 4500,
        is_late: false
      },
      // 5. Unreconciled legacy deposit
      {
        id: 105,
        status: 'مؤكد',
        room_id: 5,
        room_number: '105',
        guest_name: 'فيصل التأمين',
        check_out_date: '2026-10-15',
        booking_type: 'يومي',
        total_price: 600,
        paid_amount: 600,
        deposit_amount: 200,
        deposit_legacy_unreconciled: 1,
        is_late: false
      },
      // 6. Completed stay (should be completely ignored by inbox)
      {
        id: 106,
        status: 'مكتمل',
        room_id: 6,
        room_number: '106',
        guest_name: 'نزيل مغادر سابقاً',
        check_out_date: '2026-10-05',
        total_price: 400,
        paid_amount: 400,
        is_late: false
      },
      // 7. Cancelled stay (should be completely ignored by inbox)
      {
        id: 107,
        status: 'ملغي',
        room_id: 7,
        room_number: '107',
        guest_name: 'حجز ملغي',
        check_out_date: '2026-10-06',
        total_price: 300,
        paid_amount: 0,
        is_late: false
      }
    ];

    const mockRooms = [
      { id: 1, room_number: '101', status: 'مشغولة' },
      { id: 2, room_number: '102', status: 'مشغولة' },
      { id: 3, room_number: '103', status: 'مشغولة' },
      { id: 4, room_number: '104', status: 'مشغولة' },
      { id: 5, room_number: '105', status: 'مشغولة' },
      { id: 201, room_number: '201', status: 'تنظيف', type: 'غرفة وصالة', floor: '2' },
      { id: 202, room_number: '202', status: 'متاحة', type: 'استوديو', floor: '2' }
    ];

    const { CommandPalette } = createCommandPaletteEnv({
      businessDate: bizDate,
      reservationsCache: mockReservations,
      roomsCache: mockRooms
    });

    const inbox = CommandPalette.computeAttentionInbox();

    await t2.test('Aggregates late checkouts accurately', () => {
      assert.equal(inbox.lateCheckouts.length, 1);
      assert.equal(inbox.lateCheckouts[0].id, 101);
      assert.equal(inbox.lateCheckouts[0].action, 'checkout');
      assert.equal(inbox.lateCheckouts[0].badgeClass, 'danger');
    });

    await t2.test('Aggregates departures due today', () => {
      assert.equal(inbox.departuresToday.length, 1);
      assert.equal(inbox.departuresToday[0].id, 102);
      assert.equal(inbox.departuresToday[0].action, 'checkout');
      assert.equal(inbox.departuresToday[0].badgeClass, 'info');
    });

    await t2.test('Aggregates unpaid balances without duplicating late checkouts', () => {
      assert.equal(inbox.unpaidBalances.length, 1);
      assert.equal(inbox.unpaidBalances[0].id, 103);
      assert.equal(inbox.unpaidBalances[0].action, 'payment');
      assert.equal(inbox.unpaidBalances[0].badgeClass, 'warning');
    });

    await t2.test('Aggregates rooms waiting for cleaning', () => {
      assert.equal(inbox.dirtyRooms.length, 1);
      assert.equal(inbox.dirtyRooms[0].room.room_number, '201');
      assert.equal(inbox.dirtyRooms[0].action, 'mark-clean');
      assert.equal(inbox.dirtyRooms[0].badgeClass, 'purple');
    });

    await t2.test('Aggregates monthly rents expiring within 3 days', () => {
      assert.equal(inbox.monthlyDue.length, 1);
      assert.equal(inbox.monthlyDue[0].id, 104);
      assert.equal(inbox.monthlyDue[0].action, 'extend');
    });

    await t2.test('Aggregates legacy deposits requiring reconciliation', () => {
      assert.equal(inbox.legacyDeposits.length, 1);
      assert.equal(inbox.legacyDeposits[0].id, 105);
      assert.equal(inbox.legacyDeposits[0].action, 'preview');
    });

    await t2.test('Computes correct totalCount across all categories', () => {
      // 1 late + 1 departure + 1 unpaid + 1 dirty + 1 monthly + 1 deposit = 6
      assert.equal(inbox.totalCount, 6);
    });

    await t2.test('Returns zero totalCount when all operations are clean and up to date', () => {
      const cleanEnv = createCommandPaletteEnv({
        businessDate: bizDate,
        reservationsCache: [
          {
            id: 201,
            status: 'مؤكد',
            check_out_date: '2026-10-15',
            booking_type: 'يومي',
            total_price: 600,
            paid_amount: 600,
            is_late: false
          }
        ],
        roomsCache: [
          { id: 1, room_number: '101', status: 'متاحة' }
        ]
      });

      const cleanInbox = cleanEnv.CommandPalette.computeAttentionInbox();
      assert.equal(cleanInbox.totalCount, 0);
      assert.equal(cleanInbox.lateCheckouts.length, 0);
      assert.equal(cleanInbox.departuresToday.length, 0);
      assert.equal(cleanInbox.unpaidBalances.length, 0);
      assert.equal(cleanInbox.dirtyRooms.length, 0);
      assert.equal(cleanInbox.monthlyDue.length, 0);
      assert.equal(cleanInbox.legacyDeposits.length, 0);
    });
  });

  await t.test('Data Hydration & Fallback Engine', async t2 => {
    await t2.test('Falls back to local cache when App.State caches are empty and syncs from API', async () => {
      const mockRooms = [{ id: 202, room_number: '202', status: 'محجوزة' }];
      const mockRes = [{ id: 76, room_id: 202, room_number: '202', status: 'مؤكد', guest_name: 'عبدالرحمن حمد حكمي', total_price: 3000, paid_amount: 1000 }];
      const mockGuests = [{ id: 1, name: 'عبدالرحمن حمد حكمي', phone: '0555123456' }];

      const mockApi = {
        getAllRooms: async () => ({ success: true, data: mockRooms }),
        getAllReservations: async () => ({ success: true, data: mockRes }),
        getAllGuests: async () => ({ success: true, data: mockGuests })
      };

      const { App, CommandPalette } = createCommandPaletteEnv({}, {}, mockApi);

      assert.equal(CommandPalette.getRooms().length, 0);
      assert.equal(CommandPalette.getReservations().length, 0);

      await CommandPalette.syncDataFromDb();

      assert.equal(CommandPalette.getRooms().length, 1);
      assert.equal(CommandPalette.getRooms()[0].room_number, '202');
      assert.equal(CommandPalette.getReservations().length, 1);
      assert.equal(CommandPalette.getReservations()[0].guest_name, 'عبدالرحمن حمد حكمي');
      assert.equal(App.State.roomsCache.length, 1);
      assert.equal(App.State.reservationsCache.length, 1);

      // Verify that attention inbox detects the unpaid balance on room 202
      const inbox = CommandPalette.computeAttentionInbox();
      assert.equal(inbox.unpaidBalances.length, 1);
      assert.equal(inbox.unpaidBalances[0].reservation.guest_name, 'عبدالرحمن حمد حكمي');
    });

    await t2.test('Room 202 inquiry resolves active occupant even when room status is "محجوزة"', () => {
      const { CommandPalette } = createCommandPaletteEnv({
        roomsCache: [{ id: 202, room_number: '202', status: 'محجوزة' }],
        reservationsCache: [{
          id: 76,
          room_id: 202,
          room_number: '202',
          status: 'مؤكد',
          guest_name: 'عبدالرحمن حمد احمد ال ابوالسعود حكمي',
          guest_phone: '0555123456',
          total_price: 3000,
          paid_amount: 1000
        }]
      });

      const parsed = CommandPalette.parseCommandIntent('مين في 202');
      assert.equal(parsed.type, 'room-inquiry');
      assert.equal(parsed.roomNumber, '202');

      const activeRes = CommandPalette.getReservations().find(r => String(r.room_number) === '202' && r.status === 'مؤكد');
      assert.ok(activeRes);
      assert.equal(activeRes.guest_name, 'عبدالرحمن حمد احمد ال ابوالسعود حكمي');
      assert.equal(activeRes.total_price - activeRes.paid_amount, 2000);
    });
  });

  await t.test('Arabic Matching, Text Normalization & Keyboard Layout Transliteration', async t2 => {
    const { CommandPalette } = createCommandPaletteEnv();
    const { normalizeArabic, normalizeDigits, stripDiacritics, transliterateEnToAr, parseCommandIntent } = CommandPalette;

    await t2.test('Arabic-Indic digits conversion', () => {
      assert.equal(normalizeDigits('٢٠٤'), '204');
      assert.equal(normalizeDigits('١٠٥'), '105');
      assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
      assert.equal(normalizeDigits('غرفة ٢٠٤'), 'غرفة 204');
    });

    await t2.test('Diacritics and Tatweel stripping', () => {
      assert.equal(stripDiacritics('مُتَأَخِّرٌ'), 'متأخر');
      assert.equal(stripDiacritics('غُرْفَةٌ'), 'غرفة');
      assert.equal(stripDiacritics('تـسـكـيـن'), 'تسكين');
    });

    await t2.test('Arabic character normalization (Alef, Ta-Marbuta, Ya)', () => {
      assert.equal(normalizeArabic('أحمد'), 'احمد');
      assert.equal(normalizeArabic('إبراهيم'), 'ابراهيم');
      assert.equal(normalizeArabic('آمال'), 'امال');
      assert.equal(normalizeArabic('غرفة'), 'غرفه');
      assert.equal(normalizeArabic('موسى'), 'موسي');
      assert.equal(normalizeArabic('مُتَأَخِّرٌ'), 'متاخر');
      assert.equal(normalizeArabic('غُرْفَةٌ ٢٠٤'), 'غرفه 204');
    });

    await t2.test('Room inquiries accept Arabic-Indic digits and "غرفه" spelling', () => {
      const q1 = parseCommandIntent('مين في غرفة ٢٠٤؟');
      assert.equal(q1.type, 'room-inquiry');
      assert.equal(q1.roomNumber, '204');

      const q2 = parseCommandIntent('٢٠٤');
      assert.equal(q2.type, 'room-inquiry');
      assert.equal(q2.roomNumber, '204');

      const q3 = parseCommandIntent('غرفه 204');
      assert.equal(q3.type, 'room-inquiry');
      assert.equal(q3.roomNumber, '204');

      const q4 = parseCommandIntent('غرفة ٢٠٤');
      assert.equal(q4.type, 'room-inquiry');
      assert.equal(q4.roomNumber, '204');

      const q5 = parseCommandIntent('مين ساكن في غرفة ٢٠٢');
      assert.equal(q5.type, 'room-inquiry');
      assert.equal(q5.roomNumber, '202');
    });

    await t2.test('Booking intent with Arabic-Indic digits', () => {
      const b1 = parseCommandIntent('تسكين ١٠٥');
      assert.equal(b1.type, 'booking-intent');
      assert.equal(b1.roomNumber, '105');

      const b2 = parseCommandIntent('حجز غرفه ٢٠١');
      assert.equal(b2.type, 'booking-intent');
      assert.equal(b2.roomNumber, '201');
    });

    await t2.test('WhatsApp intent with Arabic-Indic digits', () => {
      const w1 = parseCommandIntent('واتساب ١٠٢');
      assert.equal(w1.type, 'whatsapp-intent');
      assert.equal(w1.target, '102');

      const w2 = parseCommandIntent('واتس غرفه ١٠٢');
      assert.equal(w2.type, 'whatsapp-intent');
      assert.equal(w2.target, '102');
    });

    await t2.test('Operational queries match with Ta-Marbuta or Ha', () => {
      assert.equal(parseCommandIntent('غرفه فاضيه').type, 'available-intent');
      assert.equal(parseCommandIntent('غرفة فاضية').type, 'available-intent');
      assert.equal(parseCommandIntent('غرف متاحه').type, 'available-intent');
      assert.equal(parseCommandIntent('غرف متاحة').type, 'available-intent');
      assert.equal(parseCommandIntent('مين متاخر').type, 'late-intent');
      assert.equal(parseCommandIntent('مين متأخر').type, 'late-intent');
      assert.equal(parseCommandIntent('نظافه').type, 'cleaning-intent');
      assert.equal(parseCommandIntent('نظافة').type, 'cleaning-intent');
      assert.equal(parseCommandIntent('تقرير الورديه').type, 'shift-intent');
      assert.equal(parseCommandIntent('تقرير الوردية').type, 'shift-intent');
    });

    await t2.test('English keyboard layout transliteration to Arabic', () => {
      assert.equal(transliterateEnToAr('ldk td 202'), 'مين في 202');
      assert.equal(transliterateEnToAr('tg,s hg]v['), 'فلوس الدرج');
      assert.equal(transliterateEnToAr('yvt thqdm'), 'غرف فاضية');
      assert.equal(transliterateEnToAr('js;dk 105'), 'تسكين 105');

      // Intent parsing with English layout keystrokes
      const r1 = parseCommandIntent('ldk td 202');
      assert.equal(r1.type, 'room-inquiry');
      assert.equal(r1.roomNumber, '202');

      const r2 = parseCommandIntent('ldk td 204');
      assert.equal(r2.type, 'room-inquiry');
      assert.equal(r2.roomNumber, '204');

      const s1 = parseCommandIntent('tg,s hg]v[');
      assert.equal(s1.type, 'shift-intent');

      const a1 = parseCommandIntent('yvt thqdm');
      assert.equal(a1.type, 'available-intent');

      const b1 = parseCommandIntent('js;dk 105');
      assert.equal(b1.type, 'booking-intent');
      assert.equal(b1.roomNumber, '105');
    });
  });

  await t.test('Overdue Checkouts Aggregation Matches Image 2 (5 Late Reservations)', async () => {
    // Replicating Image 2 scenario: 5 late checkouts in rooms 101, 102, 201, 203, 217
    const today = '2026-10-08';
    const mockCheckouts = [
      { id: 101, reservation_id: 101, room_number: '101', guest_name: 'نزيل 101', status: 'مؤكد', check_out_date: '2026-10-07', is_late: true },
      { id: 102, reservation_id: 102, room_number: '102', guest_name: 'نزيل 102', status: 'مؤكد', check_out_date: '2026-10-07', is_late: true },
      { id: 201, reservation_id: 201, room_number: '201', guest_name: 'نزيل 201', status: 'مؤكد', check_out_date: '2026-10-07', is_late: true },
      { id: 203, reservation_id: 203, room_number: '203', guest_name: 'نزيل 203', status: 'مؤكد', check_out_date: '2026-10-07', is_late: true },
      { id: 217, reservation_id: 217, room_number: '217', guest_name: 'نزيل 217', status: 'مؤكد', check_out_date: '2026-10-07', is_late: true },
      { id: 301, reservation_id: 301, room_number: '301', guest_name: 'نزيل 301', status: 'مؤكد', check_out_date: '2026-10-08', is_late: false }
    ];

    const { CommandPalette } = createCommandPaletteEnv({
      businessDate: today,
      todayCheckoutsRows: mockCheckouts,
      reservationsCache: mockCheckouts
    }, {
      isLateCheckout: (res) => Boolean(res.is_late || (res.check_out_date && res.check_out_date < today))
    });

    const inbox = CommandPalette.computeAttentionInbox();
    assert.equal(inbox.lateCheckouts.length, 5, 'Must report exactly 5 late checkouts');
    const lateRoomNumbers = inbox.lateCheckouts.map(item => String(item.reservation.room_number)).sort();
    assert.equal(JSON.stringify(lateRoomNumbers), JSON.stringify(['101', '102', '201', '203', '217']));

    // And departures today must be exactly 1 (room 301)
    assert.equal(inbox.departuresToday.length, 1);
    assert.equal(inbox.departuresToday[0].reservation.room_number, '301');
  });
});
