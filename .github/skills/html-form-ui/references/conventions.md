# Form UI conventions

The HTML conventions below are enforced by `scripts/form-ui.mjs`. Class names, element choices, formatting and patterns all come from [form-ui.config.json](../config/form-ui.config.json), so change the config, not the code, if the team agrees a different HTML standard. CSS matching, keyboard-only behavior, colour contrast and wording consistency are manual cross-file reviews; the CLI does not verify them.

`[auto]` = fixed automatically in fix mode. `[manual]` = reported with a suggested fix; a developer must act.

## The golden form

See [golden.html](../fixtures/golden.html) for a complete example that produces zero issues. The shape is:

```html
<div class="form-wrapper">
  <h2 class="form-title">Form title</h2>
  <form action="/x" method="post">
    <fieldset class="form-section">
      <legend class="form-legend">Section name</legend>
      <div class="form-field">
        <label for="email" class="form-label">Email <span class="form-required" aria-hidden="true">*</span></label>
        <p id="email-hint" class="form-hint">Hint text.</p>
        <input id="email" name="email" type="email" required aria-describedby="email-hint email-error" aria-invalid="true">
        <p id="email-error" class="form-error">Error text.</p>
      </div>
      <fieldset class="form-group">
        <legend class="form-legend">Choose one</legend>
        <div class="form-option">
          <input id="a" name="choice" type="radio" value="a">
          <label for="a" class="form-label">A</label>
        </div>
      </fieldset>
    </fieldset>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary">Save</button>
      <button type="button" class="btn btn-secondary">Cancel</button>
    </div>
  </form>
</div>
```

## 1. Form structure (`structure`)

- [auto] The form sits inside `<div class="form-wrapper">`. A bare `<div>` parent gets the class; otherwise the form (and a heading directly before it) is wrapped.
- [auto] Each control sits in a `<div class="form-field">` (or `form-option` for a radio or checkbox in a group). Existing single-control `<div>`/`<p>` containers get the class; loose label + control + hint/error siblings are wrapped.
- [auto] A `<fieldset>` gets `form-section` (or `form-group` for choice groups) and its legend is moved to be the first child.
- [manual] Fields not inside a section (`requireSections`), and nesting deeper than `maxNestingDepth` containers.

## 2. Labeling (`labeling`)

- Every `input`, `select` and `textarea` needs a `<label for>` matching its `id`, or `aria-label` / `aria-labelledby`.
- [auto] A label that wraps its control, or the single label in a field, gets a matching `for`/`id` pair (ids are generated from `name`). A `for` that matches no id is repaired when the field has one control.
- [manual] No label at all (a `placeholder` is not a label), `aria-labelledby` pointing at missing ids, orphan labels, duplicate ids.

## 3. Spacing / layout (`spacing`)

- [auto] Removes inline spacing (`margin`, `padding`, `gap`…), ad-hoc utility classes matching `spacing.adHocClassPattern` (e.g. `mt-2`, `px-4`), `<br>` used between controls, and empty spacer elements. Spacing comes from the `form-section`, `form-field` and `form-actions` classes in the stylesheet.

## 4. Typography & headings (`typography`)

- [auto] Form title is an `<h2 class="form-title">` directly before the `<form>`; a heading at the top of the form is moved out and renamed.
- [auto] Section headings inside a `<div>`/`<section>` become `<h3 class="form-section-title">`; headings in a fieldset become its `<legend class="form-legend">`.
- [auto] Labels get `form-label`; legends get `form-legend`.
- [manual] Missing form title (`requireTitle`); other headings inside the form.

## 5. Required fields (`required`)

