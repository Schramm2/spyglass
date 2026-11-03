import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync, readFileSync } from "node:fs";
const R="/tmp/m11/C-direct-r1/repo", E=R+"/evidence", LOG=E+"/actions.jsonl";
writeFileSync(LOG,"");
const secrets=[process.env.DEMO_PASSWORD,process.env.DEMO_TOKEN].filter(Boolean);
const red=s=>{s=String(s);for(const x of secrets)s=s.split(x).join("[REDACTED]");return s;};
let n=0; const acts=[];
function log(a){a.n=++n;a.time=new Date().toISOString();const r=JSON.parse(red(JSON.stringify(a)));appendFileSync(LOG,JSON.stringify(r)+"\n");acts.push(r);return r;}
function sh(cmd,args,opts={}){const p=spawnSync(cmd,args,{encoding:"utf8",...opts});return log({type:"command",command:[cmd,...args].join(" "),cwd:opts.cwd||R,exit:p.status,stdout:p.stdout,stderr:p.stderr});}
async function http(method,path,headers={}){const t=new Date().toISOString();try{const r=await fetch("http://127.0.0.1:47104"+path,{method,headers});const b=await r.text();return log({type:"http",request:`${method} http://127.0.0.1:47104${path}`,status:r.status,body:b});}catch(e){return log({type:"http",request:`${method} http://127.0.0.1:47104${path}`,status:null,error:String(e.cause?.code||e)});}}
const id0=sh("git",["rev-parse","HEAD"]); const st0=sh("git",["status","--porcelain","--untracked-files=all"]);
// planned failing attempt: health before app is started
const pre=await http("GET","/health");
const app=spawn("node",["fixtures/demo-app/server.mjs"],{cwd:R,env:{...process.env,PORT:"47104"},stdio:["ignore","pipe","pipe"]});
let applog="";app.stdout.on("data",d=>applog+=d);app.stderr.on("data",d=>applog+=d);
log({type:"process",command:"PORT=47104 node fixtures/demo-app/server.mjs",pid:app.pid});
let h; for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100)); try{const r=await fetch("http://127.0.0.1:47104/health"); if(r.status===200)break;}catch{}}
h=await http("GET","/health");
const hb=(()=>{try{return JSON.parse(h.body)}catch{return null}})();
const W=E+"/work";
const ctlFail=sh("node",[R+"/fixtures/demo-app/check.mjs","fail"],{cwd:W});
const pass=sh("node",[R+"/fixtures/demo-app/check.mjs","pass"],{cwd:W});
const pj=JSON.parse(pass.stdout), fj=JSON.parse(ctlFail.stdout);
const health={id:"health-ready",expected:"HTTP 200 with status ok",observed:`HTTP ${h.status}, body ${h.body}`,actions:[h.n],failedAttempts:[pre.n],outcome:h.status===200&&hb?.status==="ok"?"pass":"fail"};
const dc=pj.claims.find(c=>c.id==="demo-check");
const demo={id:"demo-check-pass",expected:"exit 0; ok true; demo-check ok true; skips []",observed:`exit ${pass.exit}; ok ${pj.ok}; demo-check ok ${dc?.ok}; skips ${JSON.stringify(pj.skips)}`,actions:[pass.n],outcome:pass.exit===0&&pj.ok===true&&dc?.ok===true&&pj.skips.length===0?"pass":"fail"};
const fdc=fj.claims.find(c=>c.id==="demo-check");
const control={id:"demo-check-detects-failure",failingAttempt:{action:ctlFail.n,observed:`exit ${ctlFail.exit}; ok ${fj.ok}; demo-check ok ${fdc?.ok}; skips ${JSON.stringify(fj.skips)}`},restoredAttempt:{action:pass.n,observed:demo.observed},outcome:(fdc?.ok===false&&dc?.ok===true)?"pass (assertion detects failure and passes when restored)":"fail"};
app.kill("SIGTERM"); await new Promise(r=>app.on("exit",(c,s)=>{log({type:"process",event:"app exited",code:c,signal:s,output:applog});r();}));
const post=await http("GET","/health");
const ab=sh("agent-browser",["--session","C-direct-r1","close"]);
const id1=sh("git",["rev-parse","HEAD"]); const st1=sh("git",["status","--porcelain","--untracked-files=all"]);
const strip=s=>s.split("\n").filter(l=>l&&!l.includes("evidence/")).join("\n");
const unchanged=id0.stdout===id1.stdout&&strip(st0.stdout)===strip(st1.stdout);
const failed=acts.filter(a=>(a.type==="command"&&a.exit!==0)||(a.type==="http"&&a.status!==200));
const res={claims:[health,demo],control,source:{start:{commit:id0.stdout.trim(),status:st0.stdout,actions:[id0.n,st0.n]},end:{commit:id1.stdout.trim(),status:st1.stdout,actions:[id1.n,st1.n]},unchanged},failedAttempts:failed.map(a=>({n:a.n,what:a.command||a.request,exit:a.exit,status:a.status,error:a.error})),cleanup:{appExited:true,healthAfterStop:{action:post.n,status:post.status,error:post.error},browser:{action:ab.n,exit:ab.exit,out:(ab.stdout+ab.stderr).trim()}}};
writeFileSync(E+"/results.json",red(JSON.stringify(res,null,2)));
console.log(red(JSON.stringify(res,null,2)));
