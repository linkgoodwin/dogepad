const { ethers } = require("ethers");

const ARC_RPC = "https://rpc.testnet.arc.network";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);

  const factories = [
    { label: "OLD", addr: "0x632Ea980839E06978E4067ed73f8BB65Bb8e2665" },
    { label: "NEW", addr: "0xaBb9b39bd088460268F19004bDE3929c08D62613" },
  ];

  const routers = [
    { label: "OLD", addr: "0x91eB3468D6873d6623ab9917BC26e4414613Ac6B" },
    { label: "NEW", addr: "0x5c91fdf253490E3577052C5BB12D8730F1cAF648" },
  ];

  const FACTORY_ABI = ["function owner() view returns (address)", "function allPairsLength() view returns (uint256)"];
  const ROUTER_ABI = ["function factory() view returns (address)", "function wusdc() view returns (address)"];

  console.log("=== Factory contracts ===");
  for (const f of factories) {
    try {
      const c = new ethers.Contract(f.addr, FACTORY_ABI, provider);
      const code = await provider.getCode(f.addr);
      console.log(`${f.label} (${f.addr}):`);
      console.log(`  code size: ${code.length}`);
      if (code !== "0x") {
        const owner = await c.owner();
        const pairs = await c.allPairsLength();
        console.log(`  owner: ${owner}`);
        console.log(`  pairs: ${pairs}`);
      } else {
        console.log("  NO CODE");
      }
    } catch (e) {
      console.log(`${f.label}: ERROR - ${e.message}`);
    }
  }

  console.log("\n=== Router contracts ===");
  for (const r of routers) {
    try {
      const c = new ethers.Contract(r.addr, ROUTER_ABI, provider);
      const code = await provider.getCode(r.addr);
      console.log(`${r.label} (${r.addr}):`);
      console.log(`  code size: ${code.length}`);
      if (code !== "0x") {
        const factory = await c.factory();
        const wusdc = await c.wusdc();
        console.log(`  factory: ${factory}`);
        console.log(`  wusdc: ${wusdc}`);
      } else {
        console.log("  NO CODE");
      }
    } catch (e) {
      console.log(`${r.label}: ERROR - ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
