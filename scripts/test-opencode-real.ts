import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const bin = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
const configPath = path.resolve('configs', 'agent-opencode.json');
const model = 'opencode/deepseek-v4-flash-free';

console.log('Bin:', bin);
console.log('Config:', configPath);

const env = {
  ...process.env,
  OPENCODE_CONFIG: configPath,
  OPENCODE_DISABLE_AUTOUPDATE: '1',
};

const args = ['run', 'Escribi hola mundo en un archivo test.txt', '--model', model];

console.log('Spawning opencode with args:', args);

const child = spawn(bin, args, {
  cwd: path.resolve('temp-repos'),
  env,
  shell: false,
  stdio: 'inherit',
});

child.on('close', (code, signal) => {
  console.log(`OpenCode finished with code: ${code}, signal: ${signal}`);
});

child.on('error', (err) => {
  console.error('Spawn error:', err);
});
