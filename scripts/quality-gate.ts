import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoPath = process.argv[2];

if (!repoPath) {
  console.error('Usage: npx tsx scripts/quality-gate.ts <repoPath>');
  process.exit(1);
}

// Helper to find package.json in current or 1 level down
function findPackageJson(basePath: string): string | null {
  const directPath = path.join(basePath, 'package.json');
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    const children = fs.readdirSync(basePath);
    for (const child of children) {
      const childPath = path.join(basePath, child);
      if (fs.statSync(childPath).isDirectory()) {
        const nestedPath = path.join(childPath, 'package.json');
        if (fs.existsSync(nestedPath)) {
          return nestedPath;
        }
      }
    }
  }
  
  return null;
}

const packageJsonPath = findPackageJson(repoPath);

if (!packageJsonPath) {
  console.log('N/A: proyecto sin package.json');
  process.exit(0);
}

const projectDir = path.dirname(packageJsonPath);
const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const scripts = packageData.scripts || {};

const steps = ['build', 'typecheck', 'lint', 'test'];
let hasError = false;

for (const step of steps) {
  if (!scripts[step]) {
    console.log(`skip: sin script ${step}`);
    continue;
  }
  
  console.log(`🏃 Running: npm run ${step}...`);
  const result = spawnSync('npm', ['run', step], {
    cwd: projectDir,
    stdio: 'inherit',
    shell: true,
  });
  
  if (result.status !== 0) {
    console.error(`❌ FAILED: npm run ${step}`);
    hasError = true;
    break; // Cortar si un script existente falla
  } else {
    console.log(`✅ OK: npm run ${step}`);
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('🎉 Quality gate passed.');
  process.exit(0);
}
