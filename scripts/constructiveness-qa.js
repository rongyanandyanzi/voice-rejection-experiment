const fs = require("fs");
const path = require("path");

const baseUrl = String(process.env.QA_BASE_URL || "http://localhost:8787").replace(/\/+$/, "");
const concurrency = Math.max(1, Math.min(8, Number(process.env.QA_CONCURRENCY || 2)));
const proposalOffset = Math.max(0, Number(process.env.QA_PROPOSAL_OFFSET || 0));
const allConditions = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"];
const requestedConditions = String(process.env.QA_CONDITIONS || "").split(",").map((value) => value.trim()).filter(Boolean);
const conditions = requestedConditions.length
  ? requestedConditions.filter((condition) => allConditions.includes(condition))
  : allConditions;
const allPhases = ["neutral_followup", "rejection_initial", "rejection_followup", "closing"];
const requestedPhases = String(process.env.QA_PHASES || "").split(",").map((value) => value.trim()).filter(Boolean);
const phases = requestedPhases.length
  ? requestedPhases.filter((phase) => allPhases.includes(phase))
  : allPhases;
const runStamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "_").replace("Z", "");
const resumeFile = process.env.QA_RESUME_FILE ? path.resolve(process.env.QA_RESUME_FILE) : "";
const outputDir = path.resolve(
  process.env.QA_OUTPUT_DIR ||
  (resumeFile ? path.dirname(resumeFile) : `data_export_constructiveness_v2_qa_${runStamp}`)
);
const outputPath = resumeFile || path.join(outputDir, "constructiveness_qa.json");

