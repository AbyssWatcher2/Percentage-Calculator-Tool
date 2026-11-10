// Frontend controller for the Tauri v2 desktop app (v2.1).
//
// Keeps the terminal DOM aesthetic, input parsing, and live-formula feedback,
// while delegating all percentage math, persistent local history, clipboard,
// and app metadata to the Rust backend via Tauri commands.

const COPY_FEEDBACK_MS = 1200;
let historyLimit = 500;
let taxMode = "add";

function invoke(cmd, args) {
  const fn =
    window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke;
  if (!fn) {
    return Promise.reject(new Error(`Tauri invoke unavailable for ${cmd}`));
  }
  return fn(cmd, args);
}

// Per-section sequence counters ensure a slower IPC reply can never overwrite
// a newer keystroke or a "clear" click.
const seq = {
  change: 0,
  percent: 0,
  what: 0,
  discount: 0,
  base: 0,
  markup: 0,
  tax: 0
};

// Holds the most recent valid calculation per card so explicit actions
// (Calculate, Enter, Copy) can record it to persistent history.
const lastValidCalc = {
  change: null,
  percent: null,
  what: null,
  discount: null,
  base: null,
  markup: null,
  tax: null
};

function getNumber(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const val = el.value.trim();
  if (val === "") return null;
  const num = parseFloat(val);
  return Number.isNaN(num) ? null : num;
}

function getRawInput(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function setLines(el, lines) {
  if (!el) return;
  el.replaceChildren();
  lines.forEach((line, idx) => {
    if (idx > 0) el.appendChild(document.createElement("br"));
    el.appendChild(document.createTextNode(line));
  });
}

function setFormulaError(el, formula, errorNote) {
  if (!el) return;
  const errSpan = document.createElement("span");
  errSpan.className = "error-text";
  errSpan.textContent = errorNote;
  el.replaceChildren(document.createTextNode(`${formula} `), errSpan);
}

function setResult(resultId, content, isError = false) {
  const el = document.getElementById(resultId);
  if (!el) return;

  const prefix = document.createElement("span");
  prefix.className = "result-prefix";
  prefix.textContent = "=";

  if (isError) {
    const errSpan = document.createElement("span");
    errSpan.className = "error-text";
    errSpan.textContent = content;
    el.replaceChildren(prefix, errSpan);
    return;
  }

  const parts = String(content).split("<br>");
  const nodes = [prefix];
  parts.forEach((part, idx) => {
    if (idx > 0) nodes.push(document.createElement("br"));
    nodes.push(document.createTextNode(part));
  });
  el.replaceChildren(...nodes);
}

function showCopyFeedback(button) {
  if (!button) return;

  const originalText = button.innerText;
  button.innerText = "copied";
  button.classList.add("copied");

  window.setTimeout(() => {
    button.innerText = originalText;
    button.classList.remove("copied");
  }, COPY_FEEDBACK_MS);
}

async function copyText(text, button) {
  try {
    await invoke("copy_text", { text });
    showCopyFeedback(button);
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      showCopyFeedback(button);
    } catch {
      // Clipboard failures should not interrupt the calculator.
    }
  }
}

function swapFields(aId, bId, updateFn) {
  const elA = document.getElementById(aId);
  const elB = document.getElementById(bId);
  if (!elA || !elB) return Promise.resolve();
  const tmp = elA.value;
  elA.value = elB.value;
  elB.value = tmp;
  return updateFn();
}

function attachEnterKey(ids, computeAndRecordFn) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter") computeAndRecordFn();
    });
  });
}

async function updateChangeLive() {
  const ticket = ++seq.change;
  const orig = getNumber("changeOrig");
  const newVal = getNumber("changeNew");
  const formulaDiv = document.getElementById("changeLiveFormula");
  const resultSpan = document.getElementById("changeLiveResult");

  if (orig === null || newVal === null) {
    lastValidCalc.change = null;
    formulaDiv.textContent = "((new − original) / original) × 100";
    resultSpan.textContent = "→ —";
    setResult("changeResult", "—");
    return;
  }

  const result = await invoke("calc_change", {
    originalValue: orig,
    newValue: newVal
  });
  if (ticket !== seq.change) return;

  if (result.ok === "false") {
    lastValidCalc.change = null;
    setFormulaError(
      formulaDiv,
      "((new − original) / original) × 100",
      "(original cannot be zero)"
    );
    resultSpan.textContent = "→ invalid";
    setResult("changeResult", result.error, true);
    return;
  }

  formulaDiv.textContent = `((${newVal} − ${orig}) / ${orig}) × 100`;
  resultSpan.textContent = `→ ${result.liveResult}`;
  setResult("changeResult", result.label);

  lastValidCalc.change = {
    calculator: "change",
    calculatorLabel: "Percentage Change",
    inputA: getRawInput("changeOrig"),
    inputB: getRawInput("changeNew"),
    mode: null,
    inputsText: `${orig} → ${newVal}`,
    resultText: result.label,
    copyText: result.label
  };
}

