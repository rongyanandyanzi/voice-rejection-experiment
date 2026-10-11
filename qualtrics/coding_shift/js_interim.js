// Used on two pages: the "what happens next" page straight after note 1 (added 2026-10-11) and the
// interim admin page after it. Starts the supervisor's reply in the background as soon as the
// first of them opens, if a note was attached; the service reuses the job if it is asked twice.
// On the "what happens next" page it also shows the note or the no-note version of the text.
// The condition was assigned by the randomiser before the note; it is used only here, and only
// for a note.
Qualtrics.SurveyEngine.addOnload(function () {
  var SERVICE_URL = "https://YOUR-SERVICE.onrender.com";
  var PIPE_START = String.fromCharCode(36) + "{";
  function unpiped(value) { return value && value.indexOf(PIPE_START) !== 0 ? value : ""; }
  function domValue(id, fallback) {
    var el = document.getElementById(id);
    return unpiped(el ? el.textContent.trim() : "") || unpiped(fallback || "");
  }
  var note = "";
  try { note = sessionStorage.getItem("cs_note1_text") || ""; } catch (error) {}
  if (!note) note = unpiped(Qualtrics.SurveyEngine.getEmbeddedData("note1_text") || "");
  var hasNoteBox = document.getElementById("cs-next-note");
  var noNoteBox = document.getElementById("cs-next-no-note");
  if (hasNoteBox && noNoteBox) {
    hasNoteBox.style.display = note.trim() ? "" : "none";
    noNoteBox.style.display = note.trim() ? "none" : "";
  } else {
    try { sessionStorage.setItem("cs_interim_opened_ms", String(Date.now())); } catch (error) {}
  }
  if (!note.trim()) return;
  var alreadyStarted = "";
  try { alreadyStarted = sessionStorage.getItem("cs_job_started") || ""; } catch (error) {}
  if (alreadyStarted === "1") return;
  var condition = domValue("cs-condition", "${e://Field/condition}");
  var requestId = domValue("cs-response-id", "${e://Field/ResponseID}");
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    try { requestId = sessionStorage.getItem("cs_request_id") || ""; } catch (error) {}
    if (!requestId) {
      requestId = "R_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
  }
  try { sessionStorage.setItem("cs_request_id", requestId); } catch (error) {}
  var body = {
    request_id: requestId,
    condition: condition,
    language: "en",
    proposal: note,
    prolific_pid: unpiped("${e://Field/PROLIFIC_PID}"),
    study_id: unpiped("${e://Field/STUDY_ID}"),
    session_id: unpiped("${e://Field/SESSION_ID}")
  };
  try { sessionStorage.setItem("cs_start_body", JSON.stringify(body)); } catch (error) {}
  fetch(SERVICE_URL + "/api/rejection/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (response) { return response.json(); })
    .then(function (data) { try { sessionStorage.setItem("cs_job_started", data && data.ok ? "1" : "0"); } catch (error) {} })
    .catch(function () {});
});
