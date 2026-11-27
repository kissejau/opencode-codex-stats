# Repository guidelines

## Workflow

- Start each task in a separate branch from `main` and open a pull request to `main`.
  Use a descriptive prefix such as `feature/`, `fix/`, `docs/`, `test/`, or `refactor/`.
- Preserve unrelated changes. Do not merge pull requests, publish packages, or
  create releases without the user's explicit approval.
- Keep changes focused on the requested task.

## Commits and pull requests

- Write short English commit and pull request titles with a type prefix, such as
  `fix: prevent account switching races` or `docs: clarify login methods`.
- Write a brief English pull request description explaining what changed and why.
  Follow existing pull requests; do not add template sections by default.

## Checks

- Use Node.js 24 or newer. Install dependencies with `npm ci`, then run
  `npm run typecheck` and `npm test` for code changes.
- For releases, also run `npm pack --dry-run` and follow the release instructions
  in the README. CI additionally runs the packed-plugin smoke test in OpenCode.
