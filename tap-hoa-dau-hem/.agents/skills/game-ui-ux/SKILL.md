---
name: game-ui-ux
description: >-
  Specialized skill for designing and auditing Game UI/UX in pixel-art, simulation, and management games.
  Use when creating, reviewing, or refactoring game interfaces, dialogs, HUD overlays, mobile responsive layouts,
  and interactive controls.
---

# Game UI/UX Design System for Simulation & Pixel Art Games

This skill guides the creation and review of clean, accessible, and tactile user interfaces for 2D pixel-art management games on web and mobile devices.

## 1. Core Principles

### 1.1 Safe Areas & Responsive Viewports
- **Landscape Viewports**: Mobile devices with wide aspect ratios (iPhone Dynamic Island, punch-hole cameras) require a minimum **Safe Margin of 32–40px** from the screen edges.
- **Never hardcode absolute screen coordinates** (e.g. `x = 6`, `x = 322`, `W - 20`).
- **Modal Panels**: Modal dialogs should float cleanly in the center of the screen with clear margins (`Math.min(540, W - 48)` in landscape). Never stretch a modal edge-to-edge unless it is a full-screen scene.

### 1.2 Button Width Consistency & Alignment
- **No Jagged Staircases**: Every button inside a column or panel row must adhere to a strict modular grid:
  - **Full-Width Button**: Exactly fills the column width (`colW`).
  - **Half-Width / Paired Buttons**: Symmetrically divide the column width: `(colW - gap) / 2`.
  - **Never place an arbitrary 108px button directly beneath a 220px button** without pairing it or expanding it to match the column width.

### 1.3 Visual Hierarchy & Semantic Color Coding
- **Primary Actions (Green `C.green`)**: `▶ Tiếp tục` (Resume), `Bắt đầu`, `Xác nhận`. Always given primary visual weight.
- **State Toggles (Blue `C.blue` / Wood `C.wood`)**:
  - `ON / BẬT`: Clear active highlight (`C.blue` or `C.green`).
  - `OFF / TẮT`: Subdued wood or neutral grey (`C.wood` or `C.grey`).
- **Secondary Actions & Tools (Wood `C.wood` / `C.woodDark`)**: Inventory, Store Management, Settings, Updates.
- **Destructive / Exit Actions (Red `C.red` / Grey `C.grey`)**:
  - `🚪 Đóng cửa sớm` (Red): Signals danger/loss of daytime customer flow.
  - `🏠 Về màn chính` (Grey): Neutral exit, placed away from rapid click zones to prevent mis-clicks.

### 1.4 Modal Dialog Anatomy
Every modal dialog must comprise:
1. **Dimmed Backdrop**: 50–60% opacity dark overlay (`0x000000, 0.6`) blocking clicks to the game behind, with tap-to-dismiss behavior where appropriate.
2. **Distinct Header Banner**: Solid wood/dark header (`C.woodDark`), bold title text (`⏸ TẠM DỪNG`), and a high-contrast `✕` close button in the top-right corner.
3. **Structured Body Columns**: Grouped by player intent (e.g., *Shop Actions & Automation* on the left, *System & Settings* on the right).
4. **Footer / Status Feedback**: Subdued 11–12px hint text (e.g. `💾 Tiến trình game được tự động lưu liên tục`).

### 1.5 Touch Target Ergonomics
- Minimum touch target height on mobile: **36–44px**.
- Spacing between adjacent buttons: **6–10px** to avoid fat-finger accidental taps.
- Text scaling: Automatically fit button labels within the available button width to prevent overflow or truncation.
