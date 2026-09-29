/**
 * ريحانة للوحدات السكنية (Rayhana Suites ERP) - سكربت إعادة تعيين وتصفير قاعدة البيانات
 * Wipes the existing SQLite database in AppData and initializes a 100% fresh, clean database.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db');

async function resetDatabase() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  
  // Modern Rayhana Suites database path
  const rayhanaDir = path.join(appData, 'rayhana-suites');
  const targetDbPath = path.join(rayhanaDir, 'rayhana_erp.sqlite');

  // List of all database files to wipe (current + legacy paths)
  const filesToWipe = [
    targetDbPath,
    path.join(rayhanaDir, 'ahmed_hotel_erp.sqlite'),
    path.join(appData, 'ahmed-hotel-erp', 'ahmed_hotel_erp.sqlite'),
    path.join(__dirname, 'database.sqlite')
  ];

  console.log('====================================================');
  console.log('ريحانة للوحدات السكنية | تصفير وبدء قاعدة بيانات جديدة');
  console.log('====================================================');
  console.log('المسار المستهدف لقاعدة البيانات الجديدة:');
  console.log('📍', targetDbPath);
  console.log('');

  // 1. Wipe existing databases
  let deletedCount = 0;
  for (const filePath of filesToWipe) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✓ تم حذف الملف القديم: ${filePath}`);
        deletedCount++;
      } catch (err) {
        console.error(`✗ فشل حذف الملف (${filePath}): ${err.message}`);
        console.error('يرجى التأكد من إغلاق تطبيق ريحانة أولاً قبل تصفير قاعدة البيانات.');
        process.exit(1);
      }
    }
  }

  if (deletedCount === 0) {
    console.log('ℹ لا توجد ملفات قاعدة بيانات قديمة تحتاج للحذف.');
  }

  // 2. Ensure target directory exists
  if (!fs.existsSync(rayhanaDir)) {
    fs.mkdirSync(rayhanaDir, { recursive: true });
  }

  // 3. Initialize fresh clean database with default schema and records
  try {
    await db.init(targetDbPath);
    console.log('');
    console.log('====================================================');
    console.log('✓ تم إنشاء قاعدة بيانات نظيفة وجديدة بالكامل بنجاح!');
    console.log('====================================================');
    console.log('بيانات تسجيل الدخول الافتراضية الجاهزة للاستخدام:');
    console.log('  1) المدير (Admin):   اسم المستخدم: admin  | كلمة المرور: admin');
    console.log('  2) الموظف (Staff):  اسم المستخدم: staff  | كلمة المرور: staff');
    console.log('  3) المستخدم (User):  اسم المستخدم: user   | كلمة المرور: user');
    console.log('');
    console.log('الغرف الفندقية الافتراضية (7 غرف 101-203) تم تعيينها كـ "متاحة" وجاهزة للتسكين.');
    console.log('سجلات النزلاء والحجوزات والمدفوعات: فارغة 100% وجاهزة لبدء العمل الفعلي.');
    console.log('====================================================');
  } catch (err) {
    console.error('✗ حدث خطأ أثناء تهيئة قاعدة البيانات الجديدة:', err);
    process.exit(1);
  }
}

resetDatabase();
