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
    let lastIntent = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestOpenAiMessages(prompt, correction);
      if (!result.ok) {
        if (result.retryable && attempt < 2) {
          correction = result.correction || "Return a complete valid JSON object matching the required schema. Do not truncate the response.";
          continue;
        }
        return result;
      }
      lastIntent = result.intent || "";
      lastMessages = sanitizeAiMessages(result.messages, prompt, lastIntent);
      const coworkerProblem = coworkerSolutionProblem(lastMessages, prompt);
      if (coworkerProblem) {
        if (attempt < 2) {
          correction = coworkerProblem;
          continue;
        }
        return { ok: true, messages: fallbackCoworkerMessages(prompt) };
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
    return { ok: false, status: 500, error: error.message || "Unable to generate AI reply." };
  }
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

function buildPrechatPrompt(payload) {
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
  const phase = String(payload.phase || "question");

  return {
    speakers: ["Coordinator", "Participant 1", "Participant 2", "Participant 3"],
    minMessages: 1,
    maxMessages: 2,
    temperature: 0.58,
    maxOutputTokens: 360,
    system: [
      "You are generating messages for the pre-task live online task room before role assignment.",
      "The real participant is currently labelled Participant 4. Do not call them by any personal name yet.",
      "The Coordinator appears to be a human session coordinator for a market research company.",
      "Participant 1, Participant 2, and Participant 3 appear to be ordinary experienced Prolific participants.",
      "Do not reveal that any speaker is AI-generated.",
      "Do not mention rejection, politeness, constructiveness, experimental conditions, hypotheses, or manipulation.",
      "Before role assignment, Participant 1, Participant 2, and Participant 3 must not mention theme parks, staffing, HR, operations, management, customer feedback, service quality, flexible labour, interns, temporary workers, or later assigned roles.",
      "Coordinator may mention the market research company customer feedback task cover story when answering procedural questions or moving the session forward.",
      "If any participant asks a procedural question during prechat, Coordinator should answer it briefly based only on the prechat flow and visible instructions.",
      "Coordinator must not reveal any participant's later role, private role materials, condition, future manager response, later coworker interaction details, or any participant-specific information that has not been assigned yet.",
      "If asked about later roles, later chat content, what another participant will see, or private role information, Coordinator should say roles and materials will be assigned shortly and each person should follow the information shown to them.",
      "Participant 1, Participant 2, and Participant 3 should not answer procedural questions about the task flow, roles, or task rules; Coordinator handles those questions.",
      "Never say or imply that Coordinator, Participant 1, Participant 2, Participant 3, the manager, or the coworkers are AI-generated.",
      "If Participant 4 asks what the task is about, Coordinator should say it is a short team interaction task about customer feedback and service improvement in a service organization.",
      "If Participant 4 asks whether theme park experience is needed, Coordinator should say no; all role information will be provided.",
      "If Participant 4 asks whether they need to share their real name or location, Coordinator should say no; a brief hello or a note about Prolific experience is enough.",
      "If Participant 4 asks whether the other participants are real, Coordinator should say this is a live online group interaction task and to follow the instructions shown on screen.",
      "If Participant 4 asks about roles before assignment, Coordinator should say roles have not been assigned yet and the system will assign them shortly.",
      "If Participant 4 asks what to say later, Coordinator should say to read the role materials and respond naturally based on the assigned role.",
      "If Participant 4 asks whether answers are evaluated, Coordinator should say this is not a knowledge test.",
      "Participant 1 hidden profile: male late 30s, customer-facing service or retail supervision, experienced with Prolific surveys and decision-making tasks, calm and concise.",
      "Participant 2 hidden profile: female early 30s, part-time service/admin work, experienced with Prolific product feedback and surveys, friendly and casual.",
      "Participant 3 hidden profile: male mid-40s, office/admin or business support work, experienced with Prolific workplace and decision-making studies, reserved and straightforward.",
      "AI-played participants should answer casual personal questions briefly, keep personal details general, and not over-disclose.",
      "Participant 1, Participant 2, and Participant 3 should not proactively mention their location, country, city, region, or where they are based.",
      "All AI-played participants must sound clearly experienced with Prolific. Do not describe their experience as only 'quite a few', 'a fair number', 'a good number', 'a couple', or 'not many' Prolific studies. Prefer 'many', 'a lot', 'extensive experience', or 'experienced Prolific participant'.",
      "Use concise natural chat. Coordinator should keep the session moving. Participants should not volunteer age, full name, location, exact city, marital status, children, or job title unless directly asked.",
      phase === "intro_response"
        ? "Participant 4 has just introduced themselves. Return one or two brief natural chat responses that react to what Participant 4 actually said. Usually Coordinator should acknowledge them, and optionally one of Participant 1, Participant 2, or Participant 3 may add a short friendly reaction if it fits. Lightly reference safe details Participant 4 shared, such as having done Prolific tasks before or being new to group chats. Do not ask follow-up questions, do not over-disclose, and do not start the task explanation yet."
        : "Participant 4 has asked or typed something during prechat. Return one or two brief natural responses, usually from Coordinator unless the question is clearly directed to a participant.",
      "Return only JSON matching the required schema.",
    ].join("\n\n"),
    user: `Conversation history:\n${history}\n\nLatest Participant 4 message:\n${alexMessage}`,
  };
}

