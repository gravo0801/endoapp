const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRollingDateRange,
  buildProcedurePeriods,
  getSuggestedPdrCount,
  getPdrCount,
  buildPdrSaveState
} = require('../procedure-stats.js');

test('weekly range includes today and the preceding six dates', () => {
  assert.deepEqual(getRollingDateRange('2026-08-31'), {
    startKey: '2026-08-25',
    endKey: '2026-08-31'
  });
});

test('weekly range remains correct across month and leap-year boundaries', () => {
  assert.deepEqual(getRollingDateRange('2024-03-01'), {
    startKey: '2024-02-24',
    endKey: '2024-03-01'
  });
});

test('procedure periods separate today, recent seven days, and current month', () => {
  const rows = [
    { key: '2026-08-24', month: '2026-08', egd: 100 },
    { key: '2026-08-25', month: '2026-08', egd: 5 },
    { key: '2026-08-28', month: '2026-08', egd: 7 },
    { key: '2026-08-31', month: '2026-08', egd: 31 },
    { key: '2026-09-01', month: '2026-09', egd: 999 },
    { key: 'not-a-date', month: '2026-08', egd: 999 }
  ];

  const periods = buildProcedurePeriods(rows, '2026-08-31');
  assert.equal(periods.todayRec.egd, 31);
  assert.deepEqual(periods.weekRows.map((row) => row.key), [
    '2026-08-25',
    '2026-08-28',
    '2026-08-31'
  ]);
  assert.deepEqual(periods.monthRows.map((row) => row.key), [
    '2026-08-24',
    '2026-08-25',
    '2026-08-28',
    '2026-08-31',
    'not-a-date'
  ]);
});

test('automatic PDR uses ADR as a lower bound when CPP and Bx-C are zero', () => {
  const record = { cpp: 0, bxc: 0, adr: 4, pdr: 0, pdrAuto: true };
  assert.equal(getSuggestedPdrCount(record), 4);
  assert.equal(getPdrCount(record), 4);
});

test('automatic PDR keeps a larger CPP count', () => {
  assert.equal(getPdrCount({ cpp: 5, bxc: 0, adr: 3, pdr: 5, pdrAuto: true }), 5);
});

test('automatic PDR counts both CPP and colon biopsy', () => {
  assert.equal(getSuggestedPdrCount({ cpp: 3, bxc: 2, adr: 0 }), 5);
  assert.equal(getPdrCount({ cpp: 3, bxc: 2, adr: 0, pdr: 3, pdrAuto: true }), 5);
});

test('manual PDR survives later counter saves', () => {
  assert.deepEqual(
    buildPdrSaveState({ pdr: 6, pdrAuto: false, adr: 4 }, 2, 1, 4),
    { pdr: 6, pdrAuto: false }
  );
});

test('manual PDR is raised when later ADR proves a higher minimum', () => {
  assert.deepEqual(
    buildPdrSaveState({ pdr: 2, pdrAuto: false }, 0, 0, 4),
    { pdr: 4, pdrAuto: false }
  );
});

test('saved manual PDR is raised to CPP plus Bx-C minimum', () => {
  assert.deepEqual(
    buildPdrSaveState({ pdr: 2, pdrAuto: false }, 2, 3, 0),
    { pdr: 5, pdrAuto: false }
  );
});
