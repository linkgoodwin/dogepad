import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { DEFAULT_CHAIN_ID, isTestnet, getNetworkName } from '@/config/contracts'
import { bsc, bscTestnet } from 'wagmi/chains'
import { monadTestnet, arcTestnet } from '@/config/wagmi'

export function useTargetChainId() {
  const { isConnected } = useAccount()
  const walletChainId = useChainId()
  return isConnected ? walletChainId : DEFAULT_CHAIN_ID
}

export function useNetworkSwitcher() {
  const { isConnected } = useAccount()
  const walletChainId = useChainId()
  const { switchChain } = useSwitchChain()
  const targetChainId = useTargetChainId()

  const isWrongNetwork = isConnected && walletChainId !== DEFAULT_CHAIN_ID
  const isTestnetMode = isTestnet(targetChainId)
  const networkName = getNetworkName(targetChainId)

  const switchToTestnet = () => switchChain?.({ chainId: bscTestnet.id })
  const switchToMainnet = () => switchChain?.({ chainId: bsc.id })
  const switchToMonad = () => switchChain?.({ chainId: monadTestnet.id })
  const switchToArc = () => switchChain?.({ chainId: arcTestnet.id })
  const switchToDefault = () => switchChain?.({ chainId: DEFAULT_CHAIN_ID })

  return {
    targetChainId,
    isWrongNetwork,
    isTestnetMode,
    networkName,
    switchToTestnet,
    switchToMainnet,
    switchToMonad,
    switchToArc,
    switchToDefault,
  }
}