- [auto] A required control's label ends with `<span class="form-required" aria-hidden="true">*</span>`; a plain `*` (or another marker style) is normalised. For radio or checkbox groups the marker goes on the legend.
- [auto] A control with `aria-required="true"` but no visible marker gets one.
- [manual] A visible marker on a control without `required`/`aria-required` (we can't know whether the field really is mandatory).

## 6. Errors (`errors`)

- [auto] Error text uses `<p class="form-error">`; alias classes (`error-message`, `invalid-feedback`, `text-danger`…) are normalised.
- [auto] The error is placed directly after the control, gets an id (`<control-id>-error`), is listed in the control's `aria-describedby`, and the control gets `aria-invalid="true"`.
- [manual] Error text that isn't inside a single-control field (e.g. a form-level summary), because it can't be linked safely.

## 7. Hints (`hints`)

- [auto] Hint text uses `<p class="form-hint">`, sits between the label and the control, gets an id (`<control-id>-hint`) and is listed in `aria-describedby`. Alias classes (`help`, `help-text`, `form-text`…) are normalised.
- [manual] Hint text that isn't inside a single-control field.

## 8. Buttons (`buttons`)

- [auto] Every `<button>` has an explicit `type`. Untyped buttons whose text matches `aliases.secondaryActionTextPattern` (Cancel, Back, Reset…) become `type="button"`; others become `type="submit"`.
- [auto] The submit action gets `btn btn-primary`; other actions get `btn btn-secondary`. Non-standard button classes are removed.
- [auto] All actions go in one `<div class="form-actions">` as the last child of the form, primary first.
- [manual] No submit button; buttons with no accessible name.

## 9. Formatting (`formatting`)

- [auto] 2-space indentation, double quotes, one block element per line, collapsed whitespace, no trailing whitespace, single final newline, `<!DOCTYPE html>`, void tags without `/`, boolean attributes without values.
- [auto] Attribute order: `id, name, type, for, class, value`, then other attributes alphabetically, then `aria-*`, then `data-*`.
- Configure with `formatting.indentSize`, `formatting.quote` (`"double"`/`"single"`) and `formatting.attributeOrder`.

## 10. Inline styles (`inline-styles`)

- [auto] Declarations in `inlineStyles.classMap` (e.g. `display: none` → `is-hidden`) are replaced by the class; spacing declarations are removed (see 3).
- Properties in `inlineStyles.whitelist` are allowed.
- [manual] Any other inline style.

## 11. Accessibility (`accessibility`)

- [auto] Redundant `aria-disabled` next to `disabled` is removed; fields with a disabled/read-only control get `is-disabled` / `is-readonly`.
- [auto] Radio/checkbox groups with 2+ options are wrapped in `<fieldset class="form-group">` with a legend when a caption can be found.
- [manual] Clickable non-interactive elements (`<div onclick>`), `role` without `tabindex`, positive `tabindex`, `aria-describedby` pointing at missing ids, `aria-disabled` without `disabled`, `readonly` on controls that don't support it, choice groups with no caption.

## Cross-form stylesheet and interaction review (manual)

These checks compare the form markup and CSS to the application's existing shared styles and to comparable forms. They are not auto-fixed by the CLI.

### CSS and shared components

- Confirm the form uses existing shared field, label, hint, error, action and button classes. Prefer the application's existing CSS custom properties/design tokens over new literal colours or one-off overrides.
- Compare spacing, typography, control sizing, borders, button variants and state styles across equivalent forms. Check that classes used by the HTML are actually styled and that shared CSS selectors are not accidentally overridden locally.
- Review normal, hover, focus, invalid/error, disabled and read-only states. Report conflicting declarations and their stylesheet path/selector; don't change CSS without a clear established token or an approved design.
- If no shared stylesheet or comparable forms exist, report the missing source of truth rather than inventing a standard.

### Keyboard-only navigation

- Tab and Shift+Tab reach controls in a logical document order. Avoid positive `tabindex`.
- Prefer native controls and links. Custom controls need semantics and keyboard behavior that match the native interaction.
- Focus is visibly indicated. A `:focus-visible` rule or equivalent should not be suppressed by `outline: none` / `outline: 0` unless a clear replacement is provided.
- Confirm buttons, links and choice controls can be used with their standard keyboard keys; radio groups support their expected arrow-key interaction.
- Hints and validation errors are linked to controls. If validation moves focus, confirm the destination is sensible and announced.
- When the app is runnable, test with a keyboard only; static markup inspection is not proof that runtime navigation works.

### Colour and wording consistency

- Compare the same semantic colours across forms: body/label text, surfaces, borders, focus, primary and secondary actions, required markers, hints and errors. Prefer shared CSS variables.
- If contrast is in scope, measure the actual foreground/background pair against the applicable accessibility target. Do not call contrast sufficient based on visual inspection alone.
- Compare equivalent labels, action verbs, required-field explanations, hints and error messages. Note differences in terminology, capitalization, punctuation, tone or structure with examples from each form.
- Preserve meaning and product-specific terms. Flag uncertain or contradictory wording for a content owner; don't silently rewrite it.
