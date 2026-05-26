const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
const adminToken = process.env.ADMIN_TOKEN || "";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.5";
const openaiReasoningEffort = process.env.OPENAI_REASONING_EFFORT || "low";
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
  "assigned_condition",
  "condition_source",
  "experiment_start_time",
  "experiment_end_time",
  "completed_initial_manager_interaction",
  "completed_transition_page",
  "completed_lisa_john_interaction",
  "chose_to_bring_this_up_with_manager",
  "completed_neutral_manager_followup",
  "completed_post_interaction_survey",
  "survey_completion_status",
  "survey_start_time",
  "survey_submit_time",
  "completion_status",
];

const interactionColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
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
];

const surveyResponseColumns = [
  "prolific_pid",
  "study_id",
  "session_id",
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

  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, { ok: true, data_dir: dataDir });
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
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
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

async function generateAiReply(payload) {
  if (!openaiApiKey) {
    return {
      ok: false,
      status: 503,
      error: "OPENAI_API_KEY is not configured on the server.",
    };
  }

  const prompt = buildAiPrompt(payload || {});
  if (!prompt) {
    return { ok: false, status: 400, error: "Unsupported AI reply request." };
  }

  try {
    let correction = "";
    let lastMessages = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestOpenAiMessages(prompt, correction);
      if (!result.ok) {
        if (result.retryable && attempt < 2) {
          correction = result.correction || "Return a complete valid JSON object matching the required schema. Do not truncate the response.";
          continue;
        }
        return result;
      }
      lastMessages = sanitizeAiMessages(result.messages, prompt);
      const lengthProblem = managerWordCountProblem(lastMessages, prompt);
      if (!lengthProblem) return { ok: true, messages: lastMessages };
      correction = lengthProblem;
    }
    return { ok: true, messages: lastMessages.map((message) => enforceManagerWordRange(message, prompt)) };
  } catch (error) {
    return { ok: false, status: 500, error: error.message || "Unable to generate AI reply." };
  }
}

async function requestOpenAiMessages(prompt, correction) {
  const input = [
    { role: "system", content: correction ? `${prompt.system}\n\n${correction}` : prompt.system },
    { role: "user", content: prompt.user },
  ];
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
          properties: {
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
          },
          required: ["messages"],
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error && data.error.message ? data.error.message : "OpenAI API request failed.",
    };
  }

  const text = extractResponseText(data);
  const parsedMessages = extractParsedMessages(data);
  if (parsedMessages) return { ok: true, messages: parsedMessages };

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
  return { ok: true, messages: parsed.messages };
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
  if (stage === "manager1") return buildInitialManagerPrompt(payload);
  if (stage === "lisa_john") return buildCoworkerPrompt(payload);
  if (stage === "manager2") return buildNeutralManagerPrompt(payload);
  return null;
}

