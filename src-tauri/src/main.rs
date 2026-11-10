// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

use commands::HistoryEntry;

pub struct SmokeState {
    pub enabled: bool,
}

pub struct HistoryState {
    pub in_memory_only: bool,
    pub entries: Mutex<Vec<HistoryEntry>>,
    pub next_id: Mutex<u64>,
}

fn main() {
    let smoke_enabled = std::env::args().any(|arg| arg == "--smoke-test");

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(SmokeState {
            enabled: smoke_enabled,
        })
        .setup(move |app| {
            let initial_entries = if smoke_enabled {
                Vec::new()
            } else {
                commands::load_history_from_disk(app.handle())
            };
            let next_id = initial_entries
                .iter()
                .map(|entry| entry.id)
                .max()
                .unwrap_or(0)
                .saturating_add(1);

            app.manage(HistoryState {
                in_memory_only: smoke_enabled,
                entries: Mutex::new(initial_entries),
                next_id: Mutex::new(next_id),
            });

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
            commands::calc_markup_margin,
            commands::calc_tax,
            commands::history_list,
            commands::history_add,
            commands::history_clear,
            commands::copy_text,
            commands::get_app_info,
            commands::is_smoke_test,
            commands::report_smoke_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Percentage Calculator Tool");
}
