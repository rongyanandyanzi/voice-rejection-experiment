const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "prechat-flow-test-"));
process.env.DATA_DIR = testDataDir;
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MODEL = "gpt-4.1-mini";

const {
  chatIntentCheckColumns,
  buildPrechatPrompt,
  classifyChatIntentResponse,
  chatIntentConfig,
  generateAiReply,
  prechatQuestionTransitionProblem,
  recordChatIntentCheck,
} = require("../server");

function openAiJson(value, status = 200) {
  if (status >= 400) {
    return new Response(JSON.stringify({ error: { message: String(value) } }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ output_text: JSON.stringify(value) }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test.after(() => {
  fs.rmSync(testDataDir, { recursive: true, force: true });
});

test("prechat question intent remains a semantic classification", () => {
  const config = chatIntentConfig("prechat", "question", "en");
  assert.deepEqual(config.intents, ["no_question", "has_question", "other"]);
  assert.match(config.instructions, /communicative meaning semantically/i);
  assert.match(config.instructions, /never classify by matching a fixed word list/i);
  assert.match(config.instructions, /very short conversational reply/i);
  assert.match(config.instructions, /consider the whole message/i);
  assert.match(config.instructions, /examples.+are not a fixed phrase list/i);
});

test("the semantic classifier sends the complete reply to OpenAI", async () => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return openAiJson({ intent: "no_question" });
  };
  try {
    const result = await classifyChatIntentResponse({
      stage: "prechat",
      phase: "question",
      text: "No, I am ready to continue.",
      language: "en",
    });
    assert.deepEqual(result, { ok: true, intent: "no_question" });
    assert.match(requestBody.input[0].content, /semantically/i);
    assert.equal(requestBody.input[1].content, "Latest participant message:\nNo, I am ready to continue.");
  } finally {
    global.fetch = originalFetch;
  }
});

test("chat intent diagnostics distinguish semantic success from requests that never call the model", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => openAiJson({ intent: "no_question" });
  try {
    const semantic = {};
    await classifyChatIntentResponse({
      stage: "prechat",
      phase: "question",
      text: "Nothing I need to ask right now.",
      language: "en",
    }, semantic);
    assert.equal(semantic.source, "openai_semantic");

    const invalid = {};
    await classifyChatIntentResponse({
      stage: "unsupported",
      phase: "question",
      text: "no",
      language: "en",
    }, invalid);
    assert.equal(invalid.source, "not_called_invalid_request");

    const empty = {};
    await classifyChatIntentResponse({
      stage: "prechat",
      phase: "question",
      text: "",
      language: "en",
    }, empty);
    assert.equal(empty.source, "not_called_empty_input");
  } finally {
    global.fetch = originalFetch;
  }
});

test("a prechat question reply cannot announce a role transition", () => {
  const prompt = buildPrechatPrompt({
    phase: "question",
    language: "en",
    alexMessage: "How long does the study take?",
    history: [],
  });
  assert.match(prompt.system, /only for answering a participant question/i);
  assert.match(prompt.system, /do not say that role assignment is starting now/i);
  assert.match(prompt.system, /client handles the real transition separately/i);
  const screenshotReply = [{
    speaker: "Coordinator",
    text: "Great, thank you. I’ll move us on to role assignment now. Please follow the private instructions shown on your screen.",
  }];
  assert.match(
    prechatQuestionTransitionProblem(screenshotReply, { stage: "prechat", phase: "question" }),
    /falsely announced/i,
  );
  assert.equal(prechatQuestionTransitionProblem([{
    speaker: "Coordinator",
    text: "Roles will be assigned shortly. The whole study usually takes 10 to 15 minutes.",
  }], { stage: "prechat", phase: "question" }), "");
});

test("a false prechat transition claim is regenerated before display", async () => {
  const originalFetch = global.fetch;
  const responses = [
    openAiJson({
      messages: [{
        speaker: "Coordinator",
        text: "Great, thank you. I’ll move us on to role assignment now. Please follow the private instructions shown on your screen.",
      }],
    }),
    openAiJson({
      messages: [{
        speaker: "Coordinator",
        text: "The whole study usually takes about 10 to 15 minutes, depending on the reading and chat pace.",
      }],
    }),
  ];
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));
    return responses.shift();
  };
  try {
    const result = await generateAiReply({
      stage: "prechat",
      phase: "question",
      language: "en",
      alexMessage: "How long does the study take?",
      history: [],
    });
    assert.equal(result.ok, true);
    assert.equal(requestBodies.length, 2);
    assert.match(requestBodies[1].input[0].content, /falsely announced/i);
    assert.deepEqual(result.messages, [{
      speaker: "Coordinator",
      text: "The whole study usually takes about 10 to 15 minutes, depending on the reading and chat pace.",
    }]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("chat intent results and failures are persisted with session context", () => {
  const basePayload = {
    prolific_pid: "semantic_pid",
    study_id: "semantic_study",
    session_id: "semantic_session",
    condition: "LP_HC",
    manipulation_version: "constructiveness_v2",
    language: "en",
    stage: "prechat",
    phase: "question",
  };
  const successRow = recordChatIntentCheck({
    ...basePayload,
    text: "no questions from me",
  }, {
    ok: true,
    intent: "no_question",
  }, Date.now() - 7);
  assert.equal(successRow.intent, "no_question");
  assert.equal(successRow.classifier_source, "openai_semantic");

  const failureRow = recordChatIntentCheck({
    ...basePayload,
    text: "I am not sure whether I need anything else",
  }, {
    ok: false,
    status: 503,
    retryable: true,
    error: "temporary classifier failure",
  }, Date.now() - 11, "", "openai_semantic_error");
  assert.equal(failureRow.http_status, "503");
  assert.equal(failureRow.retryable, "true");
  assert.equal(failureRow.classifier_source, "openai_semantic_error");

  const logText = fs.readFileSync(path.join(testDataDir, "chat_intent_checks.csv"), "utf8");
  assert.equal(logText.split("\n")[0], chatIntentCheckColumns.join(","));
  assert.match(logText, /semantic_pid,semantic_study,semantic_session/);
  assert.match(logText, /no questions from me/);
  assert.match(logText, /no_question,openai_semantic/);
  assert.match(logText, /temporary classifier failure/);

  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /\["participants\.csv"[^\]]+"chat_intent_checks\.csv"[^\]]+\]\.includes\(basename\)/s);
  assert.match(serverSource, /"chat_intent_checks\.csv": chatIntentChecksPath/);
});

test("the browser sends session identifiers and shows transition state after no_question", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  const intentStart = appSource.indexOf("async function getChatIntent");
  const intentEnd = appSource.indexOf("async function handleManagerInput", intentStart);
  const intentSource = appSource.slice(intentStart, intentEnd);
  assert.match(intentSource, /prolific_pid: ids\.prolific_pid/);
  assert.match(intentSource, /study_id: ids\.study_id/);
  assert.match(intentSource, /session_id: ids\.session_id/);

  const questionBranchStart = appSource.indexOf('if (state.prechatAwaitingQuestions');
  const questionBranchEnd = appSource.indexOf("async function continueAfterPrechatIntro", questionBranchStart);
  const questionBranch = appSource.slice(questionBranchStart, questionBranchEnd);
  assert.match(questionBranch, /questionIntent === "no_question"/);
  assert.match(questionBranch, /setComposerEnabled\(false\)/);
  assert.match(questionBranch, /Assigning roles/);
  assert.match(questionBranch, /continueAfterPrechatQuestions\(\)/);
});
