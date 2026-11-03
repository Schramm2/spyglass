import {log,cmd,browser} from './run.mjs';
import fs from 'node:fs';
const records=fs.readFileSync('evidence/steps.jsonl','utf8');log('Reassert error-page-errors using retained console and JSON error records','Plain-text errors displayed only a cross. JSON errors retained the full fixture page error and location.',[{assertion:'fixture console error and fixture page error both retained',pass:records.includes('[error] fixture console error')&&records.includes('Error: fixture page error')}]);
const info=browser('session','info','--json');fs.writeFileSync('evidence/browser-before-close.json',info);
browser('--json','close');
await new Promise(r=>setTimeout(r,500));
browser('session','info','--json');
const pid=Number(fs.readFileSync('evidence/app.pid','utf8'));process.kill(pid,'SIGTERM');log('SIGTERM owned app PID '+pid,'Signal delivered');
await new Promise(r=>setTimeout(r,1200));let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}log('Check owned app PID '+pid+' via kill(pid,0)',{alive},[{assertion:'app PID absent',pass:!alive}]);
try{const r=await fetch('http://127.0.0.1:51828/health');log('Cleanup GET /health',{http:r.status},[{assertion:'connection refused',pass:false}],1);}catch(e){log('Cleanup GET /health',{message:e.message,cause:e.cause?.code},[{assertion:'app no longer listening',pass:e.cause?.code==='ECONNREFUSED'}]);}
cmd('git',['rev-parse','HEAD']);cmd('git',['status','--porcelain=v1']);cmd('git',['diff','--stat']);log('Retain app stdout/stderr',fs.readFileSync('evidence/app.log','utf8'));
