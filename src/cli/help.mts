export const HELP = `NAITA internship diary

Usage: bun run cli -- COMMAND [options]
Every command supports --workspace PATH (default: current directory) and --json.
Run bun run start for the terminal menu. Steps can be revisited independently.

Profile and evidence
  init [--from profile.json]              Collect or import a student profile
  profile [--field KEY --text VALUE]       View or edit one profile field
          [--from profile.json]           Merge profile fields from JSON
  weeks                                  Create week files and screenshot folders
  import --repo PATH [--repo PATH ...]    Read local Git histories; preserve notes
         [--author NAME-OR-EMAIL]         Filter commits to the trainee (recommended)
  absence --leave DATES --medical DATES  Save attendance; use "" for none
          [--off DATES]                  Extra non-working dates/holidays

Weekly writing (week is a number or Monday date)
  show --week 1                          View points, ids, commits, and suggestions
  add --week 1 --section work --text "Added a search box."
      [--before POINT_ID]                Insert a point in the middle
  add --week 1 --date YYYY-MM-DD --text "Reviewed feedback."
  edit --week 1 --section work --id ID --text "Revised point."
       [--remove]                        Remove just that point (omit --text)
  draft [--week 1]                       Prepare Git-based suggestions/questions
        [--agent codex|claude]           Optional installed writing agent
        [--agent-command COMMAND]       Explicit custom shell command
        [--from response.json]          Import agent suggestions for review
  accept --week 1 --id ID [--text ANSWER] [--before POINT_ID]
         [--accept-drafts]               Accept all factual work drafts in a week
  dismiss --week 1 --id ID               Dismiss a suggestion without adding it
  screenshots --week 1                   Show the folder and detected PNG/JPEG files
              --file NAME --text CAPTION Set a screenshot caption
              --reason "No visual work" Mark screenshots not needed; "" clears it
  review --week 1                        Mark a filled week reviewed
  status [--week 1]                      Show content, screenshots, review, and gaps

Agent workflow and PDF
  agent-guide                            Instructions for AI agents using this CLI
  context [--week 1] [--prompt]          Export evidence or the writing prompt
  generate [--out FILE.pdf] [--font times.ttf] [--strict]
           [--repo PATH] [--leave DATES] [--medical DATES] [--off DATES]
           [--agent codex|claude]        Save agent proposals before exporting
           [--dry-run]                  Return JSON without changing files
  export                                 Alias for generate

Sections: work, problems, solutions, learning, improvements.
Dates: YYYY-MM-DD, comma-separated or inclusive START..END ranges.
Default work schedule: Monday-Friday; weekend commits count as work.
--strict requires filled sections/days, screenshots or a reason, no pending
suggestions/attendance conflicts, confirmed absences, and a current review.
Unaccepted suggestions never appear in the PDF. Manual week JSON edits are read
on every command. Re-importing or re-drafting never replaces accepted points.
`;
