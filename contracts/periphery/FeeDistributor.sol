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
        uint256 stakedFair;
        uint256 rewardDebt;
        uint256 pendingRewards;
        uint256 stakeTimestamp;
    }

    IERC20 public fairToken;
    address public dexRouter;
    address public wrappedNative;
    address public buyAndBurnEngine;

    uint256 public totalStakedFair;
    uint256 public accRewardPerShare;
    uint256 public dividendRatio = 70e16;
    uint256 public burnRatio = 30e16;

    uint256 public totalDistributed;
    uint256 public totalBurned;

    uint256 public constant MIN_DISTRIBUTION = 0.01 ether;

    mapping(address => UserInfo) public users;
    uint256 public minStakeDuration = 7 days;

    event FairStaked(address indexed user, uint256 amount);
    event FairUnstaked(address indexed user, uint256 amount);
    event DividendClaimed(address indexed user, uint256 amount);
    event FeesReceived(uint256 bnbAmount);
    event FairBurned(uint256 bnbUsed, uint256 fairBurned);

    constructor(
        address _fairToken,
        address _dexRouter,
        address _buyAndBurnEngine,
        address _wrappedNative
    ) Ownable(msg.sender) {
        fairToken = IERC20(_fairToken);
        dexRouter = _dexRouter;
        wrappedNative = _wrappedNative;
        buyAndBurnEngine = _buyAndBurnEngine;
    }

    function stakeFair(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        UserInfo storage user = users[msg.sender];

        if (user.stakedFair > 0) {
            uint256 pending = (user.stakedFair * accRewardPerShare / 1e18) - user.rewardDebt;
            if (pending > 0) {
                user.pendingRewards += pending;
            }
        }

        fairToken.safeTransferFrom(msg.sender, address(this), amount);
        user.stakedFair += amount;
        user.rewardDebt = user.stakedFair * accRewardPerShare / 1e18;
        totalStakedFair += amount;
        user.stakeTimestamp = block.timestamp;

        emit FairStaked(msg.sender, amount);
    }

    function unstakeFair(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "zero amount");
        UserInfo storage user = users[msg.sender];
        require(user.stakedFair >= amount, "insufficient stake");
        require(block.timestamp >= user.stakeTimestamp + minStakeDuration, "stake locked");

        uint256 pending = (user.stakedFair * accRewardPerShare / 1e18) - user.rewardDebt;
        if (pending > 0) {
            user.pendingRewards += pending;
        }

        user.stakedFair -= amount;
        user.rewardDebt = user.stakedFair * accRewardPerShare / 1e18;
        totalStakedFair -= amount;

        if (user.stakedFair == 0) {
            user.stakeTimestamp = 0;
        }

        fairToken.safeTransfer(msg.sender, amount);

        emit FairUnstaked(msg.sender, amount);
    }

    function claimDividend() external nonReentrant whenNotPaused {
        UserInfo storage user = users[msg.sender];

        uint256 pending = (user.stakedFair * accRewardPerShare / 1e18) - user.rewardDebt;
        uint256 totalClaim = user.pendingRewards + pending;

        user.pendingRewards = 0;
        user.rewardDebt = user.stakedFair * accRewardPerShare / 1e18;

        if (totalClaim > 0) {
            totalDistributed += totalClaim;
            (bool success,) = payable(msg.sender).call{value: totalClaim}("");
            require(success, "transfer failed");
        }

        emit DividendClaimed(msg.sender, totalClaim);
    }

    function distributeFees() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_DISTRIBUTION, "below min distribution");

        uint256 burnAmount = (msg.value * burnRatio) / 1e18;
        uint256 dividendAmount = msg.value - burnAmount;

        if (burnAmount > 0 && buyAndBurnEngine != address(0)) {
            (bool sent,) = payable(buyAndBurnEngine).call{value: burnAmount}("");
            require(sent, "burn transfer failed");
        }

        if (dividendAmount > 0 && totalStakedFair > 0) {
            accRewardPerShare += (dividendAmount * 1e18) / totalStakedFair;
        }

        emit FeesReceived(msg.value);
    }

    function pendingDividend(address user_) external view returns (uint256) {
        UserInfo storage user = users[user_];
        uint256 pending = (user.stakedFair * accRewardPerShare / 1e18) - user.rewardDebt;
        return user.pendingRewards + pending;
    }

    function getStakedFair(address user_) external view returns (uint256) {
        return users[user_].stakedFair;
    }

    function setDividendRatio(uint256 _dividendRatio) external onlyOwner {
        require(_dividendRatio <= 1e18, "too high");
        dividendRatio = _dividendRatio;
        burnRatio = 1e18 - _dividendRatio;
    }

    function setBuyAndBurnEngine(address _engine) external onlyOwner {
        buyAndBurnEngine = _engine;
    }

    function setFairToken(address _fairToken) external onlyOwner {
        fairToken = IERC20(_fairToken);
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

    receive() external payable {}
}
