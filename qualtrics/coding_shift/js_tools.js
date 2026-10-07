// Note 2 pages: the two tools, "Review this batch" and "Why the rules are this way", are collapsed
// sections above the choice or the essay box. Each open is counted and the time of the first open
// recorded, into the hidden carrier questions on the page (review_opens, why_opens,
// first_tool_open_ms) and embedded data.
Qualtrics.SurveyEngine.addOnload(function () {
  var question = this;
  var openedAt = Date.now();
  var counts = { review: 0, why: 0 };
  var firstOpen = 0;
  var HIDDEN = { review_opens: 0, why_opens: 1, first_tool_open_ms: 2 };
  function setHidden(index, value) {
    var inputs = document.querySelectorAll("input[type=text]");
    var input = inputs[index];
    if (!input) return;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value == null ? "" : String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  var isBatch2Essay = Boolean(question.getQuestionContainer().querySelector("textarea"));
  var suffix = isBatch2Essay ? "_essay" : "_choice";
  function record() {
    try {
      Qualtrics.SurveyEngine.setEmbeddedData("review_opens" + suffix, String(counts.review));
      Qualtrics.SurveyEngine.setEmbeddedData("why_opens" + suffix, String(counts.why));
      Qualtrics.SurveyEngine.setEmbeddedData("first_tool_open_ms" + suffix, firstOpen ? String(firstOpen - openedAt) : "");
    } catch (error) {}
    setHidden(HIDDEN.review_opens, counts.review);
    setHidden(HIDDEN.why_opens, counts.why);
    setHidden(HIDDEN.first_tool_open_ms, firstOpen ? firstOpen - openedAt : "");
  }
  ["review", "why"].forEach(function (name) {
    var button = document.getElementById("cs-tool-" + name);
    var panel = document.getElementById("cs-panel-" + name);
    if (!button || !panel) return;
    button.addEventListener("click", function () {
      var open = panel.style.display !== "none" && panel.style.display !== "";
      if (!open) {
        counts[name] += 1;
        if (!firstOpen) firstOpen = Date.now();
        panel.style.display = "block";
        button.textContent = name === "review" ? "Hide this batch" : "Hide the rules";
      } else {
        panel.style.display = "none";
        button.textContent = name === "review" ? "Review this batch" : "Why the rules are this way";
      }
      record();
    });
  });
  record();
});
