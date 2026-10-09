// New-messages page: the batch rating card for everyone, the reply card only when a note was
// attached. Piped text fills the reply; if a slot is empty the value kept in sessionStorage by the
// waiting page is used, retried for up to 20 s. Next is enabled 15 s after the reply is on screen.
Qualtrics.SurveyEngine.addOnload(function () {
  var question = this;
  var MIN_READ_MS = 15000;
  function stored(key) { try { return sessionStorage.getItem(key) || ""; } catch (error) { return ""; } }
  var PIPE_START = String.fromCharCode(36) + "{";
  function unpiped(value) { return value && value.indexOf(PIPE_START) !== 0 ? value : ""; }
  var note = stored("cs_note1_text") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("note1_text") || "");
  var status = stored("cs_rejection_status") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("rejection_status") || "");
  var card = document.getElementById("cs-reply-card");
  var hasReply = Boolean(note.trim()) && status !== "none";
  var slots = { "cs-note-echo": "cs_note1_text", "cs-msg1": "cs_rejection_msg1", "cs-msg2": "cs_rejection_msg2" };
  // Fill empty slots from what the waiting page stored. This is retried for a while: in the new
  // survey engine the page can open a moment before the waiting page has finished writing the
  // reply (seen once in a test on 2026-10-09 with several test tabs open), and a single read then
  // left the reply card blank.
  function fill() {
    var complete = true;
    Object.keys(slots).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (!unpiped(el.textContent.trim())) el.textContent = stored(slots[id]);
      // Only the first line is required: a non-voice note gets the single line "Note received."
      if (id === "cs-msg1" && !el.textContent.trim()) complete = false;
      el.style.display = el.textContent.trim() ? "" : "none";
    });
    return complete;
  }
  var replyShown = true;
  var readStart = Date.now();
  if (card) {
    if (!hasReply) {
      card.style.display = "none";
    } else if (!fill()) {
      replyShown = false;
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        var done = fill();
        if (done || tries >= 80) {
          clearInterval(timer);
          replyShown = true;
          readStart = Date.now();
          maybeEnable();
        }
      }, 250);
    }
  }
  var count = document.getElementById("cs-new-count");
  if (count) count.textContent = hasReply ? "3 new messages" : "2 new messages";
  try { Qualtrics.SurveyEngine.setEmbeddedData("messages_opened_at", new Date().toISOString()); } catch (error) {}
  // Next opens after the reading time, counted from when the reply is on screen.
  var readDone = false;
  function maybeEnable() {
    if (!replyShown) return;
    var left = MIN_READ_MS - (Date.now() - readStart);
    if (left > 0) { setTimeout(maybeEnable, left); return; }
    if (!readDone) { readDone = true; question.enableNextButton(); }
  }
  question.disableNextButton();
  maybeEnable();
});
