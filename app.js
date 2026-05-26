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
  const sessionKey = `voice-rejection:${ids.prolific_pid}:${ids.study_id}:${ids.session_id}`;
  const storedSession = readStoredSession();
  const requestedCondition = normalizeCondition(params.get("condition"));
  const condition = requestedCondition || storedSession.assigned_condition || pick(conditionLabels);
  const conditionSource = requestedCondition ? "url" : (storedSession.condition_source || "random_assignment");
  const dataEndpoint = `${window.location.protocol === "file:" ? "http://localhost:8787" : window.location.origin}/api`;
  let responseOrder = Number(storedSession.response_order || 0);

  const state = {
    part: "briefing",
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
    completed_initial_manager_interaction: storedSession.completed_initial_manager_interaction || "false",
    completed_transition_page: storedSession.completed_transition_page || "false",
    completed_lisa_john_interaction: storedSession.completed_lisa_john_interaction || "false",
    chose_to_bring_this_up_with_manager: storedSession.chose_to_bring_this_up_with_manager || "not_reached",
    completed_neutral_manager_followup: storedSession.completed_neutral_manager_followup || "false",
    completed_post_interaction_survey: storedSession.completed_post_interaction_survey || "false",
    survey_completion_status: storedSession.survey_completion_status || "not_reached",
    survey_start_time: storedSession.survey_start_time || "",
    survey_submit_time: storedSession.survey_submit_time || "",
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

  let messagesEl = null;
  let composerEl = null;
  let inputEl = null;

  function renderBriefing() {
    state.part = "briefing";
    screen.innerHTML = `
      <article class="page">
        <h1>Participant Briefing</h1>
        <p>Thanks for participating in this live research interaction.</p>
        <p>Today, you will act as a front desk receptionist responsible for ticket checking at a theme park called Aetheria Gardens. You will work directly under a Park Manager.</p>
        <p>Your main job is to check tickets at the entrance, scan QR codes, confirm visitor categories, guide visitors into the park, and answer simple questions from families.</p>
        <p>You are about to begin an online interaction with your manager. Before proceeding, please carefully review the background briefing below so that you are fully prepared for the discussion.</p>
        <h2>Background Information</h2>
        <p>Aetheria Gardens is currently facing a significant staffing challenge. Because the park relies almost exclusively on full-time, permanent employees, it is experiencing a “labor seesaw”:</p>
        <ul>
          <li>Off-season: Daily attendance drops to around 500 visitors, leaving the park with a costly surplus of idle staff.</li>
          <li>Peak season: Daily attendance surges to around 5,000 visitors, leaving teams overwhelmed and shorthanded.</li>
        </ul>
        <p>The current full-time staffing plan was developed by park management. However, you recognize that its lack of flexibility is driving labor costs to a breaking point. You believe the theme park must adopt a more agile employment model in order to survive.</p>
        <p>For example, the park could use temporary staff and interns to manage high-volume attendance surges, or convert part of the current permanent workforce into a flexible labor pool to better align staffing levels with fluctuating demand.</p>
        <p>Although proposing staffing changes is not required by your role—your main responsibility is ticket checking—you still want to suggest a change to the current procedure in order to improve the theme park’s performance.</p>
        <p>Now, you are about to enter an online chat with your manager.</p>
        <p>You may advocate for the implementation of a flexible labor model. You understand that this is a sensitive topic because the existing “all-permanent” staffing strategy is currently treated as the official plan. However, based on your professional insight, you believe that proposing this change is the best path forward for Aetheria Gardens.</p>
        <div class="actions">
          <button class="button" type="button" id="start-manager">Next</button>
        </div>
      </article>
    `;
    document.getElementById("start-manager").addEventListener("click", renderManagerChat);
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
    if (state.busy && state.part !== "manager1" && state.part !== "lisaJohn" && state.part !== "manager2") return;
    const text = inputEl.value.trim();
    inputEl.value = "";
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

  function renderTransition() {
    state.part = "transition";
    participant.completed_transition_page = "true";
    saveParticipant();
    const transitionMessages = [
      "The manager left the chatroom and is now offline.",
      "After the chat ends, you return to your regular ticket-checking work at the entrance.",
      "Today is a full working day. At the end of your shift, you check the entrance records and compare them with your observations at the gate. You find that today’s attendance is consistent with the park’s broader seasonal pattern. Today is a typical off-season weekday, and the park receives only around 500 visitors. The entrance is quiet for long periods, and staff members at the gate have relatively little work to do.",
      "You also notice that most visitors are families with young children. Families with children under 10 account for around 70%–75% of daily visitors, while other visitor groups make up a much smaller share.",
      "Aetheria Gardens is far from the city center, and many families say the location is not very convenient. At the same time, there are several universities and farms nearby, including 4 universities within 10–18 km and around 38,000 nearby university students.",
      "You also hear some comments from university students. Some say the park is cute, but it feels mainly designed for little kids. Others mention that student discounts or more photo-friendly spots might make the park more attractive to students.",
      "After checking the records and thinking about what you observed today, you are about to enter a new online chat with two coworkers, Lisa and John. They also worked at the entrance today and reviewed the same attendance records and visitor comments.",
      "In the next chat, you will discuss today’s attendance pattern and visitor information with Lisa and John.",
    ];
    for (const message of transitionMessages) {
      recordInteraction("transition_page", "system", message, "");
    }
    screen.innerHTML = `
      <article class="page">
        <h1>Next Interaction</h1>
        <p>The manager left the chatroom and is now offline.</p>
        <p>After the chat ends, you return to your regular ticket-checking work at the entrance.</p>
        <p>Today is a full working day. At the end of your shift, you check the entrance records and compare them with your observations at the gate. You find that today’s attendance is consistent with the park’s broader seasonal pattern. Today is a typical off-season weekday, and the park receives only around 500 visitors. The entrance is quiet for long periods, and staff members at the gate have relatively little work to do.</p>
        <p>You also notice that most visitors are families with young children. Families with children under 10 account for around 70%–75% of daily visitors, while other visitor groups make up a much smaller share.</p>
        <p>Aetheria Gardens is far from the city center, and many families say the location is not very convenient. At the same time, there are several universities and farms nearby, including 4 universities within 10–18 km and around 38,000 nearby university students.</p>
        <p>You also hear some comments from university students. Some say the park is cute, but it feels mainly designed for little kids. Others mention that student discounts or more photo-friendly spots might make the park more attractive to students.</p>
        <p>After checking the records and thinking about what you observed today, you are about to enter a new online chat with two coworkers, Lisa and John. They also worked at the entrance today and reviewed the same attendance records and visitor comments.</p>
        <p>In the next chat, you will discuss today’s attendance pattern and visitor information with Lisa and John.</p>
        <div class="actions">
          <button class="button" type="button" id="start-coworker">Next</button>
        </div>
      </article>
    `;
    document.getElementById("start-coworker").addEventListener("click", renderLisaJohnChat);
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
      mode: "both",
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
        mode: "both",
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
            <button class="button" type="button" disabled>Next</button>
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
    participant.completion_status = "completed";
    saveParticipant();
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
    recordInteraction(currentStage(), className, text, "");
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
      const className = message.speaker.toLowerCase();
      const delayMs = isCoworkerClass(className)
        ? coworkerResponseDelay(message.text, previousCoworkerText)
        : undefined;
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
    return "both";
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
    if (state.part === "manager1") return "initial_manager_interaction";
    if (state.part === "transition") return "transition_page";
    if (state.part === "lisaJohn") return state.decisionShown ? "decision_prompt" : "lisa_john_interaction";
    if (state.part === "manager2") return "neutral_manager_followup";
    if (state.part === "survey") return "post_interaction_survey";
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
  if ((params.get("skip_to") || "").toLowerCase() === "survey") {
    renderPostInteractionSurvey();
  } else {
    renderBriefing();
  }
})();
