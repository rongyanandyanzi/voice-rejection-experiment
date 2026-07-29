const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "constructiveness-v2-test-"));
process.env.DATA_DIR = testDataDir;
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-4.1-mini";
process.env.OPENAI_EVALUATOR_MODEL = "gpt-4.1-mini";

const {
  manipulationVersion,
  participantColumns,
  interactionColumns,
  surveyResponseColumns,
  normalizeRow,
  normalizeVersionedRow,
  buildInitialManagerPrompt,
  generateAiReply,
  managerConditionRules,
  managerConstructivenessMetadataProblem,
  managerConstructivenessAssessmentProblem,
  managerMessageCountProblem,
  managerSafetyProblem,
  managerLengthProblem,
  managerWordCountProblem,
  managerChineseCharacterCountProblem,
  ensureExplicitManagerRejection,
  normalizeInitialManagerLength,
  normalizeSubsequentManagerLength,
  chineseCharacterCount,
  wordCount,
} = require("../server");

const conditions = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"];

function managerPayload(overrides = {}) {
  return {
    stage: "manager1",
    phase: "rejection_initial",
    condition: "HP_HC",
    language: "en",
    history: [
      { speaker: "Manager", text: "What do you think the park should do?" },
      { speaker: "You", text: "Use a flexible pool during peak periods." },
    ],
    alexMessage: "Temporary staff could cover predictable peak shifts after training.",
    rejectionRound: 1,
    followupsAsked: 2,
    ...overrides,
  };
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function exactWords(prefix, target = 33) {
  const words = String(prefix).trim().split(/\s+/).filter(Boolean);
  while (words.length < target) words.push("today");
  return words.slice(0, target).join(" ");
}

function validHighReply() {
  return {
    messages: [
      {
        speaker: "Manager",
        text: exactWords("I cannot approve this flexible staffing proposal now because untrained temporary workers could make entrance checks inconsistent and delay guests during peak shifts"),
      },
      {
        speaker: "Manager",
        text: exactWords("Any staffing change must maintain accurate and timely entry service, and I could reconsider a version with role specific training and supervised peak shift coverage"),
      },
    ],
    constructiveness: {
      proposal_problem: "Untrained temporary workers could make entrance checks inconsistent and delay guests.",
      relevant_standard: "Staffing changes must maintain accurate and timely entry service.",
      revision_path: "A version with role specific training and supervised peak shift coverage.",
    },
  };
}

test("all four conditions use the same condition-blind pre-rejection prompt", () => {
  const prompts = conditions.map((condition) => buildInitialManagerPrompt(managerPayload({
    phase: "discussion_neutral",
    discussionIntent: "ask_followup",
    condition,
  })));
  assert.ok(prompts.every((prompt) => prompt.minMessages === 1 && prompt.maxMessages === 1));
  assert.ok(prompts.every((prompt) => prompt.constructivenessMetadataMode === ""));
  assert.ok(prompts.every((prompt) => prompt.wordRange === null));
  assert.deepEqual(new Set(prompts.map((prompt) => prompt.system)).size, 1);
  assert.match(prompts[0].system, /wording must be usable unchanged in all four conditions/i);
  assert.doesNotMatch(prompts[0].system, /Condition: high politeness|Condition: low politeness/i);
});

test("legacy pre-rejection followup entry point is also neutral", () => {
  const hp = buildInitialManagerPrompt(managerPayload({ phase: "followup", condition: "HP_HC" }));
  const lp = buildInitialManagerPrompt(managerPayload({ phase: "followup", condition: "LP_LC" }));
  assert.equal(hp.system, lp.system);
  assert.match(hp.system, /Do not use any politeness or constructiveness manipulation/i);
  assert.doesNotMatch(hp.system, /High-politeness conditions should|High-constructiveness conditions may/i);
});

test("initial rejection uses two matched structured messages", () => {
  for (const condition of conditions) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(prompt.minMessages, 2);
    assert.equal(prompt.maxMessages, 2);
    assert.deepEqual(prompt.wordRange, { min: 30, max: 36 });
    assert.deepEqual(prompt.totalWordRange, { min: 66, max: 70 });
    assert.equal(prompt.constructivenessMetadataMode, "full");
    assert.match(prompt.system, /proposal_problem, relevant_standard, and revision_path/);
    assert.match(prompt.system, /Reject the proposal for now/i);
  }
  const chinese = buildInitialManagerPrompt(managerPayload({ condition: "HP_HC", language: "zh" }));
  assert.equal(chinese.wordRange, null);
  assert.equal(chinese.totalWordRange, null);
  assert.deepEqual(chinese.chineseCharRange, { min: 56, max: 77 });
  assert.deepEqual(chinese.chineseTotalCharRange, { min: 133, max: 138 });
  assert.match(chinese.system, /56-77 Chinese characters/);
  assert.match(chinese.system, /133-138 Chinese characters/);
  assert.match(chinese.system, /counts Chinese characters directly/i);
});

