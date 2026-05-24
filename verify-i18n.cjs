const fs = require('fs');
const path = require('path');

const translationsPath = path.join(__dirname, 'src/i18n/translations.ts');
const content = fs.readFileSync(translationsPath, 'utf-8');

function extractKeys(objStr) {
  const keys = [];
  const regex = /^\s*'([^']+)':/gm;
  let match;
  while ((match = regex.exec(objStr)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

const zhMatch = content.match(/export const zhTranslations[^=]*=\s*\{([\s\S]*?)\n\}/);
const enMatch = content.match(/export const enTranslations[^=]*=\s*\{([\s\S]*?)\n\}/);

if (!zhMatch || !enMatch) {
  console.log('ERROR: Could not parse translations');
  process.exit(1);
}

const zhKeys = extractKeys(zhMatch[1]);
const enKeys = extractKeys(enMatch[1]);

console.log(`=== Key Symmetry Check ===`);
console.log(`ZH keys: ${zhKeys.length}`);
console.log(`EN keys: ${enKeys.length}`);

const zhSet = new Set(zhKeys);
const enSet = new Set(enKeys);

const missingInEn = zhKeys.filter(k => !enSet.has(k));
const missingInZh = enKeys.filter(k => !zhSet.has(k));

if (missingInEn.length > 0) {
  console.log(`\n❌ Keys in ZH but missing in EN (${missingInEn.length}):`);
  missingInEn.forEach(k => console.log(`  - ${k}`));
}
if (missingInZh.length > 0) {
  console.log(`\n❌ Keys in EN but missing in ZH (${missingInZh.length}):`);
  missingInZh.forEach(k => console.log(`  - ${k}`));
}
if (missingInEn.length === 0 && missingInZh.length === 0) {
  console.log(`✅ ZH and EN keys are perfectly symmetric!`);
}

const allKeys = new Set([...zhKeys, ...enKeys]);

console.log(`\n=== t() Call Verification ===`);

function findTsxFiles(dir) {
  let results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist') {
      results = results.concat(findTsxFiles(fullPath));
    } else if (item.isFile() && (item.name.endsWith('.tsx') || item.name.endsWith('.ts'))) {
      if (!item.name.includes('translations.ts') && !item.name.includes('useT.ts') && !item.name.includes('i18nStore')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const srcDir = path.join(__dirname, 'src');
const tsxFiles = findTsxFiles(srcDir);

const staticKeyRegex = /\bt\(\s*'([^']+)'/g;
const staticKeyRegex2 = /\bt\(\s*"([^"]+)"/g;
const dynamicKeyRegex = /\bt\(\s*([a-zA-Z_$][\w.$]*)/g;

let totalStaticCalls = 0;
let invalidKeys = [];
let dynamicKeyRefs = new Set();

for (const file of tsxFiles) {
  const fileContent = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file);

  let match;
  staticKeyRegex.lastIndex = 0;
  while ((match = staticKeyRegex.exec(fileContent)) !== null) {
    totalStaticCalls++;
    if (!allKeys.has(match[1])) {
      invalidKeys.push({ file: relPath, key: match[1] });
    }
  }

  staticKeyRegex2.lastIndex = 0;
  while ((match = staticKeyRegex2.exec(fileContent)) !== null) {
    totalStaticCalls++;
    if (!allKeys.has(match[1])) {
      invalidKeys.push({ file: relPath, key: match[1] });
    }
  }

  dynamicKeyRegex.lastIndex = 0;
  while ((match = dynamicKeyRegex.exec(fileContent)) !== null) {
    const ref = match[1];
    if (ref !== 't' && !ref.startsWith('t(') && ref !== 'translate') {
      dynamicKeyRefs.add(ref);
    }
  }
}

console.log(`Static t() calls found: ${totalStaticCalls}`);
if (invalidKeys.length > 0) {
  console.log(`\n❌ Invalid keys in t() calls (${invalidKeys.length}):`);
  invalidKeys.forEach(({ file, key }) => console.log(`  - ${key} in ${file}`));
} else {
  console.log(`✅ All static t() call keys are valid!`);
}

console.log(`\n=== Dynamic Key Reference Verification ===`);
console.log(`Dynamic key references found: ${dynamicKeyRefs.size}`);

const knownDynamicKeyMaps = {
  'tier.labelKey': ['create.tier3Days', 'create.tier7Days', 'create.tier30Days'],
  'tier.descKey': ['create.tier3Desc', 'create.tier7Desc', 'create.tier30Desc'],
  'statusInfo.labelKey': ['dao.activeTab', 'dao.queuedBadge', 'dao.statusExpired', 'dao.graceTab', 'dao.statusRecyclable', 'dao.launched'],
  'd.label': ['dao.stakeDurationFlexible', 'dao.stakeDuration30d', 'dao.stakeDuration90d', 'dao.stakeDuration180d'],
};

let dynamicKeyIssues = [];
for (const [ref, validKeys] of Object.entries(knownDynamicKeyMaps)) {
  for (const key of validKeys) {
    if (!allKeys.has(key)) {
      dynamicKeyIssues.push(`  - ${ref} value "${key}" not found in translations`);
    }
  }
}

if (dynamicKeyIssues.length > 0) {
  console.log(`❌ Dynamic key issues:`);
  dynamicKeyIssues.forEach(i => console.log(i));
} else {
  console.log(`✅ All known dynamic key values are valid!`);
}

console.log(`\n=== Hardcoded String Scan ===`);

const hardcodedPatterns = [
  { regex: /"[A-Z][a-z]+ [a-z]+[^"]*"/g, desc: 'Quoted multi-word English strings' },
];

let hardcodedIssues = [];

const filesToScan = tsxFiles.filter(f => !f.includes('translations.ts') && !f.includes('useT.ts'));

for (const file of filesToScan) {
  const fileContent = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(__dirname, file);
  const lines = fileContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('import ') || line.includes('console.') || line.includes('//') || line.includes('className') || line.includes('type ') || line.includes('interface ') || line.includes('function ') || line.includes('const ') || line.includes('args:') || line.includes('functionName:') || line.includes('abi:') || line.includes('address:')) continue;

    const titleMatch = line.match(/title="([A-Z][^"]+)"/);
    if (titleMatch && !titleMatch[1].includes('{') && titleMatch[1].length > 2) {
      hardcodedIssues.push(`  - ${relPath}:${i+1} title="${titleMatch[1]}"`);
    }

    const placeholderMatch = line.match(/placeholder="([A-Z][^"]+)"/);
    if (placeholderMatch && placeholderMatch[1].length > 3) {
      hardcodedIssues.push(`  - ${relPath}:${i+1} placeholder="${placeholderMatch[1]}"`);
    }
  }
}

