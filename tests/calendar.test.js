const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const source=scripts.find(s=>s.includes('const endoCalendar ='));
const ctx=vm.createContext({document:{addEventListener(){}}});vm.runInContext(source+'\nthis.api=endoCalendar;',ctx);const a=ctx.api;
test('inline scripts parse',()=>scripts.forEach(s=>new vm.Script(s)));
test('legacy records and distinct colors',()=>{assert.equal(a.failures({cfs:3}),0);assert.equal(new Set(a.metrics.map(m=>m[3])).size,8)});
test('existing case detail never double counts',()=>{const d=a.mutate({failureCount:2},{type:'save',existing:true,record:{id:'1'}});assert.equal(d.failureCount,2);assert.equal(d.failureCases.length,1);assert.throws(()=>a.mutate({failureCount:0},{type:'save',existing:true,record:{id:'1'}}));});
test('new case, retry and edit counts',()=>{let d=a.mutate({}, {type:'save',record:{id:'1',propofol:0}});d=a.mutate(d,{type:'save',record:{id:'1'}});assert.equal(d.failureCount,1);d=a.mutate(d,{type:'save',edit:true,record:{id:'1',propofol:80}});assert.equal(d.failureCount,1);assert.equal(d.failureCases[0].propofol,80);assert.throws(()=>a.mutate(d,{type:'save',edit:true,record:{id:'missing'}}));});
test('delete decrements once and preserves count-only cases',()=>{let d={failureCount:4,failureCases:[{id:'1'},{id:'2'}]};d=a.mutate(d,{type:'delete',id:'1'});assert.equal(d.failureCount,3);assert.equal(d.failureCases.length,1);d=a.mutate(d,{type:'delete',id:'1'});assert.equal(d.failureCount,3);});
test('count validation',()=>{for(const count of [-1,0,1.5,NaN])assert.throws(()=>a.mutate({failureCases:[{id:'1'}]},{type:'count',count}));assert.equal(a.mutate({}, {type:'count',count:0}).failureCount,0);});
test('aggregation includes failure-only days',()=>{const s=a.sum([{egd:10,cfs:4,cpp:2,clo:3},{failureCount:2},{cfs:3,failureCases:[{id:'1'}]}]);assert.equal(s.egd,10);assert.equal(s.cfs,7);assert.equal(s.failureCount,3);assert.equal(s.cpp,2);});
test('CSV escaping and formula safety',()=>{const csv=a.csv([['기록','a,b','"yes"','line1\nline2','=HYPERLINK("x")',0,null]]);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"a,b"'));assert(csv.includes('""yes""'));assert(csv.includes('"line1\nline2"'));assert(csv.includes("'=HYPERLINK"));assert(csv.endsWith('"0",""'));});
test('HTML escaping and unknown values',()=>{const out=vm.runInContext(`ecCaseHTML({id:'x" onclick="bad',history:'<img src=x onerror=bad>',age:null,propofol:0},'2026-10-27',true)`,ctx);assert(!out.includes('<img'));assert(out.includes('&lt;img'));assert(out.includes('0 mg'));assert(out.includes('나이 미상'));});
test('counter save merges and backup includes registry',()=>{assert.match(html,/adr: existData\.adr \?\? null,\s*\}, \{ merge:true \}\)/);assert.match(html,/days:await readBackupCollection\(currentUid,'days'\)/);});

test('EMR is excluded from CPP in records and summaries',()=>{const d={cpp:1,emr:1};assert.equal(a.value(d,'cppOnly'),0);assert.equal(a.value(d,'emr'),1);const s=a.sum([d,{cpp:4,emr:1}]);assert.equal(a.value(s,'cppOnly'),3);assert.equal(s.emr,2);});

test('unified overview keeps current periods independent of the calendar month',()=>{
 const elements={};const buttons=['today','week','month','all'].map(scope=>({dataset:{scope},setAttribute(k,v){this[k]=v}}));
 const doc={addEventListener(){},getElementById(id){return elements[id]||(elements[id]={});},querySelectorAll(){return buttons}};
 const records=[{key:'2026-10-31',egd:100},{key:'2026-11-10',egd:20},{key:'2026-11-11',egd:3,cpp:3,emr:1},{key:'2026-11-17',egd:5},{key:'2026-11-18',egd:50}];
 const c=vm.createContext({document:doc,allDays:records,TODAY:'2026-11-17',incViewMonth:'2026-10',procedureStats:require('../procedure-stats.js')});
 vm.runInContext(source,c);
 vm.runInContext("ecSetScope('month')",c);assert.equal(elements['ec-period-label'].textContent,'2026년 10월 시술');assert(elements['ec-summary'].innerHTML.includes('100<small>'));
 vm.runInContext("ecSetScope('today')",c);assert(elements['ec-summary'].innerHTML.includes('5<small>'));assert.equal(elements['ec-period-range'].textContent,'2026-11-17');
 vm.runInContext("ecSetScope('week')",c);assert.equal(elements['ec-period-range'].textContent,'2026-11-11 ~ 2026-11-17');assert(elements['ec-summary'].innerHTML.includes('8<small>'));assert(elements['ec-summary'].innerHTML.includes('3<small>'));assert.equal(buttons[1]['aria-pressed'],'true');
 vm.runInContext("ecSetScope('all')",c);assert(elements['ec-summary'].innerHTML.includes('178<small>'));
 c.incViewMonth='2024-02';vm.runInContext("ecSetScope('month')",c);assert.equal(elements['ec-period-range'].textContent,'2024-02-01 ~ 2024-02-29');assert(elements['ec-summary-note'].textContent.includes('기록이 없습니다'));
});
