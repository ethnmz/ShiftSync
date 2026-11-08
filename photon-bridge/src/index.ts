/**
 * ShiftSync's iMessage line (optional P1, docs/PHOTON_BRIDGE.md).
 *
 * With SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET set, this listens on
 * Photon's iMessage line. Without them it uses Spectrum's terminal chat, so the
 * flow can be tried with no account. Run with `npm start`.
 */
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";

import { type BridgeConfig, type SendTo, deliverNotices, handle, parseSenderMap } from "./handle.ts";

const NOTICE_POLL_MS = 4000;

try {
  process.loadEnvFile(".env"); // keeps variables already set in the shell
} catch {
  // no .env: terminal mode with defaults
}

const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
const cloud = Boolean(projectId && projectSecret);

const cfg: BridgeConfig = {
  backendUrl: (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, ""),
  senderMap: parseSenderMap(process.env.SENDER_MAP),
  // Assumption: terminal chat has no phone number, so it speaks as Maya (night lead) unless told otherwise.
  fixedPhone: cloud ? undefined : (process.env.TERMINAL_SENDER_PHONE ?? "+15550100001"),
};

const iMessageApp = cloud
  ? await Spectrum({ projectId: projectId!, projectSecret: projectSecret!, providers: [imessage.config()] })
  : null;
const app = iMessageApp ?? (await Spectrum({ providers: [terminal.config()] }));

console.log(`[bridge] ${cloud ? "iMessage" : `terminal (as ${cfg.fixedPhone})`} → ${cfg.backendUrl}`);

process.on("SIGINT", async () => {
  await app.stop();
  process.exit(0);
});

if (iMessageApp) {
  const line = imessage(iMessageApp);
  const sendTo: SendTo = async (senderId, text) => {
    const space = await line.space.create(await line.user(senderId));
    await space.send(text);
  };
  setInterval(() => void deliverNotices(cfg, sendTo), NOTICE_POLL_MS);
}

for await (const [space, message] of app.messages) {
  try {
    await handle(space, message, cfg);
  } catch (err) {
    console.error("[bridge] failed:", err);
    await message.reply("⚠️ Couldn't log that. Try again or use the web app.").catch(() => {});
  }
}
