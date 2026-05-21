// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV2Router02 {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IBurnable {
    function burn(uint256 amount) external;
}

contract FeeDistributor is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;
    struct UserInfo {
        uint256 stakedDoge;
        uint256 rewardDebt;
        uint256 pendingRewards;
        uint256 stakeTimestamp;
    }

    IERC20 public dogeToken;
    address public dexRouter;
    address public wrappedNative;
    address public buyAndBurnEngine;
    address public longPool;

    uint256 public totalStakedDoge;
    uint256 public accRewardPerShare;
    uint256 public dividendRatio = 30e16;
    uint256 public burnRatio = 20e16;
    uint256 public lendingPoolRatio = 50e16;

    uint256 public totalDistributed;
    uint256 public totalBurned;
    uint256 public totalLent;

    uint256 public constant MIN_DISTRIBUTION = 0.01 ether;

    mapping(address => UserInfo) public users;
    uint256 public minStakeDuration = 7 days;

    event DogeStaked(address indexed user, uint256 amount);
    event DogeUnstaked(address indexed user, uint256 amount);
    event DividendClaimed(address indexed user, uint256 amount);
    event FeesReceived(uint256 usdcAmount);
    event DogeBurned(uint256 usdcUsed, uint256 dogeBurned);
    event LendingPoolFunded(uint256 usdcAmount);

    constructor(
        address _dogeToken,
        address _dexRouter,
        address _buyAndBurnEngine,
        address _wrappedNative,
        address _longPool
    ) Ownable(msg.sender) {
        dogeToken = IERC20(_dogeToken);
        dexRouter = _dexRouter;
        wrappedNative = _wrappedNative;
        buyAndBurnEngine = _buyAndBurnEngine;
        longPool = _longPool;
    }

    function stakeDoge(uint256 amount, uint256 duration) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        UserInfo storage user = users[msg.sender];

        if (user.stakedDoge > 0) {
            uint256 pending = (user.stakedDoge * accRewardPerShare / 1e18) - user.rewardDebt;
            if (pending > 0) {
                user.pendingRewards += pending;
            }
        }

        dogeToken.safeTransferFrom(msg.sender, address(this), amount);
        user.stakedDoge += amount;
        user.rewardDebt = user.stakedDoge * accRewardPerShare / 1e18;
        totalStakedDoge += amount;
        user.stakeTimestamp = block.timestamp;

        emit DogeStaked(msg.sender, amount);
    }

    function unstakeDoge(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        UserInfo storage user = users[msg.sender];
        require(user.stakedDoge >= amount, "insufficient stake");
        require(block.timestamp >= user.stakeTimestamp + minStakeDuration, "stake locked");

        uint256 pending = (user.stakedDoge * accRewardPerShare / 1e18) - user.rewardDebt;
        if (pending > 0) {
            user.pendingRewards += pending;
        }

        user.stakedDoge -= amount;
        user.rewardDebt = user.stakedDoge * accRewardPerShare / 1e18;
        totalStakedDoge -= amount;

        if (user.stakedDoge == 0) {
            user.stakeTimestamp = 0;
        }

        dogeToken.safeTransfer(msg.sender, amount);

        emit DogeUnstaked(msg.sender, amount);
    }

    function claimDividend() external nonReentrant whenNotPaused {
        UserInfo storage user = users[msg.sender];

        uint256 pending = (user.stakedDoge * accRewardPerShare / 1e18) - user.rewardDebt;
        uint256 totalClaim = user.pendingRewards + pending;

        user.pendingRewards = 0;
        user.rewardDebt = user.stakedDoge * accRewardPerShare / 1e18;

        if (totalClaim > 0) {
            totalDistributed += totalClaim;
            (bool success,) = payable(msg.sender).call{value: totalClaim}("");
            require(success, "transfer failed");
        }

        emit DividendClaimed(msg.sender, totalClaim);
    }

    function pendingDividend(address user_) external view returns (uint256) {
        UserInfo storage user = users[user_];
        uint256 pending = (user.stakedDoge * accRewardPerShare / 1e18) - user.rewardDebt;
        return user.pendingRewards + pending;
    }

    function getStakedDoge(address user_) external view returns (uint256) {
        return users[user_].stakedDoge;
    }

    function setDividendRatio(uint256 _dividendRatio) external onlyOwner {
        require(_dividendRatio <= 1e18, "too high");
        dividendRatio = _dividendRatio;
    }

    function setBurnRatio(uint256 _burnRatio) external onlyOwner {
        require(_burnRatio <= 1e18, "too high");
        burnRatio = _burnRatio;
    }

    function setLendingPoolRatio(uint256 _lendingPoolRatio) external onlyOwner {
        require(_lendingPoolRatio <= 1e18, "too high");
        lendingPoolRatio = _lendingPoolRatio;
    }

    function setBuyAndBurnEngine(address _engine) external onlyOwner {
        buyAndBurnEngine = _engine;
    }

    function setDogeToken(address _dogeToken) external onlyOwner {
        dogeToken = IERC20(_dogeToken);
    }

    function setLongPool(address _longPool) external onlyOwner {
        longPool = _longPool;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setMinStakeDuration(uint256 _duration) external onlyOwner {
        minStakeDuration = _duration;
    }

    receive() external payable {
        if (msg.value >= MIN_DISTRIBUTION) {
            _distribute(msg.value);
        }
    }

    function _distribute(uint256 amount) internal {
        uint256 dividendAmount = (amount * dividendRatio) / 1e18;
        uint256 burnAmount = (amount * burnRatio) / 1e18;
        uint256 lendingPoolAmount = (amount * lendingPoolRatio) / 1e18;

        if (dividendAmount > 0 && totalStakedDoge > 0) {
            accRewardPerShare += (dividendAmount * 1e18) / totalStakedDoge;
        }

        if (burnAmount > 0 && buyAndBurnEngine != address(0)) {
            (bool sent,) = payable(buyAndBurnEngine).call{value: burnAmount}("");
            require(sent, "burn transfer failed");
            totalBurned += burnAmount;
        }

        if (lendingPoolAmount > 0 && longPool != address(0)) {
            (bool sent,) = payable(longPool).call{value: lendingPoolAmount}("");
            require(sent, "lending pool transfer failed");
            totalLent += lendingPoolAmount;
            emit LendingPoolFunded(lendingPoolAmount);
        }

        emit FeesReceived(amount);
    }

    function distributeFees() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DISTRIBUTION, "below min distribution");
        _distribute(msg.value);
    }
}