async function updatePercentLive() {
  const ticket = ++seq.percent;
  const x = getNumber("isWhatX");
  const y = getNumber("isWhatY");
  const formulaDiv = document.getElementById("percentLiveFormula");
  const resultSpan = document.getElementById("percentLiveResult");

  if (x === null || y === null) {
    lastValidCalc.percent = null;
    formulaDiv.textContent = "(X / Y) × 100";
    resultSpan.textContent = "→ —";
    setResult("percentResult", "—");
    return;
  }

  const result = await invoke("calc_percent_of_total", { part: x, total: y });
  if (ticket !== seq.percent) return;

  if (result.ok === "false") {
    lastValidCalc.percent = null;
    setFormulaError(formulaDiv, "(X / Y) × 100", "(Y cannot be zero)");
    resultSpan.textContent = "→ invalid";
    setResult("percentResult", result.error, true);
    return;
  }

  formulaDiv.textContent = `(${x} / ${y}) × 100`;
  resultSpan.textContent = `→ ${result.label}`;
  setResult("percentResult", result.label);

  lastValidCalc.percent = {
    calculator: "percent",
    calculatorLabel: "Percentage of Total",
    inputA: getRawInput("isWhatX"),
    inputB: getRawInput("isWhatY"),
    mode: null,
    inputsText: `${x} of ${y}`,
    resultText: result.label,
    copyText: result.label
  };
}

async function updateWhatLive() {
  const ticket = ++seq.what;
  const x = getNumber("whatX");
  const y = getNumber("whatY");
  const formulaDiv = document.getElementById("whatLiveFormula");
  const resultSpan = document.getElementById("whatLiveResult");

  if (x === null || y === null) {
    lastValidCalc.what = null;
    formulaDiv.textContent = "(X / 100) × Y";
    resultSpan.textContent = "→ —";
    setResult("whatResult", "—");
    return;
  }

  const result = await invoke("calc_portion", { percent: x, number: y });
  if (ticket !== seq.what) return;

  formulaDiv.textContent = `(${x} / 100) × ${y}`;
  resultSpan.textContent = `→ ${result.label}`;
  setResult("whatResult", result.label);

  lastValidCalc.what = {
    calculator: "what",
    calculatorLabel: "Calculate Percentage",
    inputA: getRawInput("whatX"),
    inputB: getRawInput("whatY"),
    mode: null,
    inputsText: `${x}% of ${y}`,
    resultText: result.label,
    copyText: result.label
  };
}

async function updateDiscountLive() {
  const ticket = ++seq.discount;
  const price = getNumber("discountPrice");
  const disc = getNumber("discountPercent");
  const formulaDiv = document.getElementById("discountLiveFormula");
  const resultSpan = document.getElementById("discountLiveResult");

  if (price === null || disc === null) {
    lastValidCalc.discount = null;
    setLines(formulaDiv, [
      "final = price × (1 − discount/100)",
      "saved = price × discount/100"
    ]);
    resultSpan.textContent = "→ —";
    setResult("discountResult", "—");
    return;
  }

  const result = await invoke("calc_discount", {
    price,
    discountPercent: disc
  });
  if (ticket !== seq.discount) return;

  setLines(formulaDiv, [
    `final = ${price} × (1 − ${disc}/100) = ${result.finalText}`,
    `saved = ${price} × ${disc}/100 = ${result.savedText}`
  ]);
  resultSpan.textContent = `→ final: ${result.finalText} | saved: ${result.savedText}`;
  setResult("discountResult", result.label);

  lastValidCalc.discount = {
    calculator: "discount",
    calculatorLabel: "Discount",
    inputA: getRawInput("discountPrice"),
    inputB: getRawInput("discountPercent"),
    mode: null,
    inputsText: `${price} (−${disc}%)`,
    resultText: `Final: ${result.finalText} · Saved: ${result.savedText}`,
    copyText: result.copyText
  };
}

async function updateBaseLive() {
  const ticket = ++seq.base;
  const x = getNumber("baseX");
  const y = getNumber("baseY");
  const formulaDiv = document.getElementById("baseLiveFormula");
  const resultSpan = document.getElementById("baseLiveResult");

  if (x === null || y === null) {
    lastValidCalc.base = null;
    formulaDiv.textContent = "X / (Y / 100)";
    resultSpan.textContent = "→ —";
    setResult("baseResult", "—");
    return;
  }

  const result = await invoke("calc_original", { value: x, percent: y });
  if (ticket !== seq.base) return;

  if (result.ok === "false") {
    lastValidCalc.base = null;
    setFormulaError(formulaDiv, "X / (Y / 100)", "(Y cannot be zero)");
    resultSpan.textContent = "→ invalid";
    setResult("baseResult", result.error, true);
    return;
  }

  formulaDiv.textContent = `${x} / (${y} / 100)`;
  resultSpan.textContent = `→ ${result.label}`;
  setResult("baseResult", result.label);

  lastValidCalc.base = {
    calculator: "base",
    calculatorLabel: "Find Original Value",
    inputA: getRawInput("baseX"),
    inputB: getRawInput("baseY"),
    mode: null,
    inputsText: `${x} is ${y}%`,
    resultText: result.label,
    copyText: result.label
  };
}

