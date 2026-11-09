# Percentage Calculator Tool Desktop

An offline desktop percentage calculator built with **Tauri v2 and Rust**.

This project started as a single-file HTML percentage utility, became a structured Electron desktop app in v1.1.0, and was rebuilt on Tauri v2 + Rust in **v2.0.0**. It keeps the exact terminal-inspired interface and instant calculation flow, while moving the calculation engine and desktop shell to Rust and cutting the binary size from ~90 MB to a few megabytes.

> Looking for the last Electron version? Check out the [`v1.1.0-electron`](https://github.com/CipherVaults/Percentage-Calculator-Tool/tree/v1.1.0-electron) tag.

---

## Built With AI Collaboration

This project is human-directed:

- **v1.0 – v1.1 (Electron):** built with **Codex** (plus DeepSeek & ChatGPT on the original HTML utility).
- **v2.0 (Tauri + Rust rebuild):** planned and rebuilt with **Antigravity** (moving the math into a pure Rust crate, porting the desktop shell to Tauri v2, verifying 10,661 golden math cases byte-for-byte against v1.1, and automating Windows builds on GitHub Actions).

The repository remains intentionally transparent about that collaboration because the development record is part of the value of the project.

---

## What This App Is

Percentage Calculator Tool Desktop is a practical local utility for common percentage calculations.

It is designed for quick use rather than account-based or cloud-connected workflows:

- no login
- no tracking
- no network requirement at runtime
- no stored user data
- no database

The app is intentionally small. Its value is speed, clarity, and an understandable codebase.

---

## Features

Five calculator sections:

- **Percentage Change** — shows increase or decrease from an original value
- **Percentage of Total** — finds what percent one value is of another
- **Calculate Percentage** — calculates X percent of a number
- **Discount** — calculates final price and savings
- **Find Original Value** — finds the full value from a known percentage

Desktop polish:

- live calculation while typing (computed in Rust via Tauri IPC)
- Enter key support
- copy-to-clipboard buttons with visible feedback
- Clear All button
- native About dialog
- Windows NSIS & MSI installers
- standalone Windows portable executable

---

## Current Version

Desktop **v2.0.0** (Tauri v2 + Rust)

---

## How It Works

```text
Static Webview UI (ui/index.html, styles.css, main.js)
  -> Tauri invoke() commands (src-tauri/src/commands.rs)
  -> Pure Rust calculation crate (crates/percent-core)
  -> Native clipboard & dialog plugins
```

The UI stays plain HTML, CSS, and JavaScript — no frontend framework and no bundler. All five percentage formulas live in a standalone Rust crate (`percent-core`) with zero UI dependencies, so the math can be tested directly with `cargo test` and is verified byte-for-byte against 10,661 golden test cases captured from the v1.1 JavaScript implementation.

---

## Project Structure

```text
Cargo.toml              Rust workspace (percent-core + src-tauri)
crates/percent-core/    Pure Rust percentage math + unit & 10k golden parity tests
src-tauri/              Tauri v2 desktop shell, commands, icons, capabilities
ui/                     Static HTML, CSS, and frontend controller (no bundler)
assets/                 Source app icon assets
reference/              Original single-file HTML utility
Documentation/          Project context, architecture, roadmap, and session summary
.github/workflows/      GitHub Actions CI (Rust tests, smoke test, Windows bundles)
```

---

## Prerequisites (for building from source)

- [Rust](https://rustup.rs/) (stable toolchain)
- Tauri CLI v2:
  ```powershell
  cargo install tauri-cli --version "^2" --locked
  ```
- On Windows 10/11, WebView2 is preinstalled. The NSIS installer also embeds the WebView2 bootstrapper for older machines.

---

## Run Locally

```powershell
cargo tauri dev
```

---

## Test

Unit tests and the 10,661-case v1.1 golden parity suite:

```powershell
cargo test --workspace
```

End-to-end desktop smoke test (launches the real Tauri app in hidden mode and verifies focus, all five calculators, divide-by-zero handling, copy feedback, Clear All, version info, and the system clipboard):

```powershell
cargo run -p percentage-calculator-tool -- --smoke-test
```

---

## Build for Windows

```powershell
cargo tauri build
```

Outputs under `target/release/`:

- `bundle/nsis/Percentage Calculator Tool_2.0.0_x64-setup.exe` — NSIS installer
- `bundle/msi/Percentage Calculator Tool_2.0.0_x64_en-US.msi` — MSI installer
- `percentage-calculator-tool.exe` — standalone portable executable (uses the system WebView2 runtime)

Every push and pull request also builds these deliverables on GitHub Actions (`windows-latest`) and attaches them as workflow artifacts.

---

## Documentation

The main project documentation is in `Documentation/`:

- `1- PROJECT_CONTEXT.md`
- `2- ARCHITECTURE.md`
- `3- ROADMAP.md`
- `4- SESSION_SUMMARY.md`

---

## Design Philosophy

This project favors:

- simplicity over feature bloat
- offline use over cloud dependency
- readable code over unnecessary frameworks
- visible automated tests over manual-only confidence
- documentation as part of the development process
