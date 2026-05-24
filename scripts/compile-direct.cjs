const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SOLC_PATH = "C:\\Users\\q7594\\AppData\\Local\\hardhat-nodejs\\Cache\\compilers-v3\\windows-amd64\\solc-windows-amd64-v0.8.24+commit.e11b9ed9.exe";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONTRACTS_DIR = path.join(PROJECT_ROOT, "contracts");
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, "artifacts/contracts");

const remappings = [
  "@openzeppelin=" + path.join(PROJECT_ROOT, "node_modules", "@openzeppelin"),
  "prb-math=" + path.join(PROJECT_ROOT, "node_modules", "prb-math"),
];

const solFiles = [];
function findSolFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "test") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) findSolFiles(fullPath);
    else if (entry.name.endsWith(".sol")) solFiles.push(fullPath);
  }
}
findSolFiles(CONTRACTS_DIR);

const input = {
  language: "Solidity",
  sources: {},
  settings: {
    remappings: remappings.map(r => r.replace(/\\/g, "/")),
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.bytecode.linkReferences"],
      },
    },
    optimizer: {
      enabled: true,
      runs: 200,
    },
    viaIR: true,
    evmVersion: "cancun",
  },
};

for (const file of solFiles) {
  const relPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, "/");
  input.sources[relPath] = { urls: [file.replace(/\\/g, "/")] };
}

console.log("Compiling with solc 0.8.24 (Cancun)...");
console.log(`  Sources: ${solFiles.length} files`);
console.log(`  Remappings: ${remappings.join(", ")}`);

const inputJson = JSON.stringify(input);

let output;
try {
  const result = execSync(`"${SOLC_PATH}" --standard-json`, {
    input: inputJson,
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
    cwd: PROJECT_ROOT,
  });
  output = JSON.parse(result);
} catch (e) {
  console.error("Compilation failed:", e.message);
  process.exit(1);
}

if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error(`ERROR: ${err.formattedMessage}`);
    } else {
      console.warn(`WARNING: ${err.formattedMessage}`);
    }
  }
  const hasErrors = output.errors.some((e) => e.severity === "error");
  if (hasErrors) {
    console.error("\nCompilation failed with errors!");
    process.exit(1);
  }
}

let contractCount = 0;
for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  if (!sourceName.startsWith("contracts/")) continue;
  const dir = sourceName.replace(/\.sol$/, "").replace(/^contracts\//, "");
  const outDir = path.join(ARTIFACTS_DIR, dir);
  fs.mkdirSync(outDir, { recursive: true });

  for (const [contractName, contractData] of Object.entries(contracts)) {
    const artifact = {
      abi: contractData.abi,
      bytecode: contractData.evm.bytecode.object,
      deployedBytecode: "",
      linkReferences: contractData.evm.bytecode.linkReferences,
      contractName,
      sourceName,
    };

    const outPath = path.join(outDir, `${contractName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
    console.log(`  ${contractName} -> ${path.relative(PROJECT_ROOT, outPath)}`);
    contractCount++;
  }
}

const buildInfoDir = path.join(PROJECT_ROOT, "artifacts/build-info");
fs.mkdirSync(buildInfoDir, { recursive: true });
const buildInfoPath = path.join(buildInfoDir, `build-info-${Date.now()}.json`);
fs.writeFileSync(buildInfoPath, JSON.stringify({ input, output }, null, 2));

console.log(`\nCompilation successful! ${contractCount} contracts compiled.`);
