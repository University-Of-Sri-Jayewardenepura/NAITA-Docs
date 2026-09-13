# NAITA internship diary

A Bun CLI and OpenTUI terminal interface for filling the supplied
`Daily Diary.pdf`. The diary is saved week by week so you can come back to any
step, add information later, or edit the files yourself.

Each week contains short bullet points for:

- Work carried out
- Problems encountered
- How they were solved
- Learning
- Improvements for next week

Screenshots follow the written notes for that week. Git history provides dated
evidence and suggested work descriptions. Questions about problems, solutions,
and learning help you add your own experience. Suggestions remain separate from
your diary until you accept them.

## Install and start

Requirements: Bun 1.3+, Git, and Times New Roman. The CLI, TUI, and application
code run on Bun with TypeScript; Vitest and Playwright provide the test runners.

```sh
bun install
bun run start
```

The terminal menu lets you edit a profile field, open any week, import Git
history, confirm attendance, review suggestions, manage screenshot captions, or
export a PDF. Use Up/Down and Enter to choose, Escape to go back, and Ctrl+C to
exit. Saved entries remain available next time. Returning to attendance prefills
the saved dates; clearing a field explicitly records no dates for that category.

Times New Roman is detected on Windows, macOS, and common Linux Microsoft-font
installations. If needed, use `generate --font /path/to/times.ttf` or set
`NAITA_TIMES_FONT`. The font must be Times New Roman; it is embedded in the PDF.
No Windows-only path is required.

## Work through the CLI in any order

```sh
bun run cli -- help
bun run cli -- status
```

Every command supports `--workspace PATH` and `--json`. The workspace defaults to
your current directory; the bundled template is located relative to the program.
The CLI does not require the OpenTUI runtime. `naita-diary` points to the scripted
CLI; `bun run start` opens the terminal menu.

Fill the profile interactively, import JSON, or set one field at a time:

```sh
bun run cli -- init
bun run cli -- init --from docs/examples/profile.json
bun run cli -- profile --field name --text "Your name"
bun run cli -- profile --field trainingStart --text "2026-04-06"
bun run cli -- profile --field trainingEnd --text "2026-04-17"
bun run cli -- weeks
```

`docs/examples/profile.json` contains fictional sample information. Replace it with
your own information. Training start/end dates are needed to create week files;
other profile fields can be completed later. Name and establishment are also
required for PDF export. Status lists every unfilled profile field, distinguishing
required fields from optional ones.

Read one or more local repositories, including repositories outside this project:

```sh
bun run cli -- import --repo ../student-project --author "you@example.com"
bun run cli -- import --repo ../frontend --repo ../backend --author "you@example.com"
```

Use `--author` in a shared repository so other contributors' commits are not
attributed to you. Without it, all authors are included. Re-running `import`
without `--repo` refreshes the previously saved repositories. Supplying `--repo`
sets the full repository list. Re-importing preserves accepted points and manual
edits. Git reads all branches, excludes merges, deduplicates identical hashes
across repositories, and retains subjects, bodies, authors, and full hashes.

Dates use the author's calendar date in the commit's recorded timezone. Filtering
does not use Git's committer-date `--since`, so rebasing work later does not remove
it from the original training week. No Git repository is modified or checked out.

Confirm attendance, even when there are no absences:

```sh
bun run cli -- absence --leave "2026-04-10" --medical ""
bun run cli -- absence --off "2026-04-13..2026-04-14"
```

Dates can be comma-separated or inclusive `START..END` ranges. Each supplied
option replaces that category; omitted categories keep their saved dates. The
CLI rejects invalid dates, overlaps, and dates outside the training period.
Outside-period dates stay empty; leave and medical dates take precedence over
Git work. Attendance conflicts are shown in status and block a completed export.

The default schedule is Monday-Friday. Weekend commits count as work unless an
explicit absence/non-working date applies. Set `workingDays` in the profile JSON
to change the regular schedule (Sunday is 0, Saturday is 6). A scheduled work day
without commits or manual notes stays unfinished; the tool does not invent work.

## Write and revise a week

