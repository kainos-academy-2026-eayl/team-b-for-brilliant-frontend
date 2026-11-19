# Structure rules for the deck

## When the user gives an outline

1. Make one section per outline item. A section can be one or more slides. Use the user's wording as the slide title.
2. Keep the user's order. Do not reorder, merge, split or drop items.
3. Do not add sections of your own. If you found important extra work that doesn't fit, mention it in the final report and offer to add it. Only create an "Appendix" slide if the user asked for extras.
4. If an item has no supporting evidence, still create its slide. Write "No evidence found in the scanned scope" and list what you searched (paths, branch, date range). Never fill it with guesses.
5. If an outline item is ambiguous (for example "the bug fix" when there were several), ask which one before generating.
6. These slides are allowed without being in the outline: a title slide at the start, and a closing slide only if the user asked for one.
7. If an item refers to something that is not code (for example "team feedback" or "demo"), create the slide with a placeholder line: "To be added by presenter". Don't invent content.

## Default outline (only when the user gives none)

1. Title and scope (period, branch or files, repo)
2. Summary: the headline outcomes
3. Key changes (one slide per theme or feature area)
4. Testing and quality
5. Infrastructure and tooling (only if it changed)
6. Challenges and decisions
7. Next steps

Skip any default item that has no evidence, except the title and summary slides.

## Writing guidance per slide

- Title: the outline item, in the user's words.
- Bullets: what changed, how it works, why it matters, who or what it affects. Aim for 4 to 8 bullets per outline item, with sub-bullets for specifics.
- For every addition, say what it is, why it was added and what functionality it gives the system. Only state a reason the evidence supports.
- If an item needs more than about 8 bullets, split it across several slides with the same heading rather than cutting detail.
- Group related files into one point (for example "five product test files") rather than listing each.
- Use plain English unless the user asks for technical detail.
- Only cover work merged to main (or the branch or files the user named). Never mention independent branches, stashes or uncommitted work unless asked.
- Evidence goes in `<!-- Evidence: ... -->` speaker notes.

## Verification (run before reporting)

- [ ] Number and order of slides match the outline.
- [ ] No section added, merged or dropped.
- [ ] Each section has evidence or an explicit "No evidence found".
- [ ] Each section is detailed, not a one-line summary.
- [ ] No unmerged branches, stashes or uncommitted work are mentioned (unless requested).
- [ ] No secrets, tokens, subscription IDs or .env values.
- [ ] File saved in `presentations/` without overwriting anything.

## When editing an existing deck

- The user's latest instructions override the original outline.
- Keep all slides the user didn't mention exactly as they are.
- If an edit would break the outline order (for example inserting a slide in the middle), do it anyway if asked, and note it in the report.
- Keep the one-section-per-item and evidence rules for any slide you add.
