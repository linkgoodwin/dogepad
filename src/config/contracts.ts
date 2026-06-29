export const LAUNCH_DAO_ABI = [
  // === Core: 1-Hour Subscription Model ===
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
      { internalType: 'string', name: 'metadataURI', type: 'string' },
      { internalType: 'bool', name: '_wantTaxShare', type: 'bool' },
      { internalType: 'bool', name: '_wantLpShare', type: 'bool' },
      { internalType: 'bool', name: '_wantTokenAllocation', type: 'bool' },
    ],
    name: 'submitCandidate',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'candidateId', type: 'uint256' }],
    name: 'subscribeUsdc',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'candidateId', type: 'uint256' }],
    name: 'finalizeSubscription',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'candidateId', type: 'uint256' }],
    name: 'graduateToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'candidateId', type: 'uint256' }],
    name: 'refundSubscription',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // === Staking ===
  {
    inputs: [{ internalType: 'uint8', name: 'duration', type: 'uint8' }],
    name: 'stakeUsdc',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint8', name: 'duration', type: 'uint8' },
    ],
    name: 'stakeDoge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'positionId', type: 'uint256' }],
    name: 'unstakePosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimRights',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'candidateId', type: 'uint256' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'voteWithRights',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // === View Functions ===
  {
    inputs: [],
    name: 'getCandidateCount',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'candidates',
    outputs: [
      { internalType: 'address', name: 'proposer', type: 'address' },
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
      { internalType: 'string', name: 'metadataURI', type: 'string' },
      { internalType: 'uint256', name: 'totalSubUsdc', type: 'uint256' },
      { internalType: 'uint256', name: 'totalWeight', type: 'uint256' },
      { internalType: 'uint256', name: 'totalRightsVotes', type: 'uint256' },
      { internalType: 'uint256', name: 'submitTime', type: 'uint256' },
      { internalType: 'uint256', name: 'expireTime', type: 'uint256' },
      { internalType: 'enum LaunchDAO.CandidateStatus', name: 'status', type: 'uint8' },
      { internalType: 'address', name: 'launchedToken', type: 'address' },
      { internalType: 'uint256', name: 'launchedTokenSupply', type: 'uint256' },
      { internalType: 'uint256', name: 'launchedUsdcUsed', type: 'uint256' },
      { internalType: 'bool', name: 'wantTaxShare', type: 'bool' },
      { internalType: 'bool', name: 'wantLpShare', type: 'bool' },
      { internalType: 'bool', name: 'wantTokenAllocation', type: 'bool' },
      { internalType: 'uint256', name: 'walletCount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getActiveCandidates',
    outputs: [
      { internalType: 'uint256[]', name: 'ids', type: 'uint256[]' },
      { internalType: 'string[]', name: 'names', type: 'string[]' },
      { internalType: 'string[]', name: 'symbols', type: 'string[]' },
      { internalType: 'uint256[]', name: 'subUsdcs', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'weights', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'expireTimes', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'walletCounts', type: 'uint256[]' },
      { internalType: 'address[]', name: 'proposers', type: 'address[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getLaunchedCandidates',
    outputs: [
      { internalType: 'uint256[]', name: 'ids', type: 'uint256[]' },
      { internalType: 'string[]', name: 'names', type: 'string[]' },
      { internalType: 'address[]', name: 'tokens', type: 'address[]' },
      { internalType: 'uint256[]', name: 'subUsdcs', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getFailedCandidates',
    outputs: [
      { internalType: 'uint256[]', name: 'ids', type: 'uint256[]' },
      { internalType: 'string[]', name: 'names', type: 'string[]' },
      { internalType: 'uint256[]', name: 'subUsdcs', type: 'uint256[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'candidateId', type: 'uint256' }],
    name: 'getSubscribeTimeRemaining',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'uint256', name: 'candidateId', type: 'uint256' },
    ],
    name: 'getSubscription',
    outputs: [
      { internalType: 'uint256', name: 'usdcAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'subscribeTime', type: 'uint256' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
      { internalType: 'bool', name: 'hasClaimed', type: 'bool' },
      { internalType: 'bool', name: 'hasRefunded', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getStakePositions',
    outputs: [
      { internalType: 'address[]', name: 'tokens', type: 'address[]' },
      { internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'startTimes', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'durations', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'maturityTimes', type: 'uint256[]' },
      { internalType: 'bool[]', name: 'withdrawns', type: 'bool[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    name: 'getStakeDurationSeconds',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    name: 'getStakeMultiplierBps',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // === Config Views ===
  {
    inputs: [],
    name: 'bondingCurve',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeDistributor',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dogeToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'launchThreshold',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minSubThreshold',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minWallets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minSubscribeUsdc',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalStakedUsdc',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalStakedDoge',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // === Rights Views ===
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getPendingRights',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'userRawRights',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'userEffectiveSpent',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getEffectiveRights',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserTotalEffectiveRights',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'CONVERGE_THRESHOLD',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAX_EFFECTIVE_RIGHTS',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // === Admin Setters ===
  {
    inputs: [{ internalType: 'uint256', name: '_t', type: 'uint256' }],
    name: 'setLaunchThreshold',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_t', type: 'uint256' }],
    name: 'setMinSubThreshold',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_m', type: 'uint256' }],
    name: 'setMinWallets',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_m', type: 'uint256' }],
    name: 'setMinSubscribeUsdc',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_bc', type: 'address' }],
    name: 'setBondingCurve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_fd', type: 'address' }],
    name: 'setFeeDistributor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_d', type: 'address' }],
    name: 'setDogeToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const BONDING_CURVE_ABI = [
  // --- Ownership & Core Config ---
  {
    inputs: [],
    name: 'launchDao',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_launchDao', type: 'address' }],
    name: 'setLaunchDao',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultPresaleDuration',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultPresaleMaxPerUser',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultPresaleMinBuy',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultPresaleMaxTotal',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultPresalePrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_duration', type: 'uint256' },
      { internalType: 'uint256', name: '_maxPerUser', type: 'uint256' },
      { internalType: 'uint256', name: '_minBuy', type: 'uint256' },
      { internalType: 'uint256', name: '_maxTotal', type: 'uint256' },
      { internalType: 'uint256', name: '_price', type: 'uint256' },
    ],
    name: 'setPresaleDefaults',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Buy (v1: 3 params) ---
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'minTokensOut', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
    ],
    name: 'buy',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // --- Buy (v2: 4 params with referrer) ---
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'minTokensOut', type: 'uint256' },
      { internalType: 'address', name: 'recipient', type: 'address' },
      { internalType: 'address', name: 'referrer', type: 'address' },
    ],
    name: 'buy',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // --- Sell ---
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'tokenAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'minBnbOut', type: 'uint256' },
    ],
    name: 'sell',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Pricing ---
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'bnbAmount', type: 'uint256' },
    ],
    name: 'getBuyPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'tokenAmount', type: 'uint256' },
    ],
    name: 'getSellPrice',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // --- Reserve / Status ---
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getReserve',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'isListed',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // --- Token Info (v1) ---
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getTokenInfo',
    outputs: [
      { internalType: 'address', name: 'tokenAddress', type: 'address' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'totalSupply', type: 'uint256' },
      { internalType: 'uint256', name: 'reserveUsdc', type: 'uint256' },
      { internalType: 'uint256', name: 'tokensSold', type: 'uint256' },
      { internalType: 'bool', name: 'isListedOnDex', type: 'bool' },
      { internalType: 'uint256', name: 'dexListingThreshold', type: 'uint256' },
      { internalType: 'string', name: 'metadataURI', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // --- List on DEX ---
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'listOnDex',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Graduation ---
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'triggerGraduation',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Router / DEX config ---
  {
    inputs: [],
    name: 'dexRouter',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'baseAsset',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isXyloRouter',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dexLister',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // --- Factory ---
  {
    inputs: [],
    name: 'factory',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_factory', type: 'address' }],
    name: 'setFactory',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- FeeDist ---
  {
    inputs: [],
    name: 'feeDist',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_feeDist', type: 'address' }],
    name: 'setFeeDistributor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Create Token ---
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
      { internalType: 'uint256', name: 'totalSupply', type: 'uint256' },
      { internalType: 'string', name: 'metadataURI', type: 'string' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'bool', name: 'wantTaxShare', type: 'bool' },
      { internalType: 'bool', name: 'wantLpShare', type: 'bool' },
      { internalType: 'bool', name: 'wantTokenAllocation', type: 'bool' },
    ],
    name: 'createToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'payable',
    type: 'function',
  },
  // --- Create Token For DAO ---
  {
    inputs: [
      { internalType: 'string', name: 'name', type: 'string' },
      { internalType: 'string', name: 'symbol', type: 'string' },
      { internalType: 'uint256', name: 'totalSupply', type: 'uint256' },
      { internalType: 'string', name: 'metadataURI', type: 'string' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'voterAllocationBps', type: 'uint256' },
      { internalType: 'bool', name: 'wantTaxShare', type: 'bool' },
      { internalType: 'bool', name: 'wantLpShare', type: 'bool' },
      { internalType: 'bool', name: 'wantTokenAllocation', type: 'bool' },
    ],
    name: 'createTokenForDao',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_dexLister', type: 'address' }],
    name: 'setDexLister',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_priceOracle', type: 'address' }],
    name: 'setPriceOracle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_engine', type: 'address' }],
    name: 'setBuyAndBurnEngine',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // --- Owner ---
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const SHARED_LIQUIDITY_POOL_ABI = [
  {
    inputs: [],
    name: 'totalShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalUsdcValue',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'lpShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getPoolInfo',
    outputs: [
      { internalType: 'uint256', name: 'usdcBalance', type: 'uint256' },
      { internalType: 'uint256', name: 'tokenBalance', type: 'uint256' },
      { internalType: 'uint256', name: 'longOI', type: 'uint256' },
      { internalType: 'uint256', name: 'shortOI', type: 'uint256' },
      { internalType: 'uint256', name: 'maxOI', type: 'uint256' },
      { internalType: 'bool', name: 'active', type: 'bool' },
      { internalType: 'bool', name: 'solvent', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getNetExposure',
    outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getHealthFactor',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'lp', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'getLPShareValue',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'addLiquidity',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'shareAmount', type: 'uint256' },
    ],
    name: 'removeLiquidity',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const PERPETUAL_POOL_ABI = [
  {
    inputs: [],
    name: 'sharedLiquidityPool',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_slp', type: 'address' }],
    name: 'setSharedLiquidityPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'bool', name: 'isLong', type: 'bool' },
      { internalType: 'uint256', name: 'marginUsdc', type: 'uint256' },
      { internalType: 'uint256', name: 'leverage', type: 'uint256' },
    ],
    name: 'openPosition',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'closePosition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'closeSize', type: 'uint256' },
    ],
    name: 'closePositionPartial',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'addMargin',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'removeMargin',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'tpPrice', type: 'uint256' },
      { internalType: 'uint256', name: 'slPrice', type: 'uint256' },
    ],
    name: 'setTpsl',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'cancelTpsl',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'bool', name: 'isTp', type: 'bool' },
    ],
    name: 'executeTpsl',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'bool', name: 'isLong', type: 'bool' },
      { internalType: 'uint256', name: 'marginUsdc', type: 'uint256' },
      { internalType: 'uint256', name: 'leverage', type: 'uint256' },
      { internalType: 'uint256', name: 'triggerPrice', type: 'uint256' },
      { internalType: 'bool', name: 'isTriggerAbove', type: 'bool' },
    ],
    name: 'placeLimitOrder',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'orderId', type: 'uint256' }],
    name: 'cancelLimitOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'orderId', type: 'uint256' }],
    name: 'executeLimitOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'borrower', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'liquidate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'getPosition',
    outputs: [
      { internalType: 'uint256', name: 'margin', type: 'uint256' },
      { internalType: 'uint256', name: 'size', type: 'uint256' },
      { internalType: 'uint256', name: 'entryPrice', type: 'uint256' },
      { internalType: 'uint256', name: 'lastFundingTime_', type: 'uint256' },
      { internalType: 'bool', name: 'isLong', type: 'bool' },
      { internalType: 'bool', name: 'isActive', type: 'bool' },
      { internalType: 'uint256', name: 'tpPrice', type: 'uint256' },
      { internalType: 'uint256', name: 'slPrice', type: 'uint256' },
      { internalType: 'bool', name: 'hasTpsl', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'getMarginRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'user', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
    ],
    name: 'getPnl',
    outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getOpenInterest',
    outputs: [
      { internalType: 'uint256', name: 'longOI', type: 'uint256' },
      { internalType: 'uint256', name: 'shortOI', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'isTokenListedForPerp',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getListedTokens',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'listedTokens',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'defaultToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAINTENANCE_MARGIN_RATIO',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MAX_LEVERAGE',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'FUNDING_INTERVAL',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'getUserLimitOrders',
    outputs: [
      { internalType: 'uint256[]', name: 'orderIds', type: 'uint256[]' },
      { internalType: 'address[]', name: 'tokens', type: 'address[]' },
      { internalType: 'bool[]', name: 'isLongs', type: 'bool[]' },
      { internalType: 'uint256[]', name: 'margins', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'leverages', type: 'uint256[]' },
      { internalType: 'uint256[]', name: 'triggerPrices', type: 'uint256[]' },
      { internalType: 'bool[]', name: 'isTriggerAboves', type: 'bool[]' },
      { internalType: 'bool[]', name: 'actives', type: 'bool[]' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolFeeBps',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'baseFundingRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'tokenInsuranceFund',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalInsuranceFund',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'isLong', type: 'bool' },
      { indexed: false, internalType: 'uint256', name: 'margin', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'size', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'entryPrice', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'PositionOpened',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'isLong', type: 'bool' },
      { indexed: false, internalType: 'uint256', name: 'margin', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'size', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'exitPrice', type: 'uint256' },
      { indexed: false, internalType: 'int256', name: 'pnl', type: 'int256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'PositionClosed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'bool', name: 'isLong', type: 'bool' },
      { indexed: false, internalType: 'uint256', name: 'closeSize', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'remainingSize', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'exitPrice', type: 'uint256' },
      { indexed: false, internalType: 'int256', name: 'closePnl', type: 'int256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'PositionPartiallyClosed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'tpPrice', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'slPrice', type: 'uint256' },
    ],
    name: 'TpslSet',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: false, internalType: 'int256', name: 'rate', type: 'int256' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'FundingRateUpdated',
    type: 'event',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getDynamicFundingRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'getPriceDeviation',
    outputs: [
      { internalType: 'uint256', name: 'markPrice', type: 'uint256' },
      { internalType: 'uint256', name: 'spotPrice', type: 'uint256' },
      { internalType: 'uint256', name: 'deviation', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'token', type: 'address' }],
    name: 'isCircuitBreakerActive',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'injectInsuranceFund',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
      { indexed: false, internalType: 'address', name: 'sender', type: 'address' },
    ],
    name: 'InsuranceFundInjected',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'CircuitBreakerTriggered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'token', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'timestamp', type: 'uint256' },
    ],
    name: 'CircuitBreakerResumed',
    type: 'event',
  },
] as const

