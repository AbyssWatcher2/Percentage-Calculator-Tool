//! Tauri commands exposed to the calculator UI.
//!
//! Replaces Electron's `ipcMain.handle(...)` + `preload.cjs` bridge with a
//! strongly typed Rust boundary.

use percent_core::{
    calculate_discount, calculate_original_value, calculate_percentage_change,
    calculate_percentage_of_total, calculate_percentage_portion, CalcResult, DiscountResult,
};
use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

use crate::SmokeState;

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: String,
    pub credits: &'static str,
    pub privacy: &'static str,
}

pub fn build_app_info(app: &AppHandle) -> AppInfo {
    AppInfo {
        name: "Percentage Calculator Tool",
        version: app.package_info().version.to_string(),
        credits: "Directed by a Human, made by DeepSeek & ChatGPT",
        privacy: "Fully offline. No tracking, no storage, no network calls.",
    }
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
pub fn show_about_dialog(app: AppHandle) {
    let info = build_app_info(&app);
    let body = format!(
        "{name} Desktop v{ver}\n\n{credits}\n\n{privacy}",
        name = info.name,
        ver = info.version,
        credits = info.credits,
        privacy = info.privacy
    );
    app.dialog()
        .message(body)
        .title(format!("About {}", info.name))
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

#[tauri::command]
pub fn is_smoke_test(state: State<'_, SmokeState>) -> bool {
    state.enabled
}

#[tauri::command]
pub fn report_smoke_result(app: AppHandle, passed: bool, details: String) {
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
}
