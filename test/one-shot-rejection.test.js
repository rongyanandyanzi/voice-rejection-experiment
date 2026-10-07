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
  managerConstructivenessAssessmentProblem,
  managerConstructivenessCueWarning,
  managerSafetyProblem,
  lowPolitenessWordingProblem,
  paragraphTwoChannelForRequest,
  isWrittenRejectionPrompt,
  WRITTEN_TEMPORAL_SOFTENERS,
  aiRequestColumns,
  originMatches,
  rateLimitAllows,
  managerComplianceCode,
  decodeComplianceCode,
  startRejectionJob,
  rejectionJobView,
  rejectionJobs,
  setRejectionGeneratorForTests,
} = require("../server");

const PROPOSAL = "Comments 3, 6 and 8 each raised two separate problems, so one of them is never counted. Allow an optional second category for those.";

function stubReply(overrides = {}) {
  return {
    ok: true,
    messages: [
      { speaker: "Manager", text: "I am not adding a second category in this form." },
      { speaker: "Manager", text: "The note does not show how often a second problem is really separate, or whether two coders would agree on it." },
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
  assert.match(message.system, /coding supervisor on a research group's comment-coding project/);
  assert.match(message.system, /You wrote the current rules and stand by them/);
  assert.match(message.system, /never mention other coders, other notes, or a queue/);
  assert.match(message.system, /first batch of eight comments, three \(comments 3, 6 and 8\)/);
  assert.doesNotMatch(message.system, /Aetheria Gardens|ticket|marketing/);
  assert.match(chat.system, /Aetheria Gardens/);
  assert.match(message.system, /so do not ask them anything/);
  assert.doesNotMatch(message.system, /do not greet them/);
  assert.doesNotMatch(message.system, /Reject the proposal for now/);
  assert.doesNotMatch(message.system, /Leave room for the participant to respond/);
  assert.match(chat.system, /Leave room for the participant to respond/);
  assert.match(message.user, /Note the coder attached/);
  assert.match(message.user, /anything about the coding process you'd like to tell them/);
  assert.doesNotMatch(message.user, /Conversation history/);
  assert.equal(message.minMessages, 2);
  assert.equal(message.maxMessages, 2);
  assert.deepEqual(message.messageWordRanges, chat.messageWordRanges);
  assert.deepEqual(message.totalWordTargetRange, chat.totalWordTargetRange);
  assert.equal(message.constructivenessAssessmentMode, chat.constructivenessAssessmentMode);
});

test("written replies carry the full politeness channel set in both paragraphs", () => {
  const prompt = (condition) => buildInitialManagerPrompt({
    phase: "rejection_initial", condition, language: "en", alexMessage: PROPOSAL, history: [], delivery: "message",
  });
  for (const condition of ["HP_HC", "HP_LC"]) {
    const system = prompt(condition).system;
    assert.match(system, /Salutation warmth: open with a warm one- or two-word greeting/);
    assert.match(system, /Relational acknowledgement: thank them for the note/);
    assert.match(system, /Validation of effort: recognise the care or effort/);
    assert.match(system, /Hedge before the refusal/);
    assert.match(system, /Paragraph 2 \(Message 2\) carries exactly these two politeness moves/);
    assert.match(system, /Mood of directives, carrying the reopening: paragraph 2 always leaves the door open to bringing the proposal back later and says on what terms, in one conditional or tentative invitation/);
    assert.match(system, /A contrastive word alone, such as but, still, or that said, is not enough/);
    assert.match(system, /never a line to copy\. Word each move freshly/);
    assert.match(system, /State the refusal once, in paragraph 1\. Paragraph 2 never says no again/);
    assert.match(system, /No temporal softener in any paragraph/);
    assert.doesNotMatch(system, /Quota: one such move in each message/);
  }
  for (const condition of ["LP_HC", "LP_LC"]) {
    const system = prompt(condition).system;
    assert.match(system, /No salutation\. Open with a curt, cold acknowledgement/);
    assert.match(system, /Bald refusal: refuse in your own first-person voice/);
    assert.match(system, /low-politeness poles of the same two channels a high-politeness reply uses/);
    assert.match(system, /Mood of directives, carrying the reopening: paragraph 2 always leaves the door open to bringing the proposal back later and says on what terms, in one bare imperative \(Come back with\.\.\., Bring it back when\.\.\., Don't bring it back until\.\.\.\)/);
    assert.match(system, /State the refusal once, in paragraph 1\. Paragraph 2 never says no again/);
    assert.match(system, /The door is as open as in a polite reply; only the tone is cold/);
    assert.match(system, /The edge goes to the idea, never to the person/);
    assert.match(system, /No temporal softener in any paragraph/);
    assert.doesNotMatch(system, /Never start a feedback or remedy sentence with a bare command verb/);
    assert.doesNotMatch(system, /Quota: one such move in each message/);
  }
  // Low constructiveness has its own written block: neutral general remarks, a content-free
  // reopening line, and none of the chat block's restatement, timing or pushback wording.
  for (const condition of ["HP_LC", "LP_LC"]) {
    const system = prompt(condition).system;
    assert.match(system, /Paragraph 2 is two or three plain, general remarks/);
    assert.match(system, /The remarks themselves are neutral in tone under both politeness styles/);
    assert.match(system, /The reopening line is content-free/);
    assert.match(system, /so that you name its broad topic correctly/);
    assert.doesNotMatch(system, /curt restatement of the broad topic and of the unchanged decision/);
    assert.doesNotMatch(system, /the timing is not right|general readiness, timing, or fit/);
    assert.doesNotMatch(system, /pushes back or asks for clarification/);
    assert.doesNotMatch(system, /engage THAT specific idea and its real consequences/);
  }
  // High constructiveness keeps the specific engagement, and gives the remedy inside the reopening line.
  for (const condition of ["HP_HC", "LP_HC"]) {
    const system = prompt(condition).system;
    assert.match(system, /engage THAT specific idea and its real consequences/);
    assert.match(system, /This path is the terms of the reopening line/);
    assert.doesNotMatch(system, /not yet supported/);
  }
  // The chat design keeps its own low-constructiveness wording untouched.
  const chatSystem = buildInitialManagerPrompt({ phase: "rejection_initial", condition: "LP_LC", language: "en", alexMessage: PROPOSAL, history: [] }).system;
  assert.match(chatSystem, /curt restatement of the broad topic and of the unchanged decision/);
});

test("paragraph 2 draws one paired channel, the same pool and pole pairs in all four cells", () => {
  const prompt = (condition, politenessChannel) => buildInitialManagerPrompt({
    phase: "rejection_initial", condition, language: "en", alexMessage: PROPOSAL, history: [], delivery: "message", politenessChannel,
  });
  const poles = {
    closing: [/Closing warmth: the last sentence is one warm closing/, /Cold closing: the last sentence is a curt, dismissive sign-off about the matter.*It is not an instruction, sets no further condition on bringing the proposal back/],
    appreciation: [/Appreciation: one clause that values the specific thinking/, /Flat verdict: one more flat, sharp judgement of the proposal/],
    hedge: [/Hedge: qualify the main judgement of paragraph 2 tentatively/, /Categorical statement: state the main point of paragraph 2 flatly, as plain fact/],
    deference: [/Deference: one clause that defers to their view/, /Authority: one clause that flatly asserts that the coding rules are yours/],
  };
  for (const [channel, [high, low]] of Object.entries(poles)) {
    for (const condition of ["HP_HC", "HP_LC"]) {
      const built = prompt(condition, channel);
      assert.equal(built.politenessChannel, channel);
      assert.match(built.system, high);
      assert.doesNotMatch(built.system, low);
    }
    for (const condition of ["LP_HC", "LP_LC"]) {
      const built = prompt(condition, channel);
      assert.match(built.system, low);
      assert.doesNotMatch(built.system, high);
    }
  }
  // Without a requested channel the server draws one from the pool; chat turns draw nothing.
  const drawn = new Set(Array.from({ length: 60 }, () => prompt("HP_LC").politenessChannel));
  assert.ok([...drawn].every((name) => Object.keys(poles).includes(name)));
  assert.ok(drawn.size > 1);
  const chat = buildInitialManagerPrompt({ phase: "rejection_initial", condition: "HP_LC", language: "en", alexMessage: PROPOSAL, history: [] });
  assert.equal(chat.politenessChannel, "");
  // The job derives the channel from the request id, so it is stable across attempts, replacement
  // jobs and restarts, and spread across the pool.
  assert.equal(paragraphTwoChannelForRequest("R_1a2B3c4D5e6F7g8"), paragraphTwoChannelForRequest("R_1a2B3c4D5e6F7g8"));
  const byId = new Set(Array.from({ length: 200 }, (_, index) => paragraphTwoChannelForRequest(`R_${index}`)));
  assert.equal(byId.size, 4);
  // The written two-paragraph design applies to the first rejection only; a one-message phase sent
  // with message delivery keeps the chat validation and draws no channel.
  const closing = buildInitialManagerPrompt({ phase: "closing", condition: "HP_LC", language: "en", alexMessage: PROPOSAL, history: [], delivery: "message" });
  assert.equal(closing.politenessChannel, "");
  assert.equal(isWrittenRejectionPrompt(closing), false);
  assert.equal(isWrittenRejectionPrompt(prompt("HP_LC", "closing")), true);
  assert.doesNotMatch(closing.system, /Paragraph 2 \(Message 2\)/);
});

test("the written-reply checker counts the assigned moves paragraph by paragraph", () => {
  const scores = (condition, perMessage, extra = {}) => {
    const hc = condition.endsWith("_HC");
    const hp = condition.startsWith("HP_");
    return {
      specific_problem: hc,
      explicit_standard: hc,
      actionable_remedy: hc,
      current_rejection_maintained: true,
      current_rejection_evidence: "I can't add a second category",
      current_rejection_redressed: hp,
      has_future_next_step: true,
      future_next_step_redressed: hp,
      explicit_future_openness: true,
      concrete_reopening_condition: hc,
      personal_attack_without_diagnosis: false,
      refusal_softened: hp,
      paragraph_two_moves: hp ? ["warm_closing"] : ["curt_closing"],
      ...extra,
      message_scores: perMessage.map(([politeness, threat], index) => ({
        politeness_cues: politeness,
        face_threat_cues: threat,
        future_next_step: index === 1 ? "next step" : "",
        future_next_step_is_redressed: index === 1 ? hp : false,
      })),
    };
  };
  const written = (condition, politenessChannel = "closing") => buildInitialManagerPrompt({
    phase: "rejection_initial", condition, language: "en", alexMessage: PROPOSAL, history: [], delivery: "message", politenessChannel,
  });
  const chat = (condition) => buildInitialManagerPrompt({
    phase: "rejection_initial", condition, language: "en", alexMessage: PROPOSAL, history: [],
  });
  // Polite paragraph 1: thanks, recognition of care, hedge before the refusal. Paragraph 2: two moves.
  const twoAndTwo = [[["thanks for flagging", "I can see the care", "I'm afraid"], []], [["I'd be glad to look again", "Thanks again for raising it"], []]];
  assert.equal(managerConstructivenessAssessmentProblem(scores("HP_HC", twoAndTwo), written("HP_HC")), "");
  // One move in a paragraph is the old quota: fine in chat, too thin for a written reply.
  const oneAndOne = [[["thanks for flagging"], []], [["I'd be glad to look again"], []]];
  assert.equal(managerConstructivenessAssessmentProblem(scores("HP_HC", oneAndOne), chat("HP_HC")), "");
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_HC", oneAndOne), written("HP_HC")),
    /Paragraph 1 has 1 politeness move.*After the greeting it needs three/,
  );
  // A polite paragraph 1 without the hedge before the refusal is one move short.
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_LC", [[["thanks", "care"], []], twoAndTwo[1]]), written("HP_LC")),
    /Paragraph 1 has 2 politeness moves.*hedge leading into the refusal/,
  );
  // The correction for a thin paragraph 2 names the drawn channel's own pole, not a generic list.
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_LC", [twoAndTwo[0], [["I'd be glad to look again"], []]]), written("HP_LC", "deference")),
    /Paragraph 2 has 1 politeness move.*and this one\. Deference: one clause that defers to their view/,
  );
  // Channel-level checks. A polite refusal led in only by "but" fails even with enough cues.
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_HC", twoAndTwo, { refusal_softened: false }), written("HP_HC")),
    /the sentence that refuses must itself be led in by an apology, a regretful softener, or a hedge/,
  );
  // The move drawn for paragraph 2 has to be the one the reply actually contains, at either pole.
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_HC", twoAndTwo, { paragraph_two_moves: ["appreciation"] }), written("HP_HC", "closing")),
    /Paragraph 2 is missing its assigned move\. Closing warmth/,
  );
  assert.equal(
    managerConstructivenessAssessmentProblem(scores("HP_HC", twoAndTwo, { paragraph_two_moves: ["hedged_judgement"] }), written("HP_HC", "hedge")),
    "",
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_HC", [[[], ["thin"]], [[], ["Come back with", "I set the rules"]]], { paragraph_two_moves: [] }), written("LP_HC", "deference")),
    /Paragraph 2 is missing its assigned move\. Authority: one clause that flatly asserts/,
  );
  // The low pole of the hedge channel is the absence of a hedge: paragraph 2 then carries no other
  // low-politeness pool move, which is what tells that draw apart from the other three.
  assert.equal(
    managerConstructivenessAssessmentProblem(scores("LP_HC", [[[], ["thin"]], [[], ["Come back with"]]], { paragraph_two_moves: [] }), written("LP_HC", "hedge")),
    "",
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_HC", [[[], ["thin"]], [[], ["Come back with", "That's all"]]], { paragraph_two_moves: ["curt_closing"] }), written("LP_HC", "hedge")),
    /Paragraph 2 carries moves that are not assigned to it \(curt_closing\)/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_LC", [twoAndTwo[0], [["a", "b", "c", "d"], []]]), written("HP_LC")),
    /Paragraph 2 piles up 4 politeness moves/,
  );
  // Low politeness: at least one face-threatening move per paragraph and no redress anywhere.
  const cold = [[[], ["doesn't hold up"]], [[], ["Come back with", "Don't bring it back"]]];
  assert.equal(managerConstructivenessAssessmentProblem(scores("LP_LC", cold), written("LP_LC")), "");
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_LC", [[[], ["doesn't hold up"]], [[], []]]), written("LP_LC", "deference")),
    /Paragraph 2 has no face-threatening move.*bare imperative, and this one\. Authority: one clause that flatly asserts/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_LC", [[[], ["thin", "a guess", "no basis"]], cold[1]]), written("LP_LC")),
    /Paragraph 1 piles up 3 face-threatening moves.*without judging the proposal/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_HC", [[["thanks"], ["thin"]], [[], ["Come back with"]]]), written("LP_HC")),
    /prohibited politeness cue evidence/,
  );
  // Openness is held constant: every written reply leaves the door open, a cold one included, with
  // concrete terms only under high constructiveness.
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_LC", cold, { explicit_future_openness: false }), written("LP_LC")),
    /must leave the door open.*bare imperative such as 'Bring it back when\.\.\.'/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_LC", twoAndTwo, { concrete_reopening_condition: true }), written("HP_LC")),
    /reopening line must stay vague/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("LP_HC", cold, { concrete_reopening_condition: false }), written("LP_HC")),
    /reopening line must name the same concrete data/,
  );
  assert.match(
    managerConstructivenessAssessmentProblem(scores("HP_LC", twoAndTwo, { has_future_next_step: false, future_next_step_redressed: false }), written("HP_LC")),
    /Include a genuine future reopening path/,
  );
  // The chat design's two-cue deviation does not exist for written replies.
  assert.deepEqual(managerConstructivenessCueWarning(scores("HP_HC", twoAndTwo), written("HP_HC")), []);
});

