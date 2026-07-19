# Agentic Terminal Desktop Smoke Checklist

This checklist verifies the desktop shell integration of the agentic terminal feature.

## Verification Points

### 1. Menu Entry
- [ ] View menu (macOS) contains "Agentic Terminal" item with `agentic.open` command
- [ ] View menu (Windows in-app) contains "Agentic Terminal" item with `agentic.open` command
- [ ] Clicking the menu item navigates to `/agentic` route

### 2. Navigation Entry: Legacy Layout (Settings > General > New Layout Designs OFF)
- [ ] Sidebar rail displays agentic terminal button (terminal icon) above settings button
- [ ] Button has accessible aria-label "Agentic Terminal"
- [ ] Tooltip shows on hover: "Agentic Terminal"
- [ ] Clicking button navigates to `/agentic` route
- [ ] Visible without needing to toggle sidebar

### 3. Navigation Entry: New Layout (Settings > General > New Layout Designs ON)
- [ ] Titlebar displays agentic terminal button (terminal icon) in left navigation area
- [ ] Button appears between forward navigation and titlebar content
- [ ] Button has accessible aria-label "Agentic Terminal"
- [ ] Tooltip shows on hover: "Agentic Terminal"
- [ ] Clicking button navigates to `/agentic` route
- [ ] Visible on primary, secondary, and responsive viewports

### 4. Command Palette Integration
- [ ] Command palette (Cmd+K / Ctrl+K) shows "Open Agentic Terminal" command
- [ ] Command is in "View" category
- [ ] Selecting command navigates to `/agentic` route

### 5. Relaunch State Restore
- [ ] Navigate to `/agentic`
- [ ] Close and restart application
- [ ] Application restores to `/agentic` route (not home page)
- [ ] Relaunch with session query params: `/agentic?session=ses_12345`
- [ ] Application restores to `/agentic?session=ses_12345`

### 6. Route and Component Loading
- [ ] Direct navigation to `/agentic` renders agentic terminal component
- [ ] Agentic terminal component is visible and interactive
- [ ] No console errors on component initialization
- [ ] Component survives layout toggle (newLayoutDesigns setting change)

## Manual Test Procedure

1. Start application with a project open
2. In desktop app (not web):
   - Verify menu entry per point 1
   - If newLayoutDesigns OFF: verify sidebar nav entry per point 2
   - If newLayoutDesigns ON: verify titlebar nav entry per point 3
3. Test command palette per point 4
4. Test relaunch restore per point 5 (for desktop app only)
5. Test direct routing per point 6

## Platforms

- [x] macOS (menu + sidebar/titlebar nav + command)
- [x] Windows (menu + sidebar/titlebar nav + command)
- [x] Linux (sidebar/titlebar nav + command, no desktop menu)
- [x] Web (sidebar/titlebar nav + command)

## Regression Coverage

- Unit test: `packages/app/src/desktop-menu.test.ts` - verifies menu entry
- Unit test: `packages/app/src/app.test.tsx` - verifies command registration
- E2E test: `packages/app/e2e/agentic-terminal/chrome-reachability.spec.ts` - verifies web-rendered chrome

See: `packages/app/src/components/titlebar.tsx:663-668`, `packages/app/src/pages/layout/sidebar-shell.tsx:94-103`, `packages/app/src/pages/layout.tsx:2240`, `packages/app/src/app.tsx:527-542`, `packages/app/src/desktop-menu.ts:144`