export const DAILY_CHECKIN_ABI = [
  { inputs: [], name: 'checkin', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'address', name: '_referrer', type: 'address' }], name: 'bindReferrer', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'user', type: 'address' }], name: 'getUserInfo', outputs: [{ internalType: 'uint256', name: 'lastCheckinDay', type: 'uint256' }, { internalType: 'uint256', name: 'streak', type: 'uint256' }, { internalType: 'uint256', name: 'totalClaimed', type: 'uint256' }, { internalType: 'address', name: 'referrer', type: 'address' }, { internalType: 'uint256', name: 'refEarnings', type: 'uint256' }, { internalType: 'uint256', name: 'refCount', type: 'uint256' }, { internalType: 'bool', name: 'canCheckinToday', type: 'bool' }, { internalType: 'uint256', name: 'todayReward', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: 'user', type: 'address' }], name: 'getReferralLink', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'pure', type: 'function' },
  { inputs: [], name: 'contractBalance', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'rewardToken', outputs: [{ internalType: 'address', name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'baseReward', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'dailyIncrement', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'maxStreak', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'referrerRate', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'paused', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalDeposited', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalClaimedAll', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'totalCheckins', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ internalType: 'address', name: '_token', type: 'address' }], name: 'setRewardToken', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }], name: 'depositTokens', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'uint256', name: '_baseReward', type: 'uint256' }, { internalType: 'uint256', name: '_dailyIncrement', type: 'uint256' }, { internalType: 'uint256', name: '_maxStreak', type: 'uint256' }, { internalType: 'uint256', name: '_referrerRate', type: 'uint256' }], name: 'setParameters', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ internalType: 'bool', name: '_paused', type: 'bool' }], name: 'setPaused', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, internalType: 'address', name: 'user', type: 'address' }, { indexed: false, internalType: 'uint256', name: 'day', type: 'uint256' }, { indexed: false, internalType: 'uint256', name: 'streak', type: 'uint256' }, { indexed: false, internalType: 'uint256', name: 'reward', type: 'uint256' }, { indexed: false, internalType: 'uint256', name: 'refReward', type: 'uint256' }], name: 'CheckedIn', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, internalType: 'address', name: 'user', type: 'address' }, { indexed: true, internalType: 'address', name: 'referrer', type: 'address' }], name: 'ReferrerBound', type: 'event' },
  { anonymous: false, inputs: [{ indexed: true, internalType: 'address', name: 'token', type: 'address' }], name: 'RewardTokenSet', type: 'event' },
] as const

