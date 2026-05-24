const fs = require('fs');

const content = fs.readFileSync('G:/lanchpad/src/i18n/translations.ts', 'utf8');
const zhMatch = content.match(/zhTranslations[^{]*\{([\s\S]*?)\n\}/);
const keyRegex = /^\s*'([^']+)':/gm;
const validKeys = new Set();
let m;
while ((m = keyRegex.exec(zhMatch[1])) !== null) validKeys.add(m[1]);

const dynamicKeysUsed = [
  'create.tier3Days', 'create.tier7Days', 'create.tier30Days',
  'create.tier3Desc', 'create.tier7Desc', 'create.tier30Desc',
  'dao.activeTab', 'dao.queuedBadge', 'dao.statusExpired', 'dao.graceTab', 'dao.statusRecyclable', 'dao.launched',
  'portfolio.unknown',
  'guide.flow1Title', 'guide.flow1Desc',
  'guide.flow2Title', 'guide.flow2Desc',
  'guide.flow3Title', 'guide.flow3Desc',
  'guide.flow4Title', 'guide.flow4Desc',
  'guide.flow5Title', 'guide.flow5Desc',
  'guide.flow6Title', 'guide.flow6Desc',
];

let allGood = true;
for (const key of dynamicKeysUsed) {
  if (!validKeys.has(key)) {
    console.log('MISSING dynamic key: ' + key);
    allGood = false;
  }
}

if (allGood) {
  console.log('All dynamic key references are valid! (' + dynamicKeysUsed.length + ' keys checked)');
}
