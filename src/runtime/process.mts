import { spawn as nodeSpawn, spawnSync as nodeSpawnSync } from 'node:child_process';

export type ProcessResult = { success: boolean; stdout: string; stderr: string };

export function runSync(command: string[], cwd: string): ProcessResult {
  if (typeof Bun !== 'undefined') {
    const result = Bun.spawnSync({ cmd: command, cwd, stdout: 'pipe', stderr: 'pipe' });
    return { success: result.success, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  }
  const result = nodeSpawnSync(command[0], command.slice(1), { cwd, encoding: 'utf8' });
  return {
    success: result.status === 0,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

export async function run(command: string[], cwd: string, input = '', timeoutMs = 180000): Promise<ProcessResult> {
  if (typeof Bun !== 'undefined') {
    const child = Bun.spawn({ cmd: command, cwd, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    if (input) child.stdin.write(input);
    child.stdin.end();
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    clearTimeout(timer);
    return { success: code === 0, stdout, stderr };
  }
  return await new Promise((resolve) => {
    const child = nodeSpawn(command[0], command.slice(1), { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk));
    child.stderr?.on('data', (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr });
    });
    child.stdin?.end(input);
  });
}
