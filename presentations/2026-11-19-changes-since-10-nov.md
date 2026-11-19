---
marp: true
theme: default
paginate: true
---

# Changes since Tuesday 10 November 2026
Work merged to `main` from 10 Nov to 19 Nov 2026 in `team-b-for-brilliant-frontend`.
Latest commit read: 18 Nov 2026.

---

## Summary

- Two pull requests were merged to `main` in this period, both on 18 Nov.
- No storefront features changed. The work was on CI and developer tooling.
- The CI pipeline now runs three chained jobs: lint and test, build, then a full Docker Compose check of the frontend with the backend.
- A new `recap` Copilot skill lets the team summarise what changed in the repo.
- Two checkout test stubs were updated to match the current `CheckoutService` interface.

<!-- Evidence: 2a45d39 (#53), db11a00 (#55); git diff --stat ff5313e..origin/main shows 6 files changed, 529 insertions, 8 deletions -->

---

## Key changes (1/3): CI pipeline split into chained jobs

- The single `test` job became `lint-test` ("Lint and Test"), which still runs lint, format check and tests
  - Why: the old job only checked code quality, with nothing proving the app could be built or started
  - Now the system can: fail fast on lint or test problems before any slower job runs
- A new `build` job runs `npm ci` and `npm run build` after `lint-test` passes
  - Why: the production bundle is what gets shipped, so a build failure should block a merge
  - Now the system can: catch type-check and bundling errors in CI, not only on a developer's machine
- Each job only starts if the previous one succeeds (`lint-test` -> `build` -> `docker-compose`)
  - Now the system can: give a clear pass or fail at each stage, with timeouts (10 and 15 minutes) so stuck jobs do not hang

<!-- Evidence: 2a45d39 (#53); .github/workflows/ci.yml; README.md "Docker Compose CI" section -->

---

## Key changes (2/3): Docker Compose job in CI

- A new `docker-compose` job checks out both the frontend and backend repositories side by side
  - Why: the frontend needs the backend running to be tested as a real system
  - Now the system can: start both services together in CI, as they run in a real deployment
- The job builds the backend, runs `docker compose up --build --wait`, then calls the frontend `/health` endpoint with retries
  - Now the system can: prove the containers start and the frontend answers on port 8000
- Service logs are printed if the job fails, and containers and volumes are always removed afterwards
  - Now the system can: be debugged from the CI log and leave no leftover state
- Private backend access uses an optional `BACKEND_REPO_TOKEN` secret, falling back to the default workflow token
- The job runs with read-only `contents` permission

<!-- Evidence: 2a45d39 (#53); .github/workflows/ci.yml jobs.docker-compose -->

---

## Key changes (3/3): Secrets handling for the Compose job

- `JWT_SECRET` and `COOKIE_SECRET` are read from Actions secrets, and both are optional
  - Why: the app will not start without signing keys, but CI should not need production secrets
  - Now the system can: run in CI on a fresh fork or repo with no secrets configured
- If either secret is empty, a random 32-byte key is generated with `openssl rand -hex 32` for that run only
- Generated values are masked in logs with `::add-mask::`
- Configured values are kept as they are, and the README says to use dedicated CI values, never production secrets
- The README documents the pipeline order, the optional secrets, and the private-repo and fork-PR limits

<!-- Evidence: 2a45d39 (#53); .github/workflows/ci.yml step "Generate missing CI signing keys"; README.md lines added under "Docker Compose CI" -->

---

## Testing and quality

- Two checkout test files, `checkout.test.ts` and `checkoutRecovery.test.ts`, gained a `getReorderSession()` method on their fake `CheckoutService`
  - Why: the fake objects must match the service interface, or type-checking fails in the new build stage
  - Now the system can: type-check and build cleanly in CI
  - The stub throws "Reorder session should not be requested", so any accidental call in these tests fails loudly
- `package-lock.json` gained about 260 lines, including TypeScript packages
  - Why: the commit message says `npm ci` needed the TypeScript packages recorded in the lockfile, and that it fixed vulnerabilities
  - Now the system can: install exact, reproducible dependencies in the new CI jobs
- No new test cases were added in this period. The changes keep existing tests compiling.

<!-- Evidence: 2a45d39 (#53); src/tests/controllers/checkout.test.ts (+3), src/tests/controllers/checkoutRecovery.test.ts (+6); package-lock.json (+260, not read line by line) -->

---

## Infrastructure and tooling

- Added the `recap` Copilot skill in `.github/skills/recap/SKILL.md` (162 lines, PR #55)
  - Why: to let anyone ask what changed in the repo since a date or on a branch, without reading raw git output
  - Now the system can: answer `/recap <date or branch>` with a grouped summary of changes
- The skill is read-only. It only runs read git commands and never edits files, commits or fetches
- It has two levels of detail: simple (plain English, the default) and technical (adds hashes, mechanics, risks and follow-ups)
- It separates work on `main` from side branches and local-only work, and detects squash-merged branches
- It masks secrets and skips `.env*`, `*.tfstate` and `*.tfvars` files unless essential

<!-- Evidence: db11a00 (#55); .github/skills/recap/SKILL.md -->

---

## Challenges and decisions

- The CI work took several iterations inside PR #53, shown in its squashed commit message
  - "Removed typecheck test": a separate type-check step was dropped, as the `build` job already type-checks and bundles
  - "Fixed npm run build" and "Added typescript packages to package-lock": the build stage needed fixes to pass in CI
  - "Fixed vulnerabilities with npm ci": the install step was changed to resolve dependency vulnerabilities
  - "Resolved Copilot suggestion": a review comment from Copilot was addressed before merge
- Decision: generate throwaway signing keys when secrets are missing, instead of requiring them, so CI works without extra setup
- Limitation noted in the README: generated keys do not give repository access, so a private backend checkout still needs `BACKEND_REPO_TOKEN`

<!-- Evidence: 2a45d39 (#53) commit message bullets; README.md "Docker Compose CI" section -->
