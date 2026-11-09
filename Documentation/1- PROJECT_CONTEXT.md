# Project Context

## Project Name

Percentage Calculator Tool Desktop

---

## Project Purpose

The purpose of this project is to turn a finished local HTML percentage calculator into a small, polished Windows desktop application.

The desktop app should:

- remain fully offline
- preserve the original calculator behavior
- keep the terminal-inspired visual style
- support normal Windows usage through an installer
- support portable usage through a standalone executable
- be documented clearly enough for the project to be understood later

This is a personal utility tool, not a large commercial application.

---

## Final Core Idea

The app is a transparent desktop wrapper around a focused calculator workflow:

```text
User Input (HTML/JS)
-> Tauri Command IPC
-> Pure Rust Calculation Engine (percent-core)
-> Live Formula & Result Display
-> Optional Copy to System Clipboard
```

The important design decision was to avoid overbuilding on the UI side while making the desktop runtime and calculation engine as lean and reliable as possible.

In **v1.0–v1.1** the desktop shell used Electron. In **v2.0.0** the app was rebuilt on **Tauri v2 and Rust**: the UI stayed plain HTML/CSS/JS, the math moved into a pure Rust crate (`percent-core`), and the bundled Chromium/Node runtime was replaced by the system webview and a compiled Rust binary.

---

## Final Scope Definition

### Included in the Current Version (v2.0.0)

- Tauri v2 + Rust desktop app
- Windows native title bar
- offline local webview UI (`ui/`)
- five percentage calculators implemented in Rust (`crates/percent-core`)
- live formula previews
- copy-to-clipboard buttons with visible feedback
- Clear All button
- native About dialog
- Rust unit tests + 10,661-case golden parity suite against v1.1 JS math
- real-window Tauri smoke test (`--smoke-test`)
- Windows NSIS and MSI installer builds
- Windows standalone portable executable
- GitHub Actions CI workflow for automated Windows builds and tests
- project documentation modeled after the AI Ambassadors documentation structure

---

### Calculation Types

The current app supports:

- percentage change
- percentage of total
- percentage portion of a number
- discount final price and savings
- original value from a known percentage

These are intentionally practical calculations rather than a full spreadsheet or financial system.

---

## What Is Not Included

The project intentionally does not include:

- user accounts
- cloud sync
- telemetry
- analytics
- database storage
- network calls
- auto-updater
- paid code signing
- custom Discord-style title bar
- complex theming system
- React or another frontend framework
- mobile builds
- macOS or Linux release installers (the codebase is portable, but release packaging targets Windows)

These exclusions keep the app small, understandable, and aligned with its original utility purpose.

---

## Development Philosophy

This project follows the same general development philosophy as the referenced AI Ambassadors documentation:

- keep the system simple
- document the real work, not an idealized version
- make architecture easy to trace
- avoid fake complexity
- preserve the human-directed development story
- use Git commits as part of the project memory
- explain limitations honestly

The tool is small, but the documentation is intentionally serious because future understanding matters.

---

## Success Criteria

The project is considered successful if:

- the calculator works locally as a Tauri v2 desktop app
- all five calculator sections preserve the original v1.1 behavior byte-for-byte
- copy feedback and Clear All work reliably
- the app exposes narrow, least-privilege Tauri commands and capabilities
- the Windows installer and portable builds are generated automatically in CI
- the documentation explains the project context and architecture clearly
- the Git history tells a readable project story

---

## Current Final State

At the **v2.0.0** stage, the project is:

- implemented as a Cargo workspace (`percent-core` + `src-tauri`) with a static `ui/` frontend
- tested with Rust unit tests, 10,661 golden parity cases, and a live desktop smoke test
- packaged for Windows as NSIS, MSI, and portable builds via GitHub Actions
- documented in a numbered `Documentation` folder
- preserved with the `v1.1.0-electron` tag pointing at the final Electron version
