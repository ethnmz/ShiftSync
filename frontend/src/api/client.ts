import type {
  Blocker,
  Briefing,
  FactPatch,
  FollowUp,
  Handoff,
  HandoffDetail,
  HandoffSummary,
  VerificationAttempt,
  VerificationCheck,
} from "./types";
import * as sim from "./fixtures/sim";

// Fixtures by default, because no backend runs yet. Set VITE_API_MODE=live to
// call the FastAPI server through the Vite /api proxy. Fixture responses come
// from ./fixtures/sim and are labeled "Offline demo data" in the shell.
export const FIXTURE_MODE = import.meta.env.VITE_API_MODE !== "live";
const LIVE = !FIXTURE_MODE;

// Any failed request. `message` is safe to show the operator.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

// 409 from submit, with the backend's blockers (shape: ethnmz/hackutd2026#10).
export class SubmitBlockedError extends ApiError {
  constructor(public blockers: (Blocker | string)[]) {
    super("Submit blocked", 409, "submit_blocked");
  }
}

// Demo identity (docs/API.md): the roster id goes in X-User. Not authentication.
let currentUser = "maya";
export function setApiUser(id: string) {
  currentUser = id;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-User", currentUser);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach the ShiftSync server. Check the connection and try again.", 0, "network");
  }
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    // One error format for every 4xx, proposed in ethnmz/hackutd2026#10:
    // {detail: {code, message, ...extra}}; submit_blocked carries
    // detail.blockers. The top-level `blockers` from docs/API.md is accepted too.
    const detail = body?.detail;
    const blockers = detail?.blockers ?? body?.blockers;
    if (res.status === 409 && Array.isArray(blockers)) throw new SubmitBlockedError(blockers);
    const message =
      (typeof detail === "object" && typeof detail?.message === "string" && detail.message) ||
      (typeof detail === "string" && detail) ||
      (res.status === 403 ? "Your demo user's role can't do this." : `Request failed (${res.status}).`);
    throw new ApiError(message, res.status, typeof detail === "object" ? detail?.code : undefined);
  }
  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function delay<T>(value: () => T, ms = 600): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(value());
      } catch (e) {
        reject(e);
      }
    }, ms),
  );
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

