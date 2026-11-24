import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { classify } from "./mock-ai.mjs";

const html = await readFile(new URL("./index.html", import.meta.url));
const topics = new Set(["delivery", "pricing", "other"]);
const manualReview = { status: "manual_review", topic: null, draft: null };

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function handleTriage(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let text;
  try {
    text = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.text;
  } catch {
    return json(response, 400, { status: "invalid_input" });
  }
  if (typeof text !== "string" || !text.trim()) {
    return json(response, 400, { status: "invalid_input" });
  }

  let result;
  try {
    // Имитатор поддерживает AbortSignal: ожидание отменяется через 300 мс.
    result = JSON.parse(await classify(text.trim(), { signal: AbortSignal.timeout(300) }));
  } catch {
    return json(response, 200, manualReview);
  }
  if (!topics.has(result?.topic) || typeof result.draft !== "string" || !result.draft.trim()) {
    return json(response, 200, manualReview);
  }
  return json(response, 200, { status: "ready", topic: result.topic, draft: result.draft.trim() });
}

export function createTriageServer() {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }
    if (request.method !== "POST" || request.url !== "/api/triage") {
      return json(response, 404, { status: "not_found" });
    }
    try {
      await handleTriage(request, response);
    } catch {
      json(response, 500, { status: "server_error" });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createTriageServer().listen(Number(process.env.PORT || 3000), "127.0.0.1");
}
