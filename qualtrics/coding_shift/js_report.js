// Report button under every comment of batch 3 (version 8, 2026-11-23, user decision).
// Two ordinary questions sit under the category question: a one-option checkbox ("Report this
// comment to the coding supervisor") and a one-line optional text box ("What is the problem?").
// This script, attached to the checkbox question, turns the checkbox into a button and keeps the
// text box hidden until the comment is reported. Clicking the button ticks the real checkbox, so the
// report is saved as an ordinary answer; "Undo" unticks it and clears the text. Nothing on the page
// names a kind of problem. If the script cannot find its parts it does nothing, and the plain
// checkbox and text box are shown instead.
Qualtrics.SurveyEngine.addOnload(function () {
  var TEXT_QID = "__CS_TEXT_QID__";
  var container = this.getQuestionContainer();
  if (!container) return;
  var box = container.querySelector("input[type=checkbox]");
  var textContainer = document.getElementById("question-" + TEXT_QID) || document.getElementById(TEXT_QID);
  if (!box || !textContainer) return;
  var field = textContainer.querySelector("input[type=text], textarea");
  if (field) field.maxLength = 150;

  // Hide the native choice (the checkbox and its label) but keep it in the page so it is saved.
  var native = box.closest("li") || box.closest("label") || box.parentElement;
  var list = native && native.parentElement && native.parentElement !== container && native.parentElement.children.length === 1 ? native.parentElement : native;
  if (list) list.style.display = "none";
  // The question's own short label is only there for the plain fallback; the button replaces it.
  var ownLabel = container.querySelector("span[style*='font-size:13px']");
  if (ownLabel && /Report to the supervisor/.test(ownLabel.textContent || "")) ownLabel.style.display = "none";

  function el(tag, style, text) {
    var node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text != null) node.textContent = text;
    return node;
  }
  var wrap = el("div", "margin:4px 0 0;");
  var button = el("button", "padding:11px 20px;font:inherit;font-size:16px;font-weight:700;border:0;border-radius:8px;background:#c2410c;color:#fff;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.25);", "Report this comment to the coding supervisor");
  button.type = "button";
  var status = el("div", "display:none;font-size:15px;line-height:1.5;color:#1f2933;");
  status.appendChild(el("span", "font-weight:700;color:#2f7a4a;", "✓ Reported to the coding supervisor."));
  status.appendChild(document.createTextNode(" The supervisor reads reports at the end of the shift. "));
  var undo = el("button", "padding:0;font:inherit;font-size:14px;border:0;background:none;color:#2f5d8a;text-decoration:underline;cursor:pointer;", "Undo");
  undo.type = "button";
  status.appendChild(undo);
  wrap.appendChild(button);
  wrap.appendChild(status);
  // Put the button where the hidden choice was, so it lines up with the text box below it.
  var host = (list && list.parentElement) || container;
  if (/^(UL|OL)$/.test(host.tagName) && host.parentElement) host = host.parentElement;
  host.appendChild(wrap);

  function clearField() {
    if (!field || !field.value) return;
    var proto = field.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, "");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function render() {
    var on = Boolean(box.checked);
    button.style.display = on ? "none" : "inline-block";
    status.style.display = on ? "block" : "none";
    textContainer.style.display = on ? "" : "none";
    if (!on) clearField();
  }
  function toggle() {
    box.click();
    setTimeout(render, 60);
  }
  button.addEventListener("click", toggle);
  undo.addEventListener("click", toggle);
  box.addEventListener("change", function () { setTimeout(render, 0); });
  render();
});
