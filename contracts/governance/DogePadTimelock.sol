// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title DogePadTimelock
 * @notice Timelock controller for DogePad governance
 * @dev All admin operations go through a 48-hour delay
 */
contract DogePadTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
