const db = require('../database');

function mapAccount(r) {
  if (!r) return null;
  return {
    ...r,
    is_vip: r.is_vip === true || Number(r.is_vip) === 1,
  };
}

async function findByEmail(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) return null;
  return mapAccount(await db.queryGet('SELECT * FROM customer_accounts WHERE email=?', [norm]));
}

async function upsertGoogle({ email, sub, name, picture }) {
  const norm = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim().slice(0, 100);
  const cleanPic = String(picture || '').trim().slice(0, 400);
  const cleanSub = String(sub || '').trim().slice(0, 100);
  await db.execute(
    `INSERT INTO customer_accounts(email, google_sub, name, picture) VALUES(?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       google_sub=excluded.google_sub,
       name=CASE WHEN customer_accounts.name = '' THEN excluded.name ELSE customer_accounts.name END,
       picture=excluded.picture`,
    [norm, cleanSub, cleanName, cleanPic]
  );
  return await findByEmail(norm);
}

async function updateProfile(email, { name, phone, governorate, address }) {
  const norm = String(email || '').trim().toLowerCase();
  await db.execute(
    `UPDATE customer_accounts SET name=?, phone=?, governorate=?, address=? WHERE email=?`,
    [
      String(name || '').trim().slice(0, 100),
      String(phone || '').trim().slice(0, 30),
      String(governorate || '').trim().slice(0, 60),
      String(address || '').trim().slice(0, 250),
      norm,
    ]
  );
  return await findByEmail(norm);
}

async function setVip(email, isVip) {
  const norm = String(email || '').trim().toLowerCase();
  await db.execute('UPDATE customer_accounts SET is_vip=? WHERE email=?', [db.isPg ? !!isVip : (isVip ? 1 : 0), norm]);
  return await findByEmail(norm);
}

async function findAll() {
  const rows = await db.queryAll('SELECT * FROM customer_accounts ORDER BY created_at DESC');
  return rows.map(mapAccount);
}

async function findVipNames() {
  const rows = await db.queryAll(
    'SELECT name FROM customer_accounts WHERE is_vip=? ORDER BY created_at DESC',
    [db.isPg ? true : 1]
  );
  return rows.map(r => r.name).filter(Boolean);
}

module.exports = { findByEmail, upsertGoogle, updateProfile, setVip, findAll, findVipNames };
