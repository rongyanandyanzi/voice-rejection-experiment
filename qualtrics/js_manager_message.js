// Manager message page: question JavaScript on the Text/Graphic question holding the card.
// Piped text fills the card from the saved embedded data; if a slot is empty (for example when the
// embedded value was not saved yet), the value kept in sessionStorage by the waiting page is used.
Qualtrics.SurveyEngine.addOnload(function () {
  var slots = { "vr-proposal-echo": "vr_proposal", "vr-rejection-msg1": "vr_rejection_msg1", "vr-rejection-msg2": "vr_rejection_msg2" };
  Object.keys(slots).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el || el.textContent.trim()) return;
    var value = "";
    try { value = sessionStorage.getItem(slots[id]) || ""; } catch (error) {}
    if (value) el.textContent = value;
  });
});
