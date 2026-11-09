// Frontend controller for the Tauri v2 desktop app.
//
// Keeps the original v1.1 DOM layout, input parsing, and live-formula feedback
// untouched, while delegating all percentage math and desktop capabilities
// (clipboard, app info, About dialog) to the Rust backend via Tauri commands.

const COPY_FEEDBACK_MS = 1200;

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
  base: 0
};

function getNumber(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const val = el.value.trim();
  if (val === "") return null;
  const num = parseFloat(val);
  return Number.isNaN(num) ? null : num;
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

function attachEnterKey(ids, computeFn) {
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter") computeFn();
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
}

async function updatePercentLive() {
  const ticket = ++seq.percent;
  const x = getNumber("isWhatX");
  const y = getNumber("isWhatY");
  const formulaDiv = document.getElementById("percentLiveFormula");
  const resultSpan = document.getElementById("percentLiveResult");

  if (x === null || y === null) {
    formulaDiv.textContent = "(X / Y) × 100";
    resultSpan.textContent = "→ —";
    setResult("percentResult", "—");
    return;
  }

  const result = await invoke("calc_percent_of_total", { part: x, total: y });
  if (ticket !== seq.percent) return;

  if (result.ok === "false") {
    setFormulaError(formulaDiv, "(X / Y) × 100", "(Y cannot be zero)");
    resultSpan.textContent = "→ invalid";
    setResult("percentResult", result.error, true);
    return;
  }

  formulaDiv.textContent = `(${x} / ${y}) × 100`;
  resultSpan.textContent = `→ ${result.label}`;
  setResult("percentResult", result.label);
}

async function updateWhatLive() {
  const ticket = ++seq.what;
  const x = getNumber("whatX");
  const y = getNumber("whatY");
  const formulaDiv = document.getElementById("whatLiveFormula");
  const resultSpan = document.getElementById("whatLiveResult");

  if (x === null || y === null) {
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
}

async function updateDiscountLive() {
  const ticket = ++seq.discount;
  const price = getNumber("discountPrice");
  const disc = getNumber("discountPercent");
  const formulaDiv = document.getElementById("discountLiveFormula");
  const resultSpan = document.getElementById("discountLiveResult");

  if (price === null || disc === null) {
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
}

async function updateBaseLive() {
  const ticket = ++seq.base;
  const x = getNumber("baseX");
  const y = getNumber("baseY");
  const formulaDiv = document.getElementById("baseLiveFormula");
  const resultSpan = document.getElementById("baseLiveResult");

  if (x === null || y === null) {
    formulaDiv.textContent = "X / (Y / 100)";
    resultSpan.textContent = "→ —";
    setResult("baseResult", "—");
    return;
  }

  const result = await invoke("calc_original", { value: x, percent: y });
  if (ticket !== seq.base) return;

  if (result.ok === "false") {
    setFormulaError(formulaDiv, "X / (Y / 100)", "(Y cannot be zero)");
    resultSpan.textContent = "→ invalid";
    setResult("baseResult", result.error, true);
    return;
  }

  formulaDiv.textContent = `${x} / (${y} / 100)`;
  resultSpan.textContent = `→ ${result.label}`;
  setResult("baseResult", result.label);
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
  document.getElementById("changeOrig").focus();
}

async function syncAppInfo() {
  try {
    const appInfo = await invoke("get_app_info");
    document.getElementById("appVersion").innerText = `Desktop v${appInfo.version}`;
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
    .addEventListener("click", () => invoke("show_about_dialog"));

  document
    .getElementById("calcChangeBtn")
    .addEventListener("click", updateChangeLive);
  document
    .getElementById("resetChangeBtn")
    .addEventListener("click", () =>
      resetFields(["changeOrig", "changeNew"], "changeResult", updateChangeLive)
    );
  document
    .getElementById("copyChangeBtn")
    .addEventListener("click", (event) =>
      copyText(
        document.getElementById("changeResult").innerText.replace(/^=\s*/, ""),
        event.currentTarget
      )
    );

  document
    .getElementById("calcPercentBtn")
    .addEventListener("click", updatePercentLive);
  document
    .getElementById("resetPercentBtn")
    .addEventListener("click", () =>
      resetFields(["isWhatX", "isWhatY"], "percentResult", updatePercentLive)
    );
  document
    .getElementById("copyPercentBtn")
    .addEventListener("click", (event) =>
      copyText(
        document.getElementById("percentResult").innerText.replace(/^=\s*/, ""),
        event.currentTarget
      )
    );

  document
    .getElementById("calcWhatBtn")
    .addEventListener("click", updateWhatLive);
  document
    .getElementById("resetWhatBtn")
    .addEventListener("click", () =>
      resetFields(["whatX", "whatY"], "whatResult", updateWhatLive)
    );
  document
    .getElementById("copyWhatBtn")
    .addEventListener("click", (event) =>
      copyText(
        document.getElementById("whatResult").innerText.replace(/^=\s*/, ""),
        event.currentTarget
      )
    );

  document
    .getElementById("calcDiscountBtn")
    .addEventListener("click", updateDiscountLive);
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
    .addEventListener("click", (event) =>
      copyText(
        document.getElementById("discountResult").innerText.replace(/^=\s*/, ""),
        event.currentTarget
      )
    );

  document
    .getElementById("calcBaseBtn")
    .addEventListener("click", updateBaseLive);
  document
    .getElementById("resetBaseBtn")
    .addEventListener("click", () =>
      resetFields(["baseX", "baseY"], "baseResult", updateBaseLive)
    );
  document
    .getElementById("copyBaseBtn")
    .addEventListener("click", (event) =>
      copyText(
        document.getElementById("baseResult").innerText.replace(/^=\s*/, ""),
        event.currentTarget
      )
    );
}

// Each calculator owns its own inputs and live formula panel. Binding them in
// one place makes it easier to audit the full app behavior.
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
}

function bindEnterKeys() {
  attachEnterKey(["changeOrig", "changeNew"], updateChangeLive);
  attachEnterKey(["isWhatX", "isWhatY"], updatePercentLive);
  attachEnterKey(["whatX", "whatY"], updateWhatLive);
  attachEnterKey(["discountPrice", "discountPercent"], updateDiscountLive);
  attachEnterKey(["baseX", "baseY"], updateBaseLive);
}

// Runs inside the real Tauri webview when launched with `--smoke-test`.
// Verifies the same 30+ end-to-end checks as the v1.1 Electron smoke test.
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
    check("app-version", appInfo.version === "2.0.0");
    check(
      "footer-version",
      document.getElementById("appVersion").innerText.includes("Desktop v2.0.0")
    );

    await setInput("changeOrig", "150", updateChangeLive);
    await setInput("changeNew", "180", updateChangeLive);
    check(
      "change-increase",
      text("changeResult").includes("20.00% increase")
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
    check("clear-changeResult", text("changeResult").includes("—"));
    check("clear-percentResult", text("percentResult").includes("—"));
    check("clear-whatResult", text("whatResult").includes("—"));
    check("clear-discountResult", text("discountResult").includes("—"));
    check("clear-baseResult", text("baseResult").includes("—"));

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
    syncAppInfo()
  ]);

  document.getElementById("changeOrig").focus();
  await runSmokeTestIfRequested();
}

initialize();