test("HC requires all three fields while LC requires all three fields empty", () => {
  const complete = {
    proposal_problem: "A specific proposal problem and consequence.",
    relevant_standard: "A clear operating standard.",
    revision_path: "A concrete condition for reconsideration.",
  };
  const empty = { proposal_problem: "", relevant_standard: "", revision_path: "" };
  assert.equal(managerConstructivenessMetadataProblem(complete, buildInitialManagerPrompt(managerPayload({ condition: "HP_HC" }))), "");
  assert.match(managerConstructivenessMetadataProblem(empty, buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" }))), /high-constructiveness/i);
  assert.equal(managerConstructivenessMetadataProblem(empty, buildInitialManagerPrompt(managerPayload({ condition: "HP_LC" }))), "");
  assert.match(managerConstructivenessMetadataProblem(complete, buildInitialManagerPrompt(managerPayload({ condition: "LP_LC" }))), /low-constructiveness/i);
});

// highPrompt is LP_HC, so its politeness cues must be one face threat and no warmth; lowPrompt is
// HP_LC, so the reverse.
const lowPolitenessCues = { warmth_cues: 0, face_threat_cues: 1 };
const highPolitenessCues = { warmth_cues: 1, face_threat_cues: 0 };

test("blind semantic scores enforce HC presence, LC absence, and no personal-only attack", () => {
  const highPrompt = buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" }));
  const lowPrompt = buildInitialManagerPrompt(managerPayload({ condition: "HP_LC" }));
  const allPresent = {
    specific_problem: true,
    explicit_standard: true,
    actionable_remedy: true,
    personal_attack_without_diagnosis: false,
    ...lowPolitenessCues,
  };
  const allAbsent = {
    specific_problem: false,
    explicit_standard: false,
    actionable_remedy: false,
    personal_attack_without_diagnosis: false,
    ...highPolitenessCues,
  };
  assert.equal(managerConstructivenessAssessmentProblem(allPresent, highPrompt), "");
  assert.match(managerConstructivenessAssessmentProblem({
    ...allAbsent,
    ...lowPolitenessCues,
  }, highPrompt), /validation failed/i);
  assert.equal(managerConstructivenessAssessmentProblem(allAbsent, lowPrompt), "");
  assert.match(managerConstructivenessAssessmentProblem({
    ...allPresent,
    ...highPolitenessCues,
  }, lowPrompt), /validation failed/i);
  assert.match(managerConstructivenessAssessmentProblem({
    ...allPresent,
    personal_attack_without_diagnosis: true,
  }, highPrompt), /Remove any personal intelligence or competence attack/i);
});

test("blind politeness cue band is enforced identically under high and low constructiveness", () => {
  const scores = (condition, cues) => ({
    specific_problem: condition.endsWith("_HC"),
    explicit_standard: condition.endsWith("_HC"),
    actionable_remedy: condition.endsWith("_HC"),
    personal_attack_without_diagnosis: false,
    ...cues,
  });
  // The band has to bite the same way in HC and LC, otherwise the low-constructiveness cells can
  // buy a larger politeness contrast with the words they save on diagnosis.
  for (const condition of ["HP_HC", "HP_LC"]) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 1, face_threat_cues: 0 }), prompt), "");
    assert.equal(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 2, face_threat_cues: 0 }), prompt), "");
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 3, face_threat_cues: 0 }), prompt), /between 1 and 2 interpersonal warmth cues/i);
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 0, face_threat_cues: 0 }), prompt), /between 1 and 2 interpersonal warmth cues/i);
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 1, face_threat_cues: 1 }), prompt), /no sharp or dismissive cue/i);
  }
  for (const condition of ["LP_HC", "LP_LC"]) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 0, face_threat_cues: 1 }), prompt), "");
    assert.equal(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 0, face_threat_cues: 2 }), prompt), "");
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 0, face_threat_cues: 3 }), prompt), /between 1 and 2 sharp proposal-directed cues/i);
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 0, face_threat_cues: 0 }), prompt), /between 1 and 2 sharp proposal-directed cues/i);
    assert.match(managerConstructivenessAssessmentProblem(scores(condition, { warmth_cues: 1, face_threat_cues: 1 }), prompt), /no warmth cue/i);
  }
});

