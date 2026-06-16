// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mock USDC token for local testing. Anyone can mint freely.
contract MockUSDC is ERC20 {
    uint8 private _decimals;

    constructor() ERC20("USD Coin", "USDC") {
        _decimals = 18;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint any amount of USDC for testing
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Mint to msg.sender for convenience
    function mintSelf(uint256 amount) external {
        _mint(msg.sender, amount);
    }
}
