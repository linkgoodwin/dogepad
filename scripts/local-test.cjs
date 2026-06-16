/**
 * local-test.cjs
 *
 * DogePad 本地网络端到端测试脚本
 * 使用 Hardhat 内置网络模拟完整的代币发射流程，验证多维发射阈值。
 *
 * 使用方法 (Hardhat 3, edr-simulated 网络):
 *   npx hardhat run scripts/local-test.cjs
 *
 * 如果需要使用独立节点:
 *   1. 先在 hardhat.config.ts 中添加 localhost 网络
 *   2. 启动节点: npx hardhat node
 *   3. 运行脚本: npx hardhat run scripts/local-test.cjs --network localhost
 */

const { ethers } = require("hardhat");

// ============================================================
// ANSI 颜色
// ============================================================
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function logGreen(msg) {
  console.log(`${GREEN}${msg}${RESET}`);
}
function logRed(msg) {
  console.log(`${RED}${msg}${RESET}`);
}
function logYellow(msg) {
  console.log(`${YELLOW}${msg}${RESET}`);
}
function logCyan(msg) {
  console.log(`${CYAN}${msg}${RESET}`);
}
function logBold(msg) {
  console.log(`${BOLD}${msg}${RESET}`);
}
function logSection(msg) {
  console.log(`\n${BOLD}${CYAN}========== ${msg} ==========${RESET}`);
}