function audioForm(audio: Blob, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

// ---- Handoffs -------------------------------------------------------------

export function createHandoff(outgoingId: string, incomingId: string): Promise<Handoff> {
  if (!LIVE) return delay(() => sim.simCreate(), 200);
  return request("/handoffs", json({ outgoing_id: outgoingId, incoming_id: incomingId }));
}

export function listHandoffs(): Promise<HandoffSummary[]> {
  if (!LIVE) return delay(sim.simList, 150);
  return request("/handoffs?limit=20");
}

export function getHandoff(id: string): Promise<HandoffDetail> {
  if (!LIVE) return delay(() => sim.simGet(id), 0);
  return request(`/handoffs/${id}`);
}

// ---- Shift A --------------------------------------------------------------

export type StatementInput = { audio: Blob } | { text: string };

export function postStatement(handoffId: string, input: StatementInput): Promise<HandoffDetail> {
  if (!LIVE) return delay(() => sim.simStatement("text" in input ? input.text : null), "audio" in input ? 1600 : 900);
  if ("audio" in input) return request(`/handoffs/${handoffId}/statements`, { method: "POST", body: audioForm(input.audio) });
  return request(`/handoffs/${handoffId}/statements`, json({ text: input.text }));
}

export type AnswerInput = { audio: Blob } | { text: string } | { dontKnow: true };

// Typed answers and "I don't know" use the answer route. Voice answers go to
// the statements route with question_id, the route that takes audio.
export function answerQuestion(handoffId: string, questionId: string, input: AnswerInput): Promise<HandoffDetail> {
  if (!LIVE) {
    const answer = "text" in input ? { text: input.text } : "dontKnow" in input ? { dontKnow: true } : {};
    return delay(() => sim.simAnswer(questionId, answer), "audio" in input ? 1600 : 800);
  }
  if ("audio" in input)
    return request(`/handoffs/${handoffId}/statements`, { method: "POST", body: audioForm(input.audio, { question_id: questionId }) });
  return request(`/handoffs/${handoffId}/questions/${questionId}/answer`, json("dontKnow" in input ? { dont_know: true } : { text: input.text }));
}

// docs/API.md on main does not say what these return (ethnmz/hackutd2026#10
// proposes HandoffDetail), so callers refetch GET /handoffs/{id} afterwards.
export function patchFact(factId: string, patch: FactPatch): Promise<unknown> {
  if (!LIVE) return delay(() => sim.simPatchFact(factId, patch), 250);
  return request(`/facts/${factId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function confirmRoutine(handoffId: string): Promise<unknown> {
  if (!LIVE) return delay(sim.simConfirmRoutine, 400);
  return request(`/handoffs/${handoffId}/review/confirm-routine`, { method: "POST" });
}

export function submitHandoff(handoffId: string): Promise<unknown> {
  if (!LIVE)
    return delay(() => {
      const blockers = sim.simSubmit();
      if (blockers.length) throw new SubmitBlockedError(blockers);
      return null;
    }, 600);
  return request(`/handoffs/${handoffId}/submit`, { method: "POST" });
}

// ---- Shift B --------------------------------------------------------------

export function getBriefing(handoffId: string): Promise<Briefing> {
  if (!LIVE) return delay(() => sim.simBriefing(handoffId), 300);
  return request(`/handoffs/${handoffId}/briefing`);
}

export function acknowledge(handoffId: string): Promise<unknown> {
  if (!LIVE) return delay(() => sim.simAcknowledge(currentUser), 400);
  return request(`/handoffs/${handoffId}/acknowledge`, { method: "POST" });
}

export function startVerification(handoffId: string): Promise<VerificationCheck> {
  if (!LIVE) return delay(sim.simStartVerification, 500);
  return request(`/handoffs/${handoffId}/verification/start`, { method: "POST" });
}

export function answerVerification(checkId: string, input: StatementInput): Promise<VerificationAttempt> {
  if (!LIVE) return delay(() => sim.simAnswerVerification(checkId, "text" in input ? input.text : null), 1200);
  if ("audio" in input) return request(`/verification/${checkId}/answer`, { method: "POST", body: audioForm(input.audio) });
  return request(`/verification/${checkId}/answer`, json({ text: input.text }));
}

export function clarifiedInPerson(checkId: string, note: string): Promise<unknown> {
  if (!LIVE) return delay(() => sim.simClarifiedInPerson(checkId, note, currentUser), 400);
  return request(`/verification/${checkId}/clarified-in-person`, json({ note }));
}

// ---- Follow-ups -----------------------------------------------------------

// GET /followups?status=open (docs/API.md). Rows are FollowUp; the API shape
// has no handoff id, so callers link to the Receive list.
export function listFollowups(status = "open"): Promise<FollowUp[]> {
  if (!LIVE) return delay(() => sim.simListFollowups(status), 150);
  return request(`/followups?status=${encodeURIComponent(status)}`);
}

export function assignFollowup(id: string, ownerId: string, deadline: string | null): Promise<unknown> {
  if (!LIVE) return delay(() => sim.simAssignFollowup(id, ownerId, deadline, currentUser), 400);
  return request(`/followups/${id}`, { method: "PATCH", body: JSON.stringify({ owner_id: ownerId, deadline }) });
}

export function closeFollowup(id: string, text: string): Promise<unknown> {
  if (!LIVE) return delay(() => sim.simCloseFollowup(id, text, currentUser), 400);
  return request(`/followups/${id}/close`, json({ text }));
}

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof ApiError && e.status !== 409 ? e.message : fallback;
}

// Offline demo only: replays demo/scenario.json steps 1-6 so Receive has a
// submitted handoff. Never called in live mode.
export function loadOfflineDemo(): Promise<HandoffSummary> {
  if (LIVE) return Promise.reject(new ApiError("The offline demo is not available in live mode.", 0));
  return delay(sim.simLoadSubmittedDemo, 400);
}
