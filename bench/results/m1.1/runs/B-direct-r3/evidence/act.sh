#!/bin/bash
# usage: act.sh <step-id> <command...>  ; logs time, command, exit, redacted output to actions.jsonl
E=/tmp/m11/B-direct-r3/repo/evidence
id=$1; shift
start=$(date -u +%FT%T.%3NZ)
out=$("$@" 2>&1); rc=$?
end=$(date -u +%FT%T.%3NZ)
red() { local s="$1"; [ -n "$DEMO_PASSWORD" ] && s="${s//$DEMO_PASSWORD/[REDACTED_PASSWORD]}"; [ -n "$DEMO_TOKEN" ] && s="${s//$DEMO_TOKEN/[REDACTED_TOKEN]}"; printf '%s' "$s"; }
cmd=$(red "$*"); o=$(red "$out")
node -e 'const [id,s,e,c,rc,o]=process.argv.slice(1);console.log(JSON.stringify({step:id,start:s,end:e,command:c,exit:+rc,output:o}))' "$id" "$start" "$end" "$cmd" "$rc" "$o" >> $E/actions.jsonl
printf '%s\n[exit %s]\n' "$o" "$rc"
exit $rc