// ============================================================
// Mock USDC 合约 (内联 Solidity)
// ============================================================
const MOCK_USDC_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("MockUSDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
`;

// ============================================================
// 主测试流程
// ============================================================
async function main() {
  logBold("DogePad 本地网络端到端测试");
  logBold("================================");

  // 获取签名者
  const [owner, ...signers] = await ethers.getSigners();
  logCyan(`Owner: ${owner.address}`);
  logCyan(`可用测试账户: ${signers.length} 个`);

  // 准备 10 个测试账户
  const testAccounts = signers.slice(0, 10);
  logCyan(`测试账户: ${testAccounts.map((a) => a.address).join(", ")}`);

  // ----------------------------------------------------------
  // Phase 0: 部署 Mock USDC
  // ----------------------------------------------------------
  logSection("Phase 0: 部署 Mock USDC");

  // 写入 MockUSDC.sol 到 contracts/mocks/ 目录并编译
  const fs = require("fs");
  const path = require("path");
  const tmpDir = path.resolve(__dirname, "../contracts/mocks");
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  fs.writeFileSync(path.join(tmpDir, "MockUSDC.sol"), MOCK_USDC_SOURCE);

  // 编译项目
  logYellow("编译合约 (包含 MockUSDC)...");
  const { execSync } = require("child_process");
  execSync("npx hardhat compile --force", { cwd: path.resolve(__dirname, ".."), stdio: "inherit" });

  const MockUSDCFactory = await ethers.getContractFactory("MockUSDC", {
    signer: owner,
  });
  const mockUsdc = await MockUSDCFactory.deploy();
  await mockUsdc.deployed();

  logGreen(`MockUSDC 部署成功: ${mockUsdc.address}`);

  // 给所有测试账户 mint 大量 USDC
  const MINT_AMOUNT = ethers.utils.parseEther("1000"); // 每人 1000 USDC
  for (const account of testAccounts) {
    await mockUsdc.mint(account.address, MINT_AMOUNT);
  }
  // 也给 owner mint
  await mockUsdc.mint(owner.address, MINT_AMOUNT);
  logGreen(`已给 ${testAccounts.length + 1} 个账户各 mint ${ethers.utils.formatEther(MINT_AMOUNT)} USDC`);

  // ----------------------------------------------------------
  // Phase 1: 部署 PriceOracle
  // ----------------------------------------------------------
  logSection("Phase 1: 部署 PriceOracle");
  const priceOracle = await (await ethers.getContractFactory("PriceOracle", owner)).deploy();
  await priceOracle.deployed();
  logGreen(`PriceOracle: ${priceOracle.address}`);

  // ----------------------------------------------------------
  // Phase 2: SimpleFactory + SimpleRouter + BondingCurve
  // ----------------------------------------------------------
  logSection("Phase 2: SimpleFactory + SimpleRouter + BondingCurve");

  const simpleFactory = await (await ethers.getContractFactory("SimpleFactory", owner)).deploy();
  await simpleFactory.deployed();
  logGreen(`SimpleFactory: ${simpleFactory.address}`);

  const simpleRouter = await (await ethers.getContractFactory("SimpleRouter", owner)).deploy(
    simpleFactory.address,
    mockUsdc.address
  );
  await simpleRouter.deployed();
  logGreen(`SimpleRouter: ${simpleRouter.address}`);

  const DEX_ROUTER = simpleRouter.address;

  // BondingCurve 构造函数: (address _dexRouter, address _feeDistributor, bool _isXyloRouter, address _baseAsset)
  const bondingCurve = await (await ethers.getContractFactory("BondingCurve", owner)).deploy(
    DEX_ROUTER,
    owner.address, // feeDistributor 先设为 owner，后面会更新
    false,
    mockUsdc.address
  );
  await bondingCurve.deployed();
  logGreen(`BondingCurve: ${bondingCurve.address}`);

  const bondingCurveFactory = await (await ethers.getContractFactory("BondingCurveFactory", owner)).deploy(
    bondingCurve.address
  );
  await bondingCurveFactory.deployed();
  logGreen(`BondingCurveFactory: ${bondingCurveFactory.address}`);

  // 设置 BondingCurve 的 factory
  await (await bondingCurve.setFactory(bondingCurveFactory.address)).wait();
  logYellow("BondingCurve.setFactory() 完成");

  // ----------------------------------------------------------
  // Phase 3: BuyAndBurnEngine + DexLister
  // ----------------------------------------------------------
  logSection("Phase 3: BuyAndBurnEngine + DexLister");

  // BuyAndBurnEngine 构造函数: (address _dexRouter, address _feeDistributor, bool _isXyloRouter, address _baseAsset)
  const burnEngine = await (await ethers.getContractFactory("BuyAndBurnEngine", owner)).deploy(
    DEX_ROUTER,
    owner.address,
    false,
    mockUsdc.address
  );
  await burnEngine.deployed();
  logGreen(`BuyAndBurnEngine: ${burnEngine.address}`);

  // DexLister 构造函数: (address _dexRouter, address _feeDistributor, bool _isXyloRouter, address _baseAsset)
  const dexLister = await (await ethers.getContractFactory("DexLister", owner)).deploy(
    DEX_ROUTER,
    owner.address,
    false,
    mockUsdc.address
  );
  await dexLister.deployed();
  logGreen(`DexLister: ${dexLister.address}`);

  // ----------------------------------------------------------
  // Phase 4: PerpetualPool
  // ----------------------------------------------------------
  logSection("Phase 4: PerpetualPool");

  // PerpetualPool 构造函数: (address _oracle, address _burnEngine, address _platformTreasury)
  const perpPool = await (await ethers.getContractFactory("PerpetualPool", owner)).deploy(
    priceOracle.address,
    burnEngine.address,
    owner.address
  );
  await perpPool.deployed();
  logGreen(`PerpetualPool: ${perpPool.address}`);

  // ----------------------------------------------------------
  // Phase 5: FeeDistributor
  // ----------------------------------------------------------
  logSection("Phase 5: FeeDistributor");

  // FeeDistributor 构造函数: (address _dogeToken, address _dexRouter, address _buyAndBurnEngine, address _wrappedNative, address _perpetualPool)
  const feeDist = await (await ethers.getContractFactory("FeeDistributor", owner)).deploy(
    mockUsdc.address, // dogeToken 先用 mockUsdc 占位
    DEX_ROUTER,
    burnEngine.address,
    ethers.constants.AddressZero, // wrappedNative
    perpPool.address
  );
  await feeDist.deployed();
  logGreen(`FeeDistributor: ${feeDist.address}`);

  // ----------------------------------------------------------
  // Phase 6: Wiring (合约互相引用)
  // ----------------------------------------------------------
  logSection("Phase 6: Wiring 合约互相引用");

  async function tx(label, fn) {
    logYellow(`  发送: ${label}...`);
    const t = await fn();
    await t.wait();
    logGreen(`  完成: ${label}`);
  }

  await tx("BondingCurve.setPerpetualPool", () => bondingCurve.setPerpetualPool(perpPool.address));
  await tx("BondingCurve.setBuyAndBurnEngine", () => bondingCurve.setBuyAndBurnEngine(burnEngine.address));
  await tx("BondingCurve.setPriceOracle", () => bondingCurve.setPriceOracle(priceOracle.address));
  await tx("BondingCurve.setFeeDistributor", () => bondingCurve.setFeeDistributor(feeDist.address));
  await tx("BondingCurve.setDexLister", () => bondingCurve.setDexLister(dexLister.address));

  await tx("PerpetualPool.setBondingCurve", () => perpPool.setBondingCurve(bondingCurve.address));
  await tx("PerpetualPool.setDexLister", () => perpPool.setDexLister(dexLister.address));

  // ----------------------------------------------------------
  // Phase 7: LaunchDAO
  // ----------------------------------------------------------
  logSection("Phase 7: LaunchDAO");

  // LaunchDAO 构造函数: (address _bondingCurve, address _feeDistributor)
  const launchDao = await (await ethers.getContractFactory("LaunchDAO", owner)).deploy(
    bondingCurve.address,
    feeDist.address
  );
  await launchDao.deployed();
  logGreen(`LaunchDAO: ${launchDao.address}`);

  await tx("BondingCurve.setLaunchDao", () => bondingCurve.setLaunchDao(launchDao.address));
  // 注意: 不设置 daoOnlyLaunch，允许通过 BondingCurveFactory 直接创建代币

  // ----------------------------------------------------------
  // Phase 8: CreatorRewardManager
  // ----------------------------------------------------------
  logSection("Phase 8: CreatorRewardManager");

  // CreatorRewardManager 构造函数: (address _bondingCurve)
  const creatorRewardMgr = await (await ethers.getContractFactory("CreatorRewardManager", owner)).deploy(
    bondingCurve.address
  );
  await creatorRewardMgr.deployed();
  logGreen(`CreatorRewardManager: ${creatorRewardMgr.address}`);

  await tx("BondingCurve.setCreatorRewardManager", () =>
    bondingCurve.setCreatorRewardManager(creatorRewardMgr.address)
  );

  // ----------------------------------------------------------
  // Phase 9: Final Wiring
  // ----------------------------------------------------------
  logSection("Phase 9: Final Wiring");

  await tx("LaunchDAO.setFeeDistributor", () => launchDao.setFeeDistributor(feeDist.address));

  await tx("DexLister.setPerpetualPool", () => dexLister.setPerpetualPool(perpPool.address));
  await tx("DexLister.setFeeDistributor", () => dexLister.setFeeDistributor(feeDist.address));
  await tx("DexLister.setBuyAndBurnEngine", () => dexLister.setBuyAndBurnEngine(burnEngine.address));
  await tx("DexLister.setCreatorRewardManager", () => dexLister.setCreatorRewardManager(creatorRewardMgr.address));
  await tx("DexLister.setBondingCurve", () => dexLister.setBondingCurve(bondingCurve.address));

  await tx("CreatorRewardManager.setDexLister", () => creatorRewardMgr.setDexLister(dexLister.address));

  await tx("PriceOracle.authorize(bondingCurve)", () =>
    priceOracle.setAuthorizedUpdater(bondingCurve.address, true)
  );
  await tx("PriceOracle.authorize(perpPool)", () => priceOracle.setAuthorizedUpdater(perpPool.address, true));

  // ----------------------------------------------------------
  // Phase 10: 设置 BondingCurve 的 dexThreshold
  // ----------------------------------------------------------
  logSection("Phase 10: 设置 BondingCurve 参数");

  // 设置 dexThreshold 为 5 USDC (5e18)
  await tx("BondingCurve.setDexThreshold(5 USDC)", () =>
    bondingCurve.setDexThreshold(ethers.utils.parseEther("5"))
  );

  // 设置多维阈值 (使用 setListingThresholds 一次性设置)
  await tx("BondingCurve.setListingThresholds(10, 5)", () =>
    bondingCurve.setListingThresholds(10, 5)
  );

  // 设置 creationFee 为 0 方便测试
  await tx("BondingCurve.setCreationFee(0)", () => bondingCurve.setCreationFee(0));

  logGreen("所有合约部署和接线完成!");

  // ----------------------------------------------------------
  // Phase 11: 创建测试代币
  // ----------------------------------------------------------
  logSection("Phase 11: 创建测试代币");

  // 通过 BondingCurveFactory 创建代币
  const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000"); // 10 亿
  const createTx = await bondingCurveFactory.createToken(
    "TestDoge",
    "TDOGE",
    TOTAL_SUPPLY,
    "ipfs://test-metadata",
    true,  // wantTaxShare
    true,  // wantLpShare
    true   // wantTokenAllocation
  );
  const createReceipt = await createTx.wait();

  // 从事件中获取 token 地址
  const tokenCreatedEvent = createReceipt.events.find((e) => e.event === "TokenCreated");
  const tokenAddress = tokenCreatedEvent.args.token;
  logGreen(`测试代币创建成功: ${tokenAddress}`);

  // 获取 BondingCurveToken 实例
  const testToken = await ethers.getContractAt("BondingCurveToken", tokenAddress);

  // 读取代币信息
  const tokenInfo = await bondingCurve.tokens(tokenAddress);
  logCyan(`  creator: ${tokenInfo.creator}`);
  logCyan(`  totalSupply: ${ethers.utils.formatEther(tokenInfo.totalSupply)}`);
  logCyan(`  dexListingThreshold: ${ethers.utils.formatEther(tokenInfo.dexListingThreshold)}`);
  logCyan(`  tradeCount: ${tokenInfo.tradeCount}`);
  logCyan(`  uniqueBuyerCount: ${tokenInfo.uniqueBuyerCount}`);
  logCyan(`  reserveUsdc: ${ethers.utils.formatEther(tokenInfo.reserveUsdc)}`);
  logCyan(`  isListedOnDex: ${tokenInfo.isListedOnDex}`);

  // ----------------------------------------------------------
  // Phase 12: 多维发射阈值测试
  // ----------------------------------------------------------
  logSection("Phase 12: 多维发射阈值测试");

  let allPassed = true;

  // 辅助函数: 打印当前代币状态
  async function printTokenState(label) {
    const info = await bondingCurve.tokens(tokenAddress);
    logCyan(`  [${label}]`);
    logCyan(`    tradeCount: ${info.tradeCount}`);
    logCyan(`    uniqueBuyerCount: ${info.uniqueBuyerCount}`);
    logCyan(`    reserveUsdc: ${ethers.utils.formatEther(info.reserveUsdc)} USDC`);
    logCyan(`    isListedOnDex: ${info.isListedOnDex}`);
    return info;
  }

  // 辅助函数: 执行买入
  async function executeBuy(signer, amountEth, label) {
    logYellow(`  ${label}: ${signer.address} 买入 ${ethers.utils.formatEther(amountEth)} USDC`);
    const buyTx = await bondingCurve.connect(signer).buy(tokenAddress, 0, signer.address, {
      value: amountEth,
    });
    await buyTx.wait();
  }

  // ----------------------------------------------------------
  // 场景 A: 1 个大户买入 10 USDC
  //   预期: 不能上架 (uniqueBuyers < 5)
  // ----------------------------------------------------------
  logBold("\n--- 场景 A: 1 个大户买入 10 USDC ---");

  await executeBuy(testAccounts[0], ethers.utils.parseEther("10"), "买入 #1");
  let state = await printTokenState("场景 A 结束");

  const scenarioA_pass = !state.isListedOnDex;
  if (scenarioA_pass) {
    logGreen(`  场景 A PASSED: uniqueBuyers(${state.uniqueBuyerCount}) < 5, 未上架`);
  } else {
    logRed(`  场景 A FAILED: 不应该上架! uniqueBuyers=${state.uniqueBuyerCount}`);
    allPassed = false;
  }

  // ----------------------------------------------------------
  // 场景 B: 5 个用户各买入 1 USDC (共 5 次交易)
  //   预期: 不能上架 (tradeCount < 10)
  // ----------------------------------------------------------
  logBold("\n--- 场景 B: 5 个用户各买入 1 USDC (共 5 次交易) ---");

  for (let i = 1; i <= 5; i++) {
    await executeBuy(testAccounts[i], ethers.utils.parseEther("1"), `买入 #${i + 1}`);
  }
  state = await printTokenState("场景 B 结束");

  const scenarioB_pass = !state.isListedOnDex;
  if (scenarioB_pass) {
    logGreen(`  场景 B PASSED: tradeCount(${state.tradeCount}) < 10, 未上架`);
  } else {
    logRed(`  场景 B FAILED: 不应该上架! tradeCount=${state.tradeCount}`);
    allPassed = false;
  }

  // ----------------------------------------------------------
  // 场景 C: 5 个用户各买入 1 USDC + 5 次额外交易
  //   预期: 可以上架 (tradeCount >= 10, uniqueBuyers >= 5, reserveUsdc >= 5)
  // ----------------------------------------------------------
  logBold("\n--- 场景 C: 5 个用户各买入 1 USDC + 5 次额外交易 ---");

  // 额外 5 次交易: 让前 5 个用户再各买入一次
  for (let i = 1; i <= 5; i++) {
    await executeBuy(testAccounts[i], ethers.utils.parseEther("1"), `额外买入 #${i}`);
  }
  state = await printTokenState("场景 C 结束");

  const scenarioC_pass = state.isListedOnDex;
  if (scenarioC_pass) {
    logGreen(`  场景 C PASSED: tradeCount(${state.tradeCount}) >= 10, uniqueBuyers(${state.uniqueBuyerCount}) >= 5, 已上架`);
  } else {
    logRed(`  场景 C FAILED: 应该上架! tradeCount=${state.tradeCount}, uniqueBuyers=${state.uniqueBuyerCount}, reserve=${ethers.utils.formatEther(state.reserveUsdc)}`);
    allPassed = false;
  }

  // ----------------------------------------------------------
  // 额外验证: 检查多维阈值常量
  // ----------------------------------------------------------
  logSection("额外验证: 多维阈值常量");

  const minTradeCount = await bondingCurve.minTradeCountForListing();
  const minUniqueBuyers = await bondingCurve.minUniqueBuyersForListing();
  const defaultThreshold = await bondingCurve.defaultDexThreshold();

  logCyan(`  minTradeCountForListing: ${minTradeCount}`);
  logCyan(`  minUniqueBuyersForListing: ${minUniqueBuyers}`);
  logCyan(`  defaultDexThreshold: ${ethers.utils.formatEther(defaultThreshold)} USDC`);

  const thresholdCheck =
    minTradeCount.eq(10) && minUniqueBuyers.eq(5) && defaultThreshold.eq(ethers.utils.parseEther("5"));
  if (thresholdCheck) {
    logGreen(`  阈值常量验证 PASSED`);
  } else {
    logRed(`  阈值常量验证 FAILED`);
    allPassed = false;
  }

  // ----------------------------------------------------------
  // 最终结果
  // ----------------------------------------------------------
  logSection("测试结果");

  if (allPassed) {
    logGreen(BOLD + "  ALL TESTS PASSED" + RESET);
    console.log("");
    logGreen("  场景 A: 1 个大户买入 -> 未上架 (uniqueBuyers < 5)     [PASSED]");
    logGreen("  场景 B: 5 用户 5 次交易 -> 未上架 (tradeCount < 10)    [PASSED]");
    logGreen("  场景 C: 5 用户 10 次交易 -> 已上架 (全部满足)          [PASSED]");
    logGreen("  阈值常量验证                                          [PASSED]");
  } else {
    logRed(BOLD + "  SOME TESTS FAILED" + RESET);
    console.log("");
    process.exit(1);
  }

  console.log("");
  logBold("========================================");
  logBold("  合约地址汇总");
  logBold("========================================");
  logCyan(`  MockUSDC:              ${mockUsdc.address}`);
  logCyan(`  PriceOracle:           ${priceOracle.address}`);
  logCyan(`  SimpleFactory:         ${simpleFactory.address}`);
  logCyan(`  SimpleRouter:          ${simpleRouter.address}`);
  logCyan(`  BondingCurve:          ${bondingCurve.address}`);
  logCyan(`  BondingCurveFactory:   ${bondingCurveFactory.address}`);
  logCyan(`  BuyAndBurnEngine:      ${burnEngine.address}`);
  logCyan(`  DexLister:             ${dexLister.address}`);
  logCyan(`  PerpetualPool:         ${perpPool.address}`);
  logCyan(`  FeeDistributor:        ${feeDist.address}`);
  logCyan(`  LaunchDAO:             ${launchDao.address}`);
  logCyan(`  CreatorRewardManager:  ${creatorRewardMgr.address}`);
  logCyan(`  TestToken:             ${tokenAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nTEST FAILED:");
    console.error(error);
    process.exit(1);
  });
