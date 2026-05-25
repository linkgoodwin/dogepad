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

    mapping(address => bool) public isExcludedFromTax;
    mapping(address => bool) public isExcludedFromHoldingLimit;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address _taxReceiver,
        address _owner
    ) ERC20(name_, symbol_) Ownable(_owner) {
        maxHoldingPercent = 5;
        buyTax = 100;
        sellTax = 200;
        taxEnabled = true;
        taxReceiver = _taxReceiver;
        creatorTaxBps = 0;
        isExcludedFromTax[_owner] = true;
        isExcludedFromTax[_taxReceiver] = true;
        isExcludedFromTax[address(this)] = true;
        isExcludedFromHoldingLimit[_owner] = true;
        isExcludedFromHoldingLimit[_taxReceiver] = true;
        isExcludedFromHoldingLimit[address(this)] = true;
        _mint(address(this), totalSupply_);
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
        _approve(address(this), _bondingCurve, type(uint256).max);
        isExcludedFromTax[_bondingCurve] = true;
        isExcludedFromHoldingLimit[_bondingCurve] = true;
    }

    function setBuyAndBurnEngine(address _engine) external onlyOwner {
        buyAndBurnEngine = _engine;
        isExcludedFromTax[_engine] = true;
        isExcludedFromHoldingLimit[_engine] = true;
    }

    function setDexLister(address _dexLister) external onlyOwner {
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
        require(msg.sender == bondingCurve || msg.sender == dexLister, "only bonding curve");
        skipHoldingLimit = skip;
    }

    function excludeFromTax(address account) external onlyOwner {
        isExcludedFromTax[account] = true;
    }

    function excludeFromHoldingLimit(address account) external onlyOwner {
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
