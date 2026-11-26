const db = require('../supabase');

const VALID_CATEGORIES = ['rent', 'electricity', 'salary', 'marketing', 'other'];

async function findAll() {
  return db.selectRows('expenses', { order: 'expense_date.desc,id.desc' });
}

async function create(body) {
  const title = String(body.title || '').trim().slice(0, 120);
  const category = VALID_CATEGORIES.includes(body.category) ? body.category : 'other';
  const amount = Math.max(0, Number(body.amount) || 0);
  const note = String(body.note || '').trim().slice(0, 300);
  const expense_date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.expense_date || ''))
    ? body.expense_date
    : new Date().toISOString().slice(0, 10);
  return db.insertOne('expenses', { title, category, amount, note, expense_date });
}

async function remove(id) {
  return (await db.deleteRows('expenses', { id: `eq.${id}` })) > 0;
}

module.exports = { findAll, create, remove, VALID_CATEGORIES };
