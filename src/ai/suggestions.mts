import { cleanText, describeCommit, point, SECTIONS, stableId } from '../diary/entries.mts';

export function baselineSuggestions(week) {
  const commits = week.days.filter((day) => day.status === 'work').flatMap((day) => day.commits);
  const suggestions = [
    ...new Map(
      commits.map((commit) => [
        commit.subject,
        {
          id: `git-${stableId(commit.hash)}`,
          section: 'work',
          text: describeCommit(commit.subject),
          kind: 'draft',
          reason: 'Based on the recorded commit. Check that this describes your own work.',
          evidence: [commit.hash],
        },
      ]),
    ).values(),
  ];
  const topic = commits[0] ? ` For this week's work on "${commits[0].subject}",` : ' For this week,';
  const prompts = {
    problems: `${topic} what was the main thing that did not work as expected? Describe what you noticed. If there were no problems, say so.`,
    solutions:
      'Explain what you changed to solve the problem and how you checked the result. A small before-and-after example is useful.',
    learning: `${topic} what can you now do or explain that you could not at the start? Use one concrete example.`,
    improvements:
      'Choose one thing you would do differently next week, such as checking an edge case earlier or making a confusing step clearer.',
  };
  if (!commits.length)
    prompts.work =
      'What did you work on this week? Include work that was not committed, such as setup, research, or feedback, only if you actually did it.';
  for (const [section, text] of Object.entries(prompts)) {
    if (!week.entry.sections[section].length)
      suggestions.push({
        id: `question-${week.monday}-${section}`,
        section,
        text: text.trim(),
        kind: 'question',
        reason: 'Your experience is needed; Git history cannot establish this.',
        evidence: [],
      });
  }
  return suggestions;
}
export function mergeSuggestions(entry, suggestions) {
  const existing = new Set([...entry.suggestions.map((item) => item.id), ...entry.dismissedSuggestions]);
  for (const suggestion of suggestions) {
    if (
      !existing.has(suggestion.id) &&
      !entry.sections[suggestion.section].some((item) => item.text === suggestion.text)
    ) {
      entry.suggestions.push(suggestion);
      existing.add(suggestion.id);
    }
  }
}
export function resolveSuggestion(entry, id, { text, dismiss = false, before } = {}) {
  const suggestion = entry.suggestions.find((item) => item.id === id);
  if (!suggestion) throw new Error(`Suggestion ${id} not found.`);
  if (!dismiss) {
    if (suggestion.kind === 'question' && !text)
      throw new Error('This suggestion asks about your experience. Answer it with --text before accepting.');
    const points = entry.sections[suggestion.section];
    const index = before ? points.findIndex((item) => item.id === before) : points.length;
    if (index < 0) throw new Error(`Point ${before} not found.`);
    points.splice(
      index,
      0,
      point(text || suggestion.text, text ? 'manual' : 'accepted-suggestion', suggestion.evidence),
    );
  }
  entry.suggestions = entry.suggestions.filter((item) => item.id !== id);
  if (!entry.dismissedSuggestions.includes(id)) entry.dismissedSuggestions.push(id);
}
export function validateAgentResponse(response, weeks) {
  if (!response || !Array.isArray(response.weeks)) throw new Error('Agent response must contain a weeks array.');
  const seen = new Set();
  return response.weeks.map((result) => {
    const week = weeks.find((week) => week.monday === result.monday);
    if (!week || seen.has(result.monday)) throw new Error('Agent returned an unknown or duplicate week.');
    seen.add(result.monday);
    if (!Array.isArray(result.suggestions) || result.suggestions.length > 100)
      throw new Error('Agent suggestions must be an array of at most 100 items per week.');
    const hashes = new Set(
      week.days.filter((day) => day.status === 'work').flatMap((day) => day.commits.map((commit) => commit.hash)),
    );
    const suggestions = result.suggestions.map((item) => {
      if (!Object.hasOwn(SECTIONS, item.section) || !['draft', 'question'].includes(item.kind))
        throw new Error('Agent returned an invalid section or suggestion kind.');
      const text = cleanText(item.text);
      if (!Array.isArray(item.evidence) || !item.evidence.every((hash) => hashes.has(hash)))
        throw new Error('Agent cited a commit outside the selected work week.');
      if (item.kind === 'draft' && item.section === 'work' && !item.evidence.length)
        throw new Error('Work drafts must cite Git evidence. Use a question when facts are missing.');
      return {
        id: `agent-${stableId(`${week.monday}:${item.section}:${text}`)}`,
        section: item.section,
        kind: item.kind,
        text,
        evidence: item.evidence,
        reason: cleanText(item.reason),
      };
    });
    return { monday: week.monday, suggestions };
  });
}
