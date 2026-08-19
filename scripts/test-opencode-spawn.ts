import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const exePath = 'C:\\Users\\rodri\\AppData\\Roaming\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe';
const cmdPath = 'C:\\Users\\rodri\\AppData\\Roaming\\npm\\opencode.cmd';

console.log('Testing spawn with opencode.exe:');
try {
  const child = spawn(exePath, ['--version'], {
    shell: false,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('close', (code) => {
    console.log('opencode.exe exited with code:', code);
  });
  child.on('error', (err) => {
    console.error('opencode.exe error:', err);
  });
} catch (e) {
  console.error('Synchronous throw:', e);
}
