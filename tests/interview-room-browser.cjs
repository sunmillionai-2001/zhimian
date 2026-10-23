// Isolated room transitions with fictional materials and controlled model responses.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),{spawn}=require('node:child_process');
const policy=require('../interview-policy');
(async()=>{const root=path.join(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'zm-interview-room-'));let browser,server;try{
 for(const f of fs.readdirSync(root).filter(f=>/\.(html|js)$/.test(f)))fs.copyFileSync(path.join(root,f),path.join(tmp,f));
 for(const dir of ['node_modules','assets'])fs.symlinkSync(path.join(root,dir),path.join(tmp,dir),'dir');
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const base='http://127.0.0.1:'+port;
 server=spawn(process.execPath,['server.js'],{cwd:tmp,env:{...process.env,PORT:String(port),ZM_LOCAL_MODE:'1'},stdio:['ignore','pipe','pipe']});await new Promise((r,j)=>{const t=setTimeout(()=>j(Error('startup')),5000);server.stdout.once('data',()=>{clearTimeout(t);r();});});
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
 const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});await c.route('**/fonts.googleapis.com/**',r=>r.abort());await c.addInitScript(()=>localStorage.setItem('zm_guide_seen_v1','1'));
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 let responseMode='good',release=null,calls=0;
 await p.route('**/api/ai/interview-plan',async route=>{calls++;const b=route.request().postDataJSON(),mode=responseMode;await new Promise(r=>release=r);release=null;
  if(mode==='fail')return route.fulfill({status:502,json:{error:'暂时无法准备本场问题，请稍后再试。'}});
  const blueprint=b.blueprintVersion?policy.blueprint(b.interviewer,b.role):null;
  await route.fulfill({json:{meta:{model:'controlled-room',promptVersion:'fixture-v1',createdAt:new Date().toISOString()},result:{questions:Array.from({length:b.count},(_,i)=>({...(blueprint?{competencyId:blueprint.competencies[i].id,criteria:blueprint.competencies[i].criteria}:{}),topic:['岗位理解','经历核实','协作沟通','判断与取舍','结果验证'][i%5],q:'请结合一次需求交付经历，说明你在第 '+(i+1)+' 个环节的个人职责和验证方式。',points:['个人行动','验证依据'],source:{kind:'jd',quote:b.jd.split('\n')[0]}}))}}});
 });
 const phase=()=>p.locator('#mock .mock-wrap').getAttribute('data-phase');
 const respond=async()=>{const until=Date.now()+5000;while(!release){if(Date.now()>until)throw Error('Model request was not dispatched');await p.waitForTimeout(20);}release();};
 const waitPhase=async value=>{try{await p.waitForFunction(v=>document.querySelector('#mock .mock-wrap').dataset.phase===v,value);}catch(e){console.error(await p.evaluate(()=>({phase:document.querySelector('#mock .mock-wrap').dataset.phase,plan:document.getElementById('mockPlanMsg').textContent,storage:document.getElementById('mockStorageMsg').textContent})),errors);throw e;}};
 const draft=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('zm_mock_store_v2')).draft);
 const screenshot=async name=>{if(process.env.ROOM_ARTIFACT_DIR){await p.waitForFunction(()=>+getComputedStyle(document.querySelector('#mock')).opacity>=.99);fs.mkdirSync(process.env.ROOM_ARTIFACT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.ROOM_ARTIFACT_DIR,name+'.png')});}};
 const noOverflow=async()=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');
 await p.goto(base+'/app.html#target');await p.locator('#targetJd').fill('产品经理\n需求分析、跨团队沟通与交付验证');await p.locator('#targetMock').click();await p.locator('#mockInterviewer').selectOption('hr');await p.locator('#mockMode').selectOption('coaching');
 assert.equal(await phase(),'prepare');assert.equal(await p.locator('#mockStage').isVisible(),false);assert.equal(await p.locator('#aiSettings').isVisible(),false);await screenshot('prepare');
 // A real exit animation precedes the request; a second click cannot create another session.
 await p.locator('#mockPersonalStart').click();assert.equal(await phase(),'leaving');await p.locator('#mockPersonalStart').dispatchEvent('click');
 assert.equal(await p.locator('.mock-setup').evaluate(el=>el.inert),true);
 await p.waitForFunction(()=>{const opacity=+getComputedStyle(document.querySelector('#mock .mock-setup')).opacity;return opacity>0.05&&opacity<0.9;});
 assert.equal(calls,0);await waitPhase('loading');await p.waitForFunction(()=>document.getElementById('mockLoadingRole').textContent.includes('HR'));
 assert.equal(await p.locator('.mock-setup').isVisible(),false);assert.equal(await p.locator('#mockStage').isVisible(),false);assert.equal(calls,1);assert.equal(await p.locator('#mockRoomBack').isVisible(),false);await screenshot('loading');await respond();
 await waitPhase('session');await p.locator('#mockA').waitFor();await p.waitForFunction(()=>document.activeElement?.id==='mockA');
 assert.match(await p.locator('.who-name').innerText(),/HR 初面/);assert.equal(await p.locator('.mock-setup').isVisible(),false);
 assert.ok(await p.locator('#mockStage').evaluate(el=>el.getBoundingClientRect().width>=document.querySelector('#mock .mock-wrap').getBoundingClientRect().width-2));
 await p.waitForFunction(()=>!document.getElementById('mockStage').getAnimations().length);await screenshot('coaching');
 await p.locator('#mockA').fill('我整理需求清单，与研发确认边界，再按照验收项核对交付。');const first=(await draft()).id;
 await p.locator('#mockNext').click();assert.equal(await p.locator('#mockBody>.q-card').count(),1);assert.equal(await p.locator('.mock-transcript').evaluate(el=>el.open),false);
 await p.locator('#mockA').fill('第二题暂存的回答');await p.locator('#mockRoomBack').click();await waitPhase('prepare');assert.equal((await draft()).id,first);assert.equal((await draft()).answers[1],'第二题暂存的回答');
 const timer=await p.evaluate(()=>mockSec);await p.waitForTimeout(1100);assert.equal(await p.evaluate(()=>mockSec),timer,'Preparation must pause the active timer');
 await p.locator('#mockRoomContinue').click();await waitPhase('session');assert.equal(await p.locator('#mockA').inputValue(),'第二题暂存的回答');
 await p.reload();await waitPhase('session');assert.equal(await p.locator('#mockA').inputValue(),'第二题暂存的回答');
 // Leaving the module returns to preparation; continue remains explicit.
 await p.locator('.nav-item[data-view="overview"]').click();await p.locator('.nav-item[data-view="mock"]').click();await waitPhase('prepare');assert.equal((await draft()).id,first);
 // Failure preserves the whole previous draft and both materials.
 responseMode='fail';const before=await p.evaluate(()=>localStorage.getItem('zm_mock_store_v2'));await p.locator('#mockPersonalStart').click();await waitPhase('loading');await respond();await waitPhase('prepare');
 assert.match(await p.locator('#mockPlanMsg').innerText(),/材料与原草稿已保留/);assert.equal(await p.evaluate(()=>localStorage.getItem('zm_mock_store_v2')),before);assert.match(await p.locator('#mockJd').inputValue(),/产品经理/);assert.equal(await p.locator('#mockPersonalStart').isEnabled(),true);
 // An offline start must not replace the old session if its new snapshot cannot be saved.
 await p.evaluate(()=>{window.restoreRoomWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='zm_mock_store_v2')throw Error('quota');return window.restoreRoomWrite.call(this,k,v);};});await p.locator('#mockStart').click();assert.equal(await phase(),'prepare');assert.equal((await draft()).id,first);assert.match(await p.locator('#mockStorageMsg').innerText(),/原草稿仍保留/);await p.evaluate(()=>Storage.prototype.setItem=window.restoreRoomWrite);
 // Settings and backups live in a content-centred dialog and return to their original home.
 const home=await p.locator('#aiSettings').evaluate(el=>el.parentElement.className);await p.locator('#mockRoomTools').click();assert.equal(await p.locator('#mockToolsDialog').evaluate(el=>el.open),true);assert.equal(await p.locator('#mockModelSettingsHost>#aiSettings').count(),1);
 const download=p.waitForEvent('download');await p.locator('#mockExport').click();const backup=path.join(tmp,'interviews.json');await(await download).saveAs(backup);assert.equal(JSON.parse(fs.readFileSync(backup)).draft.id,first);
 await p.locator('#mockImportFile').setInputFiles(backup);await p.waitForFunction(()=>document.getElementById('mockStorageMsg').textContent.includes('导入'));await p.keyboard.press('Escape');await p.waitForFunction(parent=>document.getElementById('aiSettings').parentElement.className===parent,home);assert.equal(await p.locator('#mockToolsDialog').evaluate(el=>el.open),false);assert.equal(await p.locator('#aiSettings').evaluate(el=>el.parentElement.className),home);
 // Formal mode also fills the room and returning to preparation pauses it.
 responseMode='good';await p.locator('#mockMode').selectOption('formal');await p.locator('#formalStart').click();await waitPhase('loading');await respond();await waitPhase('session');await p.locator('#formalNext').waitFor();assert.match(await p.locator('.who-name').innerText(),/HR 初面.*正式模拟/);
 await p.locator('#mockA').fill('我负责跨团队需求整理，希望继续做好产品交付。');await p.locator('#mockRoomBack').click();await waitPhase('prepare');assert.equal((await draft()).formal.control.paused,true);
 await p.locator('#mockRoomContinue').click();await waitPhase('session');assert.equal(await p.locator('#formalNext').isDisabled(),true);assert.equal(await p.locator('#mockA').inputValue(),'我负责跨团队需求整理，希望继续做好产品交付。');await p.locator('#formalPause').click();assert.equal(await p.locator('#formalNext').isEnabled(),true);await p.waitForFunction(()=>!document.getElementById('mockStage').getAnimations().length);await screenshot('formal');
 // Width, modal bounds, and keyboard focus at the actual narrow breakpoints.
 for(const width of [320,390,820]){await p.setViewportSize({width,height:900});await noOverflow();await p.locator('#mockRoomBack').click();await waitPhase('prepare');await noOverflow();await p.locator('#mockRoomTools').click();await noOverflow();assert.ok(await p.locator('#mockToolsDialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1;}),'dialog bounds '+width);await p.keyboard.press('Escape');await p.locator('#mockRoomContinue').click();await waitPhase('session');await p.locator('#formalPause').click();await noOverflow();if(width===390)await screenshot('mobile');}
 // Reduced motion removes the exit/entry animation rather than merely shortening it.
 await p.emulateMedia({reducedMotion:'reduce'});await p.locator('#mockRoomBack').click();await waitPhase('prepare');await p.locator('#mockRoomContinue').click();await waitPhase('session');assert.equal(await p.locator('#mockStage').evaluate(el=>el.getAnimations().length),0);
 // A navigation during the exit animation cancels the pending start before any request.
 await p.locator('#mockRoomBack').click();await waitPhase('prepare');await p.emulateMedia({reducedMotion:'no-preference'});const previousCalls=calls,previousId=(await draft()).id;await p.locator('#formalStart').click();assert.equal(await phase(),'leaving');await p.locator('.nav-item[data-view="overview"]').click();await p.waitForFunction(()=>!mockAiBusy&&!mockPlanBusy);assert.equal(calls,previousCalls);assert.equal((await draft()).id,previousId);await p.locator('.nav-item[data-view="mock"]').click();await waitPhase('prepare');
 assert.deepEqual(errors,[]);console.log('PASS: preparation-only entry, 650ms fade/slide, real loading, full-width coaching/formal, duplicate request guard, explicit continue/pause/reload, failure/quota preservation, model dialog restoration, backup roundtrip, navigation cancellation, 320/390/820 bounds and reduced motion; no real AI calls.');
}finally{await browser?.close();server?.kill();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
