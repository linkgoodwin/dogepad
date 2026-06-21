// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BondingCurveToken is ERC20, Ownable {
    uint256 public maxHoldingPercent;
    uint256 public buyTax;
    uint256 public sellTax;
    bool public taxEnabled;
    address public taxReceiver;
    address public bondingCurve;
    address public buyAndBurnEngine;
    address public dexLister;
    address public creatorTaxReceiver;
    uint256 public creatorTaxBps;
    address public dexPair;
    bool public skipHoldingLimit;

    // Allocation tracking for transparency
    uint256 public totalMintedForCurve;
    uint256 public totalMintedForCreator;
    uint256 public totalMintedForReferral;
    uint256 public totalMintedForInsurance;

    mapping(address => bool) public isExcludedFromTax;
    mapping(address => bool) public isExcludedFromHoldingLimit;

    // Presale state
    bool public isPresaleActive;
    uint256 public presaleStartTime;
    uint256 public presaleEndTime;
    mapping(address => bool) public isWhitelisted;
    mapping(address => uint256) public presalePurchases;
    uint256 public maxPresalePerUser;
    uint256 public presaleMinBuy;
    uint256 public presaleMaxBuy;
    uint256 public presalePrice; // price in USDC (wei units)

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 /* totalSupply_ */,
        address _taxReceiver,
        address _owner
    ) ERC20(name_, symbol_) Ownable(_owner) {
        maxHoldingPercent = 5;
        // Tax: 3% buy / 5% sell (aligned with redesign)
        buyTax = 300;   // 3% = 300 bps
        sellTax = 500;  // 5% = 500 bps
        taxEnabled = true;
        taxReceiver = _taxReceiver;
        creatorTaxBps = 0;
        isExcludedFromTax[_owner] = true;
        isExcludedFromTax[_taxReceiver] = true;
        isExcludedFromTax[address(this)] = true;
        isExcludedFromHoldingLimit[_owner] = true;
        isExcludedFromHoldingLimit[_taxReceiver] = true;
        isExcludedFromHoldingLimit[address(this)] = true;

        // DO NOT mint all tokens here! Let BondingCurve call mintTo() instead.
        // This fixes the critical bug where all tokens were minted to address(this),
        // leaving BondingCurve with 0 balance and causing all buy() to revert.
        // _mint(address(this), totalSupply_);
    }

    /// @notice Mint tokens to a specified address (called by BondingCurve after creation)
    /// @dev Fixes the root bug: tokens must be minted to BondingCurve, not to this contract
    /// @param to Address to receive tokens
    /// @param amount Amount of tokens to mint
    function mintTo(address to, uint256 amount) external {
        require(msg.sender == bondingCurve, "only bonding curve");
        _mint(to, amount);
    }

    /// @notice Set presale parameters (called by BondingCurve after creation)
    /// @param _presaleStartTime Unix timestamp when presale starts
    /// @param _presaleEndTime Unix timestamp when presale ends
    /// @param _maxPresalePerUser Max USDC amount per user during presale
    /// @param _presaleMinBuy Minimum USDC purchase during presale
    /// @param _presaleMaxBuy Maximum USDC purchase during presale
    /// @param _presalePrice Price per token during presale (in USDC wei)
    function setPresaleParams(
        uint256 _presaleStartTime,
        uint256 _presaleEndTime,
        uint256 _maxPresalePerUser,
        uint256 _presaleMinBuy,
        uint256 _presaleMaxBuy,
        uint256 _presalePrice
    ) external {
        require(msg.sender == bondingCurve, "only bonding curve");
        presaleStartTime = _presaleStartTime;
        presaleEndTime = _presaleEndTime;
        maxPresalePerUser = _maxPresalePerUser;
        presaleMinBuy = _presaleMinBuy;
        presaleMaxBuy = _presaleMaxBuy;
        presalePrice = _presalePrice;
        isPresaleActive = (_presaleStartTime > 0);
    }

    /// @notice Add addresses to presale whitelist
    function setWhitelist(address[] calldata addresses, bool status) external {
        require(msg.sender == bondingCurve, "only bonding curve");
        for (uint256 i = 0; i < addresses.length; i++) {
            isWhitelisted[addresses[i]] = status;
        }
    }

    /// @notice Check if address can participate in presale
    modifier onlyDuringPresale(address buyer, uint256 amount) {
        if (isPresaleActive && block.timestamp >= presaleStartTime && block.timestamp < presaleEndTime) {
            require(isWhitelisted[buyer] || presaleMaxBuy == 0, "not whitelisted for presale");
            require(amount >= presaleMinBuy, "below minimum presale purchase");
            require(presalePurchases[buyer] + amount <= maxPresalePerUser, "presale limit exceeded");
            presalePurchases[buyer] += amount;
        }
        _;
    }

    function setBondingCurve(address _bondingCurve) external {
        bondingCurve = _bondingCurve;
        _approve(address(this), _bondingCurve, type(uint256).max);
        isExcludedFromTax[_bondingCurve] = true;
        isExcludedFromHoldingLimit[_bondingCurve] = true;
    }

    function setBuyAndBurnEngine(address _engine) external {
        buyAndBurnEngine = _engine;
        isExcludedFromTax[_engine] = true;
        isExcludedFromHoldingLimit[_engine] = true;
    }

    function setDexLister(address _dexLister) external {
        dexLister = _dexLister;
        isExcludedFromTax[_dexLister] = true;
        isExcludedFromHoldingLimit[_dexLister] = true;
    }

    function buyFromCurve(address to, uint256 amount) external {
        require(msg.sender == bondingCurve, "only bonding curve");
        _update(address(this), to, amount);
    }

    function sellToCurve(address from, uint256 amount) external {
        require(msg.sender == bondingCurve, "only bonding curve");
        _update(from, address(this), amount);
    }

    function burn(uint256 amount) external {
        require(
            msg.sender == bondingCurve || msg.sender == buyAndBurnEngine || msg.sender == dexLister,
            "not authorized"
        );
        _burn(msg.sender, amount);
    }

    function setTaxes(uint256 _buyTax, uint256 _sellTax) external onlyOwner {
        require(_buyTax <= 1000, "buy tax too high");
        require(_sellTax <= 1000, "sell tax too high");
        buyTax = _buyTax;
        sellTax = _sellTax;
    }

    function setMaxHoldingPercent(uint256 _percent) external onlyOwner {
        require(_percent >= 1 && _percent <= 100, "invalid percent");
        maxHoldingPercent = _percent;
    }

    function setTaxEnabled(bool _enabled) external onlyOwner {
        taxEnabled = _enabled;
    }

    function setCreatorTaxReceiver(address _creatorTaxReceiver, uint256 _creatorTaxBps) external {
        require(msg.sender == bondingCurve || msg.sender == dexLister, "only bonding curve");
        require(_creatorTaxBps <= 5000, "max 50%");
        creatorTaxReceiver = _creatorTaxReceiver;
        creatorTaxBps = _creatorTaxBps;
        if (_creatorTaxReceiver != address(0)) {
            isExcludedFromTax[_creatorTaxReceiver] = true;
            isExcludedFromHoldingLimit[_creatorTaxReceiver] = true;
        }
    }

    function setDexPair(address _dexPair) external {
        require(msg.sender == bondingCurve || msg.sender == dexLister, "only bonding curve");
        dexPair = _dexPair;
        if (_dexPair != address(0)) {
            isExcludedFromHoldingLimit[_dexPair] = true;
            isExcludedFromTax[_dexPair] = true;
        }
    }

    function setSkipHoldingLimit(bool skip) external {
        require(msg.sender == bondingCurve || msg.sender == dexLister || msg.sender == owner(), "not authorized");
        skipHoldingLimit = skip;
    }

    function excludeFromTax(address account) external {
        require(msg.sender == owner() || msg.sender == bondingCurve, "not authorized");
        isExcludedFromTax[account] = true;
    }

    function excludeFromHoldingLimit(address account) external {
        require(msg.sender == owner() || msg.sender == bondingCurve, "not authorized");
        isExcludedFromHoldingLimit[account] = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (!skipHoldingLimit && !isExcludedFromHoldingLimit[to] && to != address(0) && to != address(this) && dexPair == address(0)) {
            uint256 circulatingSupply = totalSupply() - balanceOf(address(this));
            uint256 maxHold = (circulatingSupply * maxHoldingPercent) / 100;
            if (maxHold > 0) {
                require(balanceOf(to) + value <= maxHold, "exceeds holding limit");
            }
        }

        if (taxEnabled && from != address(0) && to != address(0)) {
            if (!isExcludedFromTax[from] && !isExcludedFromTax[to]) {
                bool isBuy = (from == bondingCurve || from == address(this)) ||
                    (dexPair != address(0) && from == dexPair);
                bool isSell = (to == bondingCurve || to == address(this)) ||
                    (dexPair != address(0) && to == dexPair);

                if (isBuy) {
                    uint256 tax = (value * buyTax) / 10000;
                    if (tax > 0) {
                        if (creatorTaxBps > 0 && creatorTaxReceiver != address(0)) {
                            uint256 creatorShare = (tax * creatorTaxBps) / 10000;
                            super._update(from, creatorTaxReceiver, creatorShare);
                            super._update(from, taxReceiver, tax - creatorShare);
                        } else {
                            super._update(from, taxReceiver, tax);
                        }
                        value -= tax;
                    }
                } else if (isSell) {
                    uint256 tax = (value * sellTax) / 10000;
                    if (tax > 0) {
                        if (creatorTaxBps > 0 && creatorTaxReceiver != address(0)) {
                            uint256 creatorShare = (tax * creatorTaxBps) / 10000;
                            super._update(from, creatorTaxReceiver, creatorShare);
                            super._update(from, taxReceiver, tax - creatorShare);
                        } else {
                            super._update(from, taxReceiver, tax);
                        }
                        value -= tax;
                    }
                }
            }
        }

        super._update(from, to, value);
    }
}
