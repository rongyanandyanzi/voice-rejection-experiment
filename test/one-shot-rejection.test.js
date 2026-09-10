const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "one-shot-rejection-test-"));
process.env.DATA_DIR = testDataDir;
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-4.1-mini";
process.env.ALLOWED_ORIGINS = "https://*.qualtrics.com,http://localhost:8787";

const {
  server,
  buildInitialManagerPrompt,
  validateRejectionStart,
  originMatches,
  rateLimitAllows,
  managerComplianceCode,
  decodeComplianceCode,
  startRejectionJob,
  rejectionJobView,
  rejectionJobs,
  setRejectionGeneratorForTests,
} = require("../server");

const PROPOSAL = "Hire temporary workers for the summer peak instead of keeping everyone full time all year.";

function stubReply(overrides = {}) {
  return {
    ok: true,
    messages: [
      { speaker: "Manager", text: "I am not approving this version of the seasonal hiring idea." },
      { speaker: "Manager", text: "The plan does not show how many temporary staff the entrance needs on a peak day." },
    ],
    intent: "",
    validation_warnings: [],
    compliance_code: 512 | 1 | 2 | 4,
    ...overrides,
  };
}

test.after(() => {
  setRejectionGeneratorForTests(null);
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("message delivery reframes the first rejection as a written reply without changing its shape", () => {
  const base = { phase: "rejection_initial", condition: "HP_HC", language: "en", alexMessage: PROPOSAL, history: [] };
  const chat = buildInitialManagerPrompt(base);
  const message = buildInitialManagerPrompt({ ...base, delivery: "message" });
  assert.equal(chat.delivery, "chat");
  assert.equal(message.delivery, "message");
  assert.match(message.system, /internal messaging system/);
  assert.match(message.system, /do not greet them, do not ask them anything/);
  assert.doesNotMatch(message.system, /Leave room for the participant to respond/);
  assert.match(chat.system, /Leave room for the participant to respond/);
  assert.match(message.user, /Suggestion submitted by the participant/);
  assert.doesNotMatch(message.user, /Conversation history/);
  assert.equal(message.minMessages, 2);
  assert.equal(message.maxMessages, 2);
  assert.deepEqual(message.messageWordRanges, chat.messageWordRanges);
  assert.deepEqual(message.totalWordTargetRange, chat.totalWordTargetRange);
  assert.equal(message.constructivenessAssessmentMode, chat.constructivenessAssessmentMode);
});

test("start payload validation rejects unknown conditions, short proposals and bad request ids", () => {
  const good = { condition: "lp_lc", language: "en", proposal: PROPOSAL, request_id: "R_1a2B3c4D5e6F7g8" };
  const ok = validateRejectionStart(good);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.condition, "LP_LC");
  assert.equal(ok.value.requestId, "R_1a2B3c4D5e6F7g8");
  assert.equal(validateRejectionStart({ ...good, condition: "HP_XX" }).error, "invalid_condition");
  assert.equal(validateRejectionStart({ ...good, condition: "" }).error, "invalid_condition");
  assert.equal(validateRejectionStart({ ...good, language: "fr" }).error, "invalid_language");
  assert.equal(validateRejectionStart({ ...good, proposal: "too short" }).error, "invalid_proposal_length");
  assert.equal(validateRejectionStart({ ...good, proposal: "x".repeat(2001) }).error, "invalid_proposal_length");
  assert.equal(validateRejectionStart({ ...good, request_id: "short" }).error, "invalid_request_id");
  assert.equal(validateRejectionStart({ ...good, request_id: "bad id with spaces" }).error, "invalid_request_id");
  assert.equal(validateRejectionStart(null).error, "invalid_condition");
});

test("origin allowlist supports exact origins and wildcard subdomains", () => {
  const patterns = ["https://*.qualtrics.com", "http://localhost:8787"];
  assert.equal(originMatches("https://brand.qualtrics.com", patterns), true);
  assert.equal(originMatches("https://brand.eu.qualtrics.com", patterns), true);
  assert.equal(originMatches("http://localhost:8787", patterns), true);
  assert.equal(originMatches("https://qualtrics.com", patterns), false);
  assert.equal(originMatches("http://brand.qualtrics.com", patterns), false);
  assert.equal(originMatches("https://qualtrics.com.evil.example", patterns), false);
  assert.equal(originMatches("not a url", patterns), false);
  assert.equal(originMatches("", patterns), false);
});

test("the per-ip start limit counts only starts inside the window", () => {
  const store = new Map();
  const limit = { count: 2, windowMs: 1000 };
  assert.equal(rateLimitAllows(store, "1.2.3.4", limit, 1000), true);
  assert.equal(rateLimitAllows(store, "1.2.3.4", limit, 1100), true);
  assert.equal(rateLimitAllows(store, "1.2.3.4", limit, 1200), false);
  assert.equal(rateLimitAllows(store, "9.9.9.9", limit, 1200), true);
  assert.equal(rateLimitAllows(store, "1.2.3.4", limit, 2500), true);
});

test("the compliance code round-trips the blind score flags without exposing cue text", () => {
  const scores = {
    specific_problem: true,
    explicit_standard: true,
    actionable_remedy: false,
    current_rejection_redressed: true,
    future_next_step_redressed: false,
    explicit_future_openness: true,
    concrete_reopening_condition: false,
    personal_attack_without_diagnosis: false,
    current_rejection_maintained: true,
    message_scores: [{ politeness_cues: ["I appreciate the thought"], face_threat_cues: [] }],
  };
  const code = managerComplianceCode(scores);
  assert.equal(typeof code, "number");
  const decoded = decodeComplianceCode(code);
  assert.equal(decoded.scored, true);
  assert.equal(decoded.specific_problem, true);
  assert.equal(decoded.explicit_standard, true);
  assert.equal(decoded.actionable_remedy, false);
  assert.equal(decoded.current_rejection_redressed, true);
  assert.equal(decoded.future_next_step_redressed, false);
  assert.equal(decoded.explicit_future_openness, true);
  assert.equal(decoded.personal_attack_without_diagnosis, false);
  assert.equal(decoded.current_rejection_maintained, true);
  assert.equal("politeness_cues" in decoded, false);
  assert.equal(managerComplianceCode(null), 0);
  assert.equal(decodeComplianceCode(0).scored, false);
});

test("a job runs the message-delivery rejection in the background and is reused on reload", async () => {
  const calls = [];
  const value = validateRejectionStart({ condition: "HP_LC", proposal: PROPOSAL, request_id: "R_jobreuse000001", prolific_pid: "pid-1" }).value;
  const { job, reused } = startRejectionJob(value, {
    generate: async (payload) => {
      calls.push(payload);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return stubReply();
    },
  });
  assert.equal(reused, false);
  assert.equal(job.status, "pending");
  assert.equal(rejectionJobView(job).status, "pending");
  assert.equal("messages" in rejectionJobView(job), false);
  const again = startRejectionJob(value, { generate: async () => stubReply() });
  assert.equal(again.reused, true);
  assert.equal(again.job, job);
  await job.promise;
  const view = rejectionJobView(job);
  assert.equal(view.ok, true);
  assert.equal(view.status, "ok");
  assert.equal(view.messages.length, 2);
  assert.equal(view.compliance_code, 512 | 1 | 2 | 4);
  assert.equal(typeof view.latency_ms, "number");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "manager1");
  assert.equal(calls[0].phase, "rejection_initial");
  assert.equal(calls[0].delivery, "message");
  assert.equal(calls[0].condition, "HP_LC");
  assert.equal(calls[0].alexMessage, PROPOSAL);
  assert.equal(calls[0].history[0].speaker, "Manager");
  assert.equal(calls[0].prolific_pid, "pid-1");
  assert.equal(rejectionJobs.get("R_jobreuse000001"), job);
});

