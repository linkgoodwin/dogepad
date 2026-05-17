// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../core/BondingCurve.sol";

contract BondingCurveFactory is Ownable {
    address payable public bondingCurve;
    address[] public allTokens;
    mapping(address => address) public tokenToCurve;
    mapping(address => bool) public isTokenCreated;
    uint256 public tokenCount;

    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 totalSupply);

    constructor(address payable _bondingCurve) Ownable(msg.sender) {
        bondingCurve = _bondingCurve;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external payable returns (address) {
        require(msg.value >= BondingCurve(bondingCurve).creationFee(), "insufficient fee");

        address token = BondingCurve(bondingCurve).createToken{value: msg.value}(
            name,
            symbol,
            totalSupply,
            metadataURI,
            wantTaxShare,
            wantLpShare,
            wantTokenAllocation
        );

        allTokens.push(token);
        tokenToCurve[token] = bondingCurve;
        isTokenCreated[token] = true;
        tokenCount++;

        emit TokenCreated(token, msg.sender, name, symbol, totalSupply);
        return token;
    }

    function allTokensLength() external view returns (uint256) {
        return allTokens.length;
    }

    function getCurve(address token) external view returns (address) {
        return tokenToCurve[token];
    }

    function getTokens(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 length = allTokens.length;
        if (offset >= length) return new address[](0);

        uint256 end = offset + limit;
        if (end > length) end = length;

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = allTokens[i];
        }
        return result;
    }

    function setBondingCurve(address payable _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }
}
