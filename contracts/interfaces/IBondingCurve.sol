// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondingCurve {
    event TokenBought(address indexed token, address indexed buyer, uint256 usdcAmount, uint256 tokenAmount);
    event TokenSold(address indexed token, address indexed seller, uint256 tokenAmount, uint256 usdcAmount);
    event DexListed(address indexed token, uint256 lpUsdc, uint256 lpTokens);
    event CreatorIncentiveSet(address indexed token, address indexed creator, bool taxShare, bool lpShare, bool tokenAllocation);

    function buy(address token, uint256 minTokensOut, address recipient) external payable;
    function sell(address token, uint256 tokenAmount, uint256 minUsdcOut) external;
    function getBuyPrice(address token, uint256 usdcAmount) external view returns (uint256);
    function getSellPrice(address token, uint256 tokenAmount) external view returns (uint256);
    function getReserve(address token) external view returns (uint256);
    function isListed(address token) external view returns (bool);
}
