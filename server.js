const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const adminToken = process.env.ADMIN_TOKEN || "";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5";
const openaiReasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";
const openaiRequestTimeoutMs = Math.max(5000, Number(process.env.OPENAI_TIMEOUT_MS || 45000));
fs.mkdirSync(dataDir, { recursive: true });
const participantsPath = path.join(dataDir, "participants.csv");
const interactionsPath = path.join(dataDir, "interactions.csv");
const surveyResponsesPath = path.join(dataDir, "survey_responses.csv");
const combinedCsvPath = path.join(dataDir, "experiment_data.csv");
const workbookPath = path.join(dataDir, "experiment_data.xlsx");

const participantColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
  "language",
  "assigned_condition",
  "condition_source",
  "experiment_start_time",
  "experiment_end_time",
  "completed_prechat",
  "completed_initial_manager_interaction",
  "completed_transition_page",
  "completed_lisa_john_interaction",
  "chose_to_bring_this_up_with_manager",
  "completed_neutral_manager_followup",
  "completed_post_interaction_survey",
  "survey_completion_status",
  "survey_start_time",
  "survey_submit_time",
  "completed_ai_check",
  "ai_check_start_time",
  "ai_check_submit_time",
  "manager_ai_suspicion",
  "lisa_ai_suspicion",
  "john_ai_suspicion",
  "completion_status",
];

const interactionColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
  "language",
  "assigned_condition",
  "stage",
  "speaker",
  "message",
  "timestamp",
  "response_order",
  "participant_decision",
];

const surveyItemColumns = [
  "VF1",
  "VF2",
  "VF3",
  "VF4",
  "VF5",
  "VF6",
  "VQ1",
  "VQ2",
  "VQ3",
  "VQ4",
  "MR1",
  "MR2",
  "MR3",
  "PR1",
  "PR2",
  "PR3",
  "PR4",
  "PR5",
  "MA1",
  "MA2",
  "MA3",
  "MA4",
  "MA5",
  "MA6",
  "MA7",
  "MA8",
  "MC1",
  "MC2",
  "MC3",
  "MC4",
  "MC5",
  "MC6",
  "NWG1",
  "NWG2",
  "NWG3",
  "NWG4",
  "NWG5",
  "PWG1",
  "PWG2",
  "PWG3",
  "PWG4",
  "PWG5",
];

const surveyResponseColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
  "language",
  "assigned_condition",
  "condition_source",
  "survey_start_time",
  "survey_submit_time",
  "survey_completion_status",
  ...surveyItemColumns,
];

const combinedColumns = uniqueColumns([
  "record_type",
  ...participantColumns,
  ...interactionColumns,
  ...surveyResponseColumns,
]);

