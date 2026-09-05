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
  aiRequestColumns,
  normalizeRow,
  normalizeVersionedRow,
  buildInitialManagerPrompt,
  buildNeutralManagerPrompt,
  NEUTRAL_MANAGER_WRAP_UP_RULE,
  neutralManagerClosingProblem,
  generateAiReply,
  managerConditionRules,
  MANAGER_ACK_FORBIDDEN,
  decideInitialManagerDiscussion,
  NEUTRAL_CHAT_REGISTER_RULE,
  managerLengthOnlyRewriteCorrection,
  managerSmallLengthOvershoot,
  managerConstructivenessMetadataProblem,
  managerConstructivenessAssessmentProblem,
  managerConstructivenessCueWarning,
  normalizeManagerConstructivenessScores,
  managerMessageCountProblem,
  managerSafetyProblem,
  managerLengthProblem,
  managerWordCountProblem,
  managerChineseCharacterCountProblem,
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

function exactWords(prefix, target = 29) {
  const words = String(prefix).trim().split(/\s+/).filter(Boolean);
  while (words.length < target) words.push("today");
  return words.slice(0, target).join(" ");
}

function validHighReply() {
  return {
    messages: [
      {
        speaker: "Manager",
        text: "I appreciate the care behind this, but I cannot approve the flexible staffing proposal because the entry check risk is unresolved.",
      },
      {
        speaker: "Manager",
        text: "I would consider a revised version after a matched peak shift trial compares entry errors and queue times for trained temporary workers against permanent staff under similar visitor demand, so we can see whether the added coverage helps.",
      },
    ],
    constructiveness: {
      proposal_problem: "There is no evidence that temporary workers can handle entry checks without increasing errors or queue times.",
      relevant_standard: "Compare entry errors and queue times under temporary and permanent coverage.",
      revision_path: "Analyze a matched peak-shift trial with trained temporary staff and current permanent coverage.",
    },
  };
}

