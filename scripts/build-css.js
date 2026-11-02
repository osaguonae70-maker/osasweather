'use strict';
// Builds the two static CSS bundles each app needs. Run: npm run build:css
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sass = require('sass');

const root = path.join(__dirname, '..');
const apps = ['weather-app', 'admin-app'];

// 1. Bootstrap subset (compiled once, copied into both apps so each deploys alone).
const bs = sass.compile(path.join(__dirname, 'bootstrap-subset.scss'), {
  loadPaths: [path.join(root, 'node_modules')], style: 'compressed', quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'mixed-decls'],
}).css;

for (const app of apps) {
  const out = path.join(root, app, 'assets', 'css');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'bootstrap.min.css'), bs);

  // 2. Tailwind (prefix `tw-`, preflight off so it can never fight Bootstrap's reboot).
  fs.writeFileSync(path.join(root, app, '.tailwind-input.css'), '@tailwind base;\n@tailwind utilities;\n');
  execFileSync(path.join(root, 'node_modules', '.bin', 'tailwindcss'), [
    '-c', path.join(root, app, 'tailwind.config.js'),
    '-i', path.join(root, app, '.tailwind-input.css'),
    '-o', path.join(out, 'tailwind.min.css'), '--minify',
  ], { stdio: 'inherit', cwd: path.join(root, app) });
  fs.unlinkSync(path.join(root, app, '.tailwind-input.css'));
  console.log(`${app}: bootstrap ${(bs.length / 1024).toFixed(0)} KB, tailwind ${(fs.statSync(path.join(out, 'tailwind.min.css')).size / 1024).toFixed(1)} KB`);
}
