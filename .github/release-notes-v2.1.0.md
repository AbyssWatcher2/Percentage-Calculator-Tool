# Percentage Calculator Tool Desktop v2.1.0

**v2.1.0** adds quick input swapping across every card, two new business & tax calculators, a persistent local calculation history tape, and a redesigned in-app dark terminal **About** modal.

## What's New in v2.1.0

- **`⇅ swap values` Button:** One-click pill between the two input fields in all 7 calculator cards that swaps the two values and recalculates immediately.
- **Markup & Profit Margin Calculator:** Enter `Cost` and `Selling price` to compute net `Profit`, `Markup %` on cost, and gross `Margin %` on selling price.
- **Reverse Tax / VAT Calculator:** Switch between `add tax` (computes tax and gross total from a net amount) and `extract tax` (reverse-calculates net amount and tax from a tax-inclusive total).
- **Persistent Local History Tape (up to 500 entries):**
  - Saved locally on your PC at `%APPDATA%\com.percentagecalculator.tool\history.json` (never sent anywhere).
  - Records calculations on explicit actions (`calculate`, `Enter`, or `copy`) with consecutive duplicate deduplication and atomic file writes.
  - Each row includes one-click `copy` and `↺ restore` to load inputs right back into their calculator card.
- **Redesigned Dark Terminal About Modal & Updated Credits:**
  - Replaces the white native OS dialog box with a dark-mode terminal modal (`Esc` / backdrop / `[ × ]` to close) and removes the `tauri-plugin-dialog` dependency.
  - Credits: **Mohamed Sayed · Ahmed Emara · DeepSeek · ChatGPT · Antigravity**.

## Windows Downloads

| Package | File | Description |
| --- | --- | --- |
| **NSIS Setup Installer** | `Percentage.Calculator.Tool_2.1.0_x64-setup.exe` | Recommended standard Windows installer |
| **MSI Installer** | `Percentage.Calculator.Tool_2.1.0_x64_en-US.msi` | Windows Installer package |
| **Portable Executable** | `Percentage.Calculator.Tool.Portable.2.1.0.exe` | Single-file standalone executable (requires Windows WebView2 runtime, preinstalled on Windows 10/11) |
