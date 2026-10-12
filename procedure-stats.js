(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.procedureStats = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function assertDateKey(dateKey) {
    if (!DATE_KEY_PATTERN.test(String(dateKey || ''))) {
      throw new TypeError('dateKey must use YYYY-MM-DD format');
    }
  }

  function shiftDateKey(dateKey, dayOffset) {
    assertDateKey(dateKey);
    var parts = dateKey.split('-').map(Number);
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
  }

  function getRollingDateRange(todayKey, dayCount) {
    var days = dayCount == null ? 7 : Number(dayCount);
    assertDateKey(todayKey);
    if (!Number.isInteger(days) || days < 1) {
      throw new TypeError('dayCount must be a positive integer');
    }
    return {
      startKey: shiftDateKey(todayKey, -(days - 1)),
      endKey: todayKey
    };
  }

  function isDateKeyInRange(dateKey, range) {
    return DATE_KEY_PATTERN.test(String(dateKey || ''))
      && dateKey >= range.startKey
      && dateKey <= range.endKey;
  }

  function buildProcedurePeriods(rows, todayKey) {
    var sourceRows = Array.isArray(rows) ? rows : [];
    var range = getRollingDateRange(todayKey, 7);
    var monthKey = todayKey.slice(0, 7);
    return {
      range: range,
      todayRec: sourceRows.find(function (row) {
        return row && row.key === todayKey;
      }) || {},
      weekRows: sourceRows.filter(function (row) {
        return row && isDateKeyInRange(row.key, range);
      }),
      monthRows: sourceRows.filter(function (row) {
        if (!row) return false;
        return (row.month || String(row.key || '').slice(0, 7)) === monthKey;
      })
    };
  }

  function normalizeCount(value) {
    var count = Number(value);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  // 이 앱에서는 CPP와 대장 Bx-C를 모두 용종 처치 건수로 센다.
  // 병리에서 확인된 adenoma 수(ADR)도 PDR의 하한으로 사용한다.
  function getSuggestedPdrCount(rec) {
    if (!rec) return 0;
    var treatedPolyps = normalizeCount(rec.cpp) + normalizeCount(rec.bxc);
    return Math.max(treatedPolyps, normalizeCount(rec.adr));
  }

  function getPdrCount(rec) {
    if (!rec) return 0;
    var saved = rec.pdr == null ? null : normalizeCount(rec.pdr);
    var suggested = getSuggestedPdrCount(rec);
    if (rec.pdrAuto !== true && saved !== null) {
      return Math.max(saved, suggested);
    }
    return Math.max(saved == null ? 0 : saved, suggested);
  }

  function buildPdrSaveState(previous, cpp, bxc, adr) {
    var prev = previous || {};
    var cppCount = normalizeCount(cpp);
    var bxcCount = normalizeCount(bxc);
    var adrCount = normalizeCount(adr);
    var minimum = Math.max(cppCount + bxcCount, adrCount);
    if (prev.pdrAuto === false && prev.pdr != null) {
      return {
        pdr: Math.max(normalizeCount(prev.pdr), minimum),
        pdrAuto: false
      };
    }
    return { pdr: minimum, pdrAuto: true };
  }

  return {
    shiftDateKey: shiftDateKey,
    getRollingDateRange: getRollingDateRange,
    isDateKeyInRange: isDateKeyInRange,
    buildProcedurePeriods: buildProcedurePeriods,
    getSuggestedPdrCount: getSuggestedPdrCount,
    getPdrCount: getPdrCount,
    buildPdrSaveState: buildPdrSaveState
  };
}));
