// Waiting page: question JavaScript on the Text/Graphic question that shows "Your suggestion has
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
  var requestId = "${e://Field/ResponseID}";
  var condition = "${e://Field/condition}";
  var proposal = Qualtrics.SurveyEngine.getEmbeddedData("proposal") || "";
  var ids = {
    prolific_pid: "${e://Field/PROLIFIC_PID}",
    study_id: "${e://Field/STUDY_ID}",
    session_id: "${e://Field/SESSION_ID}"
  };

  var status = document.createElement("p");
  status.id = "manager-reply-status";
  status.style.cssText = "margin-top:16px;color:#555;font-style:italic;";
  status.textContent = "The manager is reading your suggestion\u2026";
  question.getQuestionContainer().appendChild(status);
  question.disableNextButton();

  var finished = false;
  var starts = 0;

  function setEd(name, value) { Qualtrics.SurveyEngine.setEmbeddedData(name, value); }

  function enableWhenRead() {
    var remaining = MIN_READ_MS - (Date.now() - startedAt);
    if (remaining > 0) { setTimeout(enableWhenRead, remaining); return; }
    status.textContent = Qualtrics.SurveyEngine.getEmbeddedData("rejection_status") === "ok"
      ? "The manager has replied. Click Next to read the reply."
      : "Click Next to continue.";
    question.enableNextButton();
  }

  function finish(newStatus) {
    if (finished) return;
    finished = true;
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
