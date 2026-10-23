# Consistent header/menu: merge readiness and repository review

---

## 🚦 Verdict

| | |
|---|---|
| **Status** | 🔴 Red |
| **Summary** | Do not merge as-is: deleting the old layout breaks MFA sign-in. Registration and email verification also have an existing asset-delivery failure. |
| **Large-diff mode** | No |
| **Coverage confidence** | Complete for the collected branch diff and first-party application source/templates/configuration; external backend integration remains unverified. |
| **Coverage note** | Reviewed all 18 collected changed files and expanded to unchanged runtime code at the user's request. Rendered all 12 Nunjucks templates and exercised HTTP flows using injected backend clients. Third-party dependencies, generated output and local secrets were excluded. |
| **Branch** | `feat/KAN-88_Consistent-Header` → `origin/main` |
| **Date** | 2026-10-22 |

---

## 📋 Change summary

The branch replaces `views/layout.njk` with `views/main.njk`, moves navigation into a shared slide-out burger menu, adds current-page indicators and branding, migrates page inheritance, and restores the health/header tests and their Vitest/Supertest dependencies.

The reviewed head already contains the merge with main. The context collector reported a clean working tree, two commits ahead of the merge base, and no truncated diff. The review subsequently added `code_reviews/` to `.gitignore` to keep the report and collected context out of the PR.

---

## 🔍 Findings

### 🔴 High

#### 1. **[Template compatibility] — MFA still inherits the deleted layout**

**Origin:** Introduced by this branch's layout replacement.

