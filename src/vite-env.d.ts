/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_BSC_TESTNET_RPC: string
  readonly VITE_BSC_MAINNET_RPC: string
  readonly VITE_PINATA_JWT: string
  readonly VITE_BONDING_CURVE_ADDRESS: string
  readonly VITE_FACTORY_ADDRESS: string
  readonly VITE_LONG_POOL_ADDRESS: string
  readonly VITE_SHORT_POOL_ADDRESS: string
  readonly VITE_BUY_AND_BURN_ADDRESS: string
  readonly VITE_LAUNCH_DAO_ADDRESS: string
  readonly VITE_PRICE_ORACLE_ADDRESS: string
  readonly VITE_FEE_DISTRIBUTOR_ADDRESS: string
  readonly VITE_CREATOR_REWARD_MANAGER_ADDRESS: string
  readonly VITE_EXP_RATE_MODEL_ADDRESS: string
  readonly VITE_LIN_RATE_MODEL_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
