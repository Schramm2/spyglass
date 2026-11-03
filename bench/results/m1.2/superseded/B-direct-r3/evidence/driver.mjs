import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
const dir=new URL('.',import.meta.url).pathname;
const base='http://127.0.0.1:51822';
const redact=s=>String(s).split(process.env.DEMO_PASSWORD).join('[REDACTED_PASSWORD]').split(process.env.DEMO_TOKEN).join('[REDACTED_TOKEN]');
function record(action,output,assertions=[],status=0,start=new Date().toISOString()) {const r={start,end:new Date().toISOString(),action,status,assertions,output};fs.appendFileSync(dir+'steps.jsonl',redact(JSON.stringify(r))+'\n');console.log(redact(JSON.stringify(r)));return r;}
function cli(args,expect,input){const start=new Date().toISOString();const p=spawnSync('agent-browser',['--session','B-direct-r3',...args],{encoding:'utf8',input,timeout:60000});const out=(p.stdout||'')+(p.stderr||'');const assertions=expect?[{expected:expect,pass:out.includes(expect)}]:[];record('agent-browser --session B-direct-r3 '+args.join(' ')+(input?' (stdin: '+redact(input)+')':''),out,assertions,p.status??-1,start);if(p.status!==0||assertions.some(a=>!a.pass)) throw new Error('Browser step failed; retained');return out;}
async function request(method,path,body){const start=new Date().toISOString();const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${process.env.DEMO_TOKEN}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});const text=await r.text();return {start,action:`${method} ${base+path}; Authorization: Bearer [REDACTED_TOKEN]`+(body?'; body='+JSON.stringify(body):''),status:r.status,json:JSON.parse(text),text};}
const phase=process.argv[2];
if(phase==='start'){
 const out=fs.openSync(dir+'app.log','a');const p=spawn('node',['fixtures/demo-app/server.mjs'],{env:{...process.env,PORT:'51822'},detached:true,stdio:['ignore',out,out]});p.unref();fs.writeFileSync(dir+'app.pid',String(p.pid));record('PORT=51822 node fixtures/demo-app/server.mjs (credentials from environment)',{pid:p.pid,log:'app.log'},[{expected:'owned app started',pass:true}]);
 for(let i=0;i<30;i++){let r;try{r=await request('GET','/health');record(r.action,r.text,[{expected:'HTTP 200',pass:r.status===200}],r.status,r.start);if(r.status===200)break;}catch(e){record('GET '+base+'/health',e.message,[{expected:'HTTP 200',pass:false}],-1);}await new Promise(r=>setTimeout(r,100));}
 cli(['--version']);cli(['open',base+'/login']);cli(['snapshot'],'Sign in');
 cli(['fill','input[name=email]','agent@example.test']);cli(['fill','input[name=password]','deliberately-wrong']);cli(['click','button[type=submit]']);cli(['snapshot'],'Sign in failed');
 cli(['open',base+'/login']);cli(['fill','input[name=email]','agent@example.test']);
 // Supply the credential through stdin, never as a shell command or retained value.
 cli(['batch'], 'Success',JSON.stringify(['fill input[name=password] '+JSON.stringify(process.env.DEMO_PASSWORD)]));
 cli(['click','button[type=submit]']);cli(['get','url'],'/dashboard');cli(['snapshot'],'Ask a question');
 cli(['set','viewport','390','844']);cli(['screenshot',dir+'dashboard-390x844.png']);
 cli(['eval',`JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('h1,textarea,button')].map(e=>({tag:e.tagName,text:e.textContent,rect:e.getBoundingClientRect().toJSON()}))})`]);
}
if(phase==='api'){
 const post=await request('POST','/api/questions',{question:'What does this independent verification run demonstrate?'});record(post.action,post.text,[{expected:'HTTP 202, pending and id',pass:post.status===202&&post.json.status==='pending'&&!!post.json.id}],post.status,post.start);fs.writeFileSync(dir+'question-id.txt',post.json.id+'\n');
 const path='/api/questions/'+post.json.id;
 const immediate=await request('GET',path);record(immediate.action,immediate.text,[{expected:'HTTP 200',pass:immediate.status===200},{expected:'json status=complete',pass:immediate.json.status==='complete',control:'expected failure while pending'}],immediate.status,immediate.start);
 await new Promise(r=>setTimeout(r,500));
 const later=await request('GET',path);record(later.action,later.text,[{expected:'HTTP 200 and json status=complete with answer (restored assertion)',pass:later.status===200&&later.json.status==='complete'&&!!later.json.answer}],later.status,later.start);
}
if(phase==='independent'){
 const id=fs.readFileSync(dir+'question-id.txt','utf8').trim();const r=await request('GET','/api/questions/'+id);record(r.action+' (later independent read; new process and request)',r.text,[{expected:'same id, complete, nonempty answer',pass:r.status===200&&r.json.id===id&&r.json.status==='complete'&&!!r.json.answer}],r.status,r.start);
 const list=await request('GET','/api/questions');record(list.action,list.text,[{expected:'HTTP 200; list contains same question, complete and answer',pass:list.status===200&&list.json.some(q=>q.id===id&&q.question==='What does this independent verification run demonstrate?'&&q.status==='complete'&&!!q.answer)}],list.status,list.start);
 cli(['console','--clear']);cli(['errors','--clear']);cli(['open',base+'/error']);cli(['wait','300']);cli(['console'],'fixture console error');cli(['errors'],'fixture page error');
}
if(phase==='cleanup'){
 cli(['close']);
 const pid=Number(fs.readFileSync(dir+'app.pid','utf8'));process.kill(pid,'SIGTERM');record('SIGTERM owned app PID '+pid,'signal sent',[],0);await new Promise(r=>setTimeout(r,1300));let stopped=false;try{process.kill(pid,0);}catch(e){stopped=e.code==='ESRCH';}record('kill(pid, 0) owned app only',{pid,stopped},[{expected:'PID no longer exists',pass:stopped}]);
 try{const r=await fetch(base+'/health');record('GET '+base+'/health after stop','HTTP '+r.status,[{expected:'connection refused',pass:false}],r.status);}catch(e){record('GET '+base+'/health after stop',e.message+' '+(e.cause?.code||''),[{expected:'connection refused',pass:true}]);}
 cli(['session','info','--json']);
 const start=new Date().toISOString();const p=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});const s=spawnSync('git',['status','--porcelain=v1'],{encoding:'utf8'});const d=spawnSync('git',['diff','--binary'],{encoding:'utf8'});fs.writeFileSync(dir+'source-end.txt',p.stdout+s.stdout+d.stdout);record('git rev-parse HEAD; git status --porcelain=v1; git diff --binary',p.stdout+s.stdout+d.stdout,[{expected:'same commit and clean tracked source',pass:p.stdout.trim()==='6062fb4699464fe945e9feea7ae9457bd84d6574'&&!s.stdout&&!d.stdout}],0,start);
}
