# Accessibility audit: navigation panels

Audit date: 2026-10-16  
Scope: source-level review of search, route preferences, and charger details. This is a focused pass, not a full WCAG conformance audit.

## Changes in this pass

- Search failures are announced in a polite live status region instead of being presented as an ordinary empty result.
- Business-search failures are no longer swallowed into an empty array; the interface can distinguish a failed source from a successful search with no matches.
- Route-preferences disclosure exposes its expanded state to assistive technology.
- Category filter buttons expose their selected state with `aria-pressed`.
- Icon-only actions reviewed in `SearchPanel.tsx` and `ChargerCard.tsx` have accessible names.

## Manual verification checklist

Run these checks in a browser before claiming a complete accessibility audit:

- [ ] Keyboard only: tab to the destination search field, clear search, expand/collapse the panel, and select a result.
- [ ] Keyboard only: open route preferences, change travel mode and filter chips, and reorder/remove waypoints.
- [ ] Keyboard only: open charger details, navigate to the charger, add a stop, and close the details card.
- [ ] Screen reader: confirm search errors are announced and distinguish service failures from “No matches found.”
- [ ] Screen reader: confirm route preferences announces expanded/collapsed and category filters announce pressed/unpressed state.
- [ ] Confirm visible focus remains apparent against both raised and dark surfaces.
- [ ] At narrow mobile widths and browser zoom, confirm controls remain reachable and do not create horizontal scrolling.
- [ ] Test Escape and focus return for every modal/sheet entry point in the app.

## Known gaps

- This pass does not establish WCAG 2.2 AA conformance.
- A full runtime audit of modal focus trapping/return, contrast ratios, reduced-motion behavior, and every navigation mode remains to be performed.
- Manual browser and screen-reader checks have not been run from this repository-editing session; checkboxes above remain unchecked until verified.