async function updateMarkupLive() {
  const ticket = ++seq.markup;
  const cost = getNumber("markupCost");
  const price = getNumber("markupPrice");
  const formulaDiv = document.getElementById("markupLiveFormula");
  const resultSpan = document.getElementById("markupLiveResult");

  if (cost === null || price === null) {
    lastValidCalc.markup = null;
    setLines(formulaDiv, [
      "profit = price − cost",
      "markup = (profit / cost) × 100",
      "margin = (profit / price) × 100"
    ]);
    resultSpan.textContent = "→ —";
    setResult("markupResult", "—");
    return;
  }

  const result = await invoke("calc_markup_margin", {
    cost,
    sellingPrice: price
  });
  if (ticket !== seq.markup) return;

  if (result.ok === "false") {
    lastValidCalc.markup = null;
    setFormulaError(
      formulaDiv,
      "markup = (price − cost) / cost × 100",
      `(${result.error.toLowerCase()})`
    );
    resultSpan.textContent = "→ invalid";
    setResult("markupResult", result.error, true);
    return;
  }

  setLines(formulaDiv, [
    `profit = ${price} − ${cost} = ${result.profitText}`,
    `markup = (${result.profitText} / ${cost}) × 100 = ${result.markupText}`,
    `margin = (${result.profitText} / ${price}) × 100 = ${result.marginText}`
  ]);
  resultSpan.textContent = `→ ${result.liveResult}`;
  setResult("markupResult", result.label);

  lastValidCalc.markup = {
    calculator: "markup",
    calculatorLabel: "Markup & Margin",
    inputA: getRawInput("markupCost"),
    inputB: getRawInput("markupPrice"),
    mode: null,
    inputsText: `Cost ${cost} → Price ${price}`,
    resultText: `Profit: ${result.profitText} · Markup: ${result.markupText} · Margin: ${result.marginText}`,
    copyText: result.copyText
  };
}

function setTaxMode(newMode, triggerUpdate = true) {
  taxMode = newMode === "extract" ? "extract" : "add";
  const addBtn = document.getElementById("taxModeAddBtn");
  const extractBtn = document.getElementById("taxModeExtractBtn");
  const amountLabel = document.getElementById("taxAmountLabel");
  const amountInput = document.getElementById("taxAmount");

  if (taxMode === "extract") {
    addBtn.classList.remove("active");
    extractBtn.classList.add("active");
    amountLabel.textContent = "Total amount (tax-inclusive)";
    amountInput.placeholder = "e.g., 115";
  } else {
    extractBtn.classList.remove("active");
    addBtn.classList.add("active");
    amountLabel.textContent = "Net amount (before tax)";
    amountInput.placeholder = "e.g., 100";
  }

  if (triggerUpdate) {
    return updateTaxLive();
  }
  return Promise.resolve();
}

async function updateTaxLive() {
  const ticket = ++seq.tax;
  const amount = getNumber("taxAmount");
  const rate = getNumber("taxRate");
  const mode = taxMode;
  const formulaDiv = document.getElementById("taxLiveFormula");
  const resultSpan = document.getElementById("taxLiveResult");

  if (amount === null || rate === null) {
    lastValidCalc.tax = null;
    if (mode === "extract") {
      setLines(formulaDiv, [
        "net = total / (1 + rate/100)",
        "tax = total − net"
      ]);
    } else {
      setLines(formulaDiv, [
        "tax = net × (rate / 100)",
        "total = net + tax"
      ]);
    }
    resultSpan.textContent = "→ —";
    setResult("taxResult", "—");
    return;
  }

  const result = await invoke("calc_tax", {
    amount,
    ratePercent: rate,
    mode
  });
  if (ticket !== seq.tax) return;

  if (result.ok === "false") {
    lastValidCalc.tax = null;
    setFormulaError(
      formulaDiv,
      "net = total / (1 + rate/100)",
      `(${result.error.toLowerCase()})`
    );
    resultSpan.textContent = "→ invalid";
    setResult("taxResult", result.error, true);
    return;
  }

  if (mode === "extract") {
    setLines(formulaDiv, [
      `net = ${amount} / (1 + ${rate}/100) = ${result.netText}`,
      `tax = ${amount} − ${result.netText} = ${result.taxText}`
    ]);
  } else {
    setLines(formulaDiv, [
      `tax = ${amount} × (${rate} / 100) = ${result.taxText}`,
      `total = ${amount} + ${result.taxText} = ${result.totalText}`
    ]);
  }
  resultSpan.textContent = `→ ${result.liveResult}`;
  setResult("taxResult", result.label);

  lastValidCalc.tax = {
    calculator: "tax",
    calculatorLabel: mode === "extract" ? "Tax / VAT (Extract)" : "Tax / VAT (Add)",
    inputA: getRawInput("taxAmount"),
    inputB: getRawInput("taxRate"),
    mode,
    inputsText:
      mode === "extract"
        ? `${amount} incl. ${rate}% tax`
        : `${amount} + ${rate}% tax`,
    resultText:
      mode === "extract"
        ? `Net: ${result.netText} · Tax: ${result.taxText}`
        : `Total: ${result.totalText} · Tax: ${result.taxText}`,
    copyText: result.copyText
  };
}

