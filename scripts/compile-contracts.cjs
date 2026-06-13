const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SRC_DIR =
  "C:\\Users\\q7594\\AppData\\Local\\hardhat-nodejs\\Cache\\compilers-v3\\windows-amd64";
const DST_DIR =
  "C:\\Users\\q7594\\AppData\\Local\\hardhat-nodejs-nodejs\\Cache\\compilers-v3\\windows-amd64";
const FILES = ["list.json", "solc-windows-amd64-v0.8.24+commit.e11b9ed9.exe"];

console.log("=== Step 1: Copy Hardhat compiler cache ===\n");

console.log(`Source directory: ${SRC_DIR}`);
console.log(`Target directory: ${DST_DIR}`);

if (!fs.existsSync(SRC_DIR)) {
  console.error(`ERROR: Source directory does not exist: ${SRC_DIR}`);
  process.exit(1);
}

fs.mkdirSync(DST_DIR, { recursive: true });
console.log("Target directory ensured.\n");

for (const file of FILES) {
  const src = path.join(SRC_DIR, file);
  const dst = path.join(DST_DIR, file);
  if (!fs.existsSync(src)) {
    console.error(`ERROR: Source file not found: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dst);
  console.log(`Copied: ${file}`);
}

console.log("\nAll files copied successfully.\n");

console.log("=== Step 2: Run Hardhat compile ===\n");

try {
  const output = execSync(
    "node node_modules/hardhat/dist/src/cli.js compile",
    {
      cwd: __dirname + "/..",
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 300000,
    }
  );
  console.log(output);
  console.log("\n=== Compilation SUCCEEDED ===");
} catch (err) {
  console.error(err.stdout || "");
  console.error(err.stderr || "");
  console.error(`\n=== Compilation FAILED (exit code ${err.status}) ===`);
  process.exit(err.status || 1);
}
