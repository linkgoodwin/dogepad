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
        address voterPool,
        uint256 voterAllocationBps,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external returns (address);

    function buy(address token, uint256 minTokensOut, address recipient) external payable;

    function listOnDex(address token) external;
}

interface IBondingCurveTokenExclude {
    function excludeFromTax(address account) external;
    function excludeFromHoldingLimit(address account) external;
}

contract LaunchDAO is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant EPOCH_DURATION = 1 days;
    uint256 public constant RIGHTS_CYCLE = 8 hours;
    uint256 public constant LAUNCH_THRESHOLD = 20 ether;
    uint256 public constant FIXED_TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant MIN_SUBSCRIBE_USDC = 1 ether;
    uint256 public constant MIN_STAKE = 1e17;
    uint256 public constant MAX_STAKE = 300 ether;
    uint256 public constant DOGE_USDC_RATE = 100;
    uint256 public constant DAILY_QUEUE_LIMIT = 3;

    uint256 public constant RIGHTS_DENOMINATOR = 6e21;
    uint256 public constant DOGE_SCORE_MULTIPLIER = 3;

    uint256 public constant USDC_RIGHTS_BASE = 600;
    uint256 public constant DOGE_RIGHTS_BASE = 6;
    uint256 public constant CONVERGE_THRESHOLD = 500;
    uint256 public constant MAX_EFFECTIVE_RIGHTS = 1000;

    uint256 public constant SUBSCRIBE_DENOM = 1e20;
    uint256 public constant SUBSCRIBE_USDC_WEIGHT = 10000;

    uint256 public constant DEMAND_BPS = 100;
    uint256 public constant FIXED_30_BPS = 150;
    uint256 public constant FIXED_90_BPS = 200;
    uint256 public constant FIXED_180_BPS = 300;

    uint256 public constant FIXED_30_DURATION = 30 days;
    uint256 public constant FIXED_90_DURATION = 90 days;
    uint256 public constant FIXED_180_DURATION = 180 days;

    uint256 public constant SETTLE_REWARD = 10e18;
    uint256 public constant LAUNCH_REWARD = 20e18;

    uint256 public constant TIER_1_DURATION = 3 days;
    uint256 public constant TIER_7_DURATION = 7 days;
    uint256 public constant TIER_30_DURATION = 30 days;
    uint256 public constant TIER_1_FEE = 0.1 ether;
    uint256 public constant TIER_7_FEE = 0.5 ether;
    uint256 public constant TIER_30_FEE = 1 ether;

    enum CandidateStatus { Active, Queued, Expired, GracePeriod, Recyclable, Launched }
    enum DurationTier { Day3, Day7, Day30 }
    enum StakeDuration { Demand, Days30, Days90, Days180 }

    struct Candidate {
        address proposer;
        string name;
        string symbol;
        string metadataURI;
        uint256 totalWeight;
        uint256 totalSubUsdc;
        uint256 totalSubDoge;
        uint256 totalRightsVotes;
        uint256 submitTime;
        uint256 durationTier;
        uint256 expireTime;
        uint256 gracePeriodEnd;
        CandidateStatus status;
        bool wasLaunched;
        address launchedToken;
        uint256 launchedTokenSupply;
        uint256 launchedUsdcUsed;
        uint256 launchedExcessUsdc;
        uint256 launchedDogeUsed;
        uint256 launchedExcessDoge;
        uint256 queueTime;
        bool wantTaxShare;
        bool wantLpShare;
        bool wantTokenAllocation;
    }

    struct Subscription {
        uint256 usdcAmount;
        uint256 dogeAmount;
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

    struct EpochInfo {
        uint256 dayStart;
        uint256 winningCandidateId;
        bool isSettled;
        bool settleRewardClaimed;
        bool launchRewardClaimed;
    }

    address public bondingCurve;
    address public feeDistributor;
    address public dogeToken;

    bool public defaultWantTaxShare = true;
    bool public defaultWantLpShare = true;
    bool public defaultWantTokenAllocation = true;

    Candidate[] public candidates;
    uint256[] public activeCandidateIds;
    uint256[] public launchQueueItems;
    uint256 public queueHead;
    mapping(uint256 => uint256) public queueScore;

    mapping(address => mapping(uint256 => Subscription)) public userSubscriptions;
    mapping(address => StakePosition[]) public userStakePositions;
    mapping(address => uint256) public userRawRights;
    mapping(address => uint256) public userEffectiveSpent;
    uint256 public totalStakedUsdc;
    uint256 public totalStakedDoge;
    uint256 public rewardPool;

    mapping(uint256 => address[]) public candidateSupporters;
    mapping(uint256 => mapping(address => bool)) public isSupporter;

    uint256 public currentDay;
    uint256 public lastLaunchDay;
    uint256 public maxLaunchsPerDay = 1;
    uint256 public launchHour = 4;
    uint256 public lastQueueDay;
    mapping(uint256 => uint256) public dayLaunchCount;
    mapping(uint256 => EpochInfo) public epochInfo;

    event Subscribed(address indexed user, uint256 indexed candidateId, uint256 usdcAmount, uint256 dogeAmount, uint256 weight);
    event SubscriptionClaimed(address indexed user, uint256 indexed candidateId, address token, uint256 tokenAmount);
    event SubscriptionRefunded(address indexed user, uint256 indexed candidateId, uint256 usdcAmount, uint256 dogeAmount);
    event Staked(address indexed user, address token, uint256 amount, StakeDuration duration, uint256 positionId);
    event Unstaked(address indexed user, uint256 positionId, address token, uint256 amount);
    event RightsClaimed(address indexed user, uint256 amount);
    event RightsVoted(address indexed user, uint256 indexed candidateId, uint256 amount);
    event CandidateSubmitted(uint256 indexed candidateId, address indexed proposer, string name, string symbol, DurationTier tier);
    event CandidateQueued(uint256 indexed candidateId);
    event CandidateRenewed(uint256 indexed candidateId, address indexed proposer, DurationTier tier);
    event CandidateRecycled(uint256 indexed candidateId, address indexed newProposer, DurationTier tier);
    event EpochSettled(uint256 indexed day, uint256 winningCandidateId);
    event DailyEnqueue(uint256 indexed day, uint256 count);
    event TokenLaunched(uint256 indexed candidateId, address token, uint256 usdcUsed, uint256 tokensReceived, uint256 excessUsdc);
    event RewardsDeposited(address indexed from, uint256 amount);

    error InvalidDurationTier();
    error InsufficientFee();
    error CandidateNotExpired();
    error NotInGracePeriod();
    error NotRecyclable();
    error NotProposer();
    error CandidateNotActive();

    constructor(address _bondingCurve, address _feeDistributor) Ownable(msg.sender) {
        bondingCurve = _bondingCurve;
        feeDistributor = _feeDistributor;
        currentDay = _today();
        epochInfo[currentDay] = EpochInfo({
            dayStart: _dayStart(currentDay),
            winningCandidateId: type(uint256).max,
            isSettled: false,
            settleRewardClaimed: false,
            launchRewardClaimed: false
        });
    }

    function getTierDuration(DurationTier tier) public pure returns (uint256) {
        if (tier == DurationTier.Day3) return TIER_1_DURATION;
        if (tier == DurationTier.Day7) return TIER_7_DURATION;
        if (tier == DurationTier.Day30) return TIER_30_DURATION;
        revert InvalidDurationTier();
    }

    function getTierFee(DurationTier tier) public pure returns (uint256) {
        if (tier == DurationTier.Day3) return TIER_1_FEE;
        if (tier == DurationTier.Day7) return TIER_7_FEE;
        if (tier == DurationTier.Day30) return TIER_30_FEE;
        revert InvalidDurationTier();
    }

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
        revert("unsupported token");
    }

    function subscribeUsdc(uint256 candidateId) external payable nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        require(msg.value >= MIN_SUBSCRIBE_USDC, "below min subscribe");

        _tryAdvanceDay();
        _updateCandidateStatus(candidateId);

        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active || c.status == CandidateStatus.Queued, "not active or queued");

        uint256 weight = msg.value * SUBSCRIBE_USDC_WEIGHT / SUBSCRIBE_DENOM;

        Subscription storage sub = userSubscriptions[msg.sender][candidateId];
        sub.usdcAmount += msg.value;
        sub.subscribeTime = block.timestamp;
        sub.isActive = true;

        if (!isSupporter[candidateId][msg.sender]) {
            isSupporter[candidateId][msg.sender] = true;
            candidateSupporters[candidateId].push(msg.sender);
        }

        c.totalSubUsdc += msg.value;
        c.totalWeight += weight;
        c.totalRightsVotes += weight;

        emit Subscribed(msg.sender, candidateId, msg.value, 0, weight);

        if (c.status == CandidateStatus.Active && c.totalSubUsdc >= LAUNCH_THRESHOLD) {
            _enqueueCandidate(candidateId);
        }

        _processQueueInternal();
    }

    function stakeUsdc(StakeDuration duration) external payable nonReentrant {
        require(msg.value >= MIN_STAKE, "below min stake");
        uint256 newUsdc = msg.value;
        require(newUsdc <= MAX_STAKE, "above max stake");

        uint256 maturityTime = duration == StakeDuration.Demand
            ? 0
            : block.timestamp + getStakeDurationSeconds(duration);

        uint256 posId = userStakePositions[msg.sender].length;
        userStakePositions[msg.sender].push(StakePosition({
            token: address(0),
            amount: newUsdc,
            startTime: block.timestamp,
            duration: duration,
            maturityTime: maturityTime,
            withdrawn: false,
            lastRightsClaimTime: block.timestamp
        }));

        totalStakedUsdc += newUsdc;

        emit Staked(msg.sender, address(0), newUsdc, duration, posId);
        _processQueueInternal();
    }

    function stakeDoge(uint256 amount, StakeDuration duration) external nonReentrant {
        require(amount > 0, "zero amount");
        require(dogeToken != address(0), "doge token not set");

        IERC20(dogeToken).safeTransferFrom(msg.sender, address(this), amount);

        uint256 maturityTime = duration == StakeDuration.Demand
            ? 0
            : block.timestamp + getStakeDurationSeconds(duration);

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
        _processQueueInternal();
    }

    function unstakePosition(uint256 positionId) external nonReentrant {
        require(positionId < userStakePositions[msg.sender].length, "invalid position");
        StakePosition storage pos = userStakePositions[msg.sender][positionId];
        require(!pos.withdrawn, "already withdrawn");
        require(pos.amount > 0, "zero amount");

        if (pos.maturityTime > 0) {
            require(block.timestamp >= pos.maturityTime, "not matured");
        }

        uint256 pending = _calcPositionRights(pos);
        if (pending > 0) {
            userRawRights[msg.sender] += pending;
        }

        pos.withdrawn = true;
        uint256 amount = pos.amount;
        address token = pos.token;

        if (token == address(0)) {
            totalStakedUsdc -= amount;
            (bool success, ) = payable(msg.sender).call{value: amount}("");
            require(success, "transfer failed");
        } else if (token == dogeToken) {
            totalStakedDoge -= amount;
            IERC20(dogeToken).safeTransfer(msg.sender, amount);
        }

        emit Unstaked(msg.sender, positionId, token, amount);
    }

    function claimRights() external nonReentrant {
        uint256 total = _calcAllPendingRights(msg.sender);
        require(total > 0, "no pending rights");

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
        require(candidateId < candidates.length, "invalid candidate");
        require(amount > 0, "zero amount");
        require(amount <= getEffectiveRights(msg.sender), "insufficient rights");

        _tryAdvanceDay();
        _updateCandidateStatus(candidateId);

        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active || c.status == CandidateStatus.Queued, "not active or queued");

        userEffectiveSpent[msg.sender] += amount;
        c.totalRightsVotes += amount;
        c.totalWeight += amount;

        if (!isSupporter[candidateId][msg.sender]) {
            isSupporter[candidateId][msg.sender] = true;
            candidateSupporters[candidateId].push(msg.sender);
        }

        emit RightsVoted(msg.sender, candidateId, amount);
        _processQueueInternal();
    }

    function submitCandidate(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        DurationTier tier,
        bool _wantTaxShare,
        bool _wantLpShare,
        bool _wantTokenAllocation
    ) external payable nonReentrant {
        uint256 fee = getTierFee(tier);
        if (msg.value < fee) revert InsufficientFee();
        require(bytes(name).length > 0 && bytes(name).length <= 64, "invalid name");
        require(bytes(symbol).length >= 1 && bytes(symbol).length <= 11, "invalid symbol");
        require(_wantTaxShare || _wantLpShare || _wantTokenAllocation, "must choose at least 1 incentive");

        _tryAdvanceDay();

        if (msg.value > 0) {
            (bool sent, ) = feeDistributor.call{value: msg.value}("");
            require(sent, "fee transfer failed");
        }

        uint256 duration = getTierDuration(tier);

        candidates.push(Candidate({
            proposer: msg.sender,
            name: name,
            symbol: symbol,
            metadataURI: metadataURI,
            totalWeight: 0,
            totalSubUsdc: 0,
            totalSubDoge: 0,
            totalRightsVotes: 0,
            submitTime: block.timestamp,
            durationTier: uint256(tier),
            expireTime: block.timestamp + duration,
            gracePeriodEnd: block.timestamp + duration + duration,
            status: CandidateStatus.Active,
            wasLaunched: false,
            launchedToken: address(0),
            launchedTokenSupply: 0,
            launchedUsdcUsed: 0,
            launchedExcessUsdc: 0,
            launchedDogeUsed: 0,
            launchedExcessDoge: 0,
            queueTime: 0,
            wantTaxShare: _wantTaxShare,
            wantLpShare: _wantLpShare,
            wantTokenAllocation: _wantTokenAllocation
        }));
        activeCandidateIds.push(candidates.length - 1);

        emit CandidateSubmitted(candidates.length - 1, msg.sender, name, symbol, tier);
    }

    function renewCandidate(uint256 candidateId, DurationTier tier, bool _wantTaxShare, bool _wantLpShare, bool _wantTokenAllocation) external payable nonReentrant {
        if (candidateId >= candidates.length) revert CandidateNotActive();
        Candidate storage c = candidates[candidateId];
        if (c.proposer != msg.sender) revert NotProposer();
        if (c.status != CandidateStatus.GracePeriod) revert NotInGracePeriod();
        require(_wantTaxShare || _wantLpShare || _wantTokenAllocation, "must choose at least 1 incentive");

        uint256 fee = getTierFee(tier);
        if (msg.value < fee) revert InsufficientFee();

        if (msg.value > 0) {
            (bool sent, ) = feeDistributor.call{value: msg.value}("");
            require(sent, "fee transfer failed");
        }

        uint256 duration = getTierDuration(tier);
        c.durationTier = uint256(tier);
        c.expireTime = block.timestamp + duration;
        c.gracePeriodEnd = block.timestamp + duration + duration;
        c.status = CandidateStatus.Active;
        c.wantTaxShare = _wantTaxShare;
        c.wantLpShare = _wantLpShare;
        c.wantTokenAllocation = _wantTokenAllocation;

        if (!_isInActiveList(candidateId)) {
            activeCandidateIds.push(candidateId);
        }

        emit CandidateRenewed(candidateId, msg.sender, tier);
    }

    function claimRecycled(uint256 candidateId, DurationTier tier, bool _wantTaxShare, bool _wantLpShare, bool _wantTokenAllocation) external payable nonReentrant {
        if (candidateId >= candidates.length) revert CandidateNotActive();
        Candidate storage c = candidates[candidateId];
        if (c.status != CandidateStatus.Recyclable) revert NotRecyclable();
        require(_wantTaxShare || _wantLpShare || _wantTokenAllocation, "must choose at least 1 incentive");

        uint256 fee = getTierFee(tier);
        if (msg.value < fee) revert InsufficientFee();

        if (msg.value > 0) {
            (bool sent, ) = feeDistributor.call{value: msg.value}("");
            require(sent, "fee transfer failed");
        }

        uint256 duration = getTierDuration(tier);
        c.proposer = msg.sender;
        c.durationTier = uint256(tier);
        c.submitTime = block.timestamp;
        c.expireTime = block.timestamp + duration;
        c.gracePeriodEnd = block.timestamp + duration + duration;
        c.totalWeight = 0;
        c.totalSubUsdc = 0;
        c.totalSubDoge = 0;
        c.totalRightsVotes = 0;
        c.status = CandidateStatus.Active;
        c.wantTaxShare = _wantTaxShare;
        c.wantLpShare = _wantLpShare;
        c.wantTokenAllocation = _wantTokenAllocation;

        if (!_isInActiveList(candidateId)) {
            activeCandidateIds.push(candidateId);
        }

        emit CandidateRecycled(candidateId, msg.sender, tier);
    }

    event CandidateEarlyQueued(uint256 indexed candidateId, address indexed proposer);

    function earlyQueue(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        require(c.proposer == msg.sender, "not proposer");
        require(c.status == CandidateStatus.Active, "not active");
        require(c.totalSubUsdc >= LAUNCH_THRESHOLD, "below launch threshold");

        _enqueueCandidate(candidateId);

        emit CandidateEarlyQueued(candidateId, msg.sender);
        _processQueueInternal();
    }

    function settleEpoch() external nonReentrant {
        _tryAdvanceDay();
        _cleanupActiveCandidates();

        EpochInfo storage epoch = epochInfo[currentDay];
        require(!epoch.isSettled, "already settled");
        require(block.timestamp >= epoch.dayStart + EPOCH_DURATION, "epoch not ended");

        uint256 winningId = type(uint256).max;
        uint256 maxWeight = 0;

        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            uint256 cid = activeCandidateIds[i];
            _updateCandidateStatus(cid);
            if (candidates[cid].status == CandidateStatus.Active && candidates[cid].totalWeight > maxWeight) {
                maxWeight = candidates[cid].totalWeight;
                winningId = cid;
            }
        }

        if (winningId != type(uint256).max && maxWeight > 0) {
        }

        epoch.winningCandidateId = winningId;
        epoch.isSettled = true;

        if (dogeToken != address(0) && rewardPool >= SETTLE_REWARD && !epoch.settleRewardClaimed) {
            epoch.settleRewardClaimed = true;
            rewardPool -= SETTLE_REWARD;
            IERC20(dogeToken).safeTransfer(msg.sender, SETTLE_REWARD);
        }

        emit EpochSettled(currentDay, winningId);
        _processQueueInternal();
    }

    function _processQueueInternal() internal {
        uint256 today = _today();
        if (dayLaunchCount[today] >= maxLaunchsPerDay) return;
        if ((block.timestamp % EPOCH_DURATION) / 1 hours < launchHour) return;

        _cleanupExpiredQueuedCandidates();

        uint256 launched = 0;
        while (launched < maxLaunchsPerDay && dayLaunchCount[today] < maxLaunchsPerDay) {
            while (queueHead < launchQueueItems.length && candidates[launchQueueItems[queueHead]].status != CandidateStatus.Queued) {
                queueHead++;
            }

            if (queueHead >= launchQueueItems.length) break;

            uint256 bestIdx = queueHead;
            uint256 bestScore = queueScore[launchQueueItems[queueHead]];
            for (uint256 i = queueHead + 1; i < launchQueueItems.length; i++) {
                uint256 cid = launchQueueItems[i];
                if (candidates[cid].status == CandidateStatus.Queued && queueScore[cid] > bestScore) {
                    bestScore = queueScore[cid];
                    bestIdx = i;
                }
            }

            if (bestIdx != queueHead) {
                uint256 temp = launchQueueItems[queueHead];
                launchQueueItems[queueHead] = launchQueueItems[bestIdx];
                launchQueueItems[bestIdx] = temp;
            }

            uint256 candidateId = launchQueueItems[queueHead];
            Candidate storage c = candidates[candidateId];

            lastLaunchDay = today;
            dayLaunchCount[today]++;

            address token = IBondingCurveLaunch(bondingCurve).createTokenForDao(
                c.name,
                c.symbol,
                FIXED_TOTAL_SUPPLY,
                c.metadataURI,
                address(this),
                0,
                c.wantTaxShare,
                c.wantLpShare,
                c.wantTokenAllocation
            );

            IBondingCurveTokenExclude(token).excludeFromTax(address(this));
            IBondingCurveTokenExclude(token).excludeFromHoldingLimit(address(this));

            uint256 tokensReceived = 0;
            uint256 usdcUsed = c.totalSubUsdc;
            uint256 excessUsdc = 0;

            if (c.totalSubUsdc > LAUNCH_THRESHOLD) {
                excessUsdc = c.totalSubUsdc - LAUNCH_THRESHOLD;
                usdcUsed = LAUNCH_THRESHOLD;
            }

            if (usdcUsed > 0 && address(this).balance >= usdcUsed) {
                uint256 balBefore = IERC20(token).balanceOf(address(this));
                IBondingCurveLaunch(bondingCurve).buy{value: usdcUsed}(token, 0, address(this));
                tokensReceived = IERC20(token).balanceOf(address(this)) - balBefore;
            }

            c.launchedUsdcUsed = usdcUsed;
            c.launchedExcessUsdc = excessUsdc;

            if (dogeToken == address(0)) {
                dogeToken = token;
            }

            c.wasLaunched = true;
            c.status = CandidateStatus.Launched;
            c.launchedToken = token;
            c.launchedTokenSupply = tokensReceived;

            try IBondingCurveLaunch(bondingCurve).listOnDex(token) {} catch {}

            queueHead++;

            emit TokenLaunched(candidateId, token, usdcUsed, tokensReceived, excessUsdc);

            launched++;
        }

        EpochInfo storage epoch = epochInfo[currentDay];
        if (dogeToken != address(0) && rewardPool >= LAUNCH_REWARD && !epoch.launchRewardClaimed) {
            epoch.launchRewardClaimed = true;
            rewardPool -= LAUNCH_REWARD;
            IERC20(dogeToken).safeTransfer(msg.sender, LAUNCH_REWARD);
        }
    }

    function processQueue() external nonReentrant {
        _processQueueInternal();
    }

    function claimSubscription(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        require(c.wasLaunched, "not launched");
        require(c.launchedToken != address(0), "no token");

        Subscription storage sub = userSubscriptions[msg.sender][candidateId];
        require(sub.isActive, "no subscription");
        require(!sub.hasClaimed, "already claimed");

        sub.hasClaimed = true;

        uint256 userUsdcUsed = sub.usdcAmount;
        if (c.launchedExcessUsdc > 0 && c.totalSubUsdc > 0) {
            uint256 userExcessUsdc = (sub.usdcAmount * c.launchedExcessUsdc) / c.totalSubUsdc;
            userUsdcUsed = sub.usdcAmount > userExcessUsdc ? sub.usdcAmount - userExcessUsdc : 0;
        }

        require(c.launchedUsdcUsed > 0, "zero total");

        uint256 share = (userUsdcUsed * c.launchedTokenSupply) / c.launchedUsdcUsed;

        if (share > 0) {
            IERC20(c.launchedToken).safeTransfer(msg.sender, share);
        }

        if (c.launchedExcessUsdc > 0 && sub.usdcAmount > 0) {
            uint256 refundUsdc = (sub.usdcAmount * c.launchedExcessUsdc) / c.totalSubUsdc;
            if (refundUsdc > 0) {
                (bool success, ) = payable(msg.sender).call{value: refundUsdc}("");
                require(success, "refund failed");
            }
        }

        emit SubscriptionClaimed(msg.sender, candidateId, c.launchedToken, share);
    }

    function refundSubscription(uint256 candidateId) external nonReentrant {
        require(candidateId < candidates.length, "invalid candidate");
        _updateCandidateStatus(candidateId);

        Candidate storage c = candidates[candidateId];
        require(
            c.status == CandidateStatus.Expired ||
            c.status == CandidateStatus.GracePeriod ||
            c.status == CandidateStatus.Recyclable,
            "not expired"
        );
        require(!c.wasLaunched, "was launched");

        Subscription storage sub = userSubscriptions[msg.sender][candidateId];
        require(sub.isActive, "no subscription");
        require(!sub.hasRefunded, "already refunded");

        sub.hasRefunded = true;
        sub.isActive = false;

        uint256 usdcReturn = sub.usdcAmount;

        if (usdcReturn > 0) {
            (bool success, ) = payable(msg.sender).call{value: usdcReturn}("");
            require(success, "transfer failed");
        }

        emit SubscriptionRefunded(msg.sender, candidateId, usdcReturn, 0);
    }

    function depositRewards(uint256 amount) external nonReentrant {
        require(dogeToken != address(0), "doge token not set");
        IERC20(dogeToken).safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;

        emit RewardsDeposited(msg.sender, amount);
    }

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

    function getUserTotalEffectiveRights(address user) external view returns (uint256) {
        uint256 totalRaw = userRawRights[user] + _calcAllPendingRights(user);
        uint256 effective = _convergeRights(totalRaw);
        uint256 spent = userEffectiveSpent[user];
        if (effective > spent) return effective - spent;
        return 0;
    }

    function _enqueueCandidate(uint256 candidateId) internal {
        Candidate storage c = candidates[candidateId];
        require(c.status == CandidateStatus.Active, "not active");

        uint256 score = c.totalSubUsdc + c.totalWeight * DOGE_SCORE_MULTIPLIER;

        c.status = CandidateStatus.Queued;
        c.queueTime = block.timestamp;
        launchQueueItems.push(candidateId);
        queueScore[candidateId] = score;

        _removeFromActiveList(candidateId);

        emit CandidateQueued(candidateId);
    }

    function _dailyEnqueueTopCandidates() internal {
        if (lastQueueDay >= currentDay) return;
        lastQueueDay = currentDay;

        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            uint256 cid = activeCandidateIds[i];
            if (candidates[cid].status == CandidateStatus.Active && candidates[cid].totalSubUsdc >= LAUNCH_THRESHOLD) {
                eligibleCount++;
            }
        }

        if (eligibleCount == 0) {
            emit DailyEnqueue(currentDay, 0);
            return;
        }

        uint256[] memory eligibleIds = new uint256[](eligibleCount);
        uint256[] memory scores = new uint256[](eligibleCount);
        uint256 idx = 0;

        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            uint256 cid = activeCandidateIds[i];
            if (candidates[cid].status == CandidateStatus.Active && candidates[cid].totalSubUsdc >= LAUNCH_THRESHOLD) {
                eligibleIds[idx] = cid;
                scores[idx] = candidates[cid].totalSubUsdc + candidates[cid].totalWeight * DOGE_SCORE_MULTIPLIER;
                idx++;
            }
        }

        uint256 toEnqueue = eligibleCount < DAILY_QUEUE_LIMIT ? eligibleCount : DAILY_QUEUE_LIMIT;
        bool[] memory taken = new bool[](eligibleCount);
        uint256 enqueuedCount = 0;

        for (uint256 rank = 0; rank < toEnqueue; rank++) {
            uint256 bestIdx = type(uint256).max;
            uint256 bestScore = 0;
            for (uint256 j = 0; j < eligibleCount; j++) {
                if (!taken[j] && scores[j] > bestScore) {
                    bestScore = scores[j];
                    bestIdx = j;
                }
            }
            if (bestIdx == type(uint256).max || bestScore == 0) break;

            taken[bestIdx] = true;
            _enqueueCandidate(eligibleIds[bestIdx]);
            enqueuedCount++;
        }

        emit DailyEnqueue(currentDay, enqueuedCount);
    }

    function _cleanupExpiredQueuedCandidates() internal {
        for (uint256 i = queueHead; i < launchQueueItems.length; i++) {
            uint256 cid = launchQueueItems[i];
            Candidate storage c = candidates[cid];
            if (c.status == CandidateStatus.Queued && block.timestamp > c.expireTime) {
                c.status = CandidateStatus.GracePeriod;
            }
        }
    }

    function _updateCandidateStatus(uint256 candidateId) internal {
        Candidate storage c = candidates[candidateId];
        if (c.status == CandidateStatus.Active && block.timestamp > c.expireTime) {
            c.status = CandidateStatus.GracePeriod;
        }
        if (c.status == CandidateStatus.Queued && block.timestamp > c.expireTime) {
            c.status = CandidateStatus.GracePeriod;
        }
        if (c.status == CandidateStatus.GracePeriod && block.timestamp > c.gracePeriodEnd) {
            c.status = CandidateStatus.Recyclable;
        }
    }

    function _isInActiveList(uint256 candidateId) internal view returns (bool) {
        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            if (activeCandidateIds[i] == candidateId) return true;
        }
        return false;
    }

    function _removeFromActiveList(uint256 candidateId) internal {
        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            if (activeCandidateIds[i] == candidateId) {
                activeCandidateIds[i] = activeCandidateIds[activeCandidateIds.length - 1];
                activeCandidateIds.pop();
                return;
            }
        }
    }

    function _cleanupActiveCandidates() internal {
        uint256 i = 0;
        while (i < activeCandidateIds.length) {
            uint256 cid = activeCandidateIds[i];
            _updateCandidateStatus(cid);
            if (candidates[cid].status != CandidateStatus.Active) {
                activeCandidateIds[i] = activeCandidateIds[activeCandidateIds.length - 1];
                activeCandidateIds.pop();
            } else {
                i++;
            }
        }
    }

    function _tryAdvanceDay() internal {
        uint256 iterations;
        while (block.timestamp >= _dayStart(currentDay + 1) && iterations < 7) {
            iterations++;

            _dailyEnqueueTopCandidates();
            _cleanupExpiredQueuedCandidates();

            EpochInfo storage epoch = epochInfo[currentDay];
            if (!epoch.isSettled) {
                if (_hasActiveCandidates()) {
                    break;
                }
                epoch.isSettled = true;
            }
            currentDay++;
            if (epochInfo[currentDay].dayStart == 0) {
                epochInfo[currentDay] = EpochInfo({
                    dayStart: _dayStart(currentDay),
                    winningCandidateId: type(uint256).max,
                    isSettled: false,
                    settleRewardClaimed: false,
                    launchRewardClaimed: false
                });
            }
        }
    }

    function _hasActiveCandidates() internal view returns (bool) {
        for (uint256 i = 0; i < activeCandidateIds.length; i++) {
            uint256 cid = activeCandidateIds[i];
            if (candidates[cid].status == CandidateStatus.Active && candidates[cid].totalWeight > 0) {
                return true;
            }
        }
        return false;
    }

    function _today() internal view returns (uint256) {
        return block.timestamp / EPOCH_DURATION;
    }

    function _dayStart(uint256 day) internal pure returns (uint256) {
        return day * EPOCH_DURATION;
    }

    function getPendingRights(address user) external view returns (uint256) {
        return _calcAllPendingRights(user);
    }

    function getStakePositionCount(address user) external view returns (uint256) {
        return userStakePositions[user].length;
    }

    function getStakePosition(address user, uint256 index) external view returns (
        address token,
        uint256 amount,
        uint256 startTime,
        StakeDuration duration,
        uint256 maturityTime,
        bool withdrawn,
        uint256 lastRightsClaimTime
    ) {
        require(index < userStakePositions[user].length, "invalid index");
        StakePosition storage pos = userStakePositions[user][index];
        return (pos.token, pos.amount, pos.startTime, pos.duration, pos.maturityTime, pos.withdrawn, pos.lastRightsClaimTime);
    }

    function getStakePositions(address user) external view returns (
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory startTimes,
        uint256[] memory durations,
        uint256[] memory maturityTimes,
        bool[] memory withdrawns
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

    function getQueueLength() external view returns (uint256) {
        if (launchQueueItems.length > queueHead) {
            return launchQueueItems.length - queueHead;
        }
        return 0;
    }

    function getQueueItem(uint256 index) external view returns (uint256) {
        require(queueHead + index < launchQueueItems.length, "out of bounds");
        return launchQueueItems[queueHead + index];
    }

    function getEpochTimeRemaining() external view returns (uint256) {
        uint256 dayEnd = epochInfo[currentDay].dayStart + EPOCH_DURATION;
        if (block.timestamp >= dayEnd) return 0;
        return dayEnd - block.timestamp;
    }

    function getActiveCandidates() external view returns (
        uint256[] memory ids,
        string[] memory names,
        string[] memory symbols,
        uint256[] memory weights,
        uint256[] memory subUsdcs,
        uint256[] memory subDoges
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Active) count++;
        }

        ids = new uint256[](count);
        names = new string[](count);
        symbols = new string[](count);
        weights = new uint256[](count);
        subUsdcs = new uint256[](count);
        subDoges = new uint256[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Active) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                symbols[idx] = candidates[i].symbol;
                weights[idx] = candidates[i].totalWeight;
                subUsdcs[idx] = candidates[i].totalSubUsdc;
                subDoges[idx] = candidates[i].totalSubDoge;
                idx++;
            }
        }
    }

    function getQueuedCandidates() external view returns (
        uint256[] memory ids,
        string[] memory names,
        string[] memory symbols,
        uint256[] memory queueTimes
    ) {
        uint256 len = launchQueueItems.length - queueHead;
        ids = new uint256[](len);
        names = new string[](len);
        symbols = new string[](len);
        queueTimes = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            uint256 cid = launchQueueItems[queueHead + i];
            ids[i] = cid;
            names[i] = candidates[cid].name;
            symbols[i] = candidates[cid].symbol;
            queueTimes[i] = candidates[cid].queueTime;
        }
    }

    function getGracePeriodCandidates() external view returns (
        uint256[] memory ids,
        string[] memory names,
        uint256[] memory gracePeriodEnds,
        address[] memory proposers
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.GracePeriod) count++;
        }

        ids = new uint256[](count);
        names = new string[](count);
        gracePeriodEnds = new uint256[](count);
        proposers = new address[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.GracePeriod) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                gracePeriodEnds[idx] = candidates[i].gracePeriodEnd;
                proposers[idx] = candidates[i].proposer;
                idx++;
            }
        }
    }

    function getRecyclableCandidates() external view returns (
        uint256[] memory ids,
        string[] memory names,
        string[] memory symbols,
        string[] memory metadataURIs
    ) {
        uint256 count = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Recyclable) count++;
        }

        ids = new uint256[](count);
        names = new string[](count);
        symbols = new string[](count);
        metadataURIs = new string[](count);

        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; i++) {
            if (candidates[i].status == CandidateStatus.Recyclable) {
                ids[idx] = i;
                names[idx] = candidates[i].name;
                symbols[idx] = candidates[i].symbol;
                metadataURIs[idx] = candidates[i].metadataURI;
                idx++;
            }
        }
    }

    function getCandidateCount() external view returns (uint256) {
        return candidates.length;
    }

    function getCandidateStatus(uint256 candidateId) external view returns (CandidateStatus) {
        require(candidateId < candidates.length, "invalid candidate");
        Candidate storage c = candidates[candidateId];
        if (c.status == CandidateStatus.Active && block.timestamp > c.expireTime) {
            if (block.timestamp > c.gracePeriodEnd) {
                return CandidateStatus.Recyclable;
            }
            return CandidateStatus.GracePeriod;
        }
        return c.status;
    }

    function getSubscription(address user, uint256 candidateId) external view returns (
        uint256 usdcAmount,
        uint256 dogeAmount,
        uint256 subscribeTime,
        bool isActive,
        bool hasClaimed,
        bool hasRefunded
    ) {
        Subscription storage sub = userSubscriptions[user][candidateId];
        return (sub.usdcAmount, sub.dogeAmount, sub.subscribeTime, sub.isActive, sub.hasClaimed, sub.hasRefunded);
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }

    function setFeeDistributor(address _feeDistributor) external onlyOwner {
        feeDistributor = _feeDistributor;
    }

    function setMaxLaunchsPerDay(uint256 _max) external onlyOwner {
        require(_max >= 1 && _max <= 3, "invalid max launchs per day");
        maxLaunchsPerDay = _max;
    }

    function setLaunchHour(uint256 _hour) external onlyOwner {
        require(_hour < 24, "invalid hour");
        launchHour = _hour;
    }

    function setDogeToken(address _dogeToken) external onlyOwner {
        dogeToken = _dogeToken;
    }

    function setDefaultIncentives(bool _tax, bool _lp, bool _token) external onlyOwner {
        require(_tax || _lp || _token, "must choose at least 1");
        defaultWantTaxShare = _tax;
        defaultWantLpShare = _lp;
        defaultWantTokenAllocation = _token;
    }

    receive() external payable {}
}
