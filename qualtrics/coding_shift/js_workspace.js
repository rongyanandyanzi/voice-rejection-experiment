// Workspace page (version 7, 2026-11-16). Shown only to coders who chose "Prepare a proposal" at the
// end of batch 3. Three sections, all closed when the page opens and only one open at a time:
// "Your coding" (the 21 comments the coder labelled), "Project archive" (thirty comments with two
// coders' labels) and "How results are reported". Every opening, the time each section stays open,
// every tick and every use of the archive filter is written to the hidden carrier on the page
// (label "ws_meta"), as one string:
//   own_opens=..;own_ms=..;arch_opens=..;arch_ms=..;rep_opens=..;rep_ms=..;first_open_ms=..;
//   own_ticks=1-3|3-2;arch_ticks=A07|A09;filter_uses=..;page_ms=..
// The tick boxes carry no label, so they do not say what to look for. The builder fills the three
// placeholders below; nothing here is typed by hand twice.
Qualtrics.SurveyEngine.addOnload(function () {
  var root = document.getElementById("cs-ws-root");
  if (!root) return;
  var OWN = "__CS_OWN__";            // [[batch, number, text], ...]
  var ARCHIVE = "__CS_ARCHIVE__";    // [[id, text, coderA, coderB], ...]
  var REPORT_HTML = "__CS_REPORT_HTML__";
  var CATEGORIES = ["TECH", "WORDING", "LENGTH", "PAYMENT", "CONTENT"];
  var openedAt = Date.now();
  var firstOpenAt = 0;
  var filterUses = 0;
  var current = "";
  var state = {
    own: { opens: 0, ms: 0, since: 0, ticks: {} },
    arch: { opens: 0, ms: 0, since: 0, ticks: {} },
    rep: { opens: 0, ms: 0, since: 0, ticks: {} }
  };

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
  function openMs(name, now) {
    var entry = state[name];
    return entry.ms + (entry.since ? now - entry.since : 0);
  }
  function tickList(name) {
    return Object.keys(state[name].ticks).filter(function (key) { return state[name].ticks[key]; }).join("|");
  }
  function metaString() {
    var now = Date.now();
    return "own_opens=" + state.own.opens + ";own_ms=" + openMs("own", now)
      + ";arch_opens=" + state.arch.opens + ";arch_ms=" + openMs("arch", now)
      + ";rep_opens=" + state.rep.opens + ";rep_ms=" + openMs("rep", now)
      + ";first_open_ms=" + (firstOpenAt ? firstOpenAt - openedAt : "")
      + ";own_ticks=" + tickList("own") + ";arch_ticks=" + tickList("arch")
      + ";filter_uses=" + filterUses + ";page_ms=" + (now - openedAt);
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
  var HEAD = "padding:8px 10px;border-bottom:2px solid #d9dee5;text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#556270;";
  var CODE = "font-size:12px;font-weight:600;letter-spacing:.04em;color:#2f5d8a;white-space:nowrap;";

  function tickButton(name, key, counter, total) {
    var button = el("button", "width:24px;height:24px;padding:0;border:1px solid #8a97a6;border-radius:4px;background:#fff;color:#2f5d8a;font-size:16px;line-height:1;cursor:pointer;", "");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Tick this comment");
    button.addEventListener("click", function () {
      var on = !state[name].ticks[key];
      state[name].ticks[key] = on;
      button.textContent = on ? "✓" : "";
      button.style.background = on ? "#e8f0f8" : "#fff";
      button.setAttribute("aria-pressed", on ? "true" : "false");
      var count = Object.keys(state[name].ticks).filter(function (k) { return state[name].ticks[k]; }).length;
      counter.textContent = "Ticked: " + count + " of " + total;
      record();
    });
    return button;
  }
  // On a narrow screen a table squeezes the comment into a thin column, so each row becomes a small
  // card instead: the comment, a line with the number and the labels, and the tick box on the right.
  var compact = (root.clientWidth || window.innerWidth || 800) < 560;
  function compactRow(text, metaParts, tick) {
    var row = el("div", "display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eef1f4;");
    var main = el("div", "flex:1 1 auto;min-width:0;");
    main.appendChild(el("div", "font-size:15px;line-height:1.45;margin:0 0 4px;", text));
    var meta = el("div", "font-size:12px;color:#556270;line-height:1.5;");
    metaParts.forEach(function (part, index) {
      if (index) meta.appendChild(document.createTextNode(" \u00b7 "));
      meta.appendChild(document.createTextNode(part[0]));
      if (part[1]) meta.appendChild(el("span", CODE, " " + part[1]));
    });
    main.appendChild(meta);
    row.appendChild(main);
    var side = el("div", "flex:0 0 auto;");
    side.appendChild(tick);
    row.appendChild(side);
    return row;
  }
  function table(headers) {
    var wrap = el("div", "overflow-x:auto;");
    var tableNode = el("table", "width:100%;border-collapse:collapse;");
    var headRow = el("tr");
    headers.forEach(function (label) { headRow.appendChild(el("th", HEAD, label)); });
    var thead = el("thead");
    thead.appendChild(headRow);
    tableNode.appendChild(thead);
    var body = el("tbody");
    tableNode.appendChild(body);
    wrap.appendChild(tableNode);
    return { wrap: wrap, body: body };
  }

  // ---- the three sections ----------------------------------------------------------------------
  function buildOwn(panel) {
    panel.appendChild(el("p", "margin:0 0 8px;line-height:1.5;", "The " + OWN.length + " comments you coded in this shift, with the category you chose. Tick any comments you want to count."));
    var counter = el("p", "margin:0 0 10px;font-weight:600;color:#1f2933;", "Ticked: 0 of " + OWN.length);
    panel.appendChild(counter);
    if (compact) {
      OWN.forEach(function (row) {
        panel.appendChild(compactRow(row[2], [["Batch " + row[0], ""], ["Your category", pipedLabel(row[0], row[1])]],
          tickButton("own", row[0] + "-" + row[1], counter, OWN.length)));
      });
      return;
    }
    var grid = table(["Batch", "Comment", "Your category", ""]);
    OWN.forEach(function (row) {
      var tr = el("tr");
      tr.appendChild(el("td", CELL + "white-space:nowrap;color:#556270;", String(row[0])));
      tr.appendChild(el("td", CELL, row[2]));
      tr.appendChild(el("td", CELL + CODE, pipedLabel(row[0], row[1])));
      var cell = el("td", CELL + "text-align:center;");
      cell.appendChild(tickButton("own", row[0] + "-" + row[1], counter, OWN.length));
      tr.appendChild(cell);
      grid.body.appendChild(tr);
    });
    panel.appendChild(grid.wrap);
  }
  function buildArchive(panel) {
    panel.appendChild(el("p", "margin:0 0 8px;line-height:1.5;", "Thirty comments from earlier shifts. Each was coded by two coders working separately. Tick any comments you want to count. You can filter by category."));
    var counter = el("p", "margin:0 0 10px;font-weight:600;color:#1f2933;", "Ticked: 0 of " + ARCHIVE.length);
    panel.appendChild(counter);
    var bar = el("div", "margin:0 0 10px;");
    var rows = [];
    var buttons = [];
    function applyFilter(category, button) {
      rows.forEach(function (entry) {
        entry.tr.style.display = (!category || entry.a === category || entry.b === category) ? (entry.shown || "") : "none";
      });
      buttons.forEach(function (other) {
        other.style.background = other === button ? "#2f5d8a" : "#fff";
        other.style.color = other === button ? "#fff" : "#2f5d8a";
      });
    }
    [""].concat(CATEGORIES).forEach(function (category) {
      var button = el("button", "margin:0 6px 6px 0;padding:4px 10px;font:inherit;font-size:12px;border:1px solid #2f5d8a;border-radius:4px;background:#fff;color:#2f5d8a;cursor:pointer;", category || "All");
      button.type = "button";
      button.addEventListener("click", function () {
        if (category) filterUses += 1;
        applyFilter(category, button);
        record();
      });
      buttons.push(button);
      bar.appendChild(button);
    });
    panel.appendChild(bar);
    if (compact) {
      ARCHIVE.forEach(function (row) {
        var node = compactRow(row[1], [[row[0], ""], ["Coder A", row[2]], ["Coder B", row[3]]], tickButton("arch", row[0], counter, ARCHIVE.length));
        panel.appendChild(node);
        rows.push({ tr: node, a: row[2], b: row[3], shown: "flex" });
      });
      applyFilter("", buttons[0]);
      return;
    }
    var grid = table(["No.", "Comment", "Coder A", "Coder B", ""]);
    ARCHIVE.forEach(function (row) {
      var tr = el("tr");
      tr.appendChild(el("td", CELL + "white-space:nowrap;color:#556270;", row[0]));
      tr.appendChild(el("td", CELL, row[1]));
      tr.appendChild(el("td", CELL + CODE, row[2]));
      tr.appendChild(el("td", CELL + CODE, row[3]));
      var cell = el("td", CELL + "text-align:center;");
      cell.appendChild(tickButton("arch", row[0], counter, ARCHIVE.length));
      tr.appendChild(cell);
      grid.body.appendChild(tr);
      rows.push({ tr: tr, a: row[2], b: row[3] });
    });
    panel.appendChild(grid.wrap);
    applyFilter("", buttons[0]);
  }
  function buildReport(panel) {
    var holder = el("div", "line-height:1.6;");
    holder.innerHTML = REPORT_HTML;
    panel.appendChild(holder);
  }

  var SECTIONS = [
    { name: "own", label: "Your coding", build: buildOwn },
    { name: "arch", label: "Project archive", build: buildArchive },
    { name: "rep", label: "How results are reported", build: buildReport }
  ];
  var parts = {};
  function closeCurrent(now) {
    if (!current) return;
    var entry = state[current];
    entry.ms += now - entry.since;
    entry.since = 0;
    parts[current].panel.style.display = "none";
    parts[current].mark.textContent = "▸";
    parts[current].head.setAttribute("aria-expanded", "false");
    current = "";
  }
  SECTIONS.forEach(function (section) {
    var box = el("div", "border:1px solid #d9dee5;border-radius:8px;margin:0 0 10px;background:#fff;overflow:hidden;");
    var head = el("button", "display:block;width:100%;text-align:left;padding:12px 14px;font:inherit;font-size:16px;font-weight:600;color:#1f2933;background:#f4f6f9;border:0;cursor:pointer;");
    head.type = "button";
    head.setAttribute("aria-expanded", "false");
    var mark = el("span", "display:inline-block;width:18px;color:#2f5d8a;", "▸");
    head.appendChild(mark);
    head.appendChild(document.createTextNode(section.label));
    var panel = el("div", "display:none;padding:14px;border-top:1px solid #e3e7ec;");
    section.build(panel);
    box.appendChild(head);
    box.appendChild(panel);
    root.appendChild(box);
    parts[section.name] = { head: head, mark: mark, panel: panel };
    head.addEventListener("click", function () {
      var now = Date.now();
      var wasOpen = current === section.name;
      closeCurrent(now);
      if (!wasOpen) {
        current = section.name;
        state[current].opens += 1;
        state[current].since = now;
        if (!firstOpenAt) firstOpenAt = now;
        panel.style.display = "block";
        mark.textContent = "▾";
        head.setAttribute("aria-expanded", "true");
      }
      record();
    });
  });

  record();
  var nextButton = document.getElementById("next-button") || document.getElementById("NextButton");
  if (nextButton) nextButton.addEventListener("click", record, true);
  Qualtrics.SurveyEngine.addOnPageSubmit(record);
});