test("a failed job reports the failure and is replaced by the next start", async () => {
  const value = validateRejectionStart({ condition: "LP_HC", proposal: PROPOSAL, request_id: "R_jobfail0000001" }).value;
  const first = startRejectionJob(value, { generate: async () => { throw new Error("boom"); } });
  await first.job.promise;
  const failed = rejectionJobView(first.job);
  assert.equal(failed.ok, false);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "boom");
  assert.equal(failed.retryable, true);
  assert.equal(failed.attempts, 2, "a retryable failure is re-run once before the job is reported failed");
  const second = startRejectionJob(value, { generate: async () => stubReply() });
  assert.equal(second.reused, false);
  assert.notEqual(second.job, first.job);
  await second.job.promise;
  assert.equal(rejectionJobView(second.job).status, "ok");
});

test("a retryable pipeline failure is re-run once inside the job; a non-retryable one is not", async () => {
  let calls = 0;
  const value = validateRejectionStart({ condition: "HP_HC", proposal: PROPOSAL, request_id: "R_jobrerun000001" }).value;
  const { job } = startRejectionJob(value, {
    generate: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 502, retryable: true, error: "validation failed" };
      return stubReply();
    },
  });
  await job.promise;
  assert.equal(calls, 2);
  const view = rejectionJobView(job);
  assert.equal(view.status, "ok");
  assert.equal(view.attempts, 2);

  let hardCalls = 0;
  const hard = validateRejectionStart({ condition: "HP_HC", proposal: PROPOSAL, request_id: "R_jobnoretry0001" }).value;
  const second = startRejectionJob(hard, {
    generate: async () => { hardCalls += 1; return { ok: false, status: 400, retryable: false, error: "bad input" }; },
  });
  await second.job.promise;
  assert.equal(hardCalls, 1);
  assert.equal(rejectionJobView(second.job).status, "failed");
  assert.equal(rejectionJobView(second.job).attempts, 1);
});