test("rejection follow-up and closing keep the four conditions in a narrow length window", () => {
  for (const condition of conditions) {
    const followup = buildInitialManagerPrompt(managerPayload({ phase: "rejection_followup", condition }));
    assert.deepEqual(followup.wordRange, { min: 34, max: 36 });
    const closing = buildInitialManagerPrompt(managerPayload({ phase: "closing", condition }));
    assert.deepEqual(closing.wordRange, { min: 27, max: 31 });
    assert.match(closing.system, /Interpersonal cue quota: use exactly one/i);
  }
});

test("politeness rules preserve content equivalence and keep LP criticism proposal-focused", () => {
  const rules = managerConditionRules();
  assert.match(rules.HP_HC, /substantive problem, standard, and revision path equivalent to LP_HC/i);
  assert.match(rules.LP_HC, /substantive problem, standard, and revision path equivalent to HP_HC/i);
  assert.match(rules.HP_LC, /vague substantive content equivalent to LP_LC/i);
  assert.match(rules.LP_LC, /vague substantive content equivalent to HP_LC/i);
  assert.match(rules.LP_HC, /Keep the face threat proposal-focused/i);
  assert.match(rules.LP_HC, /Do not say or imply that the participant is stupid, incompetent/i);
  // The cue quota has to be present in all four cells, and the low-constructiveness cells must be
  // told to spend their spare length on neutral wording rather than on more interpersonal cues.
  for (const condition of conditions) {
    assert.match(rules[condition], /Interpersonal cue quota: use exactly one such cue/i);
    assert.match(rules[condition], /Do not stack, repeat, or rephrase the cue/i);
  }
  for (const condition of ["HP_LC", "LP_LC"]) {
    assert.match(rules[condition], /Spend the remaining length on neutral restatement/i);
    assert.match(rules[condition], /keep exactly the same number of politeness or dismissiveness cues/i);
  }
});

test("directive mood is split by politeness: LP may use imperatives, HP must stay conditional", () => {
  const rules = managerConditionRules();
  // The revision-path mood in the condition rules.
  assert.match(rules.HP_HC, /phrased conditionally.*never as a command/i);
  assert.match(rules.LP_HC, /one blunt imperative directive/i);
  assert.match(rules.LP_HC, /Imperative mood is part of this style/i);
  assert.match(rules.LP_LC, /Imperative mood is part of this style/i);
  assert.doesNotMatch(rules.HP_HC, /Imperative mood is part of this style/i);
  assert.doesNotMatch(rules.HP_LC, /Imperative mood is part of this style/i);
  // The task-level command rule flips with politeness in every rejection phase.
  for (const phase of ["rejection_initial", "rejection_followup", "rejection"]) {
    const hp = buildInitialManagerPrompt(managerPayload({ phase, condition: "HP_HC" }));
    const lp = buildInitialManagerPrompt(managerPayload({ phase, condition: "LP_HC" }));
    assert.match(hp.system, /Avoid formal command wording/i);
    assert.doesNotMatch(hp.system, /Phrase exactly one next-step line as a blunt imperative directive/i);
    assert.match(lp.system, /Phrase exactly one next-step line as a blunt imperative directive/i);
    assert.doesNotMatch(lp.system, /Avoid formal command wording/i);
  }
  // The blanket system-level imperative ban stays for HP and for condition-blind phases.
  const hpInitial = buildInitialManagerPrompt(managerPayload({ condition: "HP_LC" }));
  const lpInitial = buildInitialManagerPrompt(managerPayload({ condition: "LP_LC" }));
  const neutral = buildInitialManagerPrompt(managerPayload({
    phase: "discussion_neutral",
    discussionIntent: "ask_followup",
    condition: "LP_LC",
  }));
  assert.match(hpInitial.system, /Avoid imperative checklist wording/i);
  assert.doesNotMatch(lpInitial.system, /Avoid imperative checklist wording/i);
  assert.match(neutral.system, /Do not use any politeness or constructiveness manipulation/i);
});

test("message count and length validators enforce the two-message rejection", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  const valid = validHighReply().messages;
  assert.equal(managerMessageCountProblem(valid, prompt, ""), "");
  assert.equal(managerWordCountProblem(valid, prompt), "");
  assert.match(managerMessageCountProblem(valid.slice(0, 1), prompt, ""), /exactly 2/);
  assert.match(managerWordCountProblem([
    { speaker: "Manager", text: "This is too short." },
    valid[1],
  ], prompt), /Length correction required/);
  assert.equal(wordCount("一二三四五"), 3);
  assert.equal(chineseCharacterCount("一二三四五，abc"), 5);
});

