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

test('PDR is the exact arithmetic sum, independent of old manual values and ADR', () => {
  for (const rec of [
    {cpp:3,bxc:2,pdr:99,pdrAuto:false,adr:20},
    {cpp:3,bxc:2,pdr:0,pdrAuto:true},
    {cpp:'3',bxc:'2'}
  ]) assert.equal(getPdrCount(rec),5);
  assert.equal(getSuggestedPdrCount({cpp:0,bxc:0,adr:4}),0);
  assert.deepEqual(buildPdrSaveState({pdr:99,pdrAuto:false},2,1,20),{pdr:3,pdrAuto:true});
});

test('reductions, cleared inputs and stored EMR-inclusive CPP do not retain stale PDR', () => {
  assert.equal(getPdrCount({cpp:4,emr:1,bxc:2}),6);
  assert.equal(getPdrCount({cpp:1,emr:1,bxc:0,pdr:6}),1);
  assert.equal(getPdrCount({cpp:'',bxc:'',pdr:6}),0);
});
