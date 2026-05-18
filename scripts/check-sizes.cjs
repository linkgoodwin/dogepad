const fs = require("fs");
const items = [
  ["core/BondingCurve.sol", "BondingCurve"],
  ["core/BondingCurveToken.sol", "BondingCurveToken"],
  ["core/BondingCurveFactory.sol", "BondingCurveFactory"],
  ["dao/LaunchDAO.sol", "LaunchDAO"],
  ["periphery/BuyAndBurnEngine.sol", "BuyAndBurnEngine"],
  ["periphery/FeeDistributor.sol", "FeeDistributor"],
  ["periphery/PriceOracle.sol", "PriceOracle"],
  ["pool/LongPool.sol", "LongPool"],
  ["pool/ShortPool.sol", "ShortPool"],
  ["periphery/CreatorRewardManager.sol", "CreatorRewardManager"],
  ["periphery/ExponentialRateModel.sol", "ExponentialRateModel"],
  ["periphery/LinearRateModel.sol", "LinearRateModel"],
];
items.forEach(([dir, n]) => {
  try {
    const a = JSON.parse(fs.readFileSync(`artifacts/contracts/${dir}/${n}.json`, "utf8"));
    const sz = (a.deployedBytecode.length - 2) / 2;
    const pct = ((sz / 24576) * 100).toFixed(1);
    console.log(`${n}: ${sz} bytes (${pct}% of 24KB limit)${sz > 24576 ? " *** OVER LIMIT ***" : ""}`);
  } catch (e) {
    console.log(`${n}: ERROR - ${e.message}`);
  }
});