test("English first rejection length normalization preserves content and reaches the matched total", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  const messages = [
    { speaker: "Manager", text: exactWords("I cannot approve this proposal because the staffing idea leaves a service concern unresolved", 30) },
    { speaker: "Manager", text: exactWords("The proposal must protect reliable entry service before I could reconsider a version with role training", 30) },
  ];
  const normalized = normalizeInitialManagerLength(messages, prompt);
  assert.equal(managerWordCountProblem(normalized, prompt), "");
  assert.match(normalized[0].text, /cannot approve/i);
  assert.match(normalized[1].text, /role training/i);
  assert.ok(normalized.every((message) => wordCount(message.text) >= 30 && wordCount(message.text) <= 36));
  assert.ok(normalized.reduce((sum, message) => sum + wordCount(message.text), 0) >= 66);
});

test("Chinese first rejection removes only optional wording to enter the matched total", () => {
  const prompt = buildInitialManagerPrompt(managerPayload({ condition: "LP_LC", language: "zh" }));
  const messages = [
    {
      speaker: "Manager",
      text: "这个临时用工的方向先不采纳。说白了，这版想法还很粗，整体看不出适合我们现在的实际局面。这种半成品还算不上方案。",
    },
    {
      speaker: "Manager",
      text: "现在不会按这个走。这个提法离能讨论的程度还差一截，感觉只是把问题换个名字，没什么实质价值。这类方案暂时放一边。",
    },
  ];
  const normalized = normalizeInitialManagerLength(messages, prompt);
  assert.equal(managerChineseCharacterCountProblem(normalized, prompt), "");
  assert.equal(managerLengthProblem(normalized, prompt), "");
  const counts = normalized.map((message) => chineseCharacterCount(message.text));
  assert.ok(counts.every((count) => count >= 56 && count <= 77));
  assert.ok(counts.reduce((sum, count) => sum + count, 0) >= 133);
  assert.ok(counts.reduce((sum, count) => sum + count, 0) <= 138);
  assert.match(normalized.map((message) => message.text).join(" "), /不采纳|不会按这个走/);
  assert.doesNotMatch(normalized.map((message) => message.text).join(" "), /具体标准|改进路径/);
});

test("later rejection length normalization repairs minor English overages", () => {
  const prompt = buildInitialManagerPrompt(managerPayload({
    phase: "rejection_followup",
    condition: "LP_HC",
  }));
  const message = {
    speaker: "Manager",
    text: exactWords("Honestly I still cannot approve this version because role coverage remains unclear and would slow entrance service during peak shifts while the standard requires stable throughput before a trained staffing map could be reconsidered", 38),
  };
  const normalized = normalizeSubsequentManagerLength([message], prompt);
  assert.equal(managerWordCountProblem(normalized, prompt), "");
  assert.match(normalized[0].text, /cannot approve/i);

  const phraseHeavy = {
    speaker: "Manager",
    text: exactWords("At this point I cannot approve the current proposal because role coverage is not defined and entrance service would slow during peaks in order to meet the standard before I could reconsider it", 40),
  };
  const compressed = normalizeSubsequentManagerLength([phraseHeavy], prompt);
  assert.equal(managerWordCountProblem(compressed, prompt), "");
  assert.doesNotMatch(compressed[0].text, /At this point/i);
  assert.match(compressed[0].text, /cannot approve/i);
});

test("later rejection receives an explicit condition-neutral refusal when missing", () => {
  const prompt = buildInitialManagerPrompt(managerPayload({
    phase: "rejection_followup",
    condition: "LP_HC",
    language: "zh",
  }));
  const messages = [{
    speaker: "Manager",
    text: "岗位边界还是不清楚，老员工会被带教拖住；旺季必须保证验票稳定，补上岗位和搭班比例后才有再看的价值。",
  }];
  const ensured = ensureExplicitManagerRejection(messages, prompt);
  assert.match(ensured[0].text, /^这个版本仍不能批准。/);
  assert.equal(managerSafetyProblem(ensured, prompt), "");
});

test("rejection, identity disclosure, forbidden names, and output language are validated", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  assert.equal(managerSafetyProblem(validHighReply().messages, prompt), "");
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "This may be worth considering later." },
  ], prompt), /Rejection correction required/);
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "I am an AI and cannot approve this proposal." },
  ], prompt), /Safety correction required/);
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "Alex, I cannot approve this proposal." },
  ], prompt), /Name correction required/);
  const chinesePrompt = buildInitialManagerPrompt(managerPayload({ language: "zh" }));
  assert.match(managerSafetyProblem(validHighReply().messages, chinesePrompt), /Language correction required/);
});

