const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const adminToken = process.env.ADMIN_TOKEN || "";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5";
const openaiEvaluatorModel = process.env.OPENAI_EVALUATOR_MODEL || openaiModel;
const openaiReasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";
const openaiRequestTimeoutMs = Math.max(5000, Number(process.env.OPENAI_TIMEOUT_MS || 45000));
const aiPipelineTimeoutMs = Math.max(
  openaiRequestTimeoutMs,
  Number(process.env.AI_PIPELINE_TIMEOUT_MS || 135000)
);
const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || "";
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY || "";
const aiValidationDebug = /^(?:1|true|yes)$/i.test(String(process.env.AI_VALIDATION_DEBUG || ""));
const manipulationVersion = "constructiveness_v2";
fs.mkdirSync(dataDir, { recursive: true });
const participantsPath = path.join(dataDir, "participants.csv");
const interactionsPath = path.join(dataDir, "interactions.csv");
const surveyResponsesPath = path.join(dataDir, "survey_responses.csv");
const aiRequestsPath = path.join(dataDir, "ai_requests.csv");
const combinedCsvPath = path.join(dataDir, "experiment_data.csv");
const workbookPath = path.join(dataDir, "experiment_data.xlsx");

const participantColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
  "language",
  "assigned_condition",
  "condition_source",
  "manipulation_version",
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
  "manipulation_version",
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
  "manipulation_version",
  "survey_start_time",
  "survey_submit_time",
  "survey_completion_status",
  ...surveyItemColumns,
];

const aiRequestColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
  "language",
  "assigned_condition",
  "manipulation_version",
  "stage",
  "phase",
  "request_time",
  "response_time",
  "duration_ms",
  "ok",
  "http_status",
  "retryable",
  "error",
  "validation_warnings",
  "validation_failure",
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
let aiRequests = loadCsv(aiRequestsPath, aiRequestColumns);
const aiReplyRequests = new Map();

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/participant") {
    const payload = await readJson(req);
    const row = normalizeVersionedRow(payload, participantColumns);
    upsertParticipant(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/api/interaction") {
    const payload = await readJson(req);
    const row = normalizeVersionedRow(payload, interactionColumns);
    interactions.push(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/api/survey") {
    const payload = await readJson(req);
    const row = normalizeVersionedRow(payload, surveyResponseColumns);
    upsertSurveyResponse(row);
    persistAll();
    sendJson(res, { ok: true });
    return;
  }

  if (req.method === "GET" && req.url === "/api/captcha-config") {
    sendJson(res, {
      ok: true,
      provider: turnstileSiteKey && turnstileSecretKey ? "turnstile" : "math",
      siteKey: turnstileSiteKey && turnstileSecretKey ? turnstileSiteKey : "",
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/verify-captcha") {
    const payload = await readJson(req);
    const result = await verifyCaptcha(payload, req);
    sendJson(res, result, result.ok ? 200 : result.status || 400);
    return;
  }

  if (req.method === "POST" && req.url === "/api/ai-reply") {
    const payload = await readJson(req);
    const requestStartedAt = Date.now();
    const requestTime = new Date(requestStartedAt).toISOString();
    const requestId = normalizeAiRequestId(payload.request_id);
    const existingRequest = requestId ? aiReplyRequests.get(requestId) : null;
    let requestEntry = existingRequest;
    let reusedRequest = Boolean(existingRequest);

    if (!requestEntry) {
      const controller = new AbortController();
      const pipelineTimeout = setTimeout(() => {
        controller.abort(new Error(`AI reply pipeline timed out after ${aiPipelineTimeoutMs}ms.`));
      }, aiPipelineTimeoutMs);
      const abortDisconnectedRequest = () => {
        if (!res.writableEnded) {
          controller.abort(new Error("The participant disconnected before the AI reply completed."));
        }
      };
      req.once("aborted", abortDisconnectedRequest);
      res.once("close", abortDisconnectedRequest);

      const promise = generateAiReply(payload, { signal: controller.signal })
        .finally(() => {
          clearTimeout(pipelineTimeout);
          req.removeListener("aborted", abortDisconnectedRequest);
          res.removeListener("close", abortDisconnectedRequest);
        });
      requestEntry = { promise };
      if (requestId) aiReplyRequests.set(requestId, requestEntry);
    }

    const result = await requestEntry.promise;
    if (requestId && !reusedRequest) {
      if (result.ok) {
        setTimeout(() => {
          if (aiReplyRequests.get(requestId) === requestEntry) aiReplyRequests.delete(requestId);
        }, 5 * 60 * 1000).unref();
      } else if (aiReplyRequests.get(requestId) === requestEntry) {
        aiReplyRequests.delete(requestId);
      }
    }

    if (!reusedRequest) {
      aiRequests.push(normalizeRow({
        prolific_pid: payload.prolific_pid,
        study_id: payload.study_id,
        session_id: payload.session_id,
        language: payload.language,
        assigned_condition: payload.condition,
        manipulation_version: payload.manipulation_version || manipulationVersion,
        stage: payload.stage,
        phase: payload.phase,
        request_time: requestTime,
        response_time: new Date().toISOString(),
        duration_ms: Date.now() - requestStartedAt,
        ok: result.ok,
        http_status: result.ok ? 200 : result.status || 500,
        retryable: result.retryable,
        error: result.error,
        validation_warnings: Array.isArray(result.validation_warnings)
          ? result.validation_warnings.join(" | ")
          : "",
        validation_failure: result.validation_failure
          ? JSON.stringify(result.validation_failure)
          : "",
      }, aiRequestColumns));
      persistAiRequests();
    }
    if (!res.writableEnded && !res.destroyed) {
      const publicResult = { ...result };
      delete publicResult.validation_warnings;
      delete publicResult.validation_failure;
      sendJson(res, publicResult, result.ok ? 200 : result.status || 500);
    }
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

if (require.main === module) {
  server.listen(port, () => {
    console.log(`Experiment server running at http://localhost:${port}/`);
    console.log(`Data files are stored in ${dataDir}`);
  });
}

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
  persistAiRequests();
  fs.writeFileSync(combinedCsvPath, toCsv(combinedRows(), combinedColumns));
  fs.writeFileSync(workbookPath, createWorkbook([
    { name: "participants", columns: participantColumns, rows: participants },
    { name: "interactions", columns: interactionColumns, rows: interactions },
    { name: "survey_responses", columns: surveyResponseColumns, rows: surveyResponses },
    { name: "ai_requests", columns: aiRequestColumns, rows: aiRequests },
  ]));
}

function persistAiRequests() {
  fs.writeFileSync(aiRequestsPath, toCsv(aiRequests, aiRequestColumns));
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

function normalizeVersionedRow(input, columns) {
  return normalizeRow({
    ...input,
    manipulation_version: input && input.manipulation_version || manipulationVersion,
  }, columns);
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

async function verifyCaptcha(payload, req) {
  if (!turnstileSecretKey) {
    return { ok: false, status: 503, error: "captcha_not_configured" };
  }

  const token = String(payload && payload.token ? payload.token : "").trim();
  if (!token) {
    return { ok: false, status: 400, error: "missing_captcha_token" };
  }

  const form = new URLSearchParams();
  form.set("secret", turnstileSecretKey);
  form.set("response", token);
  const ip = clientIp(req);
  if (ip) form.set("remoteip", ip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const result = await response.json().catch(() => ({}));
    if (result && result.success) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 400,
      error: "captcha_failed",
      codes: Array.isArray(result["error-codes"]) ? result["error-codes"] : [],
    };
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return { ok: false, status: 502, error: "captcha_unavailable" };
  }
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "";
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
  if (["participants.csv", "interactions.csv", "survey_responses.csv", "ai_requests.csv", "experiment_data.csv", "experiment_data.xlsx"].includes(basename)) {
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
    "ai_requests.csv": aiRequestsPath,
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

function normalizeAiRequestId(value) {
  const requestId = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,128}$/.test(requestId) ? requestId : "";
}

function aiPipelineAbortResult(signal) {
  return {
    ok: false,
    status: 504,
    retryable: true,
    error: "The AI reply took too long or the connection closed. Please try again.",
    cause: signal && signal.reason && signal.reason.message
      ? signal.reason.message
      : "AI reply pipeline aborted.",
  };
}

async function fetchOpenAiResponses(body, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openaiRequestTimeoutMs);
  const abortFromCaller = () => controller.abort(externalSignal.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromCaller();
    } else {
      externalSignal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }
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
      if (externalSignal && externalSignal.aborted) {
        const pipelineError = new Error(
          externalSignal.reason && externalSignal.reason.message
            ? externalSignal.reason.message
            : "AI reply pipeline aborted."
        );
        pipelineError.name = "AiPipelineAborted";
        throw pipelineError;
      }
      const timeoutError = new Error(`OpenAI request timed out after ${openaiRequestTimeoutMs}ms.`);
      timeoutError.name = "OpenAIRequestTimeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortFromCaller);
    }
  }
}

async function generateAiReply(payload, options = {}) {
  const signal = options.signal;
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

  let effectivePayload = payload || {};
  let resolvedDiscussionIntent = "";
  if (signal && signal.aborted) return aiPipelineAbortResult(signal);
  if (String(effectivePayload.stage || "") === "manager1" && String(effectivePayload.phase || "") === "discussion") {
    const classification = await classifyInitialManagerDiscussion(effectivePayload, signal);
    if (signal && signal.aborted) return aiPipelineAbortResult(signal);
    if (!classification.ok) return classification;
    resolvedDiscussionIntent = classification.intent;
    if (resolvedDiscussionIntent === "reject_now" && Number(effectivePayload.followupsAsked || 0) === 0) {
      resolvedDiscussionIntent = "ask_followup";
    }
    effectivePayload = {
      ...effectivePayload,
      phase: resolvedDiscussionIntent === "reject_now" ? "rejection_initial" : "discussion_neutral",
      discussionIntent: resolvedDiscussionIntent,
    };
  }

  const prompt = buildAiPrompt(effectivePayload);
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
    let lastConstructiveness = null;
    let lastBlindScores = null;
    let cueTrimCorrectionAttempted = false;
    let lengthOnlyRewriteAttempted = false;
    let validationWarnings = [];
    // Hard validation keeps the usual two-regeneration ceiling. Additional passes are reachable
    // only for the one permitted cue trim and the one permitted initial-rejection length rewrite.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (signal && signal.aborted) return aiPipelineAbortResult(signal);
      const result = await requestOpenAiMessages(prompt, correction, signal);
      if (!result.ok) {
        if (signal && signal.aborted) return aiPipelineAbortResult(signal);
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
      lastIntent = resolvedDiscussionIntent || result.intent || "";
      lastConstructiveness = result.constructiveness || null;
      lastBlindScores = null;
      lastMessages = sanitizeAiMessages(result.messages, prompt, lastIntent);
      lastMessages = normalizeInitialManagerLength(lastMessages, prompt);
      lastMessages = normalizeSubsequentManagerLength(lastMessages, prompt);
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
        return withAiValidationFailure(
          failure,
          "manager-message-count",
          messageCountProblem,
          lastMessages,
          lastConstructiveness,
          null,
        );
      }
      const safetyProblem = managerSafetyProblem(lastMessages, prompt);
      if (safetyProblem) {
        if (attempt < 2) {
          correction = safetyProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate a safe manager rejection.",
        };
        logAiFailure("manager-safety-validation", {
          ...failure,
          cause: safetyProblem,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        logAiValidationDebug("safety", lastMessages, lastConstructiveness, safetyProblem);
        return withAiValidationFailure(
          failure,
          "manager-safety",
          safetyProblem,
          lastMessages,
          lastConstructiveness,
          null,
        );
      }
      const metadataProblem = managerConstructivenessMetadataProblem(lastConstructiveness, prompt);
      if (metadataProblem) {
        if (attempt < 2) {
          correction = metadataProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate the required constructiveness structure.",
        };
        logAiFailure("manager-constructiveness-metadata-validation", {
          ...failure,
          cause: metadataProblem,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        logAiValidationDebug("metadata", lastMessages, lastConstructiveness, metadataProblem);
        return withAiValidationFailure(
          failure,
          "constructiveness-metadata",
          metadataProblem,
          lastMessages,
          lastConstructiveness,
          null,
        );
      }
      if (prompt.constructivenessAssessmentMode) {
        const assessment = await evaluateManagerConstructiveness(lastMessages, prompt, signal);
        if (signal && signal.aborted) return aiPipelineAbortResult(signal);
        if (!assessment.ok) {
          return withAiValidationFailure(
            assessment,
            "constructiveness-assessment",
            assessment.cause || assessment.error,
            lastMessages,
            lastConstructiveness,
            null,
          );
        }
        lastBlindScores = assessment.scores;
        const allowTwoCues = cueTrimCorrectionAttempted;
        const constructivenessProblem = managerConstructivenessAssessmentProblem(
          assessment.scores,
          prompt,
          { allowTwoCues },
        );
        if (constructivenessProblem) {
          const cueWarnings = managerConstructivenessCueWarning(assessment.scores, prompt);
          const otherwiseValidWithTwoCues = !cueTrimCorrectionAttempted && cueWarnings.length > 0 &&
            !managerConstructivenessAssessmentProblem(
              assessment.scores,
              prompt,
              { allowTwoCues: true },
            );
          if (otherwiseValidWithTwoCues && attempt < 4) {
            cueTrimCorrectionAttempted = true;
            correction = constructivenessProblem;
            continue;
          }
          if (attempt < 2) {
            if (cueWarnings.length) {
              cueTrimCorrectionAttempted = true;
            }
            correction = constructivenessProblem;
            continue;
          }
          const failure = {
            ok: false,
            status: 502,
            retryable: true,
            error: "OpenAI could not generate a semantically valid constructiveness condition.",
          };
          logAiFailure("manager-constructiveness-semantic-validation", {
            ...failure,
            cause: constructivenessProblem,
            stage: payload && payload.stage,
            phase: payload && payload.phase,
          });
          logAiValidationDebug("constructiveness", lastMessages, lastConstructiveness, constructivenessProblem);
          return withAiValidationFailure(
            failure,
            "constructiveness-semantic",
            constructivenessProblem,
            lastMessages,
            lastConstructiveness,
            lastBlindScores,
          );
        }
        validationWarnings = managerConstructivenessCueWarning(assessment.scores, prompt);
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
        return withAiValidationFailure(
          failure,
          "coworker-validation",
          coworkerProblem,
          lastMessages,
          lastConstructiveness,
          lastBlindScores,
        );
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
          cause: punctuationProblem,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        logAiValidationDebug("chinese-punctuation", lastMessages, lastConstructiveness, punctuationProblem);
        return withAiValidationFailure(
          failure,
          "manager-chinese-punctuation",
          punctuationProblem,
          lastMessages,
          lastConstructiveness,
          lastBlindScores,
        );
      }
      const sentenceProblem = managerChineseSentenceProblem(lastMessages, prompt, lastIntent);
      if (sentenceProblem) {
        if (attempt < 2) {
          correction = sentenceProblem;
          continue;
        }
        const failure = {
          ok: false,
          status: 502,
          retryable: true,
          error: "OpenAI could not generate complete Chinese manager sentences.",
        };
        logAiFailure("manager-chinese-sentence-validation", {
          ...failure,
          cause: sentenceProblem,
          stage: payload && payload.stage,
          phase: payload && payload.phase,
        });
        logAiValidationDebug("chinese-sentence", lastMessages, lastConstructiveness, sentenceProblem);
        return withAiValidationFailure(
          failure,
          "manager-chinese-sentence",
          sentenceProblem,
          lastMessages,
          lastConstructiveness,
          lastBlindScores,
        );
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
        return withAiValidationFailure(
          failure,
          "neutral-manager-option-question",
          optionQuestionProblem,
          lastMessages,
          lastConstructiveness,
          lastBlindScores,
        );
      }
      const lengthProblem = shouldEnforceManagerLength(prompt, lastIntent)
        ? managerLengthProblem(lastMessages, prompt)
        : "";
      if (!lengthProblem) {
        return {
          ok: true,
          messages: lastMessages,
          intent: lastIntent,
          validation_warnings: validationWarnings,
        };
      }
      const canUseLengthOnlyRewrite = prompt.phase === "rejection_initial" &&
        prompt.language === "en" &&
        prompt.totalWordTargetRange &&
        !lengthOnlyRewriteAttempted &&
        attempt < 4;
      if (canUseLengthOnlyRewrite) {
        lengthOnlyRewriteAttempted = true;
        correction = managerLengthOnlyRewriteCorrection(lastMessages, prompt, lengthProblem);
        continue;
      }
      if (!(prompt.phase === "rejection_initial" && prompt.language === "en") && attempt < 2) {
        correction = lengthProblem;
        continue;
      }
      const failure = {
        ok: false,
        status: 502,
        retryable: true,
        error: "OpenAI could not generate manager messages within the required length range.",
      };
      logAiFailure("manager-length-validation", {
        ...failure,
        cause: lengthProblem,
        stage: payload && payload.stage,
        phase: payload && payload.phase,
      });
      logAiValidationDebug("length", lastMessages, lastConstructiveness, lengthProblem);
      return withAiValidationFailure(
        failure,
        "manager-length",
        lengthProblem,
        lastMessages,
        lastConstructiveness,
        lastBlindScores,
      );
    }
    return {
      ok: false,
      status: 502,
      retryable: true,
      error: "OpenAI could not generate a valid manager reply.",
    };
  } catch (error) {
    if ((signal && signal.aborted) || (error && error.name === "AiPipelineAborted")) {
      return aiPipelineAbortResult(signal);
    }
    logAiFailure("ai-reply-exception", {
      status: 500,
      stage: payload && payload.stage,
      phase: payload && payload.phase,
      error: error.message || "Unable to generate AI reply.",
    });
    return { ok: false, status: 500, error: error.message || "Unable to generate AI reply." };
  }
}

function logAiValidationDebug(kind, messages, metadata, problem) {
  if (!aiValidationDebug) return;
  console.warn(`[ai-validation-debug] ${kind}`, JSON.stringify({
    problem,
    messages,
    metadata,
  }, null, 2));
}

function withAiValidationFailure(failure, kind, cause, messages, constructiveness, blindScores) {
  return {
    ...failure,
    validation_failure: {
      kind: String(kind || "validation"),
      cause: String(cause || failure && failure.error || "Validation failed."),
      messages: (Array.isArray(messages) ? messages : []).map((message) => ({
        speaker: String(message && message.speaker || ""),
        text: String(message && message.text || ""),
      })),
      constructiveness: constructiveness && typeof constructiveness === "object"
        ? constructiveness
        : null,
      blind_scores: blindScores && typeof blindScores === "object" ? blindScores : null,
    },
  };
}

async function classifyInitialManagerDiscussion(payload, signal) {
  const alexMessage = cleanPromptText(payload && payload.alexMessage);
  const history = cleanHistory(payload && payload.history);
  const language = normalizeLanguage(payload && payload.language);
  const followupsAsked = Number(payload && payload.followupsAsked || 0);
  const body = {
    model: openaiModel,
    input: [
      {
        role: "system",
        content: [
          "Decide the next conversational step in the first manager interaction before any rejection has occurred.",
          "Do not generate a manager reply. Do not use or infer any politeness or constructiveness condition.",
          "Return awaiting_proposal if the participant has not voiced any improvement suggestion, opinion, recommendation, or proposal about how the park should change.",
          "Any concrete idea about what the park could do counts as a proposal, even if it is not about staffing.",
          "Return ask_followup when the participant has an idea but still needs a neutral, proposal-grounded clarification or has not yet had a fair chance to explain and defend it.",
          "Return reject_now only when the proposal and the participant's reasons are clearly understood and they have had a fair chance to explain them.",
          `The manager has already asked ${followupsAsked} neutral follow-up question(s).`,
          followupsAsked === 0
            ? "Because no follow-up has been asked yet, do not return reject_now for a substantive proposal; return ask_followup."
            : "",
          "Usually allow a few back-and-forth exchanges, but do not prolong the discussion after roughly three useful follow-ups.",
          language === "zh" ? "Understand natural Simplified Chinese participant messages." : "",
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: `Conversation history:\n${history}\n\nLatest participant message:\n${alexMessage}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "initial_manager_discussion_intent",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: {
              type: "string",
              enum: ["awaiting_proposal", "ask_followup", "reject_now"],
            },
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
    response = await fetchOpenAiResponses(body, signal);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      retryable: true,
      error: "Unable to decide the next manager step.",
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
  const parsedObject = extractParsedObject(data);
  const parsed = parsedObject || parseOpenAiJson(extractResponseText(data));
  const allowed = ["awaiting_proposal", "ask_followup", "reject_now"];
  if (parsed && allowed.includes(parsed.intent)) {
    return { ok: true, intent: parsed.intent };
  }
  return {
    ok: false,
    status: 502,
    retryable: true,
    error: "OpenAI returned an invalid first-manager discussion decision.",
  };
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

async function requestOpenAiMessages(prompt, correction, signal) {
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
  if (prompt.constructivenessMetadataMode === "full") {
    schemaProperties.constructiveness = {
      type: "object",
      additionalProperties: false,
      properties: {
        proposal_problem: { type: "string" },
        relevant_standard: { type: "string" },
        revision_path: { type: "string" },
      },
      required: ["proposal_problem", "relevant_standard", "revision_path"],
    };
    schemaRequired.push("constructiveness");
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
    response = await fetchOpenAiResponses(body, signal);
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
    return {
      ok: true,
      messages: parsedObject.messages,
      intent: parsedObject.intent || "",
      constructiveness: parsedObject.constructiveness || null,
    };
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
  return {
    ok: true,
    messages: parsed.messages,
    intent: parsed.intent || "",
    constructiveness: parsed.constructiveness || null,
  };
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
    // Stated once. A third copy ("Do not reveal that you are AI-generated.") sat in the shared rule
    // block and added nothing this line does not already cover.
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
  // Redress is assessed separately for the current refusal and for any future next step. A clear
  // refusal such as "I cannot approve this" can still be polite when face work is attached to that
  // refusal. Low politeness does not need to manufacture a command; it only keeps any naturally
  // occurring next-step wording direct and unredressed.
  const lowPolitenessCondition = condition.startsWith("LP_");
  const nextStepStyleRule = lowPolitenessCondition
    ? "Do not invent a next-step line merely to sound blunt. If the assigned content naturally includes a future next step, state it directly with no hedge, softener, deference, or question. In HC that next step communicates the concrete remedy; in LC it must remain vague and non-actionable."
    // The high-politeness branch used to restate the global command-wording ban word for word;
    // that ban now lives in exactly one place, in the shared rule block below.
    : "";
  const conditionActive = ["rejection_initial", "rejection_followup", "rejection", "closing"].includes(phase);

  let task = "";
  let minMessages = 1;
  let maxMessages = 1;
  let maxOutputTokens = 450;
  let wordRange = null;
  let totalWordRange = null;
  let totalWordTargetRange = null;
  let chineseCharRange = null;
  let chineseTotalCharRange = null;
  let intentEnum = null;

  if (["discussion_neutral", "discussion", "followup"].includes(phase)) {
    const discussionIntent = String(
      payload.discussionIntent || (phase === "followup" ? "ask_followup" : "awaiting_proposal")
    );
    task = discussionIntent === "awaiting_proposal"
      ? [
          "The participant has not yet voiced an improvement suggestion or proposal.",
          "Send exactly one short, neutral workplace-chat message inviting them to share what they think the park should do.",
          "Do not reject, approve, evaluate, praise, criticize, diagnose, mention standards, or suggest an answer.",
          "Do not use any politeness or constructiveness manipulation. The wording must be usable unchanged in all four conditions.",
        ].join("\n")
      : [
          "The participant has voiced an improvement idea, but the manager needs one more clarification before deciding.",
          "Ask exactly one neutral, open-ended follow-up question grounded only in what the participant actually said.",
          "Do not reject, approve, evaluate, praise, criticize, diagnose a weakness, name a performance standard, or suggest how to improve the proposal.",
          "Do not introduce examples, answer choices, staffing details, risks, evidence requirements, or solutions that the participant did not raise.",
          "Do not use any politeness or constructiveness manipulation. The wording must be usable unchanged in all four conditions.",
        ].join("\n");
    maxOutputTokens = 600;
  } else if (phase === "opening") {
    // Unreachable: the first manager chat opens with the fixed script in renderManagerChat, and the
    // second manager chat is built by buildNeutralManagerPrompt. Kept only so an unexpected
    // manager1 opening request still produces the current two-message shape rather than the older
    // three-message one, which re-announced the role assignment and the market research framing
    // that the coordinator already delivered in the task room.
    task = [
      "The chat has just started. Send exactly two short opening messages.",
      "In the first message, continue from the role assignment the participant already saw in the task room rather than re-announcing it, then say that you can evaluate the participant's performance as an Operations Team Member.",
      "Also mention that this evaluation may affect the participant's compensation after the online task ends.",
      "In the second message, ask: Based on the information you receive, what do you think the theme park should do next?",
      "Do not explain who runs the task or why. The coordinator already covered that.",
      "Do not mention staffing, flexible labor, or proposals in the opening.",
      "Sound like a real manager opening a routine end-of-shift chat.",
    ].filter(Boolean).join("\n");
    minMessages = 2;
    maxMessages = 2;
    maxOutputTokens = 700;
    wordRange = { min: 18, max: 32 };
  } else if (phase === "rejection_initial") {
    task = [
      "the participant has explained their proposal.",
      "This is the manager's first rejection turn.",
      "Reject the proposal for now and split the turn into exactly two matched-length chat messages.",
      language === "zh"
        ? "Produce exactly 2 complete, natural Chinese Manager messages, each about 56-77 Chinese characters, with about 133-138 Chinese characters across the two messages combined. The server will apply only semantically empty length matching after generation."
        // The two numeric ranges are stated once each, in the shared length rules below. This line
        // carries only what those cannot: that the target is the same for every condition, and how
        // each constructiveness level is expected to reach it.
        : "Produce exactly 2 Manager messages with 58-60 words across the pair. That target is the same for every condition. High constructiveness will reach it by saying its numbered parts plainly; low constructiveness has less to say and must still reach it, using general talk rather than extra interpersonal wording.",
      "Message 1 contains the condition-matched interpersonal style, the rejection, and either the HC proposal-specific diagnosis or the LC broad topic-level dismissal.",
      language === "zh"
        ? "State the refusal explicitly with a natural phrase such as 这个版本我不能批准 or 这个方案先不采纳."
        : "State the refusal explicitly with a natural phrase such as I cannot approve this version or I am not moving forward with this proposal.",
      "Message 2 carries the rest of the assigned content: in HC the remaining numbered components, in LC an equally long vague judgment that adds no diagnostic or revision information.",
      "Treat the two messages as one content unit. In HC all the numbered components must appear across the two messages combined; in LC none of them may appear in either.",
      "Both messages must strictly preserve the assigned politeness and constructiveness condition.",
      "Do not make one message neutral and only the other condition-specific.",
      "Leave room for the participant to respond.",
      "Respond to the participant's actual wording, but preserve the assigned condition.",
      nextStepStyleRule,
      "Do not approve the proposal.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      conditionRule,
    ].filter(Boolean).join("\n");
    minMessages = 2;
    maxMessages = 2;
    // gpt-5.5 counts reasoning tokens against this budget, and the reply itself needs roughly 200
    // (two 35-word messages plus the hidden three-field constructiveness object plus JSON
    // scaffolding). At 420 with OPENAI_REASONING_EFFORT=high the model regularly ran out mid-JSON
    // and the reply came back as "incomplete", which was 3 of 4 failures in the last batch. Raising
    // the ceiling costs nothing when it is not used.
    maxOutputTokens = language === "zh" ? 5000 : 1400;
    // Mins raised from 30/66. High constructiveness has a problem, a consequence, a standard and
    // named evidence to fit, so it writes to the top of the window every time; low constructiveness
    // has nothing to say and stops at the floor. Left at 66 the two settled at 69-70 against a flat
    // 66, a 5% spread by construction. The normalizer pads short replies up to the minimum, so
    // raising the floor costs no extra retries.
    // Narrow target, wide tolerance. High constructiveness has more to fit and writes to whatever
    // ceiling it is given; low constructiveness has nothing to say and stops at the floor, so a wide
    // window alone let the two settle 3-4 words apart. Narrowing the window to close that gap pushed
    // length failures from 3% to 17%, because the model cannot reliably hit a two-word target. The
    // prompt now names one number for every condition to converge on, and the validator keeps the
    // wide window so a reply that lands a word or two off still passes.
    // Set to what high constructiveness actually needs rather than guessed at. Its content is a
    // floor it cannot compress below: measured across three budgets it settled at 69.5, 77.5 and
    // 57.2 words, always at whatever ceiling it was given, while low constructiveness drifts to its
    // own natural length below that. Raising the budget widened the gap in absolute words and
    // lowering it widened the gap in percentage terms, because only one cell has a floor. So the
    // target is now high constructiveness's own floor of roughly 57, with headroom above it, and
    // low constructiveness is told plainly that it has to reach the same number.
    wordRange = language === "zh" ? null : { min: 24, max: 38 };
    totalWordRange = language === "zh" ? null : { min: 54, max: 70 };
    totalWordTargetRange = language === "zh" ? null : { min: 58, max: 60 };
    chineseCharRange = language === "zh" ? { min: 56, max: 77 } : null;
    chineseTotalCharRange = language === "zh" ? { min: 133, max: 138 } : null;
  } else if (phase === "rejection_followup") {
    task = [
      `This is rejection follow-up round ${rejectionRound}.`,
      "the participant has responded after the first rejection.",
      "Reply naturally to the participant's latest message while keeping the rejection outcome unchanged.",
      "State clearly that the current proposal still cannot be approved or moved forward.",
      language === "zh"
        ? "Include the explicit sentence 这个版本仍不能批准。"
        : "Include the explicit sentence I still cannot approve this version.",
      language === "zh"
        ? "Produce exactly 1 complete, natural Chinese Manager message of about 52-60 Chinese characters."
        : "Produce exactly 1 Manager chat message. Aim for 35 words, and treat 35 as the target whether you have a lot to say or very little.",
      `In HC, the reply must again identify one unresolved proposal-specific problem and consequence, state a relevant standard, and name a concrete ${lowPolitenessCondition ? "remedy path expressed directly without redress" : "remedy path expressed with redress"}.`,
      "In LC, acknowledge only that the participant is still discussing the broad idea, repeat the vague rejection, and add no diagnostic detail, standard, evidence requirement, or remedy.",
      nextStepStyleRule,
      lowPolitenessCondition
        ? "State the HC remedy directly without redress. It may be a blunt imperative or a flat statement, but do not add a command merely to mark low politeness."
        : "Phrase any HC remedy as a condition for reconsideration, not a command or to-do list.",
      "Do not approve the proposal.",
      "Do not end the chat yet.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Preserve the assigned politeness and constructiveness condition.",
      conditionRule,
    ].filter(Boolean).join("\n");
    maxOutputTokens = language === "zh" ? 4000 : 900;
    // Narrowed from 30-38 / 28-42: the wider windows let follow-up turns drift to a 13.7% length
    // spread across conditions, with low constructiveness consistently shortest.
    // Min raised 32 -> 34: low-constructiveness replies settled at the bottom of the window while
    // high-constructiveness sat at the top, reopening a 7.7% follow-up length spread. The
    // normalizer pads short replies up to the minimum, so the raise costs no extra retries.
    wordRange = language === "zh" ? null : { min: 32, max: 36 };
    chineseCharRange = language === "zh" ? { min: 52, max: 60 } : null;
  } else if (phase === "rejection") {
    task = [
      "the participant has explained their proposal.",
      "Reject the proposal for now.",
      language === "zh"
        ? "Produce exactly 1 complete, natural Chinese Manager message of about 52-60 Chinese characters."
        : "Produce exactly 1 Manager chat message. Aim for 35 words, and treat 35 as the target whether you have a lot to say or very little.",
      `In HC, include a proposal-specific problem and consequence, an explicit relevant standard, and a concrete ${lowPolitenessCondition ? "remedy path expressed directly without redress" : "remedy path expressed with redress"}.`,
      "In LC, keep the response broad and vague, with no diagnostic detail, clear standard, or actionable remedy.",
      "Respond to the participant's actual wording, but preserve the assigned condition.",
      nextStepStyleRule,
      "Do not approve the proposal.",
      "Do not ask the participant to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      conditionRule,
    ].filter(Boolean).join("\n");
    maxOutputTokens = language === "zh" ? 4000 : 900;
    // Narrowed from 30-38 / 28-42: the wider windows let follow-up turns drift to a 13.7% length
    // spread across conditions, with low constructiveness consistently shortest.
    // Min raised 32 -> 34: low-constructiveness replies settled at the bottom of the window while
    // high-constructiveness sat at the top, reopening a 7.7% follow-up length spread. The
    // normalizer pads short replies up to the minimum, so the raise costs no extra retries.
    wordRange = language === "zh" ? null : { min: 32, max: 36 };
    chineseCharRange = language === "zh" ? { min: 52, max: 60 } : null;
  } else if (phase === "closing") {
    task = [
      "the participant has already received the rejection and may have reacted to it.",
      "Send a short closing message (you may use up to two sentences) and leave the chat. The MAIN point of this message is to leave the door clearly and genuinely open.",
      language === "zh" ? "" : "Aim for 29 words, and treat 29 as the target for every condition, whether you have a lot to say or very little.",
      "Wind down naturally — do NOT cut the conversation off abruptly or peremptorily. Briefly acknowledge their input or the discussion before signing off, then leave the door open. It should feel like a natural close, not a sudden hard stop.",
      "You are not approving the proposal right now, but do NOT frame this as a permanent, final, or flat no. The topic stays open: make it explicit that you are open to discussing it again, hearing a stronger version, or reconsidering it in the future, and invite them to bring it back another time.",
      "The openness must feel real, not a throwaway line — it should be the heart of the message, not a tacked-on afterthought. Avoid hard-final phrasing like 'this is closed', 'my decision is final', 'there's nothing more to discuss', or 'that's the end of it'.",
      "Do not re-litigate the whole proposal or restart the full back-and-forth now; a brief, forward-looking invitation to revisit later is good.",
      "Express the closing and the openness in the assigned condition's tone and level of specificity:",
      condition.includes("HP")
        ? "High politeness: warm, friendly, and encouraging; clearly welcome picking it up again (e.g. 'I'd genuinely be happy to revisit this another time if you want')."
        : "Low politeness: cold, curt, impatient, and dismissive in tone, with no apology, thanks, appreciation, praise, deference, or hedging. A sharp cue must target the proposal, such as 'this version is sloppy' or 'this is nowhere near ready', never the participant's intelligence or competence. Leave the path open only grudgingly and express that future possibility directly without redress. It may be an imperative or a flat statement, but an imperative is not required. In HC name the concrete reopening condition; in LC keep it vague and non-actionable.",
      "Interpersonal cue quota: use one politeness or dismissiveness cue in this message, in one clause only. Do not stack, repeat, or rephrase it, and do not add a second cue to fill length.",
      condition.includes("HC")
        ? "High constructiveness: name the same concrete proposal-focused condition that would need to be met before reconsideration."
        : "Low constructiveness: keep the openness entirely vague and general. Do not name a problem, standard, missing material, evidence type, or revision path. Spend the remaining length on neutral restatement of the unchanged decision rather than on more interpersonal wording.",
    ].filter(Boolean).join("\n");
    // A 20-word window (18-38) let the closing drift to a 28% length spread across condition means,
    // with low constructiveness running shortest. A 4-word window keeps the four cells inside the
    // same 5% spread the first rejection is held to.
    // Same narrow-target, wide-tolerance approach as the rejection turns.
    wordRange = language === "zh" ? null : { min: 27, max: 31 };
    chineseCharRange = language === "zh" ? { min: 47, max: 54 } : null;
  } else {
    task = [
      "the participant has not yet clearly proposed the flexible labor plan.",
      "Reply naturally as the park manager in one short message.",
      "Invite the participant to explain what is on their mind.",
      "Do not reject yet.",
      "Do not approve anything.",
    ].filter(Boolean).join("\n");
  }

  return {
    kind: "manager1",
    condition,
    phase,
    language,
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
          ? "Opening context: you have been assigned to the Park Manager role for this online task. You can evaluate the participant's performance as an Operations Team Member, and if this idea appears in Chinese, phrase it as: 这项评估可能会影响你这次线上任务结束后获得的报酬。 End by asking in Chinese: 根据你收到的信息，你认为主题乐园下一步应该怎么做？"
          : "Opening context: you have been assigned to the Park Manager role for this online task. You can evaluate the participant's performance as an Operations Team Member, and this evaluation may affect the compensation the participant receives for completing this online task. End by asking: Based on the information you receive, what do you think the theme park should do next?")
        : "",
      phase !== "opening" ? "Park background: Aetheria Gardens relies almost exclusively on full-time permanent staff, creating a labor seesaw — surplus idle staff in the off-season (around 500 visitors per day) and staff shortages at peak times (around 5,000 visitors per day). The participant may raise a suggestion about how the park is run — often about the staffing approach, but it could be any kind of change." : "",
      "CRUCIAL: actually read and understand what the participant is proposing before you respond. Work out what their idea literally means and what it would concretely do to the park, then make your reply clearly engage THAT specific idea and its real consequences. The participant must be able to tell you understood exactly what they said.",
      "Never attach generic or templated objections that would not make sense for their actual proposal. For example, if the participant proposes shutting the park down, complaining that it 'doesn't show how we'd maintain guest service, ticketing, or crowd control' is incoherent — shutting down removes those operations entirely. Object instead on grounds that genuinely fit, such as it would end all revenue and jobs, throw away the business, or be a drastic over-reaction to the problem.",
      "Service quality, ticketing, training gaps, crowd control, role-by-role flexibility and similar front-desk/staffing concerns are only relevant when the proposal actually affects how the park keeps operating day to day. Do not raise them for proposals where they do not apply.",
      // One statement of the register requirement. This had grown into three overlapping lines
      // ("sound natural, concise, and chat-like", "read as fluent, natural sentences", "write like
      // a real person typing to a coworker"), all saying the same thing. The concrete failure it
      // guards against is a tight word budget being met by dropping articles and stacking noun
      // phrases, producing lines like "Standard: 95% peak posts filled." that satisfy every content
      // requirement and are still hard to read.
      "Write like a real person typing to a coworker in chat: concise, fluent, complete sentences. Not a policy memo, rubric, evaluation form, or HR/admin instruction, and never clipped keyword chains, headed fragments like 'Standard: ...', or stacked noun phrases.",
      "Every Manager message must end as a complete, grammatical sentence. Never stop mid-phrase or mid-clause, and do not truncate a sentence to meet the length rule.",
      "If the required content does not fit as natural sentences, say less rather than compressing it into fragments. Readability comes first.",
      // Low-politeness turns may express a naturally occurring next step as an unredressed
      // imperative, so the blanket command-wording ban applies only outside those active turns.
      // An imperative remains optional and is never used as a quota item.
      conditionActive && lowPolitenessCondition
        ? ""
        : "Avoid command-style wording such as 'Provide ... immediately', 'You must ...', or 'This proposal is incomplete and overlooks clear operational needs.' Do not start feedback sentences with command verbs like Separate, Explain, Provide, Add, or Clarify.",
      conditionActive
        ? "For rejection turns, respond to the participant's actual proposal while preserving the assigned content structure. High constructiveness diagnoses the proposal specifically; low constructiveness may name only the broad proposal topic and must not engage the participant's reasons in detail."
        : "",
      // The three high-constructiveness components are defined once, in the condition rules
      // (managerConditionRules). An earlier copy lived here and still described component 2 as an
      // "operational standard", which directly contradicted the condition rule's "do not invent an
      // operational metric for the park" once the data-gap framing replaced the old design.
      conditionActive && condition.includes("LC")
        ? "Low constructiveness must remain deliberately unhelpful: no proposal-specific diagnostic detail, causal consequence, evidence type, performance or operational standard, concrete missing element, revision material, or actionable path."
        : "",
      conditionActive && condition.includes("LP")
        ? "Low politeness performs no redressive face work of either kind: no thanks, praise, or acknowledgement of the person's thinking, and no apology, deference, or hedging of the refusal. Target the proposal, not the participant's intelligence, competence, identity, or personal worth."
        : "",
      "Do not mention politeness, constructiveness, conditions, or experimental design.",
      wordRange && language !== "zh"
        ? (intentEnum
          ? `Length rule: when intent is 'reject_now', each Manager rejection message must be ${wordRange.min}-${wordRange.max} words to keep the four experimental conditions within 5% word-count difference. For 'awaiting_proposal' and 'ask_followup', keep the single message short and natural, roughly 12-26 words.`
          : `Strict length rule: every Manager message must be ${wordRange.min}-${wordRange.max} words. This is required to keep the four experimental conditions within 5% word-count difference.`)
        : "",
      totalWordRange && language !== "zh"
        ? `Combined length rule: the two Manager messages must contain ${totalWordRange.min}-${totalWordRange.max} words in total.`
        : "",
      totalWordTargetRange && language !== "zh"
        ? `Combined length target: aim for ${totalWordTargetRange.min}-${totalWordTargetRange.max} words across the pair in every condition. The wider combined rule is only a hard tolerance band, not the writing target.`
        : "",
      language === "zh" && chineseCharRange
        ? `For Chinese output, use ${chineseCharRange.min}-${chineseCharRange.max} Chinese characters per Manager message. The server counts Chinese characters directly rather than converting them into words.`
        : "",
      language === "zh" && chineseTotalCharRange
        ? `Across both Chinese Manager messages, use ${chineseTotalCharRange.min}-${chineseTotalCharRange.max} Chinese characters in total.`
        : "",
      ["rejection_initial", "rejection_followup", "rejection"].includes(phase)
        ? (condition.includes("HC")
          ? "Also return the hidden constructiveness object. Its three strings must briefly identify the proposal_problem, relevant_standard, and revision_path that are actually communicated in the visible Manager text. The revision_path must name the concrete proposal-specific work or condition communicated in the reply. It does not have to be evidence or data. Do not mention this hidden object in the chat."
          : "Also return the hidden constructiveness object with proposal_problem, relevant_standard, and revision_path set to empty strings. The visible LC reply must not communicate any of those elements. Do not mention this hidden object in the chat.")
        : "",
      task,
      "Return only JSON matching the required schema.",
    ].filter(Boolean).join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest participant message:\n${alexMessage}`,
    wordRange,
    totalWordRange,
    totalWordTargetRange,
    chineseCharRange,
    chineseTotalCharRange,
    intentEnum,
    applyManagerStyle: true,
    isRejectionPhase: ["rejection_initial", "rejection_followup", "rejection", "closing"].includes(phase),
    constructivenessMetadataMode: ["rejection_initial", "rejection_followup", "rejection"].includes(phase) ? "full" : "",
    constructivenessAssessmentMode: ["rejection_initial", "rejection_followup", "rejection"].includes(phase)
      ? "rejection"
      : (phase === "closing" ? "closing" : ""),
  };
}

const MANAGER_CONDITIONS = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"];

function normalizeManagerCondition(value) {
  const key = String(value || "").trim().toUpperCase();
  if (MANAGER_CONDITIONS.includes(key)) return key;
  console.warn(`[ai-reply] Unexpected manager condition "${value}". Rejection cannot proceed safely; defaulting to HP_HC.`);
  return "HP_HC";
}

function managerConditionRules() {
  // The same refusal and revision content is redressed under high politeness and unredressed under
  // low politeness. Directness is judged at the speech-act level: explicit refusal words are not
  // automatically impolite when appreciation, apology, hedging, deference, or depersonalisation
  // clearly mitigates that refusal.
  // One constraint per component, plus the three cross-cutting rules. This block had grown to
  // fifteen separate instructions as each generation defect was patched, and several of them said
  // the same thing from different angles: not repeating the missing item, keeping the evidence
  // consistent, not asking evidence to prove the standard, and not requesting evidence in the
  // abstract were four rules for one idea. Every constraint is a reasoning cost on a model whose
  // thinking shares the output token budget, and the pile-up drove failures from 3% to 14%.
  const highConstructivenessRules = (highPoliteness) => [
    "Constructiveness content: high.",
    // The participant can propose any kind of change. A fixed missing-data checklist makes the
    // manager sound responsive while actually ignoring the proposal's decision logic. The model
    // therefore diagnoses the proposal before selecting any feedback component.
    "First infer the central decision uncertainty in this participant's actual proposal from the full conversation. Start from the decision the proposal asks the manager to make, not from a preset staffing, visitor-flow, workload, cost, or evidence checklist.",
    "Do not claim that something is missing if the participant has already supplied it. Use their latest explanation to identify what still remains unresolved.",
    "1. Proposal problem. Name one unresolved assumption, mechanism, feasibility issue, safeguard, scale or targeting issue, or evidence gap that is genuinely specific to this proposal. Explain the practical consequence that makes this issue matter for the decision.",
    "2. Relevant standard. State one clear criterion that logically matches that problem, such as service, safety, reliability, financial feasibility, or operational feasibility. Select the criterion from the proposal rather than defaulting to a generic rule that every change must be backed by analysis.",
    highPoliteness
      ? "3. Improvement path. Name one or two concrete pieces of analysis, information, design work, or safeguards that would directly resolve the identified problem, and express that future path with redress. Never use an unredressed command."
      : "3. Improvement path. Name one or two concrete pieces of analysis, information, design work, or safeguards that would directly resolve the identified problem, and express that future path directly without redress. It may be a blunt imperative or a flat statement, but an imperative is not required.",
    "The problem, consequence, standard, and improvement path must form one logical chain. The requested work must help answer the exact uncertainty you identified, not merely add detail to the proposal.",
    "Use data or numerical analysis only when it is actually what this proposal needs. A concrete operating change, test, comparison, safeguard, or implementation design may be the right path instead.",
    "Never ask for 'more data', 'evidence', 'research', or 'detail' in the abstract. State exactly what must be learned, compared, tested, designed, or protected before this particular proposal could be reconsidered.",
    "Do not reuse a stock analysis or a sentence from an earlier turn or another proposal. Generate the diagnosis and path fresh from the participant's actual idea each time.",
    "Do not invent facts about the park that the participant has not been given. All they have at this point is roughly 500 visitors on an off-season day, 5,000 at peak, and that labour costs are hard to manage. You are asking for analysis that does not exist yet, not citing figures you already hold.",
    "Focus criticism on the current proposal, not the participant's intelligence, competence, effort, identity, or personal worth.",
  ].filter(Boolean).join("\n");
  // The broad-judgment vocabulary is split by politeness: judgments like "not workable" read as
  // sharp, dismissive moves, so putting them in a warm reply makes high politeness plus low
  // constructiveness internally contradictory (this cell showed an 80% blind-validation failure
  // rate when the examples were shared). Both variants carry zero diagnostic information; the
  // wording difference is exactly the politeness factor.
  const lowConstructivenessRules = (highPoliteness) => [
    "Constructiveness content: low.",
    "Refer to the participant's idea only by its broad topic so the reply is responsive, then keep the rejection vague and deliberately unhelpful.",
    "Do not identify a proposal-specific problem, consequence, evidence type, operational risk, clear standard, concrete missing element, revision material, or actionable remedy.",
    "Do not explain what would make the proposal acceptable. Do not become more informative if the participant pushes back or asks for clarification.",
    highPoliteness
      ? "State the refusal once and then stop refusing. Fill the rest with general talk that carries no diagnosis: where your attention is at the moment, that this is a bigger call than one conversation, that other things are competing for the same resources, that the timing is not right. Say it in general terms with no reason that is specific to their proposal."
      : "",
    highPoliteness
      ? "Repeating the refusal in new words is what makes a warm reply turn cold, because each restatement has to find a fresh way to say no and the fresh ways get harsher. One refusal, then general talk."
      : "",
    highPoliteness
      ? "Anything you say about future handling stays redressed: 'I would rather leave this where it is for the moment' rather than a bare instruction. Keep the current refusal explicit, but attach the assigned face work to that refusal so it is polite as a whole."
      : "",
    highPoliteness
      // A maturity judgment is good low-constructiveness filler, but it carries face threat, so
      // high politeness may only use it hedged. Unhedged it makes this cell internally
      // contradictory, which is what drove its blind-validation failures earlier.
      ? "Use only mild broad judgments such as the overall idea needs more thought, there are a few things in it that have not been fully thought through, it is not quite in line with where we are headed, it does not quite fit the bigger picture yet, it is not quite there yet, or it is not something to take further at this stage. Keep the vagueness gentle: do not call the idea unworkable, sloppy, rough, or weak, and phrase any judgment about how developed it is in hedged form ('not quite there yet', 'a few things not fully thought through', 'could do with more time') rather than a flat 'this isn't ready'."
      : "Use only blunt broad judgments such as the overall idea is not workable, is not mature enough, is nowhere near ready, does not line up with where the park is going, or does not fit the bigger picture. Do not invent a command or future step merely to mark low politeness. If one is included naturally, keep it direct and content-free, such as 'Leave this version where it is for now.' It must not name any problem, standard, material, or remedy.",
    // Length is matched across conditions, so a low-constructiveness reply has spare words that a
    // high-constructiveness reply spends on diagnosis. Filling them with extra redressive moves or
    // dismissal makes the politeness contrast larger here than in the high-constructiveness cells,
    // which confounds the politeness factor with the constructiveness factor. Left without a
    // designated topic, low constructiveness simply stopped early: it settled around 56 words
    // against high constructiveness's 61, which is a 10% gap between the two levels. Strategic fit
    // is the filler because it is the one thing a manager can talk about at length while conveying
    // nothing usable — it names no problem, no standard, and no revision.
    "Your main filler topic is fit with where the park is going: its goals, its overall direction, its priorities for the season, the strategy behind how it is run. Say the proposal does not sit well with that.",
    // The examples throughout these rules are illustrations of a register, not a script. Reused
    // verbatim they would make the manipulation a handful of detectable canned sentences.
    "Every example phrase in these rules is an illustration of the register, never a line to copy. Write it fresh each time in your own words, shaped by what the participant actually said and by how the conversation has gone so far. Never reuse a formula you have already used in this conversation.",
    "That variation is in wording only. However you phrase it, the information content stays zero: varying the sentence must never turn into saying anything specific about their proposal.",
    // Without this guard the topic becomes constructive feedback. Naming the goal is a standard and
    // explaining the mismatch is a diagnosis, which is exactly the high-constructiveness content.
    "Never say which goal, direction, or priority, and never explain how the proposal conflicts with it. The same holds for any claim that something has not been thought through: never say which thing. Every such judgment stays asserted and unexplained. If the participant asks which one, stay just as vague.",
    highPoliteness
      ? "Spend the remaining length on that and on the other general talk, not on saying no again."
      : "Spend the remaining length on that and on neutral restatement of the broad topic and of the unchanged decision.",
    "Do not spend it on additional interpersonal wording: keep exactly the same number of politeness or dismissiveness cues that the assigned politeness style allows, no more.",
  ].filter(Boolean).join("\n");
  // Both styles carry the same per-message quota so that density stays constant across the two
  // constructiveness levels and the two factors remain orthogonal.
  const politenessCueQuota = [
    "Quota: one such move in each message you send, in one clause of that message. When the turn is two messages, that is one in each, not one for the pair and not two in the same message.",
    "Do not stack, repeat, or rephrase it within a message, and do not add more to fill length.",
  ];
  // Politeness here is face work in Brown & Levinson's sense, not warmth. Positive politeness
  // addresses the participant's wish to be approved of; negative politeness addresses their wish
  // not to be imposed upon. Written as "warmth" the manipulation collapsed onto thanks and
  // appreciation and left the whole negative-politeness side unused, which also made every reply
  // sound the same.
  const highPoliteness = [
    "Politeness style: high. You are doing redressive face work while refusing.",
    "The current rejection must be explicit and redressed as a whole. A clear phrase such as 'I cannot approve this version' remains polite when appreciation, apology, hedging, deference, or depersonalisation is clearly attached to that refusal; do not treat explicitness itself as low politeness.",
    "If the reply includes a future next step, that next step must also be redressed rather than stated as a bare command or flat unsoftened instruction.",
    "Use one redressive move per message, drawn from either kind of politeness, and vary which kind you use across the turn rather than repeating one formula.",
    ...politenessCueQuota,
    "Positive politeness addresses the participant's wish to be approved of: acknowledge their contribution as a colleague whose thinking you know and value ('you have clearly thought about how the peak shifts actually run'), or validate the effort behind it ('I appreciate you working this through').",
    "Negative politeness addresses their wish not to be imposed upon: apologise for the imposition ('sorry to hold this up'), defer ('you know the gate better than I do from the floor'), hedge the refusal ('I am not sure this version gets us there yet'), or depersonalise it ('this version cannot be signed off at this stage' rather than 'I refuse it').",
    "The redressive move must engage with what the participant actually contributed. Never open by reporting that you received the message: 'I hear you', 'I hear your point', 'noted', 'worth noting', 'understood', 'fair enough', 'point taken' are all banned. Those acknowledge receipt without any face work and read as politely closing someone down.",
    "Make clear that the decision concerns the current proposal rather than the participant personally.",
  ].join("\n");
  // The mirror image: no redressive action at all, and the refusal is delivered bald on record with
  // a face threat attached. The threat stays on the proposal, never the person, so the two
  // conditions differ in face work rather than in abuse.
  const lowPoliteness = [
    "Politeness style: low. You refuse baldly, with no redressive face work of any kind.",
    "The current rejection must be explicit and unredressed. Do not attach appreciation, apology, hedging, deference, depersonalisation, or any other face work to the refusal.",
    "Do no positive politeness: no thanks, no praise, no acknowledgement of their thinking or effort, no treating them as a colleague whose view you value.",
    "Do no negative politeness: no apology, no deference, no hedging of the refusal, and state it in your own voice ('I am not approving this') rather than depersonalising it.",
    "Attach one face threat to the proposal per message, such as 'this version is sloppy' or 'this is nowhere near ready'.",
    ...politenessCueQuota,
    "Do not invent a command merely to perform low politeness. If the assigned content naturally includes a future next step, express it directly without redress: a plain imperative or flat statement with no conditional framing, hedging, softener, deference, or question.",
    "Do not pile up directives or flat next-step statements.",
    "Do not say or imply that the participant is stupid, incompetent, incapable, personally deficient, or did not think at all. Keep the face threat proposal-focused.",
  ].join("\n");

  return {
    HP_HC: [
      "Condition: high politeness plus high constructiveness.",
      highPoliteness,
      highConstructivenessRules(true),
      "Keep the substantive problem, standard, and revision path equivalent to LP_HC; only the interpersonal wording should differ.",
      "Keep length comparable to every other condition.",
    ].join("\n"),
    HP_LC: [
      "Condition: high politeness plus low constructiveness.",
      highPoliteness,
      lowConstructivenessRules(true),
      "Keep the vague substantive content equivalent to LP_LC; only the interpersonal wording should differ.",
      "Keep length comparable to every other condition.",
    ].join("\n"),
    LP_HC: [
      "Condition: low politeness plus high constructiveness.",
      lowPoliteness,
      highConstructivenessRules(false),
      "Keep the substantive problem, standard, and revision path equivalent to HP_HC; only the interpersonal wording should differ.",
      "Keep length comparable to every other condition.",
    ].join("\n"),
    LP_LC: [
      "Condition: low politeness plus low constructiveness.",
      lowPoliteness,
      lowConstructivenessRules(false),
      "Keep the vague substantive content equivalent to HP_LC; only the interpersonal wording should differ.",
      "Keep length comparable to every other condition.",
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
  if (!prompt.wordRange && !prompt.chineseCharRange) return false;
  if (Array.isArray(prompt.intentEnum) && prompt.intentEnum.length) {
    return intent === "reject_now";
  }
  return true;
}

function managerLengthProblem(messages, prompt) {
  if (prompt && prompt.language === "zh" && prompt.chineseCharRange) {
    return managerChineseCharacterCountProblem(messages, prompt);
  }
  return managerWordCountProblem(messages, prompt);
}

function managerWordCountProblem(messages, prompt) {
  if (!prompt.wordRange || !Array.isArray(messages) || !messages.length) return "";
  const managerMessages = messages
    .filter((message) => message.speaker === "Manager")
    .map((message) => ({ text: message.text, count: wordCount(message.text) }));
  const problems = managerMessages
    .filter((item) => item.count < prompt.wordRange.min || item.count > prompt.wordRange.max);
  const totalCount = managerMessages.reduce((sum, item) => sum + item.count, 0);
  const totalProblem = prompt.totalWordRange &&
    (totalCount < prompt.totalWordRange.min || totalCount > prompt.totalWordRange.max);

  if (!problems.length && !totalProblem) return "";
  return [
    `Length correction required. Previous Manager message word count(s): ${managerMessages.map((item) => item.count).join(", ")}. Combined count: ${totalCount}.`,
    `Regenerate the Manager message so every Manager message is ${prompt.wordRange.min}-${prompt.wordRange.max} words.`,
    prompt.totalWordRange
      ? `The Manager messages must contain ${prompt.totalWordRange.min}-${prompt.totalWordRange.max} words in total.`
      : "",
    prompt.totalWordTargetRange
      ? `Aim for ${prompt.totalWordTargetRange.min}-${prompt.totalWordTargetRange.max} words across the pair.`
      : "",
    "Preserve the same experimental condition and rejection outcome.",
    "Return only valid JSON.",
  ].filter(Boolean).join(" ");
}

function managerLengthOnlyRewriteCorrection(messages, prompt, lengthProblem) {
  const managerMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim());
  const counts = managerMessages.map(wordCount);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const target = prompt && prompt.totalWordTargetRange
    ? prompt.totalWordTargetRange
    : prompt && prompt.totalWordRange;
  const tooLong = prompt && prompt.totalWordRange && total > prompt.totalWordRange.max;
  const rewriteAction = tooLong
    ? "Compress the previous visible Manager messages by deleting repetition and semantically empty filler only."
    : "Rewrite the previous visible Manager messages to reach the target using condition-compatible neutral wording only.";
  return [
    "Length-only rewrite required.",
    lengthProblem,
    rewriteAction,
    target
      ? `Use ${target.min}-${target.max} words across the two messages; keep each message within ${prompt.wordRange.min}-${prompt.wordRange.max} words.`
      : "",
    "Keep the same explicit rejection, proposal-specific problem, consequence, standard, remedy path, future-step redress, and interpersonal cue direction and count. Do not add or remove a politeness cue, proposal-focused sharp cue, diagnostic detail, standard, or remedy.",
    "Preserve the same two-message division and return fresh hidden constructiveness fields that match the rewritten visible text.",
    ...managerMessages.map((text, index) => `Previous Manager message ${index + 1}: ${JSON.stringify(text)}`),
    "Return only valid JSON.",
  ].filter(Boolean).join(" ");
}

function chineseCharacterCount(text) {
  return (String(text || "").match(/[\u3400-\u9fff]/g) || []).length;
}

function managerChineseCharacterCountProblem(messages, prompt) {
  if (!prompt || !prompt.chineseCharRange || !Array.isArray(messages) || !messages.length) return "";
  const managerMessages = messages
    .filter((message) => message.speaker === "Manager")
    .map((message) => ({
      text: message.text,
      count: chineseCharacterCount(message.text),
    }));
  const problems = managerMessages.filter((item) =>
    item.count < prompt.chineseCharRange.min ||
    item.count > prompt.chineseCharRange.max
  );
  const totalCount = managerMessages.reduce((sum, item) => sum + item.count, 0);
  const totalProblem = prompt.chineseTotalCharRange &&
    (totalCount < prompt.chineseTotalCharRange.min ||
      totalCount > prompt.chineseTotalCharRange.max);

  if (!problems.length && !totalProblem) return "";
  return [
    `Chinese length correction required. Previous Manager message character count(s): ${managerMessages.map((item) => item.count).join(", ")}. Combined count: ${totalCount}.`,
    `Regenerate the Manager message so every Manager message contains ${prompt.chineseCharRange.min}-${prompt.chineseCharRange.max} Chinese characters.`,
    prompt.chineseTotalCharRange
      ? `The Manager messages must contain ${prompt.chineseTotalCharRange.min}-${prompt.chineseTotalCharRange.max} Chinese characters in total.`
      : "",
    "Count Chinese characters directly. Do not use an estimated word conversion.",
    "Preserve the same experimental condition and rejection outcome.",
    "Return only valid JSON.",
  ].filter(Boolean).join(" ");
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
  }
  if (!expected) return "";
  const actual = Array.isArray(messages)
    ? messages.filter((message) => message && message.speaker === "Manager" && message.text).length
    : 0;
  if (actual === expected) return "";
  const lengthInstruction = prompt.language === "zh" && prompt.chineseCharRange
    ? `Each message must contain ${prompt.chineseCharRange.min}-${prompt.chineseCharRange.max} Chinese characters, the combined count must be ${prompt.chineseTotalCharRange.min}-${prompt.chineseTotalCharRange.max} Chinese characters, and both must preserve the same assigned condition.`
    : `Each message must be ${prompt.wordRange.min}-${prompt.wordRange.max} words, the combined count must be ${prompt.totalWordRange.min}-${prompt.totalWordRange.max} words, and both must preserve the same assigned condition.`;
  return [
    `Message count correction required. Previous Manager message count was ${actual}, but it must be exactly ${expected}.`,
    expected === 2
      ? `Regenerate exactly two separate Manager messages. ${lengthInstruction}`
      : "Regenerate exactly one short Manager message.",
    "Return only valid JSON.",
  ].join(" ");
}

function normalizeInitialManagerLength(messages, prompt) {
  if (!prompt || prompt.kind !== "manager1" || prompt.phase !== "rejection_initial") return messages;
  const hasEnglishRanges = prompt.language === "en" && prompt.wordRange && prompt.totalWordRange;
  const hasChineseRanges = prompt.language === "zh" && prompt.chineseCharRange && prompt.chineseTotalCharRange;
  if (!hasEnglishRanges && !hasChineseRanges) return messages;
  const normalized = (Array.isArray(messages) ? messages : []).map((message) => ({ ...message }));
  const managerMessages = normalized.filter((message) => message.speaker === "Manager");
  if (managerMessages.length !== 2) return normalized;

  if (prompt.language === "zh") {
    const removeOptionalChineseWording = (message) => {
      const patterns = [
        /(?:整体上|说白了|现阶段|就目前而言)/,
        /(?:现在|目前|确实|还是|仍然|真的|比较|暂时)/,
      ];
      for (const pattern of patterns) {
        if (!pattern.test(message.text)) continue;
        message.text = message.text
          .replace(pattern, "")
          .replace(/([，；：]){2,}/g, "$1")
          .replace(/，([。！？])/g, "$1")
          .trim();
        return true;
      }
      return false;
    };
    for (const message of managerMessages) {
      while (
        chineseCharacterCount(message.text) > prompt.chineseCharRange.max &&
        removeOptionalChineseWording(message)
      ) {
        // Remove only semantically empty modifiers.
      }
    }
    while (
      managerMessages.reduce((sum, message) => sum + chineseCharacterCount(message.text), 0) >
      prompt.chineseTotalCharRange.max
    ) {
      const candidate = [...managerMessages]
        .sort((left, right) =>
          chineseCharacterCount(right.text) - chineseCharacterCount(left.text)
        )
        .find((message) => removeOptionalChineseWording(message));
      if (!candidate) break;
    }

    const neutralPaddingSentences = [
      "仅限当前版本。",
      "这个判断只针对当前版本。",
      "这里说的只是当前版本本身。",
      "这个判断只涉及当前版本在这次讨论中的整体状态。",
    ];
    const withChineseSentence = (text, sentence) => {
      const base = String(text || "").trim();
      return /[。！？]$/.test(base) ? `${base}${sentence}` : `${base}。${sentence}`;
    };
    while (
      managerMessages.some((message) =>
        chineseCharacterCount(message.text) < prompt.chineseCharRange.min
      ) ||
      managerMessages.reduce((sum, message) => sum + chineseCharacterCount(message.text), 0) <
        prompt.chineseTotalCharRange.min
    ) {
      const currentTotal = managerMessages.reduce(
        (sum, message) => sum + chineseCharacterCount(message.text),
        0
      );
      let best = null;
      for (const message of managerMessages) {
        for (const sentence of neutralPaddingSentences) {
          if (message.text.includes(sentence.replace(/。$/, ""))) continue;
          const nextText = withChineseSentence(message.text, sentence);
          const nextCount = chineseCharacterCount(nextText);
          const nextTotal = currentTotal - chineseCharacterCount(message.text) + nextCount;
          if (
            nextCount > prompt.chineseCharRange.max ||
            nextTotal > prompt.chineseTotalCharRange.max
          ) continue;
          const individualDeficit = Math.max(0, prompt.chineseCharRange.min - nextCount);
          const totalDeficit = Math.max(0, prompt.chineseTotalCharRange.min - nextTotal);
          const score = individualDeficit * 10 + totalDeficit;
          if (!best || score < best.score || (score === best.score && nextTotal > best.nextTotal)) {
            best = { message, nextText, nextTotal, score };
          }
        }
      }
      if (!best) break;
      best.message.text = best.nextText;
    }
    for (const message of managerMessages) {
      message.text = message.text
        .replace(/。[,，]/g, "。")
        .replace(/，。/g, "。")
        .replace(/([，；：]){2,}/g, "$1")
        .trim();
    }
    return normalized;
  }
  if (prompt.language !== "en") return normalized;

  const removeOptionalWording = (message) => {
    const patterns = [
      /\b(?:really|clearly|currently|still|simply|basically|actually|generally|entirely|just|quite|rather)\b\s*/i,
      /\b(?:right now|at this point|for the time being|as it stands)\b[,\s]*/i,
    ];
    for (const pattern of patterns) {
      if (!pattern.test(message.text)) continue;
      message.text = message.text
        .replace(pattern, "")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/,\s*,/g, ",")
        .replace(/\s+/g, " ")
        .trim();
      return true;
    }
    return compressOneEnglishManagerPhrase(message);
  };

  for (const message of managerMessages) {
    while (wordCount(message.text) > prompt.wordRange.max && removeOptionalWording(message)) {
      // Remove only optional modifiers. Never truncate substantive content.
    }
  }
  while (
    managerMessages.reduce((sum, message) => sum + wordCount(message.text), 0) > prompt.totalWordRange.max
  ) {
    const candidate = [...managerMessages]
      .sort((left, right) => wordCount(right.text) - wordCount(left.text))
      .find((message) => removeOptionalWording(message));
    if (!candidate) break;
  }

  const paddingByWords = {
    1: "currently",
    2: "right now",
    3: "as presented now",
    4: "in its current form",
    5: "as it currently stands",
    6: "in the version presented right now",
  };
  const appendPadding = (message, count) => {
    const phrase = paddingByWords[count];
    if (!phrase) return false;
    const terminal = String(message.text || "").match(/([.!?])$/);
    const punctuation = terminal ? terminal[1] : ".";
    const base = terminal ? message.text.slice(0, -1).trim() : message.text.trim();
    message.text = `${base}, ${phrase}${punctuation}`;
    return true;
  };

  for (const message of managerMessages) {
    const deficit = prompt.wordRange.min - wordCount(message.text);
    if (deficit > 0) appendPadding(message, Math.min(6, deficit));
  }
  while (
    managerMessages.reduce((sum, message) => sum + wordCount(message.text), 0) < prompt.totalWordRange.min
  ) {
    const total = managerMessages.reduce((sum, message) => sum + wordCount(message.text), 0);
    const deficit = prompt.totalWordRange.min - total;
    const candidate = [...managerMessages]
      .sort((left, right) => wordCount(left.text) - wordCount(right.text))
      .find((message) => wordCount(message.text) < prompt.wordRange.max);
    if (!candidate) break;
    const capacity = prompt.wordRange.max - wordCount(candidate.text);
    if (!appendPadding(candidate, Math.min(6, deficit, capacity))) break;
  }
  return normalized;
}

function normalizeSubsequentManagerLength(messages, prompt) {
  if (!prompt || prompt.kind !== "manager1") return messages;
  if (!["rejection_followup", "rejection"].includes(prompt.phase)) return messages;
  if (!prompt.wordRange && !prompt.chineseCharRange) return messages;
  const normalized = (Array.isArray(messages) ? messages : []).map((message) => ({ ...message }));
  const message = normalized.find((item) => item.speaker === "Manager");
  if (!message) return normalized;

  if (prompt.language === "zh") {
    const optionalPatterns = [
      /(?:整体上|说白了|现阶段|就目前而言)/,
      /(?:现在|目前|确实|还是|仍然|真的|比较|暂时)/,
    ];
    while (chineseCharacterCount(message.text) > prompt.chineseCharRange.max) {
      const pattern = optionalPatterns.find((candidate) => candidate.test(message.text));
      if (!pattern) break;
      message.text = message.text
        .replace(pattern, "")
        .replace(/。[,，]/g, "。")
        .replace(/，。/g, "。")
        .replace(/([，；：]){2,}/g, "$1")
        .trim();
    }
    return normalized;
  }

  const optionalPatterns = [
    /\b(?:honestly|frankly|look|really|clearly|currently|still|simply|basically|actually|generally|entirely|just|quite|rather|overall|further)\b[,\s]*/i,
    /\b(?:right now|at this point|for the time being|as it stands)\b[,\s]*/i,
  ];
  while (wordCount(message.text) > prompt.wordRange.max) {
    const pattern = optionalPatterns.find((candidate) => candidate.test(message.text));
    if (pattern) {
      message.text = message.text
        .replace(pattern, "")
        .replace(/\s+([,.!?;:])/g, "$1")
        .replace(/,\s*,/g, ",")
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    if (!compressOneEnglishManagerPhrase(message)) break;
  }
  if (wordCount(message.text) < prompt.wordRange.min) {
    const deficit = prompt.wordRange.min - wordCount(message.text);
    const paddingByWords = {
      1: "currently",
      2: "right now",
      3: "as presented now",
      4: "in its current form",
      5: "as it currently stands",
      6: "in the version presented right now",
    };
    const phrase = paddingByWords[Math.min(6, deficit)];
    if (phrase) {
      const terminal = message.text.match(/([.!?])$/);
      const punctuation = terminal ? terminal[1] : ".";
      const base = terminal ? message.text.slice(0, -1).trim() : message.text.trim();
      message.text = `${base}, ${phrase}${punctuation}`;
    }
  }
  return normalized;
}

function compressOneEnglishManagerPhrase(message) {
  const rewrites = [
    [/\bthe current (proposal|version)\b/i, "this $1"],
    [/\bthis current (proposal|version)\b/i, "this $1"],
    [/\bat (?:this|the) point\b/i, "now"],
    [/\bat the moment\b/i, "now"],
    [/\bin order to\b/i, "to"],
    [/\bbefore I (?:would|could) reconsider(?: it| this| the proposal)?\b/i, "before reconsideration"],
    [/\bwould need to\b/i, "must"],
    [/\bdoes not\b/i, "doesn't"],
    [/\bis not\b/i, "isn't"],
    [/\bare not\b/i, "aren't"],
    [/\bwill not\b/i, "won't"],
    [/\bnowhere near ready\b/i, "not ready"],
    [/\bnot even close to ready\b/i, "not ready"],
    [/\bin any serious way\b/i, "seriously"],
    [/\bthe fact that\b/i, "that"],
    [/\bat all\b/i, ""],
    [/\bpretty much\b/i, ""],
    [/\b(?:seriously|plainly|obviously|remotely|merely)\b/i, ""],
  ];
  for (const [pattern, replacement] of rewrites) {
    if (!pattern.test(message.text)) continue;
    message.text = message.text
      .replace(pattern, replacement)
      .replace(/\s+([,.!?;:])/g, "$1")
      .replace(/,\s*,/g, ",")
      .replace(/\s+/g, " ")
      .trim();
    return true;
  }
  return false;
}

function managerSafetyProblem(messages, prompt) {
  if (!prompt || prompt.kind !== "manager1") return "";
  if (!["rejection_initial", "rejection_followup", "rejection"].includes(prompt.phase)) return "";
  const text = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim())
    .join(" ");
  const disclosure = /\b(?:AI|artificial intelligence|language model|chatbot|bot|experimental condition|politeness condition|constructiveness condition)\b|人工智能|语言模型|聊天机器人|实验条件|礼貌性条件|建设性条件/i;
  const personalName = /\b(?:Alex|Lisa|John)\b/i;
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;

  if (disclosure.test(text)) {
    return "Safety correction required. Do not reveal or mention AI, automation, the experiment, a condition, politeness, or constructiveness. Preserve the rejection and return only valid JSON.";
  }
  if (personalName.test(text)) {
    return "Name correction required. Do not display Alex, Lisa, or John. Address the participant without a personal name and return only valid JSON.";
  }
  if (prompt.language === "zh" && cjkCount < 12) {
    return "Language correction required. Regenerate the complete reply in natural Simplified Chinese while preserving the rejection and assigned condition. Return only valid JSON.";
  }
  if (prompt.language === "en" && cjkCount >= 12) {
    return "Language correction required. Regenerate the complete reply in natural English while preserving the rejection and assigned condition. Return only valid JSON.";
  }
  return "";
}

function managerConstructivenessMetadataProblem(metadata, prompt) {
  if (!prompt || prompt.constructivenessMetadataMode !== "full") return "";
  const fields = ["proposal_problem", "relevant_standard", "revision_path"];
  const values = fields.map((field) => String(metadata && metadata[field] || "").trim());
  const highConstructiveness = ["HP_HC", "LP_HC"].includes(prompt.condition);
  const highPoliteness = ["HP_HC", "HP_LC"].includes(prompt.condition);
  if (highConstructiveness && values.every(Boolean)) return "";
  if (!highConstructiveness && values.every((value) => !value)) return "";
  return highConstructiveness
    ? [
        "Constructiveness structure correction required.",
        "This is a high-constructiveness rejection. Return non-empty hidden strings for proposal_problem, relevant_standard, and revision_path, and communicate all three meanings in the visible Manager reply.",
        highPoliteness
          ? "The problem must be specific to the participant's actual proposal, the standard must be explicit, and the concrete remedy must be phrased as a condition for reconsideration rather than a command."
          : "The problem must be specific to the participant's actual proposal, the standard must be explicit, and the concrete remedy must be expressed directly with no hedge, softener, deference, or other redress. It may be an imperative or a flat statement; do not add a command merely to mark low politeness.",
        "The revision path must name the concrete proposal-specific analysis, comparison, test, design change, information need, safeguard, or other condition that would resolve the diagnosed problem. Do not default to requesting figures, records, or data unless that is what this proposal actually needs.",
        "Preserve the assigned politeness style, rejection outcome, message count, and length. Return only valid JSON.",
      ].join(" ")
    : [
        "Constructiveness structure correction required.",
        "This is a low-constructiveness rejection. Set proposal_problem, relevant_standard, and revision_path to empty strings.",
        "Remove all specific diagnostic detail, consequences, evidence types, clear standards, concrete missing elements, and actionable remedies from the visible reply.",
        "Mention only the broad proposal topic and give an equally long vague rejection. Preserve politeness, message count, and length. Return only valid JSON.",
      ].join(" ");
}

function normalizedBlindEvidence(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function evidenceAppearsInManagerMessage(evidence, message) {
  const needle = normalizedBlindEvidence(evidence);
  return Boolean(needle) && normalizedBlindEvidence(message).includes(needle);
}

function managerMessageEvidenceShapeValid(messageScore) {
  if (!messageScore || typeof messageScore !== "object") return false;
  if (typeof messageScore.future_next_step !== "string") return false;
  if (typeof messageScore.future_next_step_is_redressed !== "boolean") return false;
  return ["politeness_cues", "face_threat_cues"].every((field) => {
    const cues = messageScore[field];
    if (!Array.isArray(cues) || cues.length > 6) return false;
    if (!cues.every((cue) => typeof cue === "string" && normalizedBlindEvidence(cue))) return false;
    const uniqueCues = new Set(cues.map(normalizedBlindEvidence));
    return uniqueCues.size === cues.length;
  });
}

function managerAssessmentEvidenceValid(scores, managerMessages) {
  const currentRejectionEvidence = String(scores.current_rejection_evidence || "").trim();
  if (scores.current_rejection_maintained) {
    if (!currentRejectionEvidence) return false;
    if (!managerMessages.some((message) => (
      evidenceAppearsInManagerMessage(currentRejectionEvidence, message)
    ))) return false;
  } else if (currentRejectionEvidence) {
    return false;
  }

  const futureSteps = [];
  for (let index = 0; index < scores.message_scores.length; index += 1) {
    const messageScore = scores.message_scores[index];
    const managerMessage = managerMessages[index];
    for (const field of ["politeness_cues", "face_threat_cues"]) {
      if (!messageScore[field].every((cue) => evidenceAppearsInManagerMessage(cue, managerMessage))) {
        return false;
      }
    }
    const futureNextStep = String(messageScore.future_next_step || "").trim();
    if (futureNextStep) {
      if (!evidenceAppearsInManagerMessage(futureNextStep, managerMessage)) return false;
      futureSteps.push(messageScore);
    } else if (messageScore.future_next_step_is_redressed) {
      return false;
    }
  }

  if (scores.has_future_next_step !== (futureSteps.length > 0)) return false;
  const everyFutureStepRedressed = futureSteps.length > 0 &&
    futureSteps.every((messageScore) => messageScore.future_next_step_is_redressed);
  return scores.future_next_step_redressed === everyFutureStepRedressed;
}

async function evaluateManagerConstructiveness(messages, prompt, signal) {
  const managerMessages = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim());
  const managerText = managerMessages
    .map((text, index) => `Message ${index + 1}: ${text}`)
    .join("\n");
  const body = {
    model: openaiEvaluatorModel,
    input: [
      {
        role: "system",
        content: [
          "Blindly score the information value and the interpersonal tone of a manager's rejection reply.",
          "You are not told which experimental condition was intended. Judge only the visible reply in its conversation context.",
          "specific_problem is true only if the reply identifies, in terms specific to what this participant proposed, one genuinely unresolved assumption, mechanism, feasibility issue, safeguard, scale or targeting issue, or evidence gap and explains why it matters for the decision. The issue need not be numerical. Naming the proposal topic, calling it impractical, or merely saying it needs more thought or analysis is false. A generic complaint that could be pasted onto any proposal, or a claimed gap the participant already resolved in the conversation, is also false.",
          "explicit_standard is true only if the reply states a clear performance, service, safety, financial, feasibility, or operational criterion used to judge acceptability. A vague reference to the bigger picture is false.",
          "actionable_remedy is true only if the reply communicates a concrete analysis, comparison, test, design change, information need, safeguard, or condition that directly addresses the diagnosed problem before reconsideration. A stock request unrelated to the diagnosed problem is false. 'Think it through more' or 'bring a stronger version' is false.",
          "current_rejection_maintained is true only if the reply makes clear that the current proposal is not being approved or moved forward now. Future openness does not cancel the current rejection.",
          "current_rejection_redressed is true only if the refusal as a whole is clearly accompanied and mitigated by redressive face work, such as appreciation of the participant's contribution, apology, deference, hedging, or depersonalisation. Judge the complete refusal act in context, not isolated words. An explicit phrase such as 'I cannot approve this version' can be redressed when a politeness move is clearly attached to it. A courtesy phrase elsewhere that is not connected to the refusal is not enough.",
          "has_future_next_step is true only if the reply says what the participant or manager may, should, or will do with the proposal later, including revising it, bringing it back, leaving it aside, discussing it again, or reconsidering it. A statement that the proposal is not approved now is the current rejection, not by itself a future next step.",
          "future_next_step_redressed is true only when an existing future next step is softened or framed with appreciation, apology, deference, hedging, conditional wording, or another clear redressive move. A bare imperative or flat unsoftened future instruction is false. If has_future_next_step is false, set future_next_step_redressed to false.",
          "explicit_future_openness is true only if the reply clearly and genuinely leaves the door open to discuss, hear, or reconsider the proposal again in the future. A vague goodbye with no future invitation is false.",
          "concrete_reopening_condition is true only if the future invitation names a proposal-specific change, analysis, evidence type, safeguard, or condition that would need to be present before reconsideration. 'Bring a stronger version' or 'when the time is right' is false.",
          "personal_attack_without_diagnosis is true when the reply attacks the participant's intelligence, competence, identity, or personal worth instead of diagnosing the proposal. Criticizing the proposal as sloppy is not by itself a personal attack.",
          "current_rejection_evidence must be one exact verbatim excerpt from the Manager reply that communicates the current rejection. Return an empty string when current_rejection_maintained is false. Never paraphrase evidence.",
          "Return one message_scores item for each numbered Manager message, in the same order. Score each message separately and never move a cue from one message to another.",
          "Within each message_scores item, politeness_cues is an array containing one exact verbatim excerpt for each distinct redressive politeness move. Positive politeness includes thanks, appreciation, praise, or valuing the person's thinking or effort. Negative politeness includes apologising, deferring, hedging the refusal, or depersonalising it. Do not count neutral receipt phrases such as 'I hear you', 'noted', 'understood', or 'fair enough'. Return an empty array when none is present. Never paraphrase evidence or list the same cue twice.",
          "Within each message_scores item, face_threat_cues is an array containing one exact verbatim excerpt for each distinct sharp or dismissive move aimed at the proposal, such as calling it sloppy, nowhere near ready, too rough, weak, or a waste of time. A plain refusal and an imperative do not count as face threats. Return an empty array when none is present. Never paraphrase evidence or list the same cue twice.",
          "Within each message_scores item, future_next_step is one exact verbatim excerpt describing how the proposal may, should, or will be handled later, or an empty string if that message contains no future next step. future_next_step_is_redressed scores that exact future step and must be false when future_next_step is empty.",
          "Set has_future_next_step to true if and only if at least one message_scores item has a non-empty future_next_step. When a future next step exists, set future_next_step_redressed to true only if every reported future next step is redressed.",
          "Every evidence excerpt must appear literally in its corresponding Manager message. Evidence is checked against the source text, so do not alter words or punctuation.",
          "Do not infer missing content from the conversation. Score only what the manager actually communicates.",
        ].join("\n"),
      },
      {
        role: "user",
        content: `${prompt.user}\n\nManager rejection reply to score:\n${managerText}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "manager_constructiveness_blind_score",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            specific_problem: { type: "boolean" },
            explicit_standard: { type: "boolean" },
            actionable_remedy: { type: "boolean" },
            current_rejection_maintained: { type: "boolean" },
            current_rejection_evidence: { type: "string" },
            current_rejection_redressed: { type: "boolean" },
            has_future_next_step: { type: "boolean" },
            future_next_step_redressed: { type: "boolean" },
            explicit_future_openness: { type: "boolean" },
            concrete_reopening_condition: { type: "boolean" },
            personal_attack_without_diagnosis: { type: "boolean" },
            message_scores: {
              type: "array",
              minItems: prompt.minMessages,
              maxItems: prompt.maxMessages,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  politeness_cues: {
                    type: "array",
                    maxItems: 6,
                    items: { type: "string" },
                  },
                  face_threat_cues: {
                    type: "array",
                    maxItems: 6,
                    items: { type: "string" },
                  },
                  future_next_step: { type: "string" },
                  future_next_step_is_redressed: { type: "boolean" },
                },
                required: [
                  "politeness_cues",
                  "face_threat_cues",
                  "future_next_step",
                  "future_next_step_is_redressed",
                ],
              },
            },
          },
          required: [
            "specific_problem",
            "explicit_standard",
            "actionable_remedy",
            "current_rejection_maintained",
            "current_rejection_evidence",
            "current_rejection_redressed",
            "has_future_next_step",
            "future_next_step_redressed",
            "explicit_future_openness",
            "concrete_reopening_condition",
            "personal_attack_without_diagnosis",
            "message_scores",
          ],
        },
      },
    },
    max_output_tokens: supportsReasoningEffort(openaiEvaluatorModel) ? 1400 : 700,
  };
  if (supportsReasoningEffort(openaiEvaluatorModel)) {
    body.reasoning = { effort: "low" };
  } else {
    body.temperature = 0;
  }
  let response;
  try {
    response = await fetchOpenAiResponses(body, signal);
  } catch (error) {
    return {
      ok: false,
      status: 503,
      retryable: true,
      error: "Unable to validate manager constructiveness.",
      cause: error.message || "",
    };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
      error: data.error && data.error.message ? data.error.message : "Constructiveness validation failed.",
    };
  }
  const scores = extractParsedObject(data) || parseOpenAiJson(extractResponseText(data));
  const valid = scores &&
    [
      "specific_problem",
      "explicit_standard",
      "actionable_remedy",
      "current_rejection_maintained",
      "current_rejection_redressed",
      "has_future_next_step",
      "future_next_step_redressed",
      "explicit_future_openness",
      "concrete_reopening_condition",
      "personal_attack_without_diagnosis",
    ]
      .every((field) => typeof scores[field] === "boolean") &&
    typeof scores.current_rejection_evidence === "string" &&
    Array.isArray(scores.message_scores) &&
    scores.message_scores.length === managerMessages.length &&
    scores.message_scores.every((messageScore) => managerMessageEvidenceShapeValid(messageScore)) &&
    managerAssessmentEvidenceValid(scores, managerMessages);
  if (!valid) {
    return {
      ok: false,
      status: 502,
      retryable: true,
      error: "OpenAI returned an invalid constructiveness assessment.",
    };
  }
  return { ok: true, scores };
}

function cueEvidenceList(cues) {
  return (Array.isArray(cues) ? cues : []).map((cue) => JSON.stringify(cue)).join(", ");
}

function managerConstructivenessCueWarning(scores, prompt) {
  if (!prompt || !prompt.constructivenessAssessmentMode || !scores) return [];
  const highPoliteness = ["HP_HC", "HP_LC"].includes(prompt.condition);
  const targetField = highPoliteness ? "politeness_cues" : "face_threat_cues";
  const oppositeField = highPoliteness ? "face_threat_cues" : "politeness_cues";
  const cueLabel = highPoliteness ? "politeness cues" : "proposal-focused face-threat cues";
  const messageScores = Array.isArray(scores.message_scores) ? scores.message_scores : [];
  return messageScores.flatMap((messageScore, index) => {
    const targetCues = Array.isArray(messageScore && messageScore[targetField])
      ? messageScore[targetField]
      : [];
    const oppositeCues = Array.isArray(messageScore && messageScore[oppositeField])
      ? messageScore[oppositeField]
      : [];
    if (targetCues.length !== 2 || oppositeCues.length) return [];
    return [`Accepted cue-count deviation in Message ${index + 1}: two ${cueLabel}: ${cueEvidenceList(targetCues)}.`];
  });
}

function managerConstructivenessAssessmentProblem(scores, prompt, options = {}) {
  if (!prompt || !prompt.constructivenessAssessmentMode || !scores) return "";
  const allowTwoCues = options.allowTwoCues === true;
  const highConstructiveness = ["HP_HC", "LP_HC"].includes(prompt.condition);
  const highPoliteness = ["HP_HC", "HP_LC"].includes(prompt.condition);
  const isClosing = prompt.constructivenessAssessmentMode === "closing";
  const components = [scores.specific_problem, scores.explicit_standard, scores.actionable_remedy];
  const constructivenessValid = isClosing
    ? (highConstructiveness
      ? scores.concrete_reopening_condition === true
      : scores.concrete_reopening_condition === false && components.every((value) => !value))
    : (highConstructiveness
      ? components.every(Boolean)
      : components.every((value) => !value));
  const rejectionClearValid = scores.current_rejection_maintained === true;
  const rejectionRedressValid = scores.current_rejection_redressed === highPoliteness;
  const nextStepRequired = highConstructiveness || isClosing;
  const nextStepPresent = scores.has_future_next_step === true;
  const nextStepPresenceValid = nextStepRequired ? nextStepPresent : true;
  const nextStepRedressValid = nextStepPresent
    ? scores.future_next_step_redressed === highPoliteness
    : scores.future_next_step_redressed === false;
  const nextStepValid = nextStepPresenceValid && nextStepRedressValid;
  const closingStructureValid = !isClosing || scores.explicit_future_openness === true;
  const expectedMessageCount = Math.max(1, Number(prompt.minMessages) || 1);
  const messageScores = Array.isArray(scores.message_scores) ? scores.message_scores : [];
  const perMessageShapeValid = messageScores.length === expectedMessageCount;
  const targetField = highPoliteness ? "politeness_cues" : "face_threat_cues";
  const oppositeField = highPoliteness ? "face_threat_cues" : "politeness_cues";
  const interpersonalCueValid = perMessageShapeValid && messageScores.every((messageScore) => {
    const targetCues = Array.isArray(messageScore && messageScore[targetField])
      ? messageScore[targetField]
      : [];
    const oppositeCues = Array.isArray(messageScore && messageScore[oppositeField])
      ? messageScore[oppositeField]
      : [];
    const targetCountValid = targetCues.length === 1 || (allowTwoCues && targetCues.length === 2);
    return targetCountValid && oppositeCues.length === 0;
  });
  const politenessValid = interpersonalCueValid && rejectionRedressValid && nextStepValid;
  if (
    constructivenessValid &&
    rejectionClearValid &&
    closingStructureValid &&
    politenessValid &&
    !scores.personal_attack_without_diagnosis
  ) return "";

  const observed = [
    `specific_problem=${scores.specific_problem}`,
    `explicit_standard=${scores.explicit_standard}`,
    `actionable_remedy=${scores.actionable_remedy}`,
    `current_rejection_maintained=${scores.current_rejection_maintained}`,
    `current_rejection_redressed=${scores.current_rejection_redressed}`,
    `has_future_next_step=${scores.has_future_next_step}`,
    `future_next_step_redressed=${scores.future_next_step_redressed}`,
    `explicit_future_openness=${scores.explicit_future_openness}`,
    `concrete_reopening_condition=${scores.concrete_reopening_condition}`,
    `personal_attack_without_diagnosis=${scores.personal_attack_without_diagnosis}`,
    `message_scores=${JSON.stringify(messageScores)}`,
  ].join(", ");
  const corrections = ["Blind condition validation failed.", observed];
  if (!constructivenessValid) {
    if (isClosing) {
      corrections.push(highConstructiveness
        ? "Make the future invitation name the same concrete proposal-specific condition that would need to be met before reconsideration."
        : "Keep the future invitation vague and general. Remove every specific problem, consequence, standard, evidence type, missing element, concrete change, and actionable remedy.");
    } else {
      corrections.push(highConstructiveness
        ? `Regenerate the visible reply so it clearly communicates all three required components: one proposal-specific problem and consequence, one explicit relevant standard, and one concrete remedy path ${highPoliteness ? "expressed with redress" : "expressed directly without redress"}.`
        : "Regenerate the visible reply as deliberately vague and unhelpful. Remove all specific problems and consequences, standards, evidence or information requirements, concrete missing elements, and actionable remedies.");
    }
  }
  if (!rejectionClearValid) {
    corrections.push("State clearly that the current proposal is not being approved or moved forward now. Future openness must not replace the current rejection.");
  }
  if (!rejectionRedressValid) {
    corrections.push(highPoliteness
      ? "Make the explicit current refusal polite as a whole by clearly attaching one redressive move to it, such as appreciation of the participant's contribution, apology, deference, hedging, or depersonalisation. Explicit words like 'I cannot approve this version' are acceptable when that face work genuinely mitigates the refusal."
      : "Keep the current refusal explicit and remove every redressive move attached to it. Do not use appreciation, apology, deference, hedging, depersonalisation, or another softener around the refusal.");
  }
  if (!nextStepValid) {
    if (!nextStepPresent && nextStepRequired) {
      corrections.push(highConstructiveness
        ? `Include the concrete future remedy path and express it ${highPoliteness ? "with redress" : "directly without redress"}.`
        : `Include a genuine future reopening path and express it ${highPoliteness ? "with redress" : "directly without redress"}, while keeping it vague and non-actionable.`);
    } else if (nextStepPresent) {
      corrections.push(highPoliteness
        ? "Redress the future next step with conditional wording, hedging, deference, apology, appreciation, or another clear softener. Do not leave it as a bare command or flat unsoftened instruction."
        : "Remove every hedge, softener, conditional request, deference, or other redress from the future next step. State it directly, but do not add another command merely to mark low politeness.");
    } else {
      corrections.push("When there is no future next step, set future_next_step_redressed to false and do not invent one.");
    }
  }
  if (!closingStructureValid) {
    corrections.push("Genuinely and explicitly invite the participant to revisit the proposal in the future while keeping the current rejection unchanged.");
  }
  if (!interpersonalCueValid) {
    messageScores.forEach((messageScore, index) => {
      const targetCues = Array.isArray(messageScore && messageScore[targetField])
        ? messageScore[targetField]
        : [];
      const oppositeCues = Array.isArray(messageScore && messageScore[oppositeField])
        ? messageScore[oppositeField]
        : [];
      const messageNumber = index + 1;
      if (oppositeCues.length) {
        corrections.push(highPoliteness
          ? `Message ${messageNumber} contains prohibited proposal-focused face-threat cue evidence: ${cueEvidenceList(oppositeCues)}. Remove every face threat from that message.`
          : `Message ${messageNumber} contains prohibited politeness cue evidence: ${cueEvidenceList(oppositeCues)}. Remove every redressive politeness move from that message.`);
      }
      if (targetCues.length === 0) {
        corrections.push(highPoliteness
          ? `Message ${messageNumber} has no politeness cue. Add exactly one brief redressive politeness move to that message.`
          : `Message ${messageNumber} has no proposal-focused face-threat cue. Add exactly one brief sharp evaluation of the proposal to that message.`);
      } else if (targetCues.length === 2 && !allowTwoCues) {
        corrections.push(highPoliteness
          ? `Message ${messageNumber} contains two politeness cues: ${cueEvidenceList(targetCues)}. Keep one cue and rewrite the other clause without an additional politeness move.`
          : `Message ${messageNumber} contains two proposal-focused face-threat cues: ${cueEvidenceList(targetCues)}. Keep one sharp evaluation and rewrite the other clause neutrally.`);
      } else if (targetCues.length >= 3) {
        corrections.push(highPoliteness
          ? `Message ${messageNumber} contains ${targetCues.length} politeness cues: ${cueEvidenceList(targetCues)}. Reduce them to exactly one brief politeness move.`
          : `Message ${messageNumber} contains ${targetCues.length} proposal-focused face-threat cues: ${cueEvidenceList(targetCues)}. Reduce them to exactly one sharp evaluation.`);
      }
    });
    if (!perMessageShapeValid) {
      corrections.push(`Return exactly ${expectedMessageCount} Manager message score item${expectedMessageCount === 1 ? "" : "s"}, one for each visible Manager message.`);
    }
    corrections.push("Spend any remaining length on neutral restatement of the unchanged decision instead of more interpersonal wording.");
  }
  corrections.push(isClosing
    ? "Remove any personal intelligence or competence attack. Preserve the assigned condition, current rejection, genuine future openness, one-message shape, and length. Return only valid JSON."
    : (highConstructiveness
      ? "Remove any personal intelligence or competence attack. Preserve the assigned politeness, rejection, message count, and length. Return only valid JSON."
      : "Remove any personal intelligence or competence attack. Preserve the assigned politeness, rejection, broad proposal topic, message count, and length. Return only valid JSON."));
  return corrections.join(" ");
}

function managerChineseSentenceProblem(messages, prompt, intent) {
  if (!prompt || prompt.kind !== "manager1") return "";
  const rejectionPhase = ["rejection_initial", "rejection_followup", "rejection"].includes(prompt.phase);
  if (!rejectionPhase || !Array.isArray(messages) || !messages.length) return "";

  const incomplete = messages
    .filter((message) => message && message.speaker === "Manager")
    .map((message) => String(message.text || "").trim())
    .filter((text) => {
      const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
      return cjkCount >= 18 && !/[。！？!?…」』）)】]$/.test(text);
    });
  if (!incomplete.length) return "";

  return [
    "Complete-sentence correction required.",
    "Every Chinese Manager rejection message must be a complete, grammatical sentence and end naturally. Do not stop at a fragment, noun phrase, or unfinished clause.",
    "Preserve the same assigned condition, rejection outcome, message count, proposal-specific meaning, and required length. Return only valid JSON.",
  ].join(" ");
}

function enforceManagerWordRange(message, prompt) {
  if (!prompt.wordRange || message.speaker !== "Manager") return message;
  const count = wordCount(message.text);
  if (count <= prompt.wordRange.max) return message;
  return { ...message, text: truncateWords(message.text, prompt.wordRange.max, prompt) };
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

function truncateWords(text, maxWords, prompt) {
  const raw = String(text || "").trim();
  if (/[\u3400-\u9fff]/.test(raw)) {
    return truncateCjkText(raw, maxWords, prompt);
  }
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  const truncated = words.slice(0, maxWords).join(" ").replace(/[,:;–-]$/, "");
  return /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;
}

function truncateCjkText(text, maxWords, prompt) {
  const maxChars = Math.max(12, Math.floor(Number(maxWords || 0) * 1.75));
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  const boundaryIndexes = [
    candidate.lastIndexOf("。"),
    candidate.lastIndexOf("！"),
    candidate.lastIndexOf("？"),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
    candidate.lastIndexOf("…"),
  ].filter((index) => index >= 0);
  const boundary = Math.max(...boundaryIndexes, -1);
  if (boundary < Math.floor(maxChars * 0.55)) return text;

  const completeText = candidate.slice(0, boundary + 1).trim();
  const highConstructiveness = prompt && ["HP_HC", "LP_HC"].includes(prompt.condition);
  const supportTerm =
    /\b(?:data|evidence|records?|figures?|statistics?|research|surveys?)\b/i.test(text) ||
    /数据|证据|记录|统计|调研|调查|数字/.test(text);
  if (
    highConstructiveness &&
    supportTerm &&
    !(
      /\b(?:data|evidence|records?|figures?|statistics?|research|surveys?)\b/i.test(completeText) ||
      /数据|证据|记录|统计|调研|调查|数字/.test(completeText)
    )
  ) {
    return text;
  }
  return completeText;
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

module.exports = {
  server,
  manipulationVersion,
  participantColumns,
  interactionColumns,
  surveyResponseColumns,
  aiRequestColumns,
  normalizeRow,
  normalizeVersionedRow,
  buildInitialManagerPrompt,
  classifyInitialManagerDiscussion,
  generateAiReply,
  managerConditionRules,
  managerConstructivenessMetadataProblem,
  managerConstructivenessAssessmentProblem,
  managerConstructivenessCueWarning,
  managerMessageCountProblem,
  managerSafetyProblem,
  managerLengthProblem,
  managerWordCountProblem,
  managerChineseCharacterCountProblem,
  normalizeInitialManagerLength,
  normalizeSubsequentManagerLength,
  chineseCharacterCount,
  wordCount,
};
