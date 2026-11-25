const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function source(name,next){const a=html.indexOf('function '+name+'(');return html.slice(a,html.indexOf('function '+next+'(',a)).replace(/async\s*$/,'');}
function setup(){
 const els={};const element=id=>els[id]||(els[id]={value:0,textContent:'',innerHTML:'',style:{},classList:{add(){},remove(){}}});
 const c=vm.createContext({document:{getElementById:element},procedureStats:require('../procedure-stats.js'),getPdrCount:require('../procedure-stats.js').getPdrCount,currentSession:'am',allDays:[],currentUid:'test',toast(){},sedationData(){return {}},sedationSum(){},loadAllDays:async()=>{}});
 for(const [name,next] of [['syncCounterPdr','switchSession'],['adjInc','syncCounterPdr'],['calcTodayPts','loadDayData'],['loadDayData','saveDay'],['saveDay','updateStats'],['syncEditPdr','closeModal'],['saveEdit','delDay']]){
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
  vm.runInContext(handler,c);assert.equal(e('vpdr_'+t).value,6);
  vm.runInContext(`adjInc('vcpp_${t}',-1)`,c);assert.equal(e('vpdr_'+t).value,5);
  e('vbc_'+t).value='';e('vcpp_'+t).value=0;e('vemr_'+t).value=0;
  vm.runInContext(handler,c);assert.equal(e('vpdr_'+t).value,0);
 }
});
test('loading stale manual totals recalculates from each session without double-counting EMR',async()=>{
 const {c,element:e}=setup();c.allDays=[{key:'2026-11-25',am_egd:10,am_cpp:4,am_emr:1,am_bxc:2,pm_cpp:2,pm_emr:1,pm_bxc:1,cpp:6,emr:2,bxc:3,pdr:99,am_pdr:80,pm_pdr:19}];
 await vm.runInContext("loadDayData('2026-11-25')",c);
 assert.equal(e('vcpp_am').value,3);assert.equal(e('vpdr_am').value,6);assert.equal(e('vpdr_pm').value,3);
});
test('save recalculates the sum instead of trusting the displayed total',async()=>{
 const {c,element:e}=setup();let saved;
 c.daysCol=()=>({doc:()=>({get:async()=>({exists:true,data:()=>({adr:30,failureCount:1})}),set:async(data,opts)=>{saved={data,opts}}})});
 c.loadDayData=()=>{};e('inp-date').value='2026-11-25';e('vcpp_am').value=3;e('vemr_am').value=1;e('vbc_am').value=2;e('vbc_pm').value=1;e('vpdr_am').value=99;
 await vm.runInContext('saveDay()',c);
 assert.equal(saved.data.pdr,7);assert.equal(saved.data.am_pdr,6);assert.equal(saved.data.pm_pdr,1);assert.equal(saved.data.pdrAuto,true);assert.equal(saved.data.adr,30);assert.equal(saved.opts.merge,true);
});
test('edit preview and persisted morning/afternoon totals derive from matching components',async()=>{
 const {c,element:e}=setup();let saved;
 c.daysCol=()=>({doc:()=>({get:async()=>({exists:true,data:()=>({pm_cpp:1,pm_bxc:1,pm_pdr:99})}),set:async(data)=>{saved=data}})});
 c.closeModal=()=>{};c.loadDayData=()=>{};e('ekey').value='2026-11-25';e('ecpp').value=3;e('ebxc').value=2;e('epdr').value=99;
 vm.runInContext('syncEditPdr()',c);assert.equal(e('epdr').value,5);e('epdr').value=99;
 await vm.runInContext('saveEdit()',c);assert.equal(saved.pdr,5);assert.equal(saved.am_pdr,3);assert.equal(saved.pm_pdr,2);
});
