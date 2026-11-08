import { beforeEach, describe, expect, it } from "vitest";
import * as sim from "./api/fixtures/sim";
import { SubmitBlockedError, submitHandoff } from "./api/client";
import { criticalUnreviewed, isRaise, submitDisabledReason } from "./review";

const A1 = "The replacement battery module didn't arrive, so the vendor couldn't do the final load test.";
const A2 = "No. It's still in maintenance bypass. It's not cleared until the vendor finishes the load test and signs off.";
const A3 = "It was Chiller 2. I never got a report. I honestly don't know if they finished.";

function throughClarify() {
  sim.simCreate();
  sim.simStatement("note");
  sim.simAnswer("Q-1", { text: A1 });
  sim.simAnswer("Q-2", { text: A2 });
  return sim.simAnswer("Q-3", { text: A3 });
}

function reviewAll() {
  const h = sim.simGet();
  for (const item of h.items)
    for (const f of item.facts) if (item.priority === "critical" && f.review_state === "ai_extracted") sim.simPatchFact(f.id, { review_state: "operator_confirmed" });
  sim.simConfirmRoutine();
}

describe("review rules", () => {
  it("only treats a higher level as raising certainty", () => {
    expect(isRaise("unknown", "confirmed")).toBe(true);
    expect(isRaise("unverified", "reported")).toBe(true);
    expect(isRaise("confirmed", "unverified")).toBe(false);
    expect(isRaise("reported", "reported")).toBe(false);
  });

  it("blocks submit while critical facts are unchecked, then clears", () => {
    expect(submitDisabledReason(null)).toMatch(/Record or type/);
    const h = throughClarify();
    expect(h.state).toBe("in_review");
    expect(h.budget.used).toBe(3);
    expect(criticalUnreviewed(h).length).toBeGreaterThan(0);
    expect(submitDisabledReason(h)).toMatch(/critical/);
    reviewAll();
    expect(submitDisabledReason(sim.simGet())).toBeNull();
  });

  it("checking an unknown fact keeps it unknown", () => {
    throughClarify();
    const unknown = sim.simGet().items.flatMap((i) => i.facts).find((f) => f.certainty === "unknown")!;
    sim.simPatchFact(unknown.id, { review_state: "operator_confirmed" });
    const after = sim.simGet().items.flatMap((i) => i.facts).find((f) => f.id === unknown.id)!;
    expect(after.review_state).toBe("operator_confirmed");
    expect(after.certainty).toBe("unknown");
  });

  it("refuses to raise certainty without an operator statement", () => {
    throughClarify();
    const f = sim.simGet().items[0].facts[0];
    expect(() => sim.simPatchFact(f.id, { review_state: "operator_edited", certainty: "confirmed" })).toThrow(/statement/);
    sim.simPatchFact(f.id, { review_state: "operator_edited", certainty: "confirmed", text: "I saw the vendor's signed report." });
    const h = sim.simGet();
    expect(h.statements[h.statements.length - 1]?.role).toBe("review_edit");
  });
});

describe("submit", () => {
  beforeEach(() => throughClarify());

  it("surfaces backend blockers and does not submit", async () => {
    await expect(submitHandoff("H-0007")).rejects.toBeInstanceOf(SubmitBlockedError);
    expect(sim.simGet().state).toBe("in_review");
    expect(sim.simGet().status_line.submitted_at).toBeNull();
  });

  it("submits once everything critical is checked", async () => {
    reviewAll();
    await submitHandoff("H-0007");
    expect(sim.simGet().state).toBe("submitted");
  });

  it("an 'I don't know' answer counts as answering a safety question", () => {
    sim.simCreate();
    sim.simStatement("note");
    sim.simAnswer("Q-1", { text: A1 });
    const h = sim.simAnswer("Q-2", { dontKnow: true });
    expect(h.questions.find((q) => q.id === "Q-2")?.status).toBe("answered_unknown");
  });
});

describe("receive", () => {
  beforeEach(() => sim.simLoadSubmittedDemo());

  it("only the incoming lead acknowledges, and acknowledging is not verifying", () => {
    expect(() => sim.simAcknowledge("maya")).toThrow(/incoming/);
    sim.simAcknowledge("jordan");
    const h = sim.simGet();
    expect(h.state).toBe("acknowledged");
    expect(h.status_line.acknowledged_at).not.toBeNull();
    expect(h.status_line.verified_at).toBeNull();
  });

  it("needs acknowledgment before the check starts", () => {
    expect(() => sim.simStartVerification()).toThrow(/Acknowledge/);
  });

  it("catches a wrong answer, allows a retry, and verifies", () => {
    sim.simAcknowledge("jordan");
    const v1 = sim.simStartVerification();
    const a1 = sim.simAnswerVerification(v1.id, "Maintenance is complete, so we can start testing.");
    expect(a1.verdict).toBe("inconsistent");
    expect(a1.status).toBe("pending");
    expect(a1.feedback).toMatch(/authorized procedures/);
    expect(a1.feedback).not.toMatch(/safe|you may proceed/i);
    expect(a1.evidence.length).toBeGreaterThan(0);
    const a2 = sim.simAnswerVerification(v1.id, "Not finished: the load test is pending and it's in bypass, not cleared until sign-off.");
    expect(a2.verdict).toBe("consistent");
    expect(a2.next_check?.id).toBe("V-2");
    sim.simAnswerVerification("V-2", "Chiller 2 result is unknown, no report yet.");
    const h = sim.simGet();
    expect(h.state).toBe("verified");
    // Verification never closes follow-ups.
    expect(h.status_line.open_followups).toBeGreaterThan(0);
  });

  it("after two misses a lead clarifies in person and the result is assisted", () => {
    sim.simAcknowledge("jordan");
    const v1 = sim.simStartVerification();
    sim.simAnswerVerification(v1.id, "It's done.");
    const a2 = sim.simAnswerVerification(v1.id, "It's complete.");
    expect(a2.status).toBe("needs_clarification");
    expect(() => sim.simAnswerVerification(v1.id, "third try")).toThrow(/closed/);
    expect(() => sim.simClarifiedInPerson(v1.id, "Walked through it", "dana")).toThrow(/lead/);
    sim.simClarifiedInPerson(v1.id, "Walked Jordan through the load test status", "jordan");
    sim.simAnswerVerification("V-2", "Chiller 2 is unknown, no report.");
    expect(sim.simGet().state).toBe("verified_with_assistance");
  });

  it("only a lead or supervisor assigns follow-up owners", () => {
    const fu = sim.simGet().followups[0];
    expect(() => sim.simAssignFollowup(fu.id, "sam", null, "sam")).toThrow(/lead or supervisor/);
    sim.simAssignFollowup(fu.id, "sam", "2026-11-09T15:00:00Z", "dana");
    const after = sim.simGet().followups[0];
    expect(after.owner_label).toBe("Sam Okafor");
    expect(after.assigned_by).toEqual({ id: "dana", name: "Dana Ellis" });
  });
});