```sh
bun run cli -- draft --week 1
bun run cli -- show --week 1
bun run cli -- accept --week 1 --accept-drafts
bun run cli -- accept --week 1 --id SUGGESTION_ID --text "The list stayed blank after I cleared the search."
bun run cli -- dismiss --week 1 --id SUGGESTION_ID
```

`draft` makes concise work proposals from commits and specific questions for the
remaining weekly sections. `--accept-drafts` accepts factual work proposals only;
experience questions still need your answer. An accepted or dismissed suggestion
does not reappear on the next draft. The student is responsible for checking that
the proposed wording accurately describes their work.

Add an extra point, insert it before another point, or correct existing wording:

```sh
bun run cli -- add --week 1 --section learning --text "Learned why clearing a search should restore the full list."
bun run cli -- add --week 1 --section work --before POINT_ID --text "Reviewed feedback on the search box."
bun run cli -- edit --week 1 --section work --id POINT_ID --text "Added a task-title search box."
bun run cli -- edit --week 1 --section work --id POINT_ID --remove
bun run cli -- add --week 1 --date 2026-04-08 --text "Set up the local development environment."
```

Sections are `work`, `problems`, `solutions`, `learning`, and `improvements`.
Use a week number or its Monday date. `show` includes point and suggestion IDs.
Weekly points describe the whole week. Daily points belong to the date table.
The first manual daily addition copies the Git descriptions into editable points
before appending the new note. That customized daily list then takes precedence
over automatic Git descriptions, so subsequent imports cannot replace your edits.

Write naturally: "Fixed the empty search state and checked that clearing the
input restored the list." Keep the technical detail that explains what you did;
avoid inflated claims. If there were no problems, write that explicitly. A proposed
improvement for next week should not read as completed work.

## Screenshot folders and manual editing

`weeks` creates a local structure like:

```text
naita-diary.json
diary/
  state.json
  weeks/
    week-01-2026-04-06.json
    week-02-2026-04-13.json
  screenshots/
    week-01-2026-04-06/
      01-task-list.png
      02-search-result.jpg
    week-02-2026-04-13/
```

Put screenshots of your work in the matching folder. PNG, JPG, and JPEG files are
detected each time you run status or export, sorted by filename with numeric
ordering, and scaled proportionally. Images are not stretched or cropped. Invalid
images are reported and block PDF generation; unsupported files are listed by
status. Use images no larger than 25 MB each.

```sh
bun run cli -- screenshots --week 1
bun run cli -- screenshots --week 1 --file 01-task-list.png --text "The task list after adding title search."
bun run cli -- screenshots --week 2 --reason "This week involved reading documentation; no visual work to show."
```

An empty screenshot folder remains unfinished unless you give a reason. Pass
`--reason ""` to clear the exemption. Captions default to readable filenames.

You can edit the weekly JSON directly. Keep the week number, dates, IDs, arrays,
and schema fields intact; change point text or add a point with a unique ID,
`text`, `source: "manual"`, and `evidence: []`. Commands validate and reread the
files. Malformed files produce an error instead of being silently replaced.
Changing training dates after weeks exist is blocked to avoid losing entries;
use a different workspace for another training period.

Profiles, diary data, screenshots, and generated output are ignored by Git.

## Progress and PDF export

```sh
bun run cli -- status
bun run cli -- status --week 1 --json
bun run cli -- review --week 1
bun run cli -- generate
bun run cli -- generate --strict --out output/completed-diary.pdf
bun run cli -- generate --repo ../student-project --dry-run
```

Status shows section point counts, unfilled work dates, screenshot counts/errors,
pending suggestions, and review state for each week. The percentage measures
filled sections, work dates, and the screenshot step. A week is ready only when
those are filled, absences are confirmed, suggestions and attendance conflicts
are resolved, required profile fields exist, and the week has been reviewed.
Editing notes, attendance, profile data, Git evidence, captions, or screenshot
contents invalidates the affected review.

