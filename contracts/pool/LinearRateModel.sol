// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "prb-math/contracts/PRBMathUD60x18.sol";
import "./ExponentialRateModel.sol";

contract LinearRateModel is IExponentialRateModel {
    using PRBMathUD60x18 for uint256;

    uint256 public baseRatePerYear = 2e16;
    uint256 public multiplierPerYear = 8e16;
    uint256 public jumpMultiplierPerYear = 100e16;
    uint256 public kink = 8e17;

    function getRate(uint256 utilization) public view returns (uint256) {
        if (utilization <= kink) {
            return baseRatePerYear + utilization.mul(multiplierPerYear).div(kink);
        } else {
            uint256 normalRate = baseRatePerYear + multiplierPerYear;
            uint256 excessUtilization = utilization - kink;
            return normalRate + excessUtilization.mul(jumpMultiplierPerYear).div(1e18 - kink);
        }
    }

    function getDailyRate(uint256 utilization) external view returns (uint256) {
        return getRate(utilization) / 365;
    }

    function getPerSecondRate(uint256 utilization) external view returns (uint256) {
        return getRate(utilization) / 31536000;
    }
}
