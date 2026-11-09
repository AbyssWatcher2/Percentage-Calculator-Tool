## Percentage Calculator Tool Desktop v2.0.0

Full rebuild of **Percentage Calculator Tool Desktop** from Electron (v1.1.0) to **Tauri v2 and Rust**.

### Highlights
- **Pure Rust calculation engine (`percent-core`)** — all five percentage calculators and decimal formatting now run in Rust, verified byte-for-byte against **10,661 golden test cases** captured from the v1.1 JavaScript implementation.
- **~10× smaller footprint** — replaces the bundled Chromium/Node runtime with the system WebView2 runtime and a native Rust binary.
- **Identical UI & workflow** — preserves the terminal-inspired interface, live formula updates while typing, Enter key support, copy feedback, Clear All, and native About dialog.
- **Security hardening** — strict Content Security Policy (`default-src 'self'; style-src 'self'; script-src 'self'`), least-privilege Tauri capabilities, zero `innerHTML` DOM sinks, and gated smoke-test IPC.
- **Automated verification** — tested on every push via Rust unit tests, 10k golden parity tests, `clippy`, `rustfmt`, and a 30+ check real-window `--smoke-test` on Windows and Linux.

### Downloads (Windows x64)
| File | Description | Size |
|---|---|---|
| `Percentage Calculator Tool_2.0.0_x64-setup.exe` | **NSIS Installer** (per-user or machine install, includes WebView2 bootstrapper) | ~3.8 MiB |
| `Percentage Calculator Tool_2.0.0_x64_en-US.msi` | **MSI Installer** | ~4.9 MiB |
| `Percentage Calculator Tool Portable 2.0.0.exe` | **Standalone Portable Executable** (no installation required; uses Windows 10/11 WebView2) | ~9.5 MiB |

> Looking for the last Electron version? See tag [`v1.1.0-electron`](https://github.com/CipherVaults/Percentage-Calculator-Tool/tree/v1.1.0-electron).
