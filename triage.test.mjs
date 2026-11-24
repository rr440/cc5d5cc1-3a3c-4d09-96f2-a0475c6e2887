import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import { createTriageServer } from "./server.mjs";

const server = createTriageServer();
let url;
before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}/api/triage`;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function post(body, signal) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
}

test("accepts a valid answer", async () => {
  const reply = await post(JSON.stringify({ text: "Когда будет доставка?" }));
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), {
    status: "ready", topic: "delivery", draft: "Спасибо за обращение. Уточним детали заявки.",
  });
});

for (const body of ["", "{", "null", "{}", '{"text":42}', '{"text":"   "}']) {
  test(`rejects invalid input ${JSON.stringify(body)}`, async () => {
    const reply = await post(body);
    assert.equal(reply.status, 400);
    assert.deepEqual(await reply.json(), { status: "invalid_input" });
  });
}

for (const marker of ["[timeout]", "[error]", "[bad-json]", "[bad-topic]", "[empty-draft]"]) {
  test(`${marker} falls back to manual review`, async () => {
    // Для [timeout] этот запас больше 300 мс, но меньше 1 200 мс задержки имитатора.
    const reply = await post(JSON.stringify({ text: marker }), AbortSignal.timeout(1_000));
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { status: "manual_review", topic: null, draft: null });
  });
}
