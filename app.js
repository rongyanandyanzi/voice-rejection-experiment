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
  const ids = {
    prolific_pid: params.get("PROLIFIC_PID") || "missing",
    study_id: params.get("STUDY_ID") || "missing",
    session_id: params.get("SESSION_ID") || "missing",
  };
  const completionRedirectUrl = params.get("completion_url") || params.get("redirect_url") || params.get("return_url") || "";
  const sessionKey = `voice-rejection:${ids.prolific_pid}:${ids.study_id}:${ids.session_id}`;
  const storedSession = readStoredSession();
  const skipTo = (params.get("skip_to") || "").toLowerCase();
  const requestedCondition = normalizeCondition(params.get("condition"));
  const condition = requestedCondition || storedSession.assigned_condition || pick(conditionLabels);
  const conditionSource = requestedCondition ? "url" : (storedSession.condition_source || "random_assignment");
  const dataEndpoint = `${window.location.protocol === "file:" ? "http://localhost:8787" : window.location.origin}/api`;
  let responseOrder = Number(storedSession.response_order || 0);
  let allowStudyExit = false;
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
    completion: 11,
  };

  const state = {
    part: "prechat",
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
    lastManagerShowedTyping: false,
    busy: false,
  };

  const participant = {
    prolific_pid: ids.prolific_pid,
    study_id: ids.study_id,
    session_id: ids.session_id,
    assigned_condition: condition,
    condition_source: conditionSource,
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
    completed_ai_check: storedSession.completed_ai_check || "false",
    ai_check_start_time: storedSession.ai_check_start_time || "",
    ai_check_submit_time: storedSession.ai_check_submit_time || "",
    manager_ai_suspicion: storedSession.manager_ai_suspicion || "",
    lisa_ai_suspicion: storedSession.lisa_ai_suspicion || "",
    john_ai_suspicion: storedSession.john_ai_suspicion || "",
    completion_status: storedSession.completion_status || "partial",
    forward_only_stage: storedSession.forward_only_stage || "human_verification",
  };
  const interactionBackup = Array.isArray(storedSession.interactions) ? storedSession.interactions : [];

  const likertOptions = [
    "Strongly disagree",
    "Disagree",
    "Neither agree nor disagree",
    "Agree",
    "Strongly agree",
  ];
  const surveySections = [
    {
      title: "Future Communication Intentions",
      instruction: "Before receiving the manager's feedback, please indicate your next steps and how you intend to proceed with your proposal.",
      items: [
        { id: "VF1", text: "I will take the initiative multiple times to propose specific improvements for attracting more visitors during off-season weekdays." },
        { id: "VF2", text: "I will make a point to suggest new ways to attract nearby university students." },
        { id: "VF3", text: "Even if the manager seems dismissive, I will persist in communicating my alternative views on how the park can improve off-season weekday attendance." },
        { id: "VF4", text: "I will take every opportunity during the session to share proactive ideas on expanding the park's visitor base beyond families with young children." },
        { id: "VF5", text: "I will be a lead contributor throughout the discussion regarding how to attract nearby university students and make better use of the park's surrounding environment." },
        { id: "VF6", text: "I will repeatedly offer my own constructive suggestions and ideas to improve the park's visitor strategy during off-season weekdays." },
      ],
    },
    {
      title: "Proposal Preparation Intentions",
      instruction: "Before receiving the manager's feedback, please indicate how you intend to improve the quality of your proposal.",
      items: [
        { id: "VQ1", text: "When presenting my suggestion, I will strive to showcase a well-researched proposal backed by entrance records, visitor comments, and location information." },
        { id: "VQ2", text: "When offering my opinions, I will make every effort to address the manager's specific concerns regarding visitor demand, feasibility, and park operations." },
        { id: "VQ3", text: "When proposing ways to attract nearby university students, I will attempt to clarify any doubts the manager might have about whether this visitor group is suitable for the park." },
        { id: "VQ4", text: "When pointing out the limitations of relying mainly on families with young children, I will prepare a clear, actionable solution for the manager." },
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
        { id: "MA1", text: "Polite." },
        { id: "MA2", text: "Respectful." },
        { id: "MA3", text: "Sensitive to my feelings." },
        { id: "MA4", text: "Respectful toward me." },
        { id: "MA5", text: "Justified." },
        { id: "MA6", text: "Courteous." },
        { id: "MA7", text: "Considerate toward me." },
        { id: "MA8", text: "Tactful." },
      ],
    },
    {
      title: "Perceived Usefulness of Manager Response",
      instruction: "Please indicate how you perceived the manager's response when they rejected your suggestion about the labor plan.",
      instructionRed: true,
      stem: "When rejecting my suggestion, the manager...",
      items: [
        { id: "MC1", text: "Focused on identifiable problems and behaviors upon which I can take action." },
        { id: "MC2", text: "Suggested that my weaknesses can be overcome or remedied." },
        { id: "MC3", text: "Made reference to clear, legitimate standards for acceptable behavior." },
        { id: "MC4", text: "Was very specific and detailed." },
        { id: "MC5", text: "Made reference to specific situations or incidents that were problematic." },
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
    { speaker: "System", shuffleGroup: "prechatParticipantJoin", text: "Participant 1 has joined the room.", delay: 800 },
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
      shuffleGroup: "prechatParticipantIntro",
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

  const prechatAfterIntro = [
    {
      speaker: "Coordinator",
      text: [
        "I’ll now explain the task briefly.",
        "I’ll give a short overview of the task now.",
        "I’ll quickly explain what will happen next.",
      ],
      delay: 1500,
    },
    {
      speaker: "Coordinator",
      text: [
        "This task is run by a market research company.",
        "This is part of an online customer feedback task.",
        "The session is run as a customer feedback task.",
      ],
      delay: 2300,
    },
    {
      speaker: "Coordinator",
      text: [
        "You will take part in a two-person discussion about how a theme park could improve its service.",
        "You will join a two-person discussion about how a theme park could improve its service.",
        "You will participate in a two-person discussion about how a theme park could improve its service.",
      ],
      delay: 2100,
    },
    {
      speaker: "Coordinator",
      text: [
        "Each person will be randomly assigned a role.",
        "Roles will be assigned randomly.",
        "The system will randomly assign roles.",
      ],
      delay: 2200,
    },
    {
      speaker: "Coordinator",
      text: [
        "One person will be the park manager, and the other person will be an operations team member.",
        "One participant will be the park manager, and the other will be an operations team member.",
        "There will be one park manager and one operations team member.",
      ],
      delay: 1500,
    },
    {
      speaker: "Coordinator",
      text: [
        "Please read your own role materials carefully and respond based on your assigned role.",
        "Please read the role materials carefully and respond in the chat based on the role you receive.",
        "Once your role appears, please focus on your own materials and respond according to that role.",
      ],
      delay: 1800,
    },
    {
      speaker: "Coordinator",
      text: [
        "Before I assign the roles, does anyone have any quick questions about the task?",
        "Before the role assignment, does anyone have any quick questions?",
        "I’ll pause briefly before assigning roles. Any quick questions about the task?",
      ],
      delay: 1800,
    },
  ];

  const prechatRoleAssignment = [
    { speaker: "System", text: "Randomly assigning team roles...", delay: 900 },
    { speaker: "System", text: "Participant 1 has been assigned the role of Park Manager.", delay: 800 },
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
        { type: "p", text: "In this role, your main responsibilities include checking tickets at the entrance, scanning QR codes, confirming visitor categories, guiding visitors into the park, and answering simple questions from families." },
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
        { type: "p", text: "The current full-time staffing plan was developed by park management. However, you recognize that its lack of flexibility is driving labor costs to a breaking point." },
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
        { type: "p", text: "Although proposing staffing changes is not required by your role, you still want to suggest a change to the current procedure in order to improve the theme park’s performance." },
        { type: "p", text: "You may advocate for the implementation of a flexible labor model. This is a sensitive topic because the existing “all-permanent” staffing strategy is currently treated as the official plan." },
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
          text: "After reviewing this situation, you can decide whether you want to discuss your thoughts about it with the manager.",
          html: "After reviewing this situation, you can decide whether you want to <strong>discuss your thoughts about it with the manager</strong>.",
        },
      ],
    },
  ];

  let messagesEl = null;
  let composerEl = null;
  let inputEl = null;

  function renderHumanVerification() {
    markForwardStage("human_verification");
    state.part = "human_verification";
    state.humanCheckVerified = false;
    const humanCheckNumbers = [randomBetween(2, 8), randomBetween(2, 8)];
    state.humanCheckAnswer = String(humanCheckNumbers[0] + humanCheckNumbers[1]);
    saveParticipant();
    recordInteraction("human_verification", "system", "Quick verification page displayed.", "");

    screen.innerHTML = `
      <article class="page">
        <h1>Quick Verification</h1>
        <p>Please complete this quick check before entering the task.</p>
        <form id="human-check-form" class="human-check" novalidate>
          <label for="human-check-answer">What is ${humanCheckNumbers[0]} + ${humanCheckNumbers[1]}?</label>
          <div class="human-check-row">
            <input id="human-check-answer" name="human_check_answer" inputmode="numeric" autocomplete="off" required>
            <button class="button" type="submit">Continue</button>
          </div>
          <p class="validation-message" id="human-check-validation" aria-live="polite"></p>
        </form>
      </article>
    `;

    document.getElementById("human-check-form").addEventListener("submit", handleHumanCheckSubmit);
  }

  function handleHumanCheckSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const validation = document.getElementById("human-check-validation");
    const answer = (form.elements.human_check_answer.value || "").trim();

    if (answer !== state.humanCheckAnswer) {
      validation.textContent = "Please check your answer and try again.";
      recordInteraction("human_verification", "system", "Quick verification answer was incorrect.", "");
      return;
    }

    state.humanCheckVerified = true;
    recordInteraction("human_verification", "system", "Quick verification completed.", "");
    renderPreRoomIntro();
  }

  function renderPreRoomIntro() {
    markForwardStage("prechat_intro");
    state.part = "prechat_intro";
    clearPrechatTimers();
    saveParticipant();
    screen.innerHTML = `
      <article class="page">
        <h1>Online Customer Feedback Task</h1>
        <p>Thanks for taking part in this online customer feedback task.</p>
        <p>This session is run by a market research company that helps clients review customer feedback and improve service experiences.</p>
        <p>You will now enter an online task room with another participant. A session coordinator will welcome the group and explain what to do.</p>
        <p>During the task, you will be asked to read a short scenario, review role-specific materials, and take part in team discussions.</p>
        <p>Please stay on the page during the interaction and respond naturally in the chat.</p>
        <form id="pre-room-check-form" class="comprehension-check" novalidate>
          <fieldset>
            <legend>What is this online task mainly about?</legend>
            <div class="choice-list">
              <label class="choice-option">
                <input type="radio" name="pre_room_check" value="customer_feedback">
                Reviewing customer feedback and service improvement issues
              </label>
              <label class="choice-option">
                <input type="radio" name="pre_room_check" value="personal_profile">
                Sharing detailed personal background information
              </label>
            </div>
          </fieldset>
          <p class="check-error" id="pre-room-check-error" aria-live="polite"></p>
          <p>Click “Continue” when you are ready to enter the online task room.</p>
          <div class="actions">
            <button class="button" type="submit" id="enter-prechat">Continue</button>
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
      error.textContent = "Please choose one answer before continuing.";
      return;
    }

    if (selected !== "customer_feedback") {
      error.textContent = "Please review the information above and try again.";
      recordInteraction("prechat_intro", "system", "Pre-room task check answer was incorrect.", "");
      return;
    }

    recordInteraction("prechat_intro", "system", "Pre-room task check completed.", "");
    renderPrechat();
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
    createChat("Online Task Room", "Connecting...", true);
    setComposerEnabled(true);
    state.prechatSequenceRunning = true;
    await runPrechatSequence(prechatBeforeIntro);
    state.prechatSequenceRunning = false;
    state.prechatAwaitingIntro = true;
    setStatus("Waiting for Participant 2");
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
            <button class="button" type="submit">${pageIndex === briefingPages.length - 1 ? "Start Chat" : "Next"}</button>
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
      error.textContent = "Please choose one answer before continuing.";
      return;
    }
    if (selected.value !== page.check.correct) {
      error.textContent = "Please review the information above and try again.";
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
    createChat("Manager Chat", "Manager online", true);
    state.managerTurnActive = true;
    await sendDelayed("Manager", "manager", "Hi, I have been assigned as the Park Manager for this online task, and I will evaluate your performance as an Operations Team Member.", null, { opening: true });
    await sendDelayed("Manager", "manager", "That evaluation may affect your compensation after the task.", null, { opening: true });
    await sendDelayed("Manager", "manager", "Based on the information you receive, what do you think the theme park should do next?", null, { opening: true });
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
          <textarea id="chat-input" rows="2" placeholder="Type your message..." ${canType ? "" : "disabled"}></textarea>
          <button class="button" type="submit" ${canType ? "" : "disabled"}>Send</button>
        </form>
      </section>
    `;
    messagesEl = document.getElementById("messages");
    composerEl = document.getElementById("composer");
    inputEl = document.getElementById("chat-input");
    composerEl.addEventListener("submit", handleSubmit);
  }

  function renderRestoredChatRoom(stage) {
    const chatMeta = restoredChatMeta(stage);
    state.part = stage;
    createChat(chatMeta.title, "Chat restored after refresh", false);
    if (inputEl) {
      inputEl.placeholder = "Chat restored after refresh";
    }
    const restoreMessage = "Please continue from the current task room. Your previous chat messages are shown below.";
    showRestoreModal(restoreMessage, () => {
      setStatus(restoredChatStatus(stage));
      if (inputEl) inputEl.placeholder = "Type your message...";
      setComposerEnabled(true);
    });
    addRestoredNotice(restoreMessage);
    const rows = restoredChatRows(stage);
    if (!rows.length) {
      addRestoredNotice("No previous chat messages were found for this task room.");
      return;
    }
    rows.forEach(addRestoredChatRow);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function restoredChatMeta(stage) {
    if (stage === "prechat") return { title: "Online Task Room" };
    if (stage === "manager1" || stage === "manager2") return { title: "Manager Chat" };
    if (stage === "lisaJohn") return { title: "Coworker Chat" };
    return { title: "Chat Room" };
  }

  function restoredChatStatus(stage) {
    if (stage === "prechat") return "Waiting for Participant 2";
    if (stage === "manager1" || stage === "manager2") return "Manager online";
    if (stage === "lisaJohn") return "Coworkers online";
    return "Online";
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
        <h2 id="restore-modal-title">Chat Restored</h2>
        <p>${escapeHtml(text)}</p>
        <button class="button" type="button" id="restore-modal-continue">Continue</button>
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
        <span class="speaker">${escapeHtml(speaker)}</span>
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

    if (state.prechatAwaitingIntro && !state.prechatIntroReceived && isPrechatQuestion(text)) {
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
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

    if (state.prechatAwaitingIntro && !state.prechatIntroReceived) {
      state.prechatIntroReceived = true;
      state.prechatAwaitingIntro = false;
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
      await sendPrechatMessage({ speaker: "Coordinator", text: "Great, everyone. We’ll keep moving.", delay: 1200 });
      await runPrechatSequence(prechatAfterIntro);
      await answerQueuedPrechatInputs();
      state.prechatSequenceRunning = false;
      openPrechatQuestionWindow();
      return;
    }

    if (state.prechatAwaitingQuestions && !state.prechatQuestionWindowComplete) {
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
      const questionIntent = await getPrechatQuestionIntent(text);
      if (questionIntent === "unknown") {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        setApiConnectionIssue();
        return;
      }
      if (questionIntent === "no_question") {
        state.prechatParticipant2AnsweredQuestions = true;
        await continueAfterPrechatQuestions();
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
    return state.prechatQueuedInputs.some((text) => !isPrechatQuestion(text));
  }

  async function sendPrechatMessage(item) {
    const text = resolvePrechatText(item.text);
    const totalDelay = prechatMessageDelay(item, text);
    if (item.speaker !== "System") {
      await showTypingBeforeMessage(item.speaker, speakerClassName(item.speaker), text, totalDelay);
    } else {
      await delay(totalDelay);
    }
    addPrechatMessage(item.speaker, text);
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
    const reminder = window.setTimeout(async () => {
      if (!state.prechatAwaitingIntro || state.prechatIntroReceived || state.prechatComplete) return;
      state.prechatReminderShown = true;
      await sendPrechatMessage({ speaker: "Coordinator", text: "Participant 2, could you please type a quick hello so we know your chat is working?", delay: 500 });
      const continueTimer = window.setTimeout(async () => {
        if (!state.prechatAwaitingIntro || state.prechatIntroReceived || state.prechatComplete) return;
        state.prechatAwaitingIntro = false;
        state.prechatSequenceRunning = true;
        await sendPrechatMessage({ speaker: "Coordinator", text: "No problem, we’ll continue so the session does not get held up.", delay: 1200 });
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
    setStatus("Waiting for questions");
    setComposerEnabled(true);
    clearPrechatTimers();
    const participant1Timer = window.setTimeout(async () => {
      if (!state.prechatAwaitingQuestions || state.prechatQuestionWindowComplete || state.prechatComplete) return;
      state.prechatSequenceRunning = true;
      await sendPrechatNoQuestionMessages();
      if (state.prechatQueuedInputs.length) {
        state.prechatSequenceRunning = false;
        setComposerEnabled(true);
        handlePrechatInput(state.prechatQueuedInputs.shift());
        return;
      }
      state.prechatSequenceRunning = false;
      setComposerEnabled(true);
      const participant2PromptTimer = window.setTimeout(async () => {
        if (!state.prechatAwaitingQuestions || state.prechatQuestionWindowComplete || state.prechatComplete) return;
        state.prechatSequenceRunning = true;
        if (state.prechatQueuedInputs.length) {
          state.prechatSequenceRunning = false;
          setComposerEnabled(true);
          handlePrechatInput(state.prechatQueuedInputs.shift());
          return;
        }
        if (!state.prechatParticipant2AnsweredQuestions) {
          await sendPrechatParticipant2QuestionPrompt();
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

  async function sendPrechatParticipant2QuestionPrompt() {
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        "Participant 2, do you have any quick questions before I assign the roles?",
        "Participant 2, any quick questions from you before I assign the roles?",
        "Participant 2, anything you want to ask before I assign the roles?",
      ],
      delay: 1000,
    });
  }

  async function sendPrechatParticipant2MoreQuestionsPrompt() {
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        "Do you have any other questions before I assign the roles?",
        "Any other quick questions before I assign the roles?",
        "Anything else you want to ask before I assign the roles?",
      ],
      delay: 1000,
    });
  }

  async function sendPrechatNoQuestionMessages() {
    const options = {
      "Participant 1": [
        "No questions from me.",
        "Nothing from me at the moment.",
        "No questions on my side.",
      ],
    };
    for (const speaker of shuffled(["Participant 1"], "prechatNoQuestions")) {
      await sendPrechatMessage({ speaker, text: options[speaker], delay: 1200 });
    }
    state.prechatOtherParticipantsAnsweredNoQuestions = true;
  }

  async function sendPrechatRoleAssignmentIntro() {
    await sendPrechatMessage({
      speaker: "Coordinator",
      text: [
        "No problem, I’ll assign the roles now.",
        "Okay, I’ll go ahead and assign the roles now.",
        "That’s fine. I’ll continue with the role assignment now.",
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
    setStatus("Role materials ready");
    setComposerEnabled(false);
    participant.completed_prechat = "true";
    saveParticipant();
    renderNextAction("Please click “Next” when you are ready to continue to your individual role materials.", renderBriefing, "prechat");
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
      if (await getPrechatQuestionIntent(text) === "has_question") {
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

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const isParticipant = /^Participant [123]$/.test(speaker);
    const wordsPerMinute = randomBetween(40, 53);
    const typingDelay = Math.round((wordCount / wordsPerMinute) * 60000);
    const readingPause = randomBetween(1200, 2600);
    const turnTakingPause = isParticipant ? randomBetween(900, 1800) : randomBetween(500, 1400);
    const rawDelay = Math.min(32000, Math.max(3500, typingDelay + readingPause + turnTakingPause));
    return rawDelay;
  }

  function isPrechatQuestion(text) {
    const normalized = text.trim().toLowerCase();
    return /\?$/.test(normalized) ||
      /^(do|what|why|are|is|will|should|can|could|am|who|where|how)\b/.test(normalized) ||
      /(real name|share my name|share location|rather not|don't want|do not want|other participants|real people|what role|roles random|answers be evaluated|theme park experience|chat is slow)/i.test(normalized);
  }

  async function getPrechatQuestionIntent(text) {
    try {
      const response = await fetch(`${dataEndpoint}/prechat-question-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.ok && ["no_question", "has_question", "other"].includes(data.intent)) {
        return data.intent;
      }
    } catch (error) {
      console.warn("Unable to classify prechat question response.", error);
    }
    return "unknown";
  }

  // After the manager has rejected, treat a short acknowledgement or a clear
  // sign of disengagement as the participant accepting the outcome, so the
  // manager can close gracefully instead of re-rejecting indefinitely.
  function isManagerAcceptance(text) {
    const t = text.trim().toLowerCase().replace(/[.!,\s]+$/, "");
    if (!t) return false;
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    const ackStart = /^(ok|okay|k|kk|fine|alright|all ?right|sure|got it|gotcha|understood|i understand|i see|noted|fair|fair enough|no problem|np|makes sense|i get it|thanks|thank you|cheers|ok thanks)\b/.test(t);
    const closure = /(nothing else|that'?s all|that is all|no more|no further questions?|i'?ll think about it|i will think about it|i'?ll revise|leave it|forget it|never ?mind|that'?s fine)/.test(t);
    return (ackStart && wordCount <= 6) || closure;
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
      const sent = await sendAiMessages({
        stage: "manager1",
        phase: "discussion",
        condition,
        alexMessage: text,
        followupsAsked: state.managerFollowupsAsked,
      });
      if (!sent) {
        state.managerDiscussionTurns -= 1;
        finishManagerTurn();
        return;
      }
      const intent = state.lastAiIntent;
      if (intent === "reject_now") {
        // The discussion turn already delivered the first rejection message.
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
      const windDown = isManagerAcceptance(text) || state.managerRejectionRound >= 12;
      if (windDown) {
        const sent = await sendAiMessages({
          stage: "manager1",
          phase: "closing",
          condition,
          alexMessage: text,
        });
        if (!sent) {
          finishManagerTurn();
          return;
        }
        setStatus("Manager offline");
        addSystemNote("Manager left the chat and is now offline.");
        lockManagerChat();
        participant.completed_initial_manager_interaction = "true";
        saveParticipant();
        renderNextAction("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", () => renderTransition(0), "initial_manager_interaction");
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
    const sent = await sendAiMessages({
      stage: "manager1",
      phase: "closing",
      condition,
      alexMessage: decisionText || "End chat and proceed",
    });
    if (!sent) {
      state.managerTurnActive = false;
      setComposerEnabled(true);
      return;
    }
    setStatus("Manager offline");
    addSystemNote("Manager left the chat and is now offline.");
    lockManagerChat();
    participant.completed_initial_manager_interaction = "true";
    saveParticipant();
    renderNextAction("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", () => renderTransition(0), "initial_manager_interaction");
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
          <button class="button" type="button" id="transition-next">${pageIndex === transitionPages.length - 1 ? "Continue" : "Next"}</button>
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
    const prompt = "Do you want to discuss your thoughts about this situation with the manager?";
    recordInteraction("material_manager_decision", "system", prompt, "");
    screen.innerHTML = `
      <article class="page transition-page">
        <p class="briefing-progress">Decision</p>
        <h1>Manager Chat</h1>
        <p>${escapeHtml(prompt)}</p>
        <div class="actions">
          <button class="button" type="button" id="material-decision-yes">Yes</button>
          <button class="button secondary" type="button" id="material-decision-no">No</button>
        </div>
      </article>
    `;
    document.getElementById("material-decision-yes").addEventListener("click", () => handleMaterialManagerDecision("yes"));
    document.getElementById("material-decision-no").addEventListener("click", () => handleMaterialManagerDecision("no"));
  }

  function handleMaterialManagerDecision(decision) {
    recordInteraction("material_manager_decision", "alex", decision, decision);
    participant.chose_to_bring_this_up_with_manager = decision;
    participant.completed_lisa_john_interaction = "skipped";
    participant.experiment_end_time = timestamp();
    participant.completion_status = "partial";
    saveParticipant();
    if (decision === "yes") {
      renderNeutralManagerChat();
      return;
    }
    participant.completed_neutral_manager_followup = "skipped";
    saveParticipant();
    renderPostInteractionSurvey();
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
    createChat("Coworker Chat", "Coworkers online", true);
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
    recordInteraction("decision_prompt", "system", "Do you want to talk with the manager now?", "");
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>Do you want to talk with the manager now?</p>
      <div class="actions">
        <button class="button" type="button" id="decision-yes">Yes</button>
        <button class="button secondary" type="button" id="decision-no">No</button>
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
          <h1>Interaction Complete</h1>
          <p>${escapeHtml(message)}</p>
          <div class="actions">
            <button class="button" type="button" id="completion-next">Next</button>
          </div>
        </article>
      `;
    document.getElementById("completion-next").addEventListener("click", handleCompletionNext);
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
        <h1>Thank You</h1>
        <p>Your responses have been submitted. You may now close this page.</p>
        <div class="actions">
          <button class="button" type="button" disabled>Done</button>
        </div>
      </article>
    `;
  }

  async function renderNeutralManagerChat() {
    markForwardStage("manager2");
    state.part = "manager2";
    state.neutralQuestionCount = 0;
    state.neutralDone = false;
    state.managerTurnActive = false;
    state.pendingManagerInput = "";
    saveParticipant();
    createChat("Manager Chat", "Manager online", true);
    setComposerEnabled(true);
    addSystemNote("You are now in a new chat with the manager. Please type what you would like to say.");
    state.managerTurnActive = true;
    await sendAiMessages({ stage: "manager2", phase: "opening", alexMessage: "" });
    finishManagerTurn();
  }

  async function handleNeutralManagerInput(text) {
    if (state.neutralDone) return;
    state.managerTurnActive = true;

    // Ask at most three follow-up questions. After that, the manager sends a
    // brief neutral wrap-up and the participant can proceed.
    if (state.neutralQuestionCount >= 3) {
      const sent = await sendAiMessages({
        stage: "manager2",
        phase: "closing",
        alexMessage: text,
      });
      state.managerTurnActive = false;
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
    if (state.pendingManagerInput) {
      const pendingText = state.pendingManagerInput;
      state.pendingManagerInput = "";
      return handleNeutralManagerInput(pendingText);
    }
    // The manager wraps up early once it judges it has enough (e.g. the
    // participant already gave a detailed proposal).
    if (state.lastAiIntent === "enough") {
      showNeutralProceedChoice();
    }
  }

  function showNeutralProceedChoice() {
    if (state.neutralDone) return;
    setComposerEnabled(false);
    const question = "Do you want to proceed to the next page?";
    recordInteraction("neutral_manager_followup", "system", question, "");
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>${escapeHtml(question)}</p>
      <div class="actions">
        <button class="button secondary" type="button" id="neutral-continue">Keep talking with the manager</button>
        <button class="button" type="button" id="neutral-proceed">Proceed to the next page</button>
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

  function renderPostInteractionSurvey() {
    markForwardStage("survey");
    state.part = "survey";
    state.surveyStartTime = timestamp();
    participant.completed_post_interaction_survey = "false";
    participant.survey_completion_status = "partial";
    participant.survey_start_time = state.surveyStartTime;
    participant.survey_submit_time = "";
    participant.experiment_end_time = state.surveyStartTime;
    participant.completion_status = "partial";
    saveParticipant();
    recordInteraction("post_interaction_survey", "system", "Post-Interaction Questions page displayed.", "");

    screen.innerHTML = `
      <article class="page survey-page">
        <h1>Post-Interaction Questions</h1>
        <p>Please answer the following questions based on your experience in this study. There are no right or wrong answers. Please indicate the extent to which you agree with each statement.</p>
        <form id="survey-form" novalidate>
          ${surveySections.map(renderSurveySection).join("")}
          <p class="validation-message" id="survey-validation" aria-live="polite"></p>
          <div class="survey-submit">
            <button class="button" type="submit">Submit</button>
          </div>
        </form>
      </article>
    `;

    document.getElementById("survey-form").addEventListener("submit", handleSurveySubmit);
  }

  function renderSurveySection(section) {
    const groups = section.groups || [{ label: "", items: section.items || [] }];
    const options = section.options || likertOptions;
    return `
      <section class="survey-section">
        <h2>${escapeHtml(section.title)}</h2>
        <p${section.instructionRed ? ' style="color: #d32f2f;"' : ""}>${formatSurveyInstruction(section.instruction)}</p>
        ${section.stem ? `<p class="survey-stem">${escapeHtml(section.stem)}</p>` : ""}
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
          <div role="columnheader">Item</div>
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

  function handleSurveySubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const validation = document.getElementById("survey-validation");
    const missingResponse = surveyItemIds.some((id) => !form.elements[id] || !form.elements[id].value);

    if (missingResponse) {
      const message = "Please answer all questions before continuing.";
      validation.textContent = message;
      recordInteraction("post_interaction_survey", "system", message, "");
      return;
    }

    const submitTime = timestamp();
    const responses = {
      prolific_pid: ids.prolific_pid,
      study_id: ids.study_id,
      session_id: ids.session_id,
      assigned_condition: condition,
      condition_source: conditionSource,
      survey_start_time: state.surveyStartTime || participant.survey_start_time || submitTime,
      survey_submit_time: submitTime,
      survey_completion_status: "completed",
    };

    for (const id of surveyItemIds) {
      responses[id] = form.elements[id].value;
    }

    postJson("/survey", responses);
    participant.completed_post_interaction_survey = "true";
    participant.survey_completion_status = "completed";
    participant.survey_start_time = responses.survey_start_time;
    participant.survey_submit_time = submitTime;
    participant.experiment_end_time = submitTime;
    participant.completion_status = "partial";
    saveParticipant();
    renderAiCheckPage();
  }

  function renderAiCheckPage() {
    markForwardStage("ai_check");
    state.part = "ai_check";
    state.aiCheckStartTime = timestamp();
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
        <h1>One More Question</h1>
        <p>In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the questions below.</p>
        <form id="ai-check-form" novalidate>
          ${renderAiCheckQuestion("manager_ai_suspicion", "Do you think the manager you interacted with may have been AI?")}
          <p class="validation-message" id="ai-check-validation" aria-live="polite"></p>
          <div class="actions">
            <button class="button" type="submit">Submit</button>
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
            <span>Yes</span>
          </label>
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(name)}" value="no" required>
            <span>No</span>
          </label>
          <label class="choice-option">
            <input type="radio" name="${escapeHtml(name)}" value="not_sure" required>
            <span>Not sure</span>
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
      const message = "Please answer all questions before continuing.";
      validation.textContent = message;
      recordInteraction("ai_check", "system", message, "");
      return;
    }

    const submitTime = timestamp();
    participant.completed_ai_check = "true";
    participant.ai_check_start_time = state.aiCheckStartTime || participant.ai_check_start_time || submitTime;
    participant.ai_check_submit_time = submitTime;
    participant.manager_ai_suspicion = managerResponse;
    participant.lisa_ai_suspicion = lisaResponse;
    participant.john_ai_suspicion = johnResponse;
    participant.experiment_end_time = submitTime;
    participant.completion_status = "completed";
    saveParticipant();
    recordInteraction(
      "ai_check",
      "alex",
      `manager=${managerResponse}; lisa=${lisaResponse}; john=${johnResponse}`,
      ""
    );
    renderCompletionPage("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", participant.completed_neutral_manager_followup === "true");
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
        <span class="speaker">${escapeHtml(displaySpeaker)}</span>
        <span>${escapeHtml(displayText)}</span>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    recordInteraction(currentStage(), displaySpeaker, displayText, "");
  }

  async function sendDelayed(speaker, className, text, ms, opts = {}) {
    state.busy = true;
    if (className === "manager") {
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
    const result = await requestAiMessages(request);
    if (!result.ok) {
      console.warn(result.error || "The AI chat service is not available. Please check the server configuration.");
      setApiConnectionIssue();
      return false;
    }
    clearApiConnectionIssue();

    state.lastAiIntent = result.intent || "";

    let previousCoworkerText = "";
    for (const message of result.messages) {
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
      });
      if (isCoworkerClass(className)) previousCoworkerText = displayText;
    }
    return result.messages.length > 0;
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
    return cleanVisibleNames(String(text || "").replace(/[-\u2010-\u2015\u2212]/g, " ")).replace(/\s+/g, " ").trim();
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
    const retryMessage = "The chat connection had a brief issue. Please try again.";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`${dataEndpoint}/ai-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...request,
            condition,
            history: recentChatHistory(),
          }),
        });
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
        if (attempt === 0) {
          await delay(800);
          continue;
        }
        return { ok: false, error: retryMessage };
      }
    }
    return { ok: false, error: retryMessage };
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

  async function showTypingBeforeMessage(speaker, className, text, totalDelay) {
    const delayMs = Math.max(900, Number(totalDelay) || responseDelayForText(text));
    const thinkingDelay = Math.min(1400, Math.max(350, Math.round(delayMs * 0.35)));
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
        <span>${escapeHtml(displaySpeaker)} is typing...</span>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return row;
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

  function managerTimingPlan(text, opts = {}) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const showTyping = true;
    const wordsPerMinute = randomBetween(75, 85);
    const readingDelay = randomBetween(1200, 2600);
    // The scripted opening plays at half the normal manager pacing so the
    // participant is not stuck watching ~50s of typing before they can act.
    // Other manager turns (rejections, etc.) keep the normal pacing.
    const speedFactor = opts.opening ? 0.5 : 1;
    const totalDelay = Math.round(((wordCount / wordsPerMinute) * 60000 + readingDelay) * speedFactor);
    state.lastManagerShowedTyping = true;

    const thinkingDelay = opts.closing
      ? 2000
      : randomBetween(
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
        <button class="button" type="button" id="next-action">Next</button>
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
    const question = "Do you want to end the chat and proceed to the next task?";
    panel.innerHTML = `
      <p>${escapeHtml(question)}</p>
      <div class="actions">
        <button class="button" type="button" id="manager-exit-action">End chat and proceed</button>
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
      await completeInitialManagerInteraction("End chat and proceed");
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
    setStatus("Connection issue. Please send your message again.");
  }

  function clearApiConnectionIssue() {
    if (state.part === "prechat") {
      setStatus(state.prechatAwaitingQuestions ? "Waiting for questions" : "Waiting for Participant 2");
      return;
    }
    if (state.part === "manager1" || state.part === "manager2") {
      setStatus("Manager online");
      return;
    }
    if (state.part === "lisaJohn") {
      setStatus("Coworkers online");
    }
  }

  function normalizeCondition(value) {
    if (!value) return "";
    return conditionAliases[String(value).trim().toUpperCase()] || "";
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
    if (state.part === "completion") return "completion_page";
    return "initial_manager_interaction";
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
      assigned_condition: condition,
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
    if (storedSession.completed_ai_check === "true" || storedSession.completion_status === "completed") {
      return "completion";
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
    if (stage === "completion") {
      return renderCompletionPage(
        "You have completed this part of the interaction. Please click “Next” to proceed to the next page.",
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
  } else if (skipTo === "briefing") {
    renderBriefing();
  } else if (skipTo === "manager" || skipTo === "manager_chat" || skipTo === "manager1") {
    renderManagerChat();
  } else if (skipTo === "transition") {
    renderTransition(0);
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
