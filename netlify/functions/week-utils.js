'use strict';

// script.js の getWeekStartSaturdayJst / getWeekNumberForDate と同一ロジック（Node.js 版）
// サイト表示の週番号と管理画面の集計週番号を一致させるために共通化している。

const DAY_MS = 24 * 60 * 60 * 1000;

function toJstDateOnly(date) {
  const jstMs = date.getTime() + 9 * 60 * 60 * 1000;
  const jst = new Date(jstMs);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function getWeekStartSaturdayJst(date) {
  const jstDateOnly = toJstDateOnly(date);
  const dayOfWeek = jstDateOnly.getUTCDay(); // 0:Sun ... 6:Sat
  const daysFromSaturday = (dayOfWeek + 1) % 7; // Sat:0, Sun:1 ... Fri:6
  return new Date(jstDateOnly.getTime() - daysFromSaturday * DAY_MS);
}

function getWeekNumberForDate(date) {
  const jstDate = toJstDateOnly(date);
  const year = jstDate.getUTCFullYear();
  const firstSaturday = new Date(Date.UTC(year, 0, 1));
  const offsetToSaturday = (6 - firstSaturday.getUTCDay() + 7) % 7;
  firstSaturday.setUTCDate(firstSaturday.getUTCDate() + offsetToSaturday);
  const diffMs = jstDate.getTime() - firstSaturday.getTime();
  if (diffMs < 0) return 1;
  return Math.floor(diffMs / (7 * DAY_MS)) + 1;
}

module.exports = { getWeekStartSaturdayJst, getWeekNumberForDate };
