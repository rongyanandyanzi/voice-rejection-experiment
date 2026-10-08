// Last comment of batch 1: records when batch 1 was submitted. The waiting page measures the fixed
// delay T from this moment, the same T for everyone, whether or not a note follows.
Qualtrics.SurveyEngine.addOnPageSubmit(function () {
  var now = Date.now();
  try { if (!sessionStorage.getItem("cs_batch1_submit_ms")) sessionStorage.setItem("cs_batch1_submit_ms", String(now)); } catch (error) {}
  try { Qualtrics.SurveyEngine.setEmbeddedData("batch1_submit_at", new Date(now).toISOString()); } catch (error) {}
});
