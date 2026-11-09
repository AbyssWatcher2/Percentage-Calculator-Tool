// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::time::Duration;
use tauri::Manager;

pub struct SmokeState {
    pub enabled: bool,
}

fn main() {
    let smoke_enabled = std::env::args().any(|arg| arg == "--smoke-test");

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SmokeState {
            enabled: smoke_enabled,
        })
        .setup(move |app| {
            if smoke_enabled {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
                // Safety watchdog so a broken renderer cannot hang CI forever.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(20));
                    eprintln!("SMOKE_TEST_TIMEOUT: renderer did not report within 20s.");
                    handle.exit(1);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::calc_change,
            commands::calc_percent_of_total,
            commands::calc_portion,
            commands::calc_discount,
            commands::calc_original,
            commands::copy_text,
            commands::get_app_info,
            commands::show_about_dialog,
            commands::is_smoke_test,
            commands::report_smoke_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Percentage Calculator Tool");
}
