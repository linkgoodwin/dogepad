const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOLC = 'C:\\Users\\q7594\\AppData\\Local\\hardhat-nodejs\\Cache\\compilers-v3\\windows-amd64\\solc-windows-amd64-v0.8.24+commit.e11b9ed9.exe';
const ROOT = 'G:\\lanchpad';

function findSolFiles(dir) {
    let results = {};
    function walk(d) {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.sol')) results[full] = fs.readFileSync(full, 'utf8');
        }
    }
    walk(dir);
    return results;
}

const targetFiles = [
    path.join(ROOT, 'contracts', 'periphery', 'SimpleFactory.sol'),
    path.join(ROOT, 'contracts', 'periphery', 'SimplePair.sol'),
    path.join(ROOT, 'contracts', 'periphery', 'SimpleRouter.sol'),
];

const allSources = {};
for (const f of targetFiles) {
    allSources[f] = fs.readFileSync(f, 'utf8');
}

function resolveImport(importPath) {
    if (importPath.startsWith('@openzeppelin/')) {
        const p = path.join(ROOT, 'node_modules', importPath);
        return { contents: fs.readFileSync(p, 'utf8') };
    }
    if (importPath.startsWith('./') || importPath.startsWith('../')) {
        return { contents: fs.readFileSync(importPath, 'utf8') };
    }
    return { error: 'File not found: ' + importPath };
}

const input = {
    language: 'Solidity',
    sources: {},
    settings: {
        remappings: ['@openzeppelin/contracts=' + path.join(ROOT, 'node_modules', '@openzeppelin', 'contracts')],
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'], '': ['ast'] } },
        optimizer: { enabled: true, runs: 1 },
        viaIR: true,
    },
};

for (const [fullPath, content] of Object.entries(allSources)) {
    const rel = path.relative(ROOT, fullPath).replace(/\\/g, '/');
    input.sources[rel] = { content };
}

const output = JSON.parse(execSync(`"${SOLC}" --standard-json`, { input: JSON.stringify(input), maxBuffer: 50 * 1024 * 1024, cwd: ROOT }).toString());

if (output.errors) {
    let hasError = false;
    for (const e of output.errors) {
        console.log(e.severity + ': ' + e.message);
        if (e.severity === 'error') hasError = true;
    }
    if (hasError) process.exit(1);
}

for (const [file, contracts] of Object.entries(output.contracts || {})) {
    for (const [name, data] of Object.entries(contracts)) {
        const size = data.evm.bytecode.object.length;
        console.log(file + ':' + name + ' - OK (' + size + ' hex chars)');
    }
}
console.log('Compilation successful!');
