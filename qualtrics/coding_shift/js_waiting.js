// Waiting page ("Batch 3 is waiting to be issued"), reached after batch 2, which is coded while the
// supervisor reviews. Everyone stops here until a fixed time T: for a note, T after the note was
// sent (when the reply starts being written); without a note, T after batch 1 was submitted. The
// same T in every cell; after batch 2 most people have already passed T and move on at once. For a note,
// the supervisor's reply is polled meanwhile, and the page waits for it however late the participant
// arrives or however long it takes (user decision 2026-10-12: everyone with a note gets the AI reply,
// never the pre-written one because of time). A failed or lost generation is restarted. Only if the
// service is down and nothing has come after MAX_WAIT_MS on this page is the pre-tested fallback
// for the assigned cell shown, so nobody is stuck. Nothing is ever shown sooner than T.
//
// Results are written into the hidden text questions on this page (saved with the page, drive the
// branch logic and piped text), into embedded data, and into sessionStorage for the next page.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  // 90 s until 2026-10-19; lowered to 60 s when the admin tasks were dropped from the flow, so that
  // batch 2 alone (median 46 s) covers most of the hold and few people see this page for long.
  var T_MS = 60000;       // fixed delay after the note was sent (or after batch 1 without a note)
  // Safety net only: if the reply service is down, give up after this long on the page and show the
  // fallback rather than keep the participant here. Generations take 20-95 s; a job whose first attempt
  // times out can take up to ~280 s.
  var MAX_WAIT_MS = 300000;  // covers two full generation attempts (2 x 135 s) plus the note check
  // If the browser cannot reach the service at all (every request fails at the network level, e.g.
  // a blocked domain), waiting the full MAX_WAIT_MS helps nobody: one participant on 2026-10-13 sat
  // 240 s on this page and the service logged nothing for them. Give up after this long instead.
  var UNREACHABLE_MS = 60000;
  var POLL_MS = 3000;
  var MAX_STARTS = 3;
  // Pre-tested backups, one per cell, used only if the generated reply is not ready in time. They
  // name no comment numbers and assume nothing about what the note proposed, so they fit any note
  // (rewritten 2026-10-12). Same structure as the generated replies: 14-22 + 36-46 words; HP opens
  // with greeting, thanks and a hedged refusal, LP with "Got your note." and a bald refusal plus a
  // flat judgement of the proposal (never the person); HC gives concrete standards and a concrete
  // condition for looking again, LC vague ones; every cell stays open to the idea coming back.
  var FALLBACK = {
    HP_HC: ["Hi, thanks for raising this so carefully; I can see the thought behind it. I'm afraid I can't make this change.", "The note doesn't show how often the problem it describes comes up, or whether two coders would apply the change the same way; without that, it may lower agreement. If you could check it on a hundred comments, I'd gladly look again. Thanks for raising it."],
    HP_LC: ["Hi, thank you for writing this up; I can see the care you took. I'm afraid I can't make this change.", "A change like this reaches well past one batch, and it touches how the whole project is set up; other things weigh on it too. If something changes, I'd be glad to look at this again. Thanks again for taking the time to raise it."],
    LP_HC: ["Got your note. I'm not making this change. The case for it doesn't hold up.", "The note doesn't show how often the problem it describes comes up, or whether two coders would apply the change the same way; without that, it just lowers agreement. Check it on a hundred comments and bring the numbers back. That's all I have on it."],
    LP_LC: ["Got your note. I'm not making this change. The idea doesn't hold up for this project.", "A change like this reaches well past one batch, and it touches how the whole project is set up and run; other things weigh on it too. Bring it back if something actually changes on the project side. That's all I have on it."]
  };

  var question = this;
  var PIPE_START = String.fromCharCode(36) + "{";
  function unpiped(value) { return value && value.indexOf(PIPE_START) !== 0 ? value : ""; }
  function domValue(id, fallback) {
    var el = document.getElementById(id);
    return unpiped(el ? el.textContent.trim() : "") || unpiped(fallback || "");
  }
  function stored(key) { try { return sessionStorage.getItem(key) || ""; } catch (error) { return ""; } }

  var openedAt = Date.now();
  var condition = domValue("cs-condition", "${e://Field/condition}") || "HP_HC";
  var note = stored("cs_note1_text") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("note1_text") || "");
  var hasNote = Boolean(note.trim());
  var anchor = (hasNote ? Number(stored("cs_note1_submit_ms")) : 0) || Number(stored("cs_batch1_submit_ms")) || openedAt;
  var responseId = unpiped("${e://Field/ResponseID}");
  var requestId = stored("cs_request_id") || (/^[A-Za-z0-9_-]{8,128}$/.test(responseId) ? responseId : "");
  var startBody = stored("cs_start_body");
  // Rebuild the request from the note if the earlier page could not store it, so a lost job can
  // still be started again from here.
  if (!startBody && hasNote && requestId) {
    startBody = JSON.stringify({
      request_id: requestId, condition: condition, language: "en", proposal: note,
      prolific_pid: unpiped("${e://Field/PROLIFIC_PID}"), study_id: unpiped("${e://Field/STUDY_ID}"), session_id: unpiped("${e://Field/SESSION_ID}")
    });
  }

  // Hidden carrier questions on this page, in this order.
  var HIDDEN = {
    rejection_status: 0, rejection_msg1: 1, rejection_msg2: 2, rejection_compliance_code: 3, rejection_latency_ms: 4,
    wait_before_t_ms: 5, wait_after_t_ms: 6, fallback_used: 7, politeness_channel: 8, voice1: 9
  };
  function setHidden(index, value) {
    var inputs = document.querySelectorAll("input[type=text]");
    var input = inputs[index];
    if (!input) return;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value == null ? "" : String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function setEd(name, value) {
    var text = value == null ? "" : String(value);
    try { Qualtrics.SurveyEngine.setEmbeddedData(name, text); } catch (error) {}
    try { if (typeof Qualtrics.SurveyEngine.setJSEmbeddedData === "function") Qualtrics.SurveyEngine.setJSEmbeddedData(name, text); } catch (error) {}
    if (HIDDEN[name] !== undefined) setHidden(HIDDEN[name], text);
    try { sessionStorage.setItem("cs_" + name, text); } catch (error) {}
  }

  question.disableNextButton();
  var reply = null;      // {status, msg1, msg2, code, latency, channel, voice}
  var starts = Number(stored("cs_job_started") === "1" ? 1 : 0);
  var done = false;
  var reached = false;   // any HTTP answer from the service, whatever its status
  var netErrors = 0;
  var lastStatus = "";

  function startJob() {
    if (!startBody) return Promise.resolve();
    starts += 1;
    return fetch(SERVICE_URL + "/api/rejection/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: startBody })
      .then(function (response) { reached = true; return response.json(); }).catch(function () { netErrors += 1; });
  }
  var polls = 0;
  function poll() {
    if (done || reply) return;
    polls += 1;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
    fetch(SERVICE_URL + "/api/rejection/result?job=" + encodeURIComponent(requestId), { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function (response) { if (timeout) clearTimeout(timeout); reached = true; return response.json(); })
      .then(function (data) { try { sessionStorage.setItem("cs_last_poll", polls + ":" + (data && data.status) + ":" + Math.round((Date.now() - openedAt) / 1000)); } catch (error) {} return data; })
      .then(function (data) {
        lastStatus = String(data && data.status || "");
        if (data.status === "ok") {
          var messages = data.messages || [];
          reply = {
            status: "ok",
            msg1: messages[0] ? messages[0].text : "",
            msg2: messages[1] ? messages[1].text : "",
            code: data.compliance_code == null ? "" : String(data.compliance_code),
            latency: data.latency_ms == null ? "" : String(data.latency_ms),
            channel: data.politeness_channel || "",
            voice: data.voice === false ? "0" : "1"
          };
          return;
        }
        if ((data.status === "failed" || data.status === "unknown") && starts < MAX_STARTS) {
          return startJob().then(function () { setTimeout(poll, POLL_MS); });
        }
        if (data.status === "failed") { reply = { status: "failed", reason: "generation_failed" }; return; }
        setTimeout(poll, POLL_MS);
      })
      .catch(function () { if (timeout) clearTimeout(timeout); netErrors += 1; setTimeout(poll, POLL_MS); });
  }

  function finish(useFallback, reason) {
    if (done) return;
    done = true;
    var now = Date.now();
    var tAt = anchor + T_MS;
    setEd("wait_before_t_ms", String(Math.max(0, Math.min(now, tAt) - openedAt)));
    setEd("wait_after_t_ms", String(Math.max(0, now - Math.max(openedAt, tAt))));
    if (!hasNote) {
      setEd("rejection_status", "none");
      setEd("voice1", "");
      setEd("fallback_used", "0");
    } else if (useFallback || !reply || reply.status !== "ok") {
      var pair = FALLBACK[condition] || FALLBACK.HP_HC;
      setEd("rejection_status", "fallback");
      setEd("rejection_msg1", pair[0]);
      setEd("rejection_msg2", pair[1]);
      // The compliance code is empty for a fallback anyway; it carries why the fallback was used, so
      // the next case can be traced from the data (embedded data is not being saved).
      setEd("rejection_compliance_code", "fallback:" + (reason || "unknown") + ";reached=" + (reached ? 1 : 0) +
        ";polls=" + polls + ";net_errors=" + netErrors + ";starts=" + starts + ";last=" + lastStatus +
        ";stored_body=" + (stored("cs_start_body") ? 1 : 0) + ";job_started=" + stored("cs_job_started"));
      setEd("rejection_latency_ms", "");
      setEd("politeness_channel", "closing");
      setEd("voice1", "1");
      setEd("fallback_used", "1");
    } else {
      setEd("rejection_status", "ok");
      setEd("rejection_msg1", reply.msg1);
      setEd("rejection_msg2", reply.msg2);
      setEd("rejection_compliance_code", reply.code);
      setEd("rejection_latency_ms", reply.latency);
      setEd("politeness_channel", reply.channel);
      setEd("voice1", reply.voice);
      setEd("fallback_used", "0");
    }
    question.enableNextButton();
    var label = document.getElementById("cs-wait-status");
    if (label) label.textContent = "Batch 3 is ready. Click Next to continue.";
    // The button is clicked directly. question.clickNextButton() is not used: in the new survey
    // engine it did nothing at once and then fired on the following page, skipping it. If the
    // click does not work the participant can press the enabled button.
    setTimeout(function () {
      var next = document.getElementById("next-button") || document.getElementById("NextButton");
      if (next && !next.disabled) next.click();
    }, 400);
  }

  function tick() {
    if (done) return;
    var now = Date.now();
    var tAt = anchor + T_MS;
    if (now < tAt) { setTimeout(tick, Math.min(1000, tAt - now)); return; }
    if (!hasNote || (reply && reply.status === "ok")) { finish(false); return; }
    if (reply && reply.status === "failed") { finish(true, reply.reason || "failed"); return; }
    if (!reached && now >= openedAt + UNREACHABLE_MS) { finish(true, "unreachable"); return; }
    // While a slow reply is still being written, say so, so the wait does not look frozen.
    var label = document.getElementById("cs-wait-status");
    if (label && now - Math.max(openedAt, tAt) > 20000) label.textContent = "The supervisor is finishing a reply to your note\u2026";
    if (now >= openedAt + MAX_WAIT_MS) { finish(true, "timeout"); return; }
    setTimeout(tick, 1000);
  }

  if (hasNote) {
    if (!requestId) { reply = { status: "failed", reason: "no_request_id" }; }
    else if (starts === 0) { startJob().then(function () { setTimeout(poll, POLL_MS); }); }
    else { setTimeout(poll, 500); }
  }
  tick();
});