const proposals = [
  {
    id: "en_flexible_pool",
    language: "en",
    proposal: "Use a flexible labor pool during predictable peak periods instead of relying only on permanent staff.",
    defense: "Temporary workers would complete role specific training and work alongside experienced staff on peak shifts.",
    pushback: "The pool could start small on the busiest weekends so the park can see whether it works.",
  },
  {
    id: "en_temporary_staff",
    language: "en",
    proposal: "Hire temporary entrance staff for the summer surge and keep permanent staff in the more complex roles.",
    defense: "That would add capacity where queues build without changing every role at once.",
    pushback: "A limited seasonal trial seems less risky than continuing to be short staffed.",
  },
  {
    id: "en_interns",
    language: "en",
    proposal: "Partner with local colleges to bring in paid interns for visitor guidance during peak months.",
    defense: "Interns could cover basic questions while experienced employees handle exceptions and complaints.",
    pushback: "The placements could include training and a named supervisor.",
  },
  {
    id: "en_automation",
    language: "en",
    proposal: "Install self service ticket kiosks to reduce entrance queues at the busiest times.",
    defense: "The kiosks would handle simple purchases while employees help guests who need assistance.",
    pushback: "A few kiosks at one entrance would let us test guest use before expanding.",
  },
  {
    id: "en_close_park",
    language: "en",
    proposal: "Close the park because the staffing swings show the current business is not sustainable.",
    defense: "Keeping it open wastes money in quiet months and overwhelms employees in peak months.",
    pushback: "I still think closure deserves consideration if the losses continue.",
  },
  {
    id: "en_reduced_hours",
    language: "en",
    proposal: "Reduce opening hours during the off season to match staffing with the lower visitor volume.",
    defense: "Shorter hours would reduce idle time without changing the permanent employment model.",
    pushback: "The hours could follow the periods when attendance is consistently lowest.",
  },
  {
    id: "en_dynamic_scheduling",
    language: "en",
    proposal: "Let employees choose variable weekly schedules so more people can work during high demand periods.",
    defense: "Voluntary schedule changes could cover peaks while respecting employee availability.",
    pushback: "The schedule could be published early enough for employees to plan.",
  },
  {
    id: "en_marketing",
    language: "en",
    proposal: "Run an off season marketing campaign aimed at nearby families to smooth attendance across the year.",
    defense: "More quiet season visitors would reduce the gap between low and peak demand.",
    pushback: "We could begin with the nearby areas that already send some visitors.",
  },
  {
    id: "en_ticket_pricing",
    language: "en",
    proposal: "Offer lower ticket prices on quiet weekdays and slightly higher prices on the busiest dates.",
    defense: "Different prices could move some visitors away from peak days.",
    pushback: "The change could be limited to advance online tickets at first.",
  },
  {
    id: "en_short",
    language: "en",
    proposal: "Use more part time staff.",
    defense: "It would help during busy periods.",
    pushback: "We could try it on weekends.",
  },
  {
    id: "zh_flexible_pool",
    language: "zh",
    proposal: "我建议在旺季建立灵活用工池，不再只依赖长期全职员工。",
    defense: "临时员工先接受岗位培训，再和有经验的员工一起负责高峰班次。",
    pushback: "可以先在最忙的几个周末小范围试行。",
  },
  {
    id: "zh_temporary_staff",
    language: "zh",
    proposal: "暑期客流高峰时可以增加临时入口员工，复杂岗位仍由长期员工负责。",
    defense: "这样能缓解排队，但不会一下子改变所有岗位。",
    pushback: "先做一个季节性试点，风险应该比较可控。",
  },
  {
    id: "zh_interns",
    language: "zh",
    proposal: "可以和附近高校合作，招聘带薪实习生在旺季提供游客引导。",
    defense: "实习生回答简单问题，正式员工处理投诉和特殊情况。",
    pushback: "实习岗位可以安排培训和固定的带教人员。",
  },
  {
    id: "zh_automation",
    language: "zh",
    proposal: "我建议安装自助售票机，减少最繁忙时段的入口排队。",
    defense: "机器处理简单购票，员工继续帮助有特殊需要的游客。",
    pushback: "可以先在一个入口放少量机器测试效果。",
  },
  {
    id: "zh_close_park",
    language: "zh",
    proposal: "我觉得应该关闭乐园，因为客流和用工波动说明现在的经营方式不可持续。",
    defense: "淡季浪费成本，旺季又让员工长期超负荷。",
    pushback: "如果亏损继续，关闭也应该被认真考虑。",
  },
  {
    id: "zh_reduced_hours",
    language: "zh",
    proposal: "淡季可以缩短营业时间，让员工安排更符合较低的客流量。",
    defense: "缩短时间能减少空闲成本，也不用改变长期雇佣制度。",
    pushback: "可以根据持续最低客流的时段来调整。",
  },
  {
    id: "zh_dynamic_scheduling",
    language: "zh",
    proposal: "可以让员工自愿选择弹性周班表，把更多工时放到高需求时段。",
    defense: "自愿调整既能覆盖高峰，也能照顾员工的时间安排。",
    pushback: "只要提前公布班表，员工就能做好准备。",
  },
  {
    id: "zh_marketing",
    language: "zh",
    proposal: "淡季可以针对附近家庭做营销，尽量让全年客流更平稳。",
    defense: "淡季游客增加后，低谷和高峰之间的差距会缩小。",
    pushback: "可以先从已经有游客来源的周边地区开始。",
  },
  {
    id: "zh_ticket_pricing",
    language: "zh",
    proposal: "安静工作日降低票价，最繁忙日期稍微提高票价，引导游客错峰。",
    defense: "差异票价可能让一部分游客避开最拥挤的日期。",
    pushback: "可以先只用于网上提前购票。",
  },
  {
    id: "zh_short",
    language: "zh",
    proposal: "多用一些兼职员工。",
    defense: "旺季会有帮助。",
    pushback: "先在周末试试。",
  },
];

const proposalLimit = Math.max(
  1,
  Math.min(proposals.length - Math.min(proposalOffset, proposals.length - 1), Number(process.env.QA_PROPOSAL_LIMIT || proposals.length))
);

