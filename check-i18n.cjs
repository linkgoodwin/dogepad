const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('G:/lanchpad/src/i18n/translations.ts', 'utf8');
const zhMatch = content.match(/zhTranslations[^{]*\{([\s\S]*?)\n\}/);
const keyRegex = /^\s*'([^']+)':/gm;
const validKeys = new Set();
let m;
while ((m = keyRegex.exec(zhMatch[1])) !== null) validKeys.add(m[1]);

const pagesDir = 'G:/lanchpad/src/pages';
const componentsDir = 'G:/lanchpad/src/components';
const dirs = [pagesDir, componentsDir];

let missingKeys = [];
let dynamicKeys = [];
let totalCalls = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) { scanDir(fp); continue; }
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
    const fc = fs.readFileSync(fp, 'utf8');
    const localRegex = /t\(\s*'([^']+)'/g;
    let match;
    while ((match = localRegex.exec(fc)) !== null) {
      totalCalls++;
      if (!validKeys.has(match[1])) {
        missingKeys.push({ file: file, key: match[1] });
      }
    }
    const dynRegex = /t\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)\s*\)/g;
    while ((match = dynRegex.exec(fc)) !== null) {
      dynamicKeys.push({ file: file, key: match[1] });
    }
  }
}

dirs.forEach(scanDir);

console.log('Total t() calls with static keys:', totalCalls);
if (missingKeys.length) {
  console.log('\nMISSING translation keys:');
  missingKeys.forEach(k => console.log('  ' + k.file + ': ' + k.key));
} else {
  console.log('All static t() keys exist in translations!');
}

if (dynamicKeys.length) {
  console.log('\nDynamic key references (need manual verification):');
  const unique = [...new Set(dynamicKeys.map(k => k.key))];
  unique.forEach(k => console.log('  ' + k));
}
