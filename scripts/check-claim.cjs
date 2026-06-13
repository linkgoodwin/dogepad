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
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const ZERO_ADDR = ethers.constants.AddressZero;
const fmtEther = ethers.utils.formatEther;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const BONDING_CURVE_ABI = [
  "function getSellPrice(address token, uint256 tokenAmount) view returns (uint256)",
  "function isListed(address token) view returns (bool)",
  "function getReserve(address token) view returns (uint256)",
  "function sell(address token, uint256 tokenAmount, uint256 minUsdcOut)",
];

const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("DEPLOYER_PRIVATE_KEY not found in .env");
  process.exit(1);
}
const wallet = new ethers.Wallet(pk, provider);
console.log("Wallet:", wallet.address);

async function main() {
  const nativeBal = await provider.getBalance(wallet.address);
  console.log("Native balance:", fmtEther(nativeBal));

  const wusdc = new ethers.Contract(WUSDC, ERC20_ABI, provider);
  const wusdcBal = await wusdc.balanceOf(wallet.address);
  console.log("WUSDC balance:", fmtEther(wusdcBal));

  const dao = new ethers.Contract(LAUNCH_DAO, [
    "function getCandidateStatus(uint256) view returns (uint8)",
    "function getSubscription(address,uint256) view returns (uint256,uint256,uint256,bool,bool,bool)",
  ], provider);

  const status = await dao.getCandidateStatus(0);
  console.log("Candidate 0 status:", status, "(2=Launched)");

  const sub = await dao.getSubscription(wallet.address, 0);
  console.log("Subscription: usdcAmount=" + fmtEther(sub[0]) + " isActive=" + sub[3] + " hasClaimed=" + sub[4] + " hasRefunded=" + sub[5]);

  const bondingCurve = new ethers.Contract(BONDING_CURVE, BONDING_CURVE_ABI, wallet);

  const factory = new ethers.Contract(FACTORY, [
    "function allTokensLength() view returns (uint256)",
    "function allTokens(uint256) view returns (address)",
  ], provider);

  const tokenCount = await factory.allTokensLength();
  console.log("Factory token count:", tokenCount.toString());

  for (let i = 0; i < Number(tokenCount); i++) {
    const tokenAddr = await factory.allTokens(i);
    const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
    const balance = await token.balanceOf(wallet.address);
    if (balance.gt(0)) {
      let symbol = "???";
      try { symbol = await token.symbol(); } catch {}
      const isListed = await bondingCurve.isListed(tokenAddr);
      let sellPrice = ethers.BigNumber.from(0);
      if (!isListed) {
        try { sellPrice = await bondingCurve.getSellPrice(tokenAddr, balance); } catch {}
      }
      console.log("  Token " + i + ": " + symbol + " balance=" + fmtEther(balance) + " listed=" + isListed + " sellValue=" + fmtEther(sellPrice) + " USDC");

      if (process.argv[2] === "sell" && balance.gt(0)) {
        try {
          if (!isListed) {
            const allowance = await token.allowance(wallet.address, BONDING_CURVE);
            if (allowance.lt(balance)) {
              console.log("  Approving...");
              const approveTx = await token.approve(BONDING_CURVE, balance);
              await approveTx.wait();
            }
            const sp = await bondingCurve.getSellPrice(tokenAddr, balance);
            const minOut = sp.mul(95).div(100);
            console.log("  Selling " + fmtEther(balance) + " for ~" + fmtEther(sp) + " USDC...");
            const sellTx = await bondingCurve.sell(tokenAddr, balance, minOut);
            await sellTx.wait();
            console.log("  Sold! TX:", sellTx.hash);
          }
        } catch (err) {
          console.error("  Failed:", err.message?.substring(0, 200));
        }
      }
    }
  }

  if (process.argv[2] === "sell") {
    const finalNative = await provider.getBalance(wallet.address);
    const finalWusdc = await wusdc.balanceOf(wallet.address);
    console.log("\nFinal Native:", fmtEther(finalNative));
    console.log("Final WUSDC:", fmtEther(finalWusdc));
  }
}

main().catch(console.error);
