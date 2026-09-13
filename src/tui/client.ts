import { fileURLToPath } from 'node:url';

export type CommandRunner = (command: string, options?: Record<string, string | boolean>) => Promise<any>;

export function cliClient(workspace: string): CommandRunner {
  return (command, options = {}) =>
    new Promise((accept, reject) => {
      const args = [fileURLToPath(new URL('../cli.mts', import.meta.url)), command, '--workspace', workspace, '--json'];
      for (const [key, value] of Object.entries(options)) {
        if (value === false) continue;
        args.push(`--${key}`);
        if (typeof value !== 'boolean') args.push(value);
      }
      const child = Bun.spawn(['bun', 'run', ...args], { stdout: 'pipe', stderr: 'pipe' });
      Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
        .then(([stdout, stderr, code]) => {
          if (code !== 0) return reject(new Error(stderr.trim() || `Command exited with ${code}`));
          try {
            accept(JSON.parse(stdout));
          } catch {
            reject(new Error('The CLI returned an unreadable response.'));
          }
        })
        .catch(reject);
    });
}
