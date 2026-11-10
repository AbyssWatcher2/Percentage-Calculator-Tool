//! Tauri commands exposed to the calculator UI.
//!
//! Replaces Electron's `ipcMain.handle(...)` + `preload.cjs` bridge with a
//! strongly typed Rust boundary.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use percent_core::{
    calculate_discount, calculate_markup_margin, calculate_original_value,
    calculate_percentage_change, calculate_percentage_of_total, calculate_percentage_portion,
    calculate_tax, CalcResult, DiscountResult, MarkupMarginResult, TaxMode, TaxResult,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::{HistoryState, SmokeState};

pub const HISTORY_MAX_ENTRIES: usize = 500;
const MAX_FIELD_LEN: usize = 256;
const ALLOWED_CALCULATORS: &[&str] = &[
    "change", "percent", "what", "discount", "base", "markup", "tax",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: String,
    pub creators: &'static [&'static str],
    pub ai_builders: &'static [&'static str],
    pub credits: &'static str,
    pub privacy: &'static str,
    pub history_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: u64,
    pub timestamp_ms: u64,
    pub calculator: String,
    pub calculator_label: String,
    pub input_a: String,
    pub input_b: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    pub inputs_text: String,
    pub result_text: String,
    pub copy_text: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHistoryEntry {
    pub calculator: String,
    pub calculator_label: String,
    pub input_a: String,
    pub input_b: String,
    #[serde(default)]
    pub mode: Option<String>,
    pub inputs_text: String,
    pub result_text: String,
    pub copy_text: String,
}

pub fn build_app_info(app: &AppHandle) -> AppInfo {
    AppInfo {
        name: "Percentage Calculator Tool",
        version: app.package_info().version.to_string(),
        creators: &["Mohamed Sayed", "Ahmed Emara"],
        ai_builders: &["DeepSeek", "ChatGPT", "Antigravity"],
        credits: "Mohamed Sayed · Ahmed Emara · DeepSeek · ChatGPT · Antigravity",
        privacy: "Fully offline. No tracking, no network calls. Calculation history is stored locally on this PC only and can be cleared anytime.",
        history_limit: HISTORY_MAX_ENTRIES,
    }
}

pub fn history_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app data dir: {err}"))?;
    Ok(dir.join("history.json"))
}

pub fn load_history_from_disk(app: &AppHandle) -> Vec<HistoryEntry> {
    let Ok(path) = history_file_path(app) else {
        return Vec::new();
    };
    let Ok(bytes) = std::fs::read(&path) else {
        return Vec::new();
    };
    let Ok(mut entries) = serde_json::from_slice::<Vec<HistoryEntry>>(&bytes) else {
        return Vec::new();
    };
    entries.truncate(HISTORY_MAX_ENTRIES);
    entries
}

fn persist_history_to_disk(app: &AppHandle, entries: &[HistoryEntry]) -> Result<(), String> {
    let path = history_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create app data directory: {err}"))?;
    }
    let tmp_path = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(entries)
        .map_err(|err| format!("failed to serialize history: {err}"))?;
    std::fs::write(&tmp_path, data)
        .map_err(|err| format!("failed to write temporary history file: {err}"))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|err| format!("failed to commit history file: {err}"))?;
    Ok(())
}

fn validate_new_entry(entry: &NewHistoryEntry) -> Result<(), &'static str> {
    if !ALLOWED_CALCULATORS.contains(&entry.calculator.as_str()) {
        return Err("invalid calculator key");
    }
    let fields = [
        entry.calculator_label.as_str(),
        entry.input_a.as_str(),
        entry.input_b.as_str(),
        entry.inputs_text.as_str(),
        entry.result_text.as_str(),
        entry.copy_text.as_str(),
    ];
    if fields
        .iter()
        .any(|f| f.trim().is_empty() || f.len() > MAX_FIELD_LEN)
    {
        return Err("history field empty or exceeds max length");
    }
    if let Some(mode) = &entry.mode {
        if mode != "add" && mode != "extract" {
            return Err("invalid tax mode");
        }
    }
    Ok(())
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn calc_change(original_value: f64, new_value: f64) -> CalcResult {
    calculate_percentage_change(original_value, new_value)
}

#[tauri::command]
pub fn calc_percent_of_total(part: f64, total: f64) -> CalcResult {
    calculate_percentage_of_total(part, total)
}

