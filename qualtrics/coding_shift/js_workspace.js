// Last note page (version 7). Since 2026-11-20 (user decision) everyone sees this page after
// batch 3: the 21 comments the coder labelled in this shift, shown in full with the category chosen
// and an unlabelled tick box each, a running count of ticks, and below them the optional note box.
// Every tick is written to the hidden carrier on the page (label "ws_meta"), as one string:
//   own_ticks=1-3|3-2;first_tick_ms=..;page_ms=..
// The tick boxes carry no label, so they do not say what to look for. The builder fills the
// placeholder below.
// History: built on 2026-11-16 as a workspace reached only through "Prepare a proposal", with a
// project archive and a page on how results are reported (both removed 2026-11-17) and with the
// coding behind a section that had to be opened (until 2026-11-20). Git history: 35d488b, ea6ab68.
Qualtrics.SurveyEngine.addOnload(function () {
  var root = document.getElementById("cs-ws-root");
  if (!root) return;
  var OWN = "__CS_OWN__";            // [[batch, number, text], ...]
  var openedAt = Date.now();
  var firstTickAt = 0;
  var state = { ticks: {} };

  // ---- hidden carrier ------------------------------------------------------------------------
  function findCarrier() {
    var nodes = document.querySelectorAll("label, span, div, p, legend");
    for (var i = 0; i < nodes.length; i += 1) {
      if ((nodes[i].textContent || "").trim() !== "ws_meta") continue;
      var node = nodes[i];
      for (var up = 0; up < 10 && node; up += 1) {
        node = node.parentElement;
        if (!node || !node.querySelectorAll) continue;
        var inputs = node.querySelectorAll("input[type=text]");
        if (inputs.length === 1) return inputs[0];
        if (inputs.length > 1) return null;
      }
    }
    return null;
  }
  function ticked() {
    return Object.keys(state.ticks).filter(function (key) { return state.ticks[key]; });
  }
  function metaString() {
    var now = Date.now();
    return "own_ticks=" + ticked().join("|")
      + ";first_tick_ms=" + (firstTickAt ? firstTickAt - openedAt : "")
      + ";page_ms=" + (now - openedAt);
  }
  function record() {
    var value = metaString();
    try { sessionStorage.setItem("cs_ws_meta", value); } catch (error) {}
    var input = findCarrier();
    if (!input) return;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---- small DOM helpers ---------------------------------------------------------------------
  function el(tag, style, text) {
    var node = document.createElement(tag);
    if (style) node.style.cssText = style;
    if (text != null) node.textContent = text;
    return node;
  }
  function pipedLabel(batch, number) {
    var span = document.getElementById("cs-own-" + batch + "-" + number);
    var text = span ? (span.textContent || "").trim() : "";
    if (!text || text.charCodeAt(0) === 36) return "";
    return text.split(/[\s·]+/)[0];
  }
  var CELL = "padding:8px 10px;border-bottom:1px solid #eef1f4;vertical-align:top;font-size:14px;line-height:1.45;";
  var HEAD = "padding:8px 10px;border-bottom:2px solid #d9dee5;text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#556270;white-space:nowrap;";
  var CODE = "font-size:12px;font-weight:600;letter-spacing:.04em;color:#2f5d8a;white-space:nowrap;";

  function tickButton(key, counter) {
    var button = el("button", "width:24px;height:24px;padding:0;border:1px solid #8a97a6;border-radius:4px;background:#fff;color:#2f5d8a;font-size:16px;line-height:1;cursor:pointer;", "");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Tick this comment");
    button.addEventListener("click", function () {
      var on = !state.ticks[key];
      state.ticks[key] = on;
      if (!firstTickAt) firstTickAt = Date.now();
      button.textContent = on ? "✓" : "";
      button.style.background = on ? "#e8f0f8" : "#fff";
      button.setAttribute("aria-pressed", on ? "true" : "false");
      counter.textContent = "Ticked: " + ticked().length + " of " + OWN.length;
      record();
    });
    return button;
  }

  // On a narrow screen a table squeezes the comment into a thin column, so each row becomes a small
  // card instead: the comment, a line with the batch and the category, and the tick box on the right.
  var compact = (root.clientWidth || window.innerWidth || 800) < 560;
  function buildOwn(panel) {
    panel.appendChild(el("p", "margin:0 0 8px;line-height:1.5;", "The " + OWN.length + " comments you coded in this shift, with the category you chose. Tick any comments you want to count."));
    var counter = el("p", "margin:0 0 10px;font-weight:600;color:#1f2933;", "Ticked: 0 of " + OWN.length);
    panel.appendChild(counter);
    if (compact) {
      OWN.forEach(function (row) {
        var line = el("div", "display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eef1f4;");
        var main = el("div", "flex:1 1 auto;min-width:0;");
        main.appendChild(el("div", "font-size:15px;line-height:1.45;margin:0 0 4px;", row[2]));
        var meta = el("div", "font-size:12px;color:#556270;line-height:1.5;", "Batch " + row[0] + " · Your category");
        meta.appendChild(el("span", CODE, " " + pipedLabel(row[0], row[1])));
        main.appendChild(meta);
        line.appendChild(main);
        var side = el("div", "flex:0 0 auto;");
        side.appendChild(tickButton(row[0] + "-" + row[1], counter));
        line.appendChild(side);
        panel.appendChild(line);
      });
      return;
    }
    var wrap = el("div", "overflow-x:auto;");
    var tableNode = el("table", "width:100%;border-collapse:collapse;");
    var headRow = el("tr");
    ["Batch", "Comment", "Your category", ""].forEach(function (label) { headRow.appendChild(el("th", HEAD, label)); });
    var thead = el("thead");
    thead.appendChild(headRow);
    tableNode.appendChild(thead);
    var body = el("tbody");
    OWN.forEach(function (row) {
      var tr = el("tr");
      tr.appendChild(el("td", CELL + "white-space:nowrap;color:#556270;", String(row[0])));
      tr.appendChild(el("td", CELL, row[2]));
      tr.appendChild(el("td", CELL + CODE, pipedLabel(row[0], row[1])));
      var cell = el("td", CELL + "text-align:center;");
      cell.appendChild(tickButton(row[0] + "-" + row[1], counter));
      tr.appendChild(cell);
      body.appendChild(tr);
    });
    tableNode.appendChild(body);
    wrap.appendChild(tableNode);
    panel.appendChild(wrap);
  }

  // ---- the list, shown in full --------------------------------------------------------------
  var box = el("div", "border:1px solid #d9dee5;border-radius:8px;margin:0 0 10px;background:#fff;overflow:hidden;");
  box.appendChild(el("div", "padding:12px 14px;font-size:16px;font-weight:600;color:#1f2933;background:#f4f6f9;", "Your coding"));
  var panel = el("div", "padding:14px;border-top:1px solid #e3e7ec;");
  buildOwn(panel);
  box.appendChild(panel);
  root.appendChild(box);

  record();
  var nextButton = document.getElementById("next-button") || document.getElementById("NextButton");
  if (nextButton) nextButton.addEventListener("click", record, true);
  Qualtrics.SurveyEngine.addOnPageSubmit(record);
});