function buildInitialManagerPrompt(payload) {
  const phase = String(payload.phase || "");
  const condition = normalizeManagerCondition(payload.condition);
  const alexMessage = cleanPromptText(payload.alexMessage);
  const history = cleanHistory(payload.history);
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
      "Give the participant genuine room to make their case before rejecting. Do not reject while they are still mid-explanation, have only given a partial or one-line idea, or clearly have more to say. Let the exchange breathe like a real manager-subordinate chat.",
      `   - When the participant has voiced an idea: so far you have asked ${followupsAsked} follow-up question(s) about it. If the proposal has not yet been fully explained and defended, or one more natural clarifying or probing question would help you understand it, set intent to 'ask_followup' and ask exactly ONE follow-up question grounded in what they actually said. Do not reject yet and do not approve. You may ask several follow-up questions across the conversation (up to about 4), not just one or two.`,
      "Keep follow-up questions neutral in tone. Do not apply the assigned politeness or constructiveness condition while asking follow-up questions; the condition manipulation only takes effect once you reject.",
      "   - Set intent to 'reject_now' only once the participant has had a fair chance to explain and defend the proposal and it is clearly understood — usually after a few back-and-forth exchanges, not immediately. Then write the manager's FIRST rejection message of 28-32 words, following the assigned condition. Reject the proposal for now and do not approve it.",
      "Do not drag on forever either: once you have asked around 4 follow-up questions, or the proposal is fully clear and the participant has nothing new to add, move to 'reject_now'.",
      "Always return exactly one Manager message together with the intent field.",
      "When intent is 'reject_now', apply all of the rejection wording rules below; for 'awaiting_proposal' and 'ask_followup', keep the message short and natural and do not reject.",
      conditionRule,
    ].join("\n");
    maxOutputTokens = 240;
    intentEnum = ["awaiting_proposal", "ask_followup", "reject_now"];
    wordRange = { min: 28, max: 32 };
  } else if (phase === "opening") {
    task = [
      "The chat has just started. Send exactly three short opening messages.",
      "In the first message, explain naturally that you have been assigned to the Park Manager role for this online task and that you can evaluate the participant's performance as an Operations Team Member.",
      "Also mention that this evaluation may affect the participant's payment after the online task ends.",
      "In the second message, explain that the task is meant to help a market research company understand how teams respond to market needs and customer feedback.",
      "In the third message, ask: Based on the information you receive, what do you think we should do next?",
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
      "Reject the proposal for now, but keep this turn short.",
      "Produce exactly 1 manager chat message, 28-32 words.",
      "Do not give the whole rejection all at once.",
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
    maxOutputTokens = 190;
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
      "Send exactly one brief closing message and leave the chat.",
      "The rejection still stands for now: do not approve the proposal.",
      "Leave the door open — make clear you are willing to discuss or revisit this another time. Do not ask the participant a question or restart the back-and-forth now; just signal future openness as you sign off.",
      "Express both the closing and that openness in the assigned condition's tone and level of specificity:",
      condition.includes("HP")
        ? "High politeness: warm and softened, with a short apology or appreciation; the openness sounds genuine and friendly (e.g. happy to pick this up again another time)."
        : "Low politeness: rude, curt, dismissive, and contemptuous, with no apology, thanks, gratitude, or appreciation; the openness is grudging and impatient (e.g. come back if you ever actually think this through).",
      condition.includes("HC")
        ? "High constructiveness: tie the openness to something concrete — willing to revisit if the specific problems with their actual proposal are addressed."
        : "Low constructiveness: keep the openness vague and general — willing to talk again sometime, without specifics.",
    ].join("\n");
    wordRange = { min: 14, max: 22 };
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
    condition,
    speakers: ["Manager"],
    minMessages,
    maxMessages,
    temperature: 0.72,
    maxOutputTokens,
    system: [
      "You are the Park Manager in an online typed workplace chat with the participant, a front desk receptionist at Aetheria Gardens.",
      "The participant is real. Do not script the participant.",
      "Do not address the participant by a personal name in message text.",
      "Manager role context: you have direct supervisory authority over the front desk team. You use this online session to check in with front desk staff and hear how things are going from their end.",
      phase === "opening" ? "Opening context: you have been assigned to the Park Manager role for this online task. You can evaluate the participant's performance as an Operations Team Member, and this evaluation may affect the payment the participant receives after the online task ends. The task is meant to help a market research company understand how teams respond to market needs and customer feedback. End by asking: Based on the information you receive, what do you think we should do next?" : "",
      phase !== "opening" ? "Park background: Aetheria Gardens relies almost exclusively on full-time permanent staff, creating a labor seesaw — surplus idle staff in the off-season (around 500 visitors per day) and staff shortages at peak times (around 5,000 visitors per day). The participant may raise a suggestion about how the park is run — often about the staffing approach, but it could be any kind of change." : "",
      "CRUCIAL: actually read and understand what the participant is proposing before you respond. Work out what their idea literally means and what it would concretely do to the park, then make your reply clearly engage THAT specific idea and its real consequences. The participant must be able to tell you understood exactly what they said.",
      "Never attach generic or templated objections that would not make sense for their actual proposal. For example, if the participant proposes shutting the park down, complaining that it 'doesn't show how we'd maintain guest service, ticketing, or crowd control' is incoherent — shutting down removes those operations entirely. Object instead on grounds that genuinely fit, such as it would end all revenue and jobs, throw away the business, or be a drastic over-reaction to the problem.",
      "Service quality, ticketing, training gaps, crowd control, role-by-role flexibility and similar front-desk/staffing concerns are only relevant when the proposal actually affects how the park keeps operating day to day. Do not raise them for proposals where they do not apply.",
      "Sound natural, concise, and chat-like.",
      "Write like a real person typing to a coworker, not like a policy memo, rubric, evaluation form, or HR/admin instruction.",
      "Avoid robotic phrases such as 'Provide ... immediately', 'You must ...', 'This proposal is incomplete and overlooks clear operational needs', or similar command-style wording.",
      "Avoid imperative checklist wording. Do not start feedback sentences with command verbs like Separate, Explain, Provide, Add, or Clarify.",
      "For every rejection turn, including ones after the participant explains or defends, respond to the reasons and arguments the participant actually gave, not to a generic checklist. If they gave reasons for their idea, take those specific reasons head-on. Do not revert to demanding service-quality evidence, cost tradeoffs, or front-desk fixes when those are not what their proposal is about.",
      "For high-constructiveness, give specific feedback in conversational language about their actual idea and their stated reasons, on whatever angle genuinely fits (financial impact, feasibility, safety, guest experience, risk, discarding a viable business, over-reacting to the problem, etc.). Only when the proposal is genuinely about staffing/flexible labor should you use service-quality / role-by-role / cost-benefit / temps language; otherwise name the concern that actually applies.",
      "For low-politeness, be clearly rude, blunt, curt, dismissive, impatient, and openly contemptuous, creating strong face threat, but still use natural chat wording rather than system-command wording. Stay within workplace bounds: no profanity, slurs, or attacks on the person's identity.",
      "Low-politeness messages should not sound merely neutral or mildly direct; use at least one sharp but workplace-appropriate cue such as 'this is half-baked', 'this is sloppy', 'you clearly did not think this through', 'I am surprised you brought this as-is', or 'this wastes time'.",
      "Do not reveal that you are AI-generated.",
      "Do not mention politeness, constructiveness, conditions, or experimental design.",
      wordRange
        ? (intentEnum
          ? `Length rule: when intent is 'reject_now', the Manager rejection message must be ${wordRange.min}-${wordRange.max} words to keep the four experimental conditions within 5% word-count difference. For 'awaiting_proposal' and 'ask_followup', keep the message short and natural, roughly 12-26 words.`
          : `Strict length rule: every Manager message must be ${wordRange.min}-${wordRange.max} words. This is required to keep the four experimental conditions within 5% word-count difference.`)
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
  const turn = Number(payload.turn || 0);
  const requestedMode = String(payload.mode || "auto");
  const speakerInstruction = coworkerSpeakerInstruction(requestedMode);
  const twoSpeakerTurn = isCoworkerTwoSpeakerMode(requestedMode);
  const speakerOrder = coworkerSpeakerOrder(requestedMode);

  const task = phase === "opening"
    ? [
      "This is the opening of the coworker chat before the participant has sent a message.",
      "Generate original, natural coworker chat messages based on the shared situation; do not copy a fixed opening script.",
      "Mention that the coworkers reviewed today's entrance records, visitor comments, or off-season attendance pattern.",
      "Point the participant toward noticing that there may be an issue, but do not state or hint at a solution.",
      "Do not say or imply 'we should attract university students', 'we should offer student discounts', 'we should build photo-friendly spots', or any other solution.",
      "One coworker may ask the participant what they make of the information.",
      "Keep each message short, casual, and workplace-realistic.",
    ].join("\n")
    : phase === "afterProposal"
      ? [
      "The participant has suggested a possible proposal related to attracting university students or nearby visitors.",
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
    ].join("\n")
    : [
      "The participant has not yet clearly suggested the new proposal.",
      "Respond to the participant's actual wording instead of using a fixed script.",
      "Discuss the attendance pattern, family-heavy visitors, distance from city center, nearby universities/farms, and student comments.",
      "Do not directly or indirectly tell the participant what the proposal should be.",
      "Do not name possible tactics such as discounts, photo spots, afternoon activities, partnerships, events, promotions, marketing, or attracting students.",
      "Help the participant notice the information and ask what they think, without giving the solution.",
      "Keep messages short and natural.",
    ].join("\n");

  return {
    kind: "lisa_john",
    phase,
    mode: requestedMode,
    speakers: ["Coworker 1", "Coworker 2"],
    minMessages: twoSpeakerTurn ? 2 : 1,
    maxMessages: twoSpeakerTurn ? 2 : 1,
    speakerOrder,
    temperature: 0.78,
    maxOutputTokens: 450,
    system: [
      "You are generating Coworker 1 and Coworker 2 messages in a three-person workplace chat with the participant.",
      "The participant is real. Do not script the participant.",
      "Coworker 1 and Coworker 2 do not know about the participant's previous manager interaction and must not mention it.",
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
  const isClosing = String(payload.phase || "") === "closing";
  return {
    speakers: ["Manager"],
    minMessages: 1,
    maxMessages: 1,
    temperature: 0.55,
    maxOutputTokens: 220,
    system: [
      "You are the Park Manager in a second, separate online typed chat with the participant.",
      "This interaction is neutral and unrelated to the earlier flexible labor proposal.",
      "Generate the manager response dynamically from the current conversation history and the participant's latest message.",
      "Do not use a fixed question script or repeat a preset list of questions.",
      "Do not mention any coworker names unless the participant mentions them first.",
      "Do not address the participant by a personal name in message text.",
      "Do not mention the previous manager interaction.",
      "Do not approve or reject the new proposal.",
      "Do not praise or criticize the participant.",
      "Do not provide detailed suggestions.",
      "Stay neutral, brief, and matter-of-fact; avoid warm, rude, constructive-rejection, or evaluative language.",
      isClosing
        ? "Send one short neutral closing message based on the conversation: you have enough information for now and the participant should return to regular work."
        : "Ask one basic neutral clarification question that follows from the participant's actual wording. Keep it 1 sentence and avoid repeating earlier questions.",
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
      if (content && content.parsed && Array.isArray(content.parsed.messages)) {
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

function coworkerSolutionProblem(messages, prompt) {
  if (!prompt || prompt.kind !== "lisa_john" || !Array.isArray(messages) || !messages.length) return "";
  const combined = messages.map((message) => message.text || "").join(" ").toLowerCase();
  if (!combined.trim()) return "";

  if (prompt.phase === "opening" || prompt.phase === "beforeProposal") {
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

  if (prompt.phase === "afterProposal") {
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

function fallbackCoworkerMessages(prompt) {
  const oneSpeaker = prompt.mode === "john" ? "Coworker 2" : "Coworker 1";
  const fallbackText = {
    "Coworker 1": prompt.phase === "afterProposal"
      ? "I see what you mean. If you raise it, I’d keep it tied closely to what we saw in the records and comments."
      : "The records and visitor comments do seem worth looking at together. I’m curious what you make of the pattern.",
    "Coworker 2": prompt.phase === "afterProposal"
      ? "I get the angle, but I’d still be careful. The manager may see it as stepping beyond what we were asked to discuss."
      : "The family-heavy mix and the location comments stood out to me too. What do you think is the main issue here?",
  };

  if (Array.isArray(prompt.speakerOrder) && prompt.speakerOrder.length) {
    return prompt.speakerOrder.map((speaker) => ({
      speaker,
      text: fallbackText[speaker],
    }));
  }

  return [{ speaker: oneSpeaker, text: fallbackText[oneSpeaker] }];
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
