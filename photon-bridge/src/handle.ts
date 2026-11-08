/**
 * One inbound iMessage → POST /api/inbound/imessage → reply bubbles (docs/PHOTON_BRIDGE.md).
 *
 * The backend owns everything else: roster lookup, which handoff, transcription,
 * analysis and the wording of every bubble. This file only moves bytes and text.
 * It takes plain space/message objects so tests can pass fakes.
 */
import type { Message, Space } from "spectrum-ts";

export interface BridgeConfig {
  backendUrl: string;
  /** Sender id → roster phone. Real numbers live in .env, never in config/roster.yaml. */
  senderMap: Map<string, string>;
  /** Terminal mode: every message comes from this roster phone. */
  fixedPhone?: string;
  fetch?: typeof fetch;
}

interface Bubbles {
  reply?: string;
  followups?: string[];
}

export const UNREACHABLE = "⚠️ ShiftSync is unreachable. Please hand off in person.";
export const UNSUPPORTED = "I can log a text or a voice note 🎙️";
const FAILED = "⚠️ Couldn't log that. Try again or use the web app.";

// iMessage voice notes are CAF. The backend keeps the extension, and ffmpeg reads the rest.
const EXTENSIONS: Record<string, string> = {
  "audio/x-caf": ".caf", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/webm": ".webm", "audio/amr": ".amr",
};

/** "+12145550123=+15550100001, me@icloud.com=+15550100004" → Map. */
export function parseSenderMap(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (raw ?? "").split(",")) {
    const [from, to] = pair.split("=").map((s) => s.trim());
    if (from && to) map.set(from, to);
  }
  return map;
}

export function senderPhone(message: Message, cfg: BridgeConfig): string {
  if (cfg.fixedPhone) return cfg.fixedPhone;
  const id = message.sender?.id ?? "";
  return cfg.senderMap.get(id) ?? id;
}

export async function handle(space: Space, message: Message, cfg: BridgeConfig): Promise<void> {
  if (message.direction === "outbound") return;
  const c = message.content;
  console.log(`[bridge] received ${c.type}`); // type only: no message content or sender in the log
  const isAudio = c.type === "voice" || (c.type === "attachment" && c.mimeType.startsWith("audio/"));
  if (c.type !== "text" && !isAudio) {
    await message.reply(UNSUPPORTED);
    return;
  }
  await space.responding(async () => {
    const phone = senderPhone(message, cfg);
    let init: RequestInit;
    if (c.type === "text") {
      init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sender_phone: phone, text: c.text }),
      };
    } else if (c.type === "voice" || c.type === "attachment") {
      const form = new FormData();
      form.append("sender_phone", phone);
      const name = c.name ?? `voice-note${EXTENSIONS[c.mimeType] ?? ".caf"}`;
      const bytes = new Uint8Array(await c.read());
      console.log(`[bridge] downloaded ${c.mimeType}, ${bytes.length} bytes`);
      form.append("file", new Blob([bytes], { type: c.mimeType }), name);
      init = { method: "POST", body: form };
    } else {
      return;
    }
    const bubbles = await post(cfg, init, message.sender?.id ?? "");
    if (bubbles.reply) await message.reply(bubbles.reply);
    for (const text of bubbles.followups ?? []) await space.send(text);
  });
}

/** The backend's bubbles, or one bubble that says what went wrong. Never throws. */
async function post(cfg: BridgeConfig, init: RequestInit, senderId: string): Promise<Bubbles> {
  let res: Response;
  try {
    res = await (cfg.fetch ?? fetch)(`${cfg.backendUrl}/api/inbound/imessage`, init);
  } catch (err) {
    console.error("[bridge] backend unreachable:", (err as Error).message);
    return { reply: UNREACHABLE };
  }
  const body: any = await res.json().catch(() => null);
  if (res.ok && body) return body as Bubbles;
  // 4xx messages (unknown number, failed transcription, already submitted) are written for the operator.
  const message = body?.detail?.message;
  const code = body?.detail?.code ?? "no body";
  console.error(`[bridge] backend ${res.status}: ${code}`);
  if (code === "unknown_sender") {
    // Setup help: the exact id iMessage reports is what SENDER_MAP needs.
    console.error(`[bridge] sender "${senderId}" isn't mapped. Add "${senderId}=<roster phone>" to SENDER_MAP in .env.`);
  }
  return { reply: res.status < 500 && typeof message === "string" ? message : FAILED };
}
