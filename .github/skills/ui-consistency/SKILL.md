---
name: ui-consistency
description: "Create or update Nunjucks (.njk) pages using the shared main.njk header and menu, and review HTML forms and CSS for consistent application-wide UI. Use when creating or styling Nunjucks pages, matching a form to CSS, checking shared styles, comparing form colours or wording, checking keyboard navigation or visible focus, reviewing accessibility, or formatting HTML form markup."
argument-hint: "form HTML path and related CSS path(s), or paste the markup"
---

# Consistent Form UI

Keep every form consistent with the application's existing styles and with other forms. Review the HTML and its actual CSS together; do not treat the HTML formatter as a CSS checker.

This skill has two parts:

- The CLI checks and formats supported HTML conventions using parse5.
- Cross-file CSS, keyboard interaction, colour and wording comparisons require inspecting the relevant stylesheets and forms. Report these findings separately; the CLI does not check them.


## Source of truth

Use this order when deciding what a form should match:

1. A user-provided design system, stylesheet, content guide or named reference form.
2. Shared CSS tokens and form components already used by the application.
3. The established pattern across comparable forms in the application.

Inspect the target form's linked/imported CSS and the shared styles that affect it. Search for sibling forms and reuse their established tokens, selectors, focus treatments, button variants, field spacing, error/hint styles and copy patterns.

If no relevant stylesheet, sibling form or design/copy guide exists, say that the standard cannot be inferred yet. Do not invent colours, CSS tokens, or product wording and present them as established conventions. You may offer a proposed standard, clearly labelled as a proposal, for the user to approve.

## B-Brilliant brand guidance

The company name is **B-Brilliant**. When the brand is relevant to the page or form, use a white background with these accent colours:

- Primary accent: `#52dfdd`
- Secondary accent: `#028aa4`

Prefer existing shared tokens or components for these colours. Do not add one-off colour values if the application already provides an equivalent token, and check contrast rather than assuming either accent is suitable for every text/background pairing.

When applicable, the page may show the slogan **“Never Settle for less”**, preferably near the top-left. This is a preference, not a requirement; do not force it into forms or pages where it would be out of place.

## Shared Nunjucks layout

Every page template this skill creates under `views/`, including nested folders, must begin with `{% extends "main.njk" %}`. The shared [main.njk](../../../views/main.njk) owns the document structure, header, branding, burger menu, navigation behaviour and shared stylesheet.

- Put page markup inside `{% block content %}` and set the page title in `{% block title %}`.
- Add page-specific styles through `{% block head %}` and scripts through `{% block scripts %}`. Keep shared assets in the base template.
- Do not duplicate the header or menu, add a second document shell, or extend the retired `layout.njk`.
- Preserve current-page navigation highlighting and signed-in/signed-out menu behaviour.
- When updating an existing page, preserve or restore its inheritance from `main.njk`.
- `main.njk` itself must not extend itself. Include-only partials and macro files are fragments rather than pages and must not extend a document layout.

Before completing a Nunjucks page, verify that it renders through `main.njk` with exactly one header and menu, with its page content and page-specific assets intact.

## Procedure

1. **Identify the comparison set.** Read the target HTML, linked/imported CSS, shared theme/token files and comparable forms. If the user supplied reference files, prefer them. Do not modify unrelated forms.
2. **Run the HTML checker** from the repository root when the target is a file:

   ```bash
   SCRIPT=.github/skills/html-form-ui/scripts/form-ui.mjs
   node $SCRIPT check path/to/form.html
   node $SCRIPT diff path/to/form.html
   node $SCRIPT fix path/to/form.html --write
   ```

   Use `check` for review, `diff` to preview a requested fix, and `fix --write` only when the user asks for changes. Raw HTML can be passed with `--html` or stdin (`-`).