function formatHistoryTime(timestampMs) {
  if (!timestampMs) return "--:--:--";
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function restoreHistoryEntry(entry) {
  const map = {
    change: { a: "changeOrig", b: "changeNew", fn: updateChangeLive },
    percent: { a: "isWhatX", b: "isWhatY", fn: updatePercentLive },
    what: { a: "whatX", b: "whatY", fn: updateWhatLive },
    discount: {
      a: "discountPrice",
      b: "discountPercent",
      fn: updateDiscountLive
    },
    base: { a: "baseX", b: "baseY", fn: updateBaseLive },
    markup: { a: "markupCost", b: "markupPrice", fn: updateMarkupLive },
    tax: { a: "taxAmount", b: "taxRate", fn: updateTaxLive }
  };

  const target = map[entry.calculator];
  if (!target) return;

  if (entry.calculator === "tax" && entry.mode) {
    await setTaxMode(entry.mode, false);
  }

  const elA = document.getElementById(target.a);
  const elB = document.getElementById(target.b);
  if (!elA || !elB) return;

  elA.value = entry.inputA;
  elB.value = entry.inputB;
  await target.fn();
  elA.focus();
}

function renderHistory(entries) {
  const countEl = document.getElementById("historyCount");
  const listEl = document.getElementById("historyList");
  if (!countEl || !listEl) return;

  const list = Array.isArray(entries) ? entries : [];
  countEl.textContent = `(${list.length} / ${historyLimit})`;
  listEl.replaceChildren();

  if (list.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "history-empty";
    emptyDiv.textContent =
      "No calculations recorded yet. Press calculate, Enter, or copy on any card to save to history.";
    listEl.appendChild(emptyDiv);
    return;
  }

  list.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";

    const timeSpan = document.createElement("span");
    timeSpan.className = "history-time";
    timeSpan.textContent = formatHistoryTime(entry.timestampMs);

    const calcSpan = document.createElement("span");
    calcSpan.className = "history-calc";
    calcSpan.textContent = entry.calculatorLabel;

    const inputsSpan = document.createElement("span");
    inputsSpan.className = "history-inputs";
    inputsSpan.textContent = entry.inputsText;

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "history-arrow";
    arrowSpan.textContent = "→";

    const resultSpan = document.createElement("span");
    resultSpan.className = "history-result";
    resultSpan.textContent = entry.resultText;

    main.append(timeSpan, calcSpan, inputsSpan, arrowSpan, resultSpan);

    const actions = document.createElement("div");
    actions.className = "history-row-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn history-copy-btn";
    copyBtn.type = "button";
    copyBtn.textContent = "copy";
    copyBtn.addEventListener("click", (event) => {
      copyText(entry.copyText || entry.resultText, event.currentTarget);
    });

    const restoreBtn = document.createElement("button");
    restoreBtn.className = "reset-btn history-restore-btn";
    restoreBtn.type = "button";
    restoreBtn.textContent = "↺ restore";
    restoreBtn.addEventListener("click", () => {
      restoreHistoryEntry(entry);
    });

    actions.append(copyBtn, restoreBtn);
    item.append(main, actions);
    listEl.appendChild(item);
  });
}

async function recordHistoryFor(key) {
  const entry = lastValidCalc[key];
  if (!entry) return;
  try {
    const updated = await invoke("history_add", { entry });
    renderHistory(updated);
  } catch {
    // History write errors should not interrupt calculator usage.
  }
}

async function loadHistory() {
  try {
    const entries = await invoke("history_list");
    renderHistory(entries);
  } catch {
    renderHistory([]);
  }
}

function resetFields(inputIds, resultId, updateFn) {
  inputIds.forEach((id) => {
    document.getElementById(id).value = "";
  });
  setResult(resultId, "—");
  return updateFn();
}

