// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @title DogePadProxy
 * @notice Transparent Upgradeable Proxy for DogePad contracts
 * @dev Uses OpenZeppelin's TransparentUpgradeableProxy pattern
 */
contract DogePadProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) TransparentUpgradeableProxy(_logic, admin_, _data) {}
}