#[tauri::command]
pub fn calc_portion(percent: f64, number: f64) -> CalcResult {
    calculate_percentage_portion(percent, number)
}

#[tauri::command]
pub fn calc_discount(price: f64, discount_percent: f64) -> DiscountResult {
    calculate_discount(price, discount_percent)
}

#[tauri::command]
pub fn calc_original(value: f64, percent: f64) -> CalcResult {
    calculate_original_value(value, percent)
}

#[tauri::command]
pub fn calc_markup_margin(cost: f64, selling_price: f64) -> MarkupMarginResult {
    calculate_markup_margin(cost, selling_price)
}

#[tauri::command]
pub fn calc_tax(amount: f64, rate_percent: f64, mode: TaxMode) -> TaxResult {
    calculate_tax(amount, rate_percent, mode)
}

#[tauri::command]
pub fn history_list(state: State<'_, HistoryState>) -> Result<Vec<HistoryEntry>, String> {
    let entries = state
        .entries
        .lock()
        .map_err(|_| "history lock poisoned".to_string())?;
    Ok(entries.clone())
}

#[tauri::command]
pub fn history_add(
    app: AppHandle,
    state: State<'_, HistoryState>,
    entry: NewHistoryEntry,
) -> Result<Vec<HistoryEntry>, String> {
    validate_new_entry(&entry).map_err(|e| e.to_string())?;

    let mut entries = state
        .entries
        .lock()
        .map_err(|_| "history lock poisoned".to_string())?;

    let timestamp_ms = now_millis();

    // Deduplicate consecutive identical calculations.
    if let Some(first) = entries.first_mut() {
        if first.calculator == entry.calculator
            && first.input_a == entry.input_a
            && first.input_b == entry.input_b
            && first.mode == entry.mode
            && first.result_text == entry.result_text
        {
            first.timestamp_ms = timestamp_ms;
            let snapshot = entries.clone();
            drop(entries);
            if !state.in_memory_only {
                let _ = persist_history_to_disk(&app, &snapshot);
            }
            return Ok(snapshot);
        }
    }

    let mut next_id = state
        .next_id
        .lock()
        .map_err(|_| "history id lock poisoned".to_string())?;
    let id = *next_id;
    *next_id = next_id.saturating_add(1);
    drop(next_id);

    entries.insert(
        0,
        HistoryEntry {
            id,
            timestamp_ms,
            calculator: entry.calculator,
            calculator_label: entry.calculator_label,
            input_a: entry.input_a,
            input_b: entry.input_b,
            mode: entry.mode,
            inputs_text: entry.inputs_text,
            result_text: entry.result_text,
            copy_text: entry.copy_text,
        },
    );
    entries.truncate(HISTORY_MAX_ENTRIES);

    let snapshot = entries.clone();
    drop(entries);

    if !state.in_memory_only {
        persist_history_to_disk(&app, &snapshot)?;
    }

    Ok(snapshot)
}

#[tauri::command]
pub fn history_clear(
    app: AppHandle,
    state: State<'_, HistoryState>,
) -> Result<Vec<HistoryEntry>, String> {
    let mut entries = state
        .entries
        .lock()
        .map_err(|_| "history lock poisoned".to_string())?;
    entries.clear();
    drop(entries);

    if !state.in_memory_only {
        persist_history_to_disk(&app, &[])?;
    }

    Ok(Vec::new())
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard()
        .write_text(text)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn get_app_info(app: AppHandle) -> AppInfo {
    build_app_info(&app)
}

#[tauri::command]
pub fn is_smoke_test(state: State<'_, SmokeState>) -> bool {
    state.enabled
}

#[tauri::command]
pub fn report_smoke_result(
    app: AppHandle,
    state: State<'_, SmokeState>,
    passed: bool,
    details: String,
) -> Result<(), &'static str> {
    if !state.enabled {
        return Err("smoke test mode is not enabled");
    }

    let clipboard_ok = app
        .clipboard()
        .read_text()
        .map(|text| text == "percentage-tool-smoke-test")
        .unwrap_or(false);

    if passed && clipboard_ok {
        println!("SMOKE_TEST_OK: all renderer, IPC, and clipboard checks passed.");
        app.exit(0);
    } else {
        eprintln!(
            "SMOKE_TEST_FAILED: passed={passed} clipboard_ok={clipboard_ok} details=[{details}]"
        );
        app.exit(1);
    }
    Ok(())
}