function clearAllCalculators() {
  resetFields(["changeOrig", "changeNew"], "changeResult", updateChangeLive);
  resetFields(["isWhatX", "isWhatY"], "percentResult", updatePercentLive);
  resetFields(["whatX", "whatY"], "whatResult", updateWhatLive);
  resetFields(
    ["discountPrice", "discountPercent"],
    "discountResult",
    updateDiscountLive
  );
  resetFields(["baseX", "baseY"], "baseResult", updateBaseLive);
  resetFields(["markupCost", "markupPrice"], "markupResult", updateMarkupLive);
  resetFields(["taxAmount", "taxRate"], "taxResult", updateTaxLive);
  document.getElementById("changeOrig").focus();
}

function renderCreditPills(containerId, names, pillClass) {
  const container = document.getElementById(containerId);
  if (!container || !Array.isArray(names) || names.length === 0) return;
  container.replaceChildren();
  names.forEach((name, idx) => {
    if (idx > 0) {
      const dot = document.createElement("span");
      dot.className = "credit-dot";
      dot.textContent = "·";
      container.appendChild(dot);
    }
    const pill = document.createElement("span");
    pill.className = `credit-pill ${pillClass}`;
    pill.textContent = name;
    container.appendChild(pill);
  });
}

function openAboutModal() {
  const modal = document.getElementById("aboutModal");
  if (!modal) return;
  modal.classList.remove("hidden");
  document.getElementById("closeAboutBtn")?.focus();
}

