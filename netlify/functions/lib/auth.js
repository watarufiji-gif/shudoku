'use strict';

const { timingSafeEqual } = require('node:crypto');

// admin.js / admin-stats.js と同じ認証方式（ADMIN_PASSWORD をBearerトークンとして使う）。
function checkAuth(event) {
  const password = process.env.ADMIN_PASSWORD || '';
  if (!password) return false;
  const provided = (event.headers['authorization'] || event.headers['Authorization'] || '').replace(
    /^Bearer\s+/,
    ''
  );
  if (!provided) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(password));
  } catch {
    return false;
  }
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unauthorized' }),
  };
}

module.exports = { checkAuth, unauthorized };
