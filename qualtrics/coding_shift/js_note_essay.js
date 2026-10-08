// Note page (batch 1 or batch 2): the optional essay box. No counter and no hard minimum. Below
// about twenty words one soft check appears once, with two equal buttons. Records when the page
// opened, the first keystroke, deletions, and the final text; batch 1's note is also kept in
// sessionStorage so the interim page can start the supervisor's reply at once.
Qualtrics.SurveyEngine.addOnload(function () {
  var question = this;
  var isBatch2 = question.getQuestionInfo().QuestionText.indexOf("batch 2") >= 0;
  var tag = isBatch2 ? "2" : "1";
  var textarea = question.getQuestionContainer().querySelector("textarea");
  var openedAt = Date.now();
  var firstKeyAt = 0;
  var deletions = 0;
  var lastLength = textarea ? textarea.value.length : 0;
  var softShown = false;
  function words(text) { return (String(text).trim().match(/\S+/g) || []).length; }
  function setEd(name, value) {
    try { Qualtrics.SurveyEngine.setEmbeddedData(name, value == null ? "" : String(value)); } catch (error) {}
    try { sessionStorage.setItem("cs_" + name, value == null ? "" : String(value)); } catch (error) {}
  }
  setEd("note" + tag + "_opened_at", new Date(openedAt).toISOString());
  if (textarea) {
    textarea.addEventListener("input", function (event) {
      if (!firstKeyAt) firstKeyAt = Date.now();
      if (event.target.value.length < lastLength) deletions += 1;
      lastLength = event.target.value.length;
    });
  }
  // Soft check: intercept the first Next click when the note is short. The New Survey Taking
  // Experience names the button next-button; the classic engine NextButton.
  var nextButton = document.getElementById("next-button") || document.getElementById("NextButton");
  if (nextButton) {
    nextButton.addEventListener("click", function (event) {
      var text = textarea ? textarea.value : "";
      if (softShown || !text.trim() || words(text) >= 20) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      softShown = true;
      var box = document.createElement("div");
      box.style.cssText = "margin:12px 0;padding:12px;border:1px solid #c9d2db;border-radius:6px;background:#f6f8fa;";
      box.innerHTML = "<p style=\"margin:0 0 10px\">The supervisor will see only what is written here. Would you like to add anything?</p>";
      var row = document.createElement("div");
      var buttons = [["Send as it is", function () { box.remove(); nextButton.click(); }], ["Add more", function () { box.remove(); softShown = true; if (textarea) textarea.focus(); }]];
      if (Math.random() < 0.5) buttons.reverse();
      buttons.forEach(function (pair) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = pair[0];
        button.style.cssText = "margin-right:10px;padding:8px 14px;font:inherit;border:1px solid #2f5d8a;border-radius:4px;background:#fff;color:#2f5d8a;cursor:pointer;";
        button.addEventListener("click", pair[1]);
        row.appendChild(button);
      });
      box.appendChild(row);
      question.getQuestionContainer().appendChild(box);
      setEd("note" + tag + "_soft_check", "shown");
    }, true);
  }
  Qualtrics.SurveyEngine.addOnPageSubmit(function () {
    var text = textarea ? textarea.value.trim() : "";
    var submittedAt = Date.now();
    setEd("note" + tag + "_text", text);
    setEd("note" + tag + "_submitted_at", new Date(submittedAt).toISOString());
    setEd("note" + tag + "_first_key_ms", firstKeyAt ? firstKeyAt - openedAt : "");
    setEd("note" + tag + "_write_ms", submittedAt - openedAt);
    setEd("note" + tag + "_deletions", deletions);
    setEd("note" + tag + "_words", words(text));
    // For batch 1 the fixed delay T is measured from the moment a note is sent (the reply only
    // starts being written then); without a note it stays anchored on the batch-1 submission.
    if (tag === "1" && text) { try { sessionStorage.setItem("cs_note1_submit_ms", String(submittedAt)); } catch (error) {} }
  });
});