test("legacy CSV rows load with an empty manipulation version", () => {
  for (const columns of [participantColumns, interactionColumns, surveyResponseColumns]) {
    assert.ok(columns.includes("manipulation_version"));
    const normalized = normalizeRow({ prolific_pid: "legacy-id" }, columns);
    assert.equal(normalized.manipulation_version, "");
  }
  assert.equal(manipulationVersion, "constructiveness_v2");
});

test("new participant, interaction, and survey rows default to constructiveness v2", () => {
  for (const columns of [participantColumns, interactionColumns, surveyResponseColumns]) {
    const row = normalizeVersionedRow({ prolific_pid: "new-id" }, columns);
    assert.equal(row.manipulation_version, "constructiveness_v2");
    const explicitLegacy = normalizeVersionedRow({
      prolific_pid: "legacy-id",
      manipulation_version: "constructiveness_v1",
    }, columns);
    assert.equal(explicitLegacy.manipulation_version, "constructiveness_v1");
  }
});

test("Chinese MC2 wording and legacy-session version fallback are present", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // MC items were re-worded to refer to the proposal rather than the participant personally.
  assert.match(source, /MC2: "表明我的方案存在的问题是可以解决的。"/);
  assert.match(source, /storedSession\.manipulation_version \|\|[\s\S]*constructiveness_v1[\s\S]*constructiveness_v2/);
});

test("the actual browser manager opening contains the required three-message structure", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const start = source.indexOf("async function renderManagerChat()");
  const end = source.indexOf("function createChat", start);
  const opening = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  // The market research framing moved to the coordinator in the task room, so the manager opens
  // with the evaluation stakes, split across two short messages, and then the question.
  assert.equal((opening.match(/await sendDelayed\("Manager"/g) || []).length, 3);
  assert.match(opening, /Park Manager/);
  assert.match(opening, /evaluate your performance/);
  assert.match(opening, /affect your compensation/);
  assert.match(opening, /what do you think the theme park should do next/);
  assert.doesNotMatch(opening, /market research company/);
});

test("validated manager requests use a longer non-retrying client timeout and server cancellation", async () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(appSource, /validatedManagerPhase \? 150000 : apiRequestTimeoutMs/);
  assert.match(appSource, /request_id: requestId/);
  assert.match(appSource, /error && error\.name === "AbortError"/);
  assert.match(serverSource, /AI_PIPELINE_TIMEOUT_MS \|\| 135000/);
  assert.match(serverSource, /const aiReplyRequests = new Map\(\)/);
  assert.match(serverSource, /res\.once\("close", abortDisconnectedRequest\)/);

  const controller = new AbortController();
  controller.abort(new Error("test cancellation"));
  const result = await generateAiReply(managerPayload(), { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.status, 504);
  assert.equal(result.retryable, true);
  assert.match(result.cause, /test cancellation/);
});

test("failed HC structure regenerates and internal fields never reach the browser response", async () => {
  const originalFetch = global.fetch;
  const good = validHighReply();
  const bad = {
    ...good,
    constructiveness: { proposal_problem: "", relevant_standard: "", revision_path: "" },
  };
  const queue = [
    responseJson(bad),
    responseJson(good),
    responseJson({
      specific_problem: true,
      explicit_standard: true,
      actionable_remedy: true,
      personal_attack_without_diagnosis: false,
      warmth_cues: 1,
      face_threat_cues: 0,
    }),
  ];
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload());
    assert.equal(result.ok, true);
    assert.equal(calls, 3);
    assert.equal(result.messages.length, 2);
    assert.equal("constructiveness" in result, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("three consecutive blind semantic failures return a safe retryable error", async () => {
  const originalFetch = global.fetch;
  const good = validHighReply();
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    const schemaName = body.text.format.name;
    if (schemaName === "manager_constructiveness_blind_score") {
      // Politeness cues are in band; only the constructiveness components fail, so the error
      // message must name the constructiveness condition.
      return responseJson({
        specific_problem: false,
        explicit_standard: false,
        actionable_remedy: false,
        personal_attack_without_diagnosis: false,
        warmth_cues: 1,
        face_threat_cues: 0,
      });
    }
    return responseJson(good);
  };
  try {
    const result = await generateAiReply(managerPayload());
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.equal(result.retryable, true);
    assert.match(result.error, /semantically valid constructiveness condition/i);
    assert.equal(calls, 6);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});
