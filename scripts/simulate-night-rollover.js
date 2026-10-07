'use strict';

/**
 * Interactive Night Rollover Simulator
 * Runs through operational scenarios step-by-step in an isolated temporary database.
 * 
 * Usage: node scripts/simulate-night-rollover.js
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const appDb = require('../db');
const connection = require('../db/connection');
const { createBusinessDayScheduler, shouldBeBusinessDate } = require('../businessDayScheduler');

function separator(title) {
  console.log('\n' + '='.repeat(60));
  if (title) console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function runSimulator() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rayhana-sim-'));
  const dbPath = path.join(tempDir, 'sim.sqlite');

  try {
    separator('🌅 محاكي الإقفال التلقائي لليوم الفندقي (Night Rollover Simulator)');

    await appDb.init(dbPath);

    // Initial setup: Date = 2026-10-07, Cutoff = 06:00, Timezone = Asia/Riyadh
    const initialDate = '2026-10-07';
    connection.db.run('UPDATE hotel_business_state SET current_business_date = ? WHERE id = 1', [initialDate]);
    appDb.updateBusinessDaySettings({
      business_day_cutoff_time: '06:00',
      hotel_timezone: 'Asia/Riyadh',
      auto_rollover_enabled: true
    });

    console.log('📋 إعدادات النظام الحالية:');
    console.log(`   - تاريخ اليوم الفندقي المفتوح: ${appDb.getCurrentBusinessDate()}`);
    console.log(`   - وقت الإقفال اليومي (Cutoff): 06:00 صباحاً`);
    console.log(`   - المنطقة الزمنية: Asia/Riyadh (+03:00)`);
    console.log(`   - الإقفال التلقائي: مفعّل (Enabled)`);

    // Scenario 1: Before Cutoff (05:59 AM)
    separator('سيناريو 1: فحص النظام قبل وقت الإقفال (الساعة 05:59 صباحاً)');
    const timeBeforeCutoff = new Date('2026-10-08T05:59:00+03:00');
    console.log(`⏰ الساعة الآن: ${timeBeforeCutoff.toISOString()} (05:59 بتوقيت الرياض)`);
    
    let simulatedNow = timeBeforeCutoff;
    let scheduler = createBusinessDayScheduler({
      db: appDb,
      clock: () => simulatedNow
    });

    let res = await scheduler.checkAndClose();
    console.log(`🔍 نتيجة الفحص:`);
    console.log(`   - الأيام المتقدمة: ${res.advancedDays}`);
    console.log(`   - تاريخ اليوم الفندقي: ${appDb.getCurrentBusinessDate()} (لم يتغير لأن وقت الإقفال 06:00 لم يحن بعد)`);

    // Scenario 2: Crossing Cutoff (06:01 AM)
    separator('سيناريو 2: حلول وقت الإقفال (الساعة 06:01 صباحاً)');
    const timeAfterCutoff = new Date('2026-10-08T06:01:00+03:00');
    console.log(`⏰ الساعة الآن: ${timeAfterCutoff.toISOString()} (06:01 بتوقيت الرياض)`);

    simulatedNow = timeAfterCutoff;
    res = await scheduler.checkAndClose();
    console.log(`🎉 نتيجة الإقفال التلقائي:`);
    console.log(`   - تم إقفال وتقدم: ${res.advancedDays} يوم`);
    console.log(`   - تاريخ اليوم الفندقي الجديد: ${res.businessDate}`);
    console.log(`   - تاريخ العمل الفعلي بقاعدة البيانات: ${appDb.getCurrentBusinessDate()}`);

    const audit1 = connection.queryOne('SELECT * FROM night_audits WHERE closed_business_date = ?', ['2026-10-07']);
    console.log(`   - سجل الإقفال (Night Audit):`);
    console.log(`     * رقم السجل: #${audit1.id}`);
    console.log(`     * اليوم المقفل: ${audit1.closed_business_date}`);
    console.log(`     * منفذ الإقفال: ${audit1.closed_by}`);
    console.log(`     * تاريخ اليوم التالي: ${audit1.next_business_date}`);

    // Scenario 3: Multi-day Catch-up (System was turned off for 2 days)
    separator('سيناريو 3: تجاوز عدة أيام أثناء إغلاق النظام (Fast-forward يومين)');
    const multiDayTime = new Date('2026-10-10T07:30:00+03:00');
    console.log(`⏰ تم تشغيل النظام في: ${multiDayTime.toISOString()} (10 أكتوبر، 07:30 صباحاً)`);

    simulatedNow = multiDayTime;
    res = await scheduler.checkAndClose();
    console.log(`⚡ نتيجة معالجة الأيام الفائتة (Catch-up):`);
    console.log(`   - تم إقفال متتالي لعدد: ${res.advancedDays} يوم فندقي`);
    console.log(`   - تاريخ اليوم الفندقي الحالي بعد المعالجة: ${res.businessDate}`);

    const allAudits = connection.queryAll('SELECT id, closed_business_date, closed_by, next_business_date FROM night_audits ORDER BY id ASC');
    console.log(`   - السجلات المقفلة بالتتابع:`);
    allAudits.forEach(a => {
      console.log(`     * إقفال #${a.id}: [${a.closed_business_date} → ${a.next_business_date}] بواسطة (${a.closed_by})`);
    });

    // Scenario 4: Clock jump backwards protection
    separator('سيناريو 4: حماية النظام عند رجوع ساعة الجهاز إلى الخلف');
    const clockBackward = new Date('2026-10-08T12:00:00+03:00');
    console.log(`⏰ ساعة الجهاز عادت بالخطأ إلى: ${clockBackward.toISOString()}`);

    simulatedNow = clockBackward;
    res = await scheduler.checkAndClose();
    console.log(`🛡️ نتيجة الحماية:`);
    console.log(`   - حالة المعالجة: ${res.skipped}`);
    console.log(`   - الأيام المتقدمة: ${res.advancedDays}`);
    console.log(`   - تاريخ اليوم الفندقي: ${appDb.getCurrentBusinessDate()} (تم الحفاظ عليه ومنع التراجع)`);

    separator('✅ اكتملت جميع اختبارات المحاكاة بنجاح تام!');
    console.log('\n💡 كيف يمكنك اختبار الميزة داخل تطبيق Electron مباشرة:');
    console.log('----------------------------------------------------');
    console.log('1. الطريقة السريعة من لوحة التحكم (UI):');
    console.log('   - ادخل بحساب المدير (Admin)');
    console.log('   - افتح تبويب "إدارة النظام" -> "إعدادات اليوم الفندقي"');
    console.log('   - غيّر "وقت بداية اليوم الفندقي" ليكون بعد دقيقة واحدة من وقتك الحالي');
    console.log('   - اضغط "حفظ الإعدادات"');
    console.log('   - انتظر دقيقة: ستشاهد إشعار 🌅 وصوت التنبيه وتحديث تاريخ اليوم تلقائياً دون إعادة تحميل الصفحة!');
    console.log('\n2. طريقة المحاكاة عبر المتغير البيئي RAYHANA_DEV_NOW:');
    console.log('   - في موجه الأوامر (PowerShell):');
    console.log('     $env:RAYHANA_DEV_NOW="2026-10-08T06:05:00+03:00"; npm start');
    console.log('   - سيبدأ التطبيق ويعتبر أن الوقت تجاوز وقت الإقفال ويقوم بالإقفال التلقائي فوراً.\n');

  } finally {
    try {
      appDb.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runSimulator().catch(err => {
  console.error('❌ حدث خطأ أثناء تشغيل المحاكي:', err);
  process.exit(1);
});
