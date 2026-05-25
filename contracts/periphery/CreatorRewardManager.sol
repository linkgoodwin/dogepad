// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract CreatorRewardManager is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTimestamp;
        uint256 cliffEnd;
        uint256 vestingEnd;
        bool exists;
    }

    address public bondingCurve;
    address public dexLister;

    mapping(address => mapping(address => VestingSchedule)) public vestings;
    mapping(address => uint256) public totalVestedAmount;

    event VestingCreated(address indexed asset, address indexed beneficiary, uint256 amount, uint256 cliffEnd, uint256 vestingEnd);
    event VestedTokensClaimed(address indexed asset, address indexed beneficiary, uint256 amount);

    modifier onlyBondingCurveOrDexLister() {
        require(msg.sender == bondingCurve || msg.sender == dexLister, "only bonding curve");
        _;
    }

    constructor(address _bondingCurve) Ownable(msg.sender) {
        bondingCurve = _bondingCurve;
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }

    function setDexLister(address _dexLister) external onlyOwner {
        dexLister = _dexLister;
    }

    function createVesting(
        address asset,
        address beneficiary,
        uint256 amount,
        uint256 cliffDuration,
        uint256 vestingDuration
    ) external onlyBondingCurveOrDexLister {
        require(amount > 0, "zero amount");
        require(beneficiary != address(0), "zero beneficiary");
        require(vestingDuration >= cliffDuration, "vesting < cliff");

        VestingSchedule storage v = vestings[asset][beneficiary];
        require(!v.exists, "vesting exists");

        uint256 start = block.timestamp;
        v.totalAmount = amount;
        v.claimedAmount = 0;
        v.startTimestamp = start;
        v.cliffEnd = start + cliffDuration;
        v.vestingEnd = start + vestingDuration;
        v.exists = true;

        totalVestedAmount[asset] += amount;

        emit VestingCreated(asset, beneficiary, amount, v.cliffEnd, v.vestingEnd);
    }

    function claim(address asset) external nonReentrant whenNotPaused {
        VestingSchedule storage v = vestings[asset][msg.sender];
        require(v.exists, "no vesting");

        uint256 vested = _vestedAmount(v);
        uint256 claimable = vested - v.claimedAmount;
        require(claimable > 0, "nothing to claim");

        v.claimedAmount += claimable;
        totalVestedAmount[asset] -= claimable;

        IERC20(asset).safeTransfer(msg.sender, claimable);

        emit VestedTokensClaimed(asset, msg.sender, claimable);
    }

    function claimMultiple(address[] calldata assets) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < assets.length; i++) {
            VestingSchedule storage v = vestings[assets[i]][msg.sender];
            if (!v.exists) continue;

            uint256 vested = _vestedAmount(v);
            uint256 claimable = vested - v.claimedAmount;
            if (claimable == 0) continue;

            v.claimedAmount += claimable;
            totalVestedAmount[assets[i]] -= claimable;

            IERC20(assets[i]).safeTransfer(msg.sender, claimable);

            emit VestedTokensClaimed(assets[i], msg.sender, claimable);
        }
    }

    function pendingClaim(address asset, address beneficiary) external view returns (uint256) {
        VestingSchedule storage v = vestings[asset][beneficiary];
        if (!v.exists) return 0;
        return _vestedAmount(v) - v.claimedAmount;
    }

    function vestingInfo(address asset, address beneficiary) external view returns (
        uint256 totalAmount,
        uint256 claimedAmount,
        uint256 startTimestamp,
        uint256 cliffEnd,
        uint256 vestingEnd,
        bool exists
    ) {
        VestingSchedule storage v = vestings[asset][beneficiary];
        return (v.totalAmount, v.claimedAmount, v.startTimestamp, v.cliffEnd, v.vestingEnd, v.exists);
    }

    function _vestedAmount(VestingSchedule storage v) internal view returns (uint256) {
        if (block.timestamp < v.cliffEnd) return 0;
        if (block.timestamp >= v.vestingEnd) return v.totalAmount;

        uint256 elapsed = block.timestamp - v.startTimestamp;
        return (v.totalAmount * elapsed) / (v.vestingEnd - v.startTimestamp);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        uint256 protected = totalVestedAmount[token];
        require(contractBalance - protected >= amount, "insufficient unvested balance");
        IERC20(token).safeTransfer(to, amount);
    }
}