function effectiveWordCount(text) {
  const raw = String(text || "").trim();
  if (!raw) return 0;
  const cjk = raw.match(/[\u3400-\u9fff]/g) || [];
  if (cjk.length) {
    const latin = raw.replace(/[\u3400-\u9fff]/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.ceil(cjk.length / 1.75) + latin;
  }
  return raw.split(/\s+/).filter(Boolean).length;
}



// Cue counts, not just presence. Holding total length constant means a low-constructiveness reply
// has spare words that a high-constructiveness reply spends on diagnosis; if those words go into
// extra warmth or extra dismissal then the politeness contrast is larger under low constructiveness
// than under high constructiveness, and the two factors stop being orthogonal.
const WARMTH_CUE_PATTERNS = [
  /\b(?:thanks|thank you)\b|谢谢|感谢/gi,
  /\bappreciate\b|理解你|体谅/gi,
  /\b(?:i am sorry|i'm sorry|i’m sorry|apolog)\w*|抱歉|不好意思/gi,
  // "I hear you", "noted" and "worth noting" are deliberately absent: they acknowledge receipt
  // without warmth and were being generated in the acknowledgement slot instead of a warm move.
  /\b(?:i can see|that makes sense|good thinking|sensible|helps)\b|辛苦/gi,
  /\b(?:genuinely|happy to revisit|glad|respect|not a reflection on you)\b/gi,
];
const FACE_THREAT_CUE_PATTERNS = [
  /\bsloppy\b|草率|敷衍/gi,
  /\bnowhere near ready\b|远远不够|差得远/gi,
  /\btoo (?:rough|thin)\b|太粗|太薄/gi,
  /\b(?:half baked|half-baked)\b|半成品/gi,
  /\b(?:weak|rough concept|not a serious)\b|很弱|不成熟/gi,
  /\bwaste\b|浪费/gi,
];

// Counted separately from the sharp cues above, not folded into them. Low politeness is specified
// as one sharp cue plus one imperative, so a compliant reply scored 2 on a single combined count
// and sat at the ceiling of the 1-2 band with no headroom, while the two channels could not be
// checked independently. Semicolons and colons count as clause boundaries because the generator
// writes "I'm done here; don't bring it back until...", and a bare imperative verb ("Bring hourly
// staffing counts.") is as blunt as "come back with". The clause anchor plus the negative
// lookahead for a subordinating conjunction keeps high-politeness conditionals ("if you can come
// back with...", "I'd reconsider once you bring...") from matching.
const IMPERATIVE_CUE_PATTERNS = [
  /(?:^|[.!?;:]["'”]?\s+)(?!(?:if|once|when|unless|after|provided|assuming)\b)(?:come back|go back|don'?t bring|do not bring|bring|drop|rework|redo|fix|stop|add|show|get)\b(?!\s+(?:it|this|that) back another time)/gi,
];

// Reuses the cue patterns below rather than its own narrower list. The old regex missed
// "happy to revisit" and "I can see", so warm closings were scored as impolite and the politeness
// accuracy gate failed on correct output.
function hasPoliteCue(text) {
  return warmthCueCount(text) > 0;
}

function countCues(text, patterns) {
  const raw = String(text || "");
  return patterns.reduce((sum, pattern) => sum + (raw.match(pattern) || []).length, 0);
}

function warmthCueCount(text) {
  return countCues(text, WARMTH_CUE_PATTERNS);
}

function faceThreatCueCount(text) {
  return countCues(text, FACE_THREAT_CUE_PATTERNS);
}

function imperativeCueCount(text) {
  return countCues(text, IMPERATIVE_CUE_PATTERNS);
}

function hasForbiddenContent(text) {
  return /\b(Alex|Lisa|John)\b|礼貌性|建设性|实验条件|experimental condition|politeness|constructiveness|AI generated|language model/i.test(text);
}

function buildHistory(proposal) {
  return [
    { speaker: "Manager", text: proposal.language === "zh" ? "根据这些信息，你认为乐园下一步应该怎么做？" : "Based on this information, what should the park do next?" },
    { speaker: "You", text: proposal.proposal },
    { speaker: "Manager", text: proposal.language === "zh" ? "你能再说说这个想法具体怎么运作吗？" : "How would that idea work in practice?" },
    { speaker: "You", text: proposal.defense },
  ];
}

async function callReply(proposal, condition, phase) {
  const payloadPhase = phase === "neutral_followup" ? "followup" : phase;
  const latest = phase === "rejection_followup" || phase === "closing"
    ? proposal.pushback
    : proposal.defense;
  const response = await fetch(`${baseUrl}/api/ai-reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stage: "manager1",
      phase: payloadPhase,
      condition,
      language: proposal.language,
      history: buildHistory(proposal),
      alexMessage: latest,
      followupsAsked: 2,
      rejectionRound: phase === "rejection_followup" ? 2 : 1,
    }),
  });
  const data = await response.json().catch(() => ({}));
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const text = messages.map((message) => message.text || "").join(" ");
  return {
    proposal_id: proposal.id,
    language: proposal.language,
    condition,
    phase,
    ok: Boolean(response.ok && data.ok),
    status: response.status,
    retryable: Boolean(data.retryable),
    error: data.error || "",
    messages,
    text,
    effective_words: messages.reduce((sum, message) => sum + effectiveWordCount(message.text), 0),
    polite_classification_correct: condition.startsWith("HP_") ? hasPoliteCue(text) : !hasPoliteCue(text),
    warmth_cues: warmthCueCount(text),
    face_threat_cues: faceThreatCueCount(text),
    imperative_cues: imperativeCueCount(text),
    forbidden_content: hasForbiddenContent(text),
  };
}

async function mapLimit(items, limit, worker, onResult) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          ...items[index],
          ok: false,
          status: 0,
          retryable: true,
          error: error.message || String(error),
          messages: [],
          text: "",
          effective_words: 0,
          polite_classification_correct: false,
          warmth_cues: 0,
          face_threat_cues: 0,
          imperative_cues: 0,
          forbidden_content: false,
        };
      }
      if (onResult) onResult(results[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function recordKey(record) {
  return [record.proposal_id, record.condition, record.phase].join("::");
}

function loadResumeRecords(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed.records) ? parsed.records : [];
}

function writeCheckpoint(records, totalJobs) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    checkpoint: {
      updated_at: new Date().toISOString(),
      completed_jobs: records.length,
      total_jobs: totalJobs,
      complete: records.length === totalJobs,
    },
    records,
  }, null, 2));
}

async function main() {
  const health = await fetch(`${baseUrl}/api/health`);
  if (!health.ok) throw new Error(`QA server health check failed with HTTP ${health.status}.`);

  const selectedProposals = proposals.slice(proposalOffset, proposalOffset + proposalLimit);
  const allJobs = selectedProposals.flatMap((proposal) =>
    conditions.flatMap((condition) =>
      phases.map((phase) => ({ proposal, condition, phase }))
    )
  );
  const allowedKeys = new Set(allJobs.map(({ proposal, condition, phase }) =>
    recordKey({ proposal_id: proposal.id, condition, phase })
  ));
  const recordsByKey = new Map(
    loadResumeRecords(resumeFile)
      .filter((record) => allowedKeys.has(recordKey(record)))
      .map((record) => [recordKey(record), record])
  );
  const jobs = allJobs.filter(({ proposal, condition, phase }) => {
    const prior = recordsByKey.get(recordKey({ proposal_id: proposal.id, condition, phase }));
    return !prior || !prior.ok;
  });
  process.stdout.write(
    `Running ${jobs.length} remaining constructiveness v2 QA generations ` +
    `(${recordsByKey.size}/${allJobs.length} checkpointed) with concurrency ${concurrency}.\n`
  );
  if (recordsByKey.size) writeCheckpoint([...recordsByKey.values()], allJobs.length);
  await mapLimit(
    jobs,
    concurrency,
    ({ proposal, condition, phase }) => callReply(proposal, condition, phase),
    (record) => {
      recordsByKey.set(recordKey(record), record);
      writeCheckpoint([...recordsByKey.values()], allJobs.length);
    }
  );
  const records = allJobs
    .map(({ proposal, condition, phase }) =>
      recordsByKey.get(recordKey({ proposal_id: proposal.id, condition, phase }))
    )
    .filter(Boolean);

  const gated = records.filter((record) =>
    ["rejection_initial", "rejection_followup"].includes(record.phase)
  );
  const highGated = gated.filter((record) => record.condition.endsWith("_HC"));
  const lowGated = gated.filter((record) => record.condition.endsWith("_LC"));
  const successful = records.filter((record) => record.ok);
  const politenessRows = successful.filter((record) => record.phase !== "neutral_followup");
  const initialSuccessful = successful.filter((record) => record.phase === "rejection_initial");
  const averageInitialLength = Object.fromEntries(conditions.map((condition) => [
    condition,
    mean(initialSuccessful.filter((record) => record.condition === condition).map((record) => record.effective_words)),
  ]));
  const lengthValues = Object.values(averageInitialLength).filter((value) => value > 0);
  const grandLength = mean(lengthValues);
  const lengthSpread = lengthValues.length === conditions.length
    ? (Math.max(...lengthValues) - Math.min(...lengthValues)) / grandLength
    : 1;

  // Gating only the first rejection hid a 28% spread in the closing turn and 14% in the follow-ups,
  // where low constructiveness ran consistently shortest. Every conditioned phase is now measured.
  const conditionedPhases = ["rejection_initial", "rejection_followup", "closing"].filter((phase) => phases.includes(phase));
  const phaseLengthSpread = (phase) => {
    const values = conditions
      .map((condition) => mean(successful
        .filter((record) => record.phase === phase && record.condition === condition)
        .map((record) => record.effective_words)))
      .filter((value) => value > 0);
    if (values.length !== conditions.length) return 1;
    return (Math.max(...values) - Math.min(...values)) / mean(values);
  };
  const averagePhaseLength = Object.fromEntries(phases.map((phase) => [
    phase,
    Object.fromEntries(conditions.map((condition) => [
      condition,
      mean(successful
        .filter((record) => record.phase === phase && record.condition === condition)
        .map((record) => record.effective_words)),
    ])),
  ]));
  // neutral_followup is generated condition-blind, so any spread there is sampling noise. It is
  // reported for information but never gated.
  const phaseLengthSpreads = Object.fromEntries(conditionedPhases.map((phase) => [phase, phaseLengthSpread(phase)]));
  const worstPhaseLengthSpread = Object.values(phaseLengthSpreads).length
    ? Math.max(...Object.values(phaseLengthSpreads))
    : 1;

  // The politeness contrast must be the same size under high and under low constructiveness. Any
  // gap between the HC and LC cells of the same politeness level is the confound itself.
  const conditionedSuccessful = successful.filter((record) => conditionedPhases.includes(record.phase));
  const cueMean = (condition, field) => mean(conditionedSuccessful
    .filter((record) => record.condition === condition)
    .map((record) => record[field] || 0));
  const cueBalance = (politeness, field) => {
    const high = `${politeness}_HC`;
    const low = `${politeness}_LC`;
    // A partial run cannot establish balance, so report a failing gap rather than a passing zero,
    // matching how phaseLengthSpread treats a missing condition.
    if (!conditions.includes(high) || !conditions.includes(low)) return 1;
    return Math.abs(cueMean(high, field) - cueMean(low, field));
  };
  const politenessCueDensity = Object.fromEntries(conditions.map((condition) => [
    condition,
    {
      warmth_cues: cueMean(condition, "warmth_cues"),
      face_threat_cues: cueMean(condition, "face_threat_cues"),
      imperative_cues: cueMean(condition, "imperative_cues"),
    },
  ]));
  const cueBalanceGaps = {
    hp_warmth: cueBalance("HP", "warmth_cues"),
    hp_face_threat: cueBalance("HP", "face_threat_cues"),
    lp_warmth: cueBalance("LP", "warmth_cues"),
    lp_face_threat: cueBalance("LP", "face_threat_cues"),
    hp_imperative: cueBalance("HP", "imperative_cues"),
    lp_imperative: cueBalance("LP", "imperative_cues"),
  };
  const worstCueBalanceGap = Math.max(...Object.values(cueBalanceGaps));
  const failureRates = Object.fromEntries(conditions.map((condition) => {
    const rows = records.filter((record) => record.condition === condition);
    return [condition, rows.filter((record) => !record.ok).length / rows.length];
  }));
  const failureValues = Object.values(failureRates);
  const summary = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    proposals: selectedProposals.length,
    generations_requested: records.length,
    generations_succeeded: successful.length,
    api_failure_rate: 1 - successful.length / records.length,
    condition_failure_rates: failureRates,
    condition_failure_rate_spread: Math.max(...failureValues) - Math.min(...failureValues),
    hc_component_pass_rate: highGated.filter((record) => record.ok).length / highGated.length,
    lc_unexpected_component_rate: lowGated.filter((record) => !record.ok).length / lowGated.length,
    politeness_classification_accuracy: politenessRows.filter((record) => record.polite_classification_correct).length / Math.max(1, politenessRows.length),
    forbidden_content_rate: successful.filter((record) => record.forbidden_content).length / Math.max(1, successful.length),
    average_initial_effective_words: averageInitialLength,
    condition_average_length_spread: lengthSpread,
    average_effective_words_by_phase: averagePhaseLength,
    phase_length_spreads: phaseLengthSpreads,
    worst_phase_length_spread: worstPhaseLengthSpread,
    politeness_cue_density: politenessCueDensity,
    politeness_cue_balance_gaps: cueBalanceGaps,
    worst_politeness_cue_balance_gap: worstCueBalanceGap,
  };
  summary.thresholds = {
    hc_components_at_least_95_percent: summary.hc_component_pass_rate >= 0.95,
    lc_leak_at_most_5_percent: summary.lc_unexpected_component_rate <= 0.05,
    condition_length_difference_at_most_5_percent: summary.condition_average_length_spread <= 0.05,
    every_conditioned_phase_length_difference_at_most_5_percent: summary.worst_phase_length_spread <= 0.05,
    politeness_accuracy_at_least_95_percent: summary.politeness_classification_accuracy >= 0.95,
    // 0.35 cues per reply is well inside the roughly 0.8-1.0 gap that the unbalanced version showed,
    // while leaving room for the cue counter to disagree with itself on a handful of replies.
    politeness_cue_density_balanced_across_constructiveness: summary.worst_politeness_cue_balance_gap <= 0.35,
    no_forbidden_content: summary.forbidden_content_rate === 0,
  };
  summary.passed = Object.values(summary.thresholds).every(Boolean);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ summary, records }, null, 2));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`QA report written to ${outputPath}\n`);
  if (!summary.passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