if (hardcodedIssues.length > 0) {
  console.log(`⚠️ Potential hardcoded strings (${hardcodedIssues.length}):`);
  hardcodedIssues.forEach(i => console.log(i));
} else {
  console.log(`✅ No obvious hardcoded strings found!`);
}

console.log(`\n=== Import/Hook Usage Check ===`);

const filesUsingI18n = [
  'src/pages/Dashboard.tsx',
  'src/pages/Home.tsx',
  'src/pages/TokenDetail.tsx',
  'src/pages/Portfolio.tsx',
  'src/pages/DaoVote.tsx',
  'src/pages/LendMarket.tsx',
  'src/pages/LendDetail.tsx',
  'src/pages/CreateToken.tsx',
  'src/pages/HowToPlay.tsx',
  'src/components/CopyableAddress.tsx',
  'src/components/TokenCard.tsx',
  'src/components/WalletButton.tsx',
  'src/components/ErrorBoundary.tsx',
];

let importIssues = [];

for (const relFile of filesUsingI18n) {
  const fullPath = path.join(__dirname, relFile);
  if (!fs.existsSync(fullPath)) continue;
  const fileContent = fs.readFileSync(fullPath, 'utf-8');

  if (relFile.includes('ErrorBoundary')) {
    if (!fileContent.includes("useI18n") || !fileContent.includes("translate")) {
      importIssues.push(`  - ${relFile}: Missing useI18n/translate import`);
    }
  } else {
    if (!fileContent.includes("useT")) {
      importIssues.push(`  - ${relFile}: Missing useT import`);
    }
    const hasTUsage = fileContent.includes("t('") || fileContent.includes('t("');
    if (!hasTUsage && !relFile.includes('ErrorBoundary')) {
      importIssues.push(`  - ${relFile}: useT imported but t() not used`);
    }
  }
}

if (importIssues.length > 0) {
  console.log(`❌ Import/hook issues:`);
  importIssues.forEach(i => console.log(i));
} else {
  console.log(`✅ All files have proper i18n imports and usage!`);
}

console.log(`\n=== Summary ===`);
const hasErrors = missingInEn.length > 0 || missingInZh.length > 0 || invalidKeys.length > 0 || dynamicKeyIssues.length > 0 || importIssues.length > 0;
if (hasErrors) {
  console.log(`❌ Issues found - please fix above errors`);
  process.exit(1);
} else {
  console.log(`✅ All i18n checks passed!`);
  process.exit(0);
}
