# Form UI conventions

These are the agreed configurable defaults introduced with this skill. They
are not inferred from an existing CSS framework.

| Category | Convention | Automatic repair boundary |
| --- | --- | --- |
| Form structure | `form.form-ui`; one `div.form-field` per field; related sections use `fieldset.form-section` + `legend`, or `section.form-section` + heading | Add classes to unambiguous existing containers; complex nesting/group titles need review |
| Labeling | Visible `label[for]` and unique control `id`; intentional visually unlabeled controls use a nonempty ARIA name | Convert a unique implicit wrapping or unassociated adjacent label to explicit for/id; never invent text or guess orphaned label targets |
| Spacing/layout | Field gap 1rem, section gap 2rem, action gap 1rem, actions offset 2rem through classes | Known simple field containers only; unknown layout utilities are preserved, not assumed equivalent |
| Typography/headings | Form title h1, section heading h2, deeper levels require project configuration/review; legends name fieldsets | Heading hierarchy depends on the page and is reported, not blindly retagged |
| Required fields | Native `required` or `aria-required="true"`; label includes `span.form-required[aria-hidden="true"]` with `(required)` | Add a marker when semantics already exist; visual-only required indications need business-rule confirmation |
| Errors | `p.form-error[id]`, after hint/control; reference from field via `aria-describedby`; visible errors set `aria-invalid="true"` | Normalize recognized messages within a unique field wrapper; never invent error text or clear stale invalid state |
| Hints | `p.form-hint[id]` immediately after control; append ID to `aria-describedby` | Normalize configured aliases within a unique field wrapper; preserve other ID references |
| Buttons | Final `div.form-actions`; primary first, secondary second; `.form-button-primary` / `.form-button-secondary` (also for cancel links) | Group/reorder terminal sibling actions only; positive tabindex and nonterminal placement need manual review |
| Accessibility | Named interactive controls, valid references, fieldset/legend for related radio/checkbox groups, native disabled/readonly attributes | Hidden inputs are exempt from labels; ambiguous names, keyboard behavior and unsupported states need review |
| Inline styles | No inline styles unless the **entire declaration set** is whitelisted | Replace only an exact configured style-to-class mapping; never drop unknown declarations |
| Formatting | 2 spaces, LF, final newline, double-quoted HTML attributes, print width 100 | parse5 HTML AST + pinned Prettier; standard HTML void elements have no closing tag |

Attribute priority is `id`, `name`, `type`, `class`, `value`, `for`, `required`,
`disabled`, `readonly`, `aria-*`, `data-*`, then other attributes. Within a
wildcard bucket or the unmatched bucket, attributes sort lexically.

The stylesheet uses scoped selectors, explicit disabled/read-only appearance,
and a visible focus outline. Include it in the consuming application to obtain
the specified visual spacing; the checker cannot infer computed styles.

## Configuration

Pass a repository-local JSON object using `--config`. Example:

```json
{
  "indentSize": 4,
  "titleLevel": 2,
  "sectionLevel": 3,
  "classes": { "hint": "field-description" },
  "hintAliases": ["help", "description"],
  "inlineStyleWhitelist": ["width:100%"],
  "inlineStyleClassMap": { "margin-bottom:16px": "field-gap" }
}
```

`inlineStyleClassMap` classes must exist in your stylesheet; mapping is explicit
developer approval, not a guessed conversion. Style comparisons trim
declaration whitespace and ignore declaration order, but do not interpret CSS
equivalence or rewrite partial styles. Configure only reviewed declaration sets.
All class options take a single CSS class token. `hintTag` and `errorTag`
support `p` or `span`. Invalid or unknown options fail explicitly.

## Limitations

Check mode analyzes a private AST and plans safe repairs for parity with fix
mode; it never modifies input bytes. All findings are against original source
locations. The counts are rule findings, not a count of affected fields.

Plain HTML only. The tool refuses template delimiters and reported HTML parser
errors instead of applying parser recovery that could lose data. Unknown
hint/error classes cannot be reliably distinguished from ordinary prose: use
configured aliases, or manually apply the documented pattern. Accessible naming
checks cover common static text/ARIA patterns, not the full accessible-name
algorithm or runtime visibility. Dynamic class-driven hidden states and scripts
need human review. The checker preserves action, method, names, values, custom
classes and existing reference tokens; it does not perform server validation.

Formatting covers the whole supplied HTML document/fragment, including
whitespace outside forms. Attribute ordering and UI repairs are form-scoped.
Do not run on unrelated large pages expecting a form-only whitespace patch.
Prettier preserves whitespace-sensitive content according to its HTML rules.