test("http routes enforce the origin allowlist, validate input, start and poll a job", async () => {
  setRejectionGeneratorForTests(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return stubReply();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const allowed = { "content-type": "application/json", origin: "https://brand.qualtrics.com" };
  const body = JSON.stringify({ condition: "HP_HC", language: "en", proposal: PROPOSAL, request_id: "R_httpjob0000001" });
  try {
    const denied = await fetch(`${base}/api/rejection/start`, { method: "POST", headers: { ...allowed, origin: "https://evil.example" }, body });
    assert.equal(denied.status, 403);

    const invalid = await fetch(`${base}/api/rejection/start`, { method: "POST", headers: allowed, body: JSON.stringify({ condition: "nope", proposal: PROPOSAL, request_id: "R_httpjob0000002" }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error, "invalid_condition");

    const started = await fetch(`${base}/api/rejection/start`, { method: "POST", headers: allowed, body });
    assert.equal(started.status, 200);
    const startedData = await started.json();
    assert.equal(startedData.ok, true);
    assert.equal(startedData.job, "R_httpjob0000001");
    assert.equal(startedData.reused, false);

    const reloaded = await fetch(`${base}/api/rejection/start`, { method: "POST", headers: allowed, body });
    assert.equal((await reloaded.json()).reused, true);

    let view = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await fetch(`${base}/api/rejection/result?job=R_httpjob0000001`, { headers: { origin: "https://brand.qualtrics.com" } });
      assert.equal(response.status, 200);
      view = await response.json();
      if (view.status !== "pending") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(view.status, "ok");
    assert.equal(view.messages.length, 2);
    assert.equal(view.compliance_code, 512 | 1 | 2 | 4);

    const unknown = await fetch(`${base}/api/rejection/result?job=R_unknownjob0001`, { headers: { origin: "https://brand.qualtrics.com" } });
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).status, "unknown");

    const deniedPoll = await fetch(`${base}/api/rejection/result?job=R_httpjob0000001`, { headers: { origin: "https://evil.example" } });
    assert.equal(deniedPoll.status, 403);

    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
  } finally {
    setRejectionGeneratorForTests(null);
    await new Promise((resolve) => server.close(resolve));
  }
});
