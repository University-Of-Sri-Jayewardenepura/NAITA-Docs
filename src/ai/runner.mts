import { run } from '../runtime/process.mts';

export async function runAgent(options, prompt, workspace) {
  if (options.agent && !['codex', 'claude'].includes(options.agent))
    throw new Error('--agent must be codex or claude.');
  if (options.agent && options['agent-command']) throw new Error('Choose --agent or --agent-command, not both.');
  const custom = options['agent-command'];
  const executable = custom || options.agent;
  if (!executable) throw new Error('Choose an agent or import its suggestions with --from FILE.');
  const args = custom
    ? ['sh', '-c', custom]
    : options.agent === 'codex'
      ? ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '-']
      : ['-p'];
  const result = await run(custom ? args : [executable, ...args], workspace, prompt, 180000);
  if (!result.success) throw new Error(`Writing agent failed: ${result.stderr.slice(-10000) || 'process failed'}`);
  if (result.stdout.length > 5 * 1024 * 1024) throw new Error('Agent response exceeded 5 MB.');
  try {
    const text = result.stdout
      .trim()
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '');
    return JSON.parse(text);
  } catch {
    throw new Error('Writing agent must return a JSON object without extra commentary.');
  }
}
