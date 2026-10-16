# LibreNav roadmap

This roadmap prioritizes user value, reliability, and a healthy contributor community. It is a direction of travel, not a promise that every item will ship on a fixed date.

## Now: make contributions safe and approachable

- [ ] Review and merge the community-readiness PR after CI and maintainer review.
- [ ] Confirm GitHub issue forms, repository labels, security reporting, and Community Standards are configured as intended.
- [ ] Document the app architecture and identify high-value test seams.
- [ ] Keep bug reports reproducible and protect private location data in logs and screenshots.
- [ ] Label a small set of genuinely approachable issues after maintainers verify their scope.

## Next: reliability and accessibility

- [ ] Expand automated tests around trip-link parsing, range estimation, routing fallbacks, and charger planning.
- [ ] Add tests for malformed input and external-service failures.
- [ ] Review keyboard navigation, screen-reader names, focus handling, reduced motion, and mobile layout.
- [ ] Document external service limits and how the app behaves when a provider is unavailable.
- [ ] Review dependency alerts and release notes regularly.

## Explore: reusable EV planning logic

The EV range estimate and charging-stop planner may be useful beyond this UI. Before extracting a package:

1. Identify a stable public API and real external use cases.
2. Separate deterministic calculations from browser/network/service concerns.
3. Write tests for units, invalid inputs, reserve handling, terrain assumptions, and edge cases.
4. Document limitations and example use.
5. Compare maintenance and release costs against keeping the code in the app.
6. Publish only if it has value as an independently usable library.

Downloads and dependent projects must be measured honestly. Do not create artificial packages or inflate metrics to qualify for a program.

## Grow the contributor community

- Keep first contributions small and well specified.
- Review outside contributions with clear, kind, actionable feedback.
- Credit contributors in release notes when appropriate.
- Share relevant issues in suitable communities without spam or pressure.
- Contribute fixes upstream when LibreNav discovers a reproducible issue in a dependency or open data tool.
- Revisit the roadmap based on user reports, contributor feedback, and project capacity.

## Metrics to review quarterly

- External contributors with merged PRs in the trailing 12 months.
- PRs authored by the maintainer and merged into repositories the maintainer does not own.
- Release cadence, issue response time, and unresolved security/dependency alerts.
- Package downloads and dependent projects, if a package is eventually published.
- OpenSSF Criticality Score, if available.

Metrics are indicators, not substitutes for quality. Subscription or funding eligibility is determined by the relevant program, not by this roadmap.
