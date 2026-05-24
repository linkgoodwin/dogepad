const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SOLC_PATH = "C:\\Users\\q7594\\AppData\\Local\\hardhat-nodejs\\Cache\\compilers-v3\\windows-amd64\\solc-windows-amd64-v0.8.24+commit.e11b9ed9.exe";
const CONTRACTS_DIR = path.resolve(__dirname, "contracts");
const ARTIFACTS_DIR = path.resolve(__dirname, "artifacts/contracts");

const sources = {};

function walkDir(dir, baseDir = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = baseDir ? `${baseDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkDir(fullPath, relPath);
    } else if (entry.name.endsWith(".sol")) {
      sources[relPath] = { content: fs.readFileSync(fullPath, "utf8") };
    }
  }
}

walkDir(CONTRACTS_DIR);

const input = {
  language: "Solidity",
  sources,
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.bytecode.linkReferences"],
      },
    },
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
};

console.log("Compiling with solc 0.8.24...");
const inputJson = JSON.stringify(input);

let output;
try {
  const result = execSync(`"${SOLC_PATH}" --standard-json`, {
    input: inputJson,
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
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

for (const [sourceName, contracts] of Object.entries(output.contracts)) {
  const dir = sourceName.replace(/\.sol$/, "");
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
    console.log(`  ${contractName} -> ${outPath}`);
  }
}

const buildInfoDir = path.resolve(__dirname, "artifacts/build-info");
fs.mkdirSync(buildInfoDir, { recursive: true });
const buildInfoPath = path.join(buildInfoDir, `build-info-${Date.now()}.json`);
fs.writeFileSync(buildInfoPath, JSON.stringify({ input, output }, null, 2));

console.log("\nCompilation successful!");
