import { ethers } from "hardhat"

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log("Deploying contracts with account:", deployer.address)
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB")

  console.log("\n--- Phase 1: Core Infrastructure ---\n")

  console.log("1. Deploying PriceOracle...")
  const PriceOracle = await ethers.getContractFactory("PriceOracle")
  const priceOracle = await PriceOracle.deploy()
  await priceOracle.waitForDeployment()
  const priceOracleAddr = await priceOracle.getAddress()
  console.log("   PriceOracle deployed to:", priceOracleAddr)

  console.log("2. Deploying InterestRateModel...")
  const InterestRateModel = await ethers.getContractFactory("InterestRateModel")
  const interestRateModel = await InterestRateModel.deploy(
    ethers.parseEther("0.02"),
    ethers.parseEther("0.04"),
    ethers.parseEther("0.75"),
    ethers.parseEther("10")
  )
  await interestRateModel.waitForDeployment()
  const interestRateModelAddr = await interestRateModel.getAddress()
  console.log("   InterestRateModel deployed to:", interestRateModelAddr)

  console.log("3. Deploying FeeDistributor...")
  const FeeDistributor = await ethers.getContractFactory("FeeDistributor")
  const feeDistributor = await FeeDistributor.deploy(deployer.address)
  await feeDistributor.waitForDeployment()
  const feeDistributorAddr = await feeDistributor.getAddress()
  console.log("   FeeDistributor deployed to:", feeDistributorAddr)

  console.log("4. Deploying CreatorVesting...")
  const CreatorVesting = await ethers.getContractFactory("CreatorVesting")
  const creatorVesting = await CreatorVesting.deploy()
  await creatorVesting.waitForDeployment()
  const creatorVestingAddr = await creatorVesting.getAddress()
  console.log("   CreatorVesting deployed to:", creatorVestingAddr)

  console.log("5. Deploying LPLockManager...")
  const LPLockManager = await ethers.getContractFactory("LPLockManager")
  const lpLockManager = await LPLockManager.deploy()
  await lpLockManager.waitForDeployment()
  const lpLockManagerAddr = await lpLockManager.getAddress()
  console.log("   LPLockManager deployed to:", lpLockManagerAddr)

  console.log("\n--- Phase 2: Bonding Curve System ---\n")

  console.log("6. Deploying AntiSniperGuard...")
  const AntiSniperGuard = await ethers.getContractFactory("AntiSniperGuard")
  const antiSniperGuard = await AntiSniperGuard.deploy()
  await antiSniperGuard.waitForDeployment()
  const antiSniperGuardAddr = await antiSniperGuard.getAddress()
  console.log("   AntiSniperGuard deployed to:", antiSniperGuardAddr)

  console.log("7. Deploying BondingCurveFactory...")
  const BondingCurveFactory = await ethers.getContractFactory("BondingCurveFactory")
  const factory = await BondingCurveFactory.deploy(
    feeDistributorAddr,
    lpLockManagerAddr,
    antiSniperGuardAddr,
    creatorVestingAddr,
    ethers.parseEther("0.1"),
    ethers.parseEther("30")
  )
  await factory.waitForDeployment()
  const factoryAddr = await factory.getAddress()
  console.log("   BondingCurveFactory deployed to:", factoryAddr)

  console.log("\n--- Phase 3: Lending Protocol ---\n")

  console.log("8. Deploying LendingPool...")
  const LendingPool = await ethers.getContractFactory("LendingPool")
  const lendingPool = await LendingPool.deploy(
    priceOracleAddr,
    interestRateModelAddr,
    feeDistributorAddr
  )
  await lendingPool.waitForDeployment()
  const lendingPoolAddr = await lendingPool.getAddress()
  console.log("   LendingPool deployed to:", lendingPoolAddr)

  console.log("9. Deploying LiquidationManager...")
  const LiquidationManager = await ethers.getContractFactory("LiquidationManager")
  const liquidationManager = await LiquidationManager.deploy(
    lendingPoolAddr,
    priceOracleAddr,
    500
  )
  await liquidationManager.waitForDeployment()
  const liquidationManagerAddr = await liquidationManager.getAddress()
  console.log("   LiquidationManager deployed to:", liquidationManagerAddr)

  console.log("\n--- Phase 4: Configuration ---\n")

  console.log("10. Setting up LendingPool liquidation manager...")
  await lendingPool.setLiquidationManager(liquidationManagerAddr)
  console.log("    Done")

  console.log("\n=== Deployment Complete ===\n")

  const deployedAddresses = {
    priceOracle: priceOracleAddr,
    interestRateModel: interestRateModelAddr,
    feeDistributor: feeDistributorAddr,
    creatorVesting: creatorVestingAddr,
    lpLockManager: lpLockManagerAddr,
    antiSniperGuard: antiSniperGuardAddr,
    bondingCurveFactory: factoryAddr,
    lendingPool: lendingPoolAddr,
    liquidationManager: liquidationManagerAddr,
  }

  console.log("Deployed Addresses:")
  console.log(JSON.stringify(deployedAddresses, null, 2))

  console.log("\n⚠️  Remember to update .env.production with these addresses!")
  console.log("⚠️  Remember to transfer ownership to Gnosis Safe multisig!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
