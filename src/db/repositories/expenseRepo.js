const db = require('../database');

const VALID_CATEGORIES = ['rent', 'electricity', 'salary', 'marketing', 'other'];

function mapExpense(r) {
  if (!r) return null;
  const d = r.expense_date instanceof Date
    ? r.expense_date.toISOString().slice(0, 10)
    : String(r.expense_date || '').slice(0, 10);
  return { ...r, id: Number(r.id), amount: Number(r.amount || 0), expense_date: d };
}

async function findAll() {
  const rows = await db.queryAll('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC');
  return rows.map(mapExpense);
}

async function create(b) {
  const title = String(b.title || '').trim().slice(0, 120);
  const category = VALID_CATEGORIES.includes(b.category) ? b.category : 'other';
  const amount = Math.max(0, Number(b.amount) || 0);
  const note = String(b.note || '').trim().slice(0, 300);
  const expense_date = /^\d{4}-\d{2}-\d{2}$/.test(String(b.expense_date || ''))
    ? b.expense_date
    : new Date().toISOString().slice(0, 10);

  const id = await db.insertReturningId(
    'INSERT INTO expenses (title, category, amount, note, expense_date) VALUES (?, ?, ?, ?, ?)',
    [title, category, amount, note, expense_date]
  );
  return mapExpense(await db.queryGet('SELECT * FROM expenses WHERE id=?', [id]));
}

async function remove(id) {
  const r = await db.execute('DELETE FROM expenses WHERE id=?', [id]);
  return r.changes > 0;
}

module.exports = { findAll, create, remove, VALID_CATEGORIES };
