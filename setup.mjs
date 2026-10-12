import fs from 'node:fs';
const required = ['src/App.tsx', 'server/index.ts'];
const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) console.warn('Missing source files:', missing.join(', '));
