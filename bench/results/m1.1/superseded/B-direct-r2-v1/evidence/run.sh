#!/bin/bash
# usage: run.sh <step-id> <command...>  -- logs time, command, exit, output (secrets redacted)
export PATH=/tmp/m11/B-direct-r2/bin:$PATH XDG_STATE_HOME=/tmp/m11/B-direct-r2/state
set -a; . /tmp/m11/B-direct-r2/repo/secrets.env; set +a
export E=/tmp/m11/B-direct-r2/repo/evidence
id=$1; shift
start=$(date -u +%FT%T.%3NZ)
out=$(bash -c "$*" 2>&1); code=$?
end=$(date -u +%FT%T.%3NZ)
red() { sed -e "s|$DEMO_PASSWORD|[REDACTED_PASSWORD]|g" -e "s|$DEMO_TOKEN|[REDACTED_TOKEN]|g"; }
printf '%s' "$out" | red > "$E/out/$id.txt"
node -e 'const [id,s,e,c,cmd,f]=process.argv.slice(1);require("fs").appendFileSync(process.env.E+"/actions.jsonl",JSON.stringify({id,start:s,end:e,command:cmd,exit:+c,output_file:"out/"+id+".txt"})+"\n")' "$id" "$start" "$end" "$code" "$*" "$id" 
echo "[$id exit=$code]"; cat "$E/out/$id.txt"; echo
