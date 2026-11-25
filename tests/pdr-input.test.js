const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function source(name,next){const a=html.indexOf('function '+name+'(');return html.slice(a,html.indexOf('function '+next+'(',a)).replace(/async\s*$/,'');}
function setup(){
 const els={};const element=id=>els[id]||(els[id]={value:0,dataset:{},textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}}});
 const c=vm.createContext({document:{getElementById:element},procedureStats:require('../procedure-stats.js'),getPdrCount:require('../procedure-stats.js').getPdrCount,currentSession:'am',allDays:[],currentUid:'test',toast(){},sedationData(){return {}},sedationSum(){},loadAllDays:async()=>{}});
 for(const [name,next] of [['syncCounterPdr','switchSession'],['adjInc','syncCounterPdr'],['calcTodayPts','loadDayData'],['loadDayData','saveDay'],['saveDay','updateStats'],['adjEditPdr','syncEditPdr'],['syncEditPdr','closeModal'],['saveEdit','delDay']]){
  let code=source(name,next);if(['loadDayData','saveDay','saveEdit'].includes(name))code='async '+code;
  vm.runInContext(code,c);
 }
 // Use the production loader that separates stored CPP+EMR for the input fields.
 vm.runInContext(source('sedationLoad','sedationSum'),c);
 return {c,element};
}
test('typing and +/- update the sum in both directions and in separate sessions',()=>{
 const {c,element:e}=setup();
 for(const t of ['am','pm']){
  e('vcpp_'+t).value=3;e('vemr_'+t).value=1;e('vbc_'+t).value=2;e('vpdr_'+t).value=99;
  const handler=html.match(new RegExp('id="vbc_'+t+'"[^>]*oninput="([^"]+)"'))[1];
  vm.runInContext(handler,c);assert.equal(e('vpdr_'+t).value,5);
  vm.runInContext(`adjInc('vcpp_${t}',-1)`,c);assert.equal(e('vpdr_'+t).value,4);
  e('vbc_'+t).value='';e('vcpp_'+t).value=0;e('vemr_'+t).value=0;
  vm.runInContext(handler,c);assert.equal(e('vpdr_'+t).value,0);
 }
});
test('loading stale manual totals recalculates from each session without double-counting EMR',async()=>{
 const {c,element:e}=setup();c.allDays=[{key:'2026-11-25',am_egd:10,am_cpp:4,am_emr:1,am_bxc:2,pm_cpp:2,pm_emr:1,pm_bxc:1,cpp:6,emr:2,bxc:3,pdr:99,am_pdr:80,pm_pdr:19}];
 await vm.runInContext("loadDayData('2026-11-25')",c);
 assert.equal(e('vcpp_am').value,3);assert.equal(e('vpdr_am').value,5);assert.equal(e('vpdr_pm').value,2);
});
test('save recalculates the sum instead of trusting the displayed total',async()=>{
 const {c,element:e}=setup();let saved;
 c.daysCol=()=>({doc:()=>({get:async()=>({exists:true,data:()=>({adr:30,failureCount:1})}),set:async(data,opts)=>{saved={data,opts}}})});
 c.loadDayData=()=>{};e('inp-date').value='2026-11-25';e('vcpp_am').value=3;e('vemr_am').value=1;e('vbc_am').value=2;e('vbc_pm').value=1;e('vpdr_am').value=99;
 await vm.runInContext('saveDay()',c);
 assert.equal(saved.data.pdr,6);assert.equal(saved.data.am_pdr,5);assert.equal(saved.data.pm_pdr,1);assert.equal(saved.data.pdrAuto,true);assert.equal(saved.data.adr,30);assert.equal(saved.opts.merge,true);
});
test('edit preview and persisted morning/afternoon totals derive from matching components',async()=>{
 const {c,element:e}=setup();let saved;
 c.daysCol=()=>({doc:()=>({get:async()=>({exists:true,data:()=>({pm_cpp:1,pm_bxc:1,pm_pdr:99})}),set:async(data)=>{saved=data}})});
 c.closeModal=()=>{};c.loadDayData=()=>{};e('ekey').value='2026-11-25';e('ecpp').value=3;e('ebxc').value=2;e('epdr').value=99;
 vm.runInContext('syncEditPdr()',c);assert.equal(e('epdr').value,5);e('epdr').value=99;
 await vm.runInContext('saveEdit()',c);assert.equal(saved.pdr,5);assert.equal(saved.am_pdr,3);assert.equal(saved.pm_pdr,2);
});
test('EMR is already included in CPP: 3 CPP + 2 biopsies stays 5 with any EMR subcount',()=>{
 const {c,element:e}=setup();e('vcpp_am').value=3;e('vbc_am').value=2;
 for(const emr of [0,1,2]){e('vemr_am').value=emr;vm.runInContext('calcTodayPts()',c);assert.equal(e('vpdr_am').value,5);assert.equal(e('am-pts-show').textContent,'4p');}
});
test('manual +/- survives unrelated updates and save/reload; CPP changes restore automatic sum',async()=>{
 const {c,element:e}=setup();let saved;
 e('vcpp_am').value=3;e('vbc_am').value=2;e('vemr_am').value=1;e('inp-date').value='2026-11-25';
 vm.runInContext("calcTodayPts();adjInc('vpdr_am',1)",c);assert.equal(e('vpdr_am').value,6);assert.equal(e('vpdr_am').dataset.mode,'manual');
 e('ve_am').value=10;vm.runInContext('calcTodayPts()',c);assert.equal(e('vpdr_am').value,6);
 c.daysCol=()=>({doc:()=>({get:async()=>({exists:false}),set:async(data)=>saved=data})});
 await vm.runInContext('saveDay()',c);assert.equal(saved.pdr,6);assert.equal(saved.pdrAuto,false);assert.equal(saved.cpp,3);assert.equal(saved.emr,1);
 c.allDays=[saved];await vm.runInContext("loadDayData('2026-11-25')",c);assert.equal(e('vpdr_am').value,6);assert.equal(e('vcpp_am').value,3);
 vm.runInContext("adjInc('vcpp_am',-1)",c);assert.equal(e('vpdr_am').value,4);assert.equal(e('vpdr_am').dataset.mode,'auto');
});
test('legacy records with total EMR and no session EMR load inclusive CPP unchanged',async()=>{
 const {c,element:e}=setup();c.allDays=[{key:'2026-11-24',cpp:4,bxc:2,emr:1,pdr:99}];
 await vm.runInContext("loadDayData('2026-11-24')",c);assert.equal(e('vcpp_am').value,3);assert.equal(e('vemr_am').value,1);assert.equal(e('vpdr_am').value,5);
});
test('record refresh populates the ADR/PDR input immediately using restored legacy CPP',async()=>{
 const {c,element:e}=setup();const raw={key:'2026-11-25',cpp:4,emr:1,bxc:2,cfs:5,pts:25};
 c.daysCol=()=>({orderBy(){return this},get:async()=>({docs:[{data:()=>raw}]})});
 c.incViewMonth='';c.updateStats=c.renderHist=c.renderChart=c.refreshAdrUI=()=>{};
 for(const [name,next] of [['markPdrManual','updateAdrPreview'],['updateAdrPreview','adjAdr'],['onAdrDateChange','calcRate']])vm.runInContext(source(name,next),c);
 vm.runInContext('async '+source('loadAllDays','loadAllCases'),c);e('adr-date').value='2026-11-25';
 await vm.runInContext('loadAllDays()',c);
 assert.equal(e('adr-pdr').value,5);assert.equal(e('adr-pdr').dataset.mode,'auto');assert.equal(c.allDays[0].cpp,3);assert.equal(raw.cpp,4);
});
