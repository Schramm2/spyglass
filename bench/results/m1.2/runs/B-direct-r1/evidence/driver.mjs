import fs from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
const dir='evidence', base='http://127.0.0.1:51826';
const secrets=[process.env.DEMO_PASSWORD,process.env.DEMO_TOKEN].filter(Boolean);
const clean=s=>secrets.reduce((v,k)=>v.split(k).join('[REDACTED]'),String(s));
function record(x){fs.appendFileSync(`${dir}/steps.jsonl`,clean(JSON.stringify(x))+'\n'); console.log(clean(JSON.stringify(x)));}
function cmd(args,assertion=null){const start=new Date().toISOString();const p=spawnSync(args[0],args.slice(1),{encoding:'utf8',timeout:45000});const output=(p.stdout||'')+(p.stderr||'');const pass=assertion?assertion(output):p.status===0;record({time:start,end:new Date().toISOString(),command:args.map(clean),status:p.status,assertion:assertion?assertion.toString():'exit=0',pass,output});return output;}
const b=(...args)=>cmd(['agent-browser','--session','B-direct-r1',...args]);
async function request(method,path,data,check){const time=new Date().toISOString();const r=await fetch(base+path,{method,headers:{Authorization:`Bearer ${process.env.DEMO_TOKEN}`,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();const pass=check(r.status,body);record({time,end:new Date().toISOString(),request:{method,url:base+path,authorization:'Bearer [REDACTED]',...(data?{body:data}:{})},status:r.status,assertion:check.toString(),pass,output:body});return body;}
if(process.argv[2]==='run'){
 cmd(['git','rev-parse','HEAD']);cmd(['git','status','--porcelain=v1']);cmd(['git','diff','--exit-code']);cmd(['git','ls-files','--others','--exclude-standard']);
 cmd(['agent-browser','--version']);cmd(['node','--version']);
 const fd=fs.openSync(`${dir}/app.log`,'a');const time=new Date().toISOString();const child=spawn('node',['fixtures/demo-app/server.mjs'],{env:{...process.env,PORT:'51826'},detached:true,stdio:['ignore',fd,fd]});child.unref();fs.writeFileSync(`${dir}/app.pid`,String(child.pid));record({time,command:'PORT=51826 node fixtures/demo-app/server.mjs (credentials inherited)',status:'started',output:{pid:child.pid},assertion:'owned app launched'});
 await new Promise(r=>setTimeout(r,350));await request('GET','/health',null,(s,j)=>s===200&&j.status==='ok');
 b('open',base+'/login');b('snapshot');b('fill','input[name=email]','agent@example.test');b('fill','input[name=password]','deliberately-invalid-password');b('click','button');cmd(['agent-browser','--session','B-direct-r1','get','text','h1'],o=>o.includes('Sign in failed'));
 b('open',base+'/login');b('fill','input[name=email]','agent@example.test');b('fill','input[name=password]',process.env.DEMO_PASSWORD);b('click','button');cmd(['agent-browser','--session','B-direct-r1','get','url'],o=>o.includes('/dashboard'));cmd(['agent-browser','--session','B-direct-r1','get','text','h1'],o=>o.includes('Ask a question'));
 b('set','viewport','390','844');b('snapshot');b('eval',`JSON.stringify({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('h1,textarea,button')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),visible:!!(e.offsetWidth&&e.offsetHeight)}))})`);b('screenshot',`${process.cwd()}/evidence/dashboard-390x844.png`);
 const q=await request('POST','/api/questions',{question:'B-direct-r1: Can this demo retain and complete a question?'},(s,j)=>s===202&&j.status==='pending'&&typeof j.id==='string'&&j.id.length>0);fs.writeFileSync(`${dir}/question-id.txt`,q.id);
 await request('GET','/api/questions/'+q.id,null,(s,j)=>s===200&&j.status==='complete');
 await new Promise(r=>setTimeout(r,350));await request('GET','/api/questions/'+q.id,null,(s,j)=>s===200&&j.status==='complete'&&!!j.answer);
 b('open',base+'/error');b('wait','100');cmd(['agent-browser','--session','B-direct-r1','console'],o=>o.includes('fixture console error'));cmd(['agent-browser','--session','B-direct-r1','errors'],o=>o.includes('fixture page error'));
}
if(process.argv[2]==='retry'){
 b('wait','500');cmd(['agent-browser','--session','B-direct-r1','errors','--json'],o=>o.includes('fixture page error'));
 b('open',base+'/login');b('fill','input[name=email]','agent@example.test');b('fill','input[name=password]','deliberately-invalid-password');b('click','button');b('wait','500');cmd(['agent-browser','--session','B-direct-r1','get','text','h1'],o=>o.includes('Sign in failed'));
 b('open',base+'/login');b('fill','input[name=email]','agent@example.test');b('fill','input[name=password]',process.env.DEMO_PASSWORD);b('click','button');b('wait','500');cmd(['agent-browser','--session','B-direct-r1','get','url'],o=>o.includes('/dashboard'));cmd(['agent-browser','--session','B-direct-r1','get','text','h1'],o=>o.includes('Ask a question'));
}
if(process.argv[2]==='independent'){
 const id=fs.readFileSync(`${dir}/question-id.txt`,'utf8');await request('GET','/api/questions/'+id,null,(s,j)=>s===200&&j.id===id&&j.status==='complete'&&!!j.answer);await request('GET','/api/questions',null,(s,j)=>s===200&&Array.isArray(j)&&j.some(x=>x.id===id&&x.status==='complete'&&!!x.answer));
}
if(process.argv[2]==='cleanup'){
 b('close');cmd(['agent-browser','session','list'],o=>!o.includes('B-direct-r1'));
 const pid=Number(fs.readFileSync(`${dir}/app.pid`,'utf8'));const time=new Date().toISOString();try{process.kill(pid,'SIGTERM');record({time,command:`kill -TERM ${pid}`,status:0,pass:true,output:'signal sent'});}catch(e){record({time,command:`kill -TERM ${pid}`,status:'error',pass:false,output:e.message});}
 await new Promise(r=>setTimeout(r,1400));cmd(['bash','-c',`if kill -0 ${pid} 2>/dev/null; then echo 'app still alive'; exit 1; else echo 'owned app PID stopped'; fi`]);
 cmd(['curl','--silent','--show-error','--max-time','2',base+'/health'],o=>o.includes('Failed to connect')||o.includes('Could not connect'));
 cmd(['git','rev-parse','HEAD']);cmd(['git','status','--porcelain=v1']);cmd(['git','diff','--exit-code']);cmd(['git','ls-files','--others','--exclude-standard']);
}
