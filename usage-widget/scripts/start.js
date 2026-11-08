// Launches Electron with ELECTRON_RUN_AS_NODE cleared (VS Code terminals set it, which breaks Electron).
const { spawn } = require('child_process');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env }).on('exit', (c) => process.exit(c ?? 0));
