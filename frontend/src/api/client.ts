import type { FactPatch, Handoff, HandoffDetail } from "./types";
import { simAnswer, simConfirmRoutine, simCreate, simGet, simPatchFact, simStatement, simSubmit } from "./fixtures/sim";

export const FIXTURE_MODE = import.meta.env.VITE_API_MODE !== "live";

// POST /handoffs/{id}/submit answers 409 with `blockers` (docs/API.md). The
// entry shape is not in the contract, so it is kept as-is for display.
export class SubmitBlockedError extends Error {
  constructor(public blockers: unknown[]) {
    super("Submit blocked");
  }
}

// Fixtures by default, because no backend runs yet. Set VITE_API_MODE=live to
// call the FastAPI server through the Vite /api proxy.
const LIVE = !FIXTURE_MODE;

// Demo identity (docs/API.md): the roster id goes in X-User. Not authentication.
let currentUser = "maya";
export function setApiUser(id: string) {
  currentUser = id;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-User", currentUser);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    if (Array.isArray(body?.blockers)) throw new SubmitBlockedError(body.blockers);
  }
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function delay<T>(value: () => T, ms = 900): Promise<T> {
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

export function createHandoff(outgoingId: string, incomingId: string): Promise<Handoff> {
  if (!LIVE) return delay(() => simCreate(), 200);
  return request("/handoffs", {
    method: "POST",
    body: JSON.stringify({ outgoing_id: outgoingId, incoming_id: incomingId }),
  });
}

export function getHandoff(id: string): Promise<HandoffDetail> {
  if (!LIVE) return delay(simGet, 0);
  return request(`/handoffs/${id}`);
}

export type StatementInput = { audio: Blob } | { text: string };

export function postStatement(handoffId: string, input: StatementInput): Promise<HandoffDetail> {
  if (!LIVE) return delay(() => simStatement("text" in input ? input.text : null), "audio" in input ? 1800 : 900);
  if ("audio" in input) {
    const form = new FormData();
    form.append("file", input.audio, "statement.webm");
    return request(`/handoffs/${handoffId}/statements`, { method: "POST", body: form });
  }
  return request(`/handoffs/${handoffId}/statements`, {
    method: "POST",
    body: JSON.stringify({ text: input.text }),
  });
}

export type AnswerInput = { audio: Blob } | { text: string } | { dontKnow: true };

// Typed answers and "I don't know" use the answer route. Voice answers go to the
// statements route with question_id, which is the only route that takes audio.
export function answerQuestion(handoffId: string, questionId: string, input: AnswerInput): Promise<HandoffDetail> {
  if (!LIVE) {
    const answer = "text" in input ? { text: input.text } : "dontKnow" in input ? { dontKnow: true } : {};
    return delay(() => simAnswer(questionId, answer), "audio" in input ? 1800 : 900);
  }
  if ("audio" in input) {
    const form = new FormData();
    form.append("file", input.audio, "answer.webm");
    form.append("question_id", questionId);
    return request(`/handoffs/${handoffId}/statements`, { method: "POST", body: form });
  }
  return request(`/handoffs/${handoffId}/questions/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify("dontKnow" in input ? { dont_know: true } : { text: input.text }),
  });
}

// docs/API.md does not say what PATCH /facts, confirm-routine and submit return,
// so callers refetch GET /handoffs/{id} afterwards instead of trusting the body.

export function patchFact(factId: string, patch: FactPatch): Promise<unknown> {
  if (!LIVE) return delay(() => simPatchFact(factId, patch), 250);
  return request(`/facts/${factId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function confirmRoutine(handoffId: string): Promise<unknown> {
  if (!LIVE) return delay(simConfirmRoutine, 400);
  return request(`/handoffs/${handoffId}/review/confirm-routine`, { method: "POST" });
}

export function submitHandoff(handoffId: string): Promise<unknown> {
  if (!LIVE)
    return delay(() => {
      const blockers = simSubmit();
      if (blockers.length) throw new SubmitBlockedError(blockers);
      return null;
    }, 600);
  return request(`/handoffs/${handoffId}/submit`, { method: "POST" });
}
