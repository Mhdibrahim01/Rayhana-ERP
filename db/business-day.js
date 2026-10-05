/**
 * Hotel Business Date and Night Audit operations.
 * The persisted business date advances only after the audit transaction commits.
 */

const connection = require('./connection');
const { autoUpdateRoomStatuses } = require('./rooms');

function addCalendarDay(isoDate) {
  const value = String(isoDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('تاريخ العمل الحالي غير صالح.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('تاريخ العمل الحالي غير صالح.');
  }
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function runNightAudit(userId, expectedBusinessDate) {
  const database = connection.getDb();
  if (!database) throw new Error('قاعدة البيانات غير مهيأة.');

  const actorId = Number.parseInt(userId, 10);
  if (!Number.isInteger(actorId) || actorId <= 0) throw new Error('تعذر تحديد الموظف المنفذ لإقفال اليوم.');

  const previousSnapshot = database.export();
  let transactionCommitted = false;
  database.run('BEGIN TRANSACTION');
  try {
    const state = connection.getCurrentBusinessState();
    const closedDate = state.current_business_date;
    if (expectedBusinessDate && expectedBusinessDate !== closedDate) {
      throw new Error('تغير تاريخ العمل منذ فتح التقرير. حدّث التقرير ثم أعد المحاولة.');
    }

    const existingAudit = connection.queryOne(
      'SELECT id FROM night_audits WHERE closed_business_date = ?',
      [closedDate]
    );
    if (existingAudit) throw new Error('تم إقفال هذا اليوم الفندقي مسبقاً.');

    const nextDate = addCalendarDay(closedDate);
    const payments = connection.queryOne(`
      SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS net,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refunded
      FROM payments WHERE business_date = ? AND payment_method != 'من التأمين'
    `, [closedDate]);
    const paymentsByMethod = connection.queryAll(`
      SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS net
      FROM payments WHERE business_date = ? AND payment_method != 'من التأمين'
      GROUP BY payment_method
    `, [closedDate]);
    const deposits = connection.queryOne(`
      SELECT COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN movement_type IN ('collected', 'reconciled') THEN amount ELSE -amount END), 0) AS net
      FROM deposit_movements WHERE business_date = ?
    `, [closedDate]);

    const summary = {
      paymentCount: Number(payments?.count || 0),
      paymentNet: connection.roundMoney(payments?.net || 0),
      paymentsCollected: connection.roundMoney(payments?.collected || 0),
      paymentsRefunded: connection.roundMoney(payments?.refunded || 0),
      paymentsByMethod: Object.fromEntries(paymentsByMethod.map(row => [row.payment_method, {
        count: Number(row.count || 0),
        net: connection.roundMoney(row.net || 0)
      }])),
      depositMovementCount: Number(deposits?.count || 0),
      depositNet: connection.roundMoney(deposits?.net || 0)
    };

    const insertAudit = database.prepare(`
      INSERT INTO night_audits (
        closed_business_date, business_date, next_business_date, user_id,
        payment_count, payment_net, deposit_movement_count, deposit_net, summary_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run([
      closedDate,
      closedDate,
      nextDate,
      actorId,
      summary.paymentCount,
      summary.paymentNet,
      summary.depositMovementCount,
      summary.depositNet,
      JSON.stringify(summary)
    ]);
    insertAudit.free();

    const updateState = database.prepare(`
      UPDATE hotel_business_state
      SET current_business_date = ?, last_audit_at = CURRENT_TIMESTAMP,
          last_audit_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1 AND current_business_date = ?
    `);
    updateState.run([nextDate, actorId, closedDate]);
    updateState.free();

    const changed = connection.queryOne('SELECT changes() AS count')?.count || 0;
    if (Number(changed) !== 1) throw new Error('لم يتغير تاريخ العمل؛ لم يتم إقفال اليوم.');

    // Reconcile the room statuses against the newly opened date in the same
    // transaction; this also records any newly reached arrival dates.
    autoUpdateRoomStatuses(nextDate, { persist: false });

    database.run('COMMIT');
    transactionCommitted = true;
    if (!connection.saveToFile()) {
      connection.restoreInMemorySnapshot(previousSnapshot);
      throw new Error('تعذر حفظ إقفال اليوم إلى ملف قاعدة البيانات؛ تم إلغاء التغيير.');
    }

    return {
      success: true,
      closedBusinessDate: closedDate,
      currentBusinessDate: nextDate,
      audit: connection.queryOne('SELECT * FROM night_audits WHERE closed_business_date = ?', [closedDate])
    };
  } catch (err) {
    if (!transactionCommitted) {
      try { database.run('ROLLBACK'); } catch (_) {}
    }
    throw err;
  }
}

module.exports = { runNightAudit, addCalendarDay };
