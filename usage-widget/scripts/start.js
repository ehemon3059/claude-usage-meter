// Launches Electron with ELECTRON_RUN_AS_NODE cleared (VS Code terminals set it, which breaks Electron).
// Usage: node scripts/start.js [entry.js]   (default entry: the app folder)
const { spawn } = require('child_process');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.length > 2 ? process.argv.slice(2) : ['.'];
spawn(electron, args, { stdio: 'inherit', env }).on('exit', (c) => process.exit(c ?? 0));