**Location:** [views/login-mfa.njk](../views/login-mfa.njk#L1); deletion of `views/layout.njk`; [MFA rendering route](../src/controllers/auth-controllers.ts#L110).

The MFA template still begins with `{% extends "layout.njk" %}`, but the branch deletes that base template. This page was not included in the migration to `main.njk`.

**Why it matters:** Users whose accounts require MFA cannot finish signing in. Passing TypeScript checks do not establish that a Nunjucks parent template exists.

**Reproduction:** Using a mocked account client returning `mfaEnabled: true`, a valid CSRF-protected `POST /login` returns `302` to `/login/mfa`. The following GET returns `500`, with `template not found: layout.njk`. A render sweep of all 12 templates fails only on `login-mfa.njk`.

**Hint:** Migrate the MFA template to the shared base too. Cover the MFA redirect/render flow and add an inheritance/render check for every page template, not only login/register/products.

**Confidence:** Confirmed by HTTP reproduction and direct template rendering.

#### 2. **[Asset delivery] — Registration and email verification load missing JavaScript**

**Origin:** Already present on `origin/main`; not introduced by this branch.

**Location:** [views/register.njk](../views/register.njk#L37), [views/verify-email.njk](../views/verify-email.njk#L31), [static mount](../src/app.ts#L52), [build configuration](../package.json).

The templates request `/register.js` and `/verify-email.js`. Express only mounts public assets under `/static`, and the repository stores these files as `public/register.ts` and `public/verify-email.ts`. The production build only bundles the server entry point; it does not create these browser JavaScript files.

**Why it matters:** Registration never installs its submit handler, so submission falls back to a form POST without the expected backend request or CSRF field. Email verification remains at its loading message because the verification script never runs. Resending verification also has no handler.

**Reproduction:** `/register` and `/verify-email?token=review-token` return `200`, but both referenced script URLs return `404`. The same template URLs are present on main. `/static/menu.js`, `/static/product-gallery.js` and `/static/styles.css` return `200`.

**Hint:** Provide a build/serving path for both browser scripts and make their template URLs match it. Changing only the prefix is insufficient while the requested `.js` outputs do not exist.

**Confidence:** Confirmed by HTTP requests and build/source inspection.

### 🟡 Medium

#### 3. **[Navigation resilience] — All menu links are unavailable without the menu script**

**Origin:** Introduced by replacing the previously visible navigation.

**Location:** [closed drawer CSS](../public/styles.css#L164), [menu initializer](../public/menu.js#L1), [shared navigation](../views/main.njk#L41).

The drawer is always hidden by default and only becomes visible after `menu.js` handles the burger button. There is no no-JavaScript fallback or progressively enhanced visible navigation.

**Why it matters:** If JavaScript is disabled or the menu asset fails to load, users cannot access the menu's shop, account or logout controls. The old header rendered usable navigation without JavaScript.

**Hint:** Start with usable navigation and apply the hidden drawer presentation after successful initialization, or supply an accessible fallback. Preserve the existing keyboard behavior when JavaScript is available.

**Confidence:** Confirmed by the default CSS/HTML and the sole JavaScript opening path; no live browser/no-JavaScript session was run in this review.

### 🔵 Nitpick

No nitpicks reported. Formatter-enforced whitespace differences were excluded from findings.

---

## 🗂 Files reviewed

<details>
<summary><strong>18 files changed in collected diff</strong></summary>

| File | Stat |
|---|---|
| `.github/skills/ui-consistency/SKILL.md` | +15 -2 |
| `README.md` | +3 -1 |
| `package.json` | +5 -2 |
| `public/menu.js` | +46 -0 |
| `public/styles.css` | +231 -6 |
| `src/app.test.ts` | +80 -0 |
| `src/app.ts` | +2 -1 |
| `views/account.njk` | +1 -1 |
| `views/error.njk` | +1 -1 |
| `views/forgot-password.njk` | +1 -1 |
| `views/layout.njk` | +0 -31 |
| `views/login.njk` | +1 -1 |
| `views/main.njk` | +80 -0 |
| `views/products/index.njk` | +1 -1 |
| `views/products/not-found.njk` | +1 -1 |
| `views/products/show.njk` | +1 -1 |
| `views/register.njk` | +1 -1 |
| `views/verify-email.njk` | +1 -1 |

</details>

The generated lockfile was excluded from the general diff by the review collector. Registry-resolution metadata was available; no lockfile-specific policy violation was found.

### Expanded repository coverage

- All 23 first-party TypeScript files under `src/`: startup/app wiring, controllers, account client, services, middleware, models, schemas, utilities, session types and the retained tests.
- All 12 current Nunjucks templates, including the unchanged MFA template.
- All five public assets, plus product-page CSS.
- Package scripts, TypeScript/Biome settings, CI workflow, runtime/version settings, example environment configuration, repository review guidance and README.
- No backend repository, real account service, database, production infrastructure, local `.env`, dependency source or generated bundles were audited.

---

## 🔬 Review scope

| | |
|---|---|
| **Feature branch** | `feat/KAN-88_Consistent-Header` |
| **Base branch** | `origin/main` |
| **Merge base** | `dcc76cb948a01539c8c2f4e3fdadcd90e8edf762` |
| **Head commit** | `18668876186f364b454e5ba7ff7ef9bb23bd5e95` |
| **Compared refs** | `origin/main...18668876186f364b454e5ba7ff7ef9bb23bd5e95` |

### Validation performed

| Check | Result |
|---|---|
| `npm test` | Pass: 11 tests in one file |
| `npm run build` | Pass, including TypeScript checks |
| `npm run lint` | Pass |
| Read-only `npx biome format src` | Reports four files needing formatting; no files rewritten. The current CI uses a writing formatter, so this is not evidence that the CI step fails. |
| Render all 12 templates with representative data | 11 pass; MFA fails because its parent layout is missing |
| MFA-required login with injected account client | Confirmed redirect followed by HTTP 500 |
| Non-MFA login, protected account and logout | Pass with injected account client |
| Signed-in account menu highlighting | Pass |
| Catalogue/detail routes and image/product 404 handling | Pass with injected dependencies |
| Product/price service requests and image ordering | Pass with mocked fetch responses |
| Browser script endpoints | Menu/gallery/styles pass; register/verification scripts return 404 |

The current CI runs lint, a writing formatter and the 11 retained tests. It does not run the build or exercise the MFA/registration flows, so a green CI result does not rule out the confirmed failures above. CI currently uses Node 20 while the repository documents/pins Node 22; this is an environment-parity observation, not a reproduced failure.

### Recommendation

Fix finding 1 before merging. Finding 2 is an existing functional problem worth fixing separately or alongside the merge with appropriate scope agreement. Address finding 3 to preserve navigation when the menu script is unavailable. Passing tests/build/lint are useful signals but do not make this branch safe to merge as-is.

This was a review, not an implementation pass: no application code was fixed. Only this report, the ignored collected context and the review-output ignore entry were created.
