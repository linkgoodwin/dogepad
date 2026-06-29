// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title DailyCheckin — 每日签到 + 连续奖励 + 推荐返佣
contract DailyCheckin is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    //  存储结构
    // ============================================================

    IERC20 public rewardToken;          // 平台币地址（后设置）
    uint256 public baseReward = 100 ether;   // 第1天奖励
    uint256 public dailyIncrement = 10 ether; // 每天递增
    uint256 public maxStreak = 30;       // 最大连续天数（封顶）
    uint256 public referrerRate = 10;    // 推荐人费率：1/10

    // 用户签到状态
    struct CheckinInfo {
        uint256 lastCheckinDay;  // 上次签到的天数（UTC 0点起算）
        uint256 streak;          // 当前连续签到天数
        uint256 totalClaimed;    // 累计领取的平台币
        address referrer;        // 推荐人地址
        uint256 refEarnings;     // 推荐收益累计
        uint256 refCount;        // 被推荐人数
    }
    mapping(address => CheckinInfo) public users;

    uint256 public totalDeposited;       // 合约存入的平台币总量
    uint256 public totalClaimedAll;      // 全网累计领取
    uint256 public totalCheckins;        // 全网签到总次数

    bool public paused;

    // ============================================================
    //  事件
    // ============================================================

    event CheckedIn(address indexed user, uint256 day, uint256 streak, uint256 reward, uint256 refReward);
    event ReferrerBound(address indexed user, address indexed referrer);
    event RewardTokenSet(address indexed token);
    event TokensDeposited(address indexed from, uint256 amount);
    event ParametersUpdated(uint256 baseReward, uint256 dailyIncrement, uint256 maxStreak, uint256 referrerRate);
    event Paused(bool paused);

    // ============================================================
    //  修饰符
    // ============================================================

    modifier notPaused() {
        require(!paused, "checkin paused");
        _;
    }

    modifier onlyWithToken() {
        require(address(rewardToken) != address(0), "token not set");
        _;
    }

    // ============================================================
    //  构造函数
    // ============================================================

    constructor() Ownable(msg.sender) {}

    // ============================================================
    //  核心逻辑
    // ============================================================

    /// @dev 获取当前 UTC 天数
    function _currentDay() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /// @dev 计算当日奖励
    function _calcReward(uint256 streak) internal view returns (uint256) {
        uint256 s = streak > maxStreak ? maxStreak : streak;
        return baseReward + (s - 1) * dailyIncrement;
    }

    /// @notice 每日签到
    function checkin() external notPaused onlyWithToken nonReentrant {
        CheckinInfo storage u = users[msg.sender];
        uint256 today = _currentDay();

        require(u.lastCheckinDay < today, "already checked in today");

        // 计算连续天数
        if (u.lastCheckinDay == 0) {
            u.streak = 1;
        } else if (u.lastCheckinDay == today - 1) {
            u.streak += 1;
        } else {
            u.streak = 1; // 断签重置
        }

        u.lastCheckinDay = today;
        totalCheckins += 1;

        // 计算奖励
        uint256 reward = _calcReward(u.streak);

        // 推荐人奖励
        uint256 refReward = 0;
        if (u.referrer != address(0) && u.referrer != msg.sender) {
            refReward = reward / referrerRate;
        }

        uint256 totalPay = reward + refReward;
        require(IERC20(rewardToken).balanceOf(address(this)) >= totalPay, "insufficient balance");

        // 转账
        IERC20(rewardToken).safeTransfer(msg.sender, reward);
        u.totalClaimed += reward;
        totalClaimedAll += reward;

        if (refReward > 0) {
            IERC20(rewardToken).safeTransfer(u.referrer, refReward);
            users[u.referrer].refEarnings += refReward;
            totalClaimedAll += refReward;
        }

        emit CheckedIn(msg.sender, today, u.streak, reward, refReward);
    }

    /// @notice 绑定推荐人（仅一次）
    function bindReferrer(address _referrer) external {
        require(_referrer != address(0), "invalid referrer");
        require(_referrer != msg.sender, "cannot refer self");
        require(users[msg.sender].referrer == address(0), "referrer already set");

        // 检查循环引用
        address cur = _referrer;
        for (uint256 i = 0; i < 50; i++) {
            if (cur == msg.sender) revert("circular reference");
            cur = users[cur].referrer;
            if (cur == address(0)) break;
        }

        users[msg.sender].referrer = _referrer;
        users[_referrer].refCount += 1;

        emit ReferrerBound(msg.sender, _referrer);
    }

    // ============================================================
    //  查询函数
    // ============================================================

    /// @notice 查询用户签到信息
    function getUserInfo(address user) external view returns (
        uint256 lastCheckinDay,
        uint256 streak,
        uint256 totalClaimed,
        address referrer,
        uint256 refEarnings,
        uint256 refCount,
        bool canCheckinToday,
        uint256 todayReward
    ) {
        CheckinInfo storage u = users[user];
        uint256 today = _currentDay();
        canCheckinToday = u.lastCheckinDay < today;

        uint256 nextStreak;
        if (u.lastCheckinDay == 0) {
            nextStreak = 1;
        } else if (u.lastCheckinDay == today - 1) {
            nextStreak = u.streak + 1;
        } else {
            nextStreak = 1;
        }
        todayReward = _calcReward(nextStreak);

        return (u.lastCheckinDay, u.streak, u.totalClaimed, u.referrer, u.refEarnings, u.refCount, canCheckinToday, todayReward);
    }

    /// @notice 获取推荐链接
    function getReferralLink(address user) external pure returns (string memory) {
        // 将地址转为 hex 字符串（不带 0x 前缀）
        bytes memory hexStr = new bytes(40);
        bytes20 addr = bytes20(user);
        bytes16 chars = "0123456789abcdef";
        for (uint256 i = 0; i < 20; i++) {
            hexStr[i * 2] = chars[uint8(addr[i] >> 4)];
            hexStr[i * 2 + 1] = chars[uint8(addr[i] & 0x0f)];
        }
        return string(abi.encodePacked("https://dogepad.pro/?ref=", hexStr));
    }

    /// @notice 合约余额
    function contractBalance() external view returns (uint256) {
        if (address(rewardToken) == address(0)) return 0;
        return IERC20(rewardToken).balanceOf(address(this));
    }

    // ============================================================
    //  管理函数
    // ============================================================

    function setRewardToken(address _token) external onlyOwner {
        rewardToken = IERC20(_token);
        emit RewardTokenSet(_token);
    }

    function depositTokens(uint256 amount) external onlyOwner {
        require(address(rewardToken) != address(0), "token not set");
        IERC20(rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        emit TokensDeposited(msg.sender, amount);
    }

    function setParameters(
        uint256 _baseReward,
        uint256 _dailyIncrement,
        uint256 _maxStreak,
        uint256 _referrerRate
    ) external onlyOwner {
        require(_referrerRate > 0, "rate zero");
        baseReward = _baseReward;
        dailyIncrement = _dailyIncrement;
        maxStreak = _maxStreak;
        referrerRate = _referrerRate;
        emit ParametersUpdated(_baseReward, _dailyIncrement, _maxStreak, _referrerRate);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    /// @notice 紧急提取（仅 owner）
    function emergencyWithdraw(address _to) external onlyOwner {
        require(_to != address(0), "zero address");
        if (address(rewardToken) != address(0)) {
            uint256 bal = IERC20(rewardToken).balanceOf(address(this));
            if (bal > 0) IERC20(rewardToken).safeTransfer(_to, bal);
        }
    }
}
