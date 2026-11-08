import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message, Space } from "spectrum-ts";

import { type BridgeConfig, UNREACHABLE, UNSUPPORTED, deliverNotices, handle, parseSenderMap } from "../src/handle.ts";

interface Call {
  url: string;
  init: RequestInit;
}

function fakes(content: object, opts: { senderId?: string; direction?: string } = {}) {
  const replies: string[] = [];
  const sent: string[] = [];
  let typing = 0;
  const message = {
    direction: opts.direction ?? "inbound",
    sender: { id: opts.senderId ?? "+12145550123" },
    content,
    reply: async (text: string) => void replies.push(text),
  } as unknown as Message;
  const space = {
    responding: async (fn: () => Promise<void>) => {
      typing++;
      await fn();
    },
    send: async (text: string) => void sent.push(text),
  } as unknown as Space;
  return { message, space, replies, sent, typing: () => typing };
}

function backend(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function config(fetchFn: typeof fetch, extra: Partial<BridgeConfig> = {}): BridgeConfig {
  return { backendUrl: "http://api.test", senderMap: new Map(), fetch: fetchFn, ...extra };
}

test("a text is posted as JSON and the bubbles come back in order", async () => {
  const api = backend(200, { reply: "Got it.", followups: ["(1/3) What remains?"] });
  const f = fakes({ type: "text", text: "UPS-B is mostly finished." });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].url, "http://api.test/api/inbound/imessage");
  assert.deepEqual(JSON.parse(api.calls[0].init.body as string),
    { sender_phone: "+12145550123", text: "UPS-B is mostly finished." });
  assert.deepEqual(f.replies, ["Got it."]);
  assert.deepEqual(f.sent, ["(1/3) What remains?"]);
  assert.equal(f.typing(), 1);
});

test("a voice note is posted as multipart audio", async () => {
  const api = backend(200, { reply: "Got it.", followups: [] });
  const f = fakes({ type: "voice", mimeType: "audio/x-caf", read: async () => Buffer.from("caf bytes") });
  await handle(f.space, f.message, config(api.fetchFn));
  const form = api.calls[0].init.body as FormData;
  assert.equal(form.get("sender_phone"), "+12145550123");
  const file = form.get("file") as File;
  assert.equal(file.name, "voice-note.caf");
  assert.equal(file.type, "audio/x-caf");
  assert.equal(await file.text(), "caf bytes");
});

test("an audio attachment keeps its own file name", async () => {
  const api = backend(200, { reply: "Got it." });
  const f = fakes({ type: "attachment", name: "memo.m4a", mimeType: "audio/mp4", read: async () => Buffer.from("x") });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.equal(((api.calls[0].init.body as FormData).get("file") as File).name, "memo.m4a");
});

test("other content gets one short answer and no backend call", async () => {
  const api = backend(200, {});
  const f = fakes({ type: "attachment", name: "pic.jpg", mimeType: "image/jpeg", read: async () => Buffer.from("") });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.equal(api.calls.length, 0);
  assert.deepEqual(f.replies, [UNSUPPORTED]);
});

test("our own outbound messages are ignored", async () => {
  const api = backend(200, {});
  const f = fakes({ type: "text", text: "Got it." }, { direction: "outbound" });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.equal(api.calls.length, 0);
  assert.deepEqual(f.replies, []);
});

test("a 4xx message from the backend is shown to the operator", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const message = "This number isn't on the ShiftSync roster. Ask your supervisor to add it.";
  const api = backend(403, { detail: { code: "unknown_sender", message } });
  const f = fakes({ type: "text", text: "hi" });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.deepEqual(f.replies, [message]);
  // The operator's own id is printed locally so it can be added to SENDER_MAP.
  assert.ok(logged.mock.calls.some((c) => String(c.arguments[0]).includes('"+12145550123=<roster phone>"')));
});

test("a 5xx or a dead backend never leaks details", async () => {
  const api = backend(500, { detail: { message: "Traceback ..." } });
  const f = fakes({ type: "text", text: "hi" });
  await handle(f.space, f.message, config(api.fetchFn));
  assert.ok(!f.replies[0].includes("Traceback"));

  const dead = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const g = fakes({ type: "text", text: "hi" });
  await handle(g.space, g.message, config(dead));
  assert.deepEqual(g.replies, [UNREACHABLE]);
});

test("sender ids map to roster phones, and terminal mode uses a fixed phone", async () => {
  const api = backend(200, { reply: "ok" });
  const map = parseSenderMap(" +12145550123=+15550100001 , me@icloud.com=+15550100004,broken");
  assert.deepEqual([...map], [["+12145550123", "+15550100001"], ["me@icloud.com", "+15550100004"]]);

  const f = fakes({ type: "text", text: "hi" }, { senderId: "me@icloud.com" });
  await handle(f.space, f.message, config(api.fetchFn, { senderMap: map }));
  const g = fakes({ type: "text", text: "hi" }, { senderId: "terminal-user" });
  await handle(g.space, g.message, config(api.fetchFn, { fixedPhone: "+15550100001" }));
  const phones = api.calls.map((c) => JSON.parse(c.init.body as string).sender_phone);
  assert.deepEqual(phones, ["+15550100004", "+15550100001"]);
});

const JORDAN_NOTICE = { phone: "+15550100004", text: "Maya handed off to you. Reply to open the briefing." };
const JORDAN_MAP = new Map([["me@icloud.com", "+15550100004"]]);

test("a notice goes to the sender id behind the roster phone", async () => {
  const api = backend(200, { notices: [JORDAN_NOTICE] });
  const sent: [string, string][] = [];
  await deliverNotices(config(api.fetchFn, { senderMap: JORDAN_MAP }), async (id, text) => void sent.push([id, text]));
  assert.equal(api.calls[0].url, "http://api.test/api/inbound/imessage/notices");
  assert.equal(api.calls[0].init.method, "POST");
  assert.deepEqual(sent, [["me@icloud.com", JORDAN_NOTICE.text]]);
});

test("a notice for someone not in SENDER_MAP is skipped", async () => {
  const api = backend(200, { notices: [JORDAN_NOTICE] });
  await deliverNotices(config(api.fetchFn), async () => assert.fail("nobody to send to"));
});

test("one failed notice doesn't stop the next, and nothing throws", async () => {
  const other = { phone: "+15550100007", text: "Next one." };
  const api = backend(200, { notices: [JORDAN_NOTICE, other] });
  const senderMap = new Map([...JORDAN_MAP, ["+12145550199", other.phone]]);
  const sent: string[] = [];
  await deliverNotices(config(api.fetchFn, { senderMap }), async (id, text) => {
    if (id === "me@icloud.com") throw new Error("photon refused");
    sent.push(text);
  });
  assert.deepEqual(sent, [other.text]);
});

test("a dead or failing backend sends nothing and doesn't throw", async () => {
  const dead = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const never = async () => assert.fail("no notices to send");
  await deliverNotices(config(dead, { senderMap: JORDAN_MAP }), never);
  await deliverNotices(config(backend(500, {}).fetchFn, { senderMap: JORDAN_MAP }), never);
});