test("written low politeness may give its reopening terms as a bare imperative; temporal softeners are banned in every written cell", () => {
  const build = (condition, delivery) => buildInitialManagerPrompt({
    phase: "rejection_initial", condition, language: "en", alexMessage: PROPOSAL, history: [], delivery,
  });
  const reply = (text) => [{ speaker: "Manager", text: "Got your note. I'm not adding a second category." }, { speaker: "Manager", text }];
  const imperative = reply("Nothing here shows how often a second problem is separate. Come back with a hundred comments coded both ways. Bring it back with that.");
  assert.equal(managerSafetyProblem(imperative, build("LP_HC", "message")), "");
  assert.match(managerSafetyProblem(imperative, build("LP_HC")), /rewrite every bare command/);
  assert.match(managerSafetyProblem(imperative, build("HP_HC", "message")), /rewrite every bare command/);
  const temporary = reply("I'm sorry, but it can't go ahead for now. If anything changes, I'd be glad to look again.");
  assert.match(lowPolitenessWordingProblem(temporary, build("HP_LC", "message")), /does not allow in any condition/);
  assert.equal(lowPolitenessWordingProblem(temporary, build("HP_LC")), "");
  assert.match(lowPolitenessWordingProblem(temporary, build("LP_LC")), /low politeness does not allow/);
  // The written check matches every phrase the written prompt bans, in both politeness styles.
  for (const phrase of WRITTEN_TEMPORAL_SOFTENERS) {
    for (const condition of ["HP_HC", "LP_LC"]) {
      const written = build(condition, "message");
      assert.match(written.system, new RegExp(`'${phrase}'`));
      assert.match(lowPolitenessWordingProblem(reply(`I can't approve it ${phrase}.`), written), new RegExp(`'${phrase}'`));
    }
  }
  // The job's request log keeps the drawn channel.
  assert.ok(aiRequestColumns.includes("politeness_channel"));
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
  // The paragraph-2 channel is drawn once per job, sent to the generator and returned for storage.
  assert.match(view.politeness_channel, /^(closing|appreciation|hedge|deference)$/);
  assert.equal(calls[0].politenessChannel, view.politeness_channel);
  assert.equal(typeof view.latency_ms, "number");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].stage, "manager1");
  assert.equal(calls[0].phase, "rejection_initial");
  assert.equal(calls[0].delivery, "message");
  assert.equal(calls[0].condition, "HP_LC");
  assert.equal(calls[0].alexMessage, PROPOSAL);
  assert.equal(calls[0].history[0].speaker, "Coding project");
  assert.match(calls[0].history[0].text, /anything about the coding process you'd like to tell them/);
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
