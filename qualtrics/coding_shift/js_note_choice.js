// Note choice page (batch 1 or batch 2): "Attach a note" / "Finish without a note", shown in a
// random order by Qualtrics. Records the time the batch was submitted, which anchors the fixed
// delay T before the supervisor's messages appear, and which button came first.
Qualtrics.SurveyEngine.addOnload(function () {
  var question = this;
  var tag = question.getQuestionInfo().QuestionText.indexOf("Batch 2") >= 0 ? "2" : "1";
  var first = question.getQuestionContainer().querySelector("label.SingleAnswer, .ChoiceStructure label");
  var order = first && /attach/i.test(first.textContent) ? "attach_first" : "finish_first";
  try { Qualtrics.SurveyEngine.setEmbeddedData("n" + tag + "_button_order", order); } catch (error) {}
});
Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var isBatch2 = this.getQuestionInfo().QuestionText.indexOf("Batch 2") >= 0;
  var now = Date.now();
  var key = isBatch2 ? "cs_batch2_submit_ms" : "cs_batch1_submit_ms";
  try { if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, String(now)); } catch (error) {}
  try { Qualtrics.SurveyEngine.setEmbeddedData(isBatch2 ? "batch2_submit_at" : "batch1_submit_at", new Date(now).toISOString()); } catch (error) {}
});
