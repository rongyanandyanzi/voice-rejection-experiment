// Voice DV page: question JavaScript on the optional Text Entry (essay) question.
// Records when the page opened and when it was submitted, and copies the text into "voice_text".
Qualtrics.SurveyEngine.addOnload(function () {
  Qualtrics.SurveyEngine.setEmbeddedData("voice_start", new Date().toISOString());
});

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var textarea = this.getQuestionContainer().querySelector("textarea");
  Qualtrics.SurveyEngine.setEmbeddedData("voice_submit", new Date().toISOString());
  Qualtrics.SurveyEngine.setEmbeddedData("voice_text", textarea ? textarea.value.trim() : "");
});
