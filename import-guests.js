/**
 * أداة استيراد وربط بيانات العملاء من ملف CSV / Excel
 * نظام ريحانة للوحدات السكنية (Rayhana Suites ERP)
 * 
 * الاستخدام:
 * ضع ملفك باسم guests.csv في نفس المجلد وشغل:
 * node import-guests.js
 * أو حدد مسار الملف:
 * node import-guests.js "C:\path\to\your_file.csv"
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// تحديد مسار قاعدة البيانات
const defaultAppData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
const dbDir = path.join(defaultAppData, 'rayhana-suites');
const dbPath = path.join(dbDir, 'rayhana_erp.sqlite');

const db = require('./db.js');

async function run() {
  console.log('====================================================');
  console.log('  ريحانة للوحدات السكنية - أداة استيراد وربط بيانات العملاء');
  console.log('====================================================\n');

  // تحديد ملف الـ CSV المراد قراءته
  const targetFile = process.argv[2] || path.join(__dirname, 'guests.csv');

  if (!fs.existsSync(targetFile)) {
    console.error(`❌ لم يتم العثور على الملف: ${targetFile}`);
    console.log('\n💡 طريقة الاستخدام:');
    console.log('1. ضع ملف الـ CSV في هذا المجلد وقم بتسميته "guests.csv"');
    console.log('2. أو شغل الأمر مع تمرير مسار الملف:');
    console.log('   node import-guests.js "C:\\Users\\...\\customers.csv"\n');
    process.exit(1);
  }

  console.log(`📂 جاري قراءة الملف: ${targetFile}`);

  try {
    // تهيئة قاعدة البيانات
    await db.init(dbPath);

    // قراءة الملف عبر SheetJS (يدعم CSV و Excel UTF-8 و ANSI)
    const fileBuffer = fs.readFileSync(targetFile);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (!rows || rows.length === 0) {
      console.error('❌ الملف فارغ أو لا يحتوي على صفوف بيانات.');
      process.exit(1);
    }

    console.log(`📊 تم العثور على ${rows.length} صف في الملف. جاري المعالجة والربط...\n`);

    // معاينة أول سطر
    console.log('عينة من الأعمدة المقروءة من السطر الأول:');
    console.log(rows[0]);
    console.log('----------------------------------------------------');

    // استيراد النزلاء وربطهم
    const result = db.bulkImportGuests(rows);

    console.log('\n✅ اكتملت عملية الاستيراد والربط بنجاح!');
    console.log(`   - تم إدخال عملاء جدد: ${result.inserted}`);
    console.log(`   - تم تحديث بيانات عملاء مسجلين: ${result.updated || 0}`);
    console.log(`   - تم تخطي صفوف غير مكتملة/فارغة: ${result.skipped}`);
    console.log(`   - إجمالي الصفوف المعالجة: ${result.total}`);

    console.log('\n✨ يمكنك الآن فتح البرنامج والذهاب إلى "قائمة النزلاء" لرؤية جميع العملاء.');
  } catch (err) {
    console.error('\n❌ حدث خطأ أثناء عملية الاستيراد:', err.message);
  }
}

run();
