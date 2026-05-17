// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "prb-math/contracts/PRBMathUD60x18.sol";

interface IExponentialRateModel {
    function getDailyRate(uint256 utilization) external view returns (uint256);
    function getPerSecondRate(uint256 utilization) external view returns (uint256);
}

contract ExponentialRateModel is IExponentialRateModel {
    using PRBMathUD60x18 for uint256;

    uint256 public baseRate = 1e16;
    uint256 public k = 4706e15;

    function getRate(uint256 utilization) public view returns (uint256) {
        uint256 utilizationSquared = utilization.mul(utilization);
        uint256 exponent = k.mul(utilizationSquared);
        uint256 expResult = _exp(exponent);
        return baseRate.mul(expResult);
    }

    function _exp(uint256 x) internal pure returns (uint256) {
        uint256 sum = 1e18;
        uint256 term = x;
        sum += term;
        term = term.mul(x) / 2;
        sum += term;
        term = term.mul(x) / 3;
        sum += term;
        term = term.mul(x) / 4;
        sum += term;
        term = term.mul(x) / 5;
        sum += term;
        term = term.mul(x) / 6;
        sum += term;
        return sum;
    }

    function getDailyRate(uint256 utilization) external view returns (uint256) {
        return getRate(utilization);
    }

    function getPerSecondRate(uint256 utilization) external view returns (uint256) {
        return getRate(utilization) / 86400;
    }
}
