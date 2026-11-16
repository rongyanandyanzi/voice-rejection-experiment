// Quick remark box (version 7, 2026-11-16): the short text box that opens after the midpoint page and
// after the end page when the coder chooses to send a remark. Qualtrics' own display logic shows
// the question, on its own page; this script only caps the length at 200 characters.
Qualtrics.SurveyEngine.addOnload(function () {
  var container = this.getQuestionContainer();
  if (!container) return;
  var field = container.querySelector("textarea, input[type=text]");
  if (field) field.maxLength = 200;
});
