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
  const requestedCondition = normalizeCondition(params.get("condition"));
  const condition = requestedCondition || storedSession.assigned_condition || pick(conditionLabels);
  const conditionSource = requestedCondition ? "url" : (storedSession.condition_source || "random_assignment");
  const dataEndpoint = `${window.location.protocol === "file:" ? "http://localhost:8787" : window.location.origin}/api`;
  let responseOrder = Number(storedSession.response_order || 0);

  const state = {
    part: "prechat",
    prechatAwaitingIntro: false,
    prechatIntroReceived: false,
    prechatReminderShown: false,
    prechatComplete: false,
    prechatSequenceRunning: false,
    prechatQueuedInputs: [],
    prechatAwaitingQuestions: false,
    prechatQuestionWindowComplete: false,
    prechatTimers: [],
    secondPhase: "beforeProposal",
    neutralQuestionCount: 0,
    postSuggestionTurns: 0,
    managerAskedFollowup: false,
    managerRejected: false,
    managerRejectionRound: 0,
    managerClosingPending: false,
    managerChatLocked: false,
    managerTurnActive: false,
    pendingManagerInput: "",
    coworkerTurnActive: false,
    pendingCoworkerInputs: [],
    decisionShown: false,
    surveyStartTime: "",
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
  ];

  const surveyItemIds = surveySections.flatMap((section) => getSectionItems(section).map((item) => item.id));

  const prechatBeforeIntro = [
    { speaker: "System", text: "Connecting to the online study room...", delay: 700 },
    { speaker: "System", text: "Research Assistant has joined the room.", delay: 800 },
    {
      speaker: "RA",
      text: [
        "Hi everyone, welcome to the study. Thanks for joining today.",
        "Hi everyone, thanks for joining today. Welcome to the study.",
        "Hello everyone, welcome in. Thanks for joining the session today.",
      ],
      delay: 1600,
    },
    {
      speaker: "RA",
      text: [
        "We’ll give it a moment for everyone to connect.",
        "I’ll just give everyone a moment to get connected.",
        "Let’s wait briefly while the rest of the group joins.",
      ],
      delay: 1400,
    },
    { speaker: "System", text: "Participant 1 has joined the room.", delay: 800 },
    { speaker: "System", text: "Participant 2 has joined the room.", delay: 800 },
    { speaker: "System", text: "Participant 3 has joined the room.", delay: 800 },
    { speaker: "System", text: "You have joined the room as Participant 4.", delay: 800 },
    {
      speaker: "RA",
      text: [
        "Great, looks like everyone is here.",
        "Great, it looks like the full group is here now.",
        "Thanks everyone, it looks like we have the full group.",
      ],
      delay: 1500,
    },
    {
      speaker: "RA",
      text: [
        "Before we start, could everyone briefly introduce themselves? Just where you’re based and whether you’ve done online studies before is enough. No need to share anything too personal.",
        "Before we begin, could everyone give a quick introduction? Just being UK-based and whether you’ve done online studies before is enough. No personal details needed.",
        "Let’s do a quick round of introductions first. Please just say generally where you’re based and whether you’ve done Prolific or online studies before.",
      ],
      delay: 2100,
    },
    {
      speaker: "Participant 1",
      shuffleGroup: "prechatParticipantIntro",
      text: [
        "Hi everyone, I’m based in the UK. I’ve completed many Prolific studies before, mostly surveys and decision-making tasks.",
        "Hi all, I’m in the UK. I’ve done many Prolific studies, mostly survey-based ones and decision tasks.",
        "Hello everyone, I’m UK-based. I’m an experienced Prolific participant, though this group chat format is less common.",
      ],
      delay: 3000,
    },
    {
      speaker: "Participant 2",
      shuffleGroup: "prechatParticipantIntro",
      text: [
        "Hi all :) I’m based in the UK. I’ve done a lot of Prolific studies, mostly surveys and product feedback ones.",
        "Hi everyone :) I’m UK-based and have done many Prolific surveys before, mostly product feedback and short research tasks.",
        "Hey all, I’m in the UK. I’ve completed many Prolific studies, though live group chat ones are less common.",
      ],
      delay: 3200,
    },
    {
      speaker: "Participant 3",
      shuffleGroup: "prechatParticipantIntro",
      text: [
        "Hi everyone, I’m based in the UK. I’ve completed many Prolific studies before, mainly surveys and workplace studies.",
        "Hi all, I’m UK-based. I’ve done many Prolific studies, mostly surveys and decision-making tasks.",
        "Hello everyone. I’m in the UK and have extensive experience with online studies. This format is a bit different.",
      ],
      delay: 3200,
    },
    {
      speaker: "RA",
      text: [
        "Thanks everyone. Participant 4, could you also briefly introduce yourself?",
        "Thanks all. Participant 4, could you give a brief introduction as well?",
        "Thanks everyone. Participant 4, could you type a quick introduction too?",
      ],
      delay: 1800,
      skipIfParticipant4Introduced: true,
    },
  ];

  const prechatAfterIntro = [
    {
      speaker: "RA",
      text: [
        "I’ll now explain the task briefly.",
        "I’ll give a short overview of the task now.",
        "I’ll quickly explain what will happen next.",
      ],
      delay: 1500,
    },
    {
      speaker: "RA",
      text: [
        "This study is being conducted by a market research company. We are interested in how people discuss customer feedback and service improvement issues in a team setting.",
        "This is part of a market research project. The study looks at how people discuss customer feedback and service improvement in a team context.",
        "The study is run as a market research task. We’re interested in team discussion around customer feedback and service improvement issues.",
      ],
      delay: 2300,
    },
    {
      speaker: "RA",
      text: [
        "In today’s task, you will take part in a short online team interaction based on a large theme park scenario.",
        "For today’s task, you’ll take part in an online team interaction based on a large theme park scenario.",
        "The scenario for the task is set in a large theme park, and you’ll take part in the interaction online.",
      ],
      delay: 2100,
    },
    {
      speaker: "RA",
      text: [
        "The theme park has recently received customer feedback related to service efficiency, waiting time, and staffing during busy periods.",
        "In the scenario, the theme park has received feedback about service efficiency, wait times, and staffing during busy periods.",
        "The background is that the park has been getting customer feedback about waiting time, service efficiency, and staffing at busy times.",
      ],
      delay: 2200,
    },
    {
      speaker: "RA",
      text: [
        "Each person will be randomly assigned a role. One person will be the park manager, and the other three people will be operations team members.",
        "Roles will be assigned randomly. One participant will be the park manager, and the other three will be operations team members.",
        "The system will randomly assign roles. There will be one park manager and three operations team members.",
      ],
      delay: 2200,
    },
    {
      speaker: "RA",
      text: [
        "Please read your own role materials carefully and respond based on your assigned role.",
        "Please read the role materials carefully and respond in the chat based on the role you receive.",
        "Once your role appears, please focus on your own materials and respond according to that role.",
      ],
      delay: 1800,
    },
    {
      speaker: "RA",
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
    { speaker: "System", text: "Participant 2 has been assigned the role of Lisa, Operations Team Member.", delay: 800 },
    { speaker: "System", text: "Participant 3 has been assigned the role of John, Operations Team Member.", delay: 800 },
    { speaker: "System", text: "You have been assigned the role of Alex, Operations Team Member.", delay: 900 },
    {
      speaker: "RA",
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
        { type: "p", text: "Thanks for participating in this live research interaction." },
        { type: "p", text: "Today, you will act as a front desk receptionist responsible for ticket checking at a theme park called Aetheria Gardens. You will work directly under a Park Manager." },
        { type: "p", text: "Your main job is to check tickets at the entrance, scan QR codes, confirm visitor categories, guide visitors into the park, and answer simple questions from families." },
      ],
      check: {
        question: "What is your role in the upcoming interaction?",
        correct: "front_desk",
        options: [
          { value: "manager", label: "Park Manager" },
          { value: "front_desk", label: "Front desk receptionist responsible for ticket checking" },
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
      eyebrow: "Next Interaction 1 of 3",
      title: "Manager Chat Ended",
      blocks: [
        {
          text: "The manager left the chatroom and is now offline.",
          html: "The manager left the chatroom and is now <strong>offline</strong>.",
        },
        {
          text: "After the chat ends, you return to your regular ticket-checking work at the entrance.",
          html: "After the chat ends, you return to your regular <strong>ticket-checking work at the entrance</strong>.",
        },
        {
          text: "Today is a full working day. At the end of your shift, you check the entrance records and compare them with your observations at the gate. Today is a typical off-season weekday, and the park receives only around 500 visitors. The entrance is quiet for long periods, and staff members at the gate have relatively little work to do.",
          html: "Today is a full working day. At the end of your shift, you check the entrance records and compare them with your observations at the gate. Today is a <strong>typical off-season weekday</strong>, and the park receives only <strong>around 500 visitors</strong>. The entrance is quiet for long periods, and staff members at the gate have relatively little work to do.",
        },
      ],
    },
    {
      eyebrow: "Next Interaction 2 of 3",
      title: "Today’s Visitor Pattern",
      blocks: [
        {
          text: "You notice that most visitors are families with young children. Families with children under 10 account for around 70%–75% of daily visitors, while other visitor groups make up a much smaller share.",
          html: "You notice that most visitors are <strong>families with young children</strong>. Families with children under 10 account for <strong>around 70%–75% of daily visitors</strong>, while other visitor groups make up a much smaller share.",
        },
        {
          text: "Aetheria Gardens is far from the city center, and many families say the location is not very convenient.",
          html: "Aetheria Gardens is <strong>far from the city center</strong>, and many families say the location is <strong>not very convenient</strong>.",
        },
      ],
    },
    {
      eyebrow: "Next Interaction 3 of 3",
      title: "New Information for the Next Chat",
      blocks: [
        {
          text: "There are several universities and farms nearby, including 4 universities within 10–18 km and around 38,000 nearby university students.",
          html: "There are several universities and farms nearby, including <strong>4 universities within 10–18 km</strong> and <strong>around 38,000 nearby university students</strong>.",
        },
        {
          text: "You hear some comments from university students. Some say the park is cute, but it feels mainly designed for little kids. Others mention that student discounts or more photo-friendly spots might make the park more attractive to students.",
          html: "You hear some comments from university students. Some say the park is cute, but it feels mainly <strong>designed for little kids</strong>. Others mention that <strong>student discounts</strong> or <strong>more photo-friendly spots</strong> might make the park more attractive to students.",
        },
        {
          text: "After checking the records and thinking about what you observed today, you are about to enter a new online chat with two coworkers, Lisa and John. They also worked at the entrance today and reviewed the same attendance records and visitor comments.",
          html: "After checking the records and thinking about what you observed today, you are about to enter a <strong>new online chat with two coworkers, Lisa and John</strong>. They also worked at the entrance today and reviewed the same attendance records and visitor comments.",
        },
        {
          text: "In the next chat, you will discuss today’s attendance pattern and visitor information with Lisa and John.",
          html: "In the next chat, you will discuss <strong>today’s attendance pattern and visitor information</strong> with Lisa and John.",
        },
      ],
    },
  ];

  let messagesEl = null;
  let composerEl = null;
  let inputEl = null;

  function renderPreRoomIntro() {
    state.part = "prechat_intro";
    clearPrechatTimers();
    saveParticipant();
    screen.innerHTML = `
      <article class="page">
        <h1>Live Research Interaction</h1>
        <p>Thanks for participating in this live research interaction.</p>
        <p>This study is conducted as part of a market research project on customer feedback and service improvement.</p>
        <p>You will now enter an online study room with other participants. A research assistant will welcome the group and explain the task.</p>
        <p>During the study, you will be asked to read a short scenario, review role-specific materials, and take part in team discussions.</p>
        <p>Please stay on the page during the interaction and respond naturally in the chat.</p>
        <p>Click “Continue” when you are ready to enter the online study room.</p>
        <div class="actions">
          <button class="button" type="button" id="enter-prechat">Continue</button>
        </div>
      </article>
    `;
    document.getElementById("enter-prechat").addEventListener("click", renderPrechat);
  }

  async function renderPrechat() {
    state.part = "prechat";
    state.prechatAwaitingIntro = false;
    state.prechatIntroReceived = false;
    state.prechatReminderShown = false;
    state.prechatComplete = false;
    state.prechatSequenceRunning = false;
    state.prechatQueuedInputs = [];
    state.prechatAwaitingQuestions = false;
    state.prechatQuestionWindowComplete = false;
    clearPrechatTimers();
    saveParticipant();
    createChat("Online Study Room", "Connecting...", true);
    setComposerEnabled(true);
    state.prechatSequenceRunning = true;
    await runPrechatSequence(prechatBeforeIntro);
    state.prechatSequenceRunning = false;
    state.prechatAwaitingIntro = true;
    setStatus("Waiting for Participant 4");
    setComposerEnabled(true);
    if (state.prechatQueuedInputs.length) {
      handlePrechatInput(state.prechatQueuedInputs.shift());
    } else {
      schedulePrechatReminder();
    }
  }

  function renderBriefing(pageIndex = 0) {
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
    state.part = "manager1";
    state.managerChatLocked = false;
    saveParticipant();
    createChat("Manager Chat", "Manager online", true);
    state.managerTurnActive = true;
    await sendDelayed("Manager", "manager", "Alex, just checking in—any thoughts or updates on your end?");
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

  function handleSubmit(event) {
    event.preventDefault();
    if (state.part === "manager1" && state.managerChatLocked) return;
    if (!inputEl || !inputEl.value.trim()) return;
    if (state.busy && state.part !== "prechat" && state.part !== "manager1" && state.part !== "lisaJohn" && state.part !== "manager2") return;
    const text = inputEl.value.trim();
    inputEl.value = "";
    if (state.part === "prechat") {
      addMessage("Participant 4", "alex", text);
      handlePrechatInput(text);
      return;
    }

    addMessage("Alex", "alex", text);

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
        await sendPrechatMessage({ speaker: "RA", text: "No, a brief hello is enough. You do not need to share anything too personal.", delay: 1000 });
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
      const sent = await sendAiMessages({
        stage: "prechat",
        phase: "intro_response",
        alexMessage: text,
      });
      if (!sent) {
        await sendPrechatMessage({ speaker: "RA", text: "Great, thank you. We’ll keep moving.", delay: 1200 });
      }
      await runPrechatSequence(prechatAfterIntro);
      await answerQueuedPrechatInputs();
      state.prechatSequenceRunning = false;
      openPrechatQuestionWindow();
      return;
    }

    if (state.prechatAwaitingQuestions && !state.prechatQuestionWindowComplete) {
      clearPrechatTimers();
      state.prechatSequenceRunning = true;
      if (isNoPrechatQuestionResponse(text)) {
        await sendPrechatMessage({
          speaker: "RA",
          text: [
            "No problem, I’ll assign the roles now.",
            "Okay, I’ll go ahead and assign the roles now.",
            "That’s fine. I’ll continue with the role assignment now.",
          ],
          delay: 1000,
        });
        await continueAfterPrechatQuestions();
        return;
      }
      const sent = await sendAiMessages({
        stage: "prechat",
        phase: "question",
        alexMessage: text,
      });
      if (!sent) {
        await sendPrechatMessage({ speaker: "RA", text: "Thanks for the question. All role information will be shown on the next page, so please follow those materials closely.", delay: 1000 });
      }
      await continueAfterPrechatQuestions();
      return;
    }

    state.prechatSequenceRunning = true;
    const sent = await sendAiMessages({
      stage: "prechat",
      phase: "question",
      alexMessage: text,
    });
    if (!sent) {
      await sendPrechatMessage({ speaker: "RA", text: "Thanks for the question. Please follow the instructions shown on the screen, and we’ll keep moving.", delay: 1000 });
    }
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
        for (const groupedItem of shuffled(group)) {
          await sendPrechatMessage(groupedItem);
        }
        continue;
      }
      if (item.skipIfParticipant4Introduced && hasQueuedPrechatIntro()) continue;
      await sendPrechatMessage(item);
    }
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function hasQueuedPrechatIntro() {
    return state.prechatQueuedInputs.some((text) => !isPrechatQuestion(text));
  }

  async function sendPrechatMessage(item) {
    const text = resolvePrechatText(item.text);
    await delay(prechatMessageDelay(item, text));
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
      await sendPrechatMessage({ speaker: "RA", text: "Participant 4, could you please type a quick hello so we know your chat is working?", delay: 500 });
      const continueTimer = window.setTimeout(async () => {
        if (!state.prechatAwaitingIntro || state.prechatIntroReceived || state.prechatComplete) return;
        state.prechatAwaitingIntro = false;
        state.prechatSequenceRunning = true;
        await sendPrechatMessage({ speaker: "RA", text: "No problem, we’ll continue so the study does not get held up.", delay: 1200 });
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
    setStatus("Waiting for questions");
    setComposerEnabled(true);
    clearPrechatTimers();
    const timer = window.setTimeout(async () => {
      if (!state.prechatAwaitingQuestions || state.prechatQuestionWindowComplete || state.prechatComplete) return;
      state.prechatSequenceRunning = true;
      if (Math.random() < 0.55) {
        await sendPrechatNoQuestionMessage();
      }
      await sendPrechatMessage({
        speaker: "RA",
        text: [
          "If there are no questions, I’ll go ahead and assign the roles now.",
          "Looks like we can move on. I’ll assign the roles now.",
          "Okay, I’ll continue with the role assignment now.",
        ],
        delay: 1200,
      });
      await continueAfterPrechatQuestions();
    }, 11000);
    state.prechatTimers.push(timer);
  }

  async function sendPrechatNoQuestionMessage() {
    const speaker = pick(["Participant 1", "Participant 2", "Participant 3"]);
    const options = {
      "Participant 1": [
        "No questions from me.",
        "Nothing from me at the moment.",
        "No questions on my side.",
      ],
      "Participant 2": [
        "No questions from me :)",
        "All clear for me.",
        "Nothing from me, thanks.",
      ],
      "Participant 3": [
        "No questions from me.",
        "All clear from my side.",
        "Nothing to ask from me.",
      ],
    };
    await sendPrechatMessage({ speaker, text: options[speaker], delay: 1200 });
  }

  async function continueAfterPrechatQuestions() {
    if (state.prechatQuestionWindowComplete || state.prechatComplete) return;
    state.prechatQuestionWindowComplete = true;
    state.prechatAwaitingQuestions = false;
    clearPrechatTimers();
    await runPrechatSequence(prechatRoleAssignment);
    await answerQueuedPrechatInputs();
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
    const queuedText = state.prechatQueuedInputs.splice(0, 3).join("\n");
    const sent = await sendAiMessages({
      stage: "prechat",
      phase: "question",
      alexMessage: queuedText,
    });
    if (!sent) {
      await sendPrechatMessage({ speaker: "RA", text: "Thanks. Please follow the instructions shown on the screen, and we’ll keep moving.", delay: 1000 });
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
    const wordsPerMinute = randomBetween(60, 80);
    const typingDelay = Math.round((wordCount / wordsPerMinute) * 60000);
    const readingPause = randomBetween(1200, 2600);
    const turnTakingPause = isParticipant ? randomBetween(900, 1800) : randomBetween(500, 1400);
    return Math.min(32000, Math.max(3500, typingDelay + readingPause + turnTakingPause));
  }

  function isPrechatQuestion(text) {
    const normalized = text.trim().toLowerCase();
    return /\?$/.test(normalized) ||
      /^(do|what|why|are|is|will|should|can|could|am|who|where|how)\b/.test(normalized) ||
      /(real name|share my name|share location|rather not|don't want|do not want|other participants|real people|what role|roles random|answers be evaluated|theme park experience|chat is slow)/i.test(normalized);
  }

  function isNoPrechatQuestionResponse(text) {
    return /^(no|nope|nah|none|no questions?|not really|all good|i'?m good|sounds good|ok|okay)$/i.test(text.trim());
  }

  async function handleManagerInput(text) {
    if (state.managerChatLocked) return;
    state.managerTurnActive = true;

    if (state.managerClosingPending) {
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
      state.managerClosingPending = false;
      setStatus("Manager offline");
      addSystemNote("Manager left the chat and is now offline.");
      lockManagerChat();
      participant.completed_initial_manager_interaction = "true";
      saveParticipant();
      renderNextAction("You have completed this part of the interaction. Please click “Next” to proceed to the next page.", renderTransition, "initial_manager_interaction");
      return;
    }

    if (!state.managerAskedFollowup && isFlexibleLaborProposal(text)) {
      state.managerAskedFollowup = true;
      const sent = await sendAiMessages({
        stage: "manager1",
        phase: "followup",
        condition,
        alexMessage: text,
      });
      if (!sent) {
        finishManagerTurn();
        return;
      }
      finishManagerTurn();
      return;
    }

    if (state.managerAskedFollowup && !state.managerRejected) {
      state.managerRejected = true;
      state.managerRejectionRound = 1;
      const sent = await sendAiMessages({
        stage: "manager1",
        phase: "rejection_initial",
        condition,
        alexMessage: text,
        rejectionRound: state.managerRejectionRound,
      });
      if (!sent) {
        state.managerRejected = false;
        state.managerRejectionRound = 0;
        finishManagerTurn();
        return;
      }
      finishManagerTurn();
      return;
    }

    if (state.managerRejected && !state.managerClosingPending) {
      state.managerRejectionRound += 1;
      const sent = await sendAiMessages({
        stage: "manager1",
        phase: state.managerRejectionRound >= 3 ? "rejection_final" : "rejection_followup",
        condition,
        alexMessage: text,
        rejectionRound: state.managerRejectionRound,
      });
      if (!sent) {
        state.managerRejectionRound -= 1;
        finishManagerTurn();
        return;
      }
      if (state.managerRejectionRound >= 3) {
        state.managerClosingPending = true;
      }
      finishManagerTurn();
      return;
    }

    const sent = await sendAiMessages({
      stage: "manager1",
      phase: "casual",
      condition,
      alexMessage: text,
    });
    if (!sent) {
      finishManagerTurn();
      return;
    }
    finishManagerTurn();
  }

  function renderTransition(pageIndex = 0) {
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
          <button class="button" type="button" id="transition-next">${pageIndex === transitionPages.length - 1 ? "Start Chat" : "Next"}</button>
        </div>
      </article>
    `;
    document.getElementById("transition-next").addEventListener("click", () => {
      if (pageIndex < transitionPages.length - 1) {
        renderTransition(pageIndex + 1);
        return;
      }
      renderLisaJohnChat();
    });
  }

  function renderTransitionBlocks(blocks) {
    return blocks.map((block) => `<p>${block.html}</p>`).join("");
  }

  async function renderLisaJohnChat() {
    state.part = "lisaJohn";
    state.managerChatLocked = false;
    state.managerTurnActive = false;
    state.pendingManagerInput = "";
    state.coworkerTurnActive = false;
    state.pendingCoworkerInputs = [];
    state.secondPhase = "beforeProposal";
    state.postSuggestionTurns = 0;
    state.decisionShown = false;
    saveParticipant();
    createChat("Coworker Chat", "Lisa and John online", true);
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
    const hasProposal = isStudentVisitorProposal(text);

    if (state.secondPhase === "beforeProposal" && hasProposal) {
      state.secondPhase = "afterProposal";
      state.postSuggestionTurns = 1;
      state.coworkerTurnActive = true;
      await sendAiMessages({
        stage: "lisa_john",
        phase: "afterProposal",
        mode: coworkerBothMode(),
        turn: state.postSuggestionTurns,
        alexMessage: text,
      });
      finishCoworkerTurn();
      return;
    }

    if (state.secondPhase === "beforeProposal") {
      state.coworkerTurnActive = true;
      await sendAiMessages({
        stage: "lisa_john",
        phase: "beforeProposal",
        mode: coworkerMode(),
        alexMessage: text,
      });
      finishCoworkerTurn();
      return;
    }

    state.postSuggestionTurns += 1;
    state.coworkerTurnActive = true;
    await sendAiMessages({
      stage: "lisa_john",
      phase: "afterProposal",
      mode: coworkerMode(),
      turn: state.postSuggestionTurns,
      alexMessage: text,
    });

    if (state.postSuggestionTurns >= 3 && !state.decisionShown) {
      await delay(randomBetween(3000, 5000));
      state.coworkerTurnActive = false;
      state.pendingCoworkerInputs = [];
      showDecisionPrompt();
      return;
    }

    finishCoworkerTurn();
  }

  function showDecisionPrompt() {
    state.decisionShown = true;
    setComposerEnabled(false);
    recordInteraction("decision_prompt", "system", "Do you want to bring this up with the manager now?", "");
    const panel = document.createElement("div");
    panel.className = "decision-panel";
    panel.innerHTML = `
      <p>Do you want to bring this up with the manager now?</p>
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

  function renderNeutralManagerChat() {
    state.part = "manager2";
    state.neutralQuestionCount = 0;
    saveParticipant();
    createChat("Manager Chat", "Manager online", true);
    setComposerEnabled(true);
    addSystemNote("You are now entering a new chat with the manager. Please type what you would like to say.");
  }

  async function handleNeutralManagerInput(text) {
    if (state.neutralQuestionCount >= 5) return;
    state.managerTurnActive = true;
    if (state.neutralQuestionCount === 4) {
      state.neutralQuestionCount += 1;
      const sent = await sendAiMessages({
        stage: "manager2",
        phase: "closing",
        alexMessage: "",
      });
      if (!sent) {
        finishManagerTurn();
        return;
      }
      setStatus("Manager online");
      participant.completed_neutral_manager_followup = "true";
      saveParticipant();
      state.managerTurnActive = false;
      state.pendingManagerInput = "";
      setComposerEnabled(false);
      await delay(1500);
      renderPostInteractionSurvey();
      return;
    }

    state.neutralQuestionCount += 1;
    const sent = await sendAiMessages({
      stage: "manager2",
      phase: "question",
      alexMessage: text,
    });
    if (!sent) {
      finishManagerTurn();
      return;
    }
    finishManagerTurn();
  }

  function renderPostInteractionSurvey() {
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
    return `
      <section class="survey-section">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${formatSurveyInstruction(section.instruction)}</p>
        ${section.stem ? `<p class="survey-stem">${escapeHtml(section.stem)}</p>` : ""}
        ${groups.map((group) => `
          ${group.label ? `<h3>${escapeHtml(group.label)}</h3>` : ""}
          ${renderSurveyMatrix(group.items)}
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

  function renderSurveyMatrix(items) {
    return `
      <div class="survey-matrix" role="table">
        <div class="survey-row survey-head" role="row">
          <div role="columnheader">Item</div>
          ${likertOptions.map((label, index) => `<div role="columnheader">${index + 1}<span>${escapeHtml(label)}</span></div>`).join("")}
        </div>
        ${items.map((item) => `
          <div class="survey-row" role="row" aria-labelledby="survey-item-${escapeHtml(item.id)}">
            <div class="survey-item" id="survey-item-${escapeHtml(item.id)}">${escapeHtml(item.text)}</div>
            ${likertOptions.map((label, index) => `
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
    state.part = "ai_check";
    state.aiCheckStartTime = timestamp();
    participant.completed_ai_check = "false";
    participant.ai_check_start_time = state.aiCheckStartTime;
    participant.ai_check_submit_time = "";
    participant.manager_ai_suspicion = "";
    participant.lisa_ai_suspicion = "";
    participant.john_ai_suspicion = "";
    participant.completion_status = "partial";
    saveParticipant();
    recordInteraction("ai_check", "system", "AI check page displayed.", "");

    screen.innerHTML = `
      <article class="page ai-check-page">
        <h1>One More Question</h1>
        <p>In Prolific recruitment, studies may sometimes include AI participants. To help us protect data quality and reduce possible effects from AI participants, please answer the questions below.</p>
        <form id="ai-check-form" novalidate>
          ${renderAiCheckQuestion("manager_ai_suspicion", "Do you think the manager you interacted with may have been AI?")}
          ${renderAiCheckQuestion("lisa_ai_suspicion", "Do you think Lisa may have been AI?")}
          ${renderAiCheckQuestion("john_ai_suspicion", "Do you think John may have been AI?")}
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
    const lisaResponse = form.elements.lisa_ai_suspicion.value;
    const johnResponse = form.elements.john_ai_suspicion.value;

    if (!managerResponse || !lisaResponse || !johnResponse) {
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
    const row = document.createElement("div");
    row.className = `message-row ${className}`;
    row.dataset.speaker = speaker;
    row.dataset.message = text;
    row.innerHTML = `
      <div class="bubble">
        <span class="speaker">${escapeHtml(speaker)}</span>
        <span>${escapeHtml(text)}</span>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    recordInteraction(currentStage(), speaker, text, "");
  }

  async function sendDelayed(speaker, className, text, ms) {
    state.busy = true;
    if (className === "manager") {
      const plan = managerTimingPlan(text);
      if (plan.showTyping) {
        await delay(plan.thinkingDelay);
        const typingIndicator = showTypingIndicator();
        await delay(plan.typingDelay);
        typingIndicator.remove();
        await delay(plan.tailPause);
      } else {
        await delay(plan.totalDelay);
      }
    } else {
      await delay(ms || responseDelayForText(text));
    }
    addMessage(speaker, className, text);
    state.busy = false;
  }

  async function sendAiMessages(request) {
    const result = await requestAiMessages(request);
    if (!result.ok) {
      addSystemNote(result.error || "The AI chat service is not available. Please check the server configuration.");
      return false;
    }

    let previousCoworkerText = "";
    for (const message of result.messages) {
      const className = speakerClassName(message.speaker);
      let delayMs;
      if (request.stage === "prechat") {
        delayMs = prechatDelayForText(message.speaker, message.text);
      } else if (isCoworkerClass(className)) {
        delayMs = coworkerResponseDelay(message.text, previousCoworkerText);
      }
      await sendDelayed(message.speaker, className, message.text, delayMs);
      if (isCoworkerClass(className)) previousCoworkerText = message.text;
    }
    return result.messages.length > 0;
  }

  async function requestAiMessages(request) {
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
        return { ok: false, error: data.error || "OpenAI API request failed." };
      }
      const messages = Array.isArray(data.messages) ? data.messages : [];
      return { ok: messages.length > 0, messages, error: messages.length ? "" : "OpenAI returned no chat messages." };
    } catch (error) {
      return { ok: false, error: "Could not connect to the AI chat service." };
    }
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

  function coworkerMode() {
    const roll = Math.random();
    if (roll < 0.35) return "lisa";
    if (roll < 0.70) return "john";
    if (roll < 0.85) return "both_lisa_first";
    return "both_john_first";
  }

  function coworkerBothMode() {
    return Math.random() < 0.5 ? "both_lisa_first" : "both_john_first";
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
    return className === "lisa" || className === "john";
  }

  function speakerClassName(speaker) {
    const normalized = String(speaker || "").toLowerCase().replace(/\s+/g, "-");
    if (normalized === "participant-4") return "alex";
    if (normalized === "research-assistant") return "ra";
    return normalized;
  }

  function showTypingIndicator() {
    const row = document.createElement("div");
    row.className = "message-row manager typing-row";
    row.innerHTML = `
      <div class="bubble typing-bubble">
        <span>Manager is typing...</span>
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

  function managerTimingPlan(text) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const showTyping = true;
    const wordsPerMinute = randomBetween(75, 85);
    const readingDelay = randomBetween(1200, 2600);
    const totalDelay = Math.round((wordCount / wordsPerMinute) * 60000) + readingDelay;
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
    const note = document.createElement("p");
    note.className = "system-note";
    note.textContent = text;
    messagesEl.appendChild(note);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    recordInteraction(currentStage(), "system", text, "");
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

  function isFlexibleLaborProposal(text) {
    const normalized = text.toLowerCase();
    const staffingTerms = /(staff|staffing|labor|employee|employees|workforce|worker|workers|role|roles)/i.test(normalized);
    const flexibilityTerms = /(flexible|flexibility|temporary|temps?|intern|interns|seasonal|part-time|part time|pool|convert|surge|peak|off-season|off season|agile)/i.test(normalized);
    const actionTerms = /(should|could|need|recommend|suggest|propose|use|hire|bring|adopt|change|switch|convert|create|implement)/i.test(normalized);
    const directFlexibleLabor = /(temporary staff|temp staff|temps?|interns?|seasonal workers?|part-time workers?|part time workers?|flexible labor|labor pool|flexible model|flexible staffing)/i.test(normalized);
    return actionTerms && ((staffingTerms && flexibilityTerms) || directFlexibleLabor);
  }

  function isStudentVisitorProposal(text) {
    const normalized = text.toLowerCase();
    const audience = /(student|students|university|universities|college|colleges|young adult|young adults|farm|farms|local)/i.test(normalized);
    const tactic = /(discount|discounts|photo|photos|spot|spots|afternoon|activity|activities|event|events|partnership|partner|campaign|ticket|tickets|attract|target|market|offer|promotion|promote|package|experience)/i.test(normalized);
    const action = /(maybe|should|could|need|recommend|suggest|propose|try|create|offer|build|make|start|partner|bring|raise|target|attract)/i.test(normalized);
    return audience && tactic && action;
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.addEventListener("beforeunload", () => {
    participant.experiment_end_time = timestamp();
    persistLocal();
    postJson("/participant", participant);
  });

  saveParticipant();
  const skipTo = (params.get("skip_to") || "").toLowerCase();
  if (skipTo === "survey") {
    renderPostInteractionSurvey();
  } else if (skipTo === "ai_check" || skipTo === "robot_check") {
    renderAiCheckPage();
  } else if (skipTo === "briefing") {
    renderBriefing();
  } else if (skipTo === "transition") {
    renderTransition();
  } else {
    renderPreRoomIntro();
  }
})();
