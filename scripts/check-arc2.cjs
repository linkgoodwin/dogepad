const https = require("https");

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 });
    const req = https.request(
      { hostname: "arc-testnet.drpc.org", path: "/", method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          const r = JSON.parse(b);
          resolve(r.result || r.error);
        });
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
  const pendingNonce = await rpc("eth_getTransactionCount", [addr, "pending"]);
  console.log("Latest Nonce:", parseInt(nonce));
  console.log("Pending Nonce:", parseInt(pendingNonce));
  
  for (let i = 0; i < parseInt(pendingNonce); i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [
      await rpc("eth_getTransactionByIndex", [i])
    ]);
    console.log(`Tx ${i}:`, receipt ? "confirmed" : "not found");
  }
  
  const gasPrice = await rpc("eth_gasPrice", []);
  console.log("Network Gas Price:", parseInt(gasPrice) / 1e9, "Gwei");
  
  const chainId = await rpc("eth_chainId", []);
  console.log("Chain ID:", parseInt(chainId));
}

main().catch(console.error);
