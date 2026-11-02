# Accessibility audit: navigation panels

Audit date: 2026-11-02  
Scope: source-level review and automated regression contracts for search, route preferences, charger details, settings, layers, and reporting sheets. This is not a full WCAG conformance audit.

## Source review completed

- Search errors use a polite live status; category-service failures are distinguished from a successful empty category search.
- Search/category requests are cancelled when superseded, preventing stale results from replacing the active selection.
- Route-preferences disclosure exposes its expanded state; travel modes and category filters expose selected state.
- Icon-only controls reviewed in SearchPanel and ChargerCard have accessible names.
- Settings, layers, charger details, and report sheets use dialog semantics, move focus into the dialog, contain Tab/Shift+Tab navigation, close with Escape, and restore focus to the opener.
- Global `:focus-visible` styling provides a consistent keyboard indicator, including controls with custom borders.
- Reduced-motion preferences disable non-essential transitions and animations.
- Toasts and service status messages are exposed to assistive technology.
- Automated source-contract tests cover the dialog/focus hooks, status announcements, and reduced-motion styles.

## Manual verification checklist

These checks require an actual browser and assistive technology. They have **not** been marked complete by source inspection alone:

- [ ] Keyboard only: tab to destination search, clear it, expand/collapse the panel, and choose a result.
- [ ] Keyboard only: open route preferences, change travel mode and category filters, and reorder/remove waypoints.
- [ ] Keyboard only: open charger details, navigate to the charger, add a stop, and close the details card.
- [ ] Keyboard only: open Settings, Layers, and Report; verify initial focus, Tab/Shift+Tab containment, Escape, and focus restoration.
- [ ] Screen reader: confirm search and category errors are announced and differ from successful empty results.
- [ ] Screen reader: confirm dialog names, route-preferences expanded state, filter pressed state, and switch checked state.
- [ ] Confirm visible focus remains apparent on light and dark themes at normal and high browser zoom.
- [ ] At narrow mobile widths and browser zoom, confirm controls remain reachable without horizontal page scrolling.
- [ ] Test VoiceOver on iOS Safari and at least one desktop screen reader/browser combination.

## Known gaps

- Source inspection and automated contract tests do not establish WCAG 2.2 AA conformance.
- Contrast ratios for every dynamic state, map canvas interaction, voice guidance, and all navigation modes still need runtime testing.
- A manual browser and screen-reader session is required before closing issue #16. The focus-management implementation must also be checked on real mobile browsers, where virtual keyboards and touch exploration behave differently.
