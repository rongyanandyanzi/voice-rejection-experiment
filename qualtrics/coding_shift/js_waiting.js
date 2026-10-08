// Waiting page ("Batch 2 is waiting to be issued"). Everyone stops here until a fixed time T after
// batch 1 was submitted, the same T in every cell, whether or not a note was attached. For a note,
// the supervisor's reply is polled meanwhile; if it is still not ready at T the page waits at most
// GRACE_MS longer and then shows the pre-tested fallback for the assigned cell. Nothing is ever
// shown sooner than T, and nobody is excluded for a slow or failed reply.
//
// Results are written into the hidden text questions on this page (saved with the page, drive the
// branch logic and piped text), into embedded data, and into sessionStorage for the next page.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  var T_MS = 120000;      // fixed delay after batch 1 was submitted
  var GRACE_MS = 60000;   // extra wait allowed after T for a reply that is still being written
  var POLL_MS = 3000;
  var MAX_STARTS = 3;
  var FALLBACK = {
    HP_HC: ["Hi, thanks for flagging comments 3, 6 and 8 so carefully. I'm afraid I can't add a second category.", "The note doesn't show how often a second problem is really separate, or whether coders would agree on it; without that, a second label may lower agreement. If you could code a hundred comments both ways, I'd gladly look again. Thanks again for raising it."],
    HP_LC: ["Hi, thank you for writing this up; I can see the care you took. I'm afraid the rule isn't changing.", "A rule change reaches well past one batch, and it touches how the whole project is set up; other things weigh on it too. If something changes, I'd be glad to look at this again. Thanks again for taking the time to raise it."],
    LP_HC: ["Got your note. I'm not adding a second category. Three comments from one batch don't make a case.", "The note doesn't show how often a second problem is really separate, or whether coders would agree on it; without that, a second label just lowers agreement. Code a hundred comments both ways and bring the comparison back. That's all I have on it."],
    LP_LC: ["Got your note. I'm not changing the one-category rule. The idea doesn't hold up for this project.", "A rule change like this reaches well past one batch, and it touches how the whole project is set up and run; other things weigh on it too. Bring it back if something actually changes on the project side. That's all I have on it."]
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
  var anchor = Number(stored("cs_batch1_submit_ms")) || openedAt;
  var condition = domValue("cs-condition", "${e://Field/condition}") || "HP_HC";
  var note = stored("cs_note1_text") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("note1_text") || "");
  var hasNote = Boolean(note.trim());
  var requestId = stored("cs_request_id");
  var startBody = stored("cs_start_body");

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

  function startJob() {
    if (!startBody) return Promise.resolve();
    starts += 1;
    return fetch(SERVICE_URL + "/api/rejection/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: startBody })
      .then(function (response) { return response.json(); }).catch(function () {});
  }
  var polls = 0;
  function poll() {
    if (done || reply) return;
    polls += 1;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;
    fetch(SERVICE_URL + "/api/rejection/result?job=" + encodeURIComponent(requestId), { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function (response) { if (timeout) clearTimeout(timeout); return response.json(); })
      .then(function (data) { try { sessionStorage.setItem("cs_last_poll", polls + ":" + (data && data.status) + ":" + Math.round((Date.now() - openedAt) / 1000)); } catch (error) {} return data; })
      .then(function (data) {
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
        if (data.status === "failed") { reply = { status: "failed" }; return; }
        setTimeout(poll, POLL_MS);
      })
      .catch(function () { if (timeout) clearTimeout(timeout); setTimeout(poll, POLL_MS); });
  }

  function finish(useFallback) {
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
      setEd("rejection_compliance_code", "");
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
    if (label) label.textContent = "Batch 2 is ready. Click Next to continue.";
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
    if (reply && reply.status === "failed") { finish(true); return; }
    if (now >= tAt + GRACE_MS) { finish(true); return; }
    setTimeout(tick, 1000);
  }

  if (hasNote) {
    if (!requestId) { reply = { status: "failed" }; }
    else if (starts === 0) { startJob().then(function () { setTimeout(poll, POLL_MS); }); }
    else { setTimeout(poll, 500); }
  }
  tick();
});
