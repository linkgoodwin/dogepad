const https = require("https");

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = https.request(
      { hostname: "arc-testnet.drpc.org", path: "/", method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(JSON.parse(b).result));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const addr = "0xfff9622f9488bbe1725228d9ec5AAc51AF709504";
  const nonce = await rpc("eth_getTransactionCount", [addr, "latest"]);
  const balance = await rpc("eth_getBalance", [addr, "latest"]);
  console.log("Nonce:", parseInt(nonce));
  console.log("Balance:", parseInt(balance) / 1e18, "USDC");
  
  const gasPrice = await rpc("eth_gasPrice", []);
  console.log("Gas Price:", parseInt(gasPrice) / 1e9, "Gwei");
  
  const blockNumber = await rpc("eth_blockNumber", []);
  console.log("Block Number:", parseInt(blockNumber));
}

main().catch(console.error);
