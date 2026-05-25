// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IExponentialRateModel {
    function getRate(uint256 utilization) external pure returns (uint256);
    function getDailyRate(uint256 utilization) external pure returns (uint256);
    function getPerSecondRate(uint256 utilization) external pure returns (uint256);
}

interface ILinearRateModel {
    function getRate(uint256 utilization) external pure returns (uint256);
    function getPerSecondRate(uint256 utilization) external pure returns (uint256);
}

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256);
    function updateTwapPrice(address token, uint256 newPrice) external;
    function updateEffectivePrice(address token) external;
}

interface IBuyAndBurnEngine {
    function deposit(address token) external payable;
    function executeBurn(address token, uint256 minTokensOut) external;
    function totalBurned(address token) external view returns (uint256);
}

interface IBondingCurve {
    function buy(address token) external payable;
    function sell(address token, uint256 tokenAmount) external;
    function getBuyPrice(address token, uint256 bnbAmount) external view returns (uint256);
    function getSellPrice(address token, uint256 tokenAmount) external view returns (uint256);
    function isListed(address token) external view returns (bool);
}

interface ICreatorRewardManager {
    function createVesting(address asset, address beneficiary, uint256 amount, uint256 cliffDuration, uint256 vestingDuration) external;
    function claim(address asset) external;
    function claimMultiple(address[] calldata assets) external;
    function pendingClaim(address asset, address beneficiary) external view returns (uint256);
    function vestingInfo(address asset, address beneficiary) external view returns (
        uint256 totalAmount,
        uint256 claimedAmount,
        uint256 startTimestamp,
        uint256 cliffEnd,
        uint256 vestingEnd,
        bool exists
    );
}
