// Deploy v12 contracts using ethers v5 directly
const { ethers } = require("ethers")
const fs = require("fs")
const path = require("path")

// Load .env from project root
const envPath = path.resolve(__dirname, "../../../.env")
const envContent = fs.readFileSync(envPath, "utf8")
const env = {}
envContent.split("\n").forEach(line => {
  line = line.trim()
  if (!line || line.startsWith("#")) return
  const idx = line.indexOf("=")
  if (idx > 0) {
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
})

const RPC = env.ARC_RPC || "https://rpc.testnet.arc.network"
const PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY
const CHAIN_ID = 5042002

if (!PRIVATE_KEY) {
  console.error("DEPLOYER_PRIVATE_KEY not found in .env")
  process.exit(1)
}

// Existing contract addresses
const FEE_DISTRIBUTOR = "0x447ac9048637f8A0a3f30E1b29Cf84cFBc62e5b0"
const DEX_ROUTER = "0x307E97e90025e5924FD00CD5Af005AC18333a669"
const BASE_ASSET = "0x911b4000D3422F482F4062a913885f7b035382Df"
const DEX_LISTER = "0x500D1773506284D2a951B2B218151b32D118dFC8"

// Load compiled contract artifacts
const artifactsDir = path.resolve(__dirname, "../../../artifacts/contracts")
function loadArtifact(contractPath) {
  const fullPath = path.join(artifactsDir, contractPath + ".json")
  return JSON.parse(fs.readFileSync(fullPath, "utf8"))
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

  console.log("Deploying with account:", wallet.address)
  console.log("Balance:", ethers.utils.formatEther(await provider.getBalance(wallet.address)), "ETH")
  const network = await provider.getNetwork()
  console.log("Chain ID:", network.chainId.toString())

  // Load artifacts
  const bcArtifact = loadArtifact("core/BondingCurve.sol/BondingCurve")
  const daoArtifact = loadArtifact("dao/LaunchDAO.sol/LaunchDAO")
  const checkinArtifact = loadArtifact("periphery/DailyCheckin.sol/DailyCheckin")

  // === 1. Deploy BondingCurve ===
  console.log("\n=== Deploying BondingCurve (v12) ===")
  const bcFactory = new ethers.ContractFactory(bcArtifact.abi, bcArtifact.bytecode, wallet)
  const bondingCurve = await bcFactory.deploy(
    DEX_ROUTER,      // _r: dexRouter
    FEE_DISTRIBUTOR, // _f: feeDist
    false,           // _x: isXylo
    BASE_ASSET       // _b: baseAsset
  )
  await bondingCurve.deployed()
  const bcAddr = bondingCurve.address
  console.log("BondingCurve deployed to:", bcAddr)

  // === 2. Deploy LaunchDAO ===
  console.log("\n=== Deploying LaunchDAO (v12) ===")
  const daoFactory = new ethers.ContractFactory(daoArtifact.abi, daoArtifact.bytecode, wallet)
  const launchDAO = await daoFactory.deploy(
    bcAddr,          // _bondingCurve
    FEE_DISTRIBUTOR  // _feeDistributor
  )
  await launchDAO.deployed()
  const daoAddr = launchDAO.address
  console.log("LaunchDAO deployed to:", daoAddr)

  // === 3. Deploy DailyCheckin ===
  console.log("\n=== Deploying DailyCheckin (v12) ===")
  const checkinFactory = new ethers.ContractFactory(checkinArtifact.abi, checkinArtifact.bytecode, wallet)
  const dailyCheckin = await checkinFactory.deploy()
  await dailyCheckin.deployed()
  const checkinAddr = dailyCheckin.address
  console.log("DailyCheckin deployed to:", checkinAddr)

  // === Post-deployment configuration ===
  console.log("\n=== Post-deployment configuration ===")

  // 1. Set LaunchDAO address in BondingCurve
  console.log("Setting launchDao in BondingCurve...")
  const tx1 = await bondingCurve.setLaunchDao(daoAddr)
  await tx1.wait()
  console.log("  Done:", tx1.hash)

  // 2. Set DexLister in BondingCurve
  console.log("Setting dexLister in BondingCurve...")
  const tx2 = await bondingCurve.setDexLister(DEX_LISTER)
  await tx2.wait()
  console.log("  Done:", tx2.hash)

  // 3. Set launchThreshold to 20 USDC (testnet)
  console.log("Setting launchThreshold to 20 ether (testnet)...")
  const tx3 = await launchDAO.setLaunchThreshold(ethers.utils.parseEther("20"))
  await tx3.wait()
  console.log("  Done:", tx3.hash)

  // 4. Set minSubThreshold to 3 USDC (testnet)
  console.log("Setting minSubThreshold to 3 ether (testnet)...")
  const tx4 = await launchDAO.setMinSubThreshold(ethers.utils.parseEther("3"))
  await tx4.wait()
  console.log("  Done:", tx4.hash)

  // 5. Set minWallets to 3 (testnet)
  console.log("Setting minWallets to 3 (testnet)...")
  const tx5 = await launchDAO.setMinWallets(3)
  await tx5.wait()
  console.log("  Done:", tx5.hash)

  // 6. Set minSubscribeUsdc to 1 USDC (testnet)
  console.log("Setting minSubscribeUsdc to 1 ether (testnet)...")
  const tx6 = await launchDAO.setMinSubscribeUsdc(ethers.utils.parseEther("1"))
  await tx6.wait()
  console.log("  Done:", tx6.hash)

  console.log("\n=== Deployment Summary ===")
  console.log(JSON.stringify({
    bondingCurve: bcAddr,
    launchDAO: daoAddr,
    dailyCheckin: checkinAddr,
  }, null, 2))

  console.log("\n=== Update .env with these addresses ===")
  console.log(`VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=${bcAddr}`)
  console.log(`VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${daoAddr}`)
  console.log(`VITE_ARC_TESTNET_DAILY_CHECKIN_ADDRESS=${checkinAddr}`)

  console.log("\n=== GitHub Secrets to update ===")
  console.log(`VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS = ${bcAddr}`)
  console.log(`VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS = ${daoAddr}`)
  console.log(`VITE_ARC_TESTNET_DAILY_CHECKIN_ADDRESS = ${checkinAddr}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