function closeAboutModal() {
  const modal = document.getElementById("aboutModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.getElementById("aboutBtn")?.focus();
}

async function syncAppInfo() {
  try {
    const appInfo = await invoke("get_app_info");
    document.getElementById("appVersion").innerText = `Desktop v${appInfo.version}`;
    document.getElementById("aboutAppName").textContent = appInfo.name;
    document.getElementById(
      "aboutVersionPill"
    ).textContent = `Desktop v${appInfo.version} · Tauri v2 + Rust`;
    document.getElementById("aboutPrivacyText").textContent = appInfo.privacy;
    if (typeof appInfo.historyLimit === "number") {
      historyLimit = appInfo.historyLimit;
    }
    renderCreditPills("aboutCreatorsRow", appInfo.creators, "credit-pill-gold");
    renderCreditPills("aboutAiRow", appInfo.aiBuilders, "credit-pill-slate");
  } catch {
    // Keep the static fallback version in index.html if outside Tauri.
  }
}

function bindControls() {
  document
    .getElementById("clearAllBtn")
    .addEventListener("click", clearAllCalculators);
  document
    .getElementById("aboutBtn")
    .addEventListener("click", openAboutModal);

  document
    .getElementById("closeAboutBtn")
    .addEventListener("click", closeAboutModal);
  document
    .getElementById("closeAboutXBtn")
    .addEventListener("click", closeAboutModal);
  document
    .getElementById("aboutModal")
    .addEventListener("click", (event) => {
      if (event.target.id === "aboutModal") closeAboutModal();
    });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modal = document.getElementById("aboutModal");
      if (modal && !modal.classList.contains("hidden")) {
        closeAboutModal();
      }
    }
  });

  // Swap buttons (Option B) across all 7 cards
  document
    .getElementById("swapChangeBtn")
    .addEventListener("click", () =>
      swapFields("changeOrig", "changeNew", updateChangeLive)
    );
  document
    .getElementById("swapPercentBtn")
    .addEventListener("click", () =>
      swapFields("isWhatX", "isWhatY", updatePercentLive)
    );
  document
    .getElementById("swapWhatBtn")
    .addEventListener("click", () =>
      swapFields("whatX", "whatY", updateWhatLive)
    );
  document
    .getElementById("swapDiscountBtn")
    .addEventListener("click", () =>
      swapFields("discountPrice", "discountPercent", updateDiscountLive)
    );
  document
    .getElementById("swapBaseBtn")
    .addEventListener("click", () =>
      swapFields("baseX", "baseY", updateBaseLive)
    );
  document
    .getElementById("swapMarkupBtn")
    .addEventListener("click", () =>
      swapFields("markupCost", "markupPrice", updateMarkupLive)
    );
  document
    .getElementById("swapTaxBtn")
    .addEventListener("click", () =>
      swapFields("taxAmount", "taxRate", updateTaxLive)
    );

  // Tax mode toggle
  document
    .getElementById("taxModeAddBtn")
    .addEventListener("click", () => setTaxMode("add"));
  document
    .getElementById("taxModeExtractBtn")
    .addEventListener("click", () => setTaxMode("extract"));

  // Card 1: Percentage Change
  document
    .getElementById("calcChangeBtn")
    .addEventListener("click", async () => {
      await updateChangeLive();
      await recordHistoryFor("change");
    });
  document
    .getElementById("resetChangeBtn")
    .addEventListener("click", () =>
      resetFields(["changeOrig", "changeNew"], "changeResult", updateChangeLive)
    );
  document
    .getElementById("copyChangeBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("changeResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("change");
    });

  // Card 2: Percentage of Total
  document
    .getElementById("calcPercentBtn")
    .addEventListener("click", async () => {
      await updatePercentLive();
      await recordHistoryFor("percent");
    });
  document
    .getElementById("resetPercentBtn")
    .addEventListener("click", () =>
      resetFields(["isWhatX", "isWhatY"], "percentResult", updatePercentLive)
    );
  document
    .getElementById("copyPercentBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("percentResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("percent");
    });

  // Card 3: Calculate Percentage
  document
    .getElementById("calcWhatBtn")
    .addEventListener("click", async () => {
      await updateWhatLive();
      await recordHistoryFor("what");
    });
  document
    .getElementById("resetWhatBtn")
    .addEventListener("click", () =>
      resetFields(["whatX", "whatY"], "whatResult", updateWhatLive)
    );
  document
    .getElementById("copyWhatBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("whatResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("what");
    });

  // Card 4: Discount
  document
    .getElementById("calcDiscountBtn")
    .addEventListener("click", async () => {
      await updateDiscountLive();
      await recordHistoryFor("discount");
    });
  document
    .getElementById("resetDiscountBtn")
    .addEventListener("click", () =>
      resetFields(
        ["discountPrice", "discountPercent"],
        "discountResult",
        updateDiscountLive
      )
    );
  document
    .getElementById("copyDiscountBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("discountResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("discount");
    });

  // Card 5: Find Original Value
  document
    .getElementById("calcBaseBtn")
    .addEventListener("click", async () => {
      await updateBaseLive();
      await recordHistoryFor("base");
    });
  document
    .getElementById("resetBaseBtn")
    .addEventListener("click", () =>
      resetFields(["baseX", "baseY"], "baseResult", updateBaseLive)
    );
  document
    .getElementById("copyBaseBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("baseResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("base");
    });

  // Card 6: Markup & Profit Margin
  document
    .getElementById("calcMarkupBtn")
    .addEventListener("click", async () => {
      await updateMarkupLive();
      await recordHistoryFor("markup");
    });
  document
    .getElementById("resetMarkupBtn")
    .addEventListener("click", () =>
      resetFields(["markupCost", "markupPrice"], "markupResult", updateMarkupLive)
    );
  document
    .getElementById("copyMarkupBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("markupResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("markup");
    });

  // Card 7: Reverse Tax / VAT
  document
    .getElementById("calcTaxBtn")
    .addEventListener("click", async () => {
      await updateTaxLive();
      await recordHistoryFor("tax");
    });
  document
    .getElementById("resetTaxBtn")
    .addEventListener("click", () =>
      resetFields(["taxAmount", "taxRate"], "taxResult", updateTaxLive)
    );
  document
    .getElementById("copyTaxBtn")
    .addEventListener("click", async (event) => {
      const btn = event.currentTarget;
      await copyText(
        document.getElementById("taxResult").innerText.replace(/^=\s*/, ""),
        btn
      );
      await recordHistoryFor("tax");
    });

  // History clear confirmation flow
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const clearConfirmGroup = document.getElementById("clearHistoryConfirm");
  clearHistoryBtn.addEventListener("click", () => {
    clearHistoryBtn.classList.add("hidden");
    clearConfirmGroup.classList.remove("hidden");
  });
  document
    .getElementById("cancelClearHistoryBtn")
    .addEventListener("click", () => {
      clearConfirmGroup.classList.add("hidden");
      clearHistoryBtn.classList.remove("hidden");
    });
  document
    .getElementById("confirmClearHistoryBtn")
    .addEventListener("click", async () => {
      try {
        const entries = await invoke("history_clear");
        renderHistory(entries);
      } catch {
        renderHistory([]);
      }
      clearConfirmGroup.classList.add("hidden");
      clearHistoryBtn.classList.remove("hidden");
    });
}

function bindLiveUpdates() {
  document
    .getElementById("changeOrig")
    .addEventListener("input", updateChangeLive);
  document
    .getElementById("changeNew")
    .addEventListener("input", updateChangeLive);

  document
    .getElementById("isWhatX")
    .addEventListener("input", updatePercentLive);
  document
    .getElementById("isWhatY")
    .addEventListener("input", updatePercentLive);

  document.getElementById("whatX").addEventListener("input", updateWhatLive);
  document.getElementById("whatY").addEventListener("input", updateWhatLive);

  document
    .getElementById("discountPrice")
    .addEventListener("input", updateDiscountLive);
  document
    .getElementById("discountPercent")
    .addEventListener("input", updateDiscountLive);

  document.getElementById("baseX").addEventListener("input", updateBaseLive);
  document.getElementById("baseY").addEventListener("input", updateBaseLive);

  document
    .getElementById("markupCost")
    .addEventListener("input", updateMarkupLive);
  document
    .getElementById("markupPrice")
    .addEventListener("input", updateMarkupLive);

  document
    .getElementById("taxAmount")
    .addEventListener("input", updateTaxLive);
  document
    .getElementById("taxRate")
    .addEventListener("input", updateTaxLive);
}

