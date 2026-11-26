const { initDatabase } = require('../src/db/database');
const { handleRequest } = require('../src/app');

let initPromise = null;

module.exports = async (req, res) => {
  if (!initPromise) {
    initPromise = initDatabase().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return handleRequest(req, res);
};
