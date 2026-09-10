// Hidden carrier question (single-line Text Entry) on the waiting page. The waiting page script
// writes the reply into these fields; they are saved with the page like any answer, drive the
// branch logic and feed piped text on the message page. This script only hides the question.
Qualtrics.SurveyEngine.addOnload(function () {
  var container = this.getQuestionContainer();
  if (container) container.style.display = "none";
});
