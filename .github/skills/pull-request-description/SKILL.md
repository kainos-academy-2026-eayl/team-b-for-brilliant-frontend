---
name: pull-request-description
description: 'Use when writing, drafting, generating, or reviewing a pull request title or description, or when asked to open a PR or update the description of an existing PR for the current branch. Enforces a fixed structure: Requirement, Why, Changes, Testing, Risks / reviewer focus.'
argument-hint: 'Optional ticket link or branch (e.g. "PROJ-123", "feature/login")'
---

# Pull Request Description

Write every pull request description using the exact template below. Keep all five headings, in this order, with these exact names. Never skip a section; if one does not apply, write `N/A` with a one-line reason.

## Template

```markdown
## Requirement
Ticket link and acceptance criteria.

## Why
Problem being solved; reason for the approach.

## Changes
Changed behaviour, key decisions, exclusions.

## Testing
Commands and actual results.
Manual scenarios and what happened.
Checks not run, and why.

## Risks / reviewer focus
Areas needing attention; migrations, config.
Before/after screenshots for UI changes.
```

## Process

1. Gather facts first: run `git log origin/main..HEAD --oneline` and `git diff origin/main...HEAD --stat` (use `origin/master` if there is no `origin/main`), and read the diff for anything non-obvious.
2. If a pull request already exists for the current branch, read its current title and body (see "Updating an existing PR"). Keep anything still accurate, such as the ticket link, acceptance criteria, screenshots, and manual test notes.
3. Find the ticket link and acceptance criteria from the existing PR, branch name, commit messages, or the user. If you cannot find them, ask the user; do not invent them.
4. Fill in each section following the rules below.
5. Output the description in a single markdown block so it can be pasted. If asked to open the PR, pass it to the PR creation tool. If asked to update the PR, follow "Updating an existing PR".

## Updating an existing PR

Use this when asked to update, refresh, fix, or regenerate the description of the current branch's PR.

1. Get the branch name with `git branch --show-current`. Stop and tell the user if it is `main`/`master` or detached.
2. Find the open PR for that branch:
   - Preferred: `gh pr view --json number,title,body,url`.
   - Fallback if `gh` is unavailable or not authenticated: the GitHub MCP tools (`list_pull_requests` filtered by `head` branch, then `pull_request_read`).
   - If no PR exists, tell the user and offer to open one instead. Do not create one unasked.
3. Generate the new description using the Process and Section rules above, based on all commits on the branch, not only the latest one.
4. Write the new body to a temporary file and update the PR, so quotes and backticks are not mangled by the shell:
   - Preferred: `gh pr edit <number> --body-file <file>`.
   - Fallback: the GitHub MCP pull request update tool.
   - Only change the title if the user asks or it clearly no longer matches the changes.
5. Re-read the PR body afterwards and confirm it contains all five headings, then give the user the PR URL.
6. Delete the temporary file.

Rules:
- This replaces the whole body, so carry over any still-valid content from the old body first (step 2 of Process).
- If the old body has substantial content that does not fit the template, show the user the new draft and ask before overwriting.
- Never claim test results that were not run. If Testing cannot be filled in from real runs, say so in "Checks not run, and why".

## Section rules

### Requirement
- Include the ticket link and the acceptance criteria as a checklist (`- [ ]` / `- [x]`), marking each criterion as met or not.
- No ticket: say so explicitly and state the requirement in one or two sentences.

### Why
- Describe the problem being solved, then the reason this approach was chosen over alternatives.
- Explain the motivation, not what the code does (that belongs in Changes).

### Changes
- List changed behaviour from the user's or API consumer's point of view, not file by file.
- Record key decisions and trade-offs.
- Record exclusions: what was deliberately left out or deferred, and any follow-up tickets.

### Testing
- **Commands and actual results:** the exact commands run (for example `npm test`, `npm run lint`) and the real outcome (for example "42 passed, 0 failed"). Run them if they have not been run; never claim results you did not observe.
- **Manual scenarios:** each scenario tried and what actually happened, including unexpected behaviour.
- **Checks not run, and why:** list any skipped checks with the reason. If everything was run, write "None".

### Risks / reviewer focus
- Point reviewers at the areas needing the most attention.
- Call out database migrations, config or environment variable changes, new dependencies, and breaking changes, plus any rollout or rollback notes.
- For UI changes, include before/after screenshots. If the change has no UI, omit screenshots and say "No UI changes".

## Style

- Be concise and specific; prefer bullets over paragraphs.
- Never include secrets, credentials, or real user data.
- Do not add extra top-level headings or reorder the template.
