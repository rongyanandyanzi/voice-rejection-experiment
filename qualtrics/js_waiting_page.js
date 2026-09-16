// Waiting page: question JavaScript on the Text/Graphic question that shows "Your review has
// been sent" and the extra facts. Starts the rejection job in the background, polls for the reply,
// stores it in embedded data, and enables Next only when the reply has arrived AND the minimum
// reading time has passed. After MAX_WAIT_MS (5 minutes) without a reply it records rejection_status = failed so
// the survey flow can branch to the technical-problem end page.
//
// Embedded fields written here (declare them in the survey flow first): rejection_job,
// rejection_status, rejection_wait_ms, rejection_msg1, rejection_msg2, rejection_compliance_code,
// rejection_latency_ms. Fields read: ResponseID, condition, proposal, PROLIFIC_PID, STUDY_ID, SESSION_ID.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  var MIN_READ_MS = 60000;   // minimum time on this page
  var MAX_WAIT_MS = 300000;  // give up after this (two full server-side generations fit inside)
  var POLL_MS = 3000;
  var MAX_STARTS = 3;

  var question = this;
  var startedAt = Date.now();
  // The hidden spans are filled by piped text when the page renders; the JS strings are the
  // fallback. The request id is the ResponseID when Qualtrics provides one, otherwise a random
  // id kept in sessionStorage so a reload reuses the same job.
  // Qualtrics scans question JavaScript for piped text, so the literal "$" + "{" must never
  // appear in the source; it is assembled at run time instead.
  var PIPE_START = String.fromCharCode(36) + "{";
  function unpiped(value) { return value && value.indexOf(PIPE_START) !== 0 ? value : ""; }
  function domValue(id, fallback) {
    var el = document.getElementById(id);
    return unpiped(el ? el.textContent.trim() : "") || unpiped(fallback || "");
  }
  var condition = domValue("vr-condition", "${e://Field/condition}");
  var requestId = domValue("vr-response-id", "${e://Field/ResponseID}");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    try { requestId = sessionStorage.getItem("vr_request_id") || ""; } catch (error) {}
    if (!requestId) {
      requestId = "R_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { sessionStorage.setItem("vr_request_id", requestId); } catch (error) {}
    }
  }
  var proposal = "";
  try { proposal = sessionStorage.getItem("vr_proposal") || ""; } catch (error) {}
  if (!proposal) proposal = Qualtrics.SurveyEngine.getEmbeddedData("proposal") || "";
  var ids = {
    prolific_pid: "${e://Field/PROLIFIC_PID}",
    study_id: "${e://Field/STUDY_ID}",
    session_id: "${e://Field/SESSION_ID}"
  };

  var status = document.createElement("p");
  status.id = "manager-reply-status";
  status.style.cssText = "margin-top:16px;color:#555;font-style:italic;";
  status.textContent = "Your review is with the marketing manager\u2026";
  question.getQuestionContainer().appendChild(status);
  question.disableNextButton();

  var finished = false;
  var finalStatus = "";
  var starts = 0;

  // Results are written three ways: embedded data (both APIs), the hidden text questions on this
  // page (question answers are always saved with the page and can drive branch logic and piped
  // text), and sessionStorage (fallback for the message page).
  var HIDDEN = { rejection_status: 0, rejection_msg1: 1, rejection_msg2: 2, rejection_compliance_code: 3, rejection_latency_ms: 4, rejection_wait_ms: 5 };
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
    try { sessionStorage.setItem("vr_" + name, text); } catch (error) {}
  }

  function enableWhenRead() {
    var remaining = MIN_READ_MS - (Date.now() - startedAt);
    if (remaining > 0) { setTimeout(enableWhenRead, remaining); return; }
    status.textContent = finalStatus === "ok"
      ? "The manager has replied. Click Next to read the reply."
      : "Click Next to continue.";
    question.enableNextButton();
  }

  function finish(newStatus) {
    if (finished) return;
    finished = true;
    finalStatus = newStatus;
    setEd("rejection_status", newStatus);
    setEd("rejection_wait_ms", String(Date.now() - startedAt));
    enableWhenRead();
  }

  function startJob() {
    starts += 1;
    return fetch(SERVICE_URL + "/api/rejection/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        condition: condition,
        language: "en",
        proposal: proposal,
        prolific_pid: ids.prolific_pid,
        study_id: ids.study_id,
        session_id: ids.session_id
      })
    }).then(function (response) { return response.json(); }).then(function (data) {
      if (!data.ok) throw new Error(data.error || "start_failed");
      setEd("rejection_job", data.job);
    });
  }

  function poll() {
    if (finished) return;
    if (Date.now() - startedAt > MAX_WAIT_MS) { finish("failed"); return; }
    fetch(SERVICE_URL + "/api/rejection/result?job=" + encodeURIComponent(requestId), { cache: "no-store" })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (data.status === "ok") {
          var messages = data.messages || [];
          setEd("rejection_msg1", messages[0] ? messages[0].text : "");
          setEd("rejection_msg2", messages[1] ? messages[1].text : "");
          setEd("rejection_compliance_code", data.compliance_code == null ? "" : String(data.compliance_code));
          setEd("rejection_latency_ms", data.latency_ms == null ? "" : String(data.latency_ms));
          finish("ok");
          return;
        }
        if (data.status === "failed" || data.status === "unknown") {
          // A failed job is replaced by a new one under the same request id; an unknown job means
          // the service restarted (or was still waking up when the first start was sent).
          if (starts < MAX_STARTS) {
            return startJob().catch(function () {}).then(function () { setTimeout(poll, POLL_MS); });
          }
          finish("failed");
          return;
        }
        setTimeout(poll, POLL_MS);
      })
      .catch(function () { setTimeout(poll, POLL_MS); });
  }

  startJob().catch(function () {}).then(function () { setTimeout(poll, POLL_MS); });
});