3. **Review the HTML/CSS relationship.** Check that the form uses shared component classes and CSS custom properties rather than introducing one-off colours or spacing. Confirm that stylesheet selectors cover the form's normal, focus, invalid, disabled/read-only and error states. Find inline styles and local overrides that conflict with shared styles.
4. **Check keyboard-only use.** Follow general accessibility guidelines. Inspect source first; if the application can be run in a browser, verify navigation with only the keyboard as well.
5. **Compare colour and wording across forms.** Compare equivalent states and messages across the selected forms. Identify the exact file/selector or text examples that match or differ. Preserve product meaning; do not silently rewrite substantive wording.
6. **Report results by category.** Summarise:
   - CSS and component consistency
   - Keyboard navigation and focus
   - Colour and state consistency
   - Labels, hints, errors and wording
   - Other HTML accessibility/structure findings

   Include file paths and line numbers/selectors when available. Separate verified findings, CLI findings, and manual/browser checks. Mark each recommendation as auto-fixed, manually fixed, or requiring developer/product input. Explain when a check could not be verified.
7. **Make only requested changes.** The CLI's `fix --write` changes HTML only. It does not edit CSS, validate colour contrast, test keyboard interaction, or enforce wording consistency. Make CSS changes only when a clear shared token/component exists; otherwise propose the change and ask for approval. Never claim manual checks passed unless they were actually performed.
8. **Verify edits.** Re-run the HTML check after HTML changes. Re-check any affected stylesheet and sibling forms. If a browser is available and the app can run, verify a representative form using keyboard-only interaction.

## Keyboard-only checklist

- Every interactive control is reachable in a logical DOM/tab order with `Tab` and `Shift+Tab`; don't use positive `tabindex` to force the order.
- Use native buttons, links, inputs, selects and textareas. Custom interactive widgets need appropriate semantics and keyboard behaviour.
- The focused control is visibly distinguishable. Check `:focus-visible` or an equivalent focus style and watch for `outline: none` / `outline: 0` without a replacement.
- Controls remain operable without a pointer: buttons with `Enter`/`Space`, links with `Enter`, and radio groups with the expected arrow-key behaviour.
- Disabled controls are not presented as usable. Read-only controls remain understandable and focusable where appropriate.
- Validation errors and hints are programmatically associated with their controls. If submission moves focus to an error summary or first invalid field, that behavior is clear and usable.
- When browser verification is available, test the form without a mouse: tab through it, operate each control, trigger validation, and confirm focus remains visible and moves sensibly.

## Colour and wording consistency

- Compare semantic CSS variables/tokens for text, background, borders, focus, primary/secondary actions, required indicators, hints and errors. Prefer the shared token to a new literal value.
- Compare equivalent form states with one another. A success, error, disabled or focus state should not change meaning or visual treatment from form to form without a documented reason.
- If asked to assess contrast, calculate/check the relevant foreground/background pair against the applicable accessibility target. Do not infer adequate contrast from appearance alone; record the colours and ratio or state that it remains unverified.
- Compare labels, button verbs, capitalization, punctuation, required-field explanations, hint tone and error-message structure across equivalent forms.
- Keep wording concise, specific and actionable. Preserve meaning and product terminology; flag unclear or contradictory copy for the content owner instead of guessing.

## CLI modes

```bash
node .github/skills/html-form-ui/scripts/form-ui.mjs check path/to/form.html
node .github/skills/html-form-ui/scripts/form-ui.mjs diff path/to/form.html
node .github/skills/html-form-ui/scripts/form-ui.mjs fix path/to/form.html --write
node .github/skills/html-form-ui/scripts/form-ui.mjs check path/to/form.html --json
node .github/skills/html-form-ui/scripts/form-ui.mjs check --html '<form>…</form>'
node .github/skills/html-form-ui/scripts/form-ui.mjs check - < path/to/form.html
```

Exit codes: `0` clean, `1` issues remain (`check`: any issue; `fix`/`diff`: manual issues), `2` usage error. The HTML CLI report does not include CSS, keyboard, colour-contrast or wording-comparison findings; add those as a separate manual review section.
