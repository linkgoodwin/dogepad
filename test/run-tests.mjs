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

  // Get signers
  const ownerSigner = ethersProvider.getSigner(owner);
  const user1Signer = ethersProvider.getSigner(user1);

  // Deploy PriceOracle
  console.log("Deploying PriceOracle...");
  const PriceOracleFactory = await hardhat.artifacts.readArtifact("PriceOracle");
  const oracleFactory = new ethers.ContractFactory(PriceOracleFactory.abi, PriceOracleFactory.bytecode, ownerSigner);
  const oracle = await oracleFactory.deploy();
  await oracle.deployed();
  console.log("PriceOracle deployed at:", oracle.address);

  // Deploy BondingCurve
  console.log("Deploying BondingCurve...");
  const BondingCurveFactory = await hardhat.artifacts.readArtifact("BondingCurve");
  const bcFactory = new ethers.ContractFactory(BondingCurveFactory.abi, BondingCurveFactory.bytecode, ownerSigner);
  // constructor(address _dexRouter, address _feeDistributor, bool _isXyloRouter, address _baseAsset)
  const bondingCurve = await bcFactory.deploy(
    owner, // _dexRouter (placeholder)
    owner, // _feeDistributor (placeholder)
    false, // _isXyloRouter
    owner  // _baseAsset (placeholder)
  );
  await bondingCurve.deployed();
  console.log("BondingCurve deployed at:", bondingCurve.address);

  // Test 1: Create token
  console.log("\n--- Test 1: Token Creation ---");
  // function createToken(string name, string symbol, uint256 totalSupply, string metadataURI, bool wantTaxShare, bool wantLpShare, bool wantTokenAllocation)
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

  console.log("\n=== ALL TESTS PASSED ===");

  await hre.close();
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