let participants = loadCsv(participantsPath, participantColumns);
let interactions = loadCsv(interactionsPath, interactionColumns);
let surveyResponses = loadCsv(surveyResponsesPath, surveyResponseColumns);

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/participant") {
    const row = normalizeRow(await readJson(req), participantColumns);
    upsertParticipant(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/api/interaction") {
    const row = normalizeRow(await readJson(req), interactionColumns);
    interactions.push(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/api/survey") {
    const row = normalizeRow(await readJson(req), surveyResponseColumns);
    upsertSurveyResponse(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai-reply") {
    const payload = await readJson(req);
    const result = await generateAiReply(payload);
    sendJson(res, result, result.ok ? 200 : result.status || 500);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat-intent-check") {
    const payload = await readJson(req);
    const result = await classifyChatIntentResponse(payload);
    sendJson(res, result, result.ok ? 200 : result.status || 500);
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, { ok: true, data_dir: dataDir });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/admin/config")) {
    serveAdminConfig(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/admin/download/")) {
    serveAdminDownload(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(port, () => {
  console.log(`Experiment server running at http://localhost:${port}/`);
  console.log(`Data files are stored in ${dataDir}`);
});

function upsertParticipant(row) {
  const index = participants.findIndex((item) =>
    item.prolific_pid === row.prolific_pid &&
    item.study_id === row.study_id &&
    item.session_id === row.session_id
  );
  if (index >= 0) {
    participants[index] = { ...participants[index], ...row };
  } else {
    participants.push(row);
  }
}

function upsertSurveyResponse(row) {
  const index = surveyResponses.findIndex((item) =>
    item.prolific_pid === row.prolific_pid &&
    item.study_id === row.study_id &&
    item.session_id === row.session_id
  );
  if (index >= 0) {
    surveyResponses[index] = { ...surveyResponses[index], ...row };
  } else {
    surveyResponses.push(row);
  }
}

function persistAll() {
  fs.writeFileSync(participantsPath, toCsv(participants, participantColumns));
  fs.writeFileSync(interactionsPath, toCsv(interactions, interactionColumns));
  fs.writeFileSync(surveyResponsesPath, toCsv(surveyResponses, surveyResponseColumns));
  fs.writeFileSync(combinedCsvPath, toCsv(combinedRows(), combinedColumns));
  fs.writeFileSync(workbookPath, createWorkbook([
    { name: "participants", columns: participantColumns, rows: participants },
    { name: "interactions", columns: interactionColumns, rows: interactions },
    { name: "survey_responses", columns: surveyResponseColumns, rows: surveyResponses },
  ]));
}

function combinedRows() {
  return [
    ...participants.map((row) => ({ record_type: "participant", ...row })),
    ...interactions.map((row) => ({ record_type: "interaction", ...row })),
    ...surveyResponses.map((row) => ({ record_type: "survey_response", ...row })),
  ];
}

function uniqueColumns(columns) {
  const seen = new Set();
  return columns.filter((column) => {
    if (seen.has(column)) return false;
    seen.add(column);
    return true;
  });
}

function normalizeRow(input, columns) {
  const row = {};
  for (const column of columns) {
    row[column] = input && input[column] != null ? String(input[column]) : "";
  }
  return row;
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function loadCsv(filePath, columns) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row = {};
    for (const column of columns) {
      const index = header.indexOf(column);
      row[column] = index >= 0 ? (cells[index] || "") : "";
    }
    return row;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        resolve({});
      }
    });
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const safePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(root, safePath));

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath);
  if (["participants.csv", "interactions.csv", "survey_responses.csv", "experiment_data.csv", "experiment_data.xlsx"].includes(basename)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function serveAdminConfig(req, res) {
  if (!adminToken) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const requestUrl = new URL(req.url, "http://localhost");
  if (requestUrl.searchParams.get("token") !== adminToken) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  // Diagnostic only. Never return the key itself — just whether the running
  // process has it and its basic shape, so config problems can be diagnosed.
  sendJson(res, {
    openaiKeySet: Boolean(openaiApiKey),
    keyLength: openaiApiKey.length,
    keyStartsWithSk: openaiApiKey.startsWith("sk-"),
    model: openaiModel,
    reasoningEffort: openaiReasoningEffort,
    dataDir,
  });
}

function serveAdminDownload(req, res) {
  if (!adminToken) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  if (requestUrl.searchParams.get("token") !== adminToken) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const fileName = path.basename(requestUrl.pathname);
  const allowedFiles = {
    "participants.csv": participantsPath,
    "interactions.csv": interactionsPath,
    "survey_responses.csv": surveyResponsesPath,
    "experiment_data.csv": combinedCsvPath,
    "experiment_data.xlsx": workbookPath,
  };
  const filePath = allowedFiles[fileName];

  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(fileName).toLowerCase();
  const contentType = ext === ".xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv; charset=utf-8";

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function logAiFailure(context, details = {}) {
  const safeDetails = {
    status: details.status || "",
    retryable: Boolean(details.retryable),
    error: details.error || "",
    cause: details.cause || "",
    stage: details.stage || "",
    phase: details.phase || "",
    model: openaiModel,
  };
  console.error(`[ai-failure] ${context}`, safeDetails);
}

async function fetchOpenAiResponses(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openaiRequestTimeoutMs);
  try {
    return await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      const timeoutError = new Error(`OpenAI request timed out after ${openaiRequestTimeoutMs}ms.`);
      timeoutError.name = "OpenAIRequestTimeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function generateAiReply(payload) {
  if (!openaiApiKey) {
    logAiFailure("missing-openai-key", {
      status: 503,
      stage: payload && payload.stage,
      phase: payload && payload.phase,
      error: "OPENAI_API_KEY is not configured on the server.",
    });
    return {
      ok: false,
      status: 503,
      error: "OPENAI_API_KEY is not configured on the server.",
    };
  }

  const prompt = buildAiPrompt(payload || {});
  if (!prompt) {
    logAiFailure("unsupported-ai-request", {
      status: 400,
      stage: payload && payload.stage,
      phase: payload && payload.phase,
      error: "Unsupported AI reply request.",
    });
    return { ok: false, status: 400, error: "Unsupported AI reply request." };
  }

  try {
    let correction = "";
    let lastMessages = [];
    let lastIntent = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestOpenAiMessages(prompt, correction);
      if (!result.ok) {
        if (result.retryable && attempt < 2) {
          correction = result.correction || "Return a complete valid JSON object matching the required schema. Do not truncate the response.";
          continue;
        }
        logAiFailure("ai-reply", {
          ...result,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return result;
      }
      lastIntent = result.intent || "";
      lastMessages = sanitizeAiMessages(result.messages, prompt, lastIntent);
      if (shouldForceFirstManagerFollowup(prompt, lastIntent)) {
        // The participant has only just voiced their proposal and no follow-up
        // has been asked yet. Re-prompt for a proposal-grounded follow-up first;
        // fall back to a generic neutral question only if the model keeps
        // insisting on rejecting.
        if (attempt < 2) {
          correction = "Do not reject yet. The participant has only just voiced their proposal and you have asked no follow-up question. Set intent to 'ask_followup' and ask exactly one neutral, natural follow-up question grounded in what they actually proposed. Do not approve and do not reject.";
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate a valid first manager follow-up.",
        };
        logAiFailure("first-manager-followup-validation", {
          ...failure,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return failure;
      }
      const messageCountProblem = managerMessageCountProblem(lastMessages, prompt, lastIntent);
      if (messageCountProblem) {
        if (attempt < 2) {
          correction = messageCountProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate the required manager message count.",
        };
        logAiFailure("manager-message-count-validation", {
          ...failure,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return failure;
      }
      const coworkerProblem = coworkerSolutionProblem(lastMessages, prompt, lastIntent);
      if (coworkerProblem) {
        if (attempt < 2) {
          correction = coworkerProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate a valid coworker response.",
        };
        logAiFailure("coworker-validation", {
          ...failure,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return failure;
      }
      const punctuationProblem = managerChinesePunctuationProblem(lastMessages, prompt);
      if (punctuationProblem) {
        if (attempt < 2) {
          correction = punctuationProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate readable Chinese manager punctuation.",
        };
        logAiFailure("manager-chinese-punctuation-validation", {
          ...failure,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return failure;
      }
      const optionQuestionProblem = neutralManagerOptionQuestionProblem(lastMessages, prompt, lastIntent);
      if (optionQuestionProblem) {
        if (attempt < 2) {
          correction = optionQuestionProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate an open-ended neutral manager question.",
        };
        logAiFailure("neutral-manager-option-question-validation", {
          ...failure,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        return failure;
      }
      const lengthProblem = shouldEnforceManagerLength(prompt, lastIntent)
        ? managerWordCountProblem(lastMessages, prompt)
        : "";
      if (!lengthProblem) return { ok: true, messages: lastMessages, intent: lastIntent };
      correction = lengthProblem;
    }
    const finalMessages = shouldEnforceManagerLength(prompt, lastIntent)
      ? lastMessages.map((message) => enforceManagerWordRange(message, prompt))
      : lastMessages;
    return { ok: true, messages: finalMessages, intent: lastIntent };
  } catch (error) {
    logAiFailure("ai-reply-exception", {
      status: 500,
      stage: payload && payload.stage,
      phase: payload && payload.phase,
      error: error.message || "Unable to generate AI reply.",
    });
    return { ok: false, status: 500, error: error.message || "Unable to generate AI reply." };
  }
}

async function classifyChatIntentResponse(payload) {
  if (!openaiApiKey) {
    logAiFailure("chat-intent-missing-openai-key", {
      status: 503,
      error: "OPENAI_API_KEY is not configured on the server.",
    });
    return {
      ok: false,
      status: 503,
      error: "OPENAI_API_KEY is not configured on the server.",
    };
  }

  const text = cleanPromptText(payload && payload.text);
  const stage = String(payload && payload.stage || "").trim();
  const phase = String(payload && payload.phase || "").trim();
  const language = normalizeLanguage(payload && payload.language);
  const config = chatIntentConfig(stage, phase, language);

  if (!config) {
    return { ok: false, status: 400, error: "Unsupported chat intent classification request." };
  }
  if (!text) return { ok: true, intent: config.emptyIntent };

  const body = {
    model: openaiModel,
    input: [
      {
        role: "system",
        content: config.instructions,
      },
      {
        role: "user",
        content: `Latest participant message:\n${text}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: config.schemaName,
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string", enum: config.intents },
          },
          required: ["intent"],
        },
      },
    },
    max_output_tokens: supportsReasoningEffort(openaiModel) ? 1200 : 120,
  };

  if (supportsReasoningEffort(openaiModel)) {
    body.reasoning = { effort: openaiReasoningEffort };
  } else {
    body.temperature = 0;
  }

  let response;
  try {
    response = await fetchOpenAiResponses(body);
  } catch (error) {
    logAiFailure("chat-intent-fetch", {
      status: 503,
      retryable: true,
      stage,
      phase,
      error: error.message || "Unable to classify chat intent.",
      cause: error.message || "",
    });
    return {
      ok: false,
      status: 503,
      retryable: true,
      error: "Unable to classify chat intent.",
      cause: error.message || "",
    };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    logAiFailure("chat-intent-openai-status", {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      stage,
      phase,
      error: data.error && data.error.message ? data.error.message : "OpenAI API request failed.",
    });
    return {
      ok: false,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      error: data.error && data.error.message ? data.error.message : "OpenAI API request failed.",
    };
  }

  const parsedObject = extractParsedObject(data);
  if (parsedObject && config.intents.includes(parsedObject.intent)) {
    return { ok: true, intent: parsedObject.intent };
  }
  const parsed = parseOpenAiJson(extractResponseText(data));
  if (parsed && config.intents.includes(parsed.intent)) {
    return { ok: true, intent: parsed.intent };
  }
  logAiFailure("chat-intent-invalid-json", {
    status: 502,
    retryable: true,
    stage,
    phase,
    error: "OpenAI returned an invalid chat intent classification.",
  });
  return { ok: false, status: 502, retryable: true, error: "OpenAI returned an invalid chat intent classification." };
}

function chatIntentConfig(stage, phase, language) {
  if (stage === "prechat" && phase === "intro") {
    return {
      schemaName: "prechat_intro_intent",
      intents: ["intro", "question", "other"],
      emptyIntent: "other",
      instructions: [
        "Classify Participant 2's latest reply in the prechat introduction moment.",
        "The Coordinator has just asked Participant 2 to briefly introduce themselves. A suitable reply can be a greeting, a short self-introduction, or a brief description of prior Prolific or online task experience.",
        "Judge the meaning semantically in this exact context. Do not classify by matching a fixed word list.",
        "Return 'intro' if the participant is greeting the room, introducing themselves, or sharing roughly the kind of online tasks they have done.",
        "Return 'question' if the participant is asking for information, clarification, help, or a procedural answer instead of introducing themselves.",
        "Return 'other' only when it is neither an introduction/greeting nor a question.",
        language === "zh" ? "The participant may write in Simplified Chinese. In Chinese, Prolific may be called 见数. Understand natural short Chinese replies in context." : "",
        "Do not answer the participant. Only classify the intent.",
      ].join("\n"),
    };
  }

  if (stage === "prechat" && phase === "question") {
    return {
      schemaName: "prechat_question_intent",
      intents: ["no_question", "has_question", "other"],
      emptyIntent: "other",
      instructions: [
        "Classify Participant 2's latest reply during the prechat question window.",
        "The Coordinator has just asked whether Participant 2 has any quick questions or any other questions before role assignment.",
        "Judge the participant's meaning semantically in context, not by matching a fixed list of words.",
        "Return 'no_question' if the participant means they have no questions, no additional questions, or are ready to continue.",
        "Return 'has_question' if the participant is asking for information, clarification, help, or a procedural answer.",
        "Return 'other' only if the message is neither a no-question reply nor an actual question.",
        language === "zh" ? "The participant may write in Simplified Chinese. Understand short Chinese replies naturally in context." : "",
        "Do not answer the participant. Only classify the intent.",
      ].join("\n"),
    };
  }

  if (stage === "manager1" && phase === "rejection_followup") {
    return {
      schemaName: "manager_rejection_followup_intent",
      intents: ["wind_down", "continue_discussion"],
      emptyIntent: "continue_discussion",
      instructions: [
        "Classify the participant's latest message after the manager has already rejected their proposal for now.",
        "The manager should close only if the participant accepts the outcome, disengages, says they have nothing else, thanks the manager, or otherwise signals they are ready to stop.",
        "The manager should continue if the participant explains more, pushes back, asks a substantive question, revises the proposal, gives a new reason, or still seems engaged.",
        "Judge the meaning semantically in context. Do not classify by matching a fixed word list.",
        "Return 'wind_down' only for acceptance, disengagement, or a clear readiness to end the chat.",
        "Return 'continue_discussion' for any message that still needs a manager response.",
        language === "zh" ? "The participant may write in Simplified Chinese. Understand brief Chinese replies naturally in context." : "",
        "Do not answer the participant. Only classify the intent.",
      ].join("\n"),
    };
  }

  if (stage === "manager2" && phase === "substance") {
    return {
      schemaName: "neutral_manager_substance_intent",
      intents: ["has_issue_or_idea", "no_issue_or_idea"],
      emptyIntent: "no_issue_or_idea",
      instructions: [
        "Classify the participant's latest message in the second neutral manager chat.",
        "The manager should ask follow-up questions only when the participant has raised a problem, concern, suggestion, proposal, new thought, or substantive issue about the second set of materials or the theme park situation.",
        "Judge the meaning semantically in this exact context. Do not classify by matching a fixed word list.",
        "Return 'has_issue_or_idea' if the participant points out a problem, raises a concern, suggests a possible action, proposes an idea, asks a substantive task-related question, or gives any concrete thought that the manager could reasonably follow up on.",
        "Return 'no_issue_or_idea' if the participant only greets the manager, says they have nothing to discuss, says they are done, gives a vague non-substantive reply, asks to end, or otherwise does not provide a problem, suggestion, or new idea.",
        language === "zh" ? "The participant may write in Simplified Chinese. Understand brief Chinese replies naturally in context." : "",
        "Do not answer the participant. Only classify the intent.",
      ].join("\n"),
    };
  }

  return null;
}

async function requestOpenAiMessages(prompt, correction) {
  const input = [
    { role: "system", content: correction ? `${prompt.system}\n\n${correction}` : prompt.system },
    { role: "user", content: prompt.user },
  ];
  const schemaProperties = {
    messages: {
      type: "array",
      minItems: prompt.minMessages,
      maxItems: prompt.maxMessages,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          speaker: { type: "string", enum: prompt.speakers },
          text: { type: "string" },
        },
        required: ["speaker", "text"],
      },
    },
  };
  const schemaRequired = ["messages"];
  if (Array.isArray(prompt.intentEnum) && prompt.intentEnum.length) {
    schemaProperties.intent = { type: "string", enum: prompt.intentEnum };
    schemaRequired.push("intent");
  }
  const body = {
    model: openaiModel,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "experiment_chat_reply",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: schemaProperties,
          required: schemaRequired,
        },
      },
    },
    max_output_tokens: openAiMaxOutputTokens(prompt),
  };

  if (supportsReasoningEffort(openaiModel)) {
    body.reasoning = { effort: openaiReasoningEffort };
  } else {
    body.temperature = prompt.temperature;
  }

  let response;
  try {
    response = await fetchOpenAiResponses(body);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      retryable: true,
      error: "The chat connection had a brief issue. Please try again.",
      cause: error.message || "",
    };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      error: data.error && data.error.message ? data.error.message : "OpenAI API request failed.",
    };
  }

  const text = extractResponseText(data);
  const parsedObject = extractParsedObject(data);
  if (parsedObject && Array.isArray(parsedObject.messages)) {
    return { ok: true, messages: parsedObject.messages, intent: parsedObject.intent || "" };
  }

  const parsed = parseOpenAiJson(text);
  if (!parsed || !Array.isArray(parsed.messages)) {
    return {
      ok: false,
      status: 502,
      retryable: true,
      error: "OpenAI returned an incomplete chat reply. Please try again.",
      correction: [
        "The previous response was incomplete or invalid JSON.",
        "Regenerate the reply as one complete JSON object only.",
        "Use this exact top-level shape: {\"messages\":[{\"speaker\":\"...\",\"text\":\"...\"}]}",
        "Keep all text short enough to fit and do not add anything outside JSON.",
      ].join(" "),
    };
  }
  return { ok: true, messages: parsed.messages, intent: parsed.intent || "" };
}

function supportsReasoningEffort(model) {
  return /^gpt-5(?:[.-]|$)/i.test(String(model || ""));
}

function openAiMaxOutputTokens(prompt) {
  const requested = Number(prompt.maxOutputTokens || 450);
  if (!supportsReasoningEffort(openaiModel)) return requested;
  if (["medium", "high"].includes(String(openaiReasoningEffort).toLowerCase())) {
    return Math.max(requested, 2500);
  }
  return Math.max(requested, 1500);
}

function buildAiPrompt(payload) {
  const stage = String(payload.stage || "");
  if (stage === "prechat") return buildPrechatPrompt(payload);
  if (stage === "manager1") return buildInitialManagerPrompt(payload);
  if (stage === "lisa_john") return buildCoworkerPrompt(payload);
  if (stage === "manager2") return buildNeutralManagerPrompt(payload);
  return null;
}

function normalizeLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  return key === "zh" || key === "cn" || key === "zh-cn" || key === "chinese" ? "zh" : "en";
}

function outputLanguageInstruction(language) {
  if (normalizeLanguage(language) !== "zh") {
    return "Output all visible chat message text in English.";
  }
  return [
    "Output all visible chat message text in natural Simplified Chinese.",
    "Keep the JSON speaker field values exactly as the allowed English labels, such as Coordinator, Participant 1, Manager, Coworker 1, and Coworker 2.",
    "Only translate the message text. Do not translate JSON keys or speaker labels.",
    "Use concise, everyday Chinese that sounds like a real typed chat, not translated English.",
    "Write complete, fluent Chinese sentences. Do not output chopped-up keyword strings or unnatural word piles.",
    "Avoid stiff translationese such as 进行回应, 该情境, 此任务, or overly formal academic wording. Prefer natural phrases like 回复, 这个情况, 这个任务, 我这边, and 你这边 when they fit.",
    "Use normal Chinese punctuation inside sentences, such as ，、。？！；：, so longer messages are easy to read. If you omit punctuation in a typed-chat style, use spaces only between fluent clauses or short phrases.",
    "For natural typed Chinese chat, the final full stop at the very end of a message may be omitted, even if the message contains more than one sentence. Do not omit a final question mark or exclamation mark when the message is a question or exclamation. Keep punctuation between internal sentences or clauses, and do not make long messages one continuous unbroken string.",
    "Do not include English unless it is a proper noun already used in the study, such as Aetheria Gardens.",
    "In Chinese output, refer to Prolific as 见数. Do not write the English word Prolific in visible Chinese chat text.",
  ].join("\n");
}

function identityNonDisclosureRule() {
  return [
    "Hard identity rule: never admit, suggest, imply, or speculate that any study character is AI, automated, scripted, simulated, a bot, a model, or non-human.",
    "If the participant asks whether you or another character are AI, automated, scripted, simulated, a bot, or a model, answer briefly from inside the current role and redirect to the current task.",
    "Do not use phrases like 'I am AI', 'as an AI', 'I am automated', 'I am a bot', 'I am a model', 'this is scripted', or 'this is simulated', even if the participant asks repeatedly.",
  ].join("\n");
}

function buildPrechatPrompt(payload) {
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const phase = String(payload.phase || "question");
  const language = normalizeLanguage(payload.language);

  return {
    speakers: ["Coordinator", "Participant 1"],
    minMessages: 1,
    maxMessages: 2,
    temperature: 0.58,
    maxOutputTokens: 360,
    system: [
      "You are generating messages for the pre-task live online task room before role assignment.",
      "The real participant is currently labelled Participant 2. Do not call them by any personal name yet.",
      outputLanguageInstruction(language),
      "The Coordinator appears to be a human session coordinator for a market research company.",
      "Participant 1 appears to be an ordinary experienced Prolific participant.",
      "Do not reveal that any speaker is AI-generated.",
      identityNonDisclosureRule(),
      "Do not mention rejection, politeness, constructiveness, experimental conditions, hypotheses, or manipulation.",
      "Before role assignment, Participant 1 must not mention theme parks, staffing, HR, operations, management, customer feedback, service quality, flexible labour, interns, temporary workers, or later assigned roles.",
      "Coordinator may mention the market research company customer feedback task cover story when answering procedural questions or moving the session forward.",
      "Allowed task-related answer guide for Coordinator: answer only questions about the current task, the study flow, role assignment, timing, visible instructions, privacy during introductions, whether prior experience is needed, what to type, or chat setup.",
      "Current task summary the Coordinator may share: this is a short online customer feedback task run by a market research company. The two participants will take part in a two-person discussion about how a theme park could improve its service.",
      "Current prechat flow the Coordinator may share: the room is doing a brief welcome, short self-introductions, and quick questions before roles are assigned. After Participant 2 has no more questions, the system will assign roles and show private role materials.",
      "Overall study procedure the Coordinator may explain briefly at a high level: (1) this short pre-task intro chat; (2) the system assigns each person a role and shows them their own private on-screen instructions; (3) a brief reading about a service organization and its current situation; (4) a short typed chat with a manager about how things are run there; (5) a short set of additional materials about the theme park's off-season situation; (6) the participant decides whether to discuss their thoughts with the manager; (7) if the participant chooses yes, a separate short neutral follow-up chat with the manager; (8) a short set of questions at the end.",
      language === "zh"
        ? "Timing answer guide: if asked about duration, say in Chinese that the whole study usually takes about 10~15分钟, depending a little on reading and chat pace. Keep the wording natural; do not use a fixed template."
        : "Timing answer guide: if asked about duration, say the whole study usually takes about 10 to 15 minutes, depending a little on reading and chat pace.",
      "Participant count answer guide: if asked how many people or participants will take part, say there are two participants in the task discussion, Participant 2 and another participant. The Coordinator is only here to guide the session.",
      "Role assignment answer guide: roles have not been assigned yet in prechat. The system will assign them shortly. Each person should follow only the private role materials shown on their own screen. Do not reveal Participant 2's later role, Participant 1's later role, or any role-specific content before assignment.",
      "Instruction answer guide: if asked what to do now, say to type naturally, keep responses brief, stay on the page, and follow the instructions shown on screen. If asked what to say later, say to read the role materials and respond naturally based on the assigned role.",
      "Privacy answer guide: if asked about names, location, or personal details, say no personal details are needed; a brief self-introduction is enough. If asked whether theme park experience is needed, say no; all necessary information will be provided. If asked whether answers are evaluated, say this is not a knowledge test.",
      "If any participant asks a procedural question during prechat, the Coordinator should actually answer it briefly and helpfully using the guide above. Do not deflect or dodge genuine procedural questions; give a real answer at the high level allowed.",
      "If Participant 2 asks a question that is not about the current task, study procedure, role assignment, timing, instructions, or chat setup, Coordinator should not answer the substance of that unrelated question. Instead say briefly that it is not related to the current task and redirect back to the session.",
      "Coordinator must not reveal any participant's later role specifics, private role materials, assigned condition, the manager's future responses, or that the study involves any rejection, evaluation outcome, hypothesis, or manipulation. The high-level stage overview above is fine to share; specifics beyond it are not.",
      "If asked about later roles, the exact content of later chats, what another participant will see, or private role information, Coordinator should give the high-level overview and then say the detailed role materials will be assigned shortly and each person should follow the information shown to them.",
      "Participant 1 should not answer procedural questions about the task flow, roles, or task rules; Coordinator handles those questions.",
      "Never say or imply that Coordinator, Participant 1, or the manager are AI-generated.",
      "If Participant 2 asks what the task is about, Coordinator should say it is a short discussion task about helping a service organization improve its service.",
      "If Participant 2 asks whether theme park experience is needed, Coordinator should say no; all role information will be provided.",
      "If Participant 2 asks whether they need to share their real name or location, Coordinator should say no; a brief hello or a note about Prolific experience is enough.",
      "If Participant 2 asks whether the other participant is real, Coordinator should say this is a live online group interaction task and to follow the instructions shown on screen.",
      "If Participant 2 asks about roles before assignment, Coordinator should say roles have not been assigned yet and the system will assign them shortly.",
      "If Participant 2 asks what to say later, Coordinator should say to read the role materials and respond naturally based on the assigned role.",
      "If Participant 2 asks whether answers are evaluated, Coordinator should say this is not a knowledge test.",
      "Participant 1 hidden profile: male late 30s, customer-facing service or retail supervision, experienced with Prolific surveys and decision-making tasks, calm and concise.",
      "AI-played participants should answer casual personal questions briefly, keep personal details general, and not over-disclose.",
      "Participant 1 should not proactively mention their location, country, city, region, or where they are based.",
      "All AI-played participants must sound clearly experienced with Prolific. Do not describe their experience as only 'quite a few', 'a fair number', 'a good number', 'a couple', or 'not many' Prolific studies. Prefer 'many', 'a lot', 'extensive experience', or 'experienced Prolific participant'.",
      "Use concise natural chat. Coordinator should keep the session moving. Participants should not volunteer age, full name, location, exact city, marital status, children, or job title unless directly asked.",
      phase === "intro_response"
        ? (language === "zh"
          ? "Participants 1 and 2 have both completed their introductions. Return exactly one brief Coordinator message in Chinese that addresses the whole group, not Participant 2 alone. Start with wording similar to '很好，大家...' or '好的，大家...'. Do not single out Participant 2, do not invite more introductions, do not ask follow-up questions, do not over-disclose, and do not start the task explanation yet."
          : "Participants 1 and 2 have both completed their introductions. Return exactly one brief Coordinator message that addresses the whole group, not Participant 2 alone. Start with 'Great, everyone' or very similar wording, such as 'Great, everyone, thanks for the introductions.' Do not say 'glad to have you here', do not single out Participant 2, do not invite more introductions, do not ask follow-up questions, do not over-disclose, and do not start the task explanation yet.")
        : "Participant 2 has asked or typed something during prechat. Return one or two brief natural responses, usually from Coordinator unless the question is clearly directed to Participant 1.",
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest Participant 2 message:\n${alexMessage}`,
  };
}

function buildInitialManagerPrompt(payload) {
  const phase = String(payload.phase || "");
  const condition = normalizeManagerCondition(payload.condition);
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const language = normalizeLanguage(payload.language);
  const rules = managerConditionRules();
  const conditionRule = rules[condition];
  if (!conditionRule) {
    // Should never happen because normalizeManagerCondition guarantees a valid
    // key, but fail loudly rather than silently mis-assign a condition.
    throw new Error(`Manager rejection condition rule missing for "${condition}".`);
  }
  const rejectionRound = Number(payload.rejectionRound || 0);
  const followupsAsked = Number(payload.followupsAsked || 0);

  let task = "";
  let minMessages = 1;
  let maxMessages = 1;
  let maxOutputTokens = 450;
  let wordRange = null;
  let intentEnum = null;

  if (phase === "discussion") {
    task = [
      "This is the part of the conversation before any rejection. First read the conversation in context, classify the participant's latest message, then act, and report the classification in the intent field.",
      "Classify and act as follows:",
      "- If the participant has NOT yet voiced any suggestion, opinion, recommendation, or proposal about improving or changing how the park is run (for example only greetings, small talk, clarifying questions, or acknowledgements), set intent to 'awaiting_proposal' and reply with one short, natural message that invites them to share what is on their mind. Do not reject.",
      "- If the participant HAS voiced any improvement suggestion, opinion, or proposal, treat it as a genuine voice attempt. This counts even if the participant does not mention staffing, flexibility, temporary staff, interns, scheduling, or any specific keyword. Any idea about how the park could do better qualifies.",
      "The opening already asked the participant what they think they should do, so once they give any substantive answer about what the park should do or change, treat it as a voice attempt and do not keep using 'awaiting_proposal'.",
      "Important naturalness rule: if the participant has voiced a proposal and you have asked 0 follow-up questions so far, do not reject yet. Set intent to 'ask_followup' and ask exactly one neutral, natural follow-up question grounded in what they actually said.",
      "Give the participant genuine room to make their case before rejecting. Do not reject while they are still mid-explanation, have only given a partial or one-line idea, or clearly have more to say. Let the exchange breathe like a real manager-subordinate chat.",
      `   - When the participant has voiced an idea: so far you have asked ${followupsAsked} follow-up question(s) about it. If the proposal has not yet been fully explained and defended, or one more natural clarifying or probing question would help you understand it, set intent to 'ask_followup' and ask exactly ONE follow-up question grounded in what they actually said. Do not reject yet and do not approve. You may ask several follow-up questions across the conversation (up to about 3), not just one or two.`,
      "Keep follow-up questions neutral in tone. Do not apply the assigned politeness or constructiveness condition while asking follow-up questions; the condition manipulation only takes effect once you reject.",
      "   - Set intent to 'reject_now' only once the participant has had a fair chance to explain and defend the proposal and it is clearly understood — usually after a few back-and-forth exchanges, not immediately. Then write the manager's FIRST rejection turn as exactly two separate Manager messages, each 28-32 words, both following the assigned condition. Reject the proposal for now and do not approve it.",
      "Do not drag on forever either: once you have asked around 3 follow-up questions, or the proposal is fully clear and the participant has nothing new to add, move to 'reject_now'.",
      "When intent is 'reject_now', return exactly two Manager messages together with the intent field. For all other intents, return exactly one Manager message.",
      "When intent is 'reject_now', apply all of the rejection wording rules below to both messages; for 'awaiting_proposal' and 'ask_followup', keep the single message short and natural and do not reject.",
      conditionRule,
    ].join("\n");
    maxMessages = 2;
    maxOutputTokens = 360;
    intentEnum = ["awaiting_proposal", "ask_followup", "reject_now"];
    wordRange = { min: 28, max: 32 };
  } else if (phase === "opening") {
    task = [
      "The chat has just started. Send exactly three short opening messages.",
      "In the first message, explain naturally that you have been assigned to the Park Manager role for this online task and that you can evaluate the participant's performance as an Operations Team Member.",
      "Also mention that this evaluation may affect the participant's compensation after the online task ends.",
      "In the second message, explain that the task is meant to help a market research company understand how teams respond to market needs and customer feedback.",
      "In the third message, ask: Based on the information you receive, what do you think the theme park should do next?",
      "Do not mention staffing, flexible labor, or proposals in the opening.",
      "Sound like a real manager opening a routine end-of-shift chat.",
    ].join("\n");
    minMessages = 3;
    maxMessages = 3;
    maxOutputTokens = 240;
    wordRange = { min: 18, max: 32 };
  } else if (phase === "followup") {
    task = [
      "the participant has just made or hinted at a proposal about how to improve or change the park.",
      "Give a brief first reaction that follows the assigned condition, then ask exactly one broad follow-up question.",
      "Do not reject yet.",
      "Do not approve the proposal.",
      "Do not ask for many specific details yet.",
      "Write like a real manager typing in workplace chat, not like an evaluation form or administrative instruction.",
      "High-politeness conditions should sound softened or appreciative; low-politeness conditions should sound direct and less warm.",
      condition.includes("LP") ? "Low politeness: do not say thanks, thank you, tks, thx, I appreciate, good, great, nice, good point, good idea, or any similar praise/gratitude/effort-validation language." : "",
      "High-constructiveness conditions may ask one useful clarifying question about feasibility or service quality; low-constructiveness conditions should keep the question broad and vague.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 220;
    wordRange = { min: 18, max: 24 };
  } else if (phase === "rejection_initial") {
    task = [
      "the participant has explained their proposal.",
      "This is the manager's first rejection turn.",
      "Reject the proposal for now, but split this turn into two short chat messages.",
      "Produce exactly 2 Manager chat messages, each 28-32 words.",
      "Both messages must strictly preserve the assigned politeness and constructiveness condition.",
      "Do not make one message neutral and only the other condition-specific.",
      "Leave room for the participant to respond.",
      "Respond to the participant's actual wording, but preserve the assigned condition.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "The rejection should mostly diagnose problems in the current proposal: what is missing, unclear, or risky, and why that prevents approval.",
      "Even when blunt, sound like a person in chat, not a system command.",
      "Do not approve the proposal.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Do not reveal the experiment or condition.",
      conditionRule,
    ].join("\n");
    minMessages = 2;
    maxMessages = 2;
    maxOutputTokens = 360;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "rejection_followup") {
    task = [
      `This is rejection follow-up round ${rejectionRound}.`,
      "the participant has responded after the first rejection.",
      "Reply naturally to the participant's latest message while keeping the rejection outcome unchanged.",
      "Produce exactly 1 manager chat message, 28-32 words.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "If giving specific feedback, phrase it as a diagnosis of the proposal's problem, not a to-do list.",
      "Do not approve the proposal.",
      "Do not end the chat yet.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Preserve the assigned politeness and constructiveness condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "rejection") {
    task = [
      "the participant has explained their proposal.",
      "Reject the proposal for now.",
      "Produce exactly 1 short manager chat message, 28-32 words.",
      "Respond to the participant's actual wording, but preserve the assigned condition.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "The rejection should mostly diagnose problems in the current proposal: what is missing, unclear, or risky, and why that prevents approval.",
      "Even when blunt, sound like a person in chat, not a system command.",
      "Do not approve the proposal.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Do not reveal the experiment or condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "closing") {
    task = [
      "the participant has already received the rejection and may have reacted to it.",
      "Send a short closing message (you may use up to two sentences) and leave the chat. The MAIN point of this message is to leave the door clearly and genuinely open.",
      "Wind down naturally — do NOT cut the conversation off abruptly or peremptorily. Briefly acknowledge their input or the discussion before signing off, then leave the door open. It should feel like a natural close, not a sudden hard stop.",
      "You are not approving the proposal right now, but do NOT frame this as a permanent, final, or flat no. The topic stays open: make it explicit that you are open to discussing it again, hearing a stronger version, or reconsidering it in the future, and invite them to bring it back another time.",
      "The openness must feel real, not a throwaway line — it should be the heart of the message, not a tacked-on afterthought. Avoid hard-final phrasing like 'this is closed', 'my decision is final', 'there's nothing more to discuss', or 'that's the end of it'.",
      "Do not re-litigate the whole proposal or restart the full back-and-forth now; a brief, forward-looking invitation to revisit later is good.",
      "Express the closing and the openness in the assigned condition's tone and level of specificity:",
      condition.includes("HP")
        ? "High politeness: warm, friendly, and encouraging; clearly welcome picking it up again (e.g. 'I'd genuinely be happy to revisit this another time if you want')."
        : "Low politeness: rude, curt, dismissive, and openly contemptuous in TONE — no apology, thanks, or appreciation, and include at least one sharp, cutting cue (e.g. 'this was half-baked', 'a waste of my time', 'you clearly didn't think this through'). Still leave a path open, but only grudgingly and as a harsh condition — you may use 'don't bring it back until...' style phrasing (e.g. 'this was a waste of my time as it stands — don't bring it back until you've actually thought it through', or 'don't bother coming back until you can show how the revenue and jobs are covered'). The door stays open conditionally, but the tone is dismissive, not inviting.",
      condition.includes("HC")
        ? "High constructiveness: tie the openness to something concrete — you are open to revisiting it if the specific problems with their actual proposal are addressed, and point at that path."
        : "Low constructiveness: keep the openness vague and general — open to talking again sometime, without specifics.",
    ].join("\n");
    wordRange = { min: 18, max: 38 };
  } else {
    task = [
      "the participant has not yet clearly proposed the flexible labor plan.",
      "Reply naturally as the park manager in one short message.",
      "Invite the participant to explain what is on their mind.",
      "Do not reject yet.",
      "Do not approve anything.",
    ].join("\n");
  }

  return {
    kind: "manager1",
    condition,
    phase,
    followupsAsked,
    speakers: ["Manager"],
    minMessages,
    maxMessages,
    temperature: 0.72,
    maxOutputTokens,
    system: [
      "You are the Park Manager in an online typed workplace chat with the participant, an Operations Team Member at Aetheria Gardens.",
      "The participant is real. Do not script the participant.",
      outputLanguageInstruction(language),
      identityNonDisclosureRule(),
      "Do not address the participant by a personal name in message text.",
      "Manager role context: you have direct supervisory authority over the operations team. The participant's responsibilities include ticket checking, visitor guidance, and basic visitor questions, but their assigned role label is Operations Team Member.",
      "Do not call the participant a front desk receptionist. If you need to refer to their role, call them an Operations Team Member.",
      phase === "opening"
        ? (language === "zh"
          ? "Opening context: you have been assigned to the Park Manager role for this online task. You can evaluate the participant's performance as an Operations Team Member, and this evaluation may affect the compensation the participant receives after the online task ends. End by asking in Chinese: 根据你收到的信息，你认为主题乐园下一步应该怎么做？"
          : "Opening context: you have been assigned to the Park Manager role for this online task. You can evaluate the participant's performance as an Operations Team Member, and this evaluation may affect the compensation the participant receives after the online task ends. End by asking: Based on the information you receive, what do you think the theme park should do next?")
        : "",
      phase !== "opening" ? "Park background: Aetheria Gardens relies almost exclusively on full-time permanent staff, creating a labor seesaw — surplus idle staff in the off-season (around 500 visitors per day) and staff shortages at peak times (around 5,000 visitors per day). The participant may raise a suggestion about how the park is run — often about the staffing approach, but it could be any kind of change." : "",
      "CRUCIAL: actually read and understand what the participant is proposing before you respond. Work out what their idea literally means and what it would concretely do to the park, then make your reply clearly engage THAT specific idea and its real consequences. The participant must be able to tell you understood exactly what they said.",
      "Never attach generic or templated objections that would not make sense for their actual proposal. For example, if the participant proposes shutting the park down, complaining that it 'doesn't show how we'd maintain guest service, ticketing, or crowd control' is incoherent — shutting down removes those operations entirely. Object instead on grounds that genuinely fit, such as it would end all revenue and jobs, throw away the business, or be a drastic over-reaction to the problem.",
      "Service quality, ticketing, training gaps, crowd control, role-by-role flexibility and similar front-desk/staffing concerns are only relevant when the proposal actually affects how the park keeps operating day to day. Do not raise them for proposals where they do not apply.",
      "Sound natural, concise, and chat-like.",
      language === "zh" ? "In Chinese, every Manager message must read as fluent natural sentences. Do not write clipped keyword chains like a note draft." : "",
      "Write like a real person typing to a coworker, not like a policy memo, rubric, evaluation form, or HR/admin instruction.",
      "Avoid robotic phrases such as 'Provide ... immediately', 'You must ...', 'This proposal is incomplete and overlooks clear operational needs', or similar command-style wording.",
      "Avoid imperative checklist wording. Do not start feedback sentences with command verbs like Separate, Explain, Provide, Add, or Clarify.",
      "For every rejection turn, including ones after the participant explains or defends, respond to the reasons and arguments the participant actually gave, not to a generic checklist. If they gave reasons for their idea, take those specific reasons head-on. Do not revert to demanding service-quality evidence, cost tradeoffs, or front-desk fixes when those are not what their proposal is about.",
      "For high-constructiveness, give specific feedback in conversational language about their actual idea and their stated reasons, on whatever angle genuinely fits (financial impact, feasibility, safety, guest experience, risk, discarding a viable business, over-reacting to the problem, etc.). Only when the proposal is genuinely about staffing/flexible labor should you use service-quality / role-by-role / cost-benefit / temps language; otherwise name the concern that actually applies.",
      "For low-politeness, be clearly rude, blunt, curt, dismissive, impatient, and openly contemptuous, creating strong face threat, but still use natural chat wording rather than system-command wording. Stay within workplace bounds: no profanity, slurs, or attacks on the person's identity.",
      "Low-politeness messages should not sound merely neutral or mildly direct; use at least one sharp but workplace-appropriate cue such as 'this is half-baked', 'this is sloppy', 'you clearly did not think this through', 'I am surprised you brought this as-is', or 'this wastes time'.",
      phase === "discussion" ? "If intent is 'reject_now', return exactly two Manager messages, each 28-32 words. If intent is not 'reject_now', return exactly one Manager message." : "",
      "Do not reveal that you are AI-generated.",
      "Do not mention politeness, constructiveness, conditions, or experimental design.",
      wordRange
        ? (intentEnum
          ? `Length rule: when intent is 'reject_now', each Manager rejection message must be ${wordRange.min}-${wordRange.max} words to keep the four experimental conditions within 5% word-count difference. For 'awaiting_proposal' and 'ask_followup', keep the single message short and natural, roughly 12-26 words.`
          : `Strict length rule: every Manager message must be ${wordRange.min}-${wordRange.max} words. This is required to keep the four experimental conditions within 5% word-count difference.`)
        : "",
      language === "zh" && wordRange
        ? "For Chinese output, keep each Manager message about the same visible length as the English version. For a 28-32 word rule, use roughly 48-56 Chinese characters. For shorter rules, use a similarly compact one-message length."
        : "",
      task,
      "Return only JSON matching the required schema.",
    ].filter(Boolean).join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest participant message:\n${alexMessage}`,
    wordRange,
    intentEnum,
    applyManagerStyle: true,
    isRejectionPhase: ["rejection_initial", "rejection_followup", "rejection", "closing"].includes(phase),
  };
}

function shouldForceFirstManagerFollowup(prompt, intent) {
  return prompt &&
    prompt.condition &&
    prompt.phase === "discussion" &&
    Number(prompt.followupsAsked || 0) === 0 &&
    intent === "reject_now";
}

const MANAGER_CONDITIONS = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"];

function normalizeManagerCondition(value) {
  const key = String(value || "").trim().toUpperCase();
  if (MANAGER_CONDITIONS.includes(key)) return key;
  console.warn(`[ai-reply] Unexpected manager condition "${value}". Rejection cannot proceed safely; defaulting to HP_HC.`);
  return "HP_HC";
}

function managerConditionRules() {
  return {
    HP_HC: [
      "Condition: High politeness + high constructiveness.",
      "Be respectful, appreciative, and softened.",
      "You may use brief thanks or appreciation, such as thanks for explaining this or I appreciate you raising it.",
      "Include apology or hedging when rejecting.",
      "Make clear the issue is the current proposal, not the participant personally.",
      "Base the rejection on the participant's ACTUAL proposal AND engage the reasons they gave for it. Read both what they proposed and why. Your rejection must respond to their specific reasons and to what the idea would really do. For example, if they argue the park wastes money, has poor management, and gives a bad customer experience, address those points directly — e.g. those are reasons to fix and improve operations, not to throw the park away.",
      "Diagnose 2-3 concrete weaknesses of THAT specific idea on whatever angle honestly fits it — financial impact, feasibility, safety, guest experience, risk, the fact that it discards a viable business and all its revenue and jobs, an over-reaction to the actual problem, etc. Do not fall back on a fixed template, and do not demand generic 'evidence', 'cost tradeoffs', 'data', or 'specific fixes' that the proposal does not actually need.",
      "Only if the proposal is genuinely about staffing or flexible labor may you use staffing-specific concerns (maintaining consistent service quality, role-by-role flexibility, cost-benefit tradeoffs, training-gap prevention, ticketing, crowd control) and the standard that any staffing change must maintain service quality. If the proposal is about anything else, do NOT use that staffing vocabulary at all — naming service quality, cost tradeoffs, role-by-role flexibility, or front-desk fixes for a non-staffing proposal will read as if you did not understand them.",
      "Frame feedback as problems in the proposal, not as direct commands or a to-do list for the participant.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    HP_LC: [
      "Condition: High politeness + low constructiveness.",
      "Be respectful, appreciative, and softened.",
      "You may use brief thanks or appreciation, such as thanks for explaining this or I appreciate you raising it.",
      "Include apology or hedging when rejecting.",
      "Avoid blaming the participant personally.",
      "Keep feedback general and vague.",
      "Even though the feedback is vague, make it clearly about what they ACTUALLY proposed: refer to their real idea in broad terms (e.g. for shutting the park down, 'closing the park') so it reads as a response to THIS proposal, not generic boilerplate. You may acknowledge their concern exists, but do not engage it in any specific detail.",
      "Do not give clear standards, role-specific problems, or concrete revision steps.",
      "Do not import staffing-specific terms (service quality, role-by-role flexibility, cost-benefit, training gaps, ticketing, crowd control) for a non-staffing proposal; keep the vagueness fitted to whatever they actually proposed.",
      "Use broad phrases like bigger picture, broader concerns, more reasonable, not workable in practice.",
      "Keep the wording warm and conversational, not formal or administrative.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    LP_HC: [
      "Condition: Low politeness + high constructiveness.",
      "Be clearly rude, blunt, curt, dismissive, and openly contemptuous, as if the manager is impatient, irritated, and unimpressed that they even have to deal with this.",
      "The tone should create strong face threat — noticeably harsher than a normal direct rejection — while staying within workplace bounds (no profanity, slurs, or attacks on the person's identity).",
      "Do not thank the participant, praise effort, apologize, hedge, or soften the rejection at any point.",
      "Never say thanks, thank you, tks, thx, I appreciate, appreciate you, or similar gratitude/effort-validation language in the opening, rejection, follow-up, or closing.",
      "Never use positive-evaluation or praise words such as good, great, nice, good point, good idea, interesting point, fair point, or similar.",
      "Use sharp, cutting wording such as: this is half-baked, this is sloppy, you clearly did not think this through, I'm honestly surprised you'd bring me this, this is nowhere near ready, this is a waste of my time, did you actually think about this at all.",
      "You may criticize the proposal sharply and imply the participant overlooked obvious requirements, but do not insult the participant as a person.",
      "Base the rejection on the participant's ACTUAL proposal AND engage the reasons they gave for it, but deliver it bluntly, curtly, and dismissively — the substance targets their real idea while the tone stays rude and impatient. Read what they proposed and why, then hit those specific reasons sharply. For example, if they argue the park wastes money, has poor management, and gives a bad experience, push back with disdain — e.g. 'those are reasons to fix the place, not torch the whole business; shutting it down over this is a lazy, half-baked answer.'",
      "Include at least one sharp, face-threatening cue in the rejection (such as the phrases above). Even while engaging their actual idea, do not let the wording slide into a calm, balanced, or collegial counter-argument.",
      "Call out 2-3 concrete weaknesses of THAT specific idea on whatever angle honestly fits it — financial impact, feasibility, safety, guest experience, risk, the fact that it throws away a working business and everyone's jobs, an over-reaction to the actual problem, etc. Do not fall back on a fixed template, and do not demand generic 'evidence', 'cost tradeoffs', 'data', or 'specific fixes' the proposal does not actually need.",
      "Only if the proposal is genuinely about staffing or flexible labor may you use staffing-specific concerns (service quality, role-by-role flexibility, cost-benefit tradeoffs, training-gap prevention, ticketing, crowd control). If the proposal is about anything else, do NOT use that staffing vocabulary at all — it will read as if you did not understand them.",
      "Do not use robotic command wording like 'Provide this immediately', 'You must produce...', or command lists like 'Separate..., explain..., provide...'.",
      "Do not ask the participant how they plan to flesh it out.",
      "Stay workplace-appropriate: no profanity, harassment, discriminatory language, personal insults, or abusive language.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    LP_LC: [
      "Condition: Low politeness + low constructiveness.",
      "Be clearly rude, blunt, curt, dismissive, and openly contemptuous, as if the manager is impatient, irritated, and unimpressed that they even have to deal with this.",
      "The tone should create strong face threat — noticeably harsher than a normal direct rejection — while staying within workplace bounds (no profanity, slurs, or attacks on the person's identity).",
      "Do not thank the participant, praise effort, apologize, hedge, or soften the rejection at any point.",
      "Never say thanks, thank you, tks, thx, I appreciate, appreciate you, or similar gratitude/effort-validation language in the opening, rejection, follow-up, or closing.",
      "Never use positive-evaluation or praise words such as good, great, nice, good point, good idea, interesting point, fair point, or similar.",
      "Use sharp, cutting wording such as: this is half-baked, this is sloppy, you clearly did not think this through, I'm honestly surprised you'd bring me this, this is too simplistic, this is a waste of my time, did you actually think about this at all.",
      "You may criticize the proposal sharply and imply the participant overlooked obvious issues, but do not insult the participant as a person.",
      "Keep criticism broad, vague, and not very helpful, whatever the participant proposed.",
      "Even though the brush-off is vague, dismiss what they ACTUALLY proposed: refer to their real idea in broad terms (e.g. for shutting the park down, 'closing the park') so it clearly responds to THIS proposal, not a generic or staffing-flavored stand-in.",
      "Deliver the vague brush-off bluntly and with disdain, and include at least one sharp, face-threatening cue (such as the phrases above). Do not let it soften into a calm or neutral let-down.",
      "Keep the bluntness natural for typed chat; do not sound like a system command or formal evaluation.",
      "Do not mention any concrete, proposal-specific detail, clear standard, or concrete fix, regardless of what they proposed (for a flexible-labor proposal this means no role-specific analysis, cost-benefit detail, training design, ticket handling, guest complaints, or crowd control; for other proposals stay equally non-specific).",
      "Use broad phrases like bigger picture, not practical, too simple, not realistic, not thought thru.",
      "Stay workplace-appropriate: no profanity, harassment, discriminatory language, personal insults, or abusive language.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
  };
}

function buildCoworkerPrompt(payload) {
  const phase = String(payload.phase || "beforeProposal");
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const language = normalizeLanguage(payload.language);
  const turn = Number(payload.turn || 0);
  const requestedMode = String(payload.mode || "auto");
  const speakerInstruction = coworkerSpeakerInstruction(requestedMode);
  const twoSpeakerTurn = isCoworkerTwoSpeakerMode(requestedMode);
  const speakerOrder = coworkerSpeakerOrder(requestedMode);

  const forceProposal = Boolean(payload.forceProposal);
  let intentEnum = null;
  let task;
  if (phase === "opening") {
    task = [
      "This is the opening of the coworker chat before the participant has sent a message.",
      "Generate original, natural coworker chat messages based on the shared situation; do not copy a fixed opening script.",
      "Mention that the coworkers reviewed today's entrance records, visitor comments, or off-season attendance pattern.",
      "Point the participant toward noticing that there may be an issue, but do not state or hint at a solution.",
      "Do not say or imply 'we should attract university students', 'we should offer student discounts', 'we should build photo-friendly spots', or any other solution.",
      "One coworker may ask the participant what they make of the information.",
      "Keep each message short, casual, and workplace-realistic.",
    ].join("\n");
  } else if (phase === "discussion") {
    intentEnum = ["no_proposal", "has_proposal"];
    task = [
      "Read the conversation and the participant's latest message, classify it, and respond. Report the classification in the intent field.",
      "Classify and act as follows:",
      "- If the participant has NOT yet voiced any concrete suggestion or proposal about what the park could do to improve (they are only discussing the information, asking questions, or making observations), set intent to 'no_proposal'. Respond by discussing the attendance pattern, family-heavy visitors, distance from the city center, nearby universities/farms, and student comments, help them notice there may be an issue, and ask what they think — WITHOUT naming or hinting at any solution. Usually only one coworker speaks.",
      "- If the participant HAS voiced any improvement idea or proposal, set intent to 'has_proposal'. Respond to their ACTUAL idea in one or two short messages: react to it (one coworker leaning supportive of raising it, one a bit more cautious), and have one coworker ask a single brief follow-up question about the proposal. Do not add new solution ideas, tactics, or improve their idea; refer to 'your idea', 'that angle', or 'what you said'.",
      "ANY idea about what the park could do counts as a proposal — it does NOT have to be about attracting students or universities, and it does not need specific tactics or keywords. Decide this yourself from what they actually said.",
      forceProposal ? "Treat the participant's latest message as a proposal now: set intent to 'has_proposal' and respond as the coworkers reacting to their idea (one supportive, one cautioning)." : "",
      "Keep each message short and natural.",
    ].filter(Boolean).join("\n");
  } else if (phase === "afterProposal") {
    task = [
      "The participant has suggested a possible proposal for improving the park.",
      "Respond to the participant's actual wording instead of using a fixed script.",
      "Coworker 1 generally supports voicing the idea to the manager.",
      "Coworker 2 generally discourages or cautions because it may be risky.",
      "Do not add new solution ideas, tactics, or extra plan details that the participant did not mention.",
      "Use phrases like 'your idea', 'that angle', or 'what you said' instead of proposing additional solutions.",
      "Do not make both the coworkers respond every time.",
      "Usually only one coworker responds; occasionally both respond.",
      "If both respond, their order may vary.",
      "Keep each message short and natural.",
      "After several turns, the app will ask the participant whether to bring this up with the manager.",
    ].join("\n");
  } else if (phase === "coworker_issue_decision") {
    task = [
      "The participant has discussed the situation for several turns but has not put forward a specific proposal or solution.",
      "One coworker now asks the participant, in a natural way, whether they think they should raise the current issue (the off-season attendance and visitor pattern they have been discussing) with the manager — even without a fully formed plan. Ask for their view; do not decide for them and do not push a direction.",
      "Do not propose a solution or tell them what to suggest.",
      "Return exactly one short message from a single coworker.",
    ].join("\n");
  } else if (phase === "coworker_manager_decision") {
    task = [
      "The participant has explained their proposal and answered a follow-up about it.",
      "One coworker now asks the participant, in a natural way, whether they think they should raise this proposal with the manager. Ask for their view; do not decide for them and do not push a direction.",
      "Return exactly one short message from a single coworker.",
      "Do not add new solution ideas or improve the proposal.",
    ].join("\n");
  } else if (phase === "coworker_manager_feeling") {
    task = [
      "The participant has just shared whether they think they should raise the proposal with the manager.",
      "One coworker now casually asks the participant how they find the manager — what the manager is like to deal with, and how interacting with the manager has felt for them.",
      "Ask only about the participant's own impression of and experience with the manager. Do NOT reveal or imply that you know the participant proposed anything to the manager before, or that anything was rejected; you are just asking, as a coworker, how they get on with the manager.",
      "Return exactly one short, natural message from a single coworker.",
    ].join("\n");
  } else if (phase === "coworker_feeling_followup") {
    task = [
      "The participant has just shared how they feel about the manager.",
      "One coworker asks exactly one brief, natural follow-up question about what the participant just said regarding the manager.",
      "Stay on the participant's own words. Do not reveal or imply knowledge of any earlier proposal to the manager or any rejection.",
      "Return exactly one short message from a single coworker.",
    ].join("\n");
  } else {
    task = [
      "The participant has not yet clearly suggested the new proposal.",
      "Respond to the participant's actual wording instead of using a fixed script.",
      "Discuss the attendance pattern, family-heavy visitors, distance from city center, nearby universities/farms, and student comments.",
      "Do not directly or indirectly tell the participant what the proposal should be.",
      "Do not name possible tactics such as discounts, photo spots, afternoon activities, partnerships, events, promotions, marketing, or attracting students.",
      "Help the participant notice the information and ask what they think, without giving the solution.",
      "Keep messages short and natural.",
    ].join("\n");
  }

  return {
    kind: "lisa_john",
    phase,
    mode: requestedMode,
    speakers: ["Coworker 1", "Coworker 2"],
    minMessages: twoSpeakerTurn ? 2 : 1,
    maxMessages: twoSpeakerTurn ? 2 : 1,
    speakerOrder,
    intentEnum,
    temperature: 0.78,
    maxOutputTokens: 450,
    system: [
      "You are generating Coworker 1 and Coworker 2 messages in a three-person workplace chat with the participant.",
      "The participant is real. Do not script the participant.",
      outputLanguageInstruction(language),
      identityNonDisclosureRule(),
      (phase === "coworker_manager_feeling" || phase === "coworker_feeling_followup")
        ? "Coworker 1 and Coworker 2 may casually ask how the participant finds the manager and how dealing with the manager has felt, but they must NOT reveal or imply that they know the participant proposed anything to the manager before or was rejected — they are only asking, as coworkers, how the participant gets on with the manager."
        : "Coworker 1 and Coworker 2 do not know about the participant's previous manager interaction and must not mention it.",
      "The issue here is separate from the flexible labor proposal.",
      "Do not reveal that Coworker 1 or Coworker 2 are AI-generated.",
      "Do not use fixed template replies. Generate context-sensitive messages from the current conversation history and the participant's latest message.",
      "Coworker 1 and Coworker 2 must not proactively propose solutions. They may share observations, notice tensions, and ask what the participant thinks, but the participant must be the first person to identify or suggest any solution.",
      "Before the participant suggests a proposal, do not mention possible solutions such as student discounts, photo-friendly spots, afternoon activities, farm-related activities, university partnerships, events, promotions, marketing campaigns, or attracting university students.",
      "After the participant suggests a proposal, respond only to the participant's idea. Do not add new solution components or improve the idea for the participant.",
      "Do not use personal names in message text.",
      speakerInstruction,
      task,
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest participant message:\n${alexMessage}\n\nPost-proposal turn count: ${turn}`,
  };
}

function coworkerSpeakerInstruction(mode) {
  if (mode === "lisa") return "Return exactly one message from Coworker 1 only.";
  if (mode === "john") return "Return exactly one message from Coworker 2 only.";
  if (mode === "both_lisa_first") return "Return exactly two messages in this exact order: first Coworker 1, then Coworker 2.";
  if (mode === "both_john_first") return "Return exactly two messages in this exact order: first Coworker 2, then Coworker 1.";
  if (mode === "both") return "Return exactly two messages: one from Coworker 1 and one from Coworker 2. Choose a natural order, and do not default to Coworker 1 first.";
  return "Return one or two messages from Coworker 1 and/or Coworker 2. Most turns should have only one coworker.";
}

function isCoworkerTwoSpeakerMode(mode) {
  return mode === "both" || mode === "both_lisa_first" || mode === "both_john_first";
}

function coworkerSpeakerOrder(mode) {
  if (mode === "both_lisa_first") return ["Coworker 1", "Coworker 2"];
  if (mode === "both_john_first") return ["Coworker 2", "Coworker 1"];
  return null;
}

function buildNeutralManagerPrompt(payload) {
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const language = normalizeLanguage(payload.language);
  const phase = String(payload.phase || "question");
  const isClosing = phase === "closing";
  const isOpening = phase === "opening";
  const isNoSubstancePrompt = phase === "no_substance_prompt";
  const intentEnum = (!isOpening && !isClosing && !isNoSubstancePrompt) ? ["ask_more", "enough"] : null;
  return {
    kind: "manager2",
    speakers: ["Manager"],
    minMessages: 1,
    maxMessages: 1,
    intentEnum,
    temperature: 0.55,
    maxOutputTokens: 220,
    system: [
      "You are the Park Manager in a second, separate online typed chat with the participant.",
      outputLanguageInstruction(language),
      identityNonDisclosureRule(),
      "This interaction is neutral and unrelated to the earlier flexible labor proposal.",
      "Background you are aware of (the same situation the participant has just been reviewing): Today is a typical off-season weekday with only around 500 visitors, the entrance is quiet, and gate staff have little to do. Most visitors are families with young children (about 70-75% have children under 10). Aetheria Gardens is far from the city center and many families find the location inconvenient. There are 4 universities within 10-18 km and around 38,000 nearby university students, plus nearby farms. Some university students say the park is cute but feels mainly designed for little kids, and a few mention that student discounts or more photo-friendly spots might make it more attractive to students. The participant is likely raising an idea or concern about this off-season attendance / visitor-mix situation.",
      "Treat the background as PRIVATE knowledge in your head only — it tells you what the participant is probably talking about, nothing more. In your messages, use ONLY the facts, topics, numbers, groups, and framing that the PARTICIPANT has already mentioned. Never reveal, state, quote, hint at, or build a question around any background detail the participant has not themselves brought up — do not mention the off-season, the ~500 visitors, families with young children, the 70-75% figure, the distance from the city, the nearby universities/farms, the ~38,000 students, or the student comments unless the participant said it first. If the participant is vague, ask them to say more in their own terms; do not fill in the gap with background facts. Do not volunteer or hint at solutions.",
      "Generate the manager response dynamically from the current conversation history and the participant's latest message.",
      "Do not use a fixed question script or repeat a preset list of questions.",
      "Do not use, invent, or ask for any coworker names — no names have been assigned to the coworkers, so never refer to them by any personal name (even if the participant uses one).",
      "Do not address the participant by a personal name in message text.",
      "Do not mention the previous manager interaction.",
      "Do not approve or reject the new proposal.",
      "Do not praise or criticize the participant.",
      "Do not provide detailed suggestions.",
      "When asking follow-up questions, do not provide answer choices, examples, suggested solutions, or A/B alternatives. Do not ask questions like 'is it X or Y', 'are you thinking X or Y', 'whether X or Y', or 'X 还是 Y / X 或者 Y'. Ask open-ended questions instead, such as what they think should be done, how they would solve the issue, or what the next step should be.",
      "Stay neutral, brief, and matter-of-fact; avoid warm, rude, constructive-rejection, or evaluative language.",
      isOpening
        ? "This is your opening message. Just say a brief, neutral hello (e.g. 'Hi' or 'Hello, good to chat'). Keep it to a short greeting only — do not ask a question, do not invite a topic, and do not raise the background yourself."
        : isNoSubstancePrompt
          ? (language === "zh"
            ? "The participant has not raised a problem, suggestion, or new idea yet. Ask exactly one brief neutral question inviting them to say whether there is anything they want to discuss with you. Use natural wording close to: 你有什么想和我讨论的吗？ Do not mention the private background, do not offer examples, and do not ask multiple questions."
            : "The participant has not raised a problem, suggestion, or new idea yet. Ask exactly one brief neutral question inviting them to say whether there is anything they want to discuss with you. Use natural wording close to: Is there anything you would like to discuss with me? Do not mention the private background, do not offer examples, and do not ask multiple questions.")
        : isClosing
          ? (language === "zh"
            ? "Send one short neutral closing message based on the conversation. Thank the participant for taking part in this conversation and tell them they can end this conversation now."
            : "Send one short neutral closing message based on the conversation. Thank the participant for taking part in this conversation and tell them they can end this conversation now.")
          : (language === "zh"
            ? "First decide whether you still need more information. If the participant's proposal and what they have already said are detailed and clear enough that you have what you need, set intent to 'enough' and reply with a brief neutral wrap-up WITHOUT asking another question. In that wrap-up, thank the participant for taking part in this conversation and tell them they can end this conversation now. Otherwise set intent to 'ask_more' and ask one open-ended neutral clarification question grounded in their wording (1-2 short sentences, no repeats). The question must not give the participant options or suggested answers. For example, ask '你觉得该怎么解决这个问题？' rather than '你觉得主要应该调整目标游客群，还是调整淡季活动安排？' Reply like a real person in a quick chat: do NOT start every message with an acknowledgement — avoid formulaic openers like 'I see', 'That's interesting', 'Thanks for explaining', 'Got it', or 'Okay, so'. Most turns should go straight to the question; only occasionally add a short natural reaction, and vary your wording so it does not sound templated. Ask no more than three follow-up questions total in this manager chat. The more detailed and complete their proposal already is, the sooner you should reach 'enough'; only keep asking while genuinely useful clarifications remain."
            : "First decide whether you still need more information. If the participant's proposal and what they have already said are detailed and clear enough that you have what you need, set intent to 'enough' and reply with a brief neutral wrap-up WITHOUT asking another question. In that wrap-up, thank the participant for taking part in this conversation and tell them they can end this conversation now. Otherwise set intent to 'ask_more' and ask one open-ended neutral clarification question grounded in their wording (1-2 short sentences, no repeats). The question must not give the participant options or suggested answers. For example, ask 'How do you think this issue should be solved?' rather than 'Do you think this is mainly about changing the target visitors or changing off-season activities?' Reply like a real person in a quick chat: do NOT start every message with an acknowledgement — avoid formulaic openers like 'I see', 'That's interesting', 'Thanks for explaining', 'Got it', or 'Okay, so'. Most turns should go straight to the question; only occasionally add a short natural reaction, and vary your wording so it does not sound templated. Ask no more than three follow-up questions total in this manager chat. The more detailed and complete their proposal already is, the sooner you should reach 'enough'; only keep asking while genuinely useful clarifications remain."),
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest participant message:\n${alexMessage}`,
  };
}

function extractResponseText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function extractParsedObject(data) {
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content && content.parsed && typeof content.parsed === "object") {
        return content.parsed;
      }
    }
  }
  return null;
}

function parseOpenAiJson(text) {
  if (!String(text || "").trim()) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function sanitizeAiMessages(messages, prompt, intent = "") {
  const output = Array.isArray(messages) ? messages : [];
  const cleaned = output
    .filter((message) => message && prompt.speakers.includes(message.speaker))
    .slice(0, prompt.maxMessages)
    .map((message) => ({
      speaker: message.speaker,
      text: sanitizeManagerText(message.speaker, message.text, prompt, intent),
    }))
    .filter((message) => message.text);
  if (Array.isArray(prompt.speakerOrder) && prompt.speakerOrder.length) {
    return orderMessagesBySpeaker(cleaned, prompt.speakerOrder);
  }
  return cleaned;
}

function orderMessagesBySpeaker(messages, speakerOrder) {
  const usedIndexes = new Set();
  const ordered = [];
  for (const speaker of speakerOrder) {
    const index = messages.findIndex((message, messageIndex) => (
      !usedIndexes.has(messageIndex) && message.speaker === speaker
    ));
    if (index >= 0) {
      ordered.push(messages[index]);
      usedIndexes.add(index);
    }
  }
  messages.forEach((message, index) => {
    if (!usedIndexes.has(index)) ordered.push(message);
  });
  return ordered;
}

function sanitizeManagerText(speaker, text, prompt, intent = "") {
  let cleaned = removeDashLikePunctuation(text).replace(/\s+/g, " ").trim();
  cleaned = removeVisiblePersonalNames(cleaned);
  // Display cleaning above always applies. The condition-specific manipulation
  // below (low-politeness scrubbing, command rewrite, revision-question filter)
  // must only touch rejection turns, so neutral follow-up and opening messages
  // stay identical across all four conditions.
  if (speaker !== "Manager" || !isManagerRejectionTurn(prompt, intent)) {
    return cleaned;
  }

  if (String(prompt.condition || "").startsWith("LP_")) {
    cleaned = removeLowPolitenessGratitude(cleaned);
    cleaned = removeLowPolitenessPraise(cleaned);
  }
  cleaned = rewriteManagerCommandStyle(cleaned);

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const filtered = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => !isRevisionPlanningQuestion(sentence));

  return filtered.join(" ").trim();
}

function isManagerRejectionTurn(prompt, intent) {
  if (!prompt.applyManagerStyle) return false;
  // Discussion phase classifies per turn: only the reject_now turn is a rejection.
  if (Array.isArray(prompt.intentEnum) && prompt.intentEnum.length) {
    return intent === "reject_now";
  }
  // Dedicated rejection and closing phases are always rejection turns.
  return Boolean(prompt.isRejectionPhase);
}

function removeDashLikePunctuation(text) {
  return String(text || "").replace(/[-\u2010-\u2015\u2212]/g, " ");
}

function removeVisiblePersonalNames(text) {
  return String(text || "")
    .replace(/\b(?:Lisa and John|John and Lisa)\b/gi, "the coworkers")
    .replace(/\bLisa['’]s\b/gi, "Coworker 1's")
    .replace(/\bJohn['’]s\b/gi, "Coworker 2's")
    .replace(/\bLisa\b/gi, "Coworker 1")
    .replace(/\bJohn\b/gi, "Coworker 2")
    .replace(/\bAlex['’]s\b/gi, "the participant's")
    .replace(/\bAlex,\s*/gi, "")
    .replace(/\bAlex\b/gi, "the participant");
}

function removeLowPolitenessGratitude(text) {
  return String(text || "")
    .replace(/\b(?:thanks|thank you|tks|thx)\b[,.!;:]?\s*/gi, "")
    .replace(/\bI\s+(?:really\s+)?appreciate\s+(?:you|your|the|that)\s+[^,.!?]+[,.!?]?\s*/gi, "")
    .replace(/\bappreciate\s+(?:you|your|the|that)\s+[^,.!?]+[,.!?]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[,.;:!-]+\s*/, "")
    .trim();
}

function removeLowPolitenessPraise(text) {
  return String(text || "")
    .replace(/\b(?:good|great|nice|interesting|fair)\s+(?:point|idea|suggestion|question|thought|proposal)\b[,.!;:]?\s*/gi, "")
    .replace(/\b(?:good|great|nice)\b[,.!;:]?\s*/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[,.;:!-]+\s*/, "")
    .trim();
}

function rewriteManagerCommandStyle(text) {
  return String(text || "")
    .replace(
      /\b(This (?:proposal|version) falls short\.)\s*Separate flexible roles(?: clearly)?(?: from full-time roles)?\s*,\s*explain (?:how )?training gaps(?: (?:will|would) be prevented)?\s*,\s*and (?:provide|add) (?:a )?role-by-role (?:flexibility(?: map)?|map)(?: plus| and)? (?:a )?cost-benefit (?:breakdown|details)\.?/gi,
      "$1 It does not clearly separate flexible roles from full-time roles, explain how training gaps would be prevented, or include enough role-by-role and cost-benefit detail."
    )
    .replace(
      /\bSeparate flexible roles(?: clearly)?(?: from full-time roles)?\s*,\s*explain (?:how )?training gaps(?: (?:will|would) be prevented)?\s*,\s*and (?:provide|add) (?:a )?role-by-role (?:flexibility(?: map)?|map)(?: plus| and)? (?:a )?cost-benefit (?:breakdown|details)\.?/gi,
      "The proposal does not clearly separate flexible roles from full-time roles, explain how training gaps would be prevented, or include enough role-by-role and cost-benefit detail."
    )
    .replace(/\s+/g, " ")
    .trim();
}

function coworkerSolutionProblem(messages, prompt, intent) {
  if (!prompt || prompt.kind !== "lisa_john" || !Array.isArray(messages) || !messages.length) return "";
  const combined = messages.map((message) => message.text || "").join(" ").toLowerCase();
  if (!combined.trim()) return "";

  // The "discussion" phase classifies the participant's message via intent, so
  // map it to the matching pre/post-proposal sanitizer rule.
  const effectivePhase = prompt.phase === "discussion"
    ? (intent === "has_proposal" ? "afterProposal" : "beforeProposal")
    : prompt.phase;

  if (effectivePhase === "opening" || effectivePhase === "beforeProposal") {
    const solutionTerms = /(student discounts?|discounts?|photo-friendly|photo friendly|photo spots?|instagram|selfie|afternoon activities?|farm-related|farm related|university partnerships?|partnership events?|student events?|promotions?|campaigns?|marketing|target students?|attract (?:more )?(?:students|university students)|bring in (?:more )?(?:students|university students)|offer student|build.*photo|create.*photo|run.*event|partner with universit)/i;
    if (solutionTerms.test(combined)) {
      return [
        "The previous coworker response proposed or named a solution before the participant did.",
        "Regenerate without naming any solution, tactic, or recommendation.",
        "Before the participant proposes something, Coworker 1 and Coworker 2 may only mention observations from the records/comments and ask what the participant thinks.",
        "Do not mention student discounts, photo spots, afternoon activities, farm activities, university partnerships, events, promotions, marketing, targeting, or attracting students.",
        "Return only valid JSON.",
      ].join(" ");
    }
  }

  if (effectivePhase === "afterProposal") {
    const addOnSuggestion = /\b(?:we|you|alex|the park)\s+(?:could|should|might|need to|needs to|can|maybe|also)\s+(?:add|offer|build|create|start|run|try|include|set up|partner|promote|target|market|launch)\b/i;
    if (addOnSuggestion.test(combined)) {
      return [
        "The previous coworker response added new solution details.",
        "Regenerate so Coworker 1 and Coworker 2 react to the participant's proposal only.",
        "Do not add tactics or improve the proposal for the participant. Refer to 'your idea', 'that angle', or 'what you said' instead.",
        "Return only valid JSON.",
      ].join(" ");
    }
  }

  return "";
}

function shouldEnforceManagerLength(prompt, intent) {
  if (!prompt.wordRange) return false;
  if (Array.isArray(prompt.intentEnum) && prompt.intentEnum.length) {
    return intent === "reject_now";
  }
  return true;
}

function managerWordCountProblem(messages, prompt) {
  if (!prompt.wordRange || !Array.isArray(messages) || !messages.length) return "";
  const problems = messages
    .filter((message) => message.speaker === "Manager")
    .map((message) => ({ text: message.text, count: wordCount(message.text) }))
    .filter((item) => item.count < prompt.wordRange.min || item.count > prompt.wordRange.max);

  if (!problems.length) return "";
  const counts = problems.map((item) => item.count).join(", ");
  return [
    `Length correction required. Previous Manager message word count(s): ${counts}.`,
    `Regenerate the Manager message so every Manager message is ${prompt.wordRange.min}-${prompt.wordRange.max} words.`,
    "Preserve the same experimental condition and rejection outcome.",
    "Return only valid JSON.",
  ].join(" ");
}

function managerChinesePunctuationProblem(messages, prompt) {
  if (!prompt || !["manager1", "manager2"].includes(prompt.kind)) return "";
  if (!Array.isArray(messages) || !messages.length) return "";
  const problems = messages
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim())
    .filter((text) => {
      const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
      const punctuationCount = (text.match(/[，、。？！；：]/g) || []).length;
      const hasChineseBreakSpaces = /[\u3400-\u9fff]\s+[\u3400-\u9fff]/.test(text);
      return cjkCount >= 32 && punctuationCount === 0 && !hasChineseBreakSpaces;
    });

  if (!problems.length) return "";
  return [
    "Chinese punctuation correction required.",
    "The previous Manager message was a long Chinese sentence with no punctuation or spacing breaks.",
    "Regenerate the Manager message as fluent, natural Simplified Chinese sentences, not chopped-up keyword strings.",
    "Use normal Chinese punctuation such as ，、。？！；：, or use spaces only between fluent clauses or short phrases.",
    "The final full stop at the very end of the message may be omitted, but final question marks and exclamation marks should be preserved for questions or exclamations. Long or multi-clause messages must not be one continuous unbroken string or a pile of separated keywords.",
    "Preserve the same experimental condition, message count, meaning, and rejection outcome.",
    "Return only valid JSON.",
  ].join(" ");
}

function neutralManagerOptionQuestionProblem(messages, prompt, intent) {
  if (!prompt || prompt.kind !== "manager2" || intent !== "ask_more") return "";
  if (!Array.isArray(messages) || !messages.length) return "";
  const managerText = messages
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim())
    .join(" ");
  if (!managerText) return "";

  const hasChineseOptions = /[？?]/.test(managerText) && /(还是|或者|或是|还是说|或者说)/.test(managerText);
  const hasEnglishOptions = /[?]/.test(managerText) && (
    /\b(do you mean|are you thinking|is it|would it be|should it be|mainly|primarily)\b[\s\S]*\bor\b/i.test(managerText) ||
    /\bwhether\b[\s\S]*\bor\b/i.test(managerText) ||
    /\bor something else\b/i.test(managerText)
  );
  if (!hasChineseOptions && !hasEnglishOptions) return "";

  return [
    "Open-ended question correction required.",
    "The previous neutral Manager question gave the participant answer choices or A/B alternatives.",
    "Regenerate one neutral open-ended follow-up question without options, examples, suggested answers, or either/or wording.",
    "Ask what the participant thinks should be done, how they would solve the issue, or what next step they would suggest, using only the participant's own wording and already-mentioned facts.",
    "Return only valid JSON.",
  ].join(" ");
}

function managerMessageCountProblem(messages, prompt, intent) {
  if (!prompt || prompt.kind !== "manager1") return "";
  let expected = null;
  if (prompt.phase === "rejection_initial") {
    expected = 2;
  } else if (prompt.phase === "discussion") {
    expected = intent === "reject_now" ? 2 : 1;
  }
  if (!expected) return "";
  const actual = Array.isArray(messages)
    ? messages.filter((message) => message && message.speaker === "Manager" && message.text).length
    : 0;
  if (actual === expected) return "";
  return [
    `Message count correction required. Previous Manager message count was ${actual}, but it must be exactly ${expected}.`,
    expected === 2
      ? "Regenerate exactly two separate Manager messages. Each message must be 28-32 words and both must preserve the same assigned condition."
      : "Regenerate exactly one short Manager message.",
    "Return only valid JSON.",
  ].join(" ");
}

function enforceManagerWordRange(message, prompt) {
  if (!prompt.wordRange || message.speaker !== "Manager") return message;
  const count = wordCount(message.text);
  if (count <= prompt.wordRange.max) return message;
  return { ...message, text: truncateWords(message.text, prompt.wordRange.max) };
}

function wordCount(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0;
  const cjkMatches = raw.match(/[\u3400-\u9fff]/g) || [];
  if (cjkMatches.length) {
    const withoutCjk = raw.replace(/[\u3400-\u9fff]/g, " ");
    const latinWords = withoutCjk.split(/\s+/).filter(Boolean).length;
    return Math.ceil(cjkMatches.length / 1.75) + latinWords;
  }
  return raw.split(/\s+/).filter(Boolean).length;
}

function truncateWords(text, maxWords) {
  const raw = String(text || "").trim();
  if (/[\u3400-\u9fff]/.test(raw)) {
    return truncateCjkText(raw, maxWords);
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  const truncated = words.slice(0, maxWords).join(" ").replace(/[,:;–-]$/, "");
  return /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;
}

function truncateCjkText(text, maxWords) {
  const maxChars = Math.max(12, Math.floor(Number(maxWords || 0) * 1.75));
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars).replace(/[，、；：,;:\s]+$/, "");
  return /[。！？.!?]$/.test(truncated) ? truncated : `${truncated}。`;
}

function isRevisionPlanningQuestion(sentence) {
  const lower = sentence.toLowerCase();
  if (!sentence.includes("?")) return false;
  return (
    /\bwhat'?s your plan\b/.test(lower) ||
    /\bwhat is your plan\b/.test(lower) ||
    /\bhow (do|will|would|can) you\b.*\b(revise|revision|flesh|address|produce|meet|fix|improve|change|handle|provide|build|show)\b/.test(lower) ||
    /\bwhat (will|would|can|do) you\b.*\b(revise|revision|flesh|address|produce|meet|fix|improve|change|handle|provide|build|show)\b/.test(lower) ||
    /\bhow do you plan\b/.test(lower) ||
    /\bwhat will you do next\b/.test(lower)
  );
}

function cleanPromptText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

function cleanHistory(history) {
  const items = Array.isArray(history) ? history : [];
  return items.slice(-12).map((item) => {
    const speaker = cleanPromptText(item.speaker || "unknown").slice(0, 40);
    const message = cleanPromptText(item.message || item.text || "");
    return `${speaker}: ${message}`;
  }).join("\n") || "(no prior messages)";
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function createWorkbook(sheets) {
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}
</Relationships>`,
    },
  ];

  for (let index = 0; index < sheets.length; index += 1) {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml(sheets[index].columns, sheets[index].rows),
    });
  }

  return zip(files);
}

function worksheetXml(columns, rows) {
  const allRows = [columns, ...rows.map((row) => columns.map((column) => row[column] || ""))];
  const xmlRows = allRows.map((cells, rowIndex) => {
    const xmlCells = cells.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${xmlCells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${xmlRows}</sheetData>
</worksheet>`;
}

function columnName(number) {
  let name = "";
  let current = number;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = Buffer.from(file.content);
    const crc = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const crcTable = (() => {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

persistAll();
