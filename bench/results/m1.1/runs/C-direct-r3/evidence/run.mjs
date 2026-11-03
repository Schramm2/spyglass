import { spawnSync, spawn } from "node:child_process";
import { appendFileSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const R="/tmp/m11/C-direct-r3/repo", E=R+"/evidence", LOG=E+"/actions.jsonl";
const secrets=[process.env.DEMO_PASSWORD,process.env.DEMO_TOKEN].filter(Boolean);
const red=s=>{s=String(s);for(const x of secrets)s=s.split(x).join("[REDACTED]");return s};
let n=0; const acts=[];
function log(a){a.n=++n;a.time=new Date().toISOString();const r=JSON.parse(red(JSON.stringify(a)));appendFileSync(LOG,JSON.stringify(r)+"\n");acts.push(r);return r}
function sh(cmd,label){const p=spawnSync("bash",["-c",cmd],{cwd:R,encoding:"utf8"});return log({type:"command",label,command:cmd,exit:p.status,stdout:p.stdout,stderr:p.stderr})}
async function http(method,path,label){try{const r=await fetch("http://127.0.0.1:47106"+path,{method});const b=await r.text();return log({type:"http",label,request:method+" http://127.0.0.1:47106"+path,status:r.status,body:b})}catch(e){return log({type:"http",label,request:method+" "+path,status:null,error:String(e)})}}
writeFileSync(LOG,"");
const src0=sh("git rev-parse HEAD && git status --porcelain --untracked-files=all -- . ':!evidence' && git diff --stat HEAD","source-identity-start");
// failed attempt before app start (unplanned-style precondition probe)
await http("GET","/health","health-before-start (expected to fail: app not yet started)");
const app=spawn("node",["fixtures/demo-app/server.mjs"],{cwd:R,env:{...process.env,PORT:"47106"},stdio:["ignore","pipe","pipe"]});
let applog="";app.stdout.on("data",d=>applog+=d);app.stderr.on("data",d=>applog+=d);
log({type:"process",label:"app-start",command:"PORT=47106 node fixtures/demo-app/server.mjs",pid:app.pid});
let h; for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));try{const r=await fetch("http://127.0.0.1:47106/health");if(r.status===200)break}catch{}}
h=await http("GET","/health","claim health-ready");
const pass1=sh("node fixtures/demo-app/check.mjs pass","claim demo-check-pass");
const fail=sh("node fixtures/demo-app/check.mjs fail","control deliberate failing attempt");
const pass2=sh("node fixtures/demo-app/check.mjs pass","control restored passing attempt");
const p=o=>{try{return JSON.parse(o.stdout)}catch{return null}};
const ok=o=>{const j=p(o);return o.exit===0&&j?.ok===true&&j.claims?.find(c=>c.id==="demo-check")?.ok===true&&Array.isArray(j.skips)&&j.skips.length===0};
const hj=(()=>{try{return JSON.parse(h.body)}catch{return null}})();
app.kill("SIGTERM"); await new Promise(r=>app.on("exit",(c,s)=>{log({type:"process",label:"app-stop",pid:app.pid,exitCode:c,signal:s,appLog:applog});r()}));
const after=await http("GET","/health","health-after-stop (expected connection refused)");
sh("ps -eo pid,args | grep -v grep | grep 'demo-app/server.mjs' || echo 'no demo app process'","process check after stop");
sh("rm -f check-output.json; echo removed check-output.json","remove generated check-output.json");
const src1=sh("git rev-parse HEAD && git status --porcelain --untracked-files=all -- . ':!evidence' && git diff --stat HEAD","source-identity-end");
const summary={claims:{
 "health-ready":{expected:"HTTP 200 with status ok",observed:`HTTP ${h.status} body ${h.body}`,actions:[h.n],outcome:h.status===200&&hj?.status==="ok"?"pass":"fail"},
 "demo-check-pass":{expected:"exit 0; ok true; demo-check ok true; skips []",observed:`exit ${pass1.exit}; ${pass1.stdout.trim()}`,actions:[pass1.n],outcome:ok(pass1)?"pass":"fail"}},
 control:{id:"demo-check-detects-failure",fail:{action:fail.n,exit:fail.exit,stdout:fail.stdout.trim(),detected:!ok(fail)},restored:{action:pass2.n,exit:pass2.exit,passed:ok(pass2)},outcome:(!ok(fail)&&ok(pass2))?"pass":"fail"},
 source:{start:src0.stdout,end:src1.stdout,unchanged:src0.stdout===src1.stdout},
 cleanup:{appStopped:after.status===null}};
writeFileSync(E+"/summary.json",JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
