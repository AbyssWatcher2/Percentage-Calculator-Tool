# Percentage Calculator Tool Desktop

An offline desktop percentage calculator built with **Tauri v2 and Rust**.

This project started as a single-file HTML percentage utility, became a structured Electron desktop app in v1.1.0, was rebuilt on Tauri v2 + Rust in **v2.0.0**, and expanded in **v2.1.0** with input swapping, Markup & Profit Margin, Reverse Tax/VAT, a persistent local calculation history tape, and a custom dark-terminal About modal.

> Looking for the last Electron version? Check out the [`v1.1.0-electron`](https://github.com/CipherVaults/Percentage-Calculator-Tool/tree/v1.1.0-electron) tag.

---

## Credits

Made by **Mohamed Sayed · Ahmed Emara · DeepSeek · ChatGPT · Antigravity**.

- **Creators:** Mohamed Sayed · Ahmed Emara
- **AI Collaboration:** DeepSeek & ChatGPT (original HTML utility), Codex (v1.1 Electron packaging), and Antigravity (v2.0 Tauri + Rust rebuild & v2.1 feature expansion).

The repository remains intentionally transparent about that collaboration because the development record is part of the value of the project.

---

## What This App Is

Percentage Calculator Tool Desktop is a practical local utility for common percentage, pricing, and tax calculations.

It is designed for quick offline use rather than account-based or cloud-connected workflows:

- no login
- no tracking
- no network calls at runtime
- local-only calculation history (`%APPDATA%\com.percentagecalculator.tool\history.json`, capped at 500 entries and clearable anytime)

The app is intentionally small. Its value is speed, clarity, and an understandable codebase.

---

## Features

Seven calculator sections:

- **Percentage Change** — shows increase or decrease from an original value
- **Percentage of Total** — finds what percent one value is of another
- **Calculate Percentage** — calculates X percent of a number
- **Discount** — calculates final price and savings
- **Find Original Value** — finds the full value from a known percentage
- **Markup & Profit Margin** — calculates net profit, markup % on cost, and gross margin % on selling price
- **Reverse Tax / VAT** — adds tax to a net amount or extracts tax and net amount from a tax-inclusive total

Desktop polish:

- **`⇅ swap values` pill** between the two inputs on every calculator card
- **persistent local history tape** (up to 500 entries, newest first, with one-click `copy`, `↺ restore` back into the calculator, and `clear history`)
- live calculation while typing (computed in Rust via Tauri IPC)
- Enter key support
- copy-to-clipboard buttons with visible feedback
- Clear All button (resets calculator inputs without wiping saved history)
- **in-app dark terminal About modal** (`Esc` / backdrop / `[ × ]`)
- Windows NSIS & MSI installers
- standalone Windows portable executable

---

## Current Version

Desktop **v2.1.0** (Tauri v2 + Rust)

---

## How It Works

```text
Static Webview UI (ui/index.html, styles.css, main.js)
  -> Tauri invoke() commands (src-tauri/src/commands.rs)
  -> Pure Rust calculation crate (crates/percent-core)
  -> Atomic local JSON history store & native clipboard plugin
```

The UI stays plain HTML, CSS, and JavaScript — no frontend framework and no bundler. All seven percentage and pricing formulas live in a standalone Rust crate (`percent-core`) with zero UI dependencies, so the math can be tested directly with `cargo test` and is verified byte-for-byte against 10,661 golden test cases captured from the v1.1 JavaScript implementation.

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

- `bundle/nsis/Percentage Calculator Tool_2.1.0_x64-setup.exe` — NSIS installer
- `bundle/msi/Percentage Calculator Tool_2.1.0_x64_en-US.msi` — MSI installer
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