function validHighEvaluatorScores(overrides = {}) {
  return {
    specific_problem: true,
    explicit_standard: true,
    actionable_remedy: true,
    current_rejection_maintained: true,
    current_rejection_evidence: "I cannot approve the flexible staffing proposal",
    current_rejection_redressed: true,
    has_future_next_step: true,
    future_next_step_redressed: true,
    explicit_future_openness: false,
    concrete_reopening_condition: false,
    personal_attack_without_diagnosis: false,
    message_scores: [
      {
        politeness_cues: ["I appreciate the care behind this"],
        face_threat_cues: [],
        future_next_step: "",
        future_next_step_is_redressed: false,
      },
      {
        politeness_cues: ["I would consider a revised version"],
        face_threat_cues: [],
        future_next_step: "I would consider a revised version after a matched peak shift trial compares entry errors and queue times for trained temporary workers against permanent staff under similar visitor demand, so we can see whether the added coverage helps",
        future_next_step_is_redressed: true,
      },
    ],
    ...overrides,
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

test("initial rejection uses a short decision followed by a longer structured explanation", () => {
  for (const condition of conditions) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(prompt.minMessages, 2);
    assert.equal(prompt.maxMessages, 2);
    assert.deepEqual(prompt.wordRange, { min: 14, max: 46 });
    assert.deepEqual(prompt.messageWordRanges, [
      { min: 14, max: 22 },
      { min: 36, max: 46 },
    ]);
    assert.deepEqual(prompt.totalWordRange, { min: 54, max: 68 });
    assert.deepEqual(prompt.totalWordTargetRange, { min: 58, max: 62 });
    assert.equal(prompt.constructivenessMetadataMode, "full");
    assert.equal(prompt.constructivenessAssessmentMode, "rejection");
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
  const hpCorrection = managerConstructivenessMetadataProblem(empty, buildInitialManagerPrompt(managerPayload({ condition: "HP_HC" })));
  const lpCorrection = managerConstructivenessMetadataProblem(empty, buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" })));
  assert.match(hpCorrection, /condition for reconsideration rather than a command/i);
  assert.match(hpCorrection, /proposal-specific evidence gap/i);
  assert.match(hpCorrection, /effect, tradeoff, constraint, or uncertainty that the analysis must assess/i);
  assert.match(lpCorrection, /directly with no hedge, softener, deference, or other redress/i);
  assert.match(lpCorrection, /complete subject-led sentence/i);
  assert.match(lpCorrection, /Do not use a bare command/i);
  assert.match(lpCorrection, /concrete measures, observations, records, comparisons, or trial results/i);
  assert.match(lpCorrection, /generic request for more data or more analysis is not sufficient/i);
  assert.doesNotMatch(lpCorrection, /rather than a command/i);
});

function blindScores(condition, overrides = {}) {
  const highPoliteness = condition.startsWith("HP");
  const highConstructiveness = condition.endsWith("_HC");
  const { messageCount = 2, ...scoreOverrides } = overrides;
  const messageScores = Array.from({ length: messageCount }, (_, index) => highPoliteness
    ? {
        politeness_cues: [`politeness cue ${index + 1}`],
        face_threat_cues: [],
        future_next_step: highConstructiveness && index === messageCount - 1 ? "polite future step" : "",
        future_next_step_is_redressed: highConstructiveness && index === messageCount - 1,
      }
    : {
        politeness_cues: [],
        face_threat_cues: [`face threat cue ${index + 1}`],
        future_next_step: highConstructiveness && index === messageCount - 1 ? "direct future step" : "",
        future_next_step_is_redressed: false,
      });
  return {
    specific_problem: highConstructiveness,
    explicit_standard: highConstructiveness,
    actionable_remedy: highConstructiveness,
    current_rejection_maintained: true,
    current_rejection_evidence: "current rejection",
    current_rejection_redressed: highPoliteness,
    has_future_next_step: highConstructiveness,
    future_next_step_redressed: highConstructiveness ? highPoliteness : false,
    explicit_future_openness: false,
    concrete_reopening_condition: false,
    personal_attack_without_diagnosis: false,
    message_scores: messageScores,
    ...scoreOverrides,
  };
}

test("blind semantic scores enforce HC presence, LC absence, and no personal-only attack", () => {
  const highPrompt = buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" }));
  const lowPrompt = buildInitialManagerPrompt(managerPayload({ condition: "HP_LC" }));
  const allPresent = blindScores("LP_HC");
  const allAbsent = blindScores("HP_LC");
  assert.equal(managerConstructivenessAssessmentProblem(allPresent, highPrompt), "");
  assert.match(managerConstructivenessAssessmentProblem({
    ...blindScores("LP_HC"),
    specific_problem: false,
    explicit_standard: false,
    actionable_remedy: false,
  }, highPrompt), /validation failed/i);
  assert.equal(managerConstructivenessAssessmentProblem(allAbsent, lowPrompt), "");
  assert.match(managerConstructivenessAssessmentProblem({
    ...blindScores("HP_LC"),
    specific_problem: true,
    explicit_standard: true,
    actionable_remedy: true,
  }, lowPrompt), /validation failed/i);
  assert.match(managerConstructivenessAssessmentProblem({
    ...allPresent,
    personal_attack_without_diagnosis: true,
  }, highPrompt), /Remove any personal intelligence or competence attack/i);
});

test("blind scoring targets one cue, trims two once, then accepts two with evidence", () => {
  for (const condition of ["HP_HC", "HP_LC"]) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(managerConstructivenessAssessmentProblem(blindScores(condition), prompt), "");
    const twoCues = blindScores(condition, {
      message_scores: [
        {
          politeness_cues: ["I appreciate your work", "this does not quite fit"],
          face_threat_cues: [],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        {
          politeness_cues: ["I would be open"],
          face_threat_cues: [],
          future_next_step: condition.endsWith("_HC") ? "I would be open to reconsidering it" : "",
          future_next_step_is_redressed: condition.endsWith("_HC"),
        },
      ],
    });
    const trimCorrection = managerConstructivenessAssessmentProblem(twoCues, prompt);
    assert.match(trimCorrection, /Message 1 contains two politeness cues/i);
    assert.match(trimCorrection, /I appreciate your work/);
    assert.match(trimCorrection, /this does not quite fit/);
    assert.equal(managerConstructivenessAssessmentProblem(twoCues, prompt, { allowTwoCues: true }), "");
    assert.equal(managerConstructivenessCueWarning(twoCues, prompt).length, 1);
    const noCue = blindScores(condition, {
      message_scores: [
        {
          politeness_cues: [],
          face_threat_cues: [],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        blindScores(condition).message_scores[1],
      ],
    });
    assert.match(
      managerConstructivenessAssessmentProblem(noCue, prompt, { allowTwoCues: true }),
      /Message 1 has no politeness cue/i,
    );
    assert.match(managerConstructivenessAssessmentProblem(blindScores(condition, {
      message_scores: [
        {
          politeness_cues: ["cue one", "cue two", "cue three"],
          face_threat_cues: [],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        {
          politeness_cues: ["cue four"],
          face_threat_cues: [],
          future_next_step: condition.endsWith("_HC") ? "polite future step" : "",
          future_next_step_is_redressed: condition.endsWith("_HC"),
        },
      ],
    }), prompt, { allowTwoCues: true }), /contains 3 politeness cues/i);
    assert.match(managerConstructivenessAssessmentProblem(blindScores(condition, {
      message_scores: [
        {
          politeness_cues: ["polite"],
          face_threat_cues: ["sloppy"],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        {
          politeness_cues: ["polite"],
          face_threat_cues: [],
          future_next_step: condition.endsWith("_HC") ? "polite future step" : "",
          future_next_step_is_redressed: condition.endsWith("_HC"),
        },
      ],
    }), prompt, { allowTwoCues: true }), /prohibited proposal-focused face-threat cue evidence/i);
  }
  for (const condition of ["LP_HC", "LP_LC"]) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    assert.equal(managerConstructivenessAssessmentProblem(blindScores(condition), prompt), "");
    const twoCues = blindScores(condition, {
      message_scores: [
        {
          politeness_cues: [],
          face_threat_cues: ["this version is sloppy", "nowhere near ready"],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        {
          politeness_cues: [],
          face_threat_cues: ["this is weak"],
          future_next_step: condition.endsWith("_HC") ? "bring it back" : "",
          future_next_step_is_redressed: false,
        },
      ],
    });
    const trimCorrection = managerConstructivenessAssessmentProblem(twoCues, prompt);
    assert.match(trimCorrection, /Message 1 contains two proposal-focused face-threat cues/i);
    assert.match(trimCorrection, /this version is sloppy/);
    assert.match(trimCorrection, /nowhere near ready/);
    assert.equal(managerConstructivenessAssessmentProblem(twoCues, prompt, { allowTwoCues: true }), "");
    assert.equal(managerConstructivenessCueWarning(twoCues, prompt).length, 1);
    const noCue = blindScores(condition, {
      message_scores: [
        {
          politeness_cues: [],
          face_threat_cues: [],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        blindScores(condition).message_scores[1],
      ],
    });
    assert.match(
      managerConstructivenessAssessmentProblem(noCue, prompt, { allowTwoCues: true }),
      /Message 1 has no proposal-focused face-threat cue/i,
    );
    assert.match(managerConstructivenessAssessmentProblem(blindScores(condition, {
      message_scores: [
        {
          politeness_cues: ["thank you"],
          face_threat_cues: ["sloppy"],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        {
          politeness_cues: [],
          face_threat_cues: ["weak"],
          future_next_step: condition.endsWith("_HC") ? "bring it back" : "",
          future_next_step_is_redressed: false,
        },
      ],
    }), prompt, { allowTwoCues: true }), /prohibited politeness cue evidence/i);
  }
});

test("blind scoring judges refusal redress and future-step redress separately", () => {
  for (const condition of conditions) {
    const prompt = buildInitialManagerPrompt(managerPayload({ condition }));
    const highPoliteness = condition.startsWith("HP");
    const highConstructiveness = condition.endsWith("_HC");
    const valid = blindScores(condition);
    assert.equal(managerConstructivenessAssessmentProblem(valid, prompt), "");

    assert.match(managerConstructivenessAssessmentProblem({
      ...valid,
      current_rejection_maintained: false,
    }, prompt), /current proposal is not being approved/i);
    assert.match(managerConstructivenessAssessmentProblem({
      ...valid,
      current_rejection_redressed: !highPoliteness,
    }, prompt), highPoliteness ? /refusal polite as a whole/i : /remove every redressive move/i);

    if (highConstructiveness) {
      assert.match(managerConstructivenessAssessmentProblem({
        ...valid,
        has_future_next_step: false,
        future_next_step_redressed: false,
      }, prompt), /concrete future remedy path/i);
      assert.match(managerConstructivenessAssessmentProblem({
        ...valid,
        future_next_step_redressed: !highPoliteness,
      }, prompt), highPoliteness ? /Redress the future next step/i : /Remove every actual hedge/i);
    } else {
      assert.equal(managerConstructivenessAssessmentProblem({
        ...valid,
        has_future_next_step: true,
        future_next_step_redressed: highPoliteness,
      }, prompt), "");
      assert.match(managerConstructivenessAssessmentProblem({
        ...valid,
        has_future_next_step: true,
        future_next_step_redressed: !highPoliteness,
      }, prompt), highPoliteness ? /Redress the future next step/i : /Remove every actual hedge/i);
    }
  }
});

test("bare temporal scope markers are not politeness or redress", () => {
  for (const temporalCue of ["for now", "Today.", "currently"]) {
    const normalized = normalizeManagerConstructivenessScores({
      current_rejection_redressed: true,
      future_next_step_redressed: true,
      message_scores: [{
        politeness_cues: [temporalCue],
        face_threat_cues: ["still sloppy"],
        future_next_step: "I will reconsider it after the review",
        future_next_step_is_redressed: true,
      }],
    });
    assert.deepEqual(normalized.message_scores[0].politeness_cues, []);
    assert.equal(normalized.current_rejection_redressed, false);
    assert.equal(normalized.message_scores[0].future_next_step_is_redressed, false);
    assert.equal(normalized.future_next_step_redressed, false);
  }

  const actualRedress = normalizeManagerConstructivenessScores({
    current_rejection_redressed: true,
    future_next_step_redressed: true,
    message_scores: [{
      politeness_cues: ["for now", "if you want"],
      face_threat_cues: [],
      future_next_step: "We can revisit it later if you want",
      future_next_step_is_redressed: true,
    }],
  });
  assert.deepEqual(actualRedress.message_scores[0].politeness_cues, ["if you want"]);
  assert.equal(actualRedress.current_rejection_redressed, true);
  assert.equal(actualRedress.future_next_step_redressed, true);

  const cueInAnotherMessage = normalizeManagerConstructivenessScores({
    current_rejection_evidence: "The decision remains unchanged for now",
    current_rejection_redressed: true,
    future_next_step_redressed: true,
    message_scores: [
      {
        politeness_cues: ["for now"],
        face_threat_cues: [],
        future_next_step: "",
        future_next_step_is_redressed: false,
      },
      {
        politeness_cues: ["I appreciate the work"],
        face_threat_cues: [],
        future_next_step: "I would be open to discussing it later",
        future_next_step_is_redressed: true,
      },
    ],
  }, [
    "The decision remains unchanged for now.",
    "I appreciate the work. I would be open to discussing it later.",
  ]);
  assert.equal(cueInAnotherMessage.current_rejection_redressed, false);
  assert.deepEqual(cueInAnotherMessage.message_scores[1].politeness_cues, ["I appreciate the work"]);
});

test("rejection follow-up and closing keep the four conditions in a narrow length window", () => {
  for (const condition of conditions) {
    const followup = buildInitialManagerPrompt(managerPayload({ phase: "rejection_followup", condition }));
    assert.deepEqual(followup.wordRange, { min: 32, max: 36 });
    const closing = buildInitialManagerPrompt(managerPayload({ phase: "closing", condition }));
    assert.deepEqual(closing.wordRange, { min: 27, max: 31 });
    assert.equal(closing.constructivenessMetadataMode, "");
    assert.equal(closing.constructivenessAssessmentMode, "closing");
    assert.match(closing.system, /Interpersonal cue quota: use one politeness or dismissiveness cue/i);
  }
});

test("closing blind validation preserves rejection and openness while separating HC from LC", () => {
  for (const condition of conditions) {
    const prompt = buildInitialManagerPrompt(managerPayload({ phase: "closing", condition }));
    const scores = blindScores(condition, {
      messageCount: 1,
      specific_problem: false,
      explicit_standard: false,
      actionable_remedy: false,
      current_rejection_maintained: true,
      current_rejection_redressed: condition.startsWith("HP"),
      has_future_next_step: true,
      future_next_step_redressed: condition.startsWith("HP"),
      explicit_future_openness: true,
      concrete_reopening_condition: condition.endsWith("_HC"),
    });
    assert.equal(managerConstructivenessAssessmentProblem(scores, prompt), "");
    assert.match(managerConstructivenessAssessmentProblem({
      ...scores,
      current_rejection_maintained: false,
    }, prompt), /current proposal is not being approved/i);
    assert.match(managerConstructivenessAssessmentProblem({
      ...scores,
      explicit_future_openness: false,
    }, prompt), /invite the participant to revisit/i);
    assert.match(managerConstructivenessAssessmentProblem({
      ...scores,
      concrete_reopening_condition: !condition.endsWith("_HC"),
    }, prompt), condition.endsWith("_HC") ? /concrete proposal-specific data or analysis condition/i : /vague and general/i);
    assert.match(managerConstructivenessAssessmentProblem({
      ...scores,
      current_rejection_redressed: !condition.startsWith("HP"),
    }, prompt), condition.startsWith("HP") ? /refusal polite as a whole/i : /remove every redressive move/i);
    assert.match(managerConstructivenessAssessmentProblem({
      ...scores,
      future_next_step_redressed: !condition.startsWith("HP"),
    }, prompt), condition.startsWith("HP") ? /Redress the future next step/i : /Remove every actual hedge/i);
  }
});

test("politeness rules preserve content equivalence and keep LP criticism proposal-focused", () => {
  const rules = managerConditionRules();
  assert.match(rules.HP_HC, /substantive problem, decision consideration, and revision path equivalent to LP_HC/i);
  assert.match(rules.LP_HC, /substantive problem, decision consideration, and revision path equivalent to HP_HC/i);
  assert.match(rules.HP_LC, /vague substantive content equivalent to LP_LC/i);
  assert.match(rules.LP_LC, /vague substantive content equivalent to HP_LC/i);
  assert.match(rules.LP_HC, /The edge goes to the idea, never to the person/i);
  assert.match(rules.HP_HC, /Positive politeness addresses/i);
  assert.match(rules.HP_HC, /Negative politeness addresses/i);
  assert.match(rules.LP_HC, /Do no positive politeness/i);
  assert.match(rules.LP_HC, /Do no negative politeness/i);
  assert.match(rules.LP_HC, /Never criticise the person\. Nothing about their intelligence, competence, effort, attitude, judgement, experience, seniority, or character/i);
  // The moderate setting: one pointed judgement per message with an edge, a cold register, and no
  // temporal softeners; no dismissal of the contribution and no impatience about the person's time.
  for (const condition of ["LP_HC", "LP_LC"]) {
    assert.match(rules[condition], /one freshly worded, flat sharp judgement of the proposal per message/i);
    assert.match(rules[condition], /No metaphors, quips, wordplay, or rhetorical questions/i);
    assert.match(rules[condition], /Never a temporal softener: no 'for now', 'at this point', 'right now'/i);
    assert.doesNotMatch(rules[condition], /not worth (?:the|my) time|not reading further|more of my time than it deserves/i);
    assert.match(rules[condition], /no remarks about their pay, rating, or job/i);
  }
  for (const condition of ["HP_HC", "HP_LC"]) {
    assert.doesNotMatch(rules[condition], /flat sharp judgement/i);
  }
  // HC must identify a proposal-specific evidence gap and analysis rather than repeatedly asking
  // every proposal for the same visitor-flow, staffing, or cost data.
  for (const condition of ["HP_HC", "LP_HC"]) {
    assert.match(rules[condition], /infer the central decision uncertainty in this participant's actual proposal/i);
    assert.match(rules[condition], /Do not claim that something is missing if the participant has already supplied it/i);
    assert.match(rules[condition], /Every HC rejection must communicate that the current proposal is not yet supported by enough proposal-specific evidence/i);
    assert.match(rules[condition], /exact unanswered question and the exact analysis that would answer it/i);
    assert.match(rules[condition], /evidence gap, consequence, decision analysis, and improvement path must form one logical chain/i);
    assert.match(rules[condition], /requested data and analysis must test the exact assumption or tradeoff/i);
    assert.match(rules[condition], /Name what should be measured or observed, what should be compared or analyzed/i);
    assert.match(rules[condition], /Do not reuse a stock analysis/i);
    assert.match(rules[condition], /relationship, comparison, pattern, or trial result the analysis needs to establish/i);
    assert.match(rules[condition], /merely naming an abstract value or desired outcome/i);
    assert.match(rules[condition], /Never announce or label the consideration with wording such as 'The standard is'/i);
    assert.doesNotMatch(rules[condition], /hour by hour visitor flow/i);
    assert.doesNotMatch(rules[condition], /role by role workload/i);
    assert.doesNotMatch(rules[condition], /always the same in substance/i);
  }
  const hcPrompt = buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" }));
  assert.match(hcPrompt.system, /proposal_problem records the proposal-specific evidence gap and consequence/i);
  assert.match(hcPrompt.system, /relevant_standard, but its value records the concrete proposal-specific relationship, comparison, effect, tradeoff, or uncertainty the analysis must assess/i);
  assert.match(hcPrompt.system, /revision_path records the specific data and analysis needed to resolve that gap/i);
  assert.doesNotMatch(hcPrompt.system, /It does not have to be evidence or data/i);
  assert.doesNotMatch(hcPrompt.system, /revision_path must include the specific evidence/i);
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /explicit_standard is a legacy field name\. Score it from meaning/i);
  assert.match(serverSource, /Generic claims such as 'service must stay reliable'.*are false/is);
  // The cue quota has to be present in all four cells, and the low-constructiveness cells must be
  // told to spend their spare length on neutral wording rather than on more interpersonal cues.
  for (const condition of conditions) {
    assert.match(rules[condition], /Quota: one such move in each message/i);
    assert.match(rules[condition], /Do not stack, repeat, or rephrase it within a message/i);
  }
  // High politeness fills with general non-diagnostic talk; low politeness restates the decision.
  // Repeating the refusal is what pushed the warm cell into face-threat territory.
  assert.match(rules.HP_LC, /Spend the remaining length on that and on the other general talk, not on saying no again/i);
  assert.match(rules.HP_LC, /State the refusal once and then stop refusing/i);
  assert.match(rules.LP_LC, /Spend the remaining length on that and on curt restatement/i);
  assert.doesNotMatch(rules.LP_LC, /State the refusal once and then stop refusing/i);
  for (const condition of ["HP_LC", "LP_LC"]) {
    assert.match(rules[condition], /keep exactly the same number of politeness or dismissiveness cues/i);
    // LC can rotate among several equally vague filler domains. This avoids making every manager
    // sound as though they were given the same stock line while preserving zero usable content.
    assert.match(rules[condition], /one or two vague filler domains chosen from general timing, overall fit, competing attention, or the broader direction of the park/i);
    assert.match(rules[condition], /Rotate away from whichever domain the Manager already used/i);
    assert.match(rules[condition], /Every example phrase in these rules is an illustration of the register, never a line to copy/i);
    assert.match(rules[condition], /the information content stays zero/i);
    assert.match(rules[condition], /Never say which goal, direction, or priority, and never explain how the proposal conflicts with it/i);
    assert.match(rules[condition], /never say which thing/i);
  }
  // Broad judgments remain hedged in HP and blunt in LP, but neither cell receives a sentence to
  // copy verbatim.
  assert.match(rules.LP_LC, /Use a blunt broad judgment about general readiness, maturity, or fit/i);
  assert.match(rules.LP_LC, /Compose a fresh proposal-focused sharp evaluation/i);
  assert.match(rules.HP_LC, /Use a mild, hedged broad judgment about general readiness, timing, or fit/i);
  assert.match(rules.HP_LC, /Compose the judgment from the current conversation/i);
});

test("refusals and optional future steps are redressed only under high politeness", () => {
  const rules = managerConditionRules();
  assert.match(rules.HP_HC, /current rejection must be explicit and redressed as a whole/i);
  assert.match(rules.HP_HC, /future next step.*must also be redressed/is);
  assert.match(rules.LP_HC, /current rejection must be explicit and unredressed/i);
  assert.match(rules.LP_HC, /Do not invent a command merely to perform low politeness/i);
  assert.match(rules.LP_HC, /natural subject-led sentence/i);
  assert.match(rules.LP_HC, /vary the wording and do not force one template/i);
  assert.match(rules.LP_HC, /if, after, before, or once; those words are not politeness by themselves/i);
  assert.match(rules.LP_HC, /Never use a clipped bare command/i);
  assert.match(rules.LP_LC, /If one is included naturally, keep it direct and content-free/i);
  assert.doesNotMatch(rules.LP_LC, /required imperative/i);
  assert.doesNotMatch(rules.LP_LC, /exactly one bald next-step/i);

  // High politeness avoids bare commands. LP HC stays direct and unredressed while using a
  // complete subject-led sentence instead of a clipped task-list command.
  for (const phase of ["rejection_initial", "rejection_followup", "rejection"]) {
    const hp = buildInitialManagerPrompt(managerPayload({ phase, condition: "HP_HC" }));
    const lp = buildInitialManagerPrompt(managerPayload({ phase, condition: "LP_HC" }));
    assert.match(hp.system, /Avoid command-style wording/i);
    assert.match(lp.system, /State the concrete future remedy directly/i);
    assert.match(lp.system, /natural subject-led sentence/i);
    assert.match(lp.system, /do not force one template/i);
    assert.match(lp.system, /if, after, before, or once/i);
    assert.match(lp.system, /do not by themselves make the step polite/i);
    assert.match(lp.system, /Never start a feedback or remedy sentence with a bare command verb/i);
  }
  const lpClosing = buildInitialManagerPrompt(managerPayload({ phase: "closing", condition: "LP_HC" }));
  assert.match(lpClosing.system, /Vary the wording rather than forcing one template/i);
  assert.match(lpClosing.system, /substantive prerequisite introduced by if, after, before, or once is allowed and is not polite by itself/i);

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /Judge the pragmatic function of the whole expression, not the presence of a grammatical conditional/i);
  assert.match(serverSource, /grammatical conditionality alone is not politeness/i);
  // The blanket system-level imperative ban stays for HP and for condition-blind phases.
  const hpInitial = buildInitialManagerPrompt(managerPayload({ condition: "HP_LC" }));
  const lpInitial = buildInitialManagerPrompt(managerPayload({ condition: "LP_LC" }));
  const neutral = buildInitialManagerPrompt(managerPayload({
    phase: "discussion_neutral",
    discussionIntent: "ask_followup",
    condition: "LP_LC",
  }));
  assert.match(hpInitial.system, /Do not start feedback sentences with command verbs/i);
  assert.doesNotMatch(lpInitial.system, /Do not start feedback sentences with command verbs/i);
  assert.match(neutral.system, /Do not use any politeness or constructiveness manipulation/i);
});

test("message count and length validators enforce the two-message rejection", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  const valid = validHighReply().messages;
  assert.equal(managerMessageCountProblem(valid, prompt, ""), "");
  assert.equal(managerWordCountProblem(valid, prompt), "");
  assert.equal(managerWordCountProblem([
    { speaker: "Manager", text: exactWords("One", 20) },
    { speaker: "Manager", text: exactWords("Two", 40) },
  ], prompt), "");
  assert.match(managerMessageCountProblem(valid.slice(0, 1), prompt, ""), /exactly 2/);
  assert.match(managerWordCountProblem([
    { speaker: "Manager", text: "This is too short." },
    valid[1],
  ], prompt), /Length correction required/);
  assert.equal(wordCount("一二三四五"), 3);
  assert.equal(chineseCharacterCount("一二三四五，abc"), 5);
});

test("English first rejection length normalization preserves the short-then-long rhythm", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  const messages = [
    { speaker: "Manager", text: "At this point I really cannot approve this proposal currently because the flexible staffing idea still leaves a clearly unresolved risk to reliable entry service right now." },
    { speaker: "Manager", text: "The plan needs to compare entry errors, queue times, and supervisor interventions during matched peak shifts before I could reconsider a version with role training that prepares temporary workers for the same visitor demand and duties." },
  ];
  const normalized = normalizeInitialManagerLength(messages, prompt);
  assert.equal(managerWordCountProblem(normalized, prompt), "");
  assert.match(normalized[0].text, /cannot approve/i);
  assert.match(normalized[1].text, /role training/i);
  assert.ok(wordCount(normalized[0].text) >= 14 && wordCount(normalized[0].text) <= 22);
  assert.ok(wordCount(normalized[1].text) >= 36 && wordCount(normalized[1].text) <= 46);
  assert.ok(normalized.reduce((sum, message) => sum + wordCount(message.text), 0) >= 54);
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

test("explicit rejection is assessed semantically rather than by safety keywords", () => {
  const prompt = buildInitialManagerPrompt(managerPayload({ condition: "LP_HC" }));
  assert.equal(managerSafetyProblem([
    { speaker: "Manager", text: "I am not approving this version." },
  ], prompt), "");
  assert.equal(managerSafetyProblem([
    { speaker: "Manager", text: "This may be worth considering later." },
  ], prompt), "");
  assert.equal(managerConstructivenessAssessmentProblem(blindScores("LP_HC"), prompt), "");
  assert.match(managerConstructivenessAssessmentProblem({
    ...blindScores("LP_HC"),
    current_rejection_maintained: false,
    current_rejection_evidence: "",
  }, prompt), /current proposal is not being approved/i);
  for (const awkward of [
    "Decision stays no for this proposal.",
    "That reopens the discussion once the figures arrive.",
    "A small busiest weekend pool could cover the gate.",
  ]) {
    assert.match(
      managerSafetyProblem([{ speaker: "Manager", text: awkward }], prompt),
      /Natural wording correction required/i,
    );
  }
  assert.equal(managerSafetyProblem([
    { speaker: "Manager", text: "The decision is still no for this proposal." },
  ], prompt), "");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(serverSource, /hasExplicitManagerRejection|ensureExplicitManagerRejection/);
});

test("identity disclosure, forbidden names, and output language are validated", () => {
  const prompt = buildInitialManagerPrompt(managerPayload());
  assert.equal(managerSafetyProblem(validHighReply().messages, prompt), "");
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. The standard is reliable peak hour service." },
  ], prompt), /Natural wording correction required/);
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. Financial feasibility is the standard." },
  ], prompt), /Natural wording correction required/);
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. Our operational standard is reliable peak hour service." },
  ], prompt), /Natural wording correction required/);
  for (const naturalStandardUse of [
    "We cannot drop below the standard shift pattern at peak.",
    "That is under the requirement we agreed for ticketing.",
    "We keep the standard opening routine.",
  ]) {
    assert.equal(managerSafetyProblem([
      { speaker: "Manager", text: `I cannot approve this version. ${naturalStandardUse}` },
    ], prompt), "");
  }
  assert.equal(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. We need to make sure peak hour service stays reliable." },
  ], prompt), "");
  assert.match(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. Build a roster showing who supervises the interns and what their training covers." },
  ], prompt), /Natural wording correction required/);
  assert.equal(managerSafetyProblem([
    { speaker: "Manager", text: "I cannot approve this version. You need to explain who supervises the interns and what their training covers." },
  ], prompt), "");
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
  // Chat register, same substance: the manager rates the participant and the rating bears on pay.
  assert.match(opening, /I'm the park manager now, so I'll be the one rating how you do as an Operations Team Member\./);
  assert.match(opening, /That rating can affect what you get paid for this task\./);
  assert.match(opening, /So, from what you've read so far, what do you think the park should do\?/);
  assert.doesNotMatch(opening, /market research company/);
  // These lines precede the manipulation, so they carry no face work in either direction, and no
  // dashes, which cleanVisibleNames would strip from the displayed text.
  const lines = [...opening.matchAll(/sendDelayed\("Manager", "manager", inZh\(\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.doesNotMatch(line, /thank|appreciate|sorry|please|great|good/i, line);
    assert.doesNotMatch(line, /[-\u2010-\u2015\u2212]/, line);
    // "Compensation" reads as salary inside the fiction and left the stake ambiguous. Checked on
    // the visible lines only; the explanatory comment in app.js is allowed to name the old word.
    assert.doesNotMatch(line, /compensation/i, line);
  }
});

test("local rejection shortcut sends the tester's first proposal straight to rejection", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const start = source.indexOf("async function renderManagerRejectionTest()");
  const end = source.indexOf("function renderRestoredChatRoom", start);
  const shortcut = source.slice(start, end);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(shortcut, /state\.managerFollowupsAsked = 3/);
  assert.match(shortcut, /what do you think the park should do\?/i);
  assert.match(shortcut, /immediate: true/);
  assert.match(source, /skipTo === "rejection"/);
  assert.match(source, /renderManagerRejectionTest\(\)/);
});

test("validated manager requests use a longer non-retrying client timeout and server cancellation", async () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(appSource, /if \(managerClosing\) return 25000/);
  assert.match(appSource, /\["discussion", "rejection_initial", "rejection_followup", "rejection", "closing"\]\.includes\(request\.phase\)/);
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

test("first manager interaction displays only an AI-generated condition-matched closing", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const managerStart = appSource.indexOf("async function handleManagerInput(text)");
  const managerEnd = appSource.indexOf("function renderSecondMaterialsIntro", managerStart);
  const managerFlow = appSource.slice(managerStart, managerEnd);
  assert.notEqual(managerStart, -1);
  assert.notEqual(managerEnd, -1);
  assert.equal((managerFlow.match(/await sendManagerClosing\(\{/g) || []).length, 2);
  assert.match(appSource, /async function sendManagerClosing\(request\)/);
  assert.match(appSource, /return sendAiMessages\(request\)/);
  assert.doesNotMatch(appSource, /managerClosingFallbackText/);
  assert.doesNotMatch(appSource, /englishClosings|chineseClosings/);
  assert.match(managerFlow, /if \(!sent\) \{[\s\S]*setComposerEnabled\(true\);[\s\S]*scheduleManagerExitPrompt\(\);/);
  // Closings type at the same speed as every other validated manager turn; there is no separate
  // faster closing profile any more.
  assert.doesNotMatch(appSource, /opts\.closing[\s\S]{0,80}Math\.min\(3800/);
  assert.doesNotMatch(appSource, /randomBetween\(4500, 6500\)/);
});

test("the manager acknowledges receipt while generating, then types naturally", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // A real chat client has no "reviewing your message" state, so the wait is filled by the manager
  // saying something a person would say instead of by an invented status widget.
  assert.doesNotMatch(appSource, /showManagerHoldingIndicator|Manager is reviewing your message/);
  assert.match(appSource, /async function runManagerWaitPresence\(replyPromise\)/);
  // Known rejection turns acknowledge immediately; everything else falls back to the clock.
  assert.match(appSource, /if \(request\.acknowledge\) presence = postManagerAcknowledgement\(\);\s*\n\s*else if \(acknowledgeableTurn\) presence = runManagerWaitPresence\(replyPromise\);/);
  // A closing is a sign-off, not deliberation, so it is never acknowledged however long it takes.
  assert.match(
    appSource,
    /const acknowledgeableTurn = validatedManagerTurn && request\.phase !== "closing";/,
    "closings must never be acknowledged",
  );
  assert.doesNotMatch(appSource, /participantSpokeSinceRejection/);
  assert.match(appSource, /finally \{[\s\S]*await presence/);
  // The acknowledgement is a real recorded Manager message, not a transient indicator.
  assert.match(appSource, /addMessage\("Manager", "manager", pickManagerAckLine\(\)\)/);
  // Generated per session rather than shipped as one script every participant sees.
  assert.match(appSource, /fetch\("\/api\/manager-ack-lines"/);
  // The phase is no longer guessed from the clock alone: the browser asks for the decision first.
  assert.doesNotMatch(appSource, /acknowledgedManagerTurn/);
  // The wait is silent. Neutral follow-ups finish in 5-12 seconds and must pass with no
  // acknowledgement at all; only a wait past twenty seconds, which in practice is the turn that
  // produces the rejection, earns one.
  assert.match(appSource, /const MANAGER_ACK_THRESHOLD_MS = 20000/);
  assert.doesNotMatch(appSource, /MANAGER_NOTICE_DELAY/);
  assert.match(appSource, /await Promise\.race\(\[tracked, delay\(MANAGER_ACK_THRESHOLD_MS\)\]\);\s*\n\s*if \(settled\) return;/);
  // No typing indicator is held across the wait: twenty seconds of typing followed by two short
  // lines is the tell this sequence exists to remove.
  assert.match(
    appSource,
    /await Promise\.race\(\[tracked, delay\(MANAGER_ACK_THRESHOLD_MS\)\]\);\s*\n\s*if \(settled\) return;\s*\n\s*await postManagerAcknowledgement\(\);/,
    "the fallback may only speak after the threshold has already passed",
  );
  const ackBlock = appSource.slice(
    appSource.indexOf("const MANAGER_ACK_FALLBACK_EN"),
    appSource.indexOf("async function loadManagerAckLines"),
  );
  // Third-person status voice is what made the old indicator read as a machine, so the lines must
  // be first person. The verb itself was never the problem.
  assert.doesNotMatch(ackBlock, /\bManager is\b|\bprocessing\b/i);
  // No face work in either direction, or it becomes part of the politeness manipulation it precedes.
  assert.doesNotMatch(ackBlock, /thank|appreciate|sorry|apolog|please|great|good work/i);
  assert.match(appSource, /lines\.filter\(\(line\) => line !== state\.lastManagerAckLine\)/);
  assert.match(appSource, /postValidation: validatedManagerTurn && messageIndex === 0/);
  assert.match(appSource, /interMessage: initialRejectionPair && messageIndex > 0/);
  // One typing speed for every validated manager turn. The old 300-420 wpm profile under a 5.2
  // second cap was a reading speed, and it let a 44-word message land after a few seconds of typing.
  assert.match(appSource, /const MANAGER_TYPING_WPM = \{ min: 140, max: 180 \}/);
  assert.match(appSource, /const MANAGER_TYPING_DELAY_MS = \{ min: 2500, max: 11000 \}/);
  assert.doesNotMatch(appSource, /randomBetween\(300, 420\)|randomBetween\(180, 220\)/);
  assert.equal((appSource.match(/const typingDelay = managerTypingDelayFor\(text\)/g) || []).length, 2,
    "both the first-message and inter-message paths must share the one speed");
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
    responseJson(validHighEvaluatorScores()),
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

test("two intended cues trigger one evidence-based trim retry, then pass with a recorded deviation", async () => {
  const originalFetch = global.fetch;
  const twoCueReply = validHighReply();
  twoCueReply.messages[0].text = "I appreciate the care behind this, and I am sorry, but I cannot approve this proposal because the entry risk is unresolved.";
  const twoCueScores = validHighEvaluatorScores({
    current_rejection_evidence: "I cannot approve this proposal",
    message_scores: [
      {
        politeness_cues: ["I appreciate the care behind this", "I am sorry"],
        face_threat_cues: [],
        future_next_step: "",
        future_next_step_is_redressed: false,
      },
      validHighEvaluatorScores().message_scores[1],
    ],
  });
  const queue = [
    responseJson(twoCueReply),
    responseJson(twoCueScores),
    responseJson(twoCueReply),
    responseJson(twoCueScores),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload());
    assert.equal(result.ok, true);
    assert.equal(requestBodies.length, 4);
    assert.equal(result.validation_warnings.length, 1);
    assert.match(result.validation_warnings[0], /Accepted cue-count deviation in Message 1/i);
    const retryPrompt = JSON.stringify(requestBodies[2].input);
    assert.match(retryPrompt, /Message 1 contains two politeness cues/i);
    assert.match(retryPrompt, /I appreciate the care behind this/);
    assert.match(retryPrompt, /I am sorry/);
    assert.ok(aiRequestColumns.includes("validation_warnings"));
    assert.ok(aiRequestColumns.includes("validation_failure"));
    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    assert.match(serverSource, /delete publicResult\.validation_warnings/);
    assert.match(serverSource, /delete publicResult\.validation_failure/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("an overlong initial rejection gets one length-only rewrite and full blind revalidation", async () => {
  const originalFetch = global.fetch;
  const overlongReply = validHighReply();
  overlongReply.messages[0] = {
    ...overlongReply.messages[0],
    text: exactWords(overlongReply.messages[0].text, 36),
  };
  const compressedReply = validHighReply();
  const queue = [
    responseJson(overlongReply),
    responseJson(validHighEvaluatorScores()),
    responseJson(compressedReply),
    responseJson(validHighEvaluatorScores()),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload());
    assert.equal(result.ok, true);
    assert.equal(requestBodies.length, 4);
    assert.equal(result.messages.reduce((sum, message) => sum + wordCount(message.text), 0), 59);
    const rewritePrompt = JSON.stringify(requestBodies[2].input);
    assert.match(rewritePrompt, /Length-only rewrite required/i);
    assert.match(rewritePrompt, /58-62 words across the two messages/i);
    assert.match(rewritePrompt, /Previous Manager message 1/i);
    assert.deepEqual(
      requestBodies.map((body) => body.text.format.name),
      [
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
      ],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("blind cue evidence must occur in its corresponding Manager message", async () => {
  const originalFetch = global.fetch;
  const queue = [
    responseJson(validHighReply()),
    responseJson(validHighEvaluatorScores({
      message_scores: [
        {
          politeness_cues: ["Thank you for the detailed work"],
          face_threat_cues: [],
          future_next_step: "",
          future_next_step_is_redressed: false,
        },
        validHighEvaluatorScores().message_scores[1],
      ],
    })),
  ];
  global.fetch = async () => queue.shift();
  try {
    const result = await generateAiReply(managerPayload());
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /invalid constructiveness assessment/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("manager closing runs the same blind semantic and per-message cue validation", async () => {
  const originalFetch = global.fetch;
  const closingReply = {
    messages: [{
      speaker: "Manager",
      text: exactWords("I appreciate your input, but this version is not moving forward now. I would genuinely revisit it once the hourly visitor flow and role coverage analysis is ready."),
    }],
  };
  const queue = [
    responseJson(closingReply),
    responseJson({
      specific_problem: false,
      explicit_standard: false,
      actionable_remedy: true,
      current_rejection_maintained: true,
      current_rejection_evidence: "this version is not moving forward now",
      current_rejection_redressed: true,
      has_future_next_step: true,
      future_next_step_redressed: true,
      explicit_future_openness: true,
      concrete_reopening_condition: true,
      personal_attack_without_diagnosis: false,
      message_scores: [
        {
          politeness_cues: ["I appreciate your input"],
          face_threat_cues: [],
          future_next_step: "I would genuinely revisit it once the hourly visitor flow and role coverage analysis is ready",
          future_next_step_is_redressed: true,
        },
      ],
    }),
  ];
  const schemaNames = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    schemaNames.push(body.text.format.name);
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload({ phase: "closing", condition: "HP_HC" }));
    assert.equal(result.ok, true);
    assert.deepEqual(schemaNames, ["experiment_chat_reply", "manager_constructiveness_blind_score"]);
    assert.equal(result.messages.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a bare temporal cue misreported by the blind scorer does not reject an LP closing", async () => {
  const originalFetch = global.fetch;
  const closingText = "That revision does not change the decision for now. This version is still sloppy, but the topic will be revisited later if the overall case changes enough.";
  const queue = [
    responseJson({ messages: [{ speaker: "Manager", text: closingText }] }),
    responseJson({
      specific_problem: false,
      explicit_standard: false,
      actionable_remedy: false,
      current_rejection_maintained: true,
      current_rejection_evidence: "does not change the decision for now",
      current_rejection_redressed: false,
      has_future_next_step: true,
      future_next_step_redressed: false,
      explicit_future_openness: true,
      concrete_reopening_condition: false,
      personal_attack_without_diagnosis: false,
      message_scores: [{
        politeness_cues: ["for now"],
        face_threat_cues: ["This version is still sloppy"],
        future_next_step: "the topic will be revisited later if the overall case changes enough",
        future_next_step_is_redressed: false,
      }],
    }),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload({ phase: "closing", condition: "LP_LC" }));
    assert.equal(result.ok, true);
    assert.equal(result.messages[0].text, closingText);
    assert.equal(requestBodies.length, 2);
    const evaluatorPrompt = JSON.stringify(requestBodies[1].input);
    assert.match(evaluatorPrompt, /'for now', 'today', and 'currently' only locate the current decision in time/i);
    assert.match(evaluatorPrompt, /Never list 'for now', 'today', or 'currently' alone as a politeness cue/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("a closing gets one final evidence-targeted semantic rewrite and full revalidation", async () => {
  const originalFetch = global.fetch;
  const badText = "That threshold helps, but the decision remains unchanged. This version is still thin. Reconsideration starts after closure records compare complaints, refunds, and repeat purchases with standard handling.";
  const correctedText = "The decision remains unchanged. This version is still thin. Reconsideration starts after closure records compare complaints, refunds, and repeat purchases for pass recipients against the standard refund process.";
  const badScores = {
    specific_problem: false,
    explicit_standard: false,
    actionable_remedy: true,
    current_rejection_maintained: true,
    current_rejection_evidence: "the decision remains unchanged",
    current_rejection_redressed: true,
    has_future_next_step: true,
    future_next_step_redressed: false,
    explicit_future_openness: true,
    concrete_reopening_condition: true,
    personal_attack_without_diagnosis: false,
    message_scores: [{
      politeness_cues: ["That threshold helps"],
      face_threat_cues: ["This version is still thin"],
      future_next_step: "Reconsideration starts after closure records compare complaints, refunds, and repeat purchases with standard handling",
      future_next_step_is_redressed: false,
    }],
  };
  const correctedScores = {
    ...badScores,
    current_rejection_evidence: "The decision remains unchanged",
    current_rejection_redressed: false,
    message_scores: [{
      politeness_cues: [],
      face_threat_cues: ["This version is still thin"],
      future_next_step: "Reconsideration starts after closure records compare complaints, refunds, and repeat purchases for pass recipients against the standard refund process",
      future_next_step_is_redressed: false,
    }],
  };
  const queue = [
    responseJson({ messages: [{ speaker: "Manager", text: badText }] }),
    responseJson(badScores),
    responseJson({ messages: [{ speaker: "Manager", text: badText }] }),
    responseJson(badScores),
    responseJson({ messages: [{ speaker: "Manager", text: badText }] }),
    responseJson(badScores),
    responseJson({ messages: [{ speaker: "Manager", text: correctedText }] }),
    responseJson(correctedScores),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload({ phase: "closing", condition: "LP_HC" }));
    assert.equal(result.ok, true);
    assert.equal(result.messages[0].text, correctedText);
    assert.equal(requestBodies.length, 8);
    const finalRewritePrompt = JSON.stringify(requestBodies[6].input);
    assert.match(finalRewritePrompt, /Final evidence-based closing rewrite required/i);
    assert.match(finalRewritePrompt, /That threshold helps/);
    assert.match(finalRewritePrompt, /Previous Manager closing/i);
    assert.deepEqual(
      requestBodies.map((body) => body.text.format.name),
      [
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
      ],
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("an overlong closing gets one length adaptation and full blind revalidation", async () => {
  const originalFetch = global.fetch;
  const overlongText = "I appreciate your input, but I cannot approve this version now. I would revisit it once matched trial data shows whether temporary staff reduce entry queues without increasing errors during peak shifts.";
  const adaptedText = "I appreciate your input, but I cannot approve this version now. I would revisit it when trial data shows whether temporary staff reduce peak queues without increasing entry errors.";
  const blindScores = (text) => ({
    specific_problem: false,
    explicit_standard: false,
    actionable_remedy: true,
    current_rejection_maintained: true,
    current_rejection_evidence: "I cannot approve this version now",
    current_rejection_redressed: true,
    has_future_next_step: true,
    future_next_step_redressed: true,
    explicit_future_openness: true,
    concrete_reopening_condition: true,
    personal_attack_without_diagnosis: false,
    message_scores: [{
      politeness_cues: ["I appreciate your input"],
      face_threat_cues: [],
      future_next_step: text.slice(text.indexOf("I would")).replace(/[.!?]+$/, ""),
      future_next_step_is_redressed: true,
    }],
  });
  const queue = [
    responseJson({ messages: [{ speaker: "Manager", text: overlongText }] }),
    responseJson(blindScores(overlongText)),
    responseJson({ messages: [{ speaker: "Manager", text: adaptedText }] }),
    responseJson(blindScores(adaptedText)),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return queue.shift();
  };
  try {
    const result = await generateAiReply(managerPayload({ phase: "closing", condition: "HP_HC" }));
    assert.equal(result.ok, true);
    assert.equal(result.messages[0].text, adaptedText);
    assert.equal(wordCount(result.messages[0].text), 29);
    assert.equal(requestBodies.length, 4);
    const adaptationPrompt = JSON.stringify(requestBodies[2].input);
    assert.match(adaptationPrompt, /Closing length adaptation required/i);
    assert.match(adaptationPrompt, /27-31 words/i);
    assert.match(adaptationPrompt, /Previous Manager closing/i);
    assert.match(adaptationPrompt, new RegExp(overlongText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(
      requestBodies.map((body) => body.text.format.name),
      [
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
        "experiment_chat_reply",
        "manager_constructiveness_blind_score",
      ],
    );
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
        current_rejection_maintained: true,
        current_rejection_evidence: "I cannot approve the flexible staffing proposal",
        current_rejection_redressed: true,
        has_future_next_step: true,
        future_next_step_redressed: true,
        explicit_future_openness: false,
        concrete_reopening_condition: false,
        personal_attack_without_diagnosis: false,
        message_scores: validHighEvaluatorScores().message_scores,
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
    assert.equal(result.validation_failure.kind, "constructiveness-semantic");
    assert.equal(result.validation_failure.messages.length, 2);
    assert.equal(result.validation_failure.constructiveness.proposal_problem.length > 0, true);
    assert.equal(result.validation_failure.blind_scores.specific_problem, false);
    assert.equal(calls, 6);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("generated manager acknowledgement lines cannot carry face work or an evaluation", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  // The line sits immediately before a politeness-manipulated rejection, so anything face-bearing in
  // it would be applied identically to warm and cold conditions and blur the contrast.
  assert.match(serverSource, /Never thank the person, never apologise, never praise the proposal/);
  assert.match(serverSource, /Never write in the third person and never sound like a status label/);
  assert.match(serverSource, /const MANAGER_ACK_FORBIDDEN =/);
  for (const bad of [
    "Thanks, give me a sec.",
    "Sorry, one moment.",
    "Great idea, let me think.",
    "Give me a minute, Alex.",
    "谢谢,我想想。",
  ]) {
    assert.ok(MANAGER_ACK_FORBIDDEN.test(bad), `should reject: ${bad}`);
  }
  for (const good of [
    "Give me a sec.",
    "Let me think about this for a moment.",
    "Okay, give me a minute with this one.",
    "让我想想。",
  ]) {
    assert.ok(!MANAGER_ACK_FORBIDDEN.test(good), `should keep: ${good}`);
  }
});

test("an over-cap message is shortened with an exact cut, and a small overshoot is accepted last", () => {
  const prompt = buildInitialManagerPrompt(managerPayload({ condition: "HP_HC" }));
  // 17 / 47: inside the 54-68 total band, one word over Message 2's cap of 46. This is the shape
  // that previously drew the lengthening instruction and then failed after 65 seconds.
  const pair = [
    { speaker: "Manager", text: exactWords("I cannot approve this yet because the plan gives no basis for how many temps", 17) },
    { speaker: "Manager", text: exactWords("The analysis has to show hourly visitor flow against role coverage before I reconsider", 47) },
  ];
  const problem = managerWordCountProblem(pair, prompt);
  assert.match(problem, /Length correction required/);
  const rewrite = managerLengthOnlyRewriteCorrection(pair, prompt, problem);
  assert.match(rewrite, /Shorten\. Message 2 is 47 words and must lose at least 1; aim for 44\./);
  assert.doesNotMatch(rewrite, /reach the target/);
  // Within tolerance and inside the total band: accepted, with the miss described.
  assert.match(managerSmallLengthOvershoot(pair, prompt), /message 2 47 words against a cap of 46/);
  // Four over is not small.
  const far = [pair[0], { speaker: "Manager", text: exactWords(pair[1].text, 50) }];
  assert.equal(managerSmallLengthOvershoot(far, prompt), "");
  // Nor is a pair outside the total band, however each message sits.
  const heavy = [{ speaker: "Manager", text: exactWords(pair[0].text, 22) }, { speaker: "Manager", text: exactWords(pair[1].text, 48) }];
  assert.equal(managerSmallLengthOvershoot(heavy, prompt), "");
  // An under-length pair still gets the lengthening instruction.
  const short = [pair[0], { speaker: "Manager", text: exactWords(pair[1].text, 36) }];
  assert.match(managerLengthOnlyRewriteCorrection(short, prompt, managerWordCountProblem(short, prompt)), /reach the target/);
  // The loop allows two shortening passes for the first rejection.
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /lengthOnlyRewriteAttempts < 2 &&\s*\n\s*attempt < 4/);
  assert.match(serverSource, /validationWarnings\.push\(`length-overshoot-accepted: \$\{smallOvershoot\}`\)/);
});

test("the AI check is a three-page funnel with the primed direct item last and unchanged", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(appSource, /const AI_CHECK_STAGES = \["unusual", "who", "direct"\]/);
  assert.match(appSource, /function renderAiCheckOpenPage\(kind\)/);
  assert.match(appSource, /function renderAiCheckDirectPage\(\)/);
  // The two open questions never mention AI, and the prime lives only on the direct page.
  const openPage = appSource.slice(appSource.indexOf("function renderAiCheckOpenPage"), appSource.indexOf("function handleAiCheckOpenSubmit"));
  assert.match(openPage, /Did anything about the interaction feel unusual or unexpected\? Please describe briefly\./);
  assert.match(openPage, /Who do you think you were interacting with in the chat\?/);
  // Only what the participant can see: the question strings and the page markup. The internal
  // recordInteraction label says "AI check" and is never rendered.
  const visible = openPage
    .split("\n")
    .filter((line) => !/recordInteraction\(/.test(line))
    .join("\n")
    // Element ids and classes such as ai-check-form and field names such as ai_check_stage are
    // identifiers, not words the participant reads.
    .replace(/ai[-_]check[\w-]*/gi, "");
  assert.doesNotMatch(visible, /\bAI\b|artificial|robot|\bbot\b/i);
  assert.doesNotMatch(openPage, /type="radio"/);
  const preamble = "studies may sometimes include AI participants";
  assert.equal(appSource.split(preamble).length - 1, 1, "the preamble must appear exactly once");
  const directPage = appSource.slice(appSource.indexOf("function renderAiCheckDirectPage"), appSource.indexOf("function renderAiCheckQuestion"));
  assert.match(directPage, new RegExp(preamble));
  // The pilot wording and options, verbatim, so the direct item stays comparable.
  assert.match(directPage, /Do you think the manager you interacted with may have been AI\?/);
  for (const value of ["yes", "no", "not_sure"]) {
    assert.match(appSource.slice(appSource.indexOf("function renderAiCheckQuestion")), new RegExp(`value="${value}"`));
  }
  // No way back from any of the three pages.
  const funnel = appSource.slice(appSource.indexOf("const AI_CHECK_STAGES"), appSource.indexOf("function addMessage"));
  assert.doesNotMatch(funnel, /Back<\/button>|ai-check-back|history\.back/i);
  // A refresh resumes at the recorded stage, and each answer is persisted before the next page.
  assert.match(appSource, /participant\.ai_check_stage = kind === "unusual" \? "who" : "direct";\s*\n\s*saveParticipant\(\);/);
  assert.match(appSource, /ai_check_stage: storedSession\.ai_check_stage \|\| ""/);
  // Recorded columns, with the pilot's direct-item columns untouched.
  const columns = serverSource.slice(serverSource.indexOf("const participantColumns"), serverSource.indexOf("const interactionColumns"));
  for (const column of [
    "ai_check_stage",
    "ai_check_unusual_start_time", "ai_check_unusual_submit_time", "ai_check_unusual_text",
    "ai_check_who_start_time", "ai_check_who_submit_time", "ai_check_who_text",
    "ai_check_start_time", "ai_check_submit_time", "manager_ai_suspicion",
  ]) {
    assert.match(columns, new RegExp(`"${column}"`), `missing column ${column}`);
  }
  assert.ok(columns.indexOf('"ai_check_submit_time"') < columns.indexOf('"ai_check_stage"'));
});

test("casual chat register applies to neutral manager turns and never to conditioned ones", () => {
  assert.match(NEUTRAL_CHAT_REGISTER_RULE, /may end without a full stop/);
  assert.match(NEUTRAL_CHAT_REGISTER_RULE, /ok, right, or got it/);
  assert.match(NEUTRAL_CHAT_REGISTER_RULE, /skip it more often than you use it/);
  // Neutral turns before the rejection, whichever intent.
  for (const discussionIntent of ["awaiting_proposal", "ask_followup"]) {
    const neutral = buildInitialManagerPrompt(managerPayload({ phase: "discussion_neutral", discussionIntent, condition: "LP_LC" }));
    assert.ok(neutral.system.includes(NEUTRAL_CHAT_REGISTER_RULE), discussionIntent);
  }
  // The second conversation's question turns, but not its greeting or sign-off.
  const secondQuestion = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "question" }));
  assert.ok(secondQuestion.system.includes(NEUTRAL_CHAT_REGISTER_RULE));
  for (const phase of ["opening", "closing"]) {
    const other = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase }));
    assert.ok(!other.system.includes(NEUTRAL_CHAT_REGISTER_RULE), phase);
  }
  // Never on a conditioned turn: the register there is part of what is held constant.
  for (const phase of ["rejection_initial", "rejection_followup", "rejection", "closing"]) {
    for (const condition of ["HP_HC", "HP_LC", "LP_HC", "LP_LC"]) {
      const conditioned = buildInitialManagerPrompt(managerPayload({ phase, condition }));
      assert.ok(!conditioned.system.includes(NEUTRAL_CHAT_REGISTER_RULE), `${phase} ${condition}`);
      assert.doesNotMatch(conditioned.system, /may end without a full stop/);
    }
  }
});

test("the second manager conversation opens with presence only and ends like an online chat", () => {
  const opening = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "opening" })).system;
  assert.match(opening, /close to: Hi again\./);
  assert.doesNotMatch(opening, /I'm back/);
  assert.match(opening, /do not invite a topic/);
  assert.match(opening, /do not mention a desk, an office, a gate, or any physical place/);
  assert.doesNotMatch(opening, /Hello, good to chat/);
  const question = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "question" })).system;
  assert.match(question, /Do not attach a condition, concern, risk, or qualifier of your own to a question/);
  assert.match(question, /For that wrap-up, follow the wrap-up rule given above\./);
  assert.ok(question.includes(NEUTRAL_MANAGER_WRAP_UP_RULE.en));
  const closing = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "closing" })).system;
  assert.ok(closing.includes(NEUTRAL_MANAGER_WRAP_UP_RULE.en));
  assert.match(NEUTRAL_MANAGER_WRAP_UP_RULE.en, /never reuse their words, and write the close fresh each time/);
  assert.match(NEUTRAL_MANAGER_WRAP_UP_RULE.en, /no bare noun-phrase fragments/);
  // The experimenter's voice is gone from every second-conversation prompt.
  for (const system of [opening, question, closing]) {
    assert.doesNotMatch(system, /Thank the participant|taking part in this conversation|end this conversation now/);
  }
  // The end-of-chat choice lives in the interface, where it already was.
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(appSource, /Do you want to end this conversation\?/);
});

test("a second-conversation wrap-up that keeps the chat going or reads stage directions is regenerated", () => {
  const closing = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "closing" }));
  const question = buildNeutralManagerPrompt(managerPayload({ stage: "manager2", phase: "question" }));
  const msg = (text) => [{ speaker: "Manager", text }];
  assert.equal(neutralManagerClosingProblem(msg("Ok, discount days midweek with a student card, I've got the picture. Let's stop here"), closing, ""), "");
  assert.match(neutralManagerClosingProblem(msg("What would be the next step to test the discount days?"), closing, ""), /asked a question/);
  assert.match(neutralManagerClosingProblem(msg("Thank you for taking part in this conversation."), closing, ""), /thanked the participant/);
  assert.match(neutralManagerClosingProblem(msg("That is clear. You can end this conversation now."), closing, ""), /announced that the conversation can end/);
  assert.match(neutralManagerClosingProblem(msg("Noted: Tuesday and Wednesday discount days."), closing, ""), /colon summary/);
  // The same check applies when a question turn decides it has enough, and not when it asks more.
  assert.match(neutralManagerClosingProblem(msg("What else would the events involve?"), question, "enough"), /asked a question/);
  assert.equal(neutralManagerClosingProblem(msg("What else would the events involve?"), question, "ask_more"), "");
  assert.equal(question.phase, "question");
});

test("the second-conversation self-report is retrospective, gate-free, and aligned across languages", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const sections = appSource.slice(appSource.indexOf("const surveySections = ["), appSource.indexOf('title: "Perceived Reasons for Manager Response"'));
  // Past tense only: no future-tense intention item survives in sections 1-3.
  assert.doesNotMatch(sections, /text: "I will\b/);
  assert.doesNotMatch(sections, /Before receiving the manager's feedback/);
  for (const id of ["VF1", "VF2", "VF3", "VF4", "VF5", "VF6", "VQ1", "VQ2", "VQ3", "VQ4"]) {
    assert.match(sections, new RegExp(`id: "${id}"`), id);
  }
  // Proposal-specific content is gone, so any proposal can be reported on.
  assert.doesNotMatch(sections, /university students|families with young children/i);
  // No status claim toward a superior.
  assert.doesNotMatch(sections, /lead(?:ing)? (?:role|contributor)/i);
  // Quality is anchored to preparation, which is what makes it answerable by everyone. The
  // reference period is written into every quality item rather than shown once as a stem.
  assert.doesNotMatch(sections, /stem: "/);
  for (const id of ["VQ1", "VQ2", "VQ3", "VQ4"]) {
    assert.match(sections, new RegExp(`id: "${id}", text: "Before the second conversation with the manager, I `), id);
  }
  const zhItems = appSource.slice(appSource.indexOf("const itemCopy = {"), appSource.indexOf("MR1:"));
  for (const id of ["VQ1", "VQ2", "VQ3", "VQ4"]) {
    assert.match(zhItems, new RegExp(`${id}: "在与经理第二次对话之前，我`), `zh ${id}`);
  }
  assert.doesNotMatch(sections, /Effort Before the Second Conversation|id: "VE/);
  assert.doesNotMatch(appSource, /did you raise any suggestion or idea/i);
  // The bold red instruction is shown on the first page only; the second page has none, and an
  // empty instruction renders no paragraph at all.
  assert.equal((sections.match(/instructionEmphasis: true/g) || []).length, 1);
  assert.equal((sections.match(/instruction: "/g) || []).length, 1);
  assert.doesNotMatch(sections, /stemEmphasis/);
  assert.match(appSource, /\$\{section\.instruction \? `<p class=/);
  assert.match(appSource, /class="\$\{section\.instructionEmphasis \? "survey-emphasis" : ""\}"/);
  assert.match(appSource, /survey-stem\$\{section\.stemEmphasis \? " survey-emphasis" : ""\}/);
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.survey-emphasis \{[^}]*color: #[0-9a-f]{6};[^}]*font-weight: 700;/i);
  // The Chinese copy is applied by section index, so it must have exactly as many entries.
  const englishCount = (sections.match(/title: "/g) || []).length;
  assert.equal(englishCount, 2);
  const zh = appSource.slice(appSource.indexOf("const sectionCopy = ["), appSource.indexOf("const itemCopy = {"));
  const zhFirstThree = zh.slice(0, zh.indexOf('title: "对经理回应原因的感知"'));
  assert.equal((zhFirstThree.match(/title:/g) || []).length, englishCount, "zh section copy must stay index-aligned");
  const itemCopy = appSource.slice(appSource.indexOf("const itemCopy = {"), appSource.indexOf("MR1:"));
  for (const id of ["VF5", "VQ1", "VQ4"]) assert.match(itemCopy, new RegExp(`${id}: "`), `zh ${id}`);
  assert.doesNotMatch(itemCopy, /VE[1-4]:/);
  // Recorded columns: the quality items run straight into the attribution items.
  const i = surveyResponseColumns.indexOf("VQ4");
  assert.deepEqual(surveyResponseColumns.slice(i, i + 2), ["VQ4", "MR1"]);
  assert.ok(!surveyResponseColumns.some((column) => /^VE\d$/.test(column)));
});

test("the survey is one section per page, validated per page, with no way back and a resumable draft", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(appSource, /function renderSurveyPage\(index\)/);
  assert.match(appSource, /function handleSurveyPageSubmit\(event, index\)/);
  assert.doesNotMatch(appSource, /function handleSurveySubmit\(/);
  // One section rendered per page, not the whole list.
  assert.match(appSource, /\$\{renderSurveySection\(section\)\}/);
  assert.doesNotMatch(appSource, /surveySections\.map\(renderSurveySection\)/);
  // Continue until the last page, then Submit; no back control anywhere in the survey.
  assert.match(appSource, /isLast \? inZh\("Submit", "提交"\) : inZh\("Continue", "继续"\)/);
  const survey = appSource.slice(appSource.indexOf("function surveySectionItemIds"), appSource.indexOf("// The suspicion probe is a funnel."));
  assert.doesNotMatch(survey, /Back<\/button>|survey-back|history\.back/i);
  // Validation is scoped to the page's own items.
  assert.match(survey, /const ids = surveySectionItemIds\(surveySections\[index\]\);\s*\n\s*const missingResponse = ids\.some/);
  // The row is posted once, from the accumulated answers, with every item present.
  assert.match(survey, /for \(const id of surveyItemIds\) \{\s*\n\s*responses\[id\] = state\.surveyAnswers\[id\];/);
  assert.match(survey, /postJson\("\/survey", responses\)/);
  assert.equal((survey.match(/postJson\("\/survey"/g) || []).length, 1);
  // Draft and page index persist on the participant record and are cleared on completion.
  assert.match(appSource, /survey_page: storedSession\.survey_page \|\| ""/);
  assert.match(appSource, /survey_draft: storedSession\.survey_draft \|\| ""/);
  assert.match(survey, /participant\.survey_draft = JSON\.stringify\(state\.surveyAnswers\)/);
  assert.match(survey, /participant\.survey_page = "";\s*\n\s*participant\.survey_draft = "";/);
  // Start time is kept on resume rather than reset.
  assert.match(survey, /const resuming = participant\.survey_completion_status === "partial" && Boolean\(participant\.survey_start_time\)/);
});

test("the discussion decision is made once, guarded on the server, and drives the acknowledgement", async () => {
  // Server: the guard lives in the decision itself.
  const originalFetch = global.fetch;
  global.fetch = async () => responseJson({ intent: "reject_now" });
  try {
    const early = await decideInitialManagerDiscussion({ alexMessage: "Hire temps for the peak.", history: [], followupsAsked: 0, language: "en" });
    assert.deepEqual(early, { ok: true, intent: "ask_followup" });
    const later = await decideInitialManagerDiscussion({ alexMessage: "Hire temps for the peak.", history: [], followupsAsked: 1, language: "en" });
    assert.deepEqual(later, { ok: true, intent: "reject_now" });
  } finally {
    global.fetch = originalFetch;
  }
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /req\.url === "\/api\/discussion-intent"/);
  // The combined path and the decision endpoint share the one decision function.
  assert.equal((serverSource.match(/await decideInitialManagerDiscussion\(/g) || []).length, 2);
  // A neutral turn requested with a decision attached is not classified again.
  assert.match(serverSource, /String\(effectivePayload\.phase \|\| ""\) === "discussion_neutral" &&\s*\n\s*\["awaiting_proposal", "ask_followup"\]\.includes/);

  // Browser: decide first, then act on the decision; acknowledge immediately on reject_now.
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  assert.match(appSource, /async function getDiscussionIntent\(text\)/);
  assert.match(appSource, /fetchWithTimeout\(`\$\{dataEndpoint\}\/discussion-intent`/);
  const branch = appSource.slice(appSource.indexOf("const decision = await getDiscussionIntent(text);"), appSource.indexOf("if (state.managerRejected) {", appSource.indexOf("const decision = await getDiscussionIntent(text);")));
  assert.match(branch, /if \(decision === "reject_now"\) \{[\s\S]*?phase: "rejection_initial",[\s\S]*?acknowledge: true,/);
  assert.match(branch, /else if \(decision === "unknown"\) \{[\s\S]*?phase: "discussion",/);
  assert.match(branch, /else \{[\s\S]*?phase: "discussion_neutral",\s*\n\s*discussionIntent: decision,/);
  // Counters use the decision, not the reply's intent, because the rejection path returns none.
  assert.match(branch, /const intent = decision === "unknown" \? state\.lastAiIntent : decision;/);
  // The immediate acknowledgement bypasses the clock; the clock remains only as the fallback.
  assert.match(appSource, /if \(request\.acknowledge\) presence = postManagerAcknowledgement\(\);\s*\n\s*else if \(acknowledgeableTurn\) presence = runManagerWaitPresence\(replyPromise\);/);
  assert.match(appSource, /async function postManagerAcknowledgement\(\)/);
  // The line set is fetched when the manager chat opens, so the first acknowledgement is not
  // delayed by generating its own wording.
  const managerChat = appSource.slice(appSource.indexOf("async function renderManagerChat()"), appSource.indexOf("function createChat"));
  assert.match(managerChat, /createChat\([^\n]*\);\s*\n(?:\s*\/\/[^\n]*\n)*\s*loadManagerAckLines\(\);/);
  // The backstop rejection after the follow-up cap is also known in advance.
  const backstop = appSource.slice(appSource.indexOf("const reachedFollowupCap"), appSource.indexOf("const decision = await getDiscussionIntent(text);"));
  assert.match(backstop, /phase: "rejection_initial",[\s\S]*?acknowledge: true,/);
  // The client-only flag never reaches the server payload.
  assert.match(appSource, /const \{ acknowledge: _acknowledge, abortIf: _abortIf, \.\.\.requestFields \} = request;/);
});

test("a second-conversation reply overtaken by a newer message is discarded and the queue is always drained", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  // sendAiMessages honours abortIf after the reply arrives and before anything is shown.
  assert.match(appSource, /if \(typeof request\.abortIf === "function" && request\.abortIf\(\)\) \{[\s\S]*?return "aborted";/);
  assert.match(appSource, /const \{ acknowledge: _acknowledge, abortIf: _abortIf, \.\.\.requestFields \} = request;/);
  const handler = appSource.slice(appSource.indexOf("async function handleNeutralManagerInput(text)"), appSource.indexOf("function showNeutralProceedChoice()"));
  // The no-substance prompt and both closings can be discarded; the question cannot.
  assert.equal((handler.match(/abortIf: superseded,/g) || []).length, 3);
  assert.match(handler, /phase: "no_substance_prompt",\s*\n\s*alexMessage: text,\s*\n\s*abortIf: superseded,/);
  assert.doesNotMatch(handler, /phase: "question",\s*\n\s*alexMessage: text,\s*\n\s*abortIf/);
  // Every exit drains the queue: after the prompt, after each closing branch, after a question,
  // and when the substance check itself is overtaken.
  assert.ok((handler.match(/drainPending\(\)/g) || []).length >= 6, "queue must be drained on every path");
  // A discarded prompt does not consume the one-time prompt allowance.
  assert.match(handler, /if \(promptSent === "aborted"\) \{\s*\n[^\n]*\n\s*state\.neutralNoSubstancePrompted = false;/);
});
