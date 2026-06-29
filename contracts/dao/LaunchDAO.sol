// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBondingCurveLaunch {
    function createTokenForDao(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address creator,
        uint256 voterAllocationBps,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external returns (address);

    function buy(address token, uint256 minTokensOut, address recipient) external payable;
    function listOnDex(address token) external;
    function triggerGraduation(address token) external;
    function getReserve(address token) external view returns (uint256);
}

interface IBondingCurveTokenExclude {
    function excludeFromTax(address account) external;
    function excludeFromHoldingLimit(address account) external;
    function setSkipHoldingLimit(bool skip) external;
}

contract LaunchDAO is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // === Subscription Parameters (all configurable) ===
    uint256 public constant SUBSCRIBE_DURATION = 1 hours;
    uint256 public constant FIXED_TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public launchThreshold = 20 ether;       // testnet 20U, mainnet 20000U
    uint256 public minSubThreshold = 3 ether;         // min total subscription: testnet 3U, mainnet 1000U
    uint256 public minWallets = 3;                    // min unique wallets: testnet 3, mainnet 10
    uint256 public minSubscribeUsdc = 1 ether;        // min per tx: testnet 1U, mainnet 10U

    // === Staking Constants ===
    uint256 public constant MIN_STAKE = 1e17;
    uint256 public constant MAX_STAKE = 300 ether;
    uint256 public constant RIGHTS_CYCLE = 8 hours;
    uint256 public constant RIGHTS_DENOMINATOR = 6e21;
    uint256 public constant USDC_RIGHTS_BASE = 600;
    uint256 public constant DOGE_RIGHTS_BASE = 6;
    uint256 public constant CONVERGE_THRESHOLD = 500;
    uint256 public constant MAX_EFFECTIVE_RIGHTS = 1000;
    uint256 public constant DEMAND_BPS = 100;
    uint256 public constant FIXED_30_BPS = 150;
    uint256 public constant FIXED_90_BPS = 200;
    uint256 public constant FIXED_180_BPS = 300;
    uint256 public constant FIXED_30_DURATION = 30 days;
    uint256 public constant FIXED_90_DURATION = 90 days;
    uint256 public constant FIXED_180_DURATION = 180 days;
    uint256 public constant SUBSCRIBE_DENOM = 1e20;
    uint256 public constant SUBSCRIBE_USDC_WEIGHT = 10000;

    // === Enums ===
    enum CandidateStatus { Active, Launched, Failed }
    enum StakeDuration { Demand, Days30, Days90, Days180 }

    // === Structs ===
    struct Candidate {
        address proposer;
        string name;
        string symbol;
        string metadataURI;
        uint256 totalSubUsdc;
        uint256 totalWeight;
        uint256 totalRightsVotes;
        uint256 submitTime;
        uint256 expireTime;
        CandidateStatus status;
        address launchedToken;
        uint256 launchedTokenSupply;
        uint256 launchedUsdcUsed;
        bool wantTaxShare;
        bool wantLpShare;
        bool wantTokenAllocation;
        uint256 walletCount;
    }

    struct Subscription {
        uint256 usdcAmount;
        uint256 subscribeTime;
        bool isActive;
        bool hasClaimed;
        bool hasRefunded;
    }

    struct StakePosition {
        address token;
        uint256 amount;
        uint256 startTime;
        StakeDuration duration;
        uint256 maturityTime;
        bool withdrawn;
        uint256 lastRightsClaimTime;
    }

    // === State ===
    address public bondingCurve;
    address public feeDistributor;
    address public dogeToken;

    Candidate[] public candidates;
    mapping(address => mapping(uint256 => Subscription)) public userSubscriptions;
    mapping(address => StakePosition[]) public userStakePositions;
    mapping(address => uint256) public userRawRights;
    mapping(address => uint256) public userEffectiveSpent;
    uint256 public totalStakedUsdc;
    uint256 public totalStakedDoge;
    mapping(uint256 => address[]) public candidateSupporters;
    mapping(uint256 => mapping(address => bool)) public isSupporter;

    // === Events ===
    event Subscribed(address indexed user, uint256 indexed candidateId, uint256 usdcAmount, uint256 weight);
    event SubscriptionClaimed(address indexed user, uint256 indexed candidateId, address token, uint256 tokenAmount);
    event SubscriptionRefunded(address indexed user, uint256 indexed candidateId, uint256 usdcAmount);
    event Staked(address indexed user, address token, uint256 amount, StakeDuration duration, uint256 positionId);
    event Unstaked(address indexed user, uint256 positionId, address token, uint256 amount);
    event RightsClaimed(address indexed user, uint256 amount);
    event RightsVoted(address indexed user, uint256 indexed candidateId, uint256 amount);
    event CandidateSubmitted(uint256 indexed candidateId, address indexed proposer, string name, string symbol);
    event TokenLaunched(uint256 indexed candidateId, address token, uint256 usdcUsed, uint256 tokensReceived);
    event SubscriptionFinalized(uint256 indexed candidateId, bool success, uint256 totalUsdc, uint256 walletCount);
    event TokenGraduated(uint256 indexed candidateId, address token);

    // === Constructor ===
    constructor(address _bondingCurve, address _feeDistributor) Ownable(msg.sender) {
        bondingCurve = _bondingCurve;
        feeDistributor = _feeDistributor;
    }

    // ========================================
    //  Core: 1-Hour Subscription Model
    // ========================================

    /// @notice Submit a new token candidate. Starts a 1-hour subscription period.
    function submitCandidate(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bool _wantTaxShare,
        bool _wantLpShare,
        bool _wantTokenAllocation
    ) external payable nonReentrant {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "invalid name");
        require(bytes(symbol).length >= 1 && bytes(symbol).length <= 11, "invalid symbol");
        require(_wantTaxShare || _wantLpShare || _wantTokenAllocation, "1+");

        if (msg.value > 0) {
            (bool sent, ) = feeDistributor.call{value: msg.value}("");
            require(sent, "ftf");
        }

        candidates.push(Candidate({
            proposer: msg.sender,
            name: name,
            symbol: symbol,
            metadataURI: metadataURI,
            totalSubUsdc: 0,
            totalWeight: 0,
            totalRightsVotes: 0,
            submitTime: block.timestamp,
            expireTime: block.timestamp + SUBSCRIBE_DURATION,
            status: CandidateStatus.Active,
            launchedToken: address(0),
            launchedTokenSupply: 0,
            launchedUsdcUsed: 0,
            wantTaxShare: _wantTaxShare,
            wantLpShare: _wantLpShare,
            wantTokenAllocation: _wantTokenAllocation,
            walletCount: 0
        }));

        emit CandidateSubmitted(candidates.length - 1, msg.sender, name, symbol);
    }

    /// @notice Subscribe USDC to a candidate during its 1-hour window. No refunds during this period.
    function subscribeUsdc(uint256 candidateId) external payable nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        require(msg.value >= minSubscribeUsdc, "below min");

        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active, "not active");
        require(block.timestamp <= c.expireTime, "ended");

        uint256 weight = msg.value * SUBSCRIBE_USDC_WEIGHT / SUBSCRIBE_DENOM;

        Subscription storage sub = userSubscriptions[msg.sender][candidateId];
        sub.usdcAmount += msg.value;
        sub.subscribeTime = block.timestamp;
        sub.isActive = true;

        if (!isSupporter[candidateId][msg.sender]) {
            isSupporter[candidateId][msg.sender] = true;
            candidateSupporters[candidateId].push(msg.sender);
            c.walletCount++;
        }

        c.totalSubUsdc += msg.value;
        c.totalWeight += weight;

        emit Subscribed(msg.sender, candidateId, msg.value, weight);
    }

    /// @notice Finalize subscription after 1 hour. Anyone can call.
    ///         If threshold met: create token, inject USDC to BondingCurve, distribute tokens.
    ///         If not met: mark as Failed for refund.
    function finalizeSubscription(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active, "not active");
        require(block.timestamp > c.expireTime, "not ended");

        if (c.totalSubUsdc >= minSubThreshold && c.walletCount >= minWallets) {
            _launchToken(candidateId);
        } else {
            c.status = CandidateStatus.Failed;
            emit SubscriptionFinalized(candidateId, false, c.totalSubUsdc, c.walletCount);
        }
    }

    function _launchToken(uint256 candidateId) internal {
        Candidate storage c = candidates[candidateId];
        uint256 totalUsdc = c.totalSubUsdc;

        // 1. Create token (creator = LaunchDAO for permission control)
        address token = IBondingCurveLaunch(bondingCurve).createTokenForDao(
            c.name, c.symbol, FIXED_TOTAL_SUPPLY, c.metadataURI,
            address(this), 0, c.wantTaxShare, c.wantLpShare, c.wantTokenAllocation
        );

        // 2. Exclude LaunchDAO from tax/holding for distribution
        IBondingCurveTokenExclude(token).excludeFromTax(address(this));
        IBondingCurveTokenExclude(token).excludeFromHoldingLimit(address(this));

        // 3. Buy tokens with ALL subscription USDC → injects USDC as BondingCurve reserve
        //    balBefore includes the 10% creator allocation minted to LaunchDAO
        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IBondingCurveLaunch(bondingCurve).buy{value: totalUsdc}(token, 0, address(this));
        uint256 tokensReceived = IERC20(token).balanceOf(address(this)) - balBefore;

        c.status = CandidateStatus.Launched;
        c.launchedToken = token;
        c.launchedTokenSupply = tokensReceived;
        c.launchedUsdcUsed = totalUsdc;

        // 4. Distribute bought tokens to subscribers proportionally
        _distributeTokens(candidateId, token, totalUsdc, tokensReceived);

        // 5. Transfer creator allocation (10%) to proposer
        uint256 creatorBal = IERC20(token).balanceOf(address(this));
        if (creatorBal > 0) {
            IERC20(token).safeTransfer(c.proposer, creatorBal);
        }

        // 6. Set dogeToken if not set (for staking)
        if (dogeToken == address(0)) dogeToken = token;

        emit TokenLaunched(candidateId, token, totalUsdc, tokensReceived);
        emit SubscriptionFinalized(candidateId, true, totalUsdc, c.walletCount);

        // 7. Auto-graduate if reserve already meets threshold
        uint256 reserve = IBondingCurveLaunch(bondingCurve).getReserve(token);
        if (reserve >= launchThreshold) {
            IBondingCurveLaunch(bondingCurve).triggerGraduation(token);
            IBondingCurveLaunch(bondingCurve).listOnDex(token);
            emit TokenGraduated(candidateId, token);
        }
    }

    function _distributeTokens(
        uint256 candidateId,
        address token,
        uint256 totalUsdc,
        uint256 tokensReceived
    ) internal {
        if (tokensReceived == 0 || totalUsdc == 0) return;

        IBondingCurveTokenExclude(token).setSkipHoldingLimit(true);

        address[] storage supporters = candidateSupporters[candidateId];
        for (uint256 i = 0; i < supporters.length; i++) {
            address supporter = supporters[i];
            Subscription storage sub = userSubscriptions[supporter][candidateId];
            if (!sub.isActive || sub.hasClaimed) continue;

            uint256 share = (sub.usdcAmount * tokensReceived) / totalUsdc;
            if (share > 0) {
                IERC20(token).safeTransfer(supporter, share);
            }
            sub.hasClaimed = true;
            emit SubscriptionClaimed(supporter, candidateId, token, share);
        }

        IBondingCurveTokenExclude(token).setSkipHoldingLimit(false);
    }

    /// @notice Graduate a launched token to DEX after market trading pushes reserve to threshold.
    function graduateToken(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Launched, "not launched");
        require(c.launchedToken != address(0), "no token");

        address token = c.launchedToken;
        uint256 reserve = IBondingCurveLaunch(bondingCurve).getReserve(token);
        require(reserve >= launchThreshold, "below threshold");

        IBondingCurveLaunch(bondingCurve).triggerGraduation(token);
        IBondingCurveLaunch(bondingCurve).listOnDex(token);

        emit TokenGraduated(candidateId, token);
    }

    /// @notice Refund subscription if candidate failed to meet threshold.
    function refundSubscription(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Failed, "not failed");

        Subscription storage sub = userSubscriptions[msg.sender][candidateId];
        require(sub.isActive, "nosub");
        require(!sub.hasRefunded, "refunded");

        sub.hasRefunded = true;
        sub.isActive = false;

        uint256 usdcReturn = sub.usdcAmount;
        if (usdcReturn > 0) {
            (bool success, ) = payable(msg.sender).call{value: usdcReturn}("");
            require(success, "tf");
        }

        emit SubscriptionRefunded(msg.sender, candidateId, usdcReturn);
    }

    // ========================================
    //  Staking (Rights & Rewards)
    // ========================================

    function getStakeDurationSeconds(StakeDuration d) public pure returns (uint256) {
        if (d == StakeDuration.Demand) return 0;
        if (d == StakeDuration.Days30) return FIXED_30_DURATION;
        if (d == StakeDuration.Days90) return FIXED_90_DURATION;
        if (d == StakeDuration.Days180) return FIXED_180_DURATION;
        revert("invalid");
    }

    function getStakeMultiplierBps(StakeDuration d) public pure returns (uint256) {
        if (d == StakeDuration.Demand) return DEMAND_BPS;
        if (d == StakeDuration.Days30) return FIXED_30_BPS;
        if (d == StakeDuration.Days90) return FIXED_90_BPS;
        if (d == StakeDuration.Days180) return FIXED_180_BPS;
        revert("invalid");
    }

    function _getRightsBase(address token) internal view returns (uint256) {
        if (token == address(0)) return USDC_RIGHTS_BASE;
        if (token == dogeToken) return DOGE_RIGHTS_BASE;
        revert("unsupported");
    }

    function stakeUsdc(StakeDuration duration) external payable nonReentrant {
        require(msg.value >= MIN_STAKE, "min stk");
        require(msg.value <= MAX_STAKE, "max stk");

        uint256 maturityTime = duration == StakeDuration.Demand
            ? 0 : block.timestamp + getStakeDurationSeconds(duration);

        uint256 posId = userStakePositions[msg.sender].length;
        userStakePositions[msg.sender].push(StakePosition({
            token: address(0),
            amount: msg.value,
            startTime: block.timestamp,
            duration: duration,
            maturityTime: maturityTime,
            withdrawn: false,
            lastRightsClaimTime: block.timestamp
        }));

        totalStakedUsdc += msg.value;
        emit Staked(msg.sender, address(0), msg.value, duration, posId);
    }

    function stakeDoge(uint256 amount, StakeDuration duration) external nonReentrant {
        require(amount > 0, "zero");
        require(dogeToken != address(0), "dtns");
        IERC20(dogeToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 maturityTime = duration == StakeDuration.Demand
            ? 0 : block.timestamp + getStakeDurationSeconds(duration);

        uint256 posId = userStakePositions[msg.sender].length;
        userStakePositions[msg.sender].push(StakePosition({
            token: dogeToken,
            amount: amount,
            startTime: block.timestamp,
            duration: duration,
            maturityTime: maturityTime,
            withdrawn: false,
            lastRightsClaimTime: block.timestamp
        }));

        totalStakedDoge += amount;
        emit Staked(msg.sender, dogeToken, amount, duration, posId);
    }

    function unstakePosition(uint256 positionId) external nonReentrant {
        require(positionId < userStakePositions[msg.sender].length, "invalid");
        StakePosition storage pos = userStakePositions[msg.sender][positionId];
        require(!pos.withdrawn, "withdrawn");
        require(pos.amount > 0, "zero");

        if (pos.maturityTime > 0) require(block.timestamp >= pos.maturityTime, "not matured");

        uint256 pending = _calcPositionRights(pos);
        if (pending > 0) userRawRights[msg.sender] += pending;

        pos.withdrawn = true;
        uint256 amount = pos.amount;
        address token = pos.token;

        if (token == address(0)) {
            totalStakedUsdc -= amount;
            (bool s, ) = payable(msg.sender).call{value: amount}("");
            require(s, "tf");
        } else if (token == dogeToken) {
            totalStakedDoge -= amount;
            IERC20(dogeToken).safeTransfer(msg.sender, amount);
        }

        emit Unstaked(msg.sender, positionId, token, amount);
    }

    function claimRights() external nonReentrant {
        uint256 total = _calcAllPendingRights(msg.sender);
        require(total > 0, "none");

        StakePosition[] storage positions = userStakePositions[msg.sender];
        for (uint256 i = 0; i < positions.length; i++) {
            if (!positions[i].withdrawn && positions[i].amount > 0) {
                positions[i].lastRightsClaimTime = block.timestamp;
            }
        }
        userRawRights[msg.sender] += total;
        emit RightsClaimed(msg.sender, total);
    }

    function voteWithRights(uint256 candidateId, uint256 amount) external nonReentrant {
        require(candidateId < candidates.length, "invalid");
        require(amount > 0, "zero");
        require(amount <= getEffectiveRights(msg.sender), "insufficient");

        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active, "not active");

        userEffectiveSpent[msg.sender] += amount;
        c.totalRightsVotes += amount;
        c.totalWeight += amount;

        if (!isSupporter[candidateId][msg.sender]) {
            isSupporter[candidateId][msg.sender] = true;
            candidateSupporters[candidateId].push(msg.sender);
        }

        emit RightsVoted(msg.sender, candidateId, amount);
    }

    // ========================================
    //  Internal: Rights Calculation
    // ========================================

    function _calcPositionRights(StakePosition storage pos) internal view returns (uint256) {
        if (pos.withdrawn || pos.amount == 0) return 0;
        uint256 baseRate = _getRightsBase(pos.token);
        uint256 multiplier = getStakeMultiplierBps(pos.duration);
        uint256 rights;

        if (pos.maturityTime > 0 && block.timestamp > pos.maturityTime) {
            uint256 fixedElapsed = pos.maturityTime - pos.lastRightsClaimTime;
            uint256 fixedCycles = fixedElapsed / RIGHTS_CYCLE;
            if (fixedCycles > 0) {
                rights = pos.amount * fixedCycles * baseRate * multiplier / RIGHTS_DENOMINATOR;
            }
            uint256 demandElapsed = block.timestamp - pos.maturityTime;
            uint256 demandCycles = demandElapsed / RIGHTS_CYCLE;
            if (demandCycles > 0) {
                rights += pos.amount * demandCycles * baseRate * DEMAND_BPS / RIGHTS_DENOMINATOR;
            }
        } else {
            uint256 elapsed = block.timestamp - pos.lastRightsClaimTime;
            uint256 cycles = elapsed / RIGHTS_CYCLE;
            if (cycles > 0) {
                rights = pos.amount * cycles * baseRate * multiplier / RIGHTS_DENOMINATOR;
            }
        }
        return rights;
    }

    function _calcAllPendingRights(address user) internal view returns (uint256) {
        uint256 total = 0;
        StakePosition[] storage positions = userStakePositions[user];
        for (uint256 i = 0; i < positions.length; i++) {
            total += _calcPositionRights(positions[i]);
        }
        return total;
    }

    function _convergeRights(uint256 raw) internal pure returns (uint256) {
        if (raw <= CONVERGE_THRESHOLD) return raw;
        uint256 excess = raw - CONVERGE_THRESHOLD;
        uint256 bonus = CONVERGE_THRESHOLD * excess / (excess + CONVERGE_THRESHOLD);
        return CONVERGE_THRESHOLD + bonus;
    }

    function getEffectiveRights(address user) public view returns (uint256) {
        uint256 effective = _convergeRights(userRawRights[user]);
        uint256 spent = userEffectiveSpent[user];
        if (effective > spent) return effective - spent;
        return 0;
    }

    // ========================================
    //  View Functions
    // ========================================

    function getCandidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getSubscription(address user, uint256 candidateId) external view returns (
        uint256 usdcAmount, uint256 subscribeTime, bool isActive, bool hasClaimed, bool hasRefunded
    ) {
        Subscription storage sub = userSubscriptions[user][candidateId];
        return (sub.usdcAmount, sub.subscribeTime, sub.isActive, sub.hasClaimed, sub.hasRefunded);
    }

    function getPendingRights(address user) external view returns (uint256) {
        return _calcAllPendingRights(user);
    }

    function getUserTotalEffectiveRights(address user) external view returns (uint256) {
        uint256 totalRaw = userRawRights[user] + _calcAllPendingRights(user);
        uint256 effective = _convergeRights(totalRaw);
        uint256 spent = userEffectiveSpent[user];
        if (effective > spent) return effective - spent;
        return 0;
    }

    function getSubscribeTimeRemaining(uint256 candidateId) external view returns (uint256) {
        require(candidateId < candidates.length, "invalid");
        if (block.timestamp >= candidates[candidateId].expireTime) return 0;
        return candidates[candidateId].expireTime - block.timestamp;
    }

    function getStakePositions(address user) external view returns (
        address[] memory tokens, uint256[] memory amounts, uint256[] memory startTimes,
        uint256[] memory durations, uint256[] memory maturityTimes, bool[] memory withdrawns
    ) {
        uint256 count = userStakePositions[user].length;
        tokens = new address[](count);
        amounts = new uint256[](count);
        startTimes = new uint256[](count);
        durations = new uint256[](count);
        maturityTimes = new uint256[](count);
        withdrawns = new bool[](count);

        for (uint256 i = 0; i < count; i++) {
            StakePosition storage pos = userStakePositions[user][i];
            tokens[i] = pos.token;
            amounts[i] = pos.amount;
            startTimes[i] = pos.startTime;
            durations[i] = uint256(pos.duration);
            maturityTimes[i] = pos.maturityTime;
            withdrawns[i] = pos.withdrawn;
        }
    }

    function getActiveCandidates() external view returns (
        uint256[] memory ids, string[] memory names, string[] memory symbols,
        uint256[] memory subUsdcs, uint256[] memory weights, uint256[] memory expireTimes,
        uint256[] memory walletCounts, address[] memory proposers
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Active) count++;
        }
        ids = new uint256[](count);
        names = new string[](count);
        symbols = new string[](count);
        subUsdcs = new uint256[](count);
        weights = new uint256[](count);
        expireTimes = new uint256[](count);
        walletCounts = new uint256[](count);
        proposers = new address[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Active) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                symbols[idx] = candidates[i].symbol;
                subUsdcs[idx] = candidates[i].totalSubUsdc;
                weights[idx] = candidates[i].totalWeight;
                expireTimes[idx] = candidates[i].expireTime;
                walletCounts[idx] = candidates[i].walletCount;
                proposers[idx] = candidates[i].proposer;
                idx++;
            }
        }
    }

    function getLaunchedCandidates() external view returns (
        uint256[] memory ids, string[] memory names, address[] memory tokens, uint256[] memory subUsdcs
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Launched) count++;
        }
        ids = new uint256[](count);
        names = new string[](count);
        tokens = new address[](count);
        subUsdcs = new uint256[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Launched) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                tokens[idx] = candidates[i].launchedToken;
                subUsdcs[idx] = candidates[i].launchedUsdcUsed;
                idx++;
            }
        }
    }

    function getFailedCandidates() external view returns (
        uint256[] memory ids, string[] memory names, uint256[] memory subUsdcs
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Failed) count++;
        }
        ids = new uint256[](count);
        names = new string[](count);
        subUsdcs = new uint256[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Failed) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                subUsdcs[idx] = candidates[i].totalSubUsdc;
                idx++;
            }
        }
    }

    // ========================================
    //  Admin
    // ========================================

    function setBondingCurve(address _bc) external onlyOwner { bondingCurve = _bc; }
    function setFeeDistributor(address _fd) external onlyOwner { feeDistributor = _fd; }
    function setLaunchThreshold(uint256 _t) external onlyOwner { launchThreshold = _t; }
    function setMinSubThreshold(uint256 _t) external onlyOwner { minSubThreshold = _t; }
    function setMinWallets(uint256 _m) external onlyOwner { minWallets = _m; }
    function setMinSubscribeUsdc(uint256 _m) external onlyOwner { minSubscribeUsdc = _m; }
    function setDogeToken(address _d) external onlyOwner { dogeToken = _d; }

    receive() external payable {}
}