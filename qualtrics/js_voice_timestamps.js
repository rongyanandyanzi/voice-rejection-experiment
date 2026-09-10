// Voice DV page: question JavaScript on the optional Text Entry (essay) question.
// Records when the page opened and when it was submitted, and copies the text into "voice_text".
Qualtrics.SurveyEngine.addOnload(function () {
  Qualtrics.SurveyEngine.setEmbeddedData("voice_start", new Date().toISOString());
});

Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var textarea = this.getQuestionContainer().querySelector("textarea");
  var submitted = new Date().toISOString();
  var text = textarea ? textarea.value.trim() : "";
  Qualtrics.SurveyEngine.setEmbeddedData("voice_submit", submitted);
  Qualtrics.SurveyEngine.setEmbeddedData("voice_text", text);
  try {
    if (typeof Qualtrics.SurveyEngine.setJSEmbeddedData === "function") {
      Qualtrics.SurveyEngine.setJSEmbeddedData("voice_submit", submitted);
      Qualtrics.SurveyEngine.setJSEmbeddedData("voice_text", text);
    }
  } catch (error) {}
});
