# Contributing to LibreNav

Thanks for helping improve LibreNav. Contributions of code, documentation, accessibility fixes, bug reports, tests, and OpenStreetMap data-quality guidance are welcome.

## Before starting

1. Search [existing issues](https://github.com/rike4545/LibreNav/issues) and pull requests to avoid duplicate work.
2. For substantial changes, open an issue first so we can agree on scope.
3. For bugs, include reproducible steps, expected behavior, actual behavior, browser/device details, and relevant console output with personal information removed.
4. Please do not include API keys, access tokens, precise personal location history, or other secrets in issues, logs, screenshots, or commits.

## Development setup

- Node.js 22
- npm
- Git

```sh
git clone https://github.com/rike4545/LibreNav.git
cd LibreNav
npm ci
npm run dev
```

## Quality checks

Before opening a pull request, run:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The repository's GitHub Actions workflow runs linting, type checking, tests, and the static build for pull requests.

## Pull request expectations

- Keep changes focused and explain the user problem they solve.
- Add or update tests when behavior changes.
- Update documentation when commands, settings, limitations, or user-facing behavior change.
- Preserve the browser-first design and avoid adding accounts, tracking, or required API keys to core features without discussion.
- Do not claim live charger availability unless the data source actually supports it; explain uncertainty in range estimates and OpenStreetMap coverage.
- Check keyboard use, accessible labels, responsive layouts, and relevant navigation modes.
- Link related issues and include screenshots or a short recording for visual changes when useful.
- Be respectful in review discussions and respond constructively to feedback.

## Good first contributions

Look for issues labelled `good first issue` or `help wanted`. Documentation, reproducible bug reports, accessibility improvements, tests, and small fixes are useful ways to get started.

## Review and merging

A maintainer may request changes, ask for tests, or close a pull request that is out of scope. Opening a pull request does not guarantee acceptance. Please allow time for review and keep follow-up changes in the same branch when practical.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
