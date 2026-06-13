const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const ARC_RPC = "https://rpc.testnet.arc.network";
const BONDING_CURVE = "0x569944C02A15aAdB5F9D1999e202463e9860F473";
const LAUNCH_DAO = "0xE8b398DD23B8190d8999399DBd176e40d0aDb4Ed";
const FACTORY = "0x0622495843eca9299F07Fe3ad3a67ad39DB7ba4f";
const SIMPLE_ROUTER = "0x6C59fc8e5a4e0CFF1cfD050f1f73B7eA4a49992B";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ZERO_ADDR = ethers.constants.AddressZero;
const fmtEther = ethers.utils.formatEther;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const FACTORY_ABI = [
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function getTokens(uint256 offset, uint256 limit) view returns (address[])",
];

const BONDING_CURVE_ABI = [
  "function getTokenInfo(address token) view returns (address tokenAddress, address creator, uint256 totalSupply, uint256 reserveUsdc, uint256 tokensSold, bool isListedOnDex, uint256 dexListingThreshold, string metadataURI)",
  "function getSellPrice(address token, uint256 tokenAmount) view returns (uint256)",
  "function isListed(address token) view returns (bool)",
  "function getReserve(address token) view returns (uint256)",
  "function sell(address token, uint256 tokenAmount, uint256 minUsdcOut)",
];

const DAO_ABI = [
  "function getCandidateCount() view returns (uint256)",
  "function getSubscription(address user, uint256 candidateId) view returns (uint256 usdcAmount, uint256 dogeAmount, uint256 subscribeTime, bool isActive, bool hasClaimed, bool hasRefunded)",
  "function getStakePositionCount(address user) view returns (uint256)",
  "function getStakePosition(address user, uint256 index) view returns (address token, uint256 amount, uint256 startTime, uint8 duration, uint256 maturityTime, bool withdrawn, uint256 lastRightsClaimTime)",
  "function refundSubscription(uint256 candidateId)",
  "function unstakePosition(uint256 positionId)",
  "function candidates(uint256) view returns (string name, string symbol, address proposer, address tokenAddress, uint8 status, uint256 totalWeight, uint256 totalSubUsdc, uint256 totalSubDoge, uint256 createTime, uint256 expireTime, uint256 gracePeriodEnd, uint256 queueTime, bool wantTaxShare, bool wantLpShare, bool wantTokenAllocation)",
];

const SIMPLE_ROUTER_ABI = [
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
];

const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("DEPLOYER_PRIVATE_KEY not found in .env");
  process.exit(1);
}
const wallet = new ethers.Wallet(pk, provider);
console.log("Wallet address:", wallet.address);

const bondingCurve = new ethers.Contract(BONDING_CURVE, BONDING_CURVE_ABI, wallet);
const launchDao = new ethers.Contract(LAUNCH_DAO, DAO_ABI, wallet);
const factory = new ethers.Contract(FACTORY, FACTORY_ABI, provider);
const simpleRouter = new ethers.Contract(SIMPLE_ROUTER, SIMPLE_ROUTER_ABI, wallet);

