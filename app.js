(function () {
  const screen = document.getElementById("screen");
  const params = new URLSearchParams(window.location.search);
  const conditionLabels = ["HP_HC", "HP_LC", "LP_HC", "LP_LC"];
  const conditionAliases = {
    1: "HP_HC",
    2: "HP_LC",
    3: "LP_HC",
    4: "LP_LC",
    HP_HC: "HP_HC",
    HP_LC: "HP_LC",
    LP_HC: "LP_HC",
    LP_LC: "LP_LC",
  };
  const firstParam = (...names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value) return value;
    }
    return "";
  };
  const ids = {
    prolific_pid: firstParam("PROLIFIC_PID", "oid", "participant_id", "uid", "user_id", "respondent_id", "subject_id", "js_id") || "missing",
    study_id: firstParam("STUDY_ID", "study_id", "project_id") || "missing",
    session_id: firstParam("SESSION_ID", "session_id", "response_id", "submission_id", "record_id", "oid", "participant_id", "uid", "user_id", "respondent_id", "subject_id", "js_id") || "missing",
  };
  const completionRedirectUrl = params.get("completion_url") || params.get("redirect_url") || params.get("return_url") || "";
  const sessionKey = `voice-rejection:${ids.prolific_pid}:${ids.study_id}:${ids.session_id}`;
  const storedSession = readStoredSession();
  const skipTo = (params.get("skip_to") || "").toLowerCase();
  const language = normalizeLanguage(params.get("lang") || (params.get("oid") ? "zh" : "") || storedSession.language || "en");
  const isChinese = language === "zh";
  if (isChinese) {
    document.title = "星河乐园互动任务";
  }
  const requestedCondition = normalizeCondition(params.get("condition"));
  const condition = requestedCondition || storedSession.assigned_condition || pick(conditionLabels);
  const conditionSource = requestedCondition ? "url" : (storedSession.condition_source || "random_assignment");
  const manipulationVersion = storedSession.manipulation_version ||
    (storedSession.experiment_start_time ? "constructiveness_v1" : "constructiveness_v2");
  const dataEndpoint = `${window.location.protocol === "file:" ? "http://localhost:8787" : window.location.origin}/api`;
  const apiRequestTimeoutMs = 60000;
  let responseOrder = Number(storedSession.response_order || 0);
  let allowStudyExit = false;
  let captchaConfig = null;
  let captchaConfigPromise = null;
  let turnstileScriptPromise = null;
  const forwardStageOrder = {
    human_verification: 0,
    prechat_intro: 1,
    prechat: 2,
    briefing: 3,
    manager1: 4,
    transition: 5,
    materialDecision: 6,
    lisaJohn: 7,
    manager2: 8,
    survey: 9,
    ai_check: 10,
    task_feedback: 11,
    completion: 12,
  };

  const state = {
    part: "prechat",
    lastManagerAckLine: "",
    managerAckLines: [],
    prechatAwaitingIntro: false,
    prechatIntroReceived: false,
    prechatReminderShown: false,
    prechatComplete: false,
    prechatParticipant2HasResponded: false,
    prechatSequenceRunning: false,
    prechatQueuedInputs: [],
    prechatAwaitingQuestions: false,
    prechatQuestionWindowComplete: false,
    prechatOtherParticipantsAnsweredNoQuestions: false,
    prechatParticipant2AnsweredQuestions: false,
    prechatTimers: [],
    secondPhase: "beforeProposal",
    neutralQuestionCount: 0,
    neutralNoSubstancePrompted: false,
    postSuggestionTurns: 0,
    managerAskedFollowup: false,
    managerFollowupsAsked: 0,
    managerDiscussionTurns: 0,
    managerRejected: false,
    managerRejectionRound: 0,
    managerExitPromptShown: false,
    managerExitPromptTimer: null,
    lastAiIntent: "",
    managerChatLocked: false,
    managerTurnActive: false,
    pendingManagerInput: "",
    coworkerTurnActive: false,
    pendingCoworkerInputs: [],
    decisionShown: false,
    surveyStartTime: "",
    humanCheckAnswer: "",
    humanCheckVerified: false,
    aiCheckStartTime: "",
    surveyAnswers: {},
    lastManagerShowedTyping: false,
    busy: false,
  };

  const participant = {
    prolific_pid: ids.prolific_pid,
    study_id: ids.study_id,
    session_id: ids.session_id,
    assigned_condition: condition,
    condition_source: conditionSource,
    manipulation_version: manipulationVersion,
    experiment_start_time: storedSession.experiment_start_time || timestamp(),
    experiment_end_time: storedSession.experiment_end_time || timestamp(),
    completed_prechat: storedSession.completed_prechat || "false",
    completed_initial_manager_interaction: storedSession.completed_initial_manager_interaction || "false",
    completed_transition_page: storedSession.completed_transition_page || "false",
    completed_lisa_john_interaction: storedSession.completed_lisa_john_interaction || "false",
    chose_to_bring_this_up_with_manager: storedSession.chose_to_bring_this_up_with_manager || "not_reached",
    completed_neutral_manager_followup: storedSession.completed_neutral_manager_followup || "false",
    completed_post_interaction_survey: storedSession.completed_post_interaction_survey || "false",
    survey_completion_status: storedSession.survey_completion_status || "not_reached",
    survey_start_time: storedSession.survey_start_time || "",
    survey_submit_time: storedSession.survey_submit_time || "",
    survey_page: storedSession.survey_page || "",
    survey_draft: storedSession.survey_draft || "",
    completed_ai_check: storedSession.completed_ai_check || "false",
    ai_check_start_time: storedSession.ai_check_start_time || "",
    ai_check_submit_time: storedSession.ai_check_submit_time || "",
    ai_check_stage: storedSession.ai_check_stage || "",
    ai_check_unusual_start_time: storedSession.ai_check_unusual_start_time || "",
    ai_check_unusual_submit_time: storedSession.ai_check_unusual_submit_time || "",
    ai_check_unusual_text: storedSession.ai_check_unusual_text || "",
    ai_check_who_start_time: storedSession.ai_check_who_start_time || "",
    ai_check_who_submit_time: storedSession.ai_check_who_submit_time || "",
    ai_check_who_text: storedSession.ai_check_who_text || "",
    manager_ai_suspicion: storedSession.manager_ai_suspicion || "",
    lisa_ai_suspicion: storedSession.lisa_ai_suspicion || "",
    john_ai_suspicion: storedSession.john_ai_suspicion || "",
    completion_status: storedSession.completion_status || "partial",
    forward_only_stage: storedSession.forward_only_stage || "human_verification",
    language,
  };
  const interactionBackup = Array.isArray(storedSession.interactions) ? storedSession.interactions : [];

  const likertOptions = isChinese
    ? ["非常不同意", "不同意", "既不同意也不反对", "同意", "非常同意"]
    : [
        "Strongly disagree",
        "Disagree",
        "Neither agree nor disagree",
        "Agree",
        "Strongly agree",
      ];
  const surveySections = [
    // Sections 1-3 are retrospective reports on the second manager conversation. They used to be
    // future-tense intentions ("I will...") shown after that conversation had already happened,
    // which read as a contradiction and turned the answers into after-the-fact justification.
    // Every item is worded so that a participant who raised nothing can still answer it: frequency
    // items simply attract disagreement, and the quality items are anchored to the preparation
    // phase, so no gate is needed and nobody is left missing on quality.
    {
      title: "Raising Ideas in the Second Conversation",
      // Bold red so participants cannot miss that these items are about the second conversation,
      // not the rejection they have just been asked about.
      instructionEmphasis: true,
      instruction: "The following statements are about the second conversation you had with the manager, the one after you had reviewed the customer feedback. Please indicate how much you agree with each statement about what you actually did.",
      items: [
        { id: "VF1", text: "I proposed specific improvements to the manager more than once." },
        { id: "VF2", text: "I made a point of raising new ideas about the visitor issue with the manager." },
        { id: "VF3", text: "Even when the manager seemed unresponsive, I kept putting forward my views." },
        { id: "VF4", text: "I used the opportunities in the conversation to share my ideas proactively." },
        { id: "VF5", text: "I brought my own ideas into the conversation rather than only answering the manager's questions." },
        { id: "VF6", text: "I offered my own suggestions and ideas repeatedly." },
      ],
    },
    {
      title: "Preparing Your Suggestion",
      instructionEmphasis: true,
      stemEmphasis: true,
      instruction: "The following statements are about the second conversation you had with the manager, the one after you had reviewed the customer feedback. Please indicate how much you agree with each statement about what you actually did.",
      stem: "Before the second conversation with the manager, I...",
      items: [
        { id: "VQ1", text: "tried to back what I might suggest with the information available to me, such as the entrance records, visitor comments, or location details." },
        { id: "VQ2", text: "made an effort to think through the practical concerns a manager would have, such as visitor demand, feasibility, or park operations." },
        { id: "VQ3", text: "tried to anticipate the questions or doubts the manager might raise, and how I would answer them." },
        { id: "VQ4", text: "made an effort to work out a clear, actionable course of action rather than a general idea." },
      ],
    },
    {
      title: "Perceived Reasons for Manager Response",
      instruction: "Please indicate why you think the manager rejected your suggestion about the labor plan.",
      instructionRed: true,
      stem: "The manager rejected my suggestion because...",
      groups: [
        {
          label: "Manager-related reasons",
          items: [
            { id: "MR1", text: "The manager was influenced by their emotions." },
            { id: "MR2", text: "The manager wanted to demonstrate their authority." },
            { id: "MR3", text: "The manager personally disliked me." },
          ],
        },
        {
          label: "Proposal-related reasons",
          items: [
            { id: "PR1", text: "My proposal for improvement was mediocre." },
            { id: "PR2", text: "My suggestion did not really improve the current methods or practices." },
            { id: "PR3", text: "The changes I suggested for work arrangements did not really help much." },
            { id: "PR4", text: "I made impractical recommendations about how to fix work-related problems." },
            { id: "PR5", text: "My suggestion was not very useful." },
          ],
        },
      ],
    },
    {
      title: "Perceived Tone of Manager Response",
      instruction: "Please indicate how you perceived the manager's attitude when they rejected your suggestion about the labor plan.",
      instructionRed: true,
      stem: "The manager's response was...",
      items: [
        { id: "MA1", text: "Polite" },
        { id: "MA2", text: "Courteous" },
        { id: "MA3", text: "Sensitive to my feelings" },
        { id: "MA4", text: "Respectful toward me" },
        { id: "MA5", text: "Considerate toward me" },
        { id: "MA6", text: "Appropriate" },
        { id: "MA7", text: "Civil" },
        { id: "MA8", text: "Tactful" },
      ],
    },
    {
      title: "Perceived Usefulness of Manager Response",
      instruction: "Please indicate how you perceived the manager's response when they rejected your suggestion about the labor plan.",
      instructionRed: true,
      stem: "When rejecting my suggestion, the manager...",
      items: [
        // Adapted from the destructive-criticism feedback scales to refer to the proposal rather
        // than the recipient. The original wording presupposes performance feedback about the
        // participant ("my weaknesses", "behaviors", "acceptable behavior"), but the manager is
        // instructed never to criticise the participant personally, so those items asked about
        // something the design deliberately never provides.
        { id: "MC1", text: "Pointed to specific aspects of my proposal that I could actually work on." },
        { id: "MC2", text: "Suggested that the problems with my proposal could be fixed." },
        { id: "MC3", text: "Made reference to clear, legitimate standards my proposal would have to meet." },
        { id: "MC4", text: "Was very specific and detailed." },
        { id: "MC5", text: "Made reference to specific parts of my proposal that were problematic." },
        { id: "MC6", text: "Provided clear enough guidance that I knew what to change." },
      ],
    },
    {
      title: "Manager-Related Communication Intentions A",
      instruction: "Please indicate the extent to which you agree with each statement about how you would communicate with a work colleague.",
      items: [
        { id: "NWG1", text: "I would ask a work colleague whether they had a negative impression of something that the theme park manager had done." },
        { id: "NWG2", text: "I would question the theme park manager's abilities while talking to a work colleague." },
        { id: "NWG3", text: "I would criticize the theme park manager while talking to a work colleague." },
        { id: "NWG4", text: "I would vent to a work colleague about something that the theme park manager had done." },
        { id: "NWG5", text: "I would tell a work colleague an unflattering story about the theme park manager." },
      ],
    },
    {
      title: "Manager-Related Communication Intentions B",
      instruction: "Please indicate the extent to which you agree with each statement about how you would communicate with a work colleague.",
      items: [
        { id: "PWG1", text: "I would compliment the theme park manager's actions while talking to a work colleague." },
        { id: "PWG2", text: "I would tell a work colleague good things about the theme park manager." },
        { id: "PWG3", text: "I would defend the theme park manager's actions while talking to a work colleague." },
        { id: "PWG4", text: "I would say something nice about the theme park manager while talking to a work colleague." },
        { id: "PWG5", text: "I would tell a work colleague that I respected the theme park manager." },
      ],
    },
  ];
  localizeSurveySections();

  const surveyItemIds = surveySections.flatMap((section) => getSectionItems(section).map((item) => item.id));

  const prechatBeforeIntro = [
    { speaker: "System", text: "Connecting to the online task room...", delay: 700 },
    { speaker: "System", text: "You have joined the room as Participant 2.", delay: 800 },
    { speaker: "System", text: "Session Coordinator has joined the room.", delay: 800 },
    {
      speaker: "Coordinator",
      text: [
        "Hi everyone, welcome to the task.",
        "Hi everyone, welcome in.",
        "Hello everyone, welcome in.",
      ],
      delay: 1600,
    },
    {
      speaker: "Coordinator",
      text: [
        "Thanks for joining today.",
        "Thanks for joining the session today.",
        "Thanks for being here today.",
      ],
      delay: 1000,
    },
    {
      speaker: "Coordinator",
      text: [
        "We’ll give it a moment for everyone to connect.",
        "I’ll just give everyone a moment to get connected.",
        "Let’s wait briefly while the rest of the group joins.",
      ],
      delay: 1400,
    },
    { speaker: "System", shuffleGroup: "PrechatParticipantJoin", text: "Participant 1 has joined the room.", delay: 800 },
    {
      speaker: "Coordinator",
      text: [
        "Great, looks like everyone is here.",
        "Great, it looks like both participants are here now.",
        "Thanks everyone, it looks like we have the full group.",
      ],
      delay: 1500,
    },
    {
      speaker: "Coordinator",
      text: [
        "Before we start, could everyone give a brief self-introduction? No need to share anything too personal.",
        "Before we begin, could everyone type a quick self-introduction? No need to share anything too personal.",
        "Let’s do a quick round of self-introductions first. No need to share anything too personal.",
      ],
      delay: 2100,
    },
    {
      speaker: "Participant 1",
      shuffleGroup: "PrechatParticipantIntro",
      text: [
        "Hi everyone, I’ve completed many Prolific tasks before, mostly surveys and decision tasks.",
        "Hi all, I’ve done many Prolific tasks, mostly surveys and decision tasks.",
        "Hello everyone, I’m an experienced Prolific participant, though this group chat format is less common.",
      ],
      delay: 6000,
    },
    {
      speaker: "Coordinator",
      text: [
        "Thanks. Participant 2, could you also briefly introduce yourself?",
        "Thanks. Participant 2, could you give a brief introduction as well?",
        "Thanks. Participant 2, could you type a quick introduction too?",
      ],
      delay: 4800,
      skipIfParticipant2Introduced: true,
    },
  ];

  // The task description now lives on the page before the room, where it can be read at the
  // participant's own pace, so the coordinator moves straight to the upcoming conversation format
  // and role assignment. Seven scripted turns of setup became two. Wording is deliberately looser than the rest of the script: real
  // participants in this study capitalised the first letter only 75% of the time, ended a message
  // with punctuation only 33% of the time, and dropped apostrophes in contractions in 41% of
  // messages. The coordinator carries no manipulation, so it can absorb that register safely.
  const prechatAfterIntro = [
    {
      speaker: "Coordinator",
      text: [
        "Next, the two of you will have a one on one conversation, and I’ll assign your roles before it begins.",
        "You’ll move into a one on one conversation next, and I’ll assign each of you a role first.",
        "Next, you’ll be having a one on one conversation. I’ll assign the two roles before you start.",
      ],
      delay: 1600,
    },
    {
      speaker: "Coordinator",
      text: [
        "Before I assign the roles, does anyone have any quick questions?",
        "Before the role assignment, does anyone have any quick questions?",
        "I’ll pause briefly before assigning roles. Any quick questions about the task?",
      ],
      delay: 1900,
    },
  ];

  const prechatRoleAssignment = [
    { speaker: "System", text: "Randomly assigning team roles...", delay: 900 },
    { speaker: "System", text: "Participant 1 has been assigned the role of Park Manager.", delay: 800 },
    // Being handed the lead role in silence is not what a real person does.
    {
      speaker: "Participant 1",
      text: [
        "Ok, got it.",
        "Oh, interesting.",
        "Alright, works for me.",
      ],
      delay: 2600,
    },
    { speaker: "System", text: "You, Participant 2, have been assigned the role of Operations Team Member.", delay: 900 },
    {
      speaker: "Coordinator",
      text: [
        "Next, you will be redirected to your individual role materials. After everyone finishes reading, you will enter the team chat.",
        "Next, you’ll see your individual role materials. After the reading step, you’ll move into the team chat.",
        "You’ll now be redirected to your own role materials. Once everyone has finished reading, the team chat will begin.",
      ],
      delay: 2200,
    },
    { speaker: "System", text: "You will now be redirected to your individual role materials.", delay: 900 },
  ];

  const briefingPages = [
    {
      eyebrow: "Role Materials 1 of 3",
      title: "Your Role",
      blocks: [
        { type: "p", text: "Thanks for taking part in this online customer feedback task." },
        { type: "p", text: "Today, you will act as an Operations Team Member at a theme park called Aetheria Gardens. You will work directly under a Park Manager." },
        { type: "p", text: "The operations team’s daily work includes checking tickets at the entrance, scanning QR codes, confirming visitor categories, guiding visitors into the park, and answering simple questions from visitors." },
      ],
      check: {
        question: "What is your role in the upcoming interaction?",
        correct: "operations_team",
        options: [
          { value: "manager", label: "Park Manager" },
          { value: "operations_team", label: "Operations Team Member" },
          { value: "visitor", label: "Theme park visitor" },
        ],
      },
    },
    {
      eyebrow: "Role Materials 2 of 3",
      title: "Background Information",
      blocks: [
        { type: "p", text: "Aetheria Gardens is currently facing a significant staffing challenge. Because the park relies almost exclusively on full-time, permanent employees, it is experiencing a “labor seesaw”:" },
        {
          type: "ul",
          items: [
            "Off-season: Daily attendance drops to around 500 visitors, leaving the park with a costly surplus of idle staff.",
            "Peak season: Daily attendance surges to around 5,000 visitors, leaving teams overwhelmed and shorthanded.",
          ],
        },
        { type: "p", text: "The current labor plan was developed by park management. However, this plan is not flexible enough, and labor costs are becoming increasingly difficult to manage." },
      ],
      check: {
        question: "What is the main staffing problem at Aetheria Gardens?",
        correct: "labor_seesaw",
        options: [
          { value: "labor_seesaw", label: "Too many idle staff in off-season and too few staff in peak season" },
          { value: "too_few_visitors", label: "The park has too few visitors in every season" },
          { value: "ticket_system", label: "The QR code ticket system is broken" },
        ],
      },
    },
    {
      eyebrow: "Role Materials 3 of 3",
      title: "Your Possible Suggestion",
      blocks: [
        { type: "p", text: "You believe the theme park must adopt a more agile employment model in order to survive." },
        { type: "p", text: "For example, the park could use temporary staff and interns to manage high-volume attendance surges, or convert part of the current permanent workforce into a flexible labor pool to better align staffing levels with fluctuating demand." },
        { type: "p", text: "Although proposing labor-related changes is not required by your role, you still want to suggest a change to the current procedure in order to improve the theme park’s performance." },
        { type: "p", text: "You may propose adopting a more flexible employment model to the manager. Please note that the current labor plan has already been agreed upon by the theme park’s management team, so proposing changes would mean raising a significant challenge to the current approach." },
        { type: "p", text: "Now, you are about to enter an online chat with your manager." },
      ],
      check: {
        question: "What suggestion may you bring up with the manager?",
        correct: "flexible_labor",
        options: [
          { value: "flexible_labor", label: "A flexible labor model using options such as temporary staff, interns, or a flexible labor pool" },
          { value: "raise_prices", label: "Raising ticket prices during peak season" },
          { value: "new_rides", label: "Building new rides for families" },
        ],
      },
    },
  ];

  const transitionPages = [
    {
      eyebrow: "Materials 1 of 3",
      title: "Off-Season Situation",
      blocks: [
        {
          text: "Now, please continue reading your materials. These materials describe the theme park's off-season situation.",
          html: "Now, please continue reading your materials. These materials describe the theme park's <strong>off-season situation</strong>.",
        },
        {
          text: "On a typical off-season weekday, the park receives around 500 visitors.",
          html: "On a typical off-season weekday, the park receives <strong>around 500 visitors</strong>.",
        },
        {
          text: "The entrance is quiet for long periods, and staff members at the gate have relatively little work to do.",
          html: "The entrance is quiet for long periods, and staff members at the gate have <strong>relatively little work to do</strong>.",
        },
      ],
    },
    {
      eyebrow: "Materials 2 of 3",
      title: "Visitor Pattern",
      blocks: [
        {
          text: "Most visitors are families with young children. Families with children under 10 account for around 70% to 75% of daily visitors, while other visitor groups make up a much smaller share.",
          html: "Most visitors are <strong>families with young children</strong>. Families with children under 10 account for <strong>around 70% to 75%</strong> of daily visitors, while other visitor groups make up a much smaller share.",
        },
        {
          text: "Aetheria Gardens is far from the city center, and many families say the location is not very convenient.",
          html: "Aetheria Gardens is <strong>far from the city center</strong>, and many families say the location is <strong>not very convenient</strong>.",
        },
      ],
    },
    {
      eyebrow: "Materials 3 of 3",
      title: "Nearby Visitors",
      blocks: [
        {
          text: "There are several universities and farms near the theme park, including 4 universities within 10 to 18 km and around 38,000 nearby university students.",
          html: "There are several universities and farms <strong>near the theme park</strong>, including <strong>4 universities within 10 to 18 km</strong> and <strong>around 38,000 nearby university students</strong>.",
        },
        {
          text: "Some university students say the park is cute, but it feels mainly designed for little kids. Others mention that student discounts or more photo-friendly spots might make the park more attractive to students.",
          html: "Some university students say the park is cute, but it feels mainly <strong>designed for little kids</strong>. Others mention that <strong>student discounts</strong> or <strong>more photo-friendly spots</strong> might make the park more attractive to students.",
        },
        {
          text: "After reviewing this situation, you will continue to a second conversation with the manager.",
          html: "After reviewing this situation, you will continue to a <strong>second conversation with the manager</strong>.",
        },
      ],
    },
  ];
  localizeStudyMaterials();

  let messagesEl = null;
  let composerEl = null;
  let inputEl = null;

  async function renderHumanVerification() {
    markForwardStage("human_verification");
    state.part = "human_verification";
    state.humanCheckVerified = false;
    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("Quick Verification", "快速确认"))}</h1>
        <p>${escapeHtml(inZh("Loading verification check...", "正在加载验证检查..."))}</p>
      </article>
    `;

    const config = await getCaptchaConfig();
    if (config.provider === "turnstile" && config.siteKey) {
      renderTurnstileVerification(config.siteKey);
      return;
    }

    renderMathVerification();
  }

  function renderMathVerification() {
    const humanCheckNumbers = [randomBetween(2, 8), randomBetween(2, 8)];
    state.humanCheckAnswer = String(humanCheckNumbers[0] + humanCheckNumbers[1]);
    saveParticipant();
    recordInteraction("human_verification", "system", "Quick verification page displayed.", "");

    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("Quick Verification", "快速确认"))}</h1>
        <p>${escapeHtml(inZh("Please complete this quick check before entering the task.", "进入任务前，请先完成这个小检查。"))}</p>
        <form id="human-check-form" class="human-check" novalidate>
          <label for="human-check-answer">${escapeHtml(inZh(`What is ${humanCheckNumbers[0]} + ${humanCheckNumbers[1]}?`, `${humanCheckNumbers[0]} + ${humanCheckNumbers[1]} 等于多少？`))}</label>
          <div class="human-check-row">
            <input id="human-check-answer" name="human_check_answer" inputmode="numeric" autocomplete="off" required>
            <button class="button" type="submit">${escapeHtml(inZh("Continue", "继续"))}</button>
          </div>
          <p class="validation-message" id="human-check-validation" aria-live="polite"></p>
        </form>
      </article>
    `;

    document.getElementById("human-check-form").addEventListener("submit", handleHumanCheckSubmit);
  }

  function renderTurnstileVerification(siteKey) {
    saveParticipant();
    recordInteraction("human_verification", "system", "CAPTCHA verification page displayed.", "");

    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("Quick Verification", "快速确认"))}</h1>
        <p>${escapeHtml(inZh("Please complete this quick check before entering the task.", "进入任务前，请先完成这个小检查。"))}</p>
        <form id="human-check-form" class="human-check" novalidate>
          <div id="turnstile-widget" class="captcha-widget"></div>
          <button class="button" type="submit" id="human-check-submit">${escapeHtml(inZh("Continue", "继续"))}</button>
          <p class="validation-message" id="human-check-validation" aria-live="polite"></p>
        </form>
      </article>
    `;

    document.getElementById("human-check-form").addEventListener("submit", handleHumanCheckSubmit);
    loadTurnstileScript()
      .then(() => {
        if (!window.turnstile || state.part !== "human_verification") return;
        window.turnstile.render("#turnstile-widget", {
          sitekey: siteKey,
        });
      })
      .catch(() => {
        const validation = document.getElementById("human-check-validation");
        if (validation) {
          validation.textContent = inZh("The verification check could not load. Please refresh and try again.", "验证检查无法加载。请刷新后重试。");
        }
      });
  }

  async function handleHumanCheckSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const validation = document.getElementById("human-check-validation");
    const button = document.getElementById("human-check-submit") || form.querySelector("button[type='submit']");

    if (captchaConfig && captchaConfig.provider === "turnstile") {
      const token = getTurnstileToken(form);
      if (!token) {
        validation.textContent = inZh("Please complete the verification check before continuing.", "请先完成验证检查再继续。");
        return;
      }

      if (button) button.disabled = true;
      validation.textContent = inZh("Checking verification...", "正在检查验证...");
      const verified = await verifyTurnstileToken(token);
      if (!verified) {
        validation.textContent = inZh("The verification check did not pass. Please try again.", "验证未通过。请再试一次。");
        if (window.turnstile) window.turnstile.reset("#turnstile-widget");
        if (button) button.disabled = false;
        recordInteraction("human_verification", "system", "CAPTCHA verification failed.", "");
        return;
      }

      state.humanCheckVerified = true;
      recordInteraction("human_verification", "system", "CAPTCHA verification completed.", "");
      renderPreRoomIntro();
      return;
    }

    const answer = (form.elements.human_check_answer.value || "").trim();

    if (answer !== state.humanCheckAnswer) {
      validation.textContent = inZh("Please check your answer and try again.", "请检查答案后再试一次。");
      recordInteraction("human_verification", "system", "Quick verification answer was incorrect.", "");
      return;
    }

    state.humanCheckVerified = true;
    recordInteraction("human_verification", "system", "Quick verification completed.", "");
    renderPreRoomIntro();
  }

  async function getCaptchaConfig() {
    if (captchaConfig) return captchaConfig;
    if (!captchaConfigPromise) {
      captchaConfigPromise = fetchWithTimeout(`${dataEndpoint}/captcha-config`, {}, 8000)
        .then((response) => response.ok ? response.json() : null)
        .then((config) => {
          captchaConfig = config && config.provider ? config : { provider: "math", siteKey: "" };
          return captchaConfig;
        })
        .catch(() => {
          captchaConfig = { provider: "math", siteKey: "" };
          return captchaConfig;
        });
    }
    return captchaConfigPromise;
  }

  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-turnstile-script]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
    return turnstileScriptPromise;
  }

  function getTurnstileToken(form) {
    const tokenField = form.querySelector('input[name="cf-turnstile-response"]');
    return tokenField ? tokenField.value.trim() : "";
  }

  async function verifyTurnstileToken(token) {
    try {
      const response = await fetchWithTimeout(`${dataEndpoint}/verify-captcha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }, 15000);
      const result = await response.json().catch(() => ({}));
      return response.ok && result.ok === true;
    } catch (error) {
      return false;
    }
  }

  function renderPreRoomIntro() {
    markForwardStage("prechat_intro");
    state.part = "prechat_intro";
    clearPrechatTimers();
    saveParticipant();
    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("Online Customer Feedback Task", "任务介绍"))}</h1>
        <p>${escapeHtml(inZh("Thanks for taking part. This task is run by a market research company that helps its clients improve how they operate and serve customers.", "感谢你参与本次任务。本次任务由一家市场调研公司组织，该公司帮助客户改进运营和服务。"))}</p>
        <p>${escapeHtml(inZh("You and one other participant will discuss how a theme park could improve its service.", "你将和另一位参与者一起讨论：一个主题乐园可以如何改进服务。"))}</p>
        <form id="pre-room-check-form" class="comprehension-check" novalidate>
          <fieldset>
            <legend>${escapeHtml(inZh("What is this online task mainly about?", "这个在线任务主要关于什么？"))}</legend>
            <div class="choice-list">
              <label class="choice-option">
                <input type="radio" name="pre_room_check" value="customer_feedback">
                ${escapeHtml(inZh("Reviewing customer feedback and service improvement issues", "了解顾客反馈和服务改进问题"))}
              </label>
              <label class="choice-option">
                <input type="radio" name="pre_room_check" value="personal_profile">
                ${escapeHtml(inZh("Sharing detailed personal background information", "分享详细的个人背景信息"))}
              </label>
            </div>
          </fieldset>
          <p class="check-error" id="pre-room-check-error" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit" id="enter-prechat">${escapeHtml(inZh("Continue", "继续"))}</button>
          </div>
        </form>
      </article>
    `;
    document.getElementById("pre-room-check-form").addEventListener("submit", handlePreRoomCheckSubmit);
  }

  function handlePreRoomCheckSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = document.getElementById("pre-room-check-error");
    const selected = form.elements.pre_room_check.value;

    if (!selected) {
      error.textContent = inZh("Please choose one answer before continuing.", "请先选择一个答案。");
      return;
    }

    if (selected !== "customer_feedback") {
      error.textContent = inZh("Please review the information above and try again.", "请再看一下上面的信息，然后重新作答。");
      recordInteraction("prechat_intro", "system", "Pre-room task check answer was incorrect.", "");
      return;
    }

    recordInteraction("prechat_intro", "system", "Pre-room task check completed.", "");
    renderPreRoomProcedure();
  }

  // Second half of the pre-room briefing. Splitting it keeps each page to a couple of paragraphs:
  // this one is what will happen, the previous one is what the task is.
  function renderPreRoomProcedure() {
    markForwardStage("prechat_intro");
    state.part = "prechat_intro";
    clearPrechatTimers();
    saveParticipant();
    recordInteraction("prechat_intro", "system", "Pre-room procedure page displayed.", "");
    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("How the Task Will Work", "任务流程"))}</h1>
        <p>${escapeHtml(inZh("You will join an online task room with the other participant and a session coordinator.", "你将和另一位参与者、以及一位任务协调员一起进入在线聊天室。"))}</p>
        <p>${escapeHtml(inZh("Roles are assigned randomly: one park manager, one operations team member. You will then read your own role materials before the discussion starts.", "角色随机分配：一人担任乐园经理，一人担任运营团队成员。讨论开始前，你会先阅读属于自己角色的材料。"))}</p>
        <p>${escapeHtml(inZh("Once the task starts, please keep this browser tab open until you finish. Reply in the chat in your own words.", "任务开始后，请保持此浏览器标签页打开，直到任务结束。请用自己的话在聊天中作答。"))}</p>
        <div class="actions">
          <button class="button" type="button" id="enter-task-room">${escapeHtml(inZh("Continue", "继续"))}</button>
        </div>
      </article>
    `;
    document.getElementById("enter-task-room").addEventListener("click", () => {
      recordInteraction("prechat_intro", "system", "Pre-room procedure page completed.", "");
      renderPrechat();
    });
  }

  async function renderPrechat() {
    markForwardStage("prechat");
    state.part = "prechat";
    state.prechatAwaitingIntro = false;
    state.prechatIntroReceived = false;
    state.prechatReminderShown = false;
    state.prechatComplete = false;
    state.prechatParticipant2HasResponded = false;
    state.prechatSequenceRunning = false;
    state.prechatQueuedInputs = [];
    state.prechatAwaitingQuestions = false;
    state.prechatQuestionWindowComplete = false;
    state.prechatOtherParticipantsAnsweredNoQuestions = false;
    state.prechatParticipant2AnsweredQuestions = false;
    clearPrechatTimers();
    saveParticipant();
    createChat(inZh("Online Task Room", "在线聊天室"), inZh("Connecting...", "正在连接..."), true);
    setComposerEnabled(true);
    state.prechatSequenceRunning = true;
    await runPrechatSequence(prechatBeforeIntro);
    state.prechatSequenceRunning = false;
    state.prechatAwaitingIntro = true;
    setStatus(inZh("Waiting for Participant 2", "等待参与者2"));
    setComposerEnabled(true);
    if (state.prechatQueuedInputs.length) {
      handlePrechatInput(state.prechatQueuedInputs.shift());
    } else {
      schedulePrechatReminder();
    }
  }

  function renderBriefing(pageIndex = 0) {
    markForwardStage("briefing");
    if (typeof pageIndex !== "number") pageIndex = 0;
    const page = briefingPages[pageIndex] || briefingPages[0];
    state.part = "briefing";
    clearPrechatTimers();
    screen.innerHTML = `
      <article class="page briefing-page">
        <p class="briefing-progress">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.title)}</h1>
        ${renderBriefingBlocks(page.blocks)}
        <form class="comprehension-check" id="briefing-check-form" novalidate>
          <fieldset>
            <legend>${escapeHtml(page.check.question)}</legend>
            <div class="choice-list">
              ${page.check.options.map((option) => `
                <label class="choice-option">
                  <input type="radio" name="briefing-check" value="${escapeHtml(option.value)}">
                  <span>${escapeHtml(option.label)}</span>
                </label>
              `).join("")}
            </div>
          </fieldset>
          <p class="check-error" id="briefing-check-error" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit">${escapeHtml(pageIndex === briefingPages.length - 1 ? inZh("Start Chat", "开始聊天") : inZh("Next", "下一步"))}</button>
          </div>
        </form>
      </article>
    `;
    document.getElementById("briefing-check-form").addEventListener("submit", (event) => {
      handleBriefingCheck(event, pageIndex);
    });
  }

  function renderBriefingBlocks(blocks) {
    return blocks.map((block) => {
      if (block.type === "ul") {
        return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      }
      return `<p>${escapeHtml(block.text)}</p>`;
    }).join("");
  }

  function handleBriefingCheck(event, pageIndex) {
    event.preventDefault();
    const page = briefingPages[pageIndex];
    const form = event.currentTarget;
    const error = document.getElementById("briefing-check-error");
    const selected = form.querySelector('input[name="briefing-check"]:checked');
    if (!selected) {
      error.textContent = inZh("Please choose one answer before continuing.", "请先选择一个答案。");
      return;
    }
    if (selected.value !== page.check.correct) {
      error.textContent = inZh("Please review the information above and try again.", "请再看一下上面的信息，然后重新作答。");
      return;
    }
    if (pageIndex < briefingPages.length - 1) {
      renderBriefing(pageIndex + 1);
      return;
    }
    renderManagerChat();
  }

  async function renderManagerChat() {
    markForwardStage("manager1");
    state.part = "manager1";
    state.managerChatLocked = false;
    state.managerAskedFollowup = false;
    state.managerFollowupsAsked = 0;
    state.managerDiscussionTurns = 0;
    state.managerRejected = false;
    state.managerRejectionRound = 0;
    state.managerExitPromptShown = false;
    clearManagerExitPromptTimer();
    state.lastAiIntent = "";
    saveParticipant();
    createChat(inZh("Manager Chat", "经理聊天室"), inZh("Manager online", "经理在线"), true);
    // The acknowledgement lines are generated once per session. Fetching them here, while the
    // opening plays, means the first "give me a moment" is not delayed by generating its own
    // wording: measured, that delay put the line at 12 s after the send instead of about 8.
    loadManagerAckLines();
    state.managerTurnActive = true;
    // The role assignment was already announced in the task room and acknowledged there, so
    // re-introducing it here reads as a script restart rather than the same person continuing.
    // The evaluation and pay content is the power manipulation: its substance stays fixed, but it
    // is phrased the way a manager types in chat rather than as an announcement. "Compensation"
    // was dropped because in a workplace it reads as salary, which left participants unsure whether
    // the stake was the character's wages or their own payment for the task; "what you get paid for
    // this task" holds inside and outside the fiction. These three lines precede the manipulation,
    // so they carry no face work in either direction. No dashes: cleanAiDisplayText strips them.
    await sendDelayed("Manager", "manager", inZh(
      "Hi again. I'm the park manager now, so I'll be the one rating how you do as an Operations Team Member.",
      "你好，又见面了。现在由我来做公园经理，所以你作为运营团队成员表现如何，由我来评。"
    ), null, { opening: true });
    await sendDelayed("Manager", "manager", inZh(
      "That rating can affect what you get paid for this task.",
      "这个评分会影响你做这个任务拿到的报酬。"
    ), null, { opening: true });
    // The market research framing was already given by the coordinator in the task room, and a
    // manager who is supposedly just another participant would not explain the sponsor's goals.
    await sendDelayed("Manager", "manager", inZh(
      "So, from what you've read so far, what do you think the park should do?",
      "那么，根据你目前看到的这些，你觉得乐园应该怎么做？"
    ), null, { opening: true });
    finishManagerTurn();
  }

  function createChat(title, status, canType) {
    screen.innerHTML = `
      <section class="chat">
        <header class="chat-header">
          <h1 class="chat-title">${escapeHtml(title)}</h1>
          <span class="status" id="chat-status">${escapeHtml(status)}</span>
        </header>
        <div class="messages" id="messages" aria-live="polite"></div>
        <form class="composer" id="composer">
          <textarea id="chat-input" rows="2" placeholder="${escapeHtml(inZh("Type your message...", "请输入你的消息..."))}" ${canType ? "" : "disabled"}></textarea>
          <button class="button" type="submit" ${canType ? "" : "disabled"}>${escapeHtml(inZh("Send", "发送"))}</button>
        </form>
      </section>
    `;
    messagesEl = document.getElementById("messages");
    composerEl = document.getElementById("composer");
    inputEl = document.getElementById("chat-input");
    composerEl.addEventListener("submit", handleSubmit);
  }

  // Local QA shortcut: skip the study setup and the manager's neutral follow-up rounds. The
  // tester still types the proposal freely, and that first message is sent straight to the
  // condition-bearing rejection generator so the feedback remains grounded in the actual idea.
  async function renderManagerRejectionTest() {
    markForwardStage("manager1");
    state.part = "manager1";
    state.managerChatLocked = false;
    state.managerAskedFollowup = false;
    state.managerFollowupsAsked = 3;
    state.managerDiscussionTurns = 0;
    state.managerRejected = false;
    state.managerRejectionRound = 0;
    state.managerExitPromptShown = false;
    clearManagerExitPromptTimer();
    state.lastAiIntent = "";
    saveParticipant();
    createChat(inZh("Manager Chat", "经理聊天室"), inZh("Manager online", "经理在线"), true);
    loadManagerAckLines();
    state.managerTurnActive = true;
    await sendDelayed("Manager", "manager", inZh(
      "So, from what you've read so far, what do you think the park should do?",
      "那么，根据你目前看到的这些，你觉得乐园应该怎么做？"
    ), null, { immediate: true });
    finishManagerTurn();
  }

  function renderRestoredChatRoom(stage) {
    const chatMeta = restoredChatMeta(stage);
    state.part = stage;
    createChat(chatMeta.title, inZh("Chat restored after refresh", "刷新后已恢复聊天记录"), false);
    if (inputEl) {
      inputEl.placeholder = inZh("Chat restored after refresh", "刷新后已恢复聊天记录");
    }
    const restoreMessage = inZh(
      "Please continue from the current task room. Your previous chat messages are shown below.",
      "请继续留在当前聊天室。你之前的聊天记录显示在下方。"
    );
    showRestoreModal(restoreMessage, () => {
      setStatus(restoredChatStatus(stage));
      if (inputEl) inputEl.placeholder = inZh("Type your message...", "请输入你的消息...");
      setComposerEnabled(true);
    });
    addRestoredNotice(restoreMessage);
    const rows = restoredChatRows(stage);
    if (!rows.length) {
      addRestoredNotice(inZh("No previous chat messages were found for this task room.", "没有找到这个聊天室之前的聊天记录。"));
      return;
    }
    rows.forEach(addRestoredChatRow);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function restoredChatMeta(stage) {
    if (stage === "prechat") return { title: inZh("Online Task Room", "在线聊天室") };
    if (stage === "manager1" || stage === "manager2") return { title: inZh("Manager Chat", "经理聊天室") };
    if (stage === "lisaJohn") return { title: inZh("Coworker Chat", "同事聊天室") };
    return { title: inZh("Chat Room", "聊天室") };
  }

  function restoredChatStatus(stage) {
    if (stage === "prechat") return inZh("Waiting for Participant 2", "等待参与者2");
    if (stage === "manager1" || stage === "manager2") return inZh("Manager online", "经理在线");
    if (stage === "lisaJohn") return inZh("Coworkers online", "同事在线");
    return inZh("Online", "在线");
  }

  function restoredChatStageNames(stage) {
    if (stage === "prechat") return ["prechat"];
    if (stage === "manager1") return ["initial_manager_interaction"];
    if (stage === "lisaJohn") return ["lisa_john_interaction", "decision_prompt"];
    if (stage === "manager2") return ["neutral_manager_followup"];
    return [];
  }

  function restoredChatRows(stage) {
    const stageNames = restoredChatStageNames(stage);
    return interactionBackup
      .filter((row) => row && stageNames.includes(row.stage) && row.message)
      .sort((a, b) => Number(a.response_order || 0) - Number(b.response_order || 0));
  }

  function addRestoredNotice(text) {
    const notice = document.createElement("div");
    notice.className = "restore-notice";
    notice.textContent = text;
    messagesEl.appendChild(notice);
  }

  function showRestoreModal(text, onContinue) {
    const existing = document.querySelector(".restore-modal-backdrop");
    if (existing) existing.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "restore-modal-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "restore-modal-title");
    backdrop.innerHTML = `
      <div class="restore-modal">
        <h2 id="restore-modal-title">${escapeHtml(inZh("Chat Restored", "聊天记录已恢复"))}</h2>
        <p>${escapeHtml(text)}</p>
        <button class="button" type="button" id="restore-modal-continue">${escapeHtml(inZh("Continue", "继续"))}</button>
      </div>
    `;
    document.body.appendChild(backdrop);
    const button = document.getElementById("restore-modal-continue");
    button.addEventListener("click", () => {
      backdrop.remove();
      if (typeof onContinue === "function") onContinue();
    });
    button.focus();
  }

  function addRestoredChatRow(row) {
    const speaker = restoredSpeakerLabel(row.speaker);
    const message = cleanVisibleNames(row.message);
    if (speaker === "System") {
      const note = document.createElement("p");
      note.className = "system-note";
      note.textContent = message;
      messagesEl.appendChild(note);
      return;
    }
    const className = speakerClassName(speaker);
    const messageRow = document.createElement("div");
    messageRow.className = `message-row ${className}`;
    messageRow.dataset.speaker = speaker;
    messageRow.dataset.message = message;
    messageRow.innerHTML = `
      <div class="bubble">
        <span class="speaker">${escapeHtml(displaySpeakerName(speaker))}</span>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
    messagesEl.appendChild(messageRow);
  }

  function restoredSpeakerLabel(speaker) {
    const normalized = String(speaker || "").toLowerCase().trim();
    if (normalized === "system") return "System";
    if (normalized === "alex" || normalized === "you") return "You";
    if (normalized === "participant 1") return "Participant 1";
    if (normalized === "participant 2") return "Participant 2";
    if (normalized === "participant 3") return "Participant 3";
    if (normalized === "manager") return "Manager";
    if (normalized === "coordinator" || normalized === "ra" || normalized === "research assistant") return "Coordinator";
    if (normalized === "coworker 1" || normalized === "lisa") return "Coworker 1";
    if (normalized === "coworker 2" || normalized === "john") return "Coworker 2";
    return normalizeAiSpeaker(speaker);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (state.part === "manager1" && state.managerChatLocked) return;
    if (!inputEl || !inputEl.value.trim()) return;
    if (state.busy && state.part !== "prechat" && state.part !== "manager1" && state.part !== "lisaJohn" && state.part !== "manager2") return;
    const text = inputEl.value.trim();
    inputEl.value = "";
    if (state.part === "manager1" && state.managerRejected) {
      removeManagerExitPrompt();
      clearManagerExitPromptTimer();
    }
    if (state.part === "prechat") {
      addMessage("Participant 2", "alex", text);
      handlePrechatInput(text);
      return;
    }

    addMessage("You", "alex", text);

    if (state.part === "manager1" && state.managerTurnActive) {
      state.pendingManagerInput = state.pendingManagerInput ? `${state.pendingManagerInput}\n${text}` : text;
      return;
    }

    if (state.part === "manager2" && state.managerTurnActive) {
      state.pendingManagerInput = state.pendingManagerInput ? `${state.pendingManagerInput}\n${text}` : text;
      return;
    }

    if (state.part === "lisaJohn" && state.coworkerTurnActive) {
      state.pendingCoworkerInputs.push(text);
      return;
    }

    if (state.part === "manager1") handleManagerInput(text);
    if (state.part === "lisaJohn") handleLisaJohnInput(text);
    if (state.part === "manager2") handleNeutralManagerInput(text);
  }

  async function handlePrechatInput(text) {
    if (state.prechatComplete) return;
    state.prechatParticipant2HasResponded = true;

    if (state.prechatSequenceRunning) {
      state.prechatQueuedInputs.push(text);
      return;
    }

    if (state.prechatAwaitingIntro && !state.prechatIntroReceived) {
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
      const introIntent = await getChatIntent("prechat", "intro", text);
      if (introIntent === "unknown") {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        setApiConnectionIssue();
        schedulePrechatReminder();
        return;
      }
      if (introIntent === "intro") {
        await continueAfterPrechatIntro();
        return;
      }
      if (introIntent === "question") {
        const sent = await sendAiMessages({
          stage: "prechat",
          phase: "question",
          alexMessage: text,
        });
        if (!sent) {
          state.prechatSequenceRunning = false;
          setComposerEnabled(true);
          schedulePrechatReminder();
          return;
        }
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        if (state.prechatQueuedInputs.length) {
          handlePrechatInput(state.prechatQueuedInputs.shift());
        } else {
          schedulePrechatReminder();
        }
        return;
      }
      state.prechatSequenceRunning = false;
      setComposerEnabled(true);
      if (!state.prechatReminderShown) {
        schedulePrechatReminder();
      }
      return;
    }

    if (state.prechatAwaitingQuestions && !state.prechatQuestionWindowComplete) {
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
      const questionIntent = await getChatIntent("prechat", "question", text);
      if (questionIntent === "unknown") {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        setApiConnectionIssue();
        return;
      }
      if (questionIntent === "no_question") {
        state.prechatParticipant2AnsweredQuestions = true;
        setComposerEnabled(false);
        setStatus(inZh("Assigning roles", "正在分配角色"));
        await continueAfterPrechatQuestions();
        return;
      }
      if (questionIntent === "other") {
        await sendPrechatParticipant2QuestionPrompt();
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        return;
      }
      state.prechatParticipant2AnsweredQuestions = true;
      const sent = await sendAiMessages({
        stage: "prechat",
        phase: "question",
        alexMessage: text,
      });
      if (!sent) {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        return;
      }
      await sendPrechatParticipant2MoreQuestionsPrompt();
      state.prechatSequenceRunning = false;
      setComposerEnabled(true);
      return;
    }

    state.prechatSequenceRunning = true;
    const sent = await sendAiMessages({
      stage: "prechat",
      phase: "question",
      alexMessage: text,
    });
    state.prechatSequenceRunning = false;
    if (!state.prechatComplete) setComposerEnabled(true);
  }

  async function continueAfterPrechatIntro() {
    if (state.prechatIntroReceived || state.prechatComplete) return;
    state.prechatIntroReceived = true;
    state.prechatAwaitingIntro = false;
    clearPrechatTimers();
    state.prechatSequenceRunning = true;
    // Participant 1 used to go silent the moment the participant introduced themselves, which is
    // the clearest tell that nobody else is in the room. A short peer reaction carries no task
    // content and cannot touch the manipulation.
    await sendPrechatMessage({
      speaker: "Participant 1",
      text: [
        inZh("Nice to meet you.", "你好呀"),
        inZh("Hi, good to meet you.", "你好，很高兴认识你"),
        inZh("Same here, first time doing a group one.", "你好，我也是第一次做这种多人的"),
      ],
      delay: 3200,
    });
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        inZh("Great, good to have you both. We’ll keep moving.", "好的，两位都在，我们继续。"),
        inZh("Thanks both. Let’s keep moving.", "谢谢两位，我们继续。"),
        inZh("Great, everyone. We’ll keep moving.", "好的，我们继续。"),
      ],
      delay: 1200,
    });
    await runPrechatSequence(prechatAfterIntro);
    await answerQueuedPrechatInputs();
    state.prechatSequenceRunning = false;
    openPrechatQuestionWindow();
  }

  async function runPrechatSequence(sequence) {
    for (let index = 0; index < sequence.length; index += 1) {
      const item = sequence[index];
      if (item.shuffleGroup) {
        const group = [];
        while (index < sequence.length && sequence[index].shuffleGroup === item.shuffleGroup) {
          group.push(sequence[index]);
          index += 1;
        }
        index -= 1;
        for (const groupedItem of shuffled(group, item.shuffleGroup)) {
          await sendPrechatMessage(groupedItem);
        }
        continue;
      }
      if (item.skipIfParticipant2Introduced && hasQueuedPrechatIntro()) continue;
      await sendPrechatMessage(item);
    }
  }

  function shuffled(items, groupName = "") {
    const avoidOriginalOrder = ["prechatParticipantJoin", "prechatParticipantIntro", "prechatNoQuestions"].includes(groupName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
      }
      if (!avoidOriginalOrder || !sameOrder(copy, items)) return copy;
    }
    return [...items.slice(1), items[0]];
  }

  function sameOrder(first, second) {
    return first.length === second.length && first.every((item, index) => item === second[index]);
  }

  function hasQueuedPrechatIntro() {
    return state.prechatQueuedInputs.length > 0;
  }

  // `abortIf` is re-checked after the typing delay, not just before it. A prompt can spend fifteen
  // seconds "typing" while the participant answers, and without the second check it still lands:
  // 17% of pilot sessions were asked to "type a quick hello" straight after introducing themselves.
  async function sendPrechatMessage(item) {
    const text = resolvePrechatText(item.text);
    const totalDelay = prechatMessageDelay(item, text);
    if (item.speaker !== "System") {
      await showTypingBeforeMessage(item.speaker, speakerClassName(item.speaker), text, totalDelay, {
        preTypingDelay: item.preTypingDelay,
      });
    } else {
      await delay(totalDelay);
    }
    if (typeof item.abortIf === "function" && item.abortIf()) return false;
    addPrechatMessage(item.speaker, text);
    return true;
  }

  function resolvePrechatText(text) {
    return Array.isArray(text) ? pick(text) : text;
  }

  function addPrechatMessage(speaker, text) {
    if (speaker === "System") {
      addSystemNote(text);
      return;
    }
    addMessage(speaker, speakerClassName(speaker), text);
  }

  function schedulePrechatReminder() {
    clearPrechatTimers();
    const introStillPending = () =>
      !state.prechatAwaitingIntro || state.prechatIntroReceived || state.prechatComplete;
    const reminder = window.setTimeout(async () => {
      if (introStillPending()) return;
      state.prechatReminderShown = true;
      const shown = await sendPrechatMessage({ speaker: "Coordinator", text: inZh("Participant 2, could you please type a quick hello so we know your chat is working?", "参与者2，可以简单打个招呼吗？这样我们确认你的聊天窗口可以正常使用。"), delay: 500, abortIf: introStillPending });
      if (!shown) return;
      const continueTimer = window.setTimeout(async () => {
        if (introStillPending()) return;
        state.prechatAwaitingIntro = false;
        state.prechatSequenceRunning = true;
        await sendPrechatMessage({ speaker: "Coordinator", text: inZh("No problem, we’ll continue so the session does not get held up.", "没关系，为了不耽误大家时间，我们继续。"), delay: 1200 });
        await runPrechatSequence(prechatAfterIntro);
        await answerQueuedPrechatInputs();
        state.prechatSequenceRunning = false;
        openPrechatQuestionWindow();
      }, 14000);
      state.prechatTimers.push(continueTimer);
    }, 18000);
    state.prechatTimers.push(reminder);
  }

  function openPrechatQuestionWindow() {
    state.prechatAwaitingQuestions = true;
    state.prechatQuestionWindowComplete = false;
    state.prechatOtherParticipantsAnsweredNoQuestions = false;
    state.prechatParticipant2AnsweredQuestions = false;
    setStatus(inZh("Waiting for questions", "等待提问"));
    setComposerEnabled(true);
    clearPrechatTimers();
    // Same staleness risk as the introduction reminder: these prompts spend seconds "typing" and
    // must not land after the participant has already answered.
    const questionsSettled = () =>
      !state.prechatAwaitingQuestions || state.prechatQuestionWindowComplete || state.prechatComplete;
    const participant1Timer = window.setTimeout(async () => {
      if (questionsSettled()) return;
      state.prechatSequenceRunning = true;
      await sendPrechatNoQuestionMessages(questionsSettled);
      if (state.prechatQueuedInputs.length) {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        handlePrechatInput(state.prechatQueuedInputs.shift());
        return;
      }
      state.prechatSequenceRunning = false;
      setComposerEnabled(true);
      const participant2PromptTimer = window.setTimeout(async () => {
        if (questionsSettled()) return;
        state.prechatSequenceRunning = true;
        if (state.prechatQueuedInputs.length) {
          state.prechatSequenceRunning = false;
          setComposerEnabled(true);
          handlePrechatInput(state.prechatQueuedInputs.shift());
          return;
        }
        if (!state.prechatParticipant2AnsweredQuestions) {
          await sendPrechatParticipant2QuestionPrompt(
            () => questionsSettled() || state.prechatParticipant2AnsweredQuestions);
        }
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        if (state.prechatQueuedInputs.length) {
          handlePrechatInput(state.prechatQueuedInputs.shift());
        }
      }, 9000);
      state.prechatTimers.push(participant2PromptTimer);
    }, 1500);
    state.prechatTimers.push(participant1Timer);
  }

  async function sendPrechatParticipant2QuestionPrompt(abortIf) {
    await sendPrechatMessage({
      abortIf,
      speaker: "Coordinator",
      text: [
        inZh("Participant 2, do you have any quick questions before I assign the roles?", "参与者2，分配角色前，你有什么问题吗？"),
        inZh("Participant 2, any quick questions from you before I assign the roles?", "参与者2，分配角色前，你这边有什么问题吗？"),
        inZh("Participant 2, anything you want to ask before I assign the roles?", "参与者2，分配角色前，有什么想问的吗？"),
      ],
      delay: 1000,
    });
  }

  async function sendPrechatParticipant2MoreQuestionsPrompt() {
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        inZh("Do you have any other questions before I assign the roles?", "分配角色前，你还有其他问题吗？"),
        inZh("Any other quick questions before I assign the roles?", "分配角色前，还有别的问题吗？"),
        inZh("Anything else you want to ask before I assign the roles?", "分配角色前，还有什么想问的吗？"),
      ],
      delay: 1000,
    });
  }

  async function sendPrechatNoQuestionMessages(abortIf) {
    const options = {
      "Participant 1": [
        inZh("No questions from me.", "我没有问题。"),
        inZh("Nothing from me at the moment.", "我这边暂时没有问题。"),
        inZh("No questions on my side.", "我这边没有问题。"),
      ],
    };
    for (const speaker of shuffled(["Participant 1"], "prechatNoQuestions")) {
      await sendPrechatMessage({ speaker, text: options[speaker], delay: 1200, abortIf });
    }
    state.prechatOtherParticipantsAnsweredNoQuestions = true;
  }

  async function sendPrechatRoleAssignmentIntro() {
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        inZh("No problem, I’ll assign the roles now.", "好的，那我现在分配角色。"),
        inZh("Okay, I’ll go ahead and assign the roles now.", "好的，我现在开始分配角色。"),
        inZh("That’s fine. I’ll continue with the role assignment now.", "好的，那我们进入角色分配。"),
      ],
      delay: 1000,
    });
  }

  async function continueAfterPrechatQuestions() {
    if (state.prechatQuestionWindowComplete || state.prechatComplete) return;
    state.prechatQuestionWindowComplete = true;
    state.prechatAwaitingQuestions = false;
    clearPrechatTimers();
    await answerQueuedPrechatInputs();
    if (!state.prechatOtherParticipantsAnsweredNoQuestions) {
      await sendPrechatNoQuestionMessages();
    }
    await sendPrechatRoleAssignmentIntro();
    await runPrechatSequence(prechatRoleAssignment);
    finishPrechat();
  }

  function finishPrechat() {
    state.prechatSequenceRunning = false;
    state.prechatComplete = true;
    clearPrechatTimers();
    setStatus(inZh("Role materials ready", "角色材料已准备好"));
    setComposerEnabled(false);
    participant.completed_prechat = "true";
    saveParticipant();
    renderNextAction(inZh("Please click “Next” when you are ready to continue to your individual role materials.", "准备好查看你的角色材料后，请点击“下一步”。"), renderBriefing, "prechat");
  }

  function clearPrechatTimers() {
    for (const timer of state.prechatTimers || []) {
      window.clearTimeout(timer);
    }
    state.prechatTimers = [];
  }

  async function answerQueuedPrechatInputs() {
    if (!state.prechatQueuedInputs.length || state.prechatComplete) return;
    const queuedItems = state.prechatQueuedInputs.splice(0, state.prechatQueuedInputs.length);
    const queuedQuestions = [];
    for (const text of queuedItems) {
      if (await getChatIntent("prechat", "question", text) === "has_question") {
        queuedQuestions.push(text);
      }
      if (queuedQuestions.length >= 3) break;
    }
    if (!queuedQuestions.length) return;
    const queuedText = queuedQuestions.join("\n");
    const sent = await sendAiMessages({
      stage: "prechat",
      phase: "question",
      alexMessage: queuedText,
    });
    if (!sent) {
      setApiConnectionIssue();
    }
  }

  function prechatMessageDelay(item, resolvedText) {
    const floorDelay = Number(item.delay || 0);
    const naturalDelay = prechatDelayForText(item.speaker, resolvedText);
    return Math.max(floorDelay, naturalDelay);
  }

  function prechatDelayForText(speaker, text) {
    if (speaker === "System") return randomBetween(900, 1700);

    const wordCount = prechatTextUnitCount(text);
    const isParticipant = /^Participant [123]$/.test(speaker);
    const wordsPerMinute = randomBetween(40, 53);
    const typingDelay = Math.round((wordCount / wordsPerMinute) * 60000);
    const readingPause = randomBetween(1200, 2600);
    const turnTakingPause = isParticipant ? randomBetween(900, 1800) : randomBetween(500, 1400);
    const rawDelay = Math.min(32000, Math.max(3500, typingDelay + readingPause + turnTakingPause));
    return isChinese ? Math.round(rawDelay * (4 / 9)) : rawDelay;
  }

  function prechatTextUnitCount(text) {
    return chatTextUnitCount(text);
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = apiRequestTimeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  function chatTextUnitCount(text) {
    const raw = String(text || "").trim();
    if (!raw) return 0;
    if (!isChinese) return raw.split(/\s+/).filter(Boolean).length;
    const cjkChars = raw.match(/[\u3400-\u9fff]/g) || [];
    const nonCjkWords = raw.replace(/[\u3400-\u9fff]/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(cjkChars.length / 1.8) + nonCjkWords);
  }

  // Asks the server for its decision on the discussion turn before asking for the reply. The
  // decision arrives in about seven seconds; a rejection then takes a further thirty or so to
  // generate. Knowing early is what lets the manager say "give me a moment" at a human moment,
  // only on turns where a rejection is actually coming. Returns "unknown" on any failure, in
  // which case the caller falls back to the combined request and the clock-based acknowledgement.
  async function getDiscussionIntent(text) {
    try {
      const response = await fetchWithTimeout(`${dataEndpoint}/discussion-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "manager1",
          phase: "discussion",
          alexMessage: text,
          followupsAsked: state.managerFollowupsAsked,
          condition,
          language,
          prolific_pid: ids.prolific_pid,
          study_id: ids.study_id,
          session_id: ids.session_id,
          manipulation_version: manipulationVersion,
          history: recentChatHistory(),
        }),
      }, 60000);
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok && ["awaiting_proposal", "ask_followup", "reject_now"].includes(data.intent)) {
        return data.intent;
      }
    } catch (error) {
      console.warn("Unable to obtain the discussion decision.", error);
    }
    return "unknown";
  }

  async function getChatIntent(stage, phase, text) {
    try {
      const response = await fetchWithTimeout(`${dataEndpoint}/chat-intent-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          phase,
          text,
          language,
          prolific_pid: ids.prolific_pid,
          study_id: ids.study_id,
          session_id: ids.session_id,
          condition,
          manipulation_version: manipulationVersion,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok && typeof data.intent === "string") {
        return data.intent;
      }
    } catch (error) {
      console.warn("Unable to classify chat intent.", error);
    }
    return "unknown";
  }

  async function handleManagerInput(text) {
    if (state.managerChatLocked) return;
    state.managerTurnActive = true;

    if (!state.managerRejected) {
      // Backstop so the manager never chats forever, but leave real room for a
      // back-and-forth exchange before rejecting: only force the first rejection
      // once ~3 follow-ups have been asked, or the discussion has run many turns
      // without the model deciding to reject on its own.
      const reachedFollowupCap = state.managerFollowupsAsked >= 3;
      const reachedTurnCap = state.managerDiscussionTurns >= 7;
      if (reachedFollowupCap || reachedTurnCap) {
        state.managerRejected = true;
        state.managerRejectionRound = 1;
        const sent = await sendAiMessages({
          stage: "manager1",
          phase: "rejection_initial",
          condition,
          alexMessage: text,
          rejectionRound: 1,
          acknowledge: true,
        });
        if (!sent) {
          state.managerRejected = false;
          state.managerRejectionRound = 0;
        }
        finishManagerTurn();
        return;
      }

      state.lastAiIntent = "";
      state.managerDiscussionTurns += 1;
      // Decision first, reply second. The server decides once; the reply request carries that
      // decision and does not classify again, so the reply can never contradict what has already
      // been shown. If the decision request fails, the combined request is used exactly as before.
      const decision = await getDiscussionIntent(text);
      let sent;
      if (decision === "reject_now") {
        sent = await sendAiMessages({
          stage: "manager1",
          phase: "rejection_initial",
          condition,
          alexMessage: text,
          rejectionRound: 1,
          acknowledge: true,
        });
      } else if (decision === "unknown") {
        sent = await sendAiMessages({
          stage: "manager1",
          phase: "discussion",
          condition,
          alexMessage: text,
          followupsAsked: state.managerFollowupsAsked,
        });
      } else {
        sent = await sendAiMessages({
          stage: "manager1",
          phase: "discussion_neutral",
          discussionIntent: decision,
          condition,
          alexMessage: text,
          followupsAsked: state.managerFollowupsAsked,
        });
      }
      if (!sent) {
        state.managerDiscussionTurns -= 1;
        finishManagerTurn();
        return;
      }
      const intent = decision === "unknown" ? state.lastAiIntent : decision;
      if (intent === "reject_now") {
        state.managerRejected = true;
        state.managerRejectionRound = 1;
      } else if (intent === "ask_followup") {
        state.managerFollowupsAsked += 1;
      }
      finishManagerTurn();
      return;
    }

    if (state.managerRejected) {
      // Do not cap the number of rejection rounds. As long as the participant
      // still has something to explain or argue, the manager keeps responding
      // per the assigned condition. Close only when the participant accepts or
      // disengages. The high round count is purely a runaway safety net, not a
      // normal limit.
      const windDownIntent = await getChatIntent("manager1", "rejection_followup", text);
      if (windDownIntent === "unknown") {
        setApiConnectionIssue();
        finishManagerTurn();
        return;
      }
      const windDown = windDownIntent === "wind_down" || state.managerRejectionRound >= 12;
      if (windDown) {
        const sent = await sendManagerClosing({
          stage: "manager1",
          phase: "closing",
          condition,
          alexMessage: text,
        });
        if (!sent) {
          finishManagerTurn();
          return;
        }
        setStatus(inZh("Manager offline", "经理离线"));
        addSystemNote(inZh("Manager left the chat and is now offline.", "经理已离开聊天室，目前离线。"));
        lockManagerChat();
        participant.completed_initial_manager_interaction = "true";
        saveParticipant();
        renderNextAction(inZh("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", "你已完成这一部分。请点击“下一步”进入下一页。"), renderSecondMaterialsIntro, "initial_manager_interaction");
        return;
      }
      state.managerRejectionRound += 1;
      const sent = await sendAiMessages({
        stage: "manager1",
        phase: "rejection_followup",
        condition,
        alexMessage: text,
        rejectionRound: state.managerRejectionRound,
      });
      if (!sent) {
        state.managerRejectionRound -= 1;
      }
      finishManagerTurn();
      return;
    }

    finishManagerTurn();
  }

  async function completeInitialManagerInteraction(decisionText) {
    removeManagerExitPrompt();
    clearManagerExitPromptTimer();
    state.managerTurnActive = true;
    setComposerEnabled(false);
    if (decisionText) {
      recordInteraction("initial_manager_interaction", "alex", decisionText, "end_chat");
    }
    const sent = await sendManagerClosing({
      stage: "manager1",
      phase: "closing",
      condition,
      alexMessage: decisionText || "End chat and proceed",
    });
    if (!sent) {
      state.managerTurnActive = false;
      setComposerEnabled(true);
      scheduleManagerExitPrompt();
      return;
    }
    setStatus(inZh("Manager offline", "经理离线"));
    addSystemNote(inZh("Manager left the chat and is now offline.", "经理已离开聊天室，目前离线。"));
    lockManagerChat();
    participant.completed_initial_manager_interaction = "true";
    saveParticipant();
    renderNextAction(inZh("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", "你已完成这一部分。请点击“下一步”进入下一页。"), renderSecondMaterialsIntro, "initial_manager_interaction");
  }

  function renderSecondMaterialsIntro() {
    markForwardStage("transition");
    state.part = "transition";
    const title = inZh("Next Materials", "接下来的材料");
    const blocks = [
      inZh(
        "You will now read a second set of materials about the theme park situation.",
        "接下来，你会阅读第二份关于主题乐园情况的材料。"
      ),
      inZh(
        "If you see information that seems useful, you may use it in the next conversation with the manager.",
        "如果你看到有用的信息，可以在接下来的对话里和经理一起讨论。"
      ),
      inZh(
        "You may also take notes while reading, so it is easier to use the information later.",
        "你也可以一边阅读一边做一些笔记，方便之后运用这些信息。"
      ),
      inZh(
        "In the second conversation, you can discuss the second set of materials with the manager. You can also choose not to mention these materials and end the conversation quickly.",
        "在第二次对话中，你可以跟经理讨论第二份材料的内容，也可以不提这些内容，而是快速结束对话。"
      ),
    ];
    blocks.forEach((block) => recordInteraction("transition_page", "system", block, ""));
    const renderedBlocks = blocks.map((block, index) => {
      const safeBlock = escapeHtml(block);
      if (index === 2) {
        const highlighted = isChinese
          ? safeBlock.replace("一边阅读一边做一些笔记", "<strong>一边阅读一边做一些笔记</strong>")
          : safeBlock.replace("take notes while reading", "<strong>take notes while reading</strong>");
        return `<p>${highlighted}</p>`;
      }
      return `<p>${safeBlock}</p>`;
    }).join("");
    screen.innerHTML = `
      <article class="page transition-page">
        <p class="briefing-progress">${escapeHtml(inZh("Materials", "材料说明"))}</p>
        <h1>${escapeHtml(title)}</h1>
        ${renderedBlocks}
        <div class="actions">
          <button class="button" type="button" id="second-materials-intro-next">${escapeHtml(inZh("Next", "下一步"))}</button>
        </div>
      </article>
    `;
    document.getElementById("second-materials-intro-next").addEventListener("click", () => renderTransition(0));
  }

  function renderTransition(pageIndex = 0) {
    markForwardStage("transition");
    if (typeof pageIndex !== "number") {
      pageIndex = 0;
    }
    state.part = "transition";
    const page = transitionPages[pageIndex] || transitionPages[0];
    if (pageIndex === 0) {
      participant.completed_transition_page = "true";
      saveParticipant();
      for (const block of transitionPages.flatMap((transitionPage) => transitionPage.blocks)) {
        recordInteraction("transition_page", "system", block.text, "");
      }
    }
    screen.innerHTML = `
      <article class="page transition-page">
        <p class="briefing-progress">${escapeHtml(page.eyebrow)}</p>
        <h1>${escapeHtml(page.title)}</h1>
        ${renderTransitionBlocks(page.blocks)}
        <div class="actions">
          <button class="button" type="button" id="transition-next">${escapeHtml(pageIndex === transitionPages.length - 1 ? inZh("Continue", "继续") : inZh("Next", "下一步"))}</button>
        </div>
      </article>
    `;
    document.getElementById("transition-next").addEventListener("click", () => {
      if (pageIndex < transitionPages.length - 1) {
        renderTransition(pageIndex + 1);
        return;
      }
      renderMaterialManagerDecision();
    });
  }

  function renderTransitionBlocks(blocks) {
    return blocks.map((block) => `<p>${block.html}</p>`).join("");
  }

  function renderMaterialManagerDecision() {
    markForwardStage("materialDecision");
    state.part = "materialDecision";
    state.decisionShown = true;
    participant.completed_lisa_john_interaction = "skipped";
    participant.completed_neutral_manager_followup = "false";
    saveParticipant();
    const prompt = inZh(
      "If you are ready, please click Continue. You will enter the second conversation with the manager.",
      "如果你已经准备好了，请点击“继续”。你将进入和经理的第二次对话。"
    );
    const note = inZh(
      "In this second conversation, you can discuss the second set of materials with the manager. You can also choose not to mention these materials and end the conversation quickly.",
      "注意，在第二次对话中，你可以跟经理讨论第二份材料的内容，也可以不提这些内容，而是快速结束对话。"
    );
    recordInteraction("material_manager_decision", "system", prompt, "");
    recordInteraction("material_manager_decision", "system", note, "");
    screen.innerHTML = `
      <article class="page transition-page">
        <p class="briefing-progress">${escapeHtml(inZh("Next Conversation", "下一段对话"))}</p>
        <h1>${escapeHtml(inZh("Second Manager Chat", "第二次经理对话"))}</h1>
        <p>${escapeHtml(prompt)}</p>
        <p>${escapeHtml(note)}</p>
        <div class="actions">
          <button class="button" type="button" id="material-decision-continue">${escapeHtml(inZh("Continue", "继续"))}</button>
        </div>
      </article>
    `;
    document.getElementById("material-decision-continue").addEventListener("click", handleMaterialManagerContinue);
  }

  function handleMaterialManagerContinue() {
    recordInteraction("material_manager_decision", "alex", "continue", "continue");
    participant.chose_to_bring_this_up_with_manager = "continue";
    participant.completed_lisa_john_interaction = "skipped";
    participant.experiment_end_time = timestamp();
    participant.completion_status = "partial";
    saveParticipant();
    renderNeutralManagerChat();
  }

  async function renderLisaJohnChat() {
    markForwardStage("lisaJohn");
    state.part = "lisaJohn";
    state.managerChatLocked = false;
    state.managerTurnActive = false;
    state.pendingManagerInput = "";
    state.coworkerTurnActive = false;
    state.pendingCoworkerInputs = [];
    state.secondPhase = "beforeProposal";
    state.postSuggestionTurns = 0;
    state.beforeProposalTurns = 0;
    state.coworkerQueue = [];
    state.decisionShown = false;
    saveParticipant();
    createChat(inZh("Coworker Chat", "同事聊天室"), inZh("Coworkers online", "同事在线"), true);
    setComposerEnabled(true);
    state.coworkerTurnActive = true;
    await sendAiMessages({
      stage: "lisa_john",
      phase: "opening",
      mode: coworkerBothMode(),
      alexMessage: "",
    });
    finishCoworkerTurn();
    setComposerEnabled(true);
  }

  async function handleLisaJohnInput(text) {
    if (state.decisionShown) return;
    state.coworkerTurnActive = true;

    // Once headed toward the manager, walk a scripted question queue, one
    // coworker question per participant reply, then show the Yes/No prompt.
    //   Proposal path:   manager_decision -> manager_feeling -> feeling_followup
    //   No-proposal path: (issue_decision was already asked) manager_feeling -> feeling_followup
    if (state.secondPhase === "afterProposal") {
      if (!state.coworkerQueue || state.coworkerQueue.length === 0) {
        await delay(randomBetween(3000, 5000));
        state.coworkerTurnActive = false;
        state.pendingCoworkerInputs = [];
        showDecisionPrompt();
        return;
      }
      const nextPhase = state.coworkerQueue.shift();
      await sendAiMessages({
        stage: "lisa_john",
        phase: nextPhase,
        mode: coworkerSingleMode(),
        alexMessage: text,
      });
      finishCoworkerTurn();
      return;
    }

    // Before a proposal: let the LLM decide whether the participant has voiced
    // any improvement idea (returned as intent).
    state.beforeProposalTurns = (state.beforeProposalTurns || 0) + 1;

    // Backstop: after a few rounds with no concrete proposal, a coworker asks
    // whether to raise the current issue with the manager (no fabricated
    // proposal), then continues to the manager-feeling questions and decision.
    if (state.beforeProposalTurns >= 4) {
      state.secondPhase = "afterProposal";
      state.coworkerQueue = ["coworker_manager_feeling", "coworker_feeling_followup"];
      await sendAiMessages({
        stage: "lisa_john",
        phase: "coworker_issue_decision",
        mode: coworkerSingleMode(),
        alexMessage: text,
      });
      finishCoworkerTurn();
      return;
    }

    await sendAiMessages({
      stage: "lisa_john",
      phase: "discussion",
      mode: "auto",
      alexMessage: text,
    });
    if (state.lastAiIntent === "has_proposal") {
      state.secondPhase = "afterProposal";
      state.coworkerQueue = ["coworker_manager_decision", "coworker_manager_feeling", "coworker_feeling_followup"];
    }
    finishCoworkerTurn();
  }

  function showDecisionPrompt() {
    state.decisionShown = true;
    setComposerEnabled(false);
    const decisionQuestion = inZh("Do you want to talk with the manager now?", "你现在想和经理谈谈吗？");
    recordInteraction("decision_prompt", "system", decisionQuestion, "");
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>${escapeHtml(decisionQuestion)}</p>
      <div class="actions">
        <button class="button" type="button" id="decision-yes">${escapeHtml(inZh("Yes", "是"))}</button>
        <button class="button secondary" type="button" id="decision-no">${escapeHtml(inZh("No", "否"))}</button>
      </div>
    `;
    document.querySelector(".chat").appendChild(panel);
    document.getElementById("decision-yes").addEventListener("click", () => handleDecision("yes"));
    document.getElementById("decision-no").addEventListener("click", () => {
      handleDecision("no");
      renderPostInteractionSurvey();
    });
  }

  function handleDecision(decision) {
    recordInteraction("decision_prompt", "alex", decision, decision);
    participant.completed_lisa_john_interaction = "true";
    participant.chose_to_bring_this_up_with_manager = decision;
    participant.experiment_end_time = timestamp();
    participant.completion_status = "partial";
    saveParticipant();
    if (decision === "yes") {
      renderNeutralManagerChat();
    }
  }

  function renderCompletionPage(message, neutralFollowupComplete, shouldRecord = true) {
    markForwardStage("completion");
    state.part = "completion";
    if (neutralFollowupComplete) {
      participant.completed_neutral_manager_followup = "true";
    }
    participant.experiment_end_time = timestamp();
    participant.completion_status = "completed";
    saveParticipant();
    if (shouldRecord) {
      recordInteraction("completion_page", "system", message, "");
    }
    screen.innerHTML = `
        <article class="page">
          <h1>${escapeHtml(inZh("Interaction Complete", "本轮互动已完成"))}</h1>
          <p>${escapeHtml(message)}</p>
          <div class="actions">
            <button class="button" type="button" id="completion-next">${escapeHtml(inZh("Next", "下一步"))}</button>
          </div>
        </article>
      `;
    document.getElementById("completion-next").addEventListener("click", handleCompletionNext);
  }

  function renderTaskFeedbackPage() {
    markForwardStage("task_feedback");
    state.part = "task_feedback";
    participant.completion_status = "partial";
    saveParticipant();
    recordInteraction("task_feedback", "system", "Task feedback page displayed.", "");

    screen.innerHTML = `
      <article class="page feedback-page">
        <h1>${escapeHtml(inZh("Task Feedback", "任务反馈"))}</h1>
        <p>${escapeHtml(inZh("If you have any suggestions about this online task, please share them with us.", "如果你愿意，欢迎告诉我们你对本次任务有什么建议。"))}</p>
        <p>${escapeHtml(inZh("You may also submit without adding a suggestion. Please do not include your name or other personal information.", "没有建议也可以直接提交。请不要填写姓名或其他个人信息。"))}</p>
        <form id="task-feedback-form" class="feedback-form" novalidate>
          <label for="task-feedback">${escapeHtml(inZh("Your suggestion (optional)", "你的建议（可选）"))}</label>
          <textarea id="task-feedback" name="task_feedback" rows="6" maxlength="2000" placeholder="${escapeHtml(inZh("Enter your suggestion", "请输入你的建议"))}"></textarea>
          <p class="validation-message" id="task-feedback-validation" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit">${escapeHtml(inZh("Submit and continue", "提交并继续"))}</button>
          </div>
        </form>
      </article>
    `;

    document.getElementById("task-feedback-form").addEventListener("submit", handleTaskFeedbackSubmit);
  }

  function handleTaskFeedbackSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = String(form.elements.task_feedback.value || "").trim();
    recordInteraction("task_feedback", "alex", feedback, feedback ? "submitted" : "no_suggestion");
    participant.completion_status = "partial";
    saveParticipant();
    renderCompletionPage(
      inZh("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", "你已完成这一部分。请点击“下一步”进入下一页。"),
      participant.completed_neutral_manager_followup === "true"
    );
  }

  function handleCompletionNext() {
    recordInteraction("completion_page", "alex", "Next", "completed");
    if (completionRedirectUrl) {
      allowStudyExit = true;
      window.location.href = completionRedirectUrl;
      return;
    }
    screen.innerHTML = `
      <article class="page">
        <h1>${escapeHtml(inZh("Thank You", "谢谢您的参与"))}</h1>
        <p>${escapeHtml(inZh("Your responses have been submitted. You may now close this page.", "谢谢您的参与，您的完卷码是：WORK888。请返回见数页面填入该码并提交问卷，以领取报酬。"))}</p>
        <div class="actions">
          <button class="button" type="button" disabled>${escapeHtml(inZh("Done", "完成"))}</button>
        </div>
      </article>
    `;
  }

  async function renderNeutralManagerChat() {
    markForwardStage("manager2");
    state.part = "manager2";
    state.neutralQuestionCount = 0;
    state.neutralNoSubstancePrompted = false;
    state.neutralDone = false;
    state.managerTurnActive = false;
    state.pendingManagerInput = "";
    saveParticipant();
    createChat(inZh("Manager Chat", "经理聊天室"), inZh("Manager online", "经理在线"), true);
    setComposerEnabled(true);
    addSystemNote(inZh("You can share your ideas with the manager, or you can choose not to bring them up.", "你可以向经理谈谈你的想法，也可以选择不提。"));
    state.managerTurnActive = true;
    await sendAiMessages({ stage: "manager2", phase: "opening", alexMessage: "" });
    finishManagerTurn();
  }

  async function handleNeutralManagerInput(text) {
    if (state.neutralDone) return;
    state.managerTurnActive = true;

    // Anything typed while this turn is in progress is queued by handleSubmit. It must be handled
    // on every exit from this function, not only after a question; the "anything to discuss?"
    // branch used to return without looking at it, which dropped the participant's suggestion.
    const drainPending = () => {
      if (!state.pendingManagerInput) return false;
      const pendingText = state.pendingManagerInput;
      state.pendingManagerInput = "";
      handleNeutralManagerInput(pendingText);
      return true;
    };
    const superseded = () => Boolean(state.pendingManagerInput);

    const substanceIntent = await getChatIntent("manager2", "substance", text);
    if (substanceIntent !== "has_issue_or_idea") {
      // A newer message makes a "no substance" reply to this one moot before it is even requested.
      if (superseded()) {
        state.managerTurnActive = false;
        drainPending();
        return;
      }
      if (!state.neutralNoSubstancePrompted && state.neutralQuestionCount === 0) {
        state.neutralNoSubstancePrompted = true;
        const promptSent = await sendAiMessages({
          stage: "manager2",
          phase: "no_substance_prompt",
          alexMessage: text,
          abortIf: superseded,
        });
        state.managerTurnActive = false;
        if (promptSent === "aborted") {
          // The prompt was never shown, so a later genuinely empty message may still get it.
          state.neutralNoSubstancePrompted = false;
          drainPending();
          return;
        }
        if (!promptSent) return;
        drainPending();
        return;
      }
      const sent = await sendAiMessages({
        stage: "manager2",
        phase: "closing",
        alexMessage: text,
        abortIf: superseded,
      });
      state.managerTurnActive = false;
      if (sent === "aborted") {
        drainPending();
        return;
      }
      if (!sent) return;
      showNeutralProceedChoice();
      return;
    }

    // Ask at most three follow-up questions. After that, the manager sends a
    // brief neutral wrap-up and the participant can proceed.
    if (state.neutralQuestionCount >= 3) {
      const sent = await sendAiMessages({
        stage: "manager2",
        phase: "closing",
        alexMessage: text,
        abortIf: superseded,
      });
      state.managerTurnActive = false;
      if (sent === "aborted") {
        drainPending();
        return;
      }
      if (!sent) return;
      showNeutralProceedChoice();
      return;
    }

    state.neutralQuestionCount += 1;
    const sent = await sendAiMessages({
      stage: "manager2",
      phase: "question",
      alexMessage: text,
    });
    state.managerTurnActive = false;
    if (!sent) return;
    // If the participant typed ahead while the manager was replying, handle it next.
    if (drainPending()) return;
    // The manager wraps up early once it judges it has enough (e.g. the
    // participant already gave a detailed proposal).
    if (state.lastAiIntent === "enough") {
      showNeutralProceedChoice();
    }
  }

  function showNeutralProceedChoice() {
    if (state.neutralDone) return;
    setComposerEnabled(false);
    const question = inZh("Do you want to end this conversation?", "你想结束这次对话吗？");
    recordInteraction("neutral_manager_followup", "system", question, "");
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>${escapeHtml(question)}</p>
      <div class="actions">
        <button class="button secondary" type="button" id="neutral-continue">${escapeHtml(inZh("Keep talking with the manager", "继续和经理聊"))}</button>
        <button class="button" type="button" id="neutral-proceed">${escapeHtml(inZh("End conversation", "结束对话"))}</button>
      </div>
    `;
    document.querySelector(".chat").appendChild(panel);
    document.getElementById("neutral-continue").addEventListener("click", () => {
      recordInteraction("neutral_manager_followup", "alex", "keep talking", "");
      panel.remove();
      state.neutralQuestionCount = 0;
      setComposerEnabled(true);
    });
    document.getElementById("neutral-proceed").addEventListener("click", () => {
      recordInteraction("neutral_manager_followup", "alex", "proceed", "");
      panel.remove();
      state.neutralDone = true;
      participant.completed_neutral_manager_followup = "true";
      saveParticipant();
      renderPostInteractionSurvey();
    });
  }

  // One section per page. A single long page put nine matrices and fifty rows in front of the
  // participant at once; paging keeps each construct's instruction and stem next to its items, and
  // validates each page before the next is shown. There is no way back: the attribution and tone
  // sections must not be revised after later sections have been seen. Answers are kept in a draft
  // on the participant record (local storage only; the server has no column for it), so a refresh
  // resumes on the page the participant was on rather than starting the survey over.
  function surveySectionItemIds(section) {
    const groups = section.groups || [{ items: section.items || [] }];
    return groups.flatMap((group) => (group.items || []).map((item) => item.id));
  }

  function readSurveyDraft() {
    try {
      const draft = JSON.parse(participant.survey_draft || "{}");
      return draft && typeof draft === "object" ? draft : {};
    } catch (error) {
      return {};
    }
  }

  function renderPostInteractionSurvey() {
    markForwardStage("survey");
    state.part = "survey";
    const resuming = participant.survey_completion_status === "partial" && Boolean(participant.survey_start_time);
    if (!resuming) {
      state.surveyStartTime = timestamp();
      participant.completed_post_interaction_survey = "false";
      participant.survey_completion_status = "partial";
      participant.survey_start_time = state.surveyStartTime;
      participant.survey_submit_time = "";
      participant.survey_page = "0";
      participant.survey_draft = "";
      participant.experiment_end_time = state.surveyStartTime;
      participant.completion_status = "partial";
      recordInteraction("post_interaction_survey", "system", "Post-Interaction Questions started.", "");
    } else {
      state.surveyStartTime = participant.survey_start_time;
    }
    state.surveyAnswers = readSurveyDraft();
    const page = Math.min(Math.max(0, Number(participant.survey_page) || 0), surveySections.length - 1);
    saveParticipant();
    renderSurveyPage(page);
  }

  function renderSurveyPage(index) {
    const section = surveySections[index];
    const isLast = index === surveySections.length - 1;
    participant.survey_page = String(index);
    saveParticipant();
    recordInteraction(
      "post_interaction_survey",
      "system",
      `Survey page ${index + 1} of ${surveySections.length} displayed: ${section.title}.`,
      "",
    );

    screen.innerHTML = `
      <article class="page survey-page">
        <h1>${escapeHtml(inZh("Post-Interaction Questions", "互动后的问题"))}</h1>
        <p class="survey-progress">${escapeHtml(inZh(`Page ${index + 1} of ${surveySections.length}`, `第 ${index + 1} 页，共 ${surveySections.length} 页`))}</p>
        <p>${escapeHtml(inZh("Please answer the following questions based on your experience in this study. There are no right or wrong answers. Please indicate the extent to which you agree with each statement.", "请根据你在本研究中的体验回答以下问题。答案没有对错，请选择你对每项陈述的同意程度。"))}</p>
        <form id="survey-form" novalidate>
          ${renderSurveySection(section)}
          <p class="validation-message" id="survey-validation" aria-live="polite"></p>
          <div class="survey-submit">
            <button class="button" type="submit">${escapeHtml(isLast ? inZh("Submit", "提交") : inZh("Continue", "继续"))}</button>
          </div>
        </form>
      </article>
    `;

    document.getElementById("survey-form").addEventListener("submit", (event) => handleSurveyPageSubmit(event, index));
    window.scrollTo(0, 0);
  }

  function renderSurveySection(section) {
    const groups = section.groups || [{ label: "", items: section.items || [] }];
    const options = section.options || likertOptions;
    return `
      <section class="survey-section">
        <h2>${escapeHtml(section.title)}</h2>
        <p class="${section.instructionEmphasis ? "survey-emphasis" : ""}"${section.instructionRed ? ' style="color: #d32f2f;"' : ""}>${formatSurveyInstruction(section.instruction)}</p>
        ${section.stem ? `<p class="survey-stem${section.stemEmphasis ? " survey-emphasis" : ""}">${escapeHtml(section.stem)}</p>` : ""}
        ${groups.map((group) => `
          ${group.label ? `<h3>${escapeHtml(group.label)}</h3>` : ""}
          ${renderSurveyMatrix(group.items, options)}
        `).join("")}
      </section>
    `;
  }

  function formatSurveyInstruction(text) {
    return escapeHtml(text).replace(
      /labor plan/g,
      '<strong class="survey-emphasis">labor plan</strong>'
    );
  }

  function renderSurveyMatrix(items, options = likertOptions) {
    return `
      <div class="survey-matrix" role="table">
        <div class="survey-row survey-head" role="row">
          <div role="columnheader">${escapeHtml(inZh("Item", "题项"))}</div>
          ${options.map((label, index) => `<div role="columnheader">${index + 1}<span>${escapeHtml(label)}</span></div>`).join("")}
        </div>
        ${items.map((item) => `
          <div class="survey-row" role="row" aria-labelledby="survey-item-${escapeHtml(item.id)}">
            <div class="survey-item" id="survey-item-${escapeHtml(item.id)}">${escapeHtml(item.text)}</div>
            ${options.map((label, index) => `
              <label aria-label="${index + 1} ${escapeHtml(label)}">
                <input type="radio" name="${escapeHtml(item.id)}" value="${index + 1}" required>
                <span>${index + 1}</span>
                <small>${escapeHtml(label)}</small>
              </label>
            `).join("")}
          </div>
        `).join("")}
      </div>
    `;
  }

  function handleSurveyPageSubmit(event, index) {
    event.preventDefault();
    const form = event.currentTarget;
    const validation = document.getElementById("survey-validation");
    const ids = surveySectionItemIds(surveySections[index]);
    const missingResponse = ids.some((id) => !form.elements[id] || !form.elements[id].value);

    if (missingResponse) {
      const message = inZh("Please answer all questions on this page before continuing.", "请先回答本页的所有问题。");
      validation.textContent = message;
      recordInteraction("post_interaction_survey", "system", message, "");
      return;
    }

    for (const id of ids) state.surveyAnswers[id] = form.elements[id].value;
    participant.survey_draft = JSON.stringify(state.surveyAnswers);
    recordInteraction("post_interaction_survey", "alex", `survey page ${index + 1} submitted`, "");

    if (index < surveySections.length - 1) {
      participant.survey_page = String(index + 1);
      saveParticipant();
      renderSurveyPage(index + 1);
      return;
    }

    // A resumed session whose draft was lost can reach the last page with earlier answers missing;
    // send it back to the first incomplete page rather than posting a partial row.
    const firstIncomplete = surveySections.findIndex((section) =>
      surveySectionItemIds(section).some((id) => !state.surveyAnswers[id]));
    if (firstIncomplete !== -1) {
      renderSurveyPage(firstIncomplete);
      return;
    }

    const submitTime = timestamp();
    const responses = {
      prolific_pid: participant.prolific_pid,
      study_id: participant.study_id,
      session_id: participant.session_id,
      language,
      assigned_condition: condition,
      condition_source: conditionSource,
      manipulation_version: manipulationVersion,
      survey_start_time: state.surveyStartTime || participant.survey_start_time || submitTime,
      survey_submit_time: submitTime,
      survey_completion_status: "completed",
    };
    for (const id of surveyItemIds) {
      responses[id] = state.surveyAnswers[id];
    }

    postJson("/survey", responses);
    participant.completed_post_interaction_survey = "true";
    participant.survey_completion_status = "completed";
    participant.survey_start_time = responses.survey_start_time;
    participant.survey_submit_time = submitTime;
    participant.survey_page = "";
    participant.survey_draft = "";
    participant.experiment_end_time = submitTime;
    participant.completion_status = "partial";
    saveParticipant();
    renderAiCheckPage();
  }

  // The suspicion probe is a funnel. Two open questions that never mention AI come first, each on
  // its own page and locked once submitted; only then the direct item. The direct page is kept
  // exactly as it was in the pilot, preamble included, so its answers stay comparable with the data
  // already collected. That preamble tells the participant AI may be involved before asking, which
  // is a prime, and is the whole reason it must never be on screen before the two open answers are in.
  const AI_CHECK_STAGES = ["unusual", "who", "direct"];

  function renderAiCheckPage() {
    markForwardStage("ai_check");
    state.part = "ai_check";
    const stage = AI_CHECK_STAGES.includes(participant.ai_check_stage) ? participant.ai_check_stage : "unusual";
    if (stage === "direct") return renderAiCheckDirectPage();
    return renderAiCheckOpenPage(stage);
  }

  function renderAiCheckOpenPage(kind) {
    const isFirst = kind === "unusual";
    const question = isFirst
      ? inZh(
        "Did anything about the interaction feel unusual or unexpected? Please describe briefly.",
        "在刚才的互动中，有没有什么让你觉得不寻常或出乎意料的地方？请简单描述。",
      )
      : inZh(
        "Who or what do you think you were interacting with in the chat?",
        "你认为你在聊天中是在和谁（或什么）互动？",
      );
    participant.ai_check_stage = kind;
    participant[`ai_check_${kind}_start_time`] = timestamp();
    participant[`ai_check_${kind}_submit_time`] = "";
    if (isFirst) {
      participant.completed_ai_check = "false";
      participant.completion_status = "partial";
    }
    saveParticipant();
    recordInteraction("ai_check", "system", `AI check page displayed: ${kind}.`, "");

    screen.innerHTML = `
      <article class="page ai-check-page">
        <h1>${escapeHtml(inZh("A few final questions", "最后几个问题"))}</h1>
        <form id="ai-check-form" novalidate>
          <fieldset>
            <legend>${escapeHtml(question)}</legend>
            <textarea id="ai-check-text" name="answer" rows="4" required></textarea>
          </fieldset>
          <p class="validation-message" id="ai-check-validation" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit">${escapeHtml(inZh("Continue", "继续"))}</button>
          </div>
        </form>
      </article>
    `;
    document.getElementById("ai-check-form").addEventListener("submit", (event) => handleAiCheckOpenSubmit(event, kind));
  }

  function handleAiCheckOpenSubmit(event, kind) {
    event.preventDefault();
    const validation = document.getElementById("ai-check-validation");
    const answer = String(event.currentTarget.elements.answer.value || "").trim();
    if (!answer) {
      const message = inZh("Please write a short answer before continuing.", "请先写一个简短的回答。");
      validation.textContent = message;
      recordInteraction("ai_check", "system", message, "");
      return;
    }
    participant[`ai_check_${kind}_text`] = answer;
    participant[`ai_check_${kind}_submit_time`] = timestamp();
    // Advance and persist before rendering, so a refresh lands on the next page rather than
    // re-asking a question whose answer is already recorded.
    participant.ai_check_stage = kind === "unusual" ? "who" : "direct";
    saveParticipant();
    recordInteraction("ai_check", "alex", `${kind}=${answer}`, "");
    renderAiCheckPage();
  }

  // The pilot's page, unchanged: same preamble, same wording, same options. ai_check_start_time
  // keeps its original meaning of "when this direct item was shown".
  function renderAiCheckDirectPage() {
    state.aiCheckStartTime = timestamp();
    participant.ai_check_stage = "direct";
    participant.completed_ai_check = "false";
    participant.ai_check_start_time = state.aiCheckStartTime;
    participant.ai_check_submit_time = "";
    participant.manager_ai_suspicion = "";
    participant.lisa_ai_suspicion = "not_shown";
    participant.john_ai_suspicion = "not_shown";
    participant.completion_status = "partial";
    saveParticipant();
    recordInteraction("ai_check", "system", "AI check page displayed.", "");

    screen.innerHTML = `
      <article class="page ai-check-page">
        <h1>${escapeHtml(inZh("One More Question", "还有一个问题"))}</h1>
        <p>${escapeHtml(inZh("In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the questions below.", "在见数招募中，有些研究可能会包含 AI 参与者。为了帮助我们保护数据质量，并减少 AI 参与者可能带来的影响，请回答下面的问题。"))}</p>
        <form id="ai-check-form" novalidate>
          ${renderAiCheckQuestion("manager_ai_suspicion", inZh("Do you think the manager you interacted with may have been AI?", "你认为与你互动的经理可能是 AI 吗？"))}
          <p class="validation-message" id="ai-check-validation" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit">${escapeHtml(inZh("Submit", "提交"))}</button>
          </div>
        </form>
      </article>
    `;

    document.getElementById("ai-check-form").addEventListener("submit", handleAiCheckSubmit);
  }

  function renderAiCheckQuestion(name, question) {
    return `
      <fieldset>
        <legend>${escapeHtml(question)}</legend>
        <div class="choice-list">
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(name)}" value="yes" required>
            <span>${escapeHtml(inZh("Yes", "是"))}</span>
          </label>
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(name)}" value="no" required>
            <span>${escapeHtml(inZh("No", "否"))}</span>
          </label>
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(name)}" value="not_sure" required>
            <span>${escapeHtml(inZh("Not sure", "不确定"))}</span>
          </label>
        </div>
      </fieldset>
    `;
  }

  function handleAiCheckSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const validation = document.getElementById("ai-check-validation");
    const managerResponse = form.elements.manager_ai_suspicion.value;
    const lisaResponse = "not_shown";
    const johnResponse = "not_shown";

    if (!managerResponse) {
      const message = inZh("Please answer all questions before continuing.", "请先回答所有问题。");
      validation.textContent = message;
      recordInteraction("ai_check", "system", message, "");
      return;
    }

    const submitTime = timestamp();
    participant.completed_ai_check = "true";
    participant.ai_check_start_time = state.aiCheckStartTime || participant.ai_check_start_time || submitTime;
    participant.ai_check_submit_time = submitTime;
    participant.manager_ai_suspicion = managerResponse;
    participant.ai_check_stage = "done";
    participant.lisa_ai_suspicion = lisaResponse;
    participant.john_ai_suspicion = johnResponse;
    participant.experiment_end_time = submitTime;
    participant.completion_status = "partial";
    saveParticipant();
    recordInteraction(
      "ai_check",
      "alex",
      `manager=${managerResponse}; lisa=${lisaResponse}; john=${johnResponse}`,
      ""
    );
    renderTaskFeedbackPage();
  }

  function addMessage(speaker, className, text) {
    const displaySpeaker = normalizeAiSpeaker(speaker);
    const isParticipantMessage = displaySpeaker === "Participant 2" || displaySpeaker === "You";
    const displayText = isParticipantMessage ? String(text || "") : cleanAiDisplayText(text);
    const displayClassName = speakerClassName(displaySpeaker);
    const row = document.createElement("div");
    row.className = `message-row ${displayClassName || className}`;
    row.dataset.speaker = displaySpeaker;
    row.dataset.message = displayText;
    row.innerHTML = `
      <div class="bubble">
        <span class="speaker">${escapeHtml(displaySpeakerName(displaySpeaker))}</span>
        <span>${escapeHtml(displayText)}</span>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    recordInteraction(currentStage(), displaySpeaker, displayText, "");
  }

  async function sendDelayed(speaker, className, text, ms, opts = {}) {
    state.busy = true;
    if (className === "manager" && opts.immediate) {
      // Condition-bearing manager turns already wait for generation and blind
      // validation. Display them immediately once the validated reply arrives.
    } else if (className === "manager") {
      const plan = managerTimingPlan(text, opts);
      if (plan.showTyping) {
        await delay(plan.thinkingDelay);
        const typingIndicator = showTypingIndicator(speaker, className);
        await delay(plan.typingDelay);
        typingIndicator.remove();
        await delay(plan.tailPause);
      } else {
        await delay(plan.totalDelay);
      }
    } else {
      await showTypingBeforeMessage(speaker, className, text, ms || responseDelayForText(text));
    }
    addMessage(speaker, className, text);
    state.busy = false;
  }

  async function sendAiMessages(request) {
    const validatedManagerTurn =
      request.stage === "manager1" &&
      ["discussion", "rejection_initial", "rejection_followup", "rejection", "closing"].includes(request.phase);
    // When the caller already knows a rejection is coming (request.acknowledge), the manager says
    // "give me a moment" right away, while the reply is generated. That is the human moment for
    // it: as soon as you realise you need to think, not after a long silence. Otherwise the
    // clock-based fallback runs, which only speaks if the wait passes the threshold. A closing is
    // the manager signing off, not deliberating, and is never acknowledged.
    const acknowledgeableTurn = validatedManagerTurn && request.phase !== "closing";
    const replyPromise = requestAiMessages(request);
    let presence = null;
    if (request.acknowledge) presence = postManagerAcknowledgement();
    else if (acknowledgeableTurn) presence = runManagerWaitPresence(replyPromise);
    let result;
    try {
      result = await replyPromise;
    } finally {
      // Never let the reply overtake the presence sequence when generation returns quickly.
      if (presence) await presence;
    }
    if (!result.ok) {
      console.warn(result.error || "The AI chat service is not available. Please check the server configuration.");
      setApiConnectionIssue();
      return false;
    }
    clearApiConnectionIssue();

    state.lastAiIntent = result.intent || "";
    // A reply can become moot while it is being generated: the participant says "hi", the manager
    // starts composing "anything you'd like to discuss?", and the participant's actual suggestion
    // arrives before that lands. Showing it then makes the manager look as if it did not read the
    // suggestion, and the suggestion itself was being dropped. The caller decides what counts as
    // moot; a discarded reply is reported as "aborted" so the caller can act on the newer message.
    if (typeof request.abortIf === "function" && request.abortIf()) {
      recordInteraction(currentStage(), "system", `Discarded a ${request.phase} reply superseded by a newer participant message.`, "");
      return "aborted";
    }
    const initialRejectionPair =
      request.stage === "manager1" &&
      (request.phase === "rejection_initial" || result.intent === "reject_now");

    let previousCoworkerText = "";
    for (const [messageIndex, message] of result.messages.entries()) {
      const displaySpeaker = normalizeAiSpeaker(message.speaker);
      const displayText = cleanAiDisplayText(message.text);
      const className = speakerClassName(displaySpeaker);
      let delayMs;
      if (request.stage === "prechat") {
        delayMs = prechatDelayForText(displaySpeaker, displayText);
      } else if (isCoworkerClass(className)) {
        delayMs = coworkerResponseDelay(displayText, previousCoworkerText);
      }
      await sendDelayed(displaySpeaker, className, displayText, delayMs, {
        closing: request.phase === "closing",
        postValidation: validatedManagerTurn && messageIndex === 0,
        interMessage: initialRejectionPair && messageIndex > 0,
      });
      if (isCoworkerClass(className)) previousCoworkerText = displayText;
    }
    return result.messages.length > 0;
  }

  async function sendManagerClosing(request) {
    return sendAiMessages(request);
  }

  function normalizeAiSpeaker(speaker) {
    const normalized = String(speaker || "").toLowerCase().replace(/\s+/g, "-");
    if (normalized === "ra" || normalized === "research-assistant") return "Coordinator";
    if (normalized === "alex") return "You";
    if (normalized === "lisa") return "Coworker 1";
    if (normalized === "john") return "Coworker 2";
    return speaker;
  }

  function cleanAiDisplayText(text) {
    const cleanedText = cleanVisibleNames(String(text || "").replace(/[-\u2010-\u2015\u2212]/g, " ")).replace(/\s+/g, " ").trim();
    return isChinese ? normalizeChineseSpacing(cleanedText) : cleanedText;
  }

  function normalizeChineseSpacing(text) {
    const rawText = String(text || "").trim();
    const cjkCount = (rawText.match(/[\u3400-\u9fff]/g) || []).length;
    const hasChinesePunctuation = /[，、。！？；：]/.test(rawText);
    const hasChineseBreakSpaces = /[\u3400-\u9fff]\s+[\u3400-\u9fff]/.test(rawText);
    if (cjkCount >= 32 && !hasChinesePunctuation && hasChineseBreakSpaces) {
      return stripFinalChineseFullStop(rawText.replace(/\s+/g, " "));
    }

    let cleanedText = rawText;
    let previousText = "";
    while (cleanedText !== previousText) {
      previousText = cleanedText;
      cleanedText = cleanedText.replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2");
    }
    return stripFinalChineseFullStop(cleanedText
      .replace(/([\u3400-\u9fff])\s+([，、。！？；：])/g, "$1$2")
      .replace(/([，、。！？；：])\s+([\u3400-\u9fff])/g, "$1$2")
      .replace(/\s+([，、。！？；：])/g, "$1")
      .replace(/([（])\s+/g, "$1")
      .replace(/\s+([）])/g, "$1")
      .trim());
  }

  function stripFinalChineseFullStop(text) {
    return String(text || "").replace(/。$/, "");
  }

  function cleanVisibleNames(text) {
    return String(text || "")
      .replace(/\b(?:Lisa and John|John and Lisa)\b/gi, "your coworkers")
      .replace(/\bLisa['’]s\b/gi, "Coworker 1's")
      .replace(/\bJohn['’]s\b/gi, "Coworker 2's")
      .replace(/\bLisa\b/gi, "Coworker 1")
      .replace(/\bJohn\b/gi, "Coworker 2")
      .replace(/\bAlex['’]s\b/gi, "your")
      .replace(/\bAlex,\s*/gi, "")
      .replace(/\bAlex\b/gi, "you");
  }

  async function requestAiMessages(request) {
    const retryMessage = inZh("The chat connection had a brief issue. Please try again.", "聊天连接短暂出现问题。请再试一次。");
    const requestId = createAiRequestId();
    const requestTimeoutMs = aiRequestTimeoutFor(request);
    const { acknowledge: _acknowledge, abortIf: _abortIf, ...requestFields } = request;
    const requestPayload = {
      ...requestFields,
      request_id: requestId,
      condition,
      language,
      prolific_pid: ids.prolific_pid,
      study_id: ids.study_id,
      session_id: ids.session_id,
      manipulation_version: manipulationVersion,
      history: recentChatHistory(),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchWithTimeout(`${dataEndpoint}/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        }, requestTimeoutMs);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
          const rawError = data.error || "";
          const retryable = data.retryable || response.status === 429 || response.status >= 500 || /fetch failed/i.test(rawError);
          if (retryable && attempt === 0) {
            await delay(800);
            continue;
          }
          return { ok: false, error: retryable ? retryMessage : rawError || "OpenAI API request failed." };
        }
        const messages = Array.isArray(data.messages) ? data.messages : [];
        return { ok: messages.length > 0, messages, intent: data.intent || "", error: messages.length ? "" : "OpenAI returned no chat messages." };
      } catch (error) {
        if (error && error.name === "AbortError") {
          return { ok: false, error: retryMessage };
        }
        if (attempt === 0) {
          await delay(800);
          continue;
        }
        return { ok: false, error: retryMessage };
      }
    }
    return { ok: false, error: retryMessage };
  }

  function aiRequestTimeoutFor(request) {
    const validatedManagerPhase =
      request &&
      request.stage === "manager1" &&
      ["discussion", "rejection_initial", "rejection_followup", "rejection", "closing"].includes(request.phase);
    return validatedManagerPhase ? 150000 : apiRequestTimeoutMs;
  }

  function createAiRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `${ids.session_id || "session"}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function recentChatHistory() {
    if (!messagesEl) return [];
    return Array.from(messagesEl.querySelectorAll(".message-row:not(.typing-row)"))
      .slice(-14)
      .map((row) => ({
        speaker: row.dataset.speaker || "",
        message: row.dataset.message || "",
      }))
      .filter((row) => row.speaker && row.message);
  }


  function coworkerBothMode() {
    return Math.random() < 0.5 ? "both_lisa_first" : "both_john_first";
  }

  function coworkerSingleMode() {
    return Math.random() < 0.5 ? "lisa" : "john";
  }

  function coworkerResponseDelay(text, previousCoworkerText) {
    const typingAndThinkingDelay = responseDelayForText(text);
    const readPreviousDelay = previousCoworkerText ? coworkerReadingDelay(previousCoworkerText) : 0;
    return typingAndThinkingDelay + readPreviousDelay;
  }

  function coworkerReadingDelay(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (!wordCount) return 0;
    const wordsPerMinute = randomBetween(260, 340);
    const readTime = Math.round((wordCount / wordsPerMinute) * 60000);
    const naturalPause = randomBetween(700, 1800);
    return Math.min(6500, Math.max(1200, readTime + naturalPause));
  }

  function isCoworkerClass(className) {
    return className === "lisa" || className === "john" || className === "coworker-1" || className === "coworker-2";
  }

  function speakerClassName(speaker) {
    const normalized = String(speaker || "").toLowerCase().replace(/\s+/g, "-");
    if (normalized === "participant-2" || normalized === "you") return "alex";
    if (normalized === "research-assistant" || normalized === "session-coordinator") return "coordinator";
    return normalized;
  }

  async function showTypingBeforeMessage(speaker, className, text, totalDelay, opts = {}) {
    const delayMs = Math.max(900, Number(totalDelay) || responseDelayForText(text));
    const requestedPreTypingDelay = Number(opts.preTypingDelay);
    const thinkingDelay = Number.isFinite(requestedPreTypingDelay) && requestedPreTypingDelay > 0
      ? requestedPreTypingDelay
      : Math.min(1400, Math.max(350, Math.round(delayMs * 0.35)));
    const typingDelay = Math.max(600, delayMs - thinkingDelay);
    await delay(thinkingDelay);
    const typingIndicator = showTypingIndicator(speaker, className);
    await delay(typingDelay);
    typingIndicator.remove();
    await delay(randomBetween(120, 360));
  }

  function showTypingIndicator(speaker = "Manager", className = "manager") {
    const displaySpeaker = normalizeAiSpeaker(speaker);
    const displayClassName = speakerClassName(displaySpeaker);
    const row = document.createElement("div");
    row.className = `message-row ${displayClassName || className} typing-row`;
    row.innerHTML = `
      <div class="bubble typing-bubble">
        <span>${escapeHtml(inZh(`${displaySpeaker} is typing...`, `${displaySpeakerName(displaySpeaker)}正在输入...`))}</span>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
  }

  // A real chat client has no "reviewing your message" state, so an invented one reads as a machine
  // affordance to a suspicious participant. A manager who has just been sent a proposal does the
  // human equivalent instead: says they need a moment. The register is asking for time or wanting to
  // think it over, never narrating that they are reading the message.
  //
  // The lines are generated once per session rather than hardcoded, so two participants do not see
  // the same script. They carry no face work in either direction — no thanks or appreciation
  // (positive politeness) and no apology or deference (negative politeness) — because they sit
  // immediately before the politeness-manipulated rejection and would otherwise become part of it.
  // This local set is the fallback when generation is unavailable.
  const MANAGER_ACK_FALLBACK_EN = [
    "Give me a sec.",
    "Let me think about this for a moment.",
    "Okay, give me a minute with this one.",
    "Hang on, let me sit with this a moment.",
    "Give me a moment to think it over.",
    "One sec, I want to think about this properly.",
  ];
  const MANAGER_ACK_FALLBACK_ZH = [
    "我想想。",
    "稍等,让我想一下。",
    "给我点时间想想。",
    "等一下,我琢磨一下。",
    "让我先考虑考虑。",
    "稍等,我想清楚再说。",
  ];

  async function loadManagerAckLines() {
    if (state.managerAckLines.length) return;
    try {
      const response = await fetch("/api/manager-ack-lines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: isChinese ? "zh" : "en" }),
      });
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.lines) && data.lines.length >= 4) {
        state.managerAckLines = data.lines;
        return;
      }
    } catch (error) {
      // Falls through to the local set below.
    }
    state.managerAckLines = inZhArray(MANAGER_ACK_FALLBACK_EN, MANAGER_ACK_FALLBACK_ZH);
  }

  function pickManagerAckLine() {
    const lines = state.managerAckLines.length
      ? state.managerAckLines
      : inZhArray(MANAGER_ACK_FALLBACK_EN, MANAGER_ACK_FALLBACK_ZH);
    const available = lines.filter((line) => line !== state.lastManagerAckLine);
    const pool = available.length ? available : lines;
    const line = pool[Math.floor(Math.random() * pool.length)];
    state.lastManagerAckLine = line;
    return line;
  }

  // Shown while generation and blind validation run. It is a real Manager message: the participant
  // sees it in the transcript and it is recorded, which is what makes it read as a person rather
  // than as a status widget.
  // A short typing burst, then the acknowledgement line. Used immediately when the turn is known to
  // be a rejection, and by the clock-based fallback below.
  async function postManagerAcknowledgement() {
    const linesReady = loadManagerAckLines();
    const typingIndicator = showTypingIndicator("Manager", "manager");
    await Promise.all([linesReady, delay(randomBetween(700, 1200))]);
    typingIndicator.remove();
    addMessage("Manager", "manager", pickManagerAckLine());
  }

  // Fallback only, for turns whose kind is not known in advance: the combined discussion request
  // when the decision request failed, and later rejection rounds. Neutral follow-ups finish in
  // 5-12 seconds and the first rejection takes about 40, so the threshold keeps the line off the
  // follow-ups. The wait itself is silent: a typing indicator held for twenty seconds and then
  // followed by two short lines is the tell this whole sequence exists to remove.
  const MANAGER_ACK_THRESHOLD_MS = 20000;

  async function runManagerWaitPresence(replyPromise) {
    let settled = false;
    const tracked = replyPromise.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    loadManagerAckLines();
    await Promise.race([tracked, delay(MANAGER_ACK_THRESHOLD_MS)]);
    if (settled) return;
    await postManagerAcknowledgement();
  }

  function responseDelayForText(text) {
    const { min, max } = responseDelayRange(text);
    return randomBetween(min, max);
  }

  function responseDelayRange(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) return { min: 3000, max: 5000, wordCount };
    if (wordCount <= 25) return { min: 5000, max: 8000, wordCount };
    if (wordCount <= 50) return { min: 8000, max: 12000, wordCount };
    if (wordCount <= 90) return { min: 12000, max: 18000, wordCount };
    return { min: 18000, max: 25000, wordCount };
  }

  // One typing speed for every validated manager turn. Before this, the first rejection message and
  // follow-ups were timed at 300-420 words per minute under a 5.2 second cap, which is a reading
  // speed rather than a typing speed, and the cap flattened a 12-word and a 44-word message to
  // nearly the same interval - so a long message would land after a few seconds of typing. A fast
  // but plausible chat typist, with a cap high enough that length differences stay visible.
  const MANAGER_TYPING_WPM = { min: 140, max: 180 };
  const MANAGER_TYPING_DELAY_MS = { min: 2500, max: 11000 };

  function managerTypingDelayFor(text) {
    const wordCount = chatTextUnitCount(text);
    const wordsPerMinute = randomBetween(MANAGER_TYPING_WPM.min, MANAGER_TYPING_WPM.max);
    const natural = Math.round((wordCount / wordsPerMinute) * 60000);
    return Math.min(MANAGER_TYPING_DELAY_MS.max, Math.max(MANAGER_TYPING_DELAY_MS.min, natural));
  }

  function managerTimingPlan(text, opts = {}) {
    if (opts.interMessage) {
      // After the short first rejection message appears, show a typing interval before the longer
      // explanation. This makes the pair feel like two chat messages rather than one JSON response
      // being rendered all at once.
      const typingDelay = managerTypingDelayFor(text);
      return {
        showTyping: true,
        totalDelay: typingDelay + 600,
        thinkingDelay: randomBetween(250, 450),
        typingDelay,
        tailPause: randomBetween(180, 350),
      };
    }

    if (opts.postValidation) {
      const typingDelay = managerTypingDelayFor(text);
      return {
        showTyping: true,
        totalDelay: typingDelay + 700,
        thinkingDelay: randomBetween(250, 450),
        typingDelay,
        tailPause: randomBetween(150, 300),
      };
    }

    const wordCount = chatTextUnitCount(text);
    const showTyping = true;
    const wordsPerMinute = randomBetween(75, 85);
    const readingDelay = randomBetween(1200, 2600);
    const totalDelay = Math.round((wordCount / wordsPerMinute) * 60000 + readingDelay);
    state.lastManagerShowedTyping = true;

    const thinkingDelay = randomBetween(
      Math.min(2500, Math.floor(totalDelay * 0.15)),
      Math.max(2500, Math.floor(totalDelay * 0.28))
    );
    const tailPause = randomBetween(600, Math.max(1000, Math.floor(totalDelay * 0.08)));
    return {
      showTyping,
      totalDelay,
      thinkingDelay,
      typingDelay: Math.max(900, totalDelay - thinkingDelay - tailPause),
      tailPause,
    };
  }

  function addSystemNote(text) {
    const displayText = cleanVisibleNames(text);
    const note = document.createElement("p");
    note.className = "system-note";
    note.textContent = displayText;
    messagesEl.appendChild(note);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    recordInteraction(currentStage(), "system", displayText, "");
  }

  function renderNextAction(text, action, stage) {
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>${escapeHtml(text)}</p>
      <div class="actions">
        <button class="button" type="button" id="next-action">${escapeHtml(inZh("Next", "下一步"))}</button>
      </div>
    `;
    document.querySelector(".chat")?.appendChild(panel);
    recordInteraction(stage || currentStage(), "system", text, "");
    const button = document.getElementById("next-action");
    if (action) {
      button.addEventListener("click", action);
    } else {
      button.disabled = true;
    }
  }

  function showManagerExitPrompt() {
    if (state.part !== "manager1" || !state.managerRejected || state.managerChatLocked || state.managerTurnActive) return;
    if (state.pendingManagerInput || state.managerExitPromptShown) return;
    state.managerExitPromptShown = true;
    const panel = document.createElement("div");
    panel.className = "decision-panel manager-exit-panel";
    panel.id = "manager-exit-panel";
    const question = inZh("Do you want to end the chat and proceed to the next task?", "你想结束聊天，并进入下一个任务吗？");
    panel.innerHTML = `
      <p>${escapeHtml(question)}</p>
      <div class="actions">
        <button class="button" type="button" id="manager-exit-action">${escapeHtml(inZh("End chat and proceed", "结束聊天并继续"))}</button>
      </div>
    `;
    const chat = document.querySelector(".chat");
    if (chat && composerEl) {
      chat.insertBefore(panel, composerEl);
    } else {
      chat?.appendChild(panel);
    }
    recordInteraction("initial_manager_interaction", "system", question, "");
    const button = document.getElementById("manager-exit-action");
    button?.addEventListener("click", async () => {
      button.disabled = true;
      await completeInitialManagerInteraction(inZh("End chat and proceed", "结束聊天并继续"));
    });
  }

  function scheduleManagerExitPrompt() {
    clearManagerExitPromptTimer();
    if (state.part !== "manager1" || !state.managerRejected || state.managerChatLocked) return;
    if (state.pendingManagerInput || state.managerExitPromptShown) return;
    state.managerExitPromptTimer = window.setTimeout(() => {
      state.managerExitPromptTimer = null;
      showManagerExitPrompt();
    }, 5000);
  }

  function clearManagerExitPromptTimer() {
    if (!state.managerExitPromptTimer) return;
    window.clearTimeout(state.managerExitPromptTimer);
    state.managerExitPromptTimer = null;
  }

  function removeManagerExitPrompt() {
    const panel = document.getElementById("manager-exit-panel");
    if (panel) panel.remove();
    state.managerExitPromptShown = false;
  }

  function setComposerEnabled(enabled) {
    if (!composerEl) return;
    if (state.managerChatLocked && state.part === "manager1") {
      enabled = false;
    }
    for (const element of composerEl.elements) {
      element.disabled = !enabled;
    }
    if (enabled && inputEl) inputEl.focus();
  }

  function lockManagerChat() {
    state.managerChatLocked = true;
    state.managerTurnActive = false;
    state.pendingManagerInput = "";
    if (!composerEl) return;
    composerEl.classList.add("locked");
    for (const element of composerEl.elements) {
      element.disabled = true;
    }
  }

  function finishManagerTurn() {
    state.managerTurnActive = false;
    if (state.pendingManagerInput && !state.managerChatLocked) {
      const pendingText = state.pendingManagerInput;
      state.pendingManagerInput = "";
      if (state.part === "manager2") {
        handleNeutralManagerInput(pendingText);
      } else {
        handleManagerInput(pendingText);
      }
      return;
    }
    if (state.part === "manager1" && state.managerRejected && !state.managerChatLocked) {
      scheduleManagerExitPrompt();
    }
  }

  function finishCoworkerTurn() {
    state.coworkerTurnActive = false;
    if (!state.decisionShown && state.pendingCoworkerInputs.length) {
      const pendingText = state.pendingCoworkerInputs.shift();
      handleLisaJohnInput(pendingText);
    }
  }

  function setStatus(text) {
    const status = document.getElementById("chat-status");
    if (status) status.textContent = text;
  }

  function setApiConnectionIssue() {
    setStatus(inZh("Connection issue. Please send your message again.", "连接出现问题。请再发送一次消息。"));
  }

  function clearApiConnectionIssue() {
    if (state.part === "prechat") {
      setStatus(state.prechatAwaitingQuestions ? inZh("Waiting for questions", "等待提问") : inZh("Waiting for Participant 2", "等待参与者2"));
      return;
    }
    if (state.part === "manager1" || state.part === "manager2") {
      setStatus(inZh("Manager online", "经理在线"));
      return;
    }
    if (state.part === "lisaJohn") {
      setStatus(inZh("Coworkers online", "同事在线"));
    }
  }

  function normalizeCondition(value) {
    if (!value) return "";
    return conditionAliases[String(value).trim().toUpperCase()] || "";
  }

  function normalizeLanguage(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["zh", "zh-cn", "cn", "chinese", "中文"].includes(normalized)) return "zh";
    return "en";
  }

  function inZh(english, chinese) {
    return isChinese ? chinese : english;
  }

  function inZhArray(english, chinese) {
    return isChinese ? chinese : english;
  }

  function displaySpeakerName(speaker) {
    if (!isChinese) return speaker;
    const names = {
      System: "系统",
      Coordinator: "任务协调员",
      "Participant 1": "参与者1",
      "Participant 2": "参与者2",
      "Participant 3": "参与者3",
      You: "你",
      Manager: "经理",
      "Coworker 1": "同事1",
      "Coworker 2": "同事2",
    };
    return names[speaker] || speaker;
  }

  function currentStage() {
    if (state.part === "prechat_intro") return "prechat";
    if (state.part === "prechat") return "prechat";
    if (state.part === "manager1") return "initial_manager_interaction";
    if (state.part === "transition") return "transition_page";
    if (state.part === "materialDecision") return "material_manager_decision";
    if (state.part === "lisaJohn") return state.decisionShown ? "decision_prompt" : "lisa_john_interaction";
    if (state.part === "manager2") return "neutral_manager_followup";
    if (state.part === "survey") return "post_interaction_survey";
    if (state.part === "ai_check") return "ai_check";
    if (state.part === "task_feedback") return "task_feedback";
    if (state.part === "completion") return "completion_page";
    return "initial_manager_interaction";
  }

  function localizeSurveySections() {
    if (!isChinese) return;
    const sectionCopy = [
      {
        title: "第二次对话中的建言",
        instruction: "以下陈述关于你与经理的第二次对话（你看完顾客反馈之后的那次）。请根据你实际的做法，选择你对每条陈述的同意程度。",
      },
      {
        title: "为建议所做的准备",
        instruction: "以下陈述关于你与经理的第二次对话（你看完顾客反馈之后的那次）。请根据你实际的做法，选择你对每条陈述的同意程度。",
        stem: "在与经理第二次对话之前，我……",
      },
      {
        title: "对经理回应原因的感知",
        instruction: "请回答你认为经理为什么拒绝了你的用工方案建议。",
        stem: "经理拒绝我的建议是因为...",
        groups: ["与经理有关的原因", "与建议有关的原因"],
      },
      {
        title: "对经理回应语气的感知",
        instruction: "请回答经理拒绝你的用工方案建议时，你觉得经理的态度如何。",
        stem: "经理的回应是...",
      },
      {
        title: "对经理回应有用性的感知",
        instruction: "请回答经理拒绝你的用工方案建议时，你觉得经理的回应是否有帮助。",
        stem: "在拒绝我的建议时，经理...",
      },
      {
        title: "其他沟通意愿",
        instruction: "请根据你的想法，选择你对以下陈述的同意程度。",
      },
      {
        title: "其他沟通意愿B",
        instruction: "请根据你的想法，选择你对以下陈述的同意程度。",
      },
    ];
    const itemCopy = {
      VF1: "我不止一次向经理提出了具体的改进建议。",
      VF2: "我特意向经理提出了关于客流问题的新想法。",
      VF3: "即使经理看起来反应不大，我也继续表达了自己的看法。",
      VF4: "我利用对话中的机会，主动分享了自己的想法。",
      VF5: "我把自己的想法带进了对话，而不只是回答经理的问题。",
      VF6: "我反复提出了自己的建议和想法。",
      VQ1: "尽量用手头的信息（比如入园记录、游客评论或位置信息）来支撑我可能提出的建议。",
      VQ2: "努力思考了经理会有的实际顾虑，比如游客需求、可行性或园区运营。",
      VQ3: "尽量预想了经理可能提出的问题或疑虑，以及我会怎么回答。",
      VQ4: "努力想出了一个清晰、可执行的做法，而不只是一个笼统的想法。",
      MR1: "经理受到了自己情绪的影响。",
      MR2: "经理想表现自己的权威。",
      MR3: "经理个人不喜欢我。",
      PR1: "我的改进建议比较一般。",
      PR2: "我的建议并没有真正改善当前的方法或做法。",
      PR3: "我提出的工作安排改变并没有太大帮助。",
      PR4: "我对如何解决工作相关问题提出了不切实际的建议。",
      PR5: "我的建议不是很有用。",
      MA1: "有礼貌的",
      MA2: "彬彬有礼的",
      MA3: "顾及我的感受的",
      MA4: "尊重我的",
      MA5: "体贴我的感受的",
      MA6: "得体的",
      MA7: "文明有礼的",
      MA8: "说话有分寸的",
      MC1: "指出了我的方案中我确实可以着手改进的具体方面。",
      MC2: "表明我的方案存在的问题是可以解决的。",
      MC3: "提到了我的方案需要达到的清晰、合理的标准。",
      MC4: "非常具体和详细。",
      MC5: "提到了我的方案中具体有问题的部分。",
      MC6: "给出了足够清楚的指引，让我知道需要改变什么。",
      NWG1: "我会问其他同事，他们是否对主题乐园经理做过的某件事有负面印象。",
      NWG2: "在和同事交谈时，我会质疑主题乐园经理的能力。",
      NWG3: "在和同事交谈时，我会批评主题乐园经理。",
      NWG4: "我会向其他同事抱怨主题乐园经理做过的某件事。",
      NWG5: "我会向其他同事讲一个关于主题乐园经理的不太正面的故事。",
      PWG1: "在和同事交谈时，我会称赞主题乐园经理的做法。",
      PWG2: "我会向其他同事说主题乐园经理的好话。",
      PWG3: "在和同事交谈时，我会为主题乐园经理的做法辩护。",
      PWG4: "在和同事交谈时，我会说一些关于主题乐园经理的正面评价。",
      PWG5: "我会告诉其他同事，我尊重主题乐园经理。",
    };
    surveySections.forEach((section, index) => {
      const copy = sectionCopy[index];
      if (!copy) return;
      section.title = copy.title;
      section.instruction = copy.instruction;
      if (copy.stem) section.stem = copy.stem;
      if (copy.groups && Array.isArray(section.groups)) {
        section.groups.forEach((group, groupIndex) => {
          group.label = copy.groups[groupIndex] || group.label;
        });
      }
      getSectionItems(section).forEach((item) => {
        if (itemCopy[item.id]) item.text = itemCopy[item.id];
      });
    });
  }

  function localizeStudyMaterials() {
    if (!isChinese) return;
    prechatBeforeIntro.splice(0, prechatBeforeIntro.length, ...[
      { speaker: "System", text: "正在连接到在线聊天室...", delay: 700 },
      { speaker: "System", text: "你已作为参与者2进入聊天室。", delay: 800 },
      { speaker: "System", text: "任务协调员已进入聊天室。", delay: 800 },
      {
        speaker: "Coordinator",
        text: ["大家好，欢迎大家参加今天的任务。", "大家好，欢迎参加今天的任务。", "大家好，欢迎进入今天的任务聊天室。"],
        delay: 1600,
      },
      {
        speaker: "Coordinator",
        text: ["我先确认一下两位参与者是否都进来了。", "我们先确认一下两位参与者是否都连进来了。", "我先看一下两位参与者是不是都已经进入聊天室。"],
        delay: 1000,
      },
      {
        speaker: "Coordinator",
        text: ["请先留在这个聊天室里。", "请先保持在线。", "请先在这个聊天室里稍等一下。"],
        delay: 1400,
      },
      { speaker: "System", shuffleGroup: "prechatParticipantJoin", text: "参与者1已进入聊天室。", delay: 800 },
      {
        speaker: "Coordinator",
        text: ["好的，看来人已经到齐了。", "好的，看起来两位参与者都到了。", "好的，大家都已经在聊天室里了。"],
        delay: 1500,
      },
      {
        speaker: "Coordinator",
        text: [
          "请大家先自我介绍一下，只要大致介绍一下你们过去见数的经历即可，不需要透露个人信息。",
          "我们先简单做一轮自我介绍。大致说一下过去做见数任务的经历就可以，不需要透露个人信息。",
          "请两位先简单介绍一下自己。说说你们过去参加见数任务的大致经历即可，不用分享个人信息。",
        ],
        delay: 2100,
      },
      {
        speaker: "Participant 1",
        shuffleGroup: "prechatParticipantIntro",
        text: ["大家好，我做过很多见数任务，主要是问卷和决策类任务。", "大家好，我做过不少见数任务，大多是问卷和决策任务。", "大家好，我做见数任务比较多，不过这种小组聊天形式不太常见。"],
        delay: 6000,
        preTypingDelay: 8000,
      },
      {
        speaker: "Coordinator",
        text: "谢谢。参与者2，请你也简要介绍一下自己好吗？",
        delay: 4800,
        preTypingDelay: 8000,
        skipIfParticipant2Introduced: true,
      },
    ]);

    prechatAfterIntro.splice(0, prechatAfterIntro.length, ...[
      {
        speaker: "Coordinator",
        text: ["接下来我简单说明一下任务。", "下面我简单介绍一下任务。", "接下来我说一下具体的任务内容。"],
        delay: 1500,
      },
      {
        speaker: "Coordinator",
        text: ["本次任务由一家市场调研公司组织。", "这是一个由市场调研公司组织的顾客反馈任务。", "本次任务围绕顾客反馈和服务改进展开。"],
        delay: 2300,
      },
      {
        speaker: "Coordinator",
        text: ["你们将两人一组，讨论一个主题乐园可以如何改进服务。", "你们会进行一次两人讨论，主题是一个主题乐园如何改进服务。", "你们将进行两人讨论，讨论主题乐园如何提升服务。"],
        delay: 2100,
      },
      {
        speaker: "Coordinator",
        text: ["稍后系统会随机分配角色。", "接下来系统会随机分配角色。", "一会儿系统会为大家分配角色。"],
        delay: 2200,
      },
      {
        speaker: "Coordinator",
        text: "一人扮演主题乐园经理，一人扮演乐园运营团队成员。",
        delay: 1500,
      },
      {
        speaker: "Coordinator",
        text: ["角色分配好之后，请阅读你自己的材料，并根据角色信息参与后续任务。", "角色分配好之后，请仔细阅读自己的材料，并按照角色信息参与后续任务。", "角色分配完成后，请阅读你自己的材料，并根据角色信息参与接下来的任务。"],
        delay: 1800,
      },
      {
        speaker: "Coordinator",
        text: ["现在大家还有什么问题吗？", "现在大家对任务还有什么问题吗？", "在继续之前，大家还有什么问题吗？"],
        delay: 1800,
      },
    ]);

    prechatRoleAssignment.splice(0, prechatRoleAssignment.length, ...[
      { speaker: "System", text: "正在随机分配角色...", delay: 900 },
      { speaker: "System", text: "参与者1的角色是公园经理。", delay: 800 },
      { speaker: "System", text: "你的角色是运营团队成员。", delay: 900 },
      {
        speaker: "Coordinator",
        text: ["接下来，你会看到自己的角色材料，请仔细阅读后进入新的聊天室。", "接下来，你会看到自己的角色材料。请仔细阅读，之后进入新的聊天室。", "现在你会进入自己的角色材料页面。请仔细阅读后，再进入新的聊天室。"],
        delay: 2200,
      },
      { speaker: "System", text: "你现在将进入角色材料页面。", delay: 900 },
    ]);

    briefingPages[0].eyebrow = "角色材料 1/3";
    briefingPages[0].title = "你的角色";
    briefingPages[0].blocks = [
      { type: "p", text: "感谢你参加这项顾客反馈任务。" },
      { type: "p", text: "在今天的情境中，你是星河乐园的一名运营团队成员。你将直接和一位公园经理互动。" },
      { type: "p", text: "运营团队的日常工作包括：入口处检票、扫描二维码、确认游客类别、引导游客入园，并回答游客的一些简单问题。" },
    ];
    briefingPages[0].check.question = "在接下来的互动中，你的角色是什么？";
    briefingPages[0].check.options = [
      { value: "manager", label: "公园经理" },
      { value: "operations_team", label: "运营团队成员" },
      { value: "visitor", label: "主题乐园游客" },
    ];

    briefingPages[1].eyebrow = "角色材料 2/3";
    briefingPages[1].title = "背景信息";
    briefingPages[1].blocks = [
      { type: "p", text: "星河乐园目前面临明显的人员安排问题。园区几乎完全依赖全职长期员工，因此出现了淡旺季之间的“用工跷跷板”：" },
      {
        type: "ul",
        items: [
          "淡季：每天大约只有 500 名游客，园区有不少成本较高但工作量不多的员工。",
          "旺季：每天游客量会增加到约 5,000 人，团队压力很大，人手也不够。",
        ],
      },
      { type: "p", text: "目前的用工方案由园区管理层制定。但是这个方案不够灵活，也让用工成本变得越来越难以承担。" },
    ];
    briefingPages[1].check.question = "星河乐园主要的人员配置问题是什么？";
    briefingPages[1].check.options = [
      { value: "labor_seesaw", label: "淡季闲置员工太多，旺季员工太少" },
      { value: "too_few_visitors", label: "园区每个季节游客都太少" },
      { value: "ticket_system", label: "二维码票务系统坏了" },
    ];

    briefingPages[2].eyebrow = "角色材料 3/3";
    briefingPages[2].title = "你可能提出的建议";
    briefingPages[2].blocks = [
      { type: "p", text: "你认为主题乐园需要采用更灵活的用工模式，才能更好地应对淡旺季变化。" },
      { type: "p", text: "例如，园区可以在客流高峰时使用临时员工或实习生，也可以把一部分现有长期员工纳入灵活用工池，让人员安排更贴合实际需求。" },
      { type: "p", text: "提出人员用工方面的改变并不是你这个角色的必需职责，但你仍然想建议调整目前的做法，帮助主题乐园改善运营表现。" },
      { type: "p", text: "你可以向经理提出采用更灵活的用工模式。需要注意的是，当前的用工方案已经得到主题乐园管理层的一致同意，因此如果提出调整，就意味着对现有做法提出较大的挑战。" },
      { type: "p", text: "接下来，你将进入与经理的在线聊天。" },
    ];
    briefingPages[2].check.question = "你可能会向经理提出什么建议？";
    briefingPages[2].check.options = [
      { value: "flexible_labor", label: "采用灵活用工模式，例如临时员工、实习生或灵活用工池" },
      { value: "raise_prices", label: "在旺季提高票价" },
      { value: "new_rides", label: "为家庭游客建造新的游乐设施" },
    ];

    transitionPages[0].eyebrow = "材料 1/3";
    transitionPages[0].title = "淡季情况";
    transitionPages[0].blocks = [
      {
        text: "现在，请继续阅读材料。下面的内容介绍主题乐园淡季时的情况。",
        html: "现在，请继续阅读材料。下面的内容介绍主题乐园<strong>淡季</strong>时的情况。",
      },
      {
        text: "在一个典型的淡季工作日，园区大约有 500 名游客。",
        html: "在一个典型的淡季工作日，园区大约有<strong>500 名游客</strong>。",
      },
      {
        text: "入口处大部分时间都比较安静，门口员工的工作量也比较少。",
        html: "入口处大部分时间都比较安静，门口员工的工作量也<strong>比较少</strong>。",
      },
    ];
    transitionPages[1].eyebrow = "材料 2/3";
    transitionPages[1].title = "游客模式";
    transitionPages[1].blocks = [
      {
        text: "大多数游客是带低龄儿童的家庭。其中，有 10 岁以下儿童的家庭约占每日游客的 70% 到 75%，其他游客群体占比明显更小。",
        html: "大多数游客是<strong>带低龄儿童的家庭</strong>。其中，有 10 岁以下儿童的家庭约占每日游客的<strong>70% 到 75%</strong>，其他游客群体占比明显更小。",
      },
      {
        text: "星河乐园离市中心较远，许多家庭觉得这个位置不太方便。",
        html: "星河乐园<strong>离市中心较远</strong>，许多家庭觉得这个位置<strong>不太方便</strong>。",
      },
    ];
    transitionPages[2].eyebrow = "材料 3/3";
    transitionPages[2].title = "附近游客";
    transitionPages[2].blocks = [
      {
        text: "主题乐园附近有几所大学，也有一些农家乐和采摘园。距离园区 10 到 18 公里的范围内有 4 所大学，附近共有约 38,000 名大学生。",
        html: "主题乐园<strong>附近</strong>有几所大学，也有一些农家乐和采摘园。距离园区 <strong>10 到 18 公里</strong>的范围内有<strong>4 所大学</strong>，附近共有<strong>约 38,000 名大学生</strong>。",
      },
      {
        text: "一些大学生觉得这个园区很可爱，但更像是为小孩子设计的。也有人提到，如果有学生折扣，或者有更多适合拍照的地点，园区可能会更吸引学生。",
        html: "一些大学生觉得这个园区很可爱，但更像是<strong>为小孩子设计的</strong>。也有人提到，如果有<strong>学生折扣</strong>，或者有<strong>更多适合拍照的地点</strong>，园区可能会更吸引学生。",
      },
      {
        text: "看完这些材料后，你将继续进入和经理的第二次对话。",
        html: "看完这些材料后，你将继续进入<strong>和经理的第二次对话</strong>。",
      },
    ];
  }

  function getSectionItems(section) {
    if (section.items) return section.items;
    return (section.groups || []).flatMap((group) => group.items || []);
  }

  function recordInteraction(stage, speaker, message, participantDecision) {
    const row = {
      prolific_pid: ids.prolific_pid,
      study_id: ids.study_id,
      session_id: ids.session_id,
      language,
      assigned_condition: condition,
      manipulation_version: manipulationVersion,
      stage,
      speaker: speaker.toLowerCase(),
      message,
      timestamp: timestamp(),
      response_order: String(++responseOrder),
      participant_decision: participantDecision || "",
    };
    participant.experiment_end_time = row.timestamp;
    interactionBackup.push(row);
    persistLocal();
    postJson("/interaction", row);
    saveParticipant();
  }

  function saveParticipant() {
    participant.experiment_end_time = timestamp();
    persistLocal();
    postJson("/participant", participant);
  }

  function persistLocal() {
    const payload = {
      ...participant,
      language,
      response_order: responseOrder,
      interactions: interactionBackup,
    };
    try {
      window.localStorage.setItem(sessionKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Unable to write local backup.", error);
    }
  }

  function readStoredSession() {
    try {
      return JSON.parse(window.localStorage.getItem(sessionKey) || "{}");
    } catch (error) {
      return {};
    }
  }

  function postJson(path, payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(`${dataEndpoint}${path}`, blob)) return;
    }
    fetch(`${dataEndpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // The local backup remains available if the data server is not running.
    });
  }

  function timestamp() {
    return new Date().toISOString();
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function installForwardOnlyNavigation() {
    if (!window.history || !window.history.pushState || !window.history.replaceState) return;
    reinforceForwardOnlyHistory();
    window.addEventListener("popstate", () => {
      try {
        window.history.forward();
      } catch (error) {
        console.warn("Unable to force forward navigation.", error);
      }
      reinforceForwardOnlyHistory();
      window.setTimeout(reinforceForwardOnlyHistory, 0);
      window.setTimeout(() => {
        try {
          window.history.forward();
        } catch (error) {
          console.warn("Unable to force forward navigation.", error);
        }
      }, 20);
      window.setTimeout(reinforceForwardOnlyHistory, 80);
    });
    window.addEventListener("pageshow", () => {
      reinforceForwardOnlyHistory();
    });
  }

  function reinforceForwardOnlyHistory() {
    if (!window.history || !window.history.pushState || !window.history.replaceState) return;
    const guardUrl = window.location.href;
    const guardState = {
      experimentForwardOnly: true,
      stage: participant.forward_only_stage || state.part || "current",
      timestamp: Date.now(),
    };
    try {
      window.history.replaceState(guardState, "", guardUrl);
      for (let index = 0; index < 6; index += 1) {
        window.history.pushState(guardState, "", guardUrl);
      }
    } catch (error) {
      console.warn("Unable to reinforce forward-only navigation guard.", error);
    }
  }

  function markForwardStage(stage) {
    if (!Object.prototype.hasOwnProperty.call(forwardStageOrder, stage)) return;
    const currentStage = participant.forward_only_stage || "human_verification";
    const currentRank = forwardStageOrder[currentStage] ?? 0;
    const nextRank = forwardStageOrder[stage];
    if (nextRank >= currentRank) {
      participant.forward_only_stage = stage;
      persistLocal();
      reinforceForwardOnlyHistory();
    }
  }

  function resumeStageFromStoredSession() {
    const savedStage = storedSession.forward_only_stage || "";
    const savedRank = forwardStageOrder[savedStage] ?? 0;
    if (skipTo && hasRestorableChatTranscript(savedStage)) {
      return savedStage;
    }
    if (skipTo) return "";
    if (storedSession.completion_status === "completed") {
      return "completion";
    }
    if (savedStage === "task_feedback") return "task_feedback";
    if (storedSession.completed_ai_check === "true") {
      return "task_feedback";
    }
    if (storedSession.completed_post_interaction_survey === "true") {
      return "ai_check";
    }
    if (
      storedSession.completed_neutral_manager_followup === "true" ||
      storedSession.completed_neutral_manager_followup === "skipped"
    ) {
      return "survey";
    }
    if (storedSession.completed_transition_page === "true" && savedRank <= forwardStageOrder.transition) {
      return "materialDecision";
    }
    if (storedSession.completed_initial_manager_interaction === "true" && savedRank <= forwardStageOrder.manager1) {
      return "transition";
    }
    if (storedSession.completed_prechat === "true" && savedRank <= forwardStageOrder.prechat) {
      return "briefing";
    }
    if (savedStage && savedRank > 0) return savedStage;
    return "";
  }

  function hasRestorableChatTranscript(stage) {
    if (!["prechat", "manager1", "lisaJohn", "manager2"].includes(stage)) return false;
    const stageNames = restoredChatStageNames(stage);
    return interactionBackup.some((row) => row && stageNames.includes(row.stage) && row.message);
  }

  function renderResumeStage(stage) {
    if (stage === "prechat_intro") return renderPreRoomIntro();
    if (stage === "prechat") return renderRestoredChatRoom("prechat");
    if (stage === "briefing") return renderBriefing();
    if (stage === "manager1") return renderRestoredChatRoom("manager1");
    if (stage === "transition") return renderTransition(0);
    if (stage === "materialDecision") return renderMaterialManagerDecision();
    if (stage === "lisaJohn") return renderRestoredChatRoom("lisaJohn");
    if (stage === "manager2") return renderRestoredChatRoom("manager2");
    if (stage === "survey") return renderPostInteractionSurvey();
    if (stage === "ai_check") return renderAiCheckPage();
    if (stage === "task_feedback") return renderTaskFeedbackPage();
    if (stage === "completion") {
      return renderCompletionPage(
        inZh("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", "你已完成这一部分。请点击“下一步”进入下一页。"),
        participant.completed_neutral_manager_followup === "true",
        false
      );
    }
    return renderHumanVerification();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.addEventListener("beforeunload", (event) => {
    participant.experiment_end_time = timestamp();
    persistLocal();
    postJson("/participant", participant);
    if (!allowStudyExit && participant.completion_status !== "completed") {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
    return undefined;
  });

  installForwardOnlyNavigation();
  saveParticipant();
  const resumeStage = resumeStageFromStoredSession();
  if (resumeStage) {
    renderResumeStage(resumeStage);
  } else if (skipTo === "prechat") {
    renderPrechat();
  } else if (skipTo === "survey") {
    renderPostInteractionSurvey();
  } else if (skipTo === "ai_check" || skipTo === "robot_check") {
    renderAiCheckPage();
  } else if (skipTo === "task_feedback" || skipTo === "feedback") {
    renderTaskFeedbackPage();
  } else if (skipTo === "briefing") {
    renderBriefing();
  } else if (skipTo === "manager" || skipTo === "manager_chat" || skipTo === "manager1") {
    renderManagerChat();
  } else if (
    skipTo === "rejection" ||
    skipTo === "manager_rejection" ||
    skipTo === "manager1_rejection"
  ) {
    renderManagerRejectionTest();
  } else if (skipTo === "transition") {
    renderSecondMaterialsIntro();
  } else if (
    skipTo === "coworker" ||
    skipTo === "coworkers" ||
    skipTo === "lisa_john" ||
    skipTo === "lisajohn"
  ) {
    renderLisaJohnChat();
  } else if (skipTo === "manager2" || skipTo === "neutral_manager" || skipTo === "neutral") {
    renderNeutralManagerChat();
  } else {
    renderHumanVerification();
  }
})();
