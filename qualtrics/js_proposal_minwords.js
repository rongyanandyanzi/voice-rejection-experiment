// Proposal page: question JavaScript on the Text Entry (essay) question.
// Keeps Next disabled until the participant has written MIN_WORDS words, and copies the text into
// the embedded field "proposal" on submit so later pages can read it without piped text.
Qualtrics.SurveyEngine.addOnload(function () {
  var MIN_WORDS = 20;
  var question = this;
  var textarea = question.getQuestionContainer().querySelector("textarea");
  if (!textarea) return;
  var hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:13px;color:#666;";
  textarea.parentNode.appendChild(hint);
  function update() {
    var words = textarea.value.trim().split(/\s+/).filter(Boolean).length;
    if (words >= MIN_WORDS) {
      question.enableNextButton();
      hint.textContent = "";
    } else {
      question.disableNextButton();
      hint.textContent = "Please write at least " + MIN_WORDS + " words (" + words + " so far).";
    }
  }
  textarea.addEventListener("input", update);
  update();
});

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var textarea = this.getQuestionContainer().querySelector("textarea");
  var text = textarea ? textarea.value.trim() : "";
  Qualtrics.SurveyEngine.setEmbeddedData("proposal", text);
  try { if (typeof Qualtrics.SurveyEngine.setJSEmbeddedData === "function") Qualtrics.SurveyEngine.setJSEmbeddedData("proposal", text); } catch (error) {}
  // getEmbeddedData on a later page does not return values set from JavaScript, so the waiting
  // page reads the proposal from sessionStorage (same origin for the whole survey).
  try { sessionStorage.setItem("vr_proposal", text); } catch (error) {}
});