async function main() {
  const mode = process.argv[2] || "check";

  console.log("\n=== WALLET BALANCE ===");
  const nativeBal = await provider.getBalance(wallet.address);
  console.log("Native (ARC):", fmtEther(nativeBal));

  const wusdc = new ethers.Contract(WUSDC, ERC20_ABI, wallet);
  const wusdcBal = await wusdc.balanceOf(wallet.address);
  console.log("WUSDC:", fmtEther(wusdcBal));

  console.log("\n=== SCANNING ALL TOKENS FOR BALANCE ===");
  const tokenCount = await factory.allTokensLength();
  console.log("Total tokens on platform:", tokenCount.toString());

  const holdings = [];
  for (let i = 0; i < Number(tokenCount); i++) {
    const tokenAddr = await factory.allTokens(i);
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const balance = await token.balanceOf(wallet.address);
    if (balance.gt(0)) {
      let symbol = "???";
      let name = "???";
      try { symbol = await token.symbol(); } catch {}
      try { name = await token.name(); } catch {}

      let isListed = false;
      let reserveUsdc = ethers.BigNumber.from(0);
      let sellPrice = ethers.BigNumber.from(0);
      try {
        const info = await bondingCurve.getTokenInfo(tokenAddr);
        isListed = info.isListedOnDex;
        reserveUsdc = info.reserveUsdc;
        if (!isListed && balance.gt(0)) {
          try {
            sellPrice = await bondingCurve.getSellPrice(tokenAddr, balance);
          } catch {}
        }
      } catch {}

      holdings.push({
        index: i,
        address: tokenAddr,
        name,
        symbol,
        balance,
        balanceFormatted: fmtEther(balance),
        isListed,
        reserveUsdc,
        reserveFormatted: fmtEther(reserveUsdc),
        sellPrice,
        sellPriceFormatted: fmtEther(sellPrice),
      });
    }
  }

  if (holdings.length === 0) {
    console.log("No token holdings found.");
  } else {
    console.log(`\nFound ${holdings.length} token holding(s):`);
    for (const h of holdings) {
      console.log(`  [${h.index}] ${h.symbol} (${h.name})`);
      console.log(`    Address: ${h.address}`);
      console.log(`    Balance: ${h.balanceFormatted} ${h.symbol}`);
      console.log(`    Listed on DEX: ${h.isListed}`);
      if (!h.isListed) {
        console.log(`    Reserve: ${h.reserveFormatted} USDC`);
        console.log(`    Sell value: ${h.sellPriceFormatted} USDC`);
      }
    }
  }

  console.log("\n=== DAO STAKES ===");
  const stakeCount = await launchDao.getStakePositionCount(wallet.address);
  console.log("Stake positions:", stakeCount.toString());
  const stakes = [];
  for (let i = 0; i < Number(stakeCount); i++) {
    const pos = await launchDao.getStakePosition(wallet.address, i);
    const isUsdc = pos.token === ZERO_ADDR;
    const tokenLabel = isUsdc ? "USDC" : pos.token;
    const canUnstake = !pos.withdrawn && (pos.maturityTime.eq(0) || Date.now() / 1000 >= Number(pos.maturityTime));
    stakes.push({
      index: i,
      token: pos.token,
      tokenLabel,
      amount: pos.amount,
      amountFormatted: fmtEther(pos.amount),
      duration: pos.duration,
      maturityTime: pos.maturityTime,
      withdrawn: pos.withdrawn,
      canUnstake,
    });
    console.log(`  Position ${i}: ${isUsdc ? "USDC" : tokenLabel} - ${fmtEther(pos.amount)} | Duration: ${pos.duration} | Withdrawn: ${pos.withdrawn} | Maturity: ${pos.maturityTime.gt(0) ? new Date(Number(pos.maturityTime) * 1000).toISOString() : "flexible"} | Can unstake: ${canUnstake}`);
  }

  console.log("\n=== DAO SUBSCRIPTIONS ===");
  const candidateCount = await launchDao.getCandidateCount();
  console.log("Total candidates:", candidateCount.toString());
  const subs = [];
  for (let i = 0; i < Number(candidateCount); i++) {
    try {
      const sub = await launchDao.getSubscription(wallet.address, i);
      if (sub.usdcAmount.gt(0)) {
        let candName = "";
        try {
          const cand = await launchDao.candidates(i);
          candName = cand.name || cand.symbol || "";
        } catch {}
        subs.push({
          candidateId: i,
          name: candName,
          usdcAmount: sub.usdcAmount,
          usdcFormatted: fmtEther(sub.usdcAmount),
          isActive: sub.isActive,
          hasClaimed: sub.hasClaimed,
          hasRefunded: sub.hasRefunded,
        });
        console.log(`  Candidate ${i} (${candName}): USDC ${fmtEther(sub.usdcAmount)} | Active: ${sub.isActive} | Claimed: ${sub.hasClaimed} | Refunded: ${sub.hasRefunded}`);
      }
    } catch {}
  }

  if (mode === "sell") {
    console.log("\n=== SELLING ALL TOKENS ===");

    for (const h of holdings) {
      if (h.balance.eq(0)) continue;

      try {
        if (!h.isListed) {
          console.log(`\nSelling ${h.symbol} (internal curve)...`);
          const token = new ethers.Contract(h.address, ERC20_ABI, wallet);
          const allowance = await token.allowance(wallet.address, BONDING_CURVE);
          if (allowance.lt(h.balance)) {
            console.log(`  Approving ${h.symbol}...`);
            const approveTx = await token.approve(BONDING_CURVE, h.balance);
            await approveTx.wait();
            console.log(`  Approved.`);
          }

          const sellPrice = await bondingCurve.getSellPrice(h.address, h.balance);
          const minOut = sellPrice.mul(95).div(100);
          console.log(`  Selling ${h.balanceFormatted} ${h.symbol} for ~${fmtEther(sellPrice)} USDC (min: ${fmtEther(minOut)})`);
          const sellTx = await bondingCurve.sell(h.address, h.balance, minOut);
          await sellTx.wait();
          console.log(`  Sold! TX: ${sellTx.hash}`);
        } else {
          console.log(`\nSelling ${h.symbol} (DEX - external)...`);
          const token = new ethers.Contract(h.address, ERC20_ABI, wallet);
          const allowance = await token.allowance(wallet.address, SIMPLE_ROUTER);
          if (allowance.lt(h.balance)) {
            console.log(`  Approving ${h.symbol} for router...`);
            const approveTx = await token.approve(SIMPLE_ROUTER, h.balance);
            await approveTx.wait();
            console.log(`  Approved.`);
          }

          const swapPath = [h.address, WUSDC];
          let amountsOut;
          try {
            amountsOut = await simpleRouter.getAmountsOut(h.balance, swapPath);
          } catch {
            console.log(`  Cannot get price quote for ${h.symbol}, skipping...`);
            continue;
          }
          const minOut = amountsOut[amountsOut.length - 1].mul(95).div(100);
          console.log(`  Selling ${h.balanceFormatted} ${h.symbol} for ~${fmtEther(amountsOut[amountsOut.length - 1])} WUSDC (min: ${fmtEther(minOut)})`);

          const deadline = Math.floor(Date.now() / 1000) + 600;
          const swapTx = await simpleRouter.swapExactTokensForTokens(
            h.balance,
            minOut,
            swapPath,
            wallet.address,
            deadline
          );
          await swapTx.wait();
          console.log(`  Sold! TX: ${swapTx.hash}`);
        }
      } catch (err) {
        console.error(`  Failed to sell ${h.symbol}:`, err.message || err);
      }
    }

    console.log("\n=== UNSTAKING ALL POSITIONS ===");
    for (const s of stakes) {
      if (s.withdrawn) continue;
      if (!s.canUnstake) {
        console.log(`  Position ${s.index} not yet matured, skipping.`);
        continue;
      }
      try {
        console.log(`  Unstaking position ${s.index} (${s.tokenLabel}: ${s.amountFormatted})...`);
        const tx = await launchDao.unstakePosition(s.index);
        await tx.wait();
        console.log(`  Unstaked! TX: ${tx.hash}`);
      } catch (err) {
        console.error(`  Failed to unstake position ${s.index}:`, err.message || err);
      }
    }

    console.log("\n=== REFUNDING EXPIRED SUBSCRIPTIONS ===");
    for (const sub of subs) {
      if (sub.hasRefunded || sub.hasClaimed || !sub.isActive) continue;
      try {
        console.log(`  Refunding subscription for candidate ${sub.candidateId} (${sub.name}): ${sub.usdcFormatted} USDC...`);
        const tx = await launchDao.refundSubscription(sub.candidateId);
        await tx.wait();
        console.log(`  Refunded! TX: ${tx.hash}`);
      } catch (err) {
        console.error(`  Failed to refund candidate ${sub.candidateId}:`, err.message || err);
      }
    }

    console.log("\n=== FINAL BALANCE ===");
    const finalNative = await provider.getBalance(wallet.address);
    const finalWusdc = await wusdc.balanceOf(wallet.address);
    console.log("Native (ARC):", fmtEther(finalNative));
    console.log("WUSDC:", fmtEther(finalWusdc));
  } else {
    console.log("\n=== SUMMARY ===");
    let totalUsdcValue = ethers.BigNumber.from(0);
    for (const h of holdings) {
      if (!h.isListed && h.sellPrice.gt(0)) {
        totalUsdcValue = totalUsdcValue.add(h.sellPrice);
      }
    }
    for (const s of stakes) {
      if (!s.withdrawn && s.token === ZERO_ADDR) {
        totalUsdcValue = totalUsdcValue.add(s.amount);
      }
    }
    for (const sub of subs) {
      if (sub.isActive && !sub.hasRefunded && !sub.hasClaimed) {
        totalUsdcValue = totalUsdcValue.add(sub.usdcAmount);
      }
    }
    console.log("Estimated recoverable USDC (from curve tokens + USDC stakes + active subs):", fmtEther(totalUsdcValue));
    console.log("\nRun with 'sell' argument to execute all sells/unstakes/refunds:");
    console.log("  node scripts/check-and-sell.cjs sell");
  }
}

main().catch(console.error);
