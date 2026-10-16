# Community metrics review

Use this as a dated evidence log. Do not infer eligibility from stars, forks, commit counts, or the number of files in this repository.

## Baseline — 2026-10-16

Review window: 2025-10-16 through 2026-10-16.

| Metric | Observed result | Evidence | Caveat |
| --- | --- | --- | --- |
| LibreNav merged pull requests in the review window | 3 | [#1](https://github.com/rike4545/LibreNav/pull/1), [#10](https://github.com/rike4545/LibreNav/pull/10), [#12](https://github.com/rike4545/LibreNav/pull/12) | GitHub PR search for merged PRs in this repository; window is based on merge date. |
| Distinct authors of those merged LibreNav PRs | 1: `rike4545` | Authors shown on [#1](https://github.com/rike4545/LibreNav/pull/1), [#10](https://github.com/rike4545/LibreNav/pull/10), and [#12](https://github.com/rike4545/LibreNav/pull/12) | This measures PR authors, not all commit co-authors. |
| External contributors with merged PRs to LibreNav | 0 observed | Same three merged PRs above | No external PR author was found in the reviewed window; recheck after future contributions. |
| Maintainer-authored PRs merged into repositories not owned by the maintainer | Unknown | No verified, complete evidence set recorded | Do not count PRs in repositories owned by the maintainer. A broader search result alone is not proof of repository ownership or eligibility. |
| Published reusable package dependents/downloads | Not applicable / none recorded | LibreNav has not published a separate EV package | Do not treat app traffic as package downloads. |
| OpenSSF Criticality Score | Not checked | — | Record the score and source URL only after a dated lookup. |
| Current program terms | Not checked | — | Verify the specific program's current rules before applying. |

## Review checklist

- [x] Date of review: 2026-10-16
- [x] External contributors with merged pull requests in the trailing 12 months reviewed.
- [ ] Maintainer-authored pull requests merged into repositories not owned by the maintainer verified.
- [x] Dependents/downloads reviewed for a separately published reusable package; none recorded because no package is published.
- [ ] Public releases and maintenance activity reviewed.
- [ ] OpenSSF Criticality Score, source URL, and date checked.
- [ ] Current terms for any subscription, sponsorship, or open-source support program being considered.

## Evidence rules

- Count unique external people, not commits, bots, co-authored metadata, or self-authored pull requests.
- Count a contribution only when it satisfies the target program's exact definition and time window.
- For package adoption, use the registry or recognized dependent-project evidence required by the program. Do not equate app visits with package downloads.
- For upstream contribution thresholds, retain links to merged PRs and verify repository ownership.
- If a metric cannot be verified, record it as unknown rather than zero or eligible.
- Eligibility is determined by the program operator. This file is an internal tracking aid, not a certification.

Revisit quarterly and replace the baseline with a dated update rather than silently overwriting historical results.
