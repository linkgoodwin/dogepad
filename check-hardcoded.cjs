const fs = require('fs');
const path = require('path');

const pagesDir = 'G:/lanchpad/src/pages';
const componentsDir = 'G:/lanchpad/src/components';
const dirs = [pagesDir, componentsDir];

const skipPatterns = [
  /^className/, /^type=/, /^placeholder="0/, /^id=/, /^key=/, /^style=/,
  /^href=/, /^src=/, /^alt=/, /^target=/, /^rel=/, /^onClick/, /^onChange/,
  /^onSubmit/, /^disabled/, /^required/, /^autoFocus/, /^maxLength/, /^min=/, /^max=/,
  /^step=/, /^pattern=/, /^role=/, /^aria-/, /^data-/, /^tabIndex/,
  /^\./, /^#/, /^@/, /^import /, /^export /, /^const /, /^let /, /^var /,
  /^function /, /^return /, /^if /, /^else/, /^for /, /^while /, /^switch/,
  /^case /, /^break/, /^default:/, /^try /, /^catch/, /^finally/,
  /^\/\/|^\/\*|^<!--/, /^{/, /^}/, /^\(/, /^\)/, /^\[/, /^\]/,
  /^=>/, /^===/, /^!==/, /^&&/, /^\|\|/, /^==/, /^!=/,
  /^0x/, /^USDC$/, /^DEX$/, /^LP$/, /^APY$/, /^LTV$/, /^IPFS$/,
  /^UTC$/, /^DAO$/, /^DOGE$/, /^SVG$/, /^PNG$/, /^JPEG$/, /^GIF$/, /^WebP$/,
  /^npm/, /^git/, /^http/, /^https/,
];

function isUserFacingString(str) {
  str = str.trim();
  if (!str) return false;
  if (str.length <= 1) return false;
  if (/^[0-9.%$,\s]+$/.test(str)) return false;
  if (/^[A-Z_]+$/.test(str) && str.length <= 5) return false;
  if (/^0x[0-9a-fA-F]+$/.test(str)) return false;
  if (/^\$\{/.test(str)) return false;
  if (/^{\/\*/.test(str)) return false;
  if (/^\/>$/.test(str)) return false;
  if (/^<\/\w/.test(str)) return false;
  if (/^<\w/.test(str)) return false;
  return true;
}

const hardcodedStrings = [];

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) { scanDir(fp); continue; }
    if (!file.endsWith('.tsx')) continue;
    const fc = fs.readFileSync(fp, 'utf8');
    const lines = fc.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip import lines, comments, t() calls, console.log
      if (line.startsWith('import ') || line.startsWith('//') || line.startsWith('*') || line.startsWith('console.')) continue;
      if (line.includes("t('") || line.includes('t("')) continue;

      // Look for JSX text content between > and <
      const jsxTextRegex = />\s*([A-Z][a-zA-Z\s]{3,})\s*</g;
      let match;
      while ((match = jsxTextRegex.exec(line)) !== null) {
        const text = match[1].trim();
        if (isUserFacingString(text) && !/^[A-Z][a-z]+$/.test(text)) {
          hardcodedStrings.push({ file, line: i + 1, text });
        }
      }

      // Look for string literals in JSX that look like user-facing text
      const strLiteralRegex = /"([A-Z][a-zA-Z\s,!.?]{4,})"/g;
      while ((match = strLiteralRegex.exec(line)) !== null) {
        const text = match[1].trim();
        if (isUserFacingString(text)) {
          hardcodedStrings.push({ file, line: i + 1, text: '"' + text + '"' });
        }
      }
    }
  }
}

dirs.forEach(scanDir);

// Filter out known technical strings
const technicalStrings = [
  'Arc Testnet', 'DogePad', 'Uniswap', 'GitHub', 'Twitter', 'Telegram', 'Discord',
  'MetaMask', 'WalletConnect', 'Coinbase', 'Ethereum', 'BNB Chain',
];

const filtered = hardcodedStrings.filter(h => {
  return !technicalStrings.some(ts => h.text.includes(ts));
});

if (filtered.length) {
  console.log('Potential hardcoded user-facing strings found:');
  filtered.forEach(h => console.log('  ' + h.file + ':' + h.line + ' => ' + h.text));
} else {
  console.log('No obvious hardcoded user-facing strings found!');
}
console.log('\n(Ran with relaxed filters - some false positives possible)');
