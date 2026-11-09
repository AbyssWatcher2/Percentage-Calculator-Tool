# Roadmap

This roadmap reflects both the completed phases and the future direction of the Percentage Calculator Tool Desktop project.

It should be read as a project memory document, not only a task list.

---

## Phase 1 - Original HTML Utility
**Status: Completed**

- built a small offline single-file HTML percentage calculator with five calculation sections, live formula display, and copy buttons (`reference/Percentage Calculator Tool v1.1.html`).

---

## Phase 2 - Electron Desktop Conversion
**Status: Completed**

- split the single-file tool into a structured Electron desktop app with a preload bridge, icon assets, and Electron Builder NSIS + portable Windows builds.

---

## Phase 3 - Testing and Build Verification
**Status: Completed**

- separated calculation helpers, added Vitest unit tests, and created a real-window Electron smoke test.

---

## Phase 4 - Clean Final Output Folder
**Status: Completed**

- separated user-facing Installer and Portable deliverables from intermediate build files.

---

## Phase 5 - Desktop v1.1 Polish
**Status: Completed**

- added copy feedback, Clear All, About dialog, footer version text, and expanded smoke test coverage.

---

## Phase 6 - Documentation and Repository Foundation
**Status: Completed**

- wrote the numbered `Documentation/` set, initialized readable Git history, and published to GitHub (`v1.1.0` / `v1.1.0-electron`).

---

## Phase 7 - Tauri v2 & Rust Rebuild (v2.0.0)
**Status: Completed**

### Goals

- replace Electron and Node with **Tauri v2 and Rust**
- move all percentage calculations into a pure Rust crate (`percent-core`)
- keep the terminal-inspired HTML/CSS interface and behavior 100% identical
- guarantee zero math regressions against v1.1
- automate Windows builds and smoke testing on GitHub Actions

### What was completed

- tagged the final Electron state as `v1.1.0-electron` for instant rollback
- generated 10,661 golden test fixtures from the v1.1 JS math and verified byte-for-byte parity in `percent-core` (including JS `Math.round` and `toFixed(2)` tie-breaking rules)
- built the `src-tauri` desktop shell with typed commands, clipboard and dialog plugins, least-privilege capabilities, and a strict CSP
- adapted the static `ui/` frontend to call Tauri commands with per-section sequence guards
- ported all 30+ real-window `--smoke-test` checks to Tauri and verified them locally under Xvfb and in Windows CI
- removed the legacy Electron, Vitest, and `node_modules` toolchain
- added `.github/workflows/build.yml` to build and test the Windows NSIS installer, MSI installer, and portable executable automatically

### Outcome

The app keeps the exact look, feel, and results of v1.1 while shipping as a small, dependency-light Rust + Tauri v2 desktop binary.

---

## Optional Future Work

Future improvements can include:

- custom title bar
- compact mode that hides formula panels
- paid Windows Authenticode code signing (to remove the SmartScreen "unknown publisher" prompt)
- macOS and Linux release bundles in the GitHub Actions matrix
- auto-update support
