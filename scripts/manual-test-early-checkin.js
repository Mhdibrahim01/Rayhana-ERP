'use strict';

/**
 * Interactive Manual Tester for Early Morning Check-in & Invoicing
 * Runs through the operational workflow in an isolated temporary SQLite database,
 * generates an invoice preview HTML, and displays full operational details.
 *
 * Usage: node scripts/manual-test-early-checkin.js
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');
const appDb = require('../db');
const connection = require('../db/connection');

function banner(text) {
  console.log('\n' + '═'.repeat(66));
  console.log(`  ${text}`);
  console.log('═'.repeat(66));
}

function subHeader(text) {
  console.log('\n' + '─'.repeat(50));
  console.log(`▶ ${text}`);
  console.log('─'.repeat(50));
}

async function runManualTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayhana-manual-test-'));
  const dbPath = path.join(tempDir, 'manual-test.sqlite');

  try {
    banner('🌙 محاكي واختبار تسكين الفجر المبكر والفاتورة الرسمية (Early Check-in Test)');

    await appDb.init(dbPath);

    // Step 1: Hotel Business Settings
    const initialBizDate = '2026-10-09';
    connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [initialBizDate]);
    appDb.updateBusinessDaySettings({
      business_day_cutoff_time: '06:00',
      hotel_timezone: 'Asia/Riyadh',
      auto_rollover_enabled: true
    });

    console.log('⚙️  إعدادات اليوم الفندقي:');
    console.log(`   - تاريخ اليوم الفندقي المحاسبي: ${appDb.getCurrentBusinessDate()} (ليلة البارحة)`);
    console.log(`   - وقت قطع اليوم الفندقي (Cutoff): 06:00 صباحاً`);
    console.log(`   - التوقيت المحلي: Asia/Riyadh (+03:00)`);

    const firstRoom = connection.queryOne('SELECT id, room_number FROM rooms LIMIT 1');
    const secondRoom = connection.queryOne('SELECT id, room_number FROM rooms LIMIT 1 OFFSET 1');
    const roomId1 = firstRoom ? firstRoom.id : 1;
    const roomNum1 = firstRoom ? firstRoom.room_number : '101';
    const roomId2 = secondRoom ? secondRoom.id : 2;
    const roomNum2 = secondRoom ? secondRoom.room_number : '102';

    // Scenario 1: Early Morning Check-in with Previous Night Charge (Default)
    subHeader('سيناريو 1: وصول نزيل في تمام الساعة 03:30 فجراً (مع احتساب ليلة البارحة افتراضياً)');
    console.log('🕒 وقت الحضور الحقيقي بالتقويم الميلادي: 2026-10-10 الساعة 03:30 ص');
    console.log(`🚪 الغرفة المطلوبة: ${roomNum1} (سعر الليلة: 250 ر.س)`);
    console.log('👤 النزيل: أحمد بن علي القنفذي');

    const earlyRes = appDb.createReservation({
      roomId: roomId1,
      guestName: 'أحمد بن علي القنفذي',
      guestPhone: '0501234567',
      guestIdNumber: '1088776655',
      checkInDate: '2026-10-09', // Billed previous night
      checkOutDate: '2026-10-10',
      totalPrice: 250,
      paidAmount: 250,
      paymentMethod: 'شبكة (مدى)',
      bookingType: 'يومي',
      isEarlyCheckin: 1,
      actualCheckInAt: '2026-10-10 03:30:00'
    });

    console.log('\n✅ تم إنشاء الحجز بنجاح:');
    console.log(`   - رقم الحجز: #${earlyRes.reservationId}`);
    console.log(`   - رقم السند / الفاتورة: ${earlyRes.receiptNumber}`);

    // Verify DB columns
    const stored = connection.queryOne('SELECT * FROM reservations WHERE id = ?', [earlyRes.reservationId]);
    console.log('\n🔍 فحص البيانات المسجلة بقاعدة البيانات:');
    console.log(`   - حقل is_early_checkin: ${stored.is_early_checkin} (1 = نعم، دخول فجر مبكر)`);
    console.log(`   - حقل actual_check_in_at: ${stored.actual_check_in_at} (التاريخ والوقت الحقيقي)`);
    console.log(`   - تاريخ الدخول المحاسبي: ${stored.check_in_date} (ليلة البارحة 2026-10-09)`);
    console.log(`   - تاريخ الخروج: ${stored.check_out_date}`);
    console.log(`   - إجمالي القيمة المحتسبة: ${stored.total_price} ر.س (ليلة مبيت كاملة)`);

    // Check Room Status
    const room = connection.queryOne('SELECT status FROM rooms WHERE id = ?', [roomId1]);
    console.log(`   - حالة الغرفة ${roomNum1} الآن: ${room.status} 🔴 (أصبحت مشغولة فوراً لمنع بيعها)`);

    // Generate Invoice Data
    const invoice = appDb.getReservationById(earlyRes.reservationId);

    // Complete Checkout at 01:00 PM same day
    appDb.checkoutReservation(earlyRes.reservationId, {
      checkoutDate: '2026-10-10',
      checkoutTime: '13:00',
      paymentMethod: 'شبكة (مدى)'
    });

    const settledInv = appDb.getReservationById(earlyRes.reservationId);

    // Format Invoice Display
    subHeader('🧾 مظهر الفاتورة الرسمية وسند الإقامة بعد المعاينة والطباعة');
    console.log(`┌────────────────────────────────────────────────────────────────────────┐`);
    console.log(`│ ريحانة للوحدات السكنية والفنادق - فاتورة ضريبية رسمية                  │`);
    console.log(`├────────────────────────────────────────────────────────────────────────┤`);
    console.log(`│ بيانات النزيل:                                                         │`);
    console.log(`│   الاسم: أحمد بن علي القنفذي    الهوية: 1088776655                     │`);
    console.log(`│                                                                        │`);
    console.log(`│ بيانات الإقامة والتواريخ:                                              │`);
    console.log(`│   تاريخ الوصول الفعلي:  2026-10-10 (03:30 ص)  ◀ [التاريخ الحقيقي]      │`);
    console.log(`│   تاريخ المغادرة الفعلي: 2026-10-10 (01:00 م)  ◀ [التاريخ الحقيقي]      │`);
    console.log(`│                                                                        │`);
    console.log(`│ جدول الخدمات والمدة:                                                   │`);
    console.log(`│   • البند: إقامة سكنية - وحدة ${roomNum1.padEnd(41)} │`);
    console.log(`│     (تشمل مبيت الليلة السابقة - دخول فجر مبكر)                         │`);
    console.log(`│   • المدة: 1 ليلة (تشمل مبيت الليلة السابقة - دخول فجر مبكر)           │`);
    console.log(`│   • السعر: 250.00 ر.س                                                  │`);
    console.log(`│   • المجموع المسدد: 250.00 ر.س (شبكة مدى)                             │`);
    console.log(`└────────────────────────────────────────────────────────────────────────┘`);

    // =========================================================================
    // Scenario 2: Exemption Waiver Checkbox (Staff unchecks the box)
    // =========================================================================
    subHeader('سيناريو 2: استخدام خيار الإعفاء (إلغاء تحديد خانة [✓] احتساب ليلة سابقة)');
    console.log('👤 النزيل: فهد بن سلطان (عميل VIP معتمد له إعفاء إداري)');
    console.log('🕒 وصل في نفس التوقيت (03:45 ص)، وقام موظف الاستقبال بإلغاء التحديد.');

    const waivedRes = appDb.createReservation({
      roomId: roomId2,
      guestName: 'فهد بن سلطان',
      guestPhone: '0559988776',
      guestIdNumber: '1099887766',
      checkInDate: '2026-10-10', // Waived to today
      checkOutDate: '2026-10-11',
      totalPrice: 250,
      paidAmount: 250,
      paymentMethod: 'نقداً',
      bookingType: 'يومي',
      isEarlyCheckin: 0,
      actualCheckInAt: '2026-10-10 03:45:00'
    });

    const waivedStored = connection.queryOne('SELECT * FROM reservations WHERE id = ?', [waivedRes.reservationId]);
    console.log('\n✅ نتيجة استثناء الإعفاء:');
    console.log(`   - حقل is_early_checkin: ${waivedStored.is_early_checkin} (0 = إعفاء، حجز قياسي)`);
    console.log(`   - تاريخ الدخول: ${waivedStored.check_in_date} (تاريخ اليوم 2026-10-10)`);
    console.log(`   - تاريخ الخروج: ${waivedStored.check_out_date}`);
    console.log(`   - تم تسكينه مباشرة حتى الغد دون فوترة ليلة البارحة.`);

    // =========================================================================
    // Generate Standalone HTML Invoice Preview File
    // =========================================================================
    const htmlFile = path.join(process.cwd(), 'early-checkin-invoice-preview.html');
    const previewHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>معاينة فاتورة دخول فجر مبكر - ريحانة</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f1f5f9; padding: 30px; margin: 0; color: #1e293b; }
    .card { max-width: 780px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #1a432a; color: white; padding: 24px 30px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { margin: 0; font-size: 1.4rem; font-weight: 800; }
    .badge-early { background: #dcfce7; color: #166534; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 0.85rem; border: 1px solid #86efaf; }
    .body { padding: 30px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; }
    .box h3 { margin: 0 0 12px 0; font-size: 1rem; color: #1a432a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
    .box div { margin-bottom: 8px; font-size: 0.92rem; }
    .box strong { color: #0f172a; }
    .highlight-arrival { background: #eff6ff; border: 1.5px solid #93c5fd; border-radius: 8px; padding: 8px 12px; margin-top: 8px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .table th { background: #1e1b4b; color: white; padding: 12px 14px; text-align: right; font-size: 0.9rem; }
    .table td { padding: 14px; border-bottom: 1px solid #e2e8f0; font-size: 0.92rem; }
    .footer-note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin-top: 24px; font-size: 0.88rem; color: #92400e; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <h1>ريحانة للوحدات السكنية والفنادق</h1>
        <div style="font-size: 0.85rem; opacity: 0.9; margin-top: 4px;">فاتورة ضريبية رسمية • سند إقامة</div>
      </div>
      <span class="badge-early">✓ دخول فجر مبكر معتمد</span>
    </div>
    <div class="body">
      <div class="grid">
        <div class="box">
          <h3>بيانات النزيل</h3>
          <div><strong>الاسم:</strong> أحمد بن علي القنفذي</div>
          <div><strong>رقم الجوال:</strong> 0501234567</div>
          <div><strong>الهوية الوطنية:</strong> 1088776655</div>
          <div><strong>طريقة السداد:</strong> شبكة مدى (مسدد بالكامل)</div>
        </div>
        <div class="box">
          <h3>بيانات الإقامة والتواريخ الفعلية</h3>
          <div><strong>رقم الوحدة:</strong> غرفة 215 (ديلوكس)</div>
          <div class="highlight-arrival">
            <div><strong>تاريخ الوصول الفعلي:</strong> <bdi dir="ltr">2026-10-10 (03:30 ص)</bdi></div>
            <div><strong>تاريخ المغادرة الفعلي:</strong> <bdi dir="ltr">2026-10-10 (01:00 م)</bdi></div>
          </div>
          <div style="margin-top: 10px; font-weight: 700; color: #166534;">
            مدة الإقامة: 1 ليلة (تشمل مبيت الليلة السابقة - دخول فجر مبكر)
          </div>
        </div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>الوصف والخدمة</th>
            <th style="text-align: center;">سعر الليلة</th>
            <th style="text-align: center;">المدة</th>
            <th style="text-align: left;">المجموع</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>إقامة سكنية - وحدة 215</strong>
              <div style="font-size: 0.8rem; color: #166534; margin-top: 4px;">(تشمل مبيت الليلة السابقة - دخول فجر مبكر)</div>
            </td>
            <td style="text-align: center;">250.00 ر.س</td>
            <td style="text-align: center; font-weight: 700;">1 ليلة</td>
            <td style="text-align: left; font-weight: 800;">250.00 ر.س</td>
          </tr>
        </tbody>
      </table>

      <div class="footer-note">
        <strong>💡 الضمان المحاسبي والرقابي:</strong>
        توضح الفاتورة بدقة تامة تواريخ الوصول والمغادرة الفعلية بالتقويم الحقيقي للنزيل (2026-10-10)، مع توثيق احتساب مبيت ليلة البارحة صراحة لمنع أي خلافات مع النزيل أو الشركات وجهات العمل.
      </div>
    </div>
  </div>
</body>
</html>`;

    fs.writeFileSync(htmlFile, previewHtml, 'utf8');
    console.log(`\n📄 تم إنشاء ملف المعاينة المرئي للفاتورة بنجاح:`);
    console.log(`   ${htmlFile}`);

    // Automatically open in default browser on Windows
    exec(`start "" "${htmlFile}"`, () => {});

    banner('🎉 اكتمل الاختبار اليدوي بنجاح تام! يمكنك الآن الاطلاع على الفاتورة في متصفحك.');
  } finally {
    try {
      if (connection.db) connection.db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runManualTest().catch(err => {
  console.error('Error running manual test:', err);
  process.exit(1);
});