function bindEnterKeys() {
  attachEnterKey(["changeOrig", "changeNew"], async () => {
    await updateChangeLive();
    await recordHistoryFor("change");
  });
  attachEnterKey(["isWhatX", "isWhatY"], async () => {
    await updatePercentLive();
    await recordHistoryFor("percent");
  });
  attachEnterKey(["whatX", "whatY"], async () => {
    await updateWhatLive();
    await recordHistoryFor("what");
  });
  attachEnterKey(["discountPrice", "discountPercent"], async () => {
    await updateDiscountLive();
    await recordHistoryFor("discount");
  });
  attachEnterKey(["baseX", "baseY"], async () => {
    await updateBaseLive();
    await recordHistoryFor("base");
  });
  attachEnterKey(["markupCost", "markupPrice"], async () => {
    await updateMarkupLive();
    await recordHistoryFor("markup");
  });
  attachEnterKey(["taxAmount", "taxRate"], async () => {
    await updateTaxLive();
    await recordHistoryFor("tax");
  });
}

// Runs inside the real Tauri webview when launched with `--smoke-test`.
// Verifies the original 30+ checks plus all v2.1 features (swap values,
// Markup & Margin, Reverse Tax/VAT add & extract, persistent history
// add/restore/clear, and the redesigned dark-terminal About modal).
async function runSmokeTestIfRequested() {
  let enabled = false;
  try {
    enabled = await invoke("is_smoke_test");
  } catch {
    return;
  }
  if (!enabled) return;

  const setInput = (id, value, waitFn) => {
    const el = document.getElementById(id);
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return waitFn();
  };
  const text = (id) => document.getElementById(id).innerText.trim();
  const failures = [];
  const check = (name, ok) => {
    if (!ok) failures.push(name);
  };

  try {
    check("initial-focus", document.activeElement?.id === "changeOrig");

    const appInfo = await invoke("get_app_info");
    check("app-name", appInfo.name === "Percentage Calculator Tool");
    check("app-version", appInfo.version === "2.1.0");
    check(
      "app-credits",
      appInfo.credits.includes("Mohamed Sayed") &&
        appInfo.credits.includes("Ahmed Emara") &&
        appInfo.credits.includes("Antigravity")
    );
    check(
      "footer-version",
      document.getElementById("appVersion").innerText.includes("Desktop v2.1.0")
    );

    await setInput("changeOrig", "150", updateChangeLive);
    await setInput("changeNew", "180", updateChangeLive);
    check(
      "change-increase",
      text("changeResult").includes("20.00% increase")
    );

    // Swap values check (150 <-> 180 => 16.67% decrease)
    await swapFields("changeOrig", "changeNew", updateChangeLive);
    check(
      "swap-change-values",
      document.getElementById("changeOrig").value === "180" &&
        document.getElementById("changeNew").value === "150" &&
        text("changeResult").includes("16.67% decrease")
    );

    await setInput("changeOrig", "200", updateChangeLive);
    await setInput("changeNew", "150", updateChangeLive);
    check(
      "change-decrease",
      text("changeResult").includes("25.00% decrease")
    );

    await setInput("changeOrig", "0", updateChangeLive);
    await setInput("changeNew", "150", updateChangeLive);
    check(
      "change-div-zero",
      text("changeResult").includes("Original value cannot be zero")
    );

    await setInput("isWhatX", "50", updatePercentLive);
    await setInput("isWhatY", "200", updatePercentLive);
    check("percent-of-total", text("percentResult").includes("25.00%"));

    await setInput("isWhatY", "0", updatePercentLive);
    check(
      "percent-div-zero",
      text("percentResult").includes("Total cannot be zero")
    );

    await setInput("whatX", "20", updateWhatLive);
    await setInput("whatY", "500", updateWhatLive);
    check("portion", text("whatResult").includes("100.00"));

    await setInput("discountPrice", "79.99", updateDiscountLive);
    await setInput("discountPercent", "20", updateDiscountLive);
    check("discount-final", text("discountResult").includes("Final: 63.99"));
    check("discount-saved", text("discountResult").includes("Saved: 16.00"));

    await setInput("baseX", "50", updateBaseLive);
    await setInput("baseY", "25", updateBaseLive);
    check("original-value", text("baseResult").includes("200.00"));

    await setInput("baseY", "0", updateBaseLive);
    check(
      "original-div-zero",
      text("baseResult").includes("Percent cannot be zero")
    );

    // Markup & Profit Margin checks
    await setInput("markupCost", "80", updateMarkupLive);
    await setInput("markupPrice", "100", updateMarkupLive);
    check("markup-profit", text("markupResult").includes("Profit: 20.00"));
    check("markup-pct", text("markupResult").includes("Markup: 25.00%"));
    check("margin-pct", text("markupResult").includes("Margin: 20.00%"));

    // Record markup calculation to history
    await recordHistoryFor("markup");
    check("history-count-1", text("historyCount") === "(1 / 500)");
    const historyText = document.getElementById("historyList").textContent;
    check(
      "history-entry-rendered",
      historyText.includes("Markup & Margin") &&
        historyText.includes("Profit: 20.00")
    );

    await setInput("markupCost", "0", updateMarkupLive);
    check(
      "markup-div-zero",
      text("markupResult").includes("Cost cannot be zero")
    );

    // Reverse Tax / VAT checks (add + extract)
    await setTaxMode("add");
    await setInput("taxAmount", "100", updateTaxLive);
    await setInput("taxRate", "15", updateTaxLive);
    check(
      "tax-add",
      text("taxResult").includes("Total: 115.00") &&
        text("taxResult").includes("Tax: 15.00")
    );

    await setTaxMode("extract");
    await setInput("taxAmount", "115", updateTaxLive);
    await setInput("taxRate", "15", updateTaxLive);
    check(
      "tax-extract",
      text("taxResult").includes("Net: 100.00") &&
        text("taxResult").includes("Tax: 15.00")
    );

    document.getElementById("copyPercentBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    check(
      "copy-feedback",
      document.getElementById("copyPercentBtn").innerText === "copied"
    );

    document.getElementById("clearAllBtn").click();
    check("clear-changeOrig", document.getElementById("changeOrig").value === "");
    check("clear-isWhatX", document.getElementById("isWhatX").value === "");
    check("clear-whatX", document.getElementById("whatX").value === "");
    check(
      "clear-discountPrice",
      document.getElementById("discountPrice").value === ""
    );
    check("clear-baseX", document.getElementById("baseX").value === "");
    check("clear-markupCost", document.getElementById("markupCost").value === "");
    check("clear-taxAmount", document.getElementById("taxAmount").value === "");
    check("clear-changeResult", text("changeResult").includes("—"));
    check("clear-percentResult", text("percentResult").includes("—"));
    check("clear-whatResult", text("whatResult").includes("—"));
    check("clear-discountResult", text("discountResult").includes("—"));
    check("clear-baseResult", text("baseResult").includes("—"));
    check("clear-markupResult", text("markupResult").includes("—"));
    check("clear-taxResult", text("taxResult").includes("—"));

    // Clear all calculators must NOT wipe persistent history
    check("history-kept-on-clear-all", text("historyCount") === "(1 / 500)");

    // Restore from history row
    const restoreBtn = document.querySelector(".history-restore-btn");
    restoreBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    check(
      "history-restore",
      document.getElementById("markupCost").value === "80" &&
        document.getElementById("markupPrice").value === "100" &&
        text("markupResult").includes("Profit: 20.00")
    );

    // Clear history confirmation flow
    document.getElementById("clearHistoryBtn").click();
    document.getElementById("confirmClearHistoryBtn").click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    check("history-cleared", text("historyCount") === "(0 / 500)");

    // Redesigned About modal checks
    document.getElementById("aboutBtn").click();
    const aboutModal = document.getElementById("aboutModal");
    check("about-modal-open", !aboutModal.classList.contains("hidden"));
    check(
      "about-modal-credits",
      text("aboutModal").includes("CREDITS") &&
        text("aboutModal").includes("Mohamed Sayed") &&
        text("aboutModal").includes("Ahmed Emara") &&
        text("aboutModal").includes("Antigravity")
    );
    document.getElementById("closeAboutBtn").click();
    check("about-modal-closed", aboutModal.classList.contains("hidden"));

    await invoke("copy_text", { text: "percentage-tool-smoke-test" });
  } catch (err) {
    failures.push(`exception: ${err}`);
  }

  await invoke("report_smoke_result", {
    passed: failures.length === 0,
    details: failures.join(", ")
  });
}

async function initialize() {
  bindControls();
  bindLiveUpdates();
  bindEnterKeys();

  await Promise.all([
    updateChangeLive(),
    updatePercentLive(),
    updateWhatLive(),
    updateDiscountLive(),
    updateBaseLive(),
    updateMarkupLive(),
    updateTaxLive(),
    syncAppInfo(),
    loadHistory()
  ]);

  document.getElementById("changeOrig").focus();
  await runSmokeTestIfRequested();
}

initialize();
