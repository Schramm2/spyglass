#!/bin/bash
# usage: run.sh <step-id> <cmd...>; logs to actions.jsonl, redacts secrets
E=/tmp/m11/C-direct-r3/repo/evidence; id=$1; shift
start=$(date -u +%FT%T.%3NZ)
out=$("$@" 2>&1); code=$?
end=$(date -u +%FT%T.%3NZ)
for s in "$DEMO_PASSWORD" "$DEMO_TOKEN"; do [ -n "$s" ] && out=${out//"$s"/[REDACTED]}; done
printf '%s\n' "$out" > "$E/steps/$id.out"
node -e 'const [id,s,e,c,cmd,o]=process.argv.slice(1);console.log(JSON.stringify({id,start:s,end:e,exit:+c,command:cmd,output:o}))' "$id" "$start" "$end" "$code" "$*" "$out" >> "$E/actions.jsonl"
echo "[$id exit=$code] $out"
