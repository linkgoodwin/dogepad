// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";
import "./ExponentialRateModel.sol";

interface IShortPriceOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IMaturityCheck {
    function isMature(address token) external view returns (bool);
}

interface ILongPoolReceiver {
    function receiveShortPoolInterest(address token) external payable;
}

struct ShortPosition {
    uint256 collateralUsdc;
    uint256 borrowedTokens;
    uint256 borrowTimestamp;
    bool isActive;
}

contract ShortPool is ReentrancyGuard, Pausable, Ownable {
    using PRBMathUD60x18 for uint256;
    using SafeERC20 for IERC20;

    IExponentialRateModel public earlyRateModel;
    IExponentialRateModel public matureRateModel;
    IShortPriceOracle public oracle;
    address public burnEngine;
    address public longPool;
    address public platformTreasury;
    address public bondingCurve;

    mapping(address => uint256) public lastInteractionBlock;
    mapping(address => mapping(address => ShortPosition)) public positions;
    mapping(address => uint256) public tokenAvailable;
    mapping(address => uint256) public tokenBorrowed;

    uint256 public constant COLLATERAL_RATIO = 150e16;
    uint256 public constant OPEN_FEE = 5e15;
    uint256 public constant MAX_UTILIZATION = 90e16;
    uint256 public constant MIN_BILLABLE_SECONDS = 3600;
    uint256 public constant CLOSE_FACTOR = 5e17;
    uint256 public constant LIQUIDATION_BONUS = 8e16;
    uint256 public constant HEALTH_FACTOR_THRESHOLD = 1e18;

    mapping(address => uint256) public cooldownEnd;
    uint256 public constant COOLDOWN_PERIOD = 86400;
    uint256 public constant COOLDOWN_UTILIZATION = 70e16;
    uint256 public shortCooldownEnd;

    constructor(
        address _earlyRateModel,
        address _matureRateModel,
        address _oracle,
        address _burnEngine,
        address _longPool,
        address _platformTreasury
    ) Ownable(msg.sender) {
        earlyRateModel = IExponentialRateModel(_earlyRateModel);
        matureRateModel = IExponentialRateModel(_matureRateModel);
        oracle = IShortPriceOracle(_oracle);
        burnEngine = _burnEngine;
        longPool = _longPool;
        platformTreasury = _platformTreasury;
    }

    function depositTokens(address token, uint256 amount) external {
        require(msg.sender == bondingCurve || msg.sender == owner(), "not authorized");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenAvailable[token] += amount;
    }

    function borrow(address token, uint256 tokenAmount) external payable nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        require(tokenAmount > 0);
        require(cooldownEnd[token] <= block.timestamp);
        require(tokenAvailable[token] > 0);
        require(block.timestamp >= shortCooldownEnd, "shorting cooldown active");

        uint256 price = oracle.getPrice(token);
        uint256 tokenValue = tokenAmount.mul(price);
        uint256 requiredCollateral = tokenValue.mul(COLLATERAL_RATIO);
        require(msg.value >= requiredCollateral);

        uint256 newBorrowed = tokenBorrowed[token] + tokenAmount;
        uint256 newUtilization = newBorrowed.div(tokenAvailable[token]);
        require(newUtilization < MAX_UTILIZATION);

        uint256 openFee = msg.value.mul(OPEN_FEE);
        (bool feeSuccess,) = payable(burnEngine).call{value: openFee}("");
        require(feeSuccess);

        tokenBorrowed[token] = newBorrowed;

        if (newUtilization > COOLDOWN_UTILIZATION) {
            shortCooldownEnd = block.timestamp + 1 hours;
        }

        positions[msg.sender][token] = ShortPosition({
            collateralUsdc: msg.value - openFee,
            borrowedTokens: tokenAmount,
            borrowTimestamp: block.timestamp,
            isActive: true
        });

        IERC20(token).safeTransfer(msg.sender, tokenAmount);

        lastInteractionBlock[msg.sender] = block.number;
    }

    function repay(address token, uint256 tokenAmount) external nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        ShortPosition storage position = positions[msg.sender][token];
        require(position.isActive);
        require(tokenAmount == position.borrowedTokens);

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);

        uint256 interest = calculateInterest(msg.sender, token);
        uint256 distributable = interest < position.collateralUsdc ? interest : position.collateralUsdc;
        uint256 collateralToReturn = position.collateralUsdc - distributable;

        tokenBorrowed[token] -= position.borrowedTokens;

        delete positions[msg.sender][token];

        _distributeInterest(distributable, token);

        if (collateralToReturn > 0) {
            (bool userSuccess,) = payable(msg.sender).call{value: collateralToReturn}("");
            require(userSuccess);
        }

        lastInteractionBlock[msg.sender] = block.number;
    }

    function liquidate(address borrower, address token) external nonReentrant whenNotPaused {
        require(borrower != msg.sender, "cannot self-liquidate");
        ShortPosition storage position = positions[borrower][token];
        require(position.isActive);

        uint256 hf = getHealthFactor(borrower, token);
        require(hf < HEALTH_FACTOR_THRESHOLD, "position healthy");

        uint256 maxRepayTokens = (position.borrowedTokens * CLOSE_FACTOR) / 1e18;
        IERC20(token).safeTransferFrom(msg.sender, address(this), maxRepayTokens);

        uint256 interest = calculateInterest(borrower, token);
        uint256 repayRatio = (maxRepayTokens * 1e18) / position.borrowedTokens;

        uint256 collateralToSeize = (position.collateralUsdc * repayRatio) / 1e18;
        uint256 bonusUsdc = (collateralToSeize * LIQUIDATION_BONUS) / 1e18;
        uint256 totalSeize = collateralToSeize + bonusUsdc;

        uint256 propInterest = (interest * repayRatio) / 1e18;
        uint256 totalDeduct = totalSeize + propInterest;
        if (totalDeduct > position.collateralUsdc) {
            totalDeduct = position.collateralUsdc;
            totalSeize = totalDeduct > propInterest ? totalDeduct - propInterest : 0;
        }

        tokenBorrowed[token] -= maxRepayTokens;

        uint256 remainingTokens = position.borrowedTokens - maxRepayTokens;
        if (remainingTokens > 0 && totalDeduct < position.collateralUsdc) {
            position.borrowedTokens = remainingTokens;
            position.collateralUsdc -= totalDeduct;
            position.borrowTimestamp = block.timestamp;
            tokenBorrowed[token] += remainingTokens;
        } else {
            delete positions[borrower][token];
        }

        if (propInterest > 0) {
            _distributeInterest(propInterest, token);
        }

        if (totalSeize > 0) {
            (bool success,) = payable(msg.sender).call{value: totalSeize}("");
            require(success);
        }
    }

    function _distributeInterest(uint256 distributable, address token) internal {
        uint256 utilization = getUtilization(token);

        uint256 longPoolShare;
        uint256 burnEngineShare;
        uint256 treasuryShare;

        if (utilization < 30e16) {
            longPoolShare = distributable * 60 / 100;
            burnEngineShare = distributable * 20 / 100;
            treasuryShare = distributable * 20 / 100;
        } else if (utilization < 60e16) {
            longPoolShare = distributable * 40 / 100;
            burnEngineShare = distributable * 40 / 100;
            treasuryShare = distributable * 20 / 100;
        } else {
            longPoolShare = distributable * 20 / 100;
            burnEngineShare = distributable * 60 / 100;
            treasuryShare = distributable * 20 / 100;
        }

        if (longPoolShare > 0 && longPool != address(0)) {
            ILongPoolReceiver(longPool).receiveShortPoolInterest{value: longPoolShare}(token);
        }
        if (burnEngineShare > 0) {
            (bool beSuccess,) = payable(burnEngine).call{value: burnEngineShare}("");
            require(beSuccess);
        }
        if (treasuryShare > 0) {
            (bool tsSuccess,) = payable(platformTreasury).call{value: treasuryShare}("");
            require(tsSuccess);
        }
    }

    function getUtilization(address token) public view returns (uint256) {
        if (tokenAvailable[token] == 0) return 0;
        return tokenBorrowed[token].div(tokenAvailable[token]);
    }

    function _getRateModel(address token) internal view returns (IExponentialRateModel) {
        if (bondingCurve != address(0) && IMaturityCheck(bondingCurve).isMature(token)) {
            return matureRateModel;
        }
        return earlyRateModel;
    }

    function getDailyRate(address token) public view returns (uint256) {
        IExponentialRateModel model = _getRateModel(token);
        return model.getDailyRate(getUtilization(token));
    }

    function calculateInterest(address user, address token) public view returns (uint256 usdcInterest) {
        ShortPosition memory position = positions[user][token];
        if (!position.isActive || position.borrowedTokens == 0) return 0;

        uint256 actualDuration = block.timestamp - position.borrowTimestamp;
        uint256 billableDuration = actualDuration > MIN_BILLABLE_SECONDS ? actualDuration : MIN_BILLABLE_SECONDS;

        IExponentialRateModel model = _getRateModel(token);
        uint256 utilization = getUtilization(token);
        uint256 perSecondRate = model.getPerSecondRate(utilization);

        uint256 tokenInterest = position.borrowedTokens.mul(perSecondRate) * billableDuration;
        usdcInterest = tokenInterest.mul(oracle.getPrice(token));
    }

    function getHealthFactor(address user, address token) public view returns (uint256) {
        ShortPosition memory position = positions[user][token];
        if (!position.isActive || position.borrowedTokens == 0) return type(uint256).max;

        uint256 tokenValue = position.borrowedTokens.mul(oracle.getPrice(token));
        uint256 interest = calculateInterest(user, token);
        uint256 totalDebtUsdc = tokenValue + interest;
        if (totalDebtUsdc == 0) return type(uint256).max;
        return position.collateralUsdc.mul(1e18) / totalDebtUsdc;
    }

    function setCooldown(address token) external {
        require(msg.sender == bondingCurve);
        cooldownEnd[token] = block.timestamp + COOLDOWN_PERIOD;
    }

    function setLongPool(address _longPool) external onlyOwner {
        longPool = _longPool;
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }

    function setEarlyRateModel(address _model) external onlyOwner {
        earlyRateModel = IExponentialRateModel(_model);
    }

    function setMatureRateModel(address _model) external onlyOwner {
        matureRateModel = IExponentialRateModel(_model);
    }

    function setPlatformTreasury(address _platformTreasury) external onlyOwner {
        platformTreasury = _platformTreasury;
    }
}
