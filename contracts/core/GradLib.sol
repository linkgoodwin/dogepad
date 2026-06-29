// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./BondingCurveToken.sol";
import "../periphery/DexLister.sol";

/// @title GradLib - Graduation library for BondingCurve
/// @notice External library to handle DEX listing, reducing main BC bytecode.
/// Deployed as a separate contract - its bytecode does NOT count toward BC's 24KB limit.
/// Called via delegatecall from BondingCurve or as a regular external call.
library GradLib {
    uint256 private constant BPS10 = 1000;
    uint256 private constant BPS5A = 500;

    struct GradInput {
        address token;
        uint256 totalTokens;
        address creator;
        bool cTS; // creatorTaxShare
        bool cLS; // creatorLpShare
        bool cTA; // creatorTokenAllocation
        address dexLister;
        uint256 totalUsdc;
    }

    /// @dev Calculate graduation incentive parameters
    function calcIncentive(
        uint256 totalTokens,
        bool cTS,
        bool cLS,
        bool cTA
    ) external pure returns (uint256 ctBps, uint256 clBps, uint256 creatorTokens, uint8 cnt, uint256 mult) {
        uint8 cnt_ = (cTS ? 1 : 0) + (cLS ? 1 : 0) + (cTA ? 1 : 0);
        if (cnt_ == 0) cnt_ = 1;
        uint256 mult_ = cnt_ == 1 ? 10000 : (cnt_ == 2 ? 4500 : 2800);
        ctBps = cTA ? (BPS5A * mult_) / 10000 : 0;
        clBps = cLS ? (BPS10 * mult_) / 10000 : 0;
        creatorTokens = (totalTokens * ctBps) / 10000;
        cnt = cnt_;
        mult = mult_;
    }
}

/// @dev Shared TokenInfo struct (must match BondingCurve's TI)
struct TI {
    address token;
    address creator;
    uint256 totalSupply;
    uint256 rUsdc;
    uint256 tokensSold;
    bool listed;
    bool graduating;
    string metadataURI;
    bool hasPresale;
    uint256 psStart;
    uint256 psEnd;
    uint256 psMinBuy;
    uint256 psMaxBuy;
    uint256 psMaxTotal;
    uint256 psRaised;
    uint256 psPrice;
    bool cTS;
    bool cLS;
    bool cTA;
}
