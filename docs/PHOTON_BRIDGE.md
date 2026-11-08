# Photon Bridge (iMessage)

Photon's **Spectrum** SDK (`spectrum-ts`) connects an agent to iMessage (and WhatsApp, terminal, …). It is **TypeScript-only**, so it runs as a small separate process that forwards to our Python backend.

> Verify these details against the live docs while building: https://photon.codes/docs (Getting Started, Messages, Content → Voice/Attachments). The API facts below were checked on 2026-11-07, but the SDK moves fast.

## Setup
1. Sign up at **https://app.photon.codes** (hackathon promo code: `HACKWITHPHOTON`). Create a project, copy **project ID** and **secret**.
2. `cd photon-bridge && bun init -y && bun add spectrum-ts` (Node ≥ 18.17 also works).
3. `.env`: `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `BACKEND_URL=http://localhost:8000`, `BRIDGE_PORT=8787`.
4. The free tier uses a **shared iMessage line pool**: different recipients may see different sender numbers, but each conversation stays stable. Every teammate's phone should text the line once before the demo, so the bridge has a `space` for each person (needed for proactive messages).
5. No credentials yet? Run with the **terminal provider** (`terminal.config()`), which needs no project. Good for development.

## SDK facts we rely on
- `const app = await Spectrum({ projectId, projectSecret, providers: [imessage.config()] })` (or `terminal.config()`).
- `for await (const [space, message] of app.messages)` is one merged async stream. `space` is bound to the conversation.
- Skip our own messages: `if (message.direction === "outbound") continue;`
- `message.sender?.id`: sender identifier (phone/handle on iMessage).
- `message.content.type` is a discriminated union: `"text"` (`.text`), `"attachment"` (`.name`, `.mimeType`, `await .read()` → Buffer), `"voice"` (`.duration`; the voice object exposes `mimeType`, `name?`, `read()` → `Promise<Buffer>`, `stream()`).
- Reply: `await message.reply("...")`; new message: `await space.send("...")`; typing indicator: `space.responding(async () => { ... })`.
- **No transcript is provided for voice notes.** The backend does speech-to-text.
- Free quota is roughly 5,000 messages/day per server, plenty for us.

## Reference implementation (`photon-bridge/src/index.ts`)
Adapt as needed. Confirm the import paths and voice-content shape against the docs.

```ts
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";
const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const useCloud = !!process.env.SPECTRUM_PROJECT_ID;

const app = await Spectrum({
  projectId: process.env.SPECTRUM_PROJECT_ID,
  projectSecret: process.env.SPECTRUM_PROJECT_SECRET,
  providers: useCloud ? [imessage.config()] : [terminal.config()],
});

// senderId -> space, so the backend can send proactive messages (clarifications, HALTs)
const spaces = new Map<string, any>();
const norm = (id?: string) => (id ?? "").replace(/[^\d+]/g, "");

async function forward(res: Response, space: any, message: any) {
  const body = await res.json().catch(() => ({ reply: "⚠️ Ledger is unreachable. Please tell your lead directly." }));
  for (const c of body.conflicts ?? []) await space.send(`🛑 ${c.message}`);
  if (body.reply) await message.reply(body.reply);
}

(async () => {
  for await (const [space, message] of app.messages) {
    if (message.direction === "outbound") continue;
    const phone = norm(message.sender?.id);
    if (phone) spaces.set(phone, space);
    try {
      await space.responding(async () => {
        const c: any = message.content;
        if (c.type === "text") {
          const res = await fetch(`${BACKEND}/api/ingest/text`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ sender_phone: phone, text: c.text, source: "imessage_text" }),
          });
          await forward(res, space, message);
        } else if (c.type === "voice" || (c.type === "attachment" && c.mimeType?.startsWith("audio/"))) {
          const buf: Buffer = await c.read();
          const form = new FormData();
          form.append("sender_phone", phone);
          form.append("source", "imessage_voice");
          form.append("file", new Blob([buf], { type: c.mimeType ?? "audio/x-caf" }), c.name ?? "note.caf");
          const res = await fetch(`${BACKEND}/api/ingest/voice`, { method: "POST", body: form });
          await forward(res, space, message);
        } else {
          await message.reply("I can log text or voice notes 🎙️");
        }
      });
    } catch (err) {
      console.error("[bridge] failed", err);
      await message.reply("⚠️ Couldn't log that. Try again or tell your lead.");
    }
  }
})();

// Backend -> bridge: proactive messages
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/send") {
      const { phone, text } = await req.json();
      const space = spaces.get(norm(phone));
      if (!space) return Response.json({ ok: false, error: "no_space_for_sender" }, { status: 404 });
      await space.send(text);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/health") return Response.json({ ok: true, known: [...spaces.keys()] });
    return new Response("not found", { status: 404 });
  },
});
console.log(`[bridge] up on :${PORT} (${useCloud ? "iMessage" : "terminal"})`);
process.on("SIGINT", async () => { await app.stop(); process.exit(0); });
```

## Message UX (what technicians see)
- After a memo: `Logged ✅ LOTO on BRK-4 (critical). Siemens work on UPS-B.` Short, confirms what we understood, so the tech can correct it right away.
- Clarification: `❓ Quick check before handoff (from your 03:15 note): "the vendor left early". Was that Siemens on UPS-B, and is the tag still on Breaker 4?`
- Answer recorded: `Thanks, recorded: Siemens paused, tag stays on BRK-4 until they return.`
- HALT: `🛑 HALT: UPS-B load bank test conflicts with an active lockout on Breaker 4 (feeds UPS-B), held by Dave Smith (Siemens), work paused 03:15. Do not proceed. Contact shift lead Jordan.`
- Handoff complete (to both leads): `✅ Handoff Night→Day complete 07:14 · 94% · 3 critical items acknowledged by Jordan.`

## Optional polish (Photon track)
- `message.react("👀")` on receipt, `"✅"` after logging. Instant feedback, and it shows off the SDK.
- Use iMessage **polls** for yes/no clarifications if the content type works on the shared line (see Content → Polls in their docs).
- Photon can send voice notes (`voice(buffer)`); a spoken HALT is a memorable demo moment if time allows.
