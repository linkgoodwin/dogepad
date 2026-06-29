import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import * as dotenv from "dotenv"
import * as path from "path"

// Load .env from project root (two levels up from deploy/hardhat/)
dotenv.config({ path: path.resolve(__dirname, "../../.env") })

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 97,
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC || "https://bsc-dataseed.binance.org/",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 56,
    },
    arcTestnet: {
      url: process.env.ARC_RPC || "https://rpc.testnet.arc.network",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 5042002,
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY || "",
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
    },
  },
}

export default config