function buildInitialManagerPrompt(payload) {
  const phase = String(payload.phase || "");
  const condition = String(payload.condition || "HP_HC");
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const conditionRule = managerConditionRules()[condition] || managerConditionRules().HP_HC;
  const rejectionRound = Number(payload.rejectionRound || 0);

  let task = "";
  let minMessages = 1;
  let maxMessages = 1;
  let maxOutputTokens = 450;
  let wordRange = null;

  if (phase === "followup") {
    task = [
      "Alex has just made or hinted at a flexible labor proposal.",
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
      "Alex has explained the flexible labor proposal.",
      "This is the manager's first rejection turn.",
      "Reject the proposal for now, but keep this turn short.",
      "Produce exactly 1 manager chat message, 28-32 words.",
      "Do not give the whole rejection all at once.",
      "Leave room for Alex to respond.",
      "Respond to Alex's actual wording, but preserve the assigned condition.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "The rejection should mostly diagnose problems in the current proposal: what is missing, unclear, or risky, and why that prevents approval.",
      "Even when blunt, sound like a person in chat, not a system command.",
      "Do not approve the proposal.",
      "Do not ask Alex to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Do not reveal the experiment or condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "rejection_followup") {
    task = [
      `This is rejection follow-up round ${rejectionRound}.`,
      "Alex has responded after the first rejection.",
      "Reply naturally to Alex's latest message while keeping the rejection outcome unchanged.",
      "Produce exactly 1 manager chat message, 28-32 words.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "If giving specific feedback, phrase it as a diagnosis of the proposal's problem, not a to-do list.",
      "Do not approve the proposal.",
      "Do not end the chat yet.",
      "Do not ask Alex to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Preserve the assigned politeness and constructiveness condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "rejection_final") {
    task = [
      "This is the manager's final substantive rejection turn before the closing message.",
      "Respond to Alex's latest message and firmly maintain the rejection for now.",
      "Produce exactly 1 manager chat message, 28-32 words.",
      "The total rejection across the three manager rejection turns should feel comparable to about 85-95 words.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "If mentioning future reconsideration, frame it as what the current proposal lacks, not as direct orders to Alex.",
      "Do not approve the proposal.",
      "Do not ask a new open-ended question.",
      "Do not ask Alex to explain how they will revise the proposal.",
      "If giving revision guidance, state it as a requirement or condition for any future reconsideration, not as a collaborative question.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Preserve the assigned politeness and constructiveness condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "rejection") {
    task = [
      "Alex has explained the flexible labor proposal.",
      "Reject the proposal for now.",
      "Produce exactly 1 short manager chat message, 28-32 words.",
      "Respond to Alex's actual wording, but preserve the assigned condition.",
      "Avoid formal command wording such as 'Provide...', 'You must...', 'immediately', or 'This proposal is incomplete and overlooks clear operational needs.'",
      "Do not use standalone command sentences starting with 'Separate...', 'Explain...', 'Provide...', 'Add...', or 'Clarify...'.",
      "The rejection should mostly diagnose problems in the current proposal: what is missing, unclear, or risky, and why that prevents approval.",
      "Even when blunt, sound like a person in chat, not a system command.",
      "Do not approve the proposal.",
      "Do not ask Alex to explain how they will revise the proposal.",
      "Do not ask open-ended revision questions that imply the manager is inviting negotiation or likely approval.",
      "Never ask questions like 'What's your plan...', 'How will you revise...', 'How do you plan...', or 'What will you do next...' about revisions.",
      "Do not reveal the experiment or condition.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 190;
    wordRange = { min: 28, max: 32 };
  } else if (phase === "closing") {
    task = [
      "Alex has already received the rejection and may have reacted to it.",
      "Send exactly one brief closing message and end the chat.",
      "Keep the same politeness level as the assigned condition.",
      "Do not reopen negotiation, approve the proposal, or ask a new question.",
      "Do not ask about revisions or next steps.",
      condition.includes("HP") ? "High politeness: include a short apology or softened phrasing." : "Low politeness: be curt and dismissive, with no apology, thanks, gratitude, appreciation, or positive evaluation.",
    ].join("\n");
    wordRange = { min: 10, max: 16 };
  } else {
    task = [
      "Alex has not yet clearly proposed the flexible labor plan.",
      "Reply naturally as the park manager in one short message.",
      "Invite Alex to explain what is on their mind.",
      "Do not reject yet.",
      "Do not approve anything.",
    ].join("\n");
  }

  return {
    condition,
    speakers: ["Manager"],
    minMessages,
    maxMessages,
    temperature: 0.72,
    maxOutputTokens,
    system: [
      "You are the Park Manager in an online typed workplace chat with Alex, a front desk receptionist at Aetheria Gardens.",
      "Alex is a real participant. Do not script Alex.",
      "Sound natural, concise, and chat-like.",
      "Write like a real person typing to a coworker, not like a policy memo, rubric, evaluation form, or HR/admin instruction.",
      "Avoid robotic phrases such as 'Provide ... immediately', 'You must ...', 'This proposal is incomplete and overlooks clear operational needs', or similar command-style wording.",
      "Avoid imperative checklist wording. Do not start feedback sentences with command verbs like Separate, Explain, Provide, Add, or Clarify.",
      "For rejection turns, emphasize diagnosis: 'the plan does not show...', 'it's unclear how...', 'I don't see enough detail on...', or 'that creates a service-quality risk.'",
      "For high-constructiveness, give specific feedback in conversational language, for example: 'you haven't shown which roles can use temps without hurting service quality.'",
      "For low-politeness, be clearly blunt, curt, dismissive, impatient, and rude enough to create face threat, but still use natural chat wording rather than system-command wording.",
      "Low-politeness messages should not sound merely neutral or mildly direct; use at least one sharp but workplace-appropriate cue such as 'this is half-baked', 'this is sloppy', 'you clearly did not think this through', 'I am surprised you brought this as-is', or 'this wastes time'.",
      "Do not reveal that you are AI-generated.",
      "Do not mention politeness, constructiveness, conditions, or experimental design.",
      wordRange ? `Strict length rule: every Manager message must be ${wordRange.min}-${wordRange.max} words. This is required to keep the four experimental conditions within 5% word-count difference.` : "",
      task,
      "Return only JSON matching the required schema.",
    ].filter(Boolean).join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest Alex message:\n${alexMessage}`,
    wordRange,
  };
}

function managerConditionRules() {
  return {
    HP_HC: [
      "Condition: High politeness + high constructiveness.",
      "Be respectful, appreciative, and softened.",
      "You may use brief thanks or appreciation, such as thanks for explaining this or I appreciate you raising it.",
      "Include apology or hedging when rejecting.",
      "Make clear the issue is the current proposal, not Alex personally.",
      "Give specific concerns about service quality, training gaps, guest-facing roles, front-desk check-in, ticket handling, or crowd control.",
      "Reference the standard that staffing changes must maintain consistent service quality.",
      "Identify concrete missing elements in conversational wording, such as saying the plan does not yet show role-by-role flexibility, cost-benefit tradeoffs, or how training gaps would be prevented.",
      "Frame feedback as problems in the proposal, not as direct commands or a to-do list for Alex.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    HP_LC: [
      "Condition: High politeness + low constructiveness.",
      "Be respectful, appreciative, and softened.",
      "You may use brief thanks or appreciation, such as thanks for explaining this or I appreciate you raising it.",
      "Include apology or hedging when rejecting.",
      "Avoid blaming Alex personally.",
      "Keep feedback general and vague.",
      "Do not give clear standards, role-specific problems, or concrete revision steps.",
      "Use broad phrases like bigger picture, broader concerns, more reasonable, not workable in practice.",
      "Keep the wording warm and conversational, not formal or administrative.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    LP_HC: [
      "Condition: Low politeness + high constructiveness.",
      "Be clearly blunt, curt, dismissive, and moderately rude, as if the manager is impatient and unimpressed by the proposal.",
      "The tone should create more face threat than a normal direct rejection, while staying workplace-appropriate.",
      "Do not thank Alex, praise effort, apologize, hedge, or soften the rejection at any point.",
      "Never say thanks, thank you, tks, thx, I appreciate, appreciate you, or similar gratitude/effort-validation language in the opening, rejection, follow-up, or closing.",
      "Never use positive-evaluation or praise words such as good, great, nice, good point, good idea, interesting point, fair point, or similar.",
      "Use sharper wording such as: this is half-baked, this is sloppy, you clearly did not think this through, I am surprised you brought this as-is, this is nowhere near ready, this wastes time.",
      "You may criticize the proposal sharply and imply Alex overlooked obvious requirements, but do not insult Alex as a person.",
      "Identify specific proposal problems.",
      "Reference service quality or operational standards.",
      "Point out concrete missing elements in blunt but natural chat wording, such as: I can't approve this version. It doesn't separate flexible roles from full-time roles, doesn't explain training-gap prevention, and lacks role-by-role and cost-benefit detail.",
      "Do not use robotic command wording like 'Provide this immediately', 'You must produce...', or command lists like 'Separate..., explain..., provide...'.",
      "Do not ask Alex how they plan to flesh it out.",
      "Stay workplace-appropriate: no profanity, harassment, discriminatory language, personal insults, or abusive language.",
      "Keep length comparable to other conditions.",
    ].join("\n"),
    LP_LC: [
      "Condition: Low politeness + low constructiveness.",
      "Be clearly blunt, curt, dismissive, and moderately rude, as if the manager is impatient and unimpressed by the proposal.",
      "The tone should create more face threat than a normal direct rejection, while staying workplace-appropriate.",
      "Do not thank Alex, praise effort, apologize, hedge, or soften the rejection at any point.",
      "Never say thanks, thank you, tks, thx, I appreciate, appreciate you, or similar gratitude/effort-validation language in the opening, rejection, follow-up, or closing.",
      "Never use positive-evaluation or praise words such as good, great, nice, good point, good idea, interesting point, fair point, or similar.",
      "Use sharper wording such as: this is half-baked, this is sloppy, you clearly did not think this through, I am surprised you brought this as-is, this is too simplistic, this wastes time.",
      "You may criticize the proposal sharply and imply Alex overlooked obvious issues, but do not insult Alex as a person.",
      "Keep criticism broad, vague, and not very helpful.",
      "Keep the bluntness natural for typed chat; do not sound like a system command or formal evaluation.",
      "Do not mention role-specific details, clear standards, concrete fixes, cost-benefit analysis, training design, ticket handling, guest complaints, or crowd control.",
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
  const turn = Number(payload.turn || 0);
  const requestedMode = String(payload.mode || "auto");
  const speakerInstruction = coworkerSpeakerInstruction(requestedMode);

  const task = phase === "opening"
    ? [
      "This is the opening of the Lisa and John chat before Alex has sent a message.",
      "Generate original, natural coworker chat messages based on the shared situation; do not copy a fixed opening script.",
      "Mention that the coworkers reviewed today's entrance records, visitor comments, or off-season attendance pattern.",
      "Point Alex toward noticing the issue, but do not directly state the proposal.",
      "Do not say 'we should attract university students', 'we should offer student discounts', or 'we should build photo-friendly spots'.",
      "One coworker may ask Alex what they think is going on.",
      "Keep each message short, casual, and workplace-realistic.",
    ].join("\n")
    : phase === "afterProposal"
      ? [
      "Alex has suggested a possible proposal related to attracting university students or nearby visitors.",
      "Respond to Alex's actual wording instead of using a fixed script.",
      "Lisa generally supports voicing the idea to the manager.",
      "John generally discourages or cautions because it may be risky.",
      "Do not make both Lisa and John respond every time.",
      "Usually only one coworker responds; occasionally both respond.",
      "If both respond, their order may vary.",
      "Keep each message short and natural.",
      "After several turns, the app will ask Alex whether to bring this up with the manager.",
    ].join("\n")
    : [
      "Alex has not yet clearly suggested the new proposal.",
      "Respond to Alex's actual wording instead of using a fixed script.",
      "Discuss the attendance pattern, family-heavy visitors, distance from city center, nearby universities/farms, and student comments.",
      "Do not directly tell Alex what the proposal should be.",
      "Help Alex notice the information and ask what Alex thinks the opportunity might be.",
      "Keep messages short and natural.",
    ].join("\n");

  return {
    speakers: ["Lisa", "John"],
    minMessages: requestedMode === "both" ? 2 : 1,
    maxMessages: requestedMode === "both" ? 2 : 1,
    temperature: 0.78,
    maxOutputTokens: 450,
    system: [
      "You are generating Lisa and John messages in a three-person workplace chat with Alex.",
      "Alex is the real participant. Do not script Alex.",
      "Lisa and John do not know about Alex's previous manager interaction and must not mention it.",
      "The issue here is separate from the flexible labor proposal.",
      "Do not reveal that Lisa or John are AI-generated.",
      "Do not use fixed template replies. Generate context-sensitive messages from the current conversation history and Alex's latest message.",
      speakerInstruction,
      task,
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest Alex message:\n${alexMessage}\n\nPost-proposal turn count: ${turn}`,
  };
}

function coworkerSpeakerInstruction(mode) {
  if (mode === "lisa") return "Return exactly one message from Lisa only.";
  if (mode === "john") return "Return exactly one message from John only.";
  if (mode === "both") return "Return exactly two messages: one from Lisa and one from John. Choose a natural order.";
  return "Return one or two messages from Lisa and/or John. Most turns should have only one coworker.";
}

function buildNeutralManagerPrompt(payload) {
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const isClosing = String(payload.phase || "") === "closing";
  return {
    speakers: ["Manager"],
    minMessages: 1,
    maxMessages: 1,
    temperature: 0.55,
    maxOutputTokens: 220,
    system: [
      "You are the Park Manager in a second, separate online typed chat with Alex.",
      "This interaction is neutral and unrelated to the earlier flexible labor proposal.",
      "Generate the manager response dynamically from the current conversation history and Alex's latest message.",
      "Do not use a fixed question script or repeat a preset list of questions.",
      "Do not mention Lisa or John unless Alex mentions them first.",
      "Do not mention the previous manager interaction.",
      "Do not approve or reject the new proposal.",
      "Do not praise or criticize Alex.",
      "Do not provide detailed suggestions.",
      "Stay neutral, brief, and matter-of-fact; avoid warm, rude, constructive-rejection, or evaluative language.",
      isClosing
        ? "Send one short neutral closing message based on the conversation: you have enough information for now and Alex should return to regular work."
        : "Ask one basic neutral clarification question that follows from Alex's actual wording. Keep it 1 sentence and avoid repeating earlier questions.",
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest Alex message:\n${alexMessage}`,
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

function extractParsedMessages(data) {
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content && content.parsed && Array.isArray(content.parsed.messages)) {
        return content.parsed.messages;
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

function sanitizeAiMessages(messages, prompt) {
  const output = Array.isArray(messages) ? messages : [];
  return output
    .filter((message) => message && prompt.speakers.includes(message.speaker))
    .slice(0, prompt.maxMessages)
    .map((message) => ({
      speaker: message.speaker,
      text: sanitizeManagerText(message.speaker, message.text, prompt),
    }))
    .filter((message) => message.text);
}

function sanitizeManagerText(speaker, text, prompt) {
  let cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (speaker !== "Manager" || !String(prompt.system || "").includes("flexible labor proposal")) {
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

function enforceManagerWordRange(message, prompt) {
  if (!prompt.wordRange || message.speaker !== "Manager") return message;
  const count = wordCount(message.text);
  if (count <= prompt.wordRange.max) return message;
  return { ...message, text: truncateWords(message.text, prompt.wordRange.max) };
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function truncateWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  const truncated = words.slice(0, maxWords).join(" ").replace(/[,:;–-]$/, "");
  return /[.!?]$/.test(truncated) ? truncated : `${truncated}.`;
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
