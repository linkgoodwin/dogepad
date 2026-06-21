// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BondingCurveMath - Math library for bonding curve calculations
/// @notice Reduces main contract size by extracting math operations
library BondingCurveMath {
    uint256 internal constant PRECISION = 1e18;

    /// @notice Calculate current price based on tokens sold (linear bonding curve)
    /// @param tokensSold Current number of tokens sold
    /// @param basePrice Initial price (in USDC wei per token wei)
    /// @param slope Price increase per token sold
    /// @return Current price
    function getPrice(uint256 tokensSold, uint256 basePrice, uint256 slope) internal pure returns (uint256) {
        return basePrice + (slope * tokensSold) / PRECISION;
    }

    /// @notice Calculate token amount from USDC input (bonding curve buy)
    /// @param usdcAmount USDC amount to spend (in USDC wei = 6 decimals)
    /// @param tokensSold Current tokens sold
    /// @param basePrice Initial price
    /// @param slope Price slope
    /// @return Token amount
    function calcBuyAmount(
        uint256 usdcAmount,
        uint256 tokensSold,
        uint256 basePrice,
        uint256 slope
    ) internal pure returns (uint256) {
        uint256 priceS0 = getPrice(tokensSold, basePrice, slope);
        if (slope == 0) {
            if (priceS0 == 0) return 0;
            return (usdcAmount * PRECISION) / priceS0;
        }
        // Solve quadratic: (slope/2*PRECISION)*ds^2 + priceS0*ds - usdcAmount*PRECISION = 0
        // Using: ds = (-priceS0 + sqrt(priceS0^2 + 2*slope*usdcAmount)) * PRECISION / slope
        uint256 discriminant = priceS0 * priceS0 + 2 * slope * usdcAmount;
        if (discriminant < priceS0 * priceS0) return 0;
        uint256 sqrtD = sqrt(discriminant);
        if (sqrtD <= priceS0) return 0;
        uint256 ds = (sqrtD - priceS0) * PRECISION / slope;
        return ds;
    }

    /// @notice Calculate USDC output from token input (bonding curve sell)
    /// @param tokenAmount Token amount to sell
    /// @param tokensSold Current tokens sold
    /// @param basePrice Initial price
    /// @param slope Price slope
    /// @return USDC amount (in USDC wei = 6 decimals)
    function calcSellAmount(
        uint256 tokenAmount,
        uint256 tokensSold,
        uint256 basePrice,
        uint256 slope
    ) internal pure returns (uint256) {
        if (tokensSold < tokenAmount) return 0;
        uint256 s1 = tokensSold;
        uint256 s0 = s1 - tokenAmount;
        uint256 priceS1 = getPrice(s1, basePrice, slope);
        uint256 priceS0 = getPrice(s0, basePrice, slope);
        // Average price = (p0 + p1) / 2
        // USDC out = tokenAmount * avgPrice / PRECISION
        return (tokenAmount * (priceS0 + priceS1)) / (2 * PRECISION);
    }

    /// @notice Integer square root using Newton-Raphson
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = x;
        uint256 y = (x + 1) / 2;
        while (y < z) {
            z = y;
            y = (x / y + y) / 2;
        }
        return z;
    }
}
