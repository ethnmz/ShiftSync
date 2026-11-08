# Optional P1: Photon iMessage channel

**Priority P1 ("additional handoff data ingestion").** Build only after the P0 web flow works end to end. The web app is the primary interface.

What it adds: an operator on the floor can text or send a voice note to the ShiftSync iMessage line. It lands as a `Statement` on their open draft handoff (one is created if none exists) and goes through the **same** extraction, certainty floors and clarification pipeline. Clarification questions are mirrored back as iMessages, and the operator can answer by voice, text or "don't know". Review and submit always happen in the web app (Screen 1), and Shift B verification stays in the web app (Screen 2). The pack mentions Photon's track. This repo does not confirm eligibility, and the promo code below is only the pack's public hint, not a credential.

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

// senderId -> space, so the backend can send proactive messages (clarification questions)
const spaces = new Map<string, any>();
const norm = (id?: string) => (id ?? "").replace(/[^\d+]/g, "");

async function forward(res: Response, space: any, message: any) {
  const body = await res.json().catch(() => ({ reply: "⚠️ ShiftSync is unreachable. Please hand off in person." }));
  if (body.reply) await message.reply(body.reply);
  // followups = next clarification question(s), one bubble each
  for (const f of body.followups ?? []) await space.send(f);
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
          const res = await fetch(`${BACKEND}/api/inbound/imessage`, {
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
          const res = await fetch(`${BACKEND}/api/inbound/imessage`, { method: "POST", body: form });
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

## Message UX (short bubbles)
- Statement received: `Got it. Added to your handoff for Jordan: UPS-B (⚠ unverified: "mostly"), Generator 1 (◔ reported), cooling inspection (? unknown).`
- Clarification: `(1/3) You said UPS-B is "mostly finished." What work remains, and why wasn't it completed?  Reply, send a voice note, or "don't know".`
- Done: `That's all I need. Review and submit here: <link to /create>`
- Never send anything that sounds like authorization ("cleared", "safe") unless it repeats a confirmed fact.

## Optional polish (Photon track)
- Tapbacks: react 👀 on receipt and ✅ when a fact is confirmed, for instant feedback without extra bubbles.
- Photon can send voice notes (`voice(buffer)`): reading the briefing aloud to the incoming lead is a strong demo touch if time allows. Don't use polls for check questions; they must stay open-ended.
