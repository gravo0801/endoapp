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

  // 구버전은 입력 CPP에 EMR을 더해 저장하고, 불러올 때 다시 뺐다.
  // 원래 입력한 CPP를 복원한다. 저장 원본은 변경하지 않으며 신버전 저장에는 표식을 남긴다.
  function normalizeRecord(rec) {
    if (!rec || rec.cppInputIncludesEmr === true) return rec;
    var next=Object.assign({},rec,{cppInputIncludesEmr:true});
    var pmEmr=normalizeCount(rec.pm_emr);
    var emr=rec.emr!=null?normalizeCount(rec.emr):normalizeCount(rec.am_emr)+pmEmr;
    var amEmr=rec.am_emr!=null?normalizeCount(rec.am_emr):Math.max(0,emr-pmEmr);
    if(rec.cpp!=null)next.cpp=Math.max(0,normalizeCount(rec.cpp)-emr);
    if(rec.am_cpp!=null)next.am_cpp=Math.max(0,normalizeCount(rec.am_cpp)-amEmr);
    if(rec.pm_cpp!=null)next.pm_cpp=Math.max(0,normalizeCount(rec.pm_cpp)-pmEmr);
    if(rec.pts!=null)next.pts=Math.max(0,Math.round((normalizeCount(rec.pts)-emr)*10)/10);
    return next;
  }

  // CPP 입력값 자체가 EMR을 포함한 용종절제 합계다. EMR은 재가산하지 않는다.
  function getProcedureTotal(rec, key) {
    if (!rec) return 0;
    if (rec[key] != null) return normalizeCount(rec[key]);
    return normalizeCount(rec['am_'+key]) + normalizeCount(rec['pm_'+key]);
  }
  function getSuggestedPdrCount(rec) {
    rec=normalizeRecord(rec);
    return getProcedureTotal(rec, 'cpp') + getProcedureTotal(rec, 'bxc');
  }
  function getPdrCount(rec) {
    if (rec && rec.pdrSchemaVersion === 2 && rec.pdrAuto === false && rec.pdr != null) return normalizeCount(rec.pdr);
    return getSuggestedPdrCount(rec);
  }
  function getPdrSplit(rec) {
    rec=normalizeRecord(rec)||{};
    var total=getPdrCount(rec);
    var pmAuto=normalizeCount(rec.pm_cpp)+normalizeCount(rec.pm_bxc);
    var amAuto=getSuggestedPdrCount(rec)-pmAuto;
    if(rec.pdrSchemaVersion===2 && rec.pdrAuto===false){
      var pm=Math.min(total,rec.pm_pdrAuto===false ? normalizeCount(rec.pm_pdr) : pmAuto);
      var am=total-pm;
      return {am:am,pm:pm,amAuto:rec.am_pdrAuto!==false && am===amAuto,pmAuto:rec.pm_pdrAuto!==false && pm===pmAuto};
    }
    return {am:Math.max(0,amAuto),pm:pmAuto,amAuto:true,pmAuto:true};
  }
  function buildPdrSaveState(previous, cpp, bxc, adr) {
    var rec=Object.assign({},previous,{cpp:cpp,bxc:bxc,cppInputIncludesEmr:true});
    return {pdr:getPdrCount(rec),pdrAuto:!(rec.pdrSchemaVersion===2 && rec.pdrAuto===false)};
  }

  return {
    shiftDateKey: shiftDateKey,
    getRollingDateRange: getRollingDateRange,
    isDateKeyInRange: isDateKeyInRange,
    buildProcedurePeriods: buildProcedurePeriods,
    getSuggestedPdrCount: getSuggestedPdrCount,
    getPdrCount: getPdrCount,
    getPdrSplit: getPdrSplit,
    normalizeRecord: normalizeRecord,
    buildPdrSaveState: buildPdrSaveState
  };
}));
