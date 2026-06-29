import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying with account:", deployer.address)
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH")

  // === Existing contract addresses (from .env) ===
  const FEE_DISTRIBUTOR = "0x447ac9048637f8A0a3f30E1b29Cf84cFBc62e5b0"
  const DEX_ROUTER = "0x307E97e90025e5924FD00CD5Af005AC18333a669"
  const BASE_ASSET = "0x911b4000D3422F482F4062a3f30E1b29Cf84cFBc62e5b0"
  const DEX_LISTER = "0x500D1773506284D2a951B2B218151b32D118dFC8"

  console.log("\n=== Deploying BondingCurve (v12) ===")
  const BondingCurve = await ethers.getContractFactory("BondingCurve")
  const bondingCurve = await BondingCurve.deploy(
    DEX_ROUTER,      // _r: dexRouter
    FEE_DISTRIBUTOR, // _f: feeDist
    false,           // _x: isXylo (false = use Uniswap-style router)
    BASE_ASSET       // _b: baseAsset (wusdc)
  )
  await bondingCurve.waitForDeployment()
  const bcAddr = await bondingCurve.getAddress()
  console.log("BondingCurve deployed to:", bcAddr)

  console.log("\n=== Deploying LaunchDAO (v12) ===")
  const LaunchDAO = await ethers.getContractFactory("LaunchDAO")
  const launchDAO = await LaunchDAO.deploy(
    bcAddr,          // _bondingCurve
    FEE_DISTRIBUTOR  // _feeDistributor
  )
  await launchDAO.waitForDeployment()
  const daoAddr = await launchDAO.getAddress()
  console.log("LaunchDAO deployed to:", daoAddr)

  console.log("\n=== Deploying DailyCheckin (v12) ===")
  const DailyCheckin = await ethers.getContractFactory("DailyCheckin")
  const dailyCheckin = await DailyCheckin.deploy()
  await dailyCheckin.waitForDeployment()
  const checkinAddr = await dailyCheckin.getAddress()
  console.log("DailyCheckin deployed to:", checkinAddr)

  console.log("\n=== Post-deployment configuration ===")

  // 1. Set LaunchDAO address in BondingCurve
  console.log("Setting launchDao in BondingCurve...")
  await (await bondingCurve.setLaunchDao(daoAddr)).wait()
  console.log("  Done")

  // 2. Set DexLister in BondingCurve
  console.log("Setting dexLister in BondingCurve...")
  await (await bondingCurve.setDexLister(DEX_LISTER)).wait()
  console.log("  Done")

  // 3. Set launchThreshold to 20 USDC (testnet)
  console.log("Setting launchThreshold to 20 ether (testnet)...")
  await (await launchDAO.setLaunchThreshold(ethers.parseEther("20"))).wait()
  console.log("  Done")

  // 4. Set minSubThreshold to 3 USDC (testnet)
  console.log("Setting minSubThreshold to 3 ether (testnet)...")
  await (await launchDAO.setMinSubThreshold(ethers.parseEther("3"))).wait()
  console.log("  Done")

  // 5. Set minWallets to 3 (testnet)
  console.log("Setting minWallets to 3 (testnet)...")
  await (await launchDAO.setMinWallets(3)).wait()
  console.log("  Done")

  // 6. Set minSubscribeUsdc to 1 USDC (testnet)
  console.log("Setting minSubscribeUsdc to 1 ether (testnet)...")
  await (await launchDAO.setMinSubscribeUsdc(ethers.parseEther("1"))).wait()
  console.log("  Done")

  console.log("\n=== Deployment Summary ===")
  console.log(JSON.stringify({
    bondingCurve: bcAddr,
    launchDAO: daoAddr,
    dailyCheckin: checkinAddr,
    dexLister: DEX_LISTER,
    feeDistributor: FEE_DISTRIBUTOR,
  }, null, 2))

  console.log("\n=== Update .env and contracts.ts with these addresses ===")
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
