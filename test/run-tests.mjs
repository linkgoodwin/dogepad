import { network } from "hardhat";
import * as hardhat from "hardhat";
import { expect } from "chai";
import { ethers } from "ethers";

async function runTests() {
  console.log("Creating network connection...");
  const hre = await network.create();
  const provider = hre.provider;

  // Create ethers provider from Hardhat provider
  const ethersProvider = new ethers.providers.Web3Provider(provider);
  const [owner, user1, user2] = await ethersProvider.listAccounts();
  console.log("Owner:", owner);
  console.log("User1:", user1);
  console.log("User2:", user2);

  // Get signers
  const ownerSigner = ethersProvider.getSigner(owner);
  const user1Signer = ethersProvider.getSigner(user1);
  const user2Signer = ethersProvider.getSigner(user2);

  // ============================================================
  // DEPLOY ALL CONTRACTS
  // ============================================================

  // Deploy PriceOracle
  console.log("Deploying PriceOracle...");
  const PriceOracleArtifact = await hardhat.artifacts.readArtifact("PriceOracle");
  const oracleFactory = new ethers.ContractFactory(PriceOracleArtifact.abi, PriceOracleArtifact.bytecode, ownerSigner);
  const oracle = await oracleFactory.deploy();
  await oracle.deployed();
  console.log("PriceOracle deployed at:", oracle.address);

  // Deploy a mock ERC20 token for DOGE staking
  console.log("Deploying MockDogeToken...");
  const MockERC20Artifact = await hardhat.artifacts.readArtifact("BondingCurveToken");
  // BondingCurveToken(name, symbol, totalSupply, taxReceiver, owner)
  const dogeToken = await new ethers.ContractFactory(MockERC20Artifact.abi, MockERC20Artifact.bytecode, ownerSigner)
    .deploy("DogeToken", "DOGE", ethers.utils.parseEther("1000000"), owner, owner);
  await dogeToken.deployed();
  console.log("MockDogeToken deployed at:", dogeToken.address);

  // Deploy FeeDistributor
  // constructor(address _dogeToken, address _dexRouter, address _buyAndBurnEngine, address _wrappedNative, address _perpetualPool)
  console.log("Deploying FeeDistributor...");
  const FeeDistributorArtifact = await hardhat.artifacts.readArtifact("FeeDistributor");
  const feeDist = await new ethers.ContractFactory(FeeDistributorArtifact.abi, FeeDistributorArtifact.bytecode, ownerSigner)
    .deploy(dogeToken.address, owner, owner, owner, owner);
  await feeDist.deployed();
  console.log("FeeDistributor deployed at:", feeDist.address);

  // Deploy PerpetualPool
  // constructor(address _oracle, address _burnEngine, address _platformTreasury)
  console.log("Deploying PerpetualPool...");
  const PerpetualPoolArtifact = await hardhat.artifacts.readArtifact("PerpetualPool");
  const perpPool = await new ethers.ContractFactory(PerpetualPoolArtifact.abi, PerpetualPoolArtifact.bytecode, ownerSigner)
    .deploy(oracle.address, owner, owner);
  await perpPool.deployed();
  console.log("PerpetualPool deployed at:", perpPool.address);

  // Deploy BondingCurve
  // constructor(address _dexRouter, address _feeDistributor, bool _isXyloRouter, address _baseAsset)
  console.log("Deploying BondingCurve...");
  const BondingCurveArtifact = await hardhat.artifacts.readArtifact("BondingCurve");
  const bondingCurve = await new ethers.ContractFactory(BondingCurveArtifact.abi, BondingCurveArtifact.bytecode, ownerSigner)
    .deploy(owner, feeDist.address, false, owner);
  await bondingCurve.deployed();
  console.log("BondingCurve deployed at:", bondingCurve.address);

  // Set up cross-contract references
  // BondingCurve needs factory set to owner so owner can call createToken
  await bondingCurve.setFactory(owner);
  await bondingCurve.setLaunchDao(owner);
  await bondingCurve.setPriceOracle(oracle.address);
  await bondingCurve.setPerpetualPool(perpPool.address);
  console.log("BondingCurve cross-contract references set");

  // Set oracle authorized updater for bondingCurve
  await oracle.setAuthorizedUpdater(bondingCurve.address, true);
  console.log("BondingCurve set as authorized oracle updater");

  // ============================================================
  // SECTION 1: ORIGINAL TESTS (Tests 1-5)
  // ============================================================

  // Test 1: Create token
  console.log("\n--- Test 1: Token Creation ---");
  const tx = await bondingCurve.createToken("TestToken", "TEST", 0, "", true, true, true, {
    value: ethers.utils.parseEther("0.1"),
  });
  const receipt = await tx.wait();
  const event = receipt.events?.find(e => e.event === "TokenCreated");
  const tokenAddress = event?.args?.token;
  console.log("Token created at:", tokenAddress);

  const info = await bondingCurve.getTokenInfo(tokenAddress);
  expect(info.creator).to.equal(owner);
  expect(info.totalSupply.toString()).to.equal(ethers.utils.parseEther("1000000000").toString());
  expect(info.isListedOnDex).to.be.false;
  console.log("Token creation test PASSED");

  // Test 2: Buy tokens
  console.log("\n--- Test 2: Buying Tokens ---");
  const buyAmount = ethers.utils.parseEther("1");
  const price = await bondingCurve.getBuyPrice(tokenAddress, buyAmount);
  console.log("Buy price:", price.toString());

  await expect(
    bondingCurve.connect(user1Signer).buy(tokenAddress, 0, ethers.constants.AddressZero, {
      value: buyAmount,
    })
  )
    .to.emit(bondingCurve, "TokenBought")
    .withArgs(tokenAddress, user1, buyAmount, price);
  console.log("Buy test PASSED");

  // Test 3: Reserve increased
  console.log("\n--- Test 3: Reserve Tracking ---");
  const reserve = await bondingCurve.getReserve(tokenAddress);
  expect(reserve).to.be.gt(0);
  console.log("Reserve:", reserve.toString());
  console.log("Reserve tracking test PASSED");

  // Test 4: Sell tokens
  console.log("\n--- Test 4: Selling Tokens ---");
  const tokenArtifact = await hardhat.artifacts.readArtifact("BondingCurveToken");
  const token = new ethers.Contract(tokenAddress, tokenArtifact.abi, ethersProvider);
  const balance = await token.balanceOf(user1);
  console.log("User1 token balance:", balance.toString());

  const sellAmount = balance.div(2);
  await token.connect(user1Signer).approve(bondingCurve.address, sellAmount);

  await expect(
    bondingCurve.connect(user1Signer).sell(tokenAddress, sellAmount, 0)
  ).to.emit(bondingCurve, "TokenSold");
  console.log("Sell test PASSED");

  // Test 5: DEX Listing status
  console.log("\n--- Test 5: DEX Listing Status ---");
  expect(await bondingCurve.isListed(tokenAddress)).to.be.false;
  console.log("DEX listing status test PASSED");

  // ============================================================
  // SECTION 2: BondingCurve EXTREME SCENARIOS (Tests 6-8)
  // ============================================================

  // Test 6: Buy with 0 amount (should revert with ZeroUsdc)
  console.log("\n--- Test 6: Buy with 0 Amount (should revert) ---");
  await expect(
    bondingCurve.connect(user1Signer).buy(tokenAddress, 0, ethers.constants.AddressZero, {
      value: 0,
    })
  ).to.be.revertedWithCustomError(bondingCurve, "ZeroUsdc");
  console.log("Buy 0 amount revert test PASSED");

  // Test 7: Sell more than holding (should revert)
  console.log("\n--- Test 7: Sell More Than Holding (should revert) ---");
  const user1Balance = await token.balanceOf(user1);
  const oversellAmount = user1Balance.add(ethers.utils.parseEther("1"));
  await token.connect(user1Signer).approve(bondingCurve.address, oversellAmount);

  await expect(
    bondingCurve.connect(user1Signer).sell(tokenAddress, oversellAmount, 0)
  ).to.be.revertedWithCustomError(bondingCurve, "ExceedsSoldTokens");
  console.log("Sell more than holding revert test PASSED");

  // Test 8: Create token with same name (should succeed, different address)
  console.log("\n--- Test 8: Create Same-Name Token (should succeed) ---");
  const tx2 = await bondingCurve.createToken("TestToken", "TEST", 0, "", true, true, true, {
    value: ethers.utils.parseEther("0.1"),
  });
  const receipt2 = await tx2.wait();
  const event2 = receipt2.events?.find(e => e.event === "TokenCreated");
  const tokenAddress2 = event2?.args?.token;
  console.log("Second token created at:", tokenAddress2);

  expect(tokenAddress2).to.not.equal(tokenAddress);
  const info2 = await bondingCurve.getTokenInfo(tokenAddress2);
  expect(info2.creator).to.equal(owner);
  expect(info2.tokenAddress).to.equal(tokenAddress2);
  console.log("Same-name token creation test PASSED");

  // ============================================================
  // SECTION 3: PerpetualPool SCENARIOS (Tests 9-16)
  // ============================================================

  // Set up oracle price for the token and list it for perp
  console.log("\n--- Setting up PerpetualPool tests ---");

  // Update TWAP price for token so oracle.getPrice returns a value
  // BondingCurve is authorized updater, but we need to update directly
  // Set owner as authorized updater too
  await oracle.setAuthorizedUpdater(owner, true);
  await oracle.updateTwapPrice(tokenAddress, ethers.utils.parseEther("1")); // price = 1 ETH

  // List token for perp trading
  await perpPool.listTokenForPerp(tokenAddress);
  console.log("Token listed for perp trading");

  // Test 9: Open position with leverage > 5x (should revert)
  console.log("\n--- Test 9: Open Position Leverage > 5x (should revert) ---");
  const leverage6x = ethers.utils.parseEther("6"); // 6x
  await expect(
    perpPool.connect(user1Signer).openPosition(
      tokenAddress,
      true, // isLong
      ethers.utils.parseEther("0.1"), // marginUsdc
      leverage6x,
      { value: ethers.utils.parseEther("0.1") }
    )
  ).to.be.revertedWith("invalid leverage");
  console.log("Leverage > 5x revert test PASSED");

  // Test 10: Open position with 0 margin (should revert)
  console.log("\n--- Test 10: Open Position with 0 Margin (should revert) ---");
  await expect(
    perpPool.connect(user1Signer).openPosition(
      tokenAddress,
      true,
      0, // zero margin
      ethers.utils.parseEther("2"), // 2x leverage
      { value: 0 }
    )
  ).to.be.revertedWith("zero margin");
  console.log("Zero margin revert test PASSED");

  // Test 11: Trade unlisted token (should revert)
  console.log("\n--- Test 11: Trade Unlisted Token (should revert) ---");
  const unlistedToken = owner; // random address that is not listed
  await expect(
    perpPool.connect(user1Signer).openPosition(
      unlistedToken,
      true,
      ethers.utils.parseEther("0.1"),
      ethers.utils.parseEther("2"),
      { value: ethers.utils.parseEther("0.1") }
    )
  ).to.be.revertedWith("token not listed for perp");
  console.log("Unlisted token revert test PASSED");

  // Test 12: Open a valid position (for subsequent tests)
  console.log("\n--- Test 12: Open Valid Position ---");
  const openMargin = ethers.utils.parseEther("1");
  const openLeverage = ethers.utils.parseEther("2"); // 2x
  await expect(
    perpPool.connect(user1Signer).openPosition(
      tokenAddress,
      true, // isLong
      openMargin,
      openLeverage,
      { value: openMargin }
    )
  ).to.emit(perpPool, "PositionOpened");

  // Verify position
  const pos = await perpPool.getPosition(user1, tokenAddress);
  expect(pos.isActive).to.be.true;
  expect(pos.isLong).to.be.true;
  expect(pos.margin.toString()).to.equal(openMargin.toString());
  expect(pos.size.toString()).to.equal(openMargin.mul(2).toString()); // 2x leverage
  console.log("Position opened successfully, size:", pos.size.toString());
  console.log("Open valid position test PASSED");

  // Test 13: Add margin
  console.log("\n--- Test 13: Add Margin ---");
  const addMarginAmount = ethers.utils.parseEther("0.5");
  await expect(
    perpPool.connect(user1Signer).addMargin(tokenAddress, {
      value: addMarginAmount,
    })
  ).to.emit(perpPool, "MarginAdded");

  const posAfterAdd = await perpPool.getPosition(user1, tokenAddress);
  expect(posAfterAdd.margin.toString()).to.equal(openMargin.add(addMarginAmount).toString());
  console.log("Margin after add:", posAfterAdd.margin.toString());
  console.log("Add margin test PASSED");

  // Test 14: Remove margin
  console.log("\n--- Test 14: Remove Margin ---");
  const removeMarginAmount = ethers.utils.parseEther("0.3");
  const marginBeforeRemove = posAfterAdd.margin;

  await expect(
    perpPool.connect(user1Signer).removeMargin(tokenAddress, removeMarginAmount)
  ).to.emit(perpPool, "MarginRemoved");

  const posAfterRemove = await perpPool.getPosition(user1, tokenAddress);
  expect(posAfterRemove.margin.toString()).to.equal(marginBeforeRemove.sub(removeMarginAmount).toString());
  console.log("Margin after remove:", posAfterRemove.margin.toString());
  console.log("Remove margin test PASSED");

  // Test 15: Close position (full close)
  console.log("\n--- Test 15: Close Position (Full Close) ---");
  await expect(
    perpPool.connect(user1Signer).closePosition(tokenAddress)
  ).to.emit(perpPool, "PositionClosed");

  const posAfterClose = await perpPool.getPosition(user1, tokenAddress);
  expect(posAfterClose.isActive).to.be.false;
  expect(posAfterClose.margin.toString()).to.equal("0");
  expect(posAfterClose.size.toString()).to.equal("0");
  console.log("Full close position test PASSED");

  // Test 16: Partial close position
  console.log("\n--- Test 16: Partial Close Position ---");
  // Open a new position for partial close test
  const partialOpenMargin = ethers.utils.parseEther("2");
  const partialOpenLeverage = ethers.utils.parseEther("2"); // 2x
  await perpPool.connect(user2Signer).openPosition(
    tokenAddress,
    true,
    partialOpenMargin,
    partialOpenLeverage,
    { value: partialOpenMargin }
  );

  const posBeforePartial = await perpPool.getPosition(user2, tokenAddress);
  expect(posBeforePartial.isActive).to.be.true;
  const fullSize = posBeforePartial.size;
  const closeSize = fullSize.div(2); // close half
  console.log("Full size:", fullSize.toString(), "Close size:", closeSize.toString());

  await expect(
    perpPool.connect(user2Signer).closePositionPartial(tokenAddress, closeSize)
  ).to.emit(perpPool, "PositionPartiallyClosed");

  const posAfterPartial = await perpPool.getPosition(user2, tokenAddress);
  expect(posAfterPartial.isActive).to.be.true;
  expect(posAfterPartial.size.toString()).to.equal(fullSize.sub(closeSize).toString());
  console.log("Remaining size:", posAfterPartial.size.toString());
  console.log("Partial close position test PASSED");

  // ============================================================
  // SECTION 4: FeeDistributor SCENARIOS (Tests 17-19)
  // ============================================================

  console.log("\n--- Setting up FeeDistributor tests ---");

  // Mint DOGE tokens to user1 for staking
  // dogeToken is BondingCurveToken, owner is the owner
  // Mint directly to user1 (owner can mint via transfer since all supply is minted to contract)
  // Actually, totalSupply was minted to the contract itself. Owner needs to get DOGE differently.
  // Let's deploy a fresh simple ERC20 for staking tests
  // We'll use the dogeToken and transfer from the initial mint
  // The dogeToken was minted with totalSupply to address(this) which is the token contract itself
  // Owner is the token owner, so let's just transfer some to user1

  // Actually, the token minted all to itself. We need to get tokens out.
  // Owner is excluded from tax, so we can use transferFrom if approved.
  // But tokens are in the token contract itself, not in owner's wallet.
  // Let's just send some ETH to user1 and use a different approach.
  // We'll mint a new simple token for staking.

  // Deploy a simple mock token using BondingCurveToken for DOGE staking
  console.log("Deploying stake token for FeeDistributor tests...");
  const stakeToken = await new ethers.ContractFactory(MockERC20Artifact.abi, MockERC20Artifact.bytecode, ownerSigner)
    .deploy("StakeDOGE", "sDOGE", ethers.utils.parseEther("1000000"), owner, owner);
  await stakeToken.deployed();
  console.log("StakeDOGE deployed at:", stakeToken.address);

  // Transfer tokens to user1 (owner is excluded from tax)
  const stakeAmount = ethers.utils.parseEther("1000");
  await stakeToken.transfer(user1, stakeAmount);
  console.log("Transferred", stakeAmount.toString(), "sDOGE to user1");

  // Update FeeDistributor to use our stake token
  await feeDist.setDogeToken(stakeToken.address);
  console.log("FeeDistributor dogeToken updated to stakeToken");

  // Test 17: Stake DOGE
  console.log("\n--- Test 17: Stake DOGE ---");
  await stakeToken.connect(user1Signer).approve(feeDist.address, stakeAmount);

  await expect(
    feeDist.connect(user1Signer).stakeDoge(stakeAmount, 30 * 24 * 3600) // 30 days duration
  ).to.emit(feeDist, "DogeStaked");

  const stakedDoge = await feeDist.getStakedDoge(user1);
  expect(stakedDoge.toString()).to.equal(stakeAmount.toString());
  console.log("User1 staked:", stakedDoge.toString());
  console.log("Stake DOGE test PASSED");

  // Test 18: Distribute fees and claim dividend
  console.log("\n--- Test 18: Claim Dividend ---");
  // Send fees to FeeDistributor (must be >= MIN_DISTRIBUTION = 0.01 ether)
  const feeAmount = ethers.utils.parseEther("1");
  await expect(
    ownerSigner.sendTransaction({
      to: feeDist.address,
      value: feeAmount,
    })
  ).to.emit(feeDist, "FeesReceived");

  // Check pending dividend
  const pendingBefore = await feeDist.pendingDividend(user1);
  console.log("Pending dividend before claim:", pendingBefore.toString());
  expect(pendingBefore).to.be.gt(0);

  // Claim dividend
  await expect(
    feeDist.connect(user1Signer).claimDividend()
  ).to.emit(feeDist, "DividendClaimed");

  const pendingAfter = await feeDist.pendingDividend(user1);
  expect(pendingAfter.toString()).to.equal("0");
  console.log("Pending dividend after claim:", pendingAfter.toString());
  console.log("Claim dividend test PASSED");

  // Test 19: Fee distribution ratio verification
  console.log("\n--- Test 19: Fee Distribution Ratio Verification ---");
  const dividendRatio = await feeDist.dividendRatio();
  const burnRatio = await feeDist.burnRatio();
  const perpPoolRatio = await feeDist.perpPoolRatio();

  // dividendRatio = 30%, burnRatio = 20%, perpPoolRatio = 50%
  expect(dividendRatio.toString()).to.equal(ethers.utils.parseEther("0.3").toString());
  expect(burnRatio.toString()).to.equal(ethers.utils.parseEther("0.2").toString());
  expect(perpPoolRatio.toString()).to.equal(ethers.utils.parseEther("0.5").toString());

  // Verify ratios sum to 1e18 (100%)
  const totalRatio = dividendRatio.add(burnRatio).add(perpPoolRatio);
  expect(totalRatio.toString()).to.equal(ethers.utils.parseEther("1").toString());
  console.log("Dividend ratio:", ethers.utils.formatEther(dividendRatio));
  console.log("Burn ratio:", ethers.utils.formatEther(burnRatio));
  console.log("PerpPool ratio:", ethers.utils.formatEther(perpPoolRatio));
  console.log("Total ratio:", ethers.utils.formatEther(totalRatio));
  console.log("Fee distribution ratio verification test PASSED");

  // ============================================================
  // SECTION 5: PriceOracle SCENARIOS (Tests 20-22)
  // ============================================================

  console.log("\n--- Setting up PriceOracle tests ---");

  // Test 20: Set price (via updateTwapPrice)
  console.log("\n--- Test 20: Set Price (TWAP) ---");
  const testPrice = ethers.utils.parseEther("1.5");
  await oracle.updateTwapPrice(tokenAddress, testPrice);

  const twapPrice = await oracle.twapPrices(tokenAddress);
  expect(twapPrice.toString()).to.equal(testPrice.toString());
  console.log("TWAP price set to:", twapPrice.toString());
  console.log("Set price test PASSED");

  // Test 21: Get price
  console.log("\n--- Test 21: Get Price ---");
  const retrievedPrice = await oracle.getPrice(tokenAddress);
  // getPrice returns effectivePrice if set and time >= effectivePriceTime,
  // otherwise twapPrices if fresh, otherwise tries DEX
  // Since we just updated TWAP and no effectivePrice is set, it should return twapPrice
  console.log("Retrieved price:", retrievedPrice.toString());
  expect(retrievedPrice).to.be.gt(0);
  console.log("Get price test PASSED");

  // Test 22: TWAP price update
  console.log("\n--- Test 22: TWAP Price Update ---");
  const newPrice = ethers.utils.parseEther("2.0");
  await oracle.updateTwapPrice(tokenAddress, newPrice);

  const updatedPrice = await oracle.twapPrices(tokenAddress);
  expect(updatedPrice.toString()).to.equal(newPrice.toString());
  expect(updatedPrice.toString()).to.not.equal(testPrice.toString());

  // Verify lastUpdateTime was updated
  const lastUpdateTime = await oracle.lastUpdateTime(tokenAddress);
  expect(lastUpdateTime).to.be.gt(0);
  console.log("Updated TWAP price:", updatedPrice.toString());
  console.log("Last update time:", lastUpdateTime.toString());
  console.log("TWAP price update test PASSED");

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log("\n========================================");
  console.log("=== ALL 22 TESTS PASSED ===");
  console.log("========================================");
  console.log("Test breakdown:");
  console.log("  BondingCurve basic:      Tests 1-5");
  console.log("  BondingCurve extreme:    Tests 6-8");
  console.log("  PerpetualPool:           Tests 9-16");
  console.log("  FeeDistributor:          Tests 17-19");
  console.log("  PriceOracle:             Tests 20-22");

  await hre.close();
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