Draft exports can contain unfinished areas, visibly marked "Not filled in yet."
Unaccepted suggestions never enter the PDF. Leave and medical dates must be
confirmed before any PDF export. Non-interactive commands fail with instructions
instead of hanging at a prompt. `--dry-run` returns the calendar and evidence as
JSON without writing profile, week, screenshot, or PDF files.

The supplied PDF is a static eight-page A4 document with no AcroForm fields.
Its pages remain the background. The output contains the cover and filled profile,
then a daily table, weekly bullet notes, and screenshot/continuation sheets for
each week. Notes flow onto additional template pages when necessary; long daily
entries continue in the weekly notes instead of being cut off. The last screenshot
uses the shorter continuation sheet above its signature and certification area.
Trainee signatures, engineer certification, inspection pages, supervisor reports,
and official leave counts are left for their intended signatories. The original
template is never overwritten.

## AI-assisted wording

```sh
bun run cli -- agent-guide
bun run cli -- context --week 1 --prompt
bun run cli -- draft --week 1 --agent codex
bun run cli -- draft --week 1 --agent claude
bun run cli -- draft --week 1 --from response.json
```

See [the agent workflow](docs/AI-WORKFLOW.md) for the JSON contract and instructions
for using the CLI. Agents should inspect status/context and use small CLI edits.
They receive only weekly evidence and existing notes, and return proposals for
review. They do not control attendance or PDF coordinates. Full same-week commit
references are validated, but the student still checks the meaning of a proposal.
No paid agent is required for the normal workflow or automated tests.

## Project structure

```text
src/
  cli.mts          Scripted Bun entry point
  app.ts           OpenTUI entry point
  cli/             Argument parsing and command handlers
  diary/           Dates, attendance, editable points, persistence, status
  git/             Read-only Git history import
  ai/              Prompts, proposal validation, optional agent processes
  pdf/             Font discovery, template placement, wrapping, pagination
  tui/             Terminal shell, menus, forms, and CLI client
tests/
  unit/            Vitest: calendar, points, suggestions, arguments
  integration/     Vitest: Git, persistence, status, supplied PDF
  tui/             OpenTUI native renderer and keyboard tests under Bun
  e2e/             Playwright: CLI workflow and PDF.js rendering in Chromium
```

## Tests

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run test
bun run test:tui
bun run test:e2e
bun run typecheck
# Or run all checks:
bun run test:all
```

Oxfmt formats the project and Oxlint checks it:

```sh
bun run format
bun run format:check
bun run lint
```

Bun executes the complete application directly with `bun run cli:bun`. The
TypeScript runner supports `.ts` and `.mts`, and subprocess work uses Bun's
`Bun.spawn`/`Bun.spawnSync` APIs. Vitest's Node workers use a narrow compatibility
fallback for unit imports, while integration and browser subprocesses invoke the
Bun CLI. Filesystem operations use Bun-compatible `node:fs` APIs, which Bun
documents as supported. The OpenTUI entry point is TypeScript and runs on Bun.

Vitest is pinned to **5.0.0**. Tests use isolated temporary workspaces and Git
repositories outside those workspaces. PDF tests use the actual supplied template,
verify the text and its bounds, exercise overflow and image embedding, and check
that original/official pages remain unchanged. They need Times New Roman locally
or through `NAITA_TIMES_FONT`.

OpenTUI's native tests run with Bun, using its documented in-memory renderer and
real keyboard events. Playwright runs the CLI from profile/evidence through a
completed export, then renders the PDF in Chromium through a local PDF.js test
viewer. It checks weekly separation, manual edits, image detection, text bounds,
and PNG/JPEG rendering. The viewer is test infrastructure, not a new application.
Browser artifacts and the sample test PDF are in `output/playwright/`. Sample
content and screenshots are explicitly test fixtures, not a real student diary.

Implementation references: [OpenTUI menus](https://opentui.com/docs/components/select/),
[keyboard input](https://opentui.com/docs/core-concepts/keyboard/),
[native testing](https://opentui.com/docs/core-concepts/testing/),
[Vitest 5](https://vitest.dev/blog/vitest-5), and
[Playwright test runner](https://playwright.dev/docs/test-cli).
