import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT ?? 4173);
const password = process.env.DEMO_PASSWORD ?? "demo-password-for-local-tests";
const token = process.env.DEMO_TOKEN ?? "demo-token";
const questions = new Map();

function send(
  res,
  status,
  body,
  type = "application/json; charset=utf-8",
  headers = {},
) {
  res.writeHead(status, { "content-type": type, ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function hasSession(req) {
  return (
    /(?:^|;\s*)session=demo-session(?:;|$)/.test(req.headers.cookie ?? "") ||
    req.headers.authorization === `Bearer ${token}`
  );
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return send(res, 200, { status: "ok" });
  if (
    (url.pathname === "/" || url.pathname === "/login") &&
    req.method === "GET"
  ) {
    return send(
      res,
      200,
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Spyglass demo</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:18px system-ui;max-width:46rem;margin:4rem auto;padding:0 1rem}label{display:block;margin:1rem 0}input,textarea,button{font:inherit;padding:.5rem}button{background:#154c3c;color:white;border:0;border-radius:.4rem}</style></head>
<body><main><h1>Sign in</h1>${url.searchParams.has("delayed") ? '<template id="login-form">' : ""}<form method="post" action="/login">
<label>Email <input name="email" type="email" autocomplete="username" required></label>
<label>Password <input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Sign in</button></form>${url.searchParams.has("delayed") ? '</template><script>setTimeout(() => { const form = document.getElementById("login-form"); document.querySelector("main").append(form.content.cloneNode(true)); form.remove(); }, 500)</script>' : ""}</main></body></html>`,
      "text/html; charset=utf-8",
    );
  }
  if (url.pathname === "/login" && req.method === "POST") {
    const form = new URLSearchParams(await body(req));
    if (
      form.get("email") !== "agent@example.test" ||
      form.get("password") !== password
    ) {
      return send(
        res,
        401,
        "<h1>Sign in failed</h1>",
        "text/html; charset=utf-8",
      );
    }
    return send(res, 303, "", "text/plain; charset=utf-8", {
      location: "/dashboard",
      "set-cookie": "session=demo-session; HttpOnly; SameSite=Lax; Path=/",
    });
  }
  if (url.pathname === "/dashboard") {
    if (!hasSession(req))
      return send(
        res,
        401,
        "<h1>Sign in required</h1>",
        "text/html; charset=utf-8",
      );
    return send(
      res,
      200,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Questions</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px system-ui;max-width:46rem;margin:4rem auto;padding:0 1rem}textarea,button{font:inherit;padding:.5rem}button{background:#154c3c;color:white;border:0;border-radius:.4rem}</style></head>
<body><main><h1>Ask a question</h1><form id="ask"><label for="question">Question</label><textarea id="question" name="question" required></textarea><button>Submit question</button></form><p id="answer" aria-live="polite"></p>
<script>document.querySelector('#ask').addEventListener('submit',async event=>{event.preventDefault();const question=document.querySelector('#question').value;const accepted=await fetch('/api/questions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({question})});const item=await accepted.json();document.querySelector('#answer').textContent='Question '+item.id+' accepted';let result;do{await new Promise(resolve=>setTimeout(resolve,40));result=await fetch('/api/questions/'+item.id).then(response=>response.json())}while(result.status!=='complete');document.querySelector('#answer').textContent=result.answer})</script></main></body></html>`,
      "text/html; charset=utf-8",
    );
  }
  if (url.pathname.startsWith("/api/")) {
    if (!hasSession(req)) return send(res, 401, { error: "sign in required" });
    if (url.pathname === "/api/questions" && req.method === "POST") {
      let input;
      try {
        input = JSON.parse(await body(req));
      } catch {
        return send(res, 400, { error: "invalid JSON" });
      }
      if (typeof input.question !== "string" || !input.question.trim())
        return send(res, 400, { error: "question is required" });
      const id = randomUUID();
      questions.set(id, { id, question: input.question, status: "pending" });
      setTimeout(() => {
        const item = questions.get(id);
        if (item)
          questions.set(id, {
            ...item,
            status: "complete",
            answer: "Thanks. We received your question.",
          });
      }, 180);
      return send(res, 202, { id, status: "pending" });
    }
    if (url.pathname === "/api/questions" && req.method === "GET") {
      return send(res, 200, [...questions.values()]);
    }
    const match = url.pathname.match(/^\/api\/questions\/([0-9a-f-]+)$/i);
    if (match && req.method === "GET") {
      const item = questions.get(match[1]);
      return item
        ? send(res, 200, item)
        : send(res, 404, { error: "question not found" });
    }
    if (url.pathname === "/api/reflect" && req.method === "POST") {
      let input = {};
      try {
        input = JSON.parse(await body(req));
      } catch {
        return send(res, 400, { error: "invalid JSON" });
      }
      return send(res, 200, { reflected: input.value ?? "" });
    }
    return send(res, 404, { error: "not found" });
  }
  if (url.pathname === "/error") {
    return send(
      res,
      200,
      '<!doctype html><html><head><title>Error page</title></head><body><h1>Error page</h1><script>console.error("fixture console error");setTimeout(()=>{throw new Error("fixture page error")},0)</script></body></html>',
      "text/html; charset=utf-8",
    );
  }
  return send(res, 404, { error: "not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`demo app listening on 127.0.0.1:${port}`);
});

function stop() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