export const FEE_DISTRIBUTOR_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'duration', type: 'uint256' },
    ],
    name: 'stakeDoge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'amount', type: 'uint256' }],
    name: 'unstakeDoge',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimDividend',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user_', type: 'address' }],
    name: 'pendingDividend',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'user_', type: 'address' }],
    name: 'getStakedDoge',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalStakedDoge',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalDistributed',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalBurned',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalLent',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dividendRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'burnRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'perpPoolRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dogeToken',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'minStakeDuration',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'users',
    outputs: [
      { internalType: 'uint256', name: 'stakedDoge', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardDebt', type: 'uint256' },
      { internalType: 'uint256', name: 'pendingRewards', type: 'uint256' },
      { internalType: 'uint256', name: 'stakeTimestamp', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const BSC_MAINNET = 56
const BSC_TESTNET = 97
const MONAD_TESTNET = 10143
const ARC_TESTNET = 5042002
const ZERO = '0x0000000000000000000000000000000000000000' as `0x${string}`

export const DEFAULT_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || ARC_TESTNET

function envAddr(key: string): `0x${string}` | null {
  const val = import.meta.env[key]
  if (val && val.startsWith('0x') && val.length === 42) return val as `0x${string}`
  return null
}

function resolveAddr(primary: string, fallback: string, hardcoded?: `0x${string}`): `0x${string}` {
  return envAddr(primary) ?? envAddr(fallback) ?? hardcoded ?? ZERO
}

export interface ContractAddresses {
  launchDAO: `0x${string}`
  bondingCurve: `0x${string}`
  dexLister: `0x${string}`
  perpetualPool: `0x${string}`
  sharedLiquidityPool?: `0x${string}`
  buyAndBurn: `0x${string}`
  priceOracle: `0x${string}`
  feeDistributor: `0x${string}`
  creatorRewardManager: `0x${string}`
  factory: `0x${string}`
  simpleFactory: `0x${string}`
  simpleRouter: `0x${string}`
  // Token addresses
  wusdc?: `0x${string}`
  baseAsset?: `0x${string}`
  dailyCheckin?: `0x${string}`
}

export const CONTRACT_ADDRESSES: Record<number, ContractAddresses> = {
  [BSC_TESTNET]: {
    launchDAO: resolveAddr('VITE_TESTNET_LAUNCH_DAO_ADDRESS', 'VITE_LAUNCH_DAO_ADDRESS', '0xb6eb6E4AD179B8296b48b850cbb34ce40846F866'),
    bondingCurve: resolveAddr('VITE_TESTNET_BONDING_CURVE_ADDRESS', 'VITE_BONDING_CURVE_ADDRESS', '0x0248D9924E873A962A7452b840D065bFf7C4e7fA'),
    dexLister: resolveAddr('VITE_TESTNET_DEX_LISTER_ADDRESS', 'VITE_DEX_LISTER_ADDRESS'),
    perpetualPool: resolveAddr('VITE_TESTNET_PERPETUAL_POOL_ADDRESS', 'VITE_PERPETUAL_POOL_ADDRESS'),
    buyAndBurn: resolveAddr('VITE_TESTNET_BUY_AND_BURN_ADDRESS', 'VITE_BUY_AND_BURN_ADDRESS', '0x91FbC0E3d92ce43CdFa4085e45547dc34f3bE5ca'),
    priceOracle: resolveAddr('VITE_TESTNET_PRICE_ORACLE_ADDRESS', 'VITE_PRICE_ORACLE_ADDRESS', '0x7857dc9866f26926E505B067C7A8e323D863F938'),
    feeDistributor: resolveAddr('VITE_TESTNET_FEE_DISTRIBUTOR_ADDRESS', 'VITE_FEE_DISTRIBUTOR_ADDRESS', '0xD0bf15a8314b2eD9CEa18CfBC7127A169fE44E67'),
    creatorRewardManager: resolveAddr('VITE_TESTNET_CREATOR_REWARD_MANAGER_ADDRESS', 'VITE_CREATOR_REWARD_MANAGER_ADDRESS', '0x91d822402442dbCecb29Fc5f734D910b8EC1a880'),
    factory: resolveAddr('VITE_TESTNET_FACTORY_ADDRESS', 'VITE_FACTORY_ADDRESS', '0xDd12e51d478D98199C17F995f395D3F45AcdC52C'),
    simpleFactory: resolveAddr('VITE_TESTNET_SIMPLE_FACTORY_ADDRESS', 'VITE_SIMPLE_FACTORY_ADDRESS'),
    simpleRouter: resolveAddr('VITE_TESTNET_SIMPLE_ROUTER_ADDRESS', 'VITE_SIMPLE_ROUTER_ADDRESS'),
  },
  [BSC_MAINNET]: {
    launchDAO: resolveAddr('VITE_MAINNET_LAUNCH_DAO_ADDRESS', 'VITE_LAUNCH_DAO_ADDRESS', '0xB8EBdD1278BA266f8261812B04c4B174FEF8095e'),
    bondingCurve: resolveAddr('VITE_MAINNET_BONDING_CURVE_ADDRESS', 'VITE_BONDING_CURVE_ADDRESS', '0x9440736180F32723b4E8c7DbcA4CFa288935F355'),
    dexLister: resolveAddr('VITE_MAINNET_DEX_LISTER_ADDRESS', 'VITE_DEX_LISTER_ADDRESS'),
    perpetualPool: resolveAddr('VITE_MAINNET_PERPETUAL_POOL_ADDRESS', 'VITE_PERPETUAL_POOL_ADDRESS'),
    buyAndBurn: resolveAddr('VITE_MAINNET_BUY_AND_BURN_ADDRESS', 'VITE_BUY_AND_BURN_ADDRESS', '0x63940E8B9Df7608a689798af42d156876b753802'),
    priceOracle: resolveAddr('VITE_MAINNET_PRICE_ORACLE_ADDRESS', 'VITE_PRICE_ORACLE_ADDRESS', '0xbc91660D4a4a4642A891230BF9DDF40B3d2A3E50'),
    feeDistributor: resolveAddr('VITE_MAINNET_FEE_DISTRIBUTOR_ADDRESS', 'VITE_FEE_DISTRIBUTOR_ADDRESS', '0x7736C3E7434D2BA964e65254ceBEf5273d381c0d'),
    creatorRewardManager: resolveAddr('VITE_MAINNET_CREATOR_REWARD_MANAGER_ADDRESS', 'VITE_CREATOR_REWARD_MANAGER_ADDRESS', '0xbeeCe0EE103c51ae4eFB9AFefA529355030dDfb5'),
    factory: resolveAddr('VITE_MAINNET_FACTORY_ADDRESS', 'VITE_FACTORY_ADDRESS', '0xE9DEC6193a32B5520617b7eCF1D6cfafba40898B'),
    simpleFactory: resolveAddr('VITE_MAINNET_SIMPLE_FACTORY_ADDRESS', 'VITE_SIMPLE_FACTORY_ADDRESS'),
    simpleRouter: resolveAddr('VITE_MAINNET_SIMPLE_ROUTER_ADDRESS', 'VITE_SIMPLE_ROUTER_ADDRESS'),
  },
  [MONAD_TESTNET]: {
    launchDAO: resolveAddr('VITE_MONAD_TESTNET_LAUNCH_DAO_ADDRESS', 'VITE_LAUNCH_DAO_ADDRESS'),
    bondingCurve: resolveAddr('VITE_MONAD_TESTNET_BONDING_CURVE_ADDRESS', 'VITE_BONDING_CURVE_ADDRESS'),
    dexLister: resolveAddr('VITE_MONAD_TESTNET_DEX_LISTER_ADDRESS', 'VITE_DEX_LISTER_ADDRESS'),
    perpetualPool: resolveAddr('VITE_MONAD_TESTNET_PERPETUAL_POOL_ADDRESS', 'VITE_PERPETUAL_POOL_ADDRESS'),
    buyAndBurn: resolveAddr('VITE_MONAD_TESTNET_BUY_AND_BURN_ADDRESS', 'VITE_BUY_AND_BURN_ADDRESS'),
    priceOracle: resolveAddr('VITE_MONAD_TESTNET_PRICE_ORACLE_ADDRESS', 'VITE_PRICE_ORACLE_ADDRESS'),
    feeDistributor: resolveAddr('VITE_MONAD_TESTNET_FEE_DISTRIBUTOR_ADDRESS', 'VITE_FEE_DISTRIBUTOR_ADDRESS'),
    creatorRewardManager: resolveAddr('VITE_MONAD_TESTNET_CREATOR_REWARD_MANAGER_ADDRESS', 'VITE_CREATOR_REWARD_MANAGER_ADDRESS'),
    factory: resolveAddr('VITE_MONAD_TESTNET_FACTORY_ADDRESS', 'VITE_FACTORY_ADDRESS'),
    simpleFactory: resolveAddr('VITE_MONAD_TESTNET_SIMPLE_FACTORY_ADDRESS', 'VITE_SIMPLE_FACTORY_ADDRESS'),
    simpleRouter: resolveAddr('VITE_MONAD_TESTNET_SIMPLE_ROUTER_ADDRESS', 'VITE_SIMPLE_ROUTER_ADDRESS'),
  },
  [ARC_TESTNET]: {
    launchDAO: resolveAddr('VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS', 'VITE_LAUNCH_DAO_ADDRESS', '0xB7E0660390f407b7e2f1182Fe3F206bf53cA631f'),
    bondingCurve: resolveAddr('VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS', 'VITE_BONDING_CURVE_ADDRESS', '0x26Fb6023502F882E4531f10460492F563e73d918'),
    dexLister: resolveAddr('VITE_ARC_TESTNET_DEX_LISTER_ADDRESS', 'VITE_DEX_LISTER_ADDRESS', '0x500D1773506284D2a951B2B218151b32D118dFC8'),
    perpetualPool: resolveAddr('VITE_ARC_TESTNET_PERPETUAL_POOL_ADDRESS', 'VITE_PERPETUAL_POOL_ADDRESS', '0xBD3155CBb17DbE6358D31d93cd2D5F6e2E3bb499'),
    sharedLiquidityPool: resolveAddr('VITE_ARC_TESTNET_SHARED_LIQUIDITY_POOL_ADDRESS', 'VITE_SHARED_LIQUIDITY_POOL_ADDRESS', '0x962351e0e920AdE762EFB978EA3FAD138478a173'),
    buyAndBurn: resolveAddr('VITE_ARC_TESTNET_BUY_AND_BURN_ADDRESS', 'VITE_BUY_AND_BURN_ADDRESS', '0x2940F9B412A4817f3c4327EaB0016a74112E9102'),
    priceOracle: resolveAddr('VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS', 'VITE_PRICE_ORACLE_ADDRESS', '0xbCeC9B5bE183efeC684dfCB53642cCbF4398050c'),
    feeDistributor: resolveAddr('VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS', 'VITE_FEE_DISTRIBUTOR_ADDRESS', '0x447ac9048637f8A0a3f30E1b29Cf84cFBc62e5b0'),
    creatorRewardManager: resolveAddr('VITE_ARC_TESTNET_CREATOR_REWARD_MANAGER_ADDRESS', 'VITE_CREATOR_REWARD_MANAGER_ADDRESS', '0xBad4691B5DCd50bC023295B448ae4952425bA894'),
    factory: resolveAddr('VITE_ARC_TESTNET_FACTORY_ADDRESS', 'VITE_FACTORY_ADDRESS', '0x533AF2EE8018865350da76c90cF12b99ed2b2E09'),
    simpleFactory: resolveAddr('VITE_ARC_TESTNET_SIMPLE_FACTORY_ADDRESS', 'VITE_SIMPLE_FACTORY_ADDRESS', '0xe33B42e94A58d7191196209aFd61B19c776FDcA1'),
    simpleRouter: resolveAddr('VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS', 'VITE_SIMPLE_ROUTER_ADDRESS', '0x307E97e90025e5924FD00CD5Af005AC18333a669'),
    wusdc: resolveAddr('VITE_ARC_TESTNET_WUSDC_ADDRESS', 'VITE_WUSDC_ADDRESS', '0x911b4000D3422F482F4062a913885f7b035382Df'),
    baseAsset: resolveAddr('VITE_ARC_TESTNET_BASE_ASSET_ADDRESS', 'VITE_BASE_ASSET_ADDRESS', '0x911b4000D3422F482F4062a913885f7b035382Df'),
    dailyCheckin: resolveAddr('VITE_ARC_TESTNET_DAILY_CHECKIN_ADDRESS', 'VITE_DAILY_CHECKIN_ADDRESS', '0xDefba228e66bc2905A56Ca412e70896D75bd4bdb'),
  },
}

export type ContractName = keyof ContractAddresses

export function getContractAddress(chainId: number, contract: ContractName): `0x${string}` {
  return CONTRACT_ADDRESSES[chainId]?.[contract] ?? ZERO
}

export function isZeroAddress(addr: `0x${string}`): boolean {
  return addr === ZERO
}

export function isTestnet(chainId: number): boolean {
  return chainId !== BSC_MAINNET
}

export function isMainnet(chainId: number): boolean {
  return chainId === BSC_MAINNET
}

export function isMonadTestnet(chainId: number): boolean {
  return chainId === MONAD_TESTNET
}

export function isArcTestnet(chainId: number): boolean {
  return chainId === ARC_TESTNET
}

export function getNetworkName(chainId: number): string {
  if (chainId === BSC_MAINNET) return 'BSC Mainnet'
  if (chainId === BSC_TESTNET) return 'BSC Testnet'
  if (chainId === MONAD_TESTNET) return 'Monad Testnet'
  if (chainId === ARC_TESTNET) return 'Arc Testnet'
  return `Chain ${chainId}`
}

export function getNativeSymbol(chainId: number): string {
  if (chainId === ARC_TESTNET) return 'USDC'
  if (chainId === MONAD_TESTNET) return 'MON'
  return 'BNB'
}

export function getBscScanUrl(chainId: number, type: 'tx' | 'address' | 'token', value: string): string {
  if (chainId === ARC_TESTNET) {
    return `https://testnet.arcscan.app/${type}/${value}`
  }
  if (chainId === MONAD_TESTNET) {
    return `https://testnet.monadvision.com/${type}/${value}`
  }
  const base = isTestnet(chainId) ? 'https://testnet.bscscan.com' : 'https://bscscan.com'
  return `${base}/${type}/${value}`
}
