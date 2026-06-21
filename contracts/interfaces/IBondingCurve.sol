// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBondingCurve {
    function buy(address token, uint256 minTokensOut, address recipient, address referrer) external payable;
    function buy(address token, uint256 minTokensOut, address recipient) external payable;
    function sell(address token, uint256 tokenAmount, uint256 minUsdcOut) external;
    function getBuyPrice(address token, uint256 usdcAmount) external view returns (uint256);
    function getSellPrice(address token, uint256 tokenAmount) external view returns (uint256);
    function getReserve(address token) external view returns (uint256);
    function isListed(address token) external view returns (bool);

    // Token creation
    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external payable returns (address);

    function triggerGraduation(address token) external;
}
