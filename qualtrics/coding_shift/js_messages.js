// New-messages page: the batch rating card for everyone, the reply card only when a note was
// attached. Piped text fills the reply; if a slot is empty the value kept in sessionStorage by the
// waiting page is used. Next is enabled after a short reading time.
Qualtrics.SurveyEngine.addOnload(function () {
  var question = this;
  var MIN_READ_MS = 15000;
  function stored(key) { try { return sessionStorage.getItem(key) || ""; } catch (error) { return ""; } }
  var PIPE_START = String.fromCharCode(36) + "{";
  function unpiped(value) { return value && value.indexOf(PIPE_START) !== 0 ? value : ""; }
  var note = stored("cs_note1_text") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("note1_text") || "");
  var status = stored("cs_rejection_status") || unpiped(Qualtrics.SurveyEngine.getEmbeddedData("rejection_status") || "");
  var card = document.getElementById("cs-reply-card");
  if (card) {
    if (!note.trim() || status === "none") {
      card.style.display = "none";
    } else {
      var slots = { "cs-note-echo": "cs_note1_text", "cs-msg1": "cs_rejection_msg1", "cs-msg2": "cs_rejection_msg2" };
      Object.keys(slots).forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var current = unpiped(el.textContent.trim());
        if (!current) el.textContent = stored(slots[id]);
      });
      var msg2 = document.getElementById("cs-msg2");
      if (msg2 && !msg2.textContent.trim()) msg2.style.display = "none";
    }
  }
  var count = document.getElementById("cs-new-count");
  if (count) count.textContent = (!note.trim() || status === "none") ? "2 new messages" : "3 new messages";
  try { Qualtrics.SurveyEngine.setEmbeddedData("messages_opened_at", new Date().toISOString()); } catch (error) {}
  question.disableNextButton();
  setTimeout(function () { question.enableNextButton(); }, MIN_READ_MS);
});
