import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
const E='evidence/', base='http://127.0.0.1:53142';
const secrets=[process.env.DEMO_PASSWORD,process.env.DEMO_TOKEN].filter(Boolean);
const clean=x=>{let s=typeof x==='string'?x:JSON.stringify(x);for(const v of secrets)s=s.split(v).join('[REDACTED]');return s};
function record(step,request,status,assertions,output,started=new Date().toISOString()){const r={started,finished:new Date().toISOString(),step,request,status,assertions,output};fs.appendFileSync(E+'steps.jsonl',clean(r)+'\n');console.log(clean(r));return r}
function cmd(step,args,expect, input){const t=new Date().toISOString();const r=spawnSync(args[0],args.slice(1),{encoding:'utf8',input});const out=(r.stdout||'')+(r.stderr||'');record(step,args.join(' '),r.status,expect?{expected:expect,pass:r.status===0&&out.includes(expect)}:{exitZero:r.status===0},out,t);return out}
const ab=(step,args,expect,input)=>cmd(step,['agent-browser','--session','B-direct-r3-v2',...args],expect,input);
async function req(step,path,method='GET',body,expected){const t=new Date().toISOString();try{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+process.env.DEMO_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const j=await r.json();record(step,{method,url:base+path,headers:{Authorization:'Bearer [REDACTED]'},body},r.status,expected?{expected,pass:expected(r.status,j)}:{http200:r.status===200},j,t);return {status:r.status,j};}catch(e){record(step,{method,url:base+path},'network-error',{pass:false},e.message,t);return {}}}
const phase=process.argv[2];
if(phase==='start'){
 cmd('source-start',['git','rev-parse','HEAD']);cmd('tree-start',['git','status','--porcelain=v1']);cmd('diff-start',['git','diff','--binary']);cmd('plan-hash',['sh','-c','shasum verification-plan.json fixtures/demo-app/server.mjs GLOSSARY.md']);cmd('browser-version',['agent-browser','--version']);
 const fd=fs.openSync(E+'app.log','a');const p=spawn('node',['fixtures/demo-app/server.mjs'],{env:{...process.env,PORT:'53142'},stdio:['ignore',fd,fd],detached:true});p.unref();fs.writeFileSync(E+'app.pid',String(p.pid));record('app-start','PORT=53142 node fixtures/demo-app/server.mjs (credentials inherited)',0,{spawned:true},{pid:p.pid});
 for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,100));const r=await req('health-'+i,'/health');if(r.status===200)break;}
}
if(phase==='api'){
 const q='How does this demo acknowledge a question?';const a=await req('question-accepted','/api/questions','POST',{question:q},(s,j)=>s===202&&j.status==='pending'&&!!j.id);fs.writeFileSync(E+'question-id.txt',a.j.id);
 await req('control-immediate-completion','/api/questions/'+a.j.id,'GET',undefined,(s,j)=>s===200&&j.status==='complete');
 await new Promise(r=>setTimeout(r,300));record('completion-wait','wait 300ms',0,{elapsed:true},'Wait completed');
 await req('control-restored-completion','/api/questions/'+a.j.id,'GET',undefined,(s,j)=>s===200&&j.status==='complete'&&!!j.answer);
}
if(phase==='independent'){
 const id=fs.readFileSync(E+'question-id.txt','utf8');await req('independent-later-read','/api/questions/'+id,'GET',undefined,(s,j)=>s===200&&j.id===id&&j.status==='complete'&&!!j.answer);
 await req('independent-question-list','/api/questions','GET',undefined,(s,j)=>s===200&&j.some(v=>v.id===id&&v.status==='complete'&&!!v.answer));
}
if(phase==='browser'){
 ab('open-login',['open',base+'/login']);ab('login-form',['snapshot']);ab('wrong-email',['fill','input[name=email]','agent@example.test']);ab('wrong-password',['fill','input[name=password]','deliberately-wrong-password']);ab('wrong-submit',['click','button']);ab('signin-refused',['snapshot'],'Sign in failed');
 ab('return-login',['open',base+'/login']);ab('save-login',['auth','save','demo','--url',base+'/login','--username','agent@example.test','--password-stdin'],undefined,process.env.DEMO_PASSWORD+'\n');ab('correct-signin',['auth','login','demo','--no-navigate']);ab('dashboard-url',['get','url'],base+'/dashboard');ab('dashboard-heading',['snapshot'],'Ask a question');ab('phone-viewport',['set','viewport','390','844']);ab('mobile-layout',['eval',`JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('h1,textarea,button')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))})`]);ab('mobile-image',['screenshot',E+'dashboard-390x844.png']);
}
if(phase==='retry'){
 fs.renameSync(E+'dashboard-390x844.png',E+'failed-attempt-390x844.png');record('preserve-failed-image','rename dashboard image to failed-attempt-390x844.png',0,{retained:true},'Earlier image is refused-signin page, not dashboard');
 ab('refusal-restored-read',['snapshot'],'Sign in failed');ab('retry-login-open',['open',base+'/login']);ab('retry-login-ready',['wait','input[name=email]']);ab('retry-correct-signin',['auth','login','demo','--no-navigate']);ab('wait-dashboard',['wait','h1']);ab('settle-dashboard',['wait','500']);ab('retry-dashboard-url',['get','url'],base+'/dashboard');ab('retry-dashboard-heading',['snapshot'],'Ask a question');ab('retry-phone-viewport',['set','viewport','390','844']);ab('retry-mobile-layout',['eval',`JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('h1,textarea,button')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))})`]);ab('retry-mobile-image',['screenshot',E+'dashboard-390x844.png']);
}
if(phase==='errors'){
 ab('open-error',['open',base+'/error']);ab('error-page',['snapshot'],'Error page');ab('console-errors',['console'],'fixture console error');ab('page-errors',['errors'],'fixture page error');
}
if(phase==='error-retry'){
 ab('error-settle',['wait','500']);ab('page-errors-retry',['errors'],'fixture page error');ab('page-errors-json',['errors','--json'],'fixture page error');ab('console-errors-json',['console','--json'],'fixture console error');
}
if(phase==='browser-confirm'){
 record('confirmation-probe-relaunched','agent-browser --session B-direct-r3-v2 get cdp-url --json',0,{stoppedConfirmation:false},'Probe unexpectedly launched browser; lifecycle launched=true, reused=false; CDP port 53412. Retained as failed cleanup confirmation, followed by re-close.');
 const o=ab('capture-owned-cdp',['get','cdp-url','--json']);let endpoint;try{endpoint=JSON.parse(o).data.cdpUrl}catch{};
 ab('browser-reclose',['close']);await new Promise(r=>setTimeout(r,500));
 if(endpoint){const u=new URL(endpoint);const url='http://'+u.host+'/json/version';try{const r=await fetch(url);record('browser-cdp-confirm','GET '+url,r.status,{stopped:false},await r.text())}catch(e){record('browser-cdp-confirm','GET '+url,'connection refused',{stopped:true},e.message)}}
}
if(phase==='cleanup'){
 ab('delete-login-profile',['auth','delete','demo']);ab('browser-close',['close']);ab('browser-sessions-after-close',['session','list']);
 const pid=Number(fs.readFileSync(E+'app.pid','utf8'));try{process.kill(pid,'SIGTERM');record('app-stop','SIGTERM owned app PID '+pid,0,{signalSent:true},'sent')}catch(e){record('app-stop','SIGTERM owned app PID '+pid,1,{pass:false},e.message)}
 await new Promise(r=>setTimeout(r,1300));let alive=true;try{process.kill(pid,0)}catch{alive=false}record('app-process-confirm','kill -0 owned app PID '+pid,alive?1:0,{stopped:!alive},{alive});
 try{await fetch(base+'/health');record('port-confirm','GET '+base+'/health','unexpected response',{stopped:false},'HTTP still available')}catch(e){record('port-confirm','GET '+base+'/health','connection refused',{stopped:true},e.message)}
 cmd('source-end',['git','rev-parse','HEAD']);cmd('tree-end',['git','status','--porcelain=v1']);cmd('diff-end',['git','diff','--binary']);cmd('hash-end',['sh','-c','shasum verification-plan.json fixtures/demo-app/server.mjs GLOSSARY.md']);
}
