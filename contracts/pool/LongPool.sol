// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "prb-math/contracts/PRBMathUD60x18.sol";
import "./ExponentialRateModel.sol";

interface ILongPriceOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IMaturityCheck {
    function isMature(address token) external view returns (bool);
}

struct DepositInfo {
    uint256 amount;
    uint256 rewardDebt;
    uint256 pendingRewards;
}

struct BorrowInfo {
    address collateralToken;
    uint256 collateralAmount;
    uint256 borrowAmount;
    uint256 borrowTimestamp;
}

contract LongPool is ReentrancyGuard, Pausable, Ownable {
    using PRBMathUD60x18 for uint256;
    using SafeERC20 for IERC20;

    IExponentialRateModel public earlyRateModel;
    IExponentialRateModel public matureRateModel;
    ILongPriceOracle public oracle;
    address public burnEngine;
    address public bondingCurve;
    uint256 public earlyBurnRatio = 1e16;
    uint256 public matureBurnRatio = 5e16;
    uint256 public burnRatio = 1e16;

    mapping(address => uint256) public lastInteractionBlock;
    mapping(address => DepositInfo) public deposits;
    mapping(address => BorrowInfo) public borrows;

    uint256 public totalDeposits;
    uint256 public totalBorrows;
    uint256 public accRewardPerShare;
    uint256 public reserveFactor = 10e16;
    uint256 public earlyBurnEngineShare = 5e16;
    uint256 public matureBurnEngineShare = 10e16;
    uint256 public burnEngineShare = 5e16;

    mapping(address => uint256) public tokenLTV;
    mapping(address => uint256) public tokenLiquidationThreshold;
    uint256 public constant MIN_BILLABLE_SECONDS = 3600;
    uint256 public constant CLOSE_FACTOR = 5e17;
    uint256 public constant LIQUIDATION_BONUS = 8e16;
    uint256 public constant HEALTH_FACTOR_THRESHOLD = 1e18;
    uint256 public constant MAX_UTILIZATION = 85e16;

    event Deposited(address indexed user, uint256 amount, uint256 burnAmount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, address collateralToken, uint256 collateralAmount, uint256 borrowBnb);
    event Repaid(address indexed user, uint256 principal, uint256 interest);
    event Liquidated(address indexed liquidator, address indexed borrower, uint256 repaidBnb, uint256 seizedCollateral, uint256 bonus);
    event DepositYieldClaimed(address indexed user, uint256 amount);

    constructor(address _earlyRateModel, address _matureRateModel, address _oracle) Ownable(msg.sender) {
        earlyRateModel = IExponentialRateModel(_earlyRateModel);
        matureRateModel = IExponentialRateModel(_matureRateModel);
        oracle = ILongPriceOracle(_oracle);
    }

    function deposit() external payable nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        require(msg.value > 0);

        uint256 burnAmount = 0;
        uint256 utilization = totalDeposits > 0 ? (totalBorrows * 1e18) / totalDeposits : 0;
        if (utilization < 70e16) {
            burnAmount = (msg.value * burnRatio) / 1e18;
        }
        uint256 reserveAmount = msg.value - burnAmount;

        if (burnAmount > 0 && burnEngine != address(0)) {
            (bool sent, ) = payable(burnEngine).call{value: burnAmount}("");
            require(sent, "burn transfer failed");
        }

        DepositInfo storage dep = deposits[msg.sender];
        if (dep.amount > 0) {
            uint256 pending = (dep.amount * accRewardPerShare / 1e18) - dep.rewardDebt;
            if (pending > 0) {
                dep.pendingRewards += pending;
            }
        }

        dep.amount += reserveAmount;
        dep.rewardDebt = dep.amount * accRewardPerShare / 1e18;
        totalDeposits += reserveAmount;
        lastInteractionBlock[msg.sender] = block.number;

        emit Deposited(msg.sender, reserveAmount, burnAmount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        DepositInfo storage dep = deposits[msg.sender];
        require(dep.amount >= amount);

        uint256 newTotalDeposits = totalDeposits - amount;
        if (newTotalDeposits > 0 && totalBorrows > 0) {
            uint256 newUtilization = (totalBorrows * 1e18) / newTotalDeposits;
            require(newUtilization <= MAX_UTILIZATION, "would exceed max utilization");
        }

        uint256 pending = (dep.amount * accRewardPerShare / 1e18) - dep.rewardDebt;
        if (pending > 0) {
            dep.pendingRewards += pending;
        }

        dep.amount -= amount;
        dep.rewardDebt = dep.amount * accRewardPerShare / 1e18;
        totalDeposits -= amount;

        (bool success,) = payable(msg.sender).call{value: amount}("");
        require(success);

        lastInteractionBlock[msg.sender] = block.number;
        emit Withdrawn(msg.sender, amount);
    }

    function claimYield() external nonReentrant whenNotPaused {
        DepositInfo storage dep = deposits[msg.sender];
        uint256 pending = (dep.amount * accRewardPerShare / 1e18) - dep.rewardDebt;
        uint256 totalClaim = dep.pendingRewards + pending;

        dep.pendingRewards = 0;
        dep.rewardDebt = dep.amount * accRewardPerShare / 1e18;

        if (totalClaim > 0) {
            require(address(this).balance >= totalClaim);
            (bool success,) = payable(msg.sender).call{value: totalClaim}("");
            require(success);
        }

        emit DepositYieldClaimed(msg.sender, totalClaim);
    }

    function borrow(
        address collateralToken,
        uint256 collateralAmount,
        uint256 borrowBnb
    ) external nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        require(borrowBnb > 0);
        require(borrows[msg.sender].borrowAmount == 0);
        require(address(this).balance >= borrowBnb);

        IERC20(collateralToken).safeTransferFrom(msg.sender, address(this), collateralAmount);

        borrows[msg.sender] = BorrowInfo({
            collateralToken: collateralToken,
            collateralAmount: collateralAmount,
            borrowAmount: borrowBnb,
            borrowTimestamp: block.timestamp
        });

        uint256 hf = getHealthFactor(msg.sender);
        require(hf >= HEALTH_FACTOR_THRESHOLD);

        totalBorrows += borrowBnb;

        uint256 newUtilization = (totalBorrows * 1e18) / totalDeposits;
        require(newUtilization <= MAX_UTILIZATION, "utilization too high");

        (bool success,) = payable(msg.sender).call{value: borrowBnb}("");
        require(success);

        lastInteractionBlock[msg.sender] = block.number;
        emit Borrowed(msg.sender, collateralToken, collateralAmount, borrowBnb);
    }

    function repay() external payable nonReentrant whenNotPaused {
        require(block.number > lastInteractionBlock[msg.sender]);
        BorrowInfo memory info = borrows[msg.sender];
        require(info.borrowAmount > 0);

        uint256 interest = calculateInterest(msg.sender);
        uint256 totalOwed = info.borrowAmount + interest;
        require(msg.value >= totalOwed);

        uint256 burnShare = (interest * burnEngineShare) / 1e18;
        uint256 reserveShare = (interest * reserveFactor) / 1e18;
        uint256 lenderShare = interest - burnShare - reserveShare;

        if (burnShare > 0 && burnEngine != address(0)) {
            (bool burnSent, ) = payable(burnEngine).call{value: burnShare}("");
            require(burnSent, "burn share failed");
        }

        if (lenderShare > 0 && totalDeposits > 0) {
            accRewardPerShare += (lenderShare * 1e18) / totalDeposits;
        }

        totalBorrows -= info.borrowAmount;
        delete borrows[msg.sender];

        uint256 excess = msg.value - totalOwed;
        if (excess > 0) {
            (bool success,) = payable(msg.sender).call{value: excess}("");
            require(success);
        }

        lastInteractionBlock[msg.sender] = block.number;
        emit Repaid(msg.sender, info.borrowAmount, interest);
    }

    function liquidate(address borrower) external payable nonReentrant whenNotPaused {
        require(borrower != msg.sender, "cannot self-liquidate");
        BorrowInfo storage info = borrows[borrower];
        require(info.borrowAmount > 0);

        uint256 hf = getHealthFactor(borrower);
        require(hf < HEALTH_FACTOR_THRESHOLD, "position healthy");

        uint256 maxRepay = (info.borrowAmount * CLOSE_FACTOR) / 1e18;
        uint256 repayAmount = msg.value > maxRepay ? maxRepay : msg.value;
        require(repayAmount > 0);

        uint256 interest = calculateInterest(borrower);
        uint256 totalOwed = info.borrowAmount + interest;
        uint256 repayRatio = (repayAmount * 1e18) / totalOwed;

        uint256 collateralToSeize = (info.collateralAmount * repayRatio) / 1e18;
        uint256 bonusCollateral = (collateralToSeize * LIQUIDATION_BONUS) / 1e18;
        collateralToSeize += bonusCollateral;

        if (collateralToSeize > info.collateralAmount) {
            collateralToSeize = info.collateralAmount;
        }

        uint256 reserveShare = (interest * repayRatio / 1e18 * reserveFactor) / 1e18;
        uint256 burnShareLiq = (interest * repayRatio / 1e18 * burnEngineShare) / 1e18;
        uint256 lenderShare = (interest * repayRatio / 1e18) - reserveShare - burnShareLiq;

        if (burnShareLiq > 0 && burnEngine != address(0)) {
            (bool burnSent, ) = payable(burnEngine).call{value: burnShareLiq}("");
            require(burnSent, "burn share failed");
        }

        if (lenderShare > 0 && totalDeposits > 0) {
            accRewardPerShare += (lenderShare * 1e18) / totalDeposits;
        }

        uint256 remainingDebt = totalOwed - repayAmount;
        totalBorrows -= info.borrowAmount;

        if (remainingDebt > 0 && collateralToSeize < info.collateralAmount) {
            uint256 remainingPrincipal = info.borrowAmount - (info.borrowAmount * repayRatio / 1e18);
            info.borrowAmount = remainingPrincipal;
            info.collateralAmount -= collateralToSeize;
            info.borrowTimestamp = block.timestamp;
            totalBorrows += remainingPrincipal;
        } else {
            delete borrows[borrower];
        }

        IERC20(info.collateralToken).safeTransfer(msg.sender, collateralToSeize);

        uint256 excess = msg.value - repayAmount;
        if (excess > 0) {
            (bool success,) = payable(msg.sender).call{value: excess}("");
            require(success);
        }

        emit Liquidated(msg.sender, borrower, repayAmount, collateralToSeize, bonusCollateral);
    }

    function writeOffBadDebt(address borrower) external onlyOwner {
        BorrowInfo storage info = borrows[borrower];
        require(info.borrowAmount > 0, "no debt");
        uint256 collateralValue = info.collateralAmount.mul(oracle.getPrice(info.collateralToken));
        uint256 debtValue = info.borrowAmount;
        require(collateralValue < debtValue * 5 / 10, "not underwater enough");
        totalBorrows -= info.borrowAmount;
        IERC20(info.collateralToken).safeTransfer(owner(), info.collateralAmount);
        delete borrows[borrower];
        emit Liquidated(owner(), borrower, 0, info.collateralAmount, 0);
    }

    function calculateInterest(address borrower) public view returns (uint256) {
        BorrowInfo memory info = borrows[borrower];
        if (info.borrowAmount == 0) return 0;

        uint256 actualDuration = block.timestamp - info.borrowTimestamp;
        uint256 billableDuration = actualDuration > MIN_BILLABLE_SECONDS ? actualDuration : MIN_BILLABLE_SECONDS;

        IExponentialRateModel model = _getRateModel(info.collateralToken);
        uint256 utilization = totalDeposits > 0 ? totalBorrows.div(totalDeposits) : 0;
        uint256 perSecondRate = model.getPerSecondRate(utilization);

        return info.borrowAmount.mul(perSecondRate) * billableDuration;
    }

    function _getRateModel(address token) internal view returns (IExponentialRateModel) {
        if (bondingCurve != address(0) && IMaturityCheck(bondingCurve).isMature(token)) {
            return matureRateModel;
        }
        return earlyRateModel;
    }

    function getHealthFactor(address user) public view returns (uint256) {
        BorrowInfo memory info = borrows[user];
        if (info.borrowAmount == 0) return type(uint256).max;

        uint256 lt = tokenLiquidationThreshold[info.collateralToken] > 0
            ? tokenLiquidationThreshold[info.collateralToken]
            : 80e16;
        uint256 collateralValue = info.collateralAmount.mul(oracle.getPrice(info.collateralToken));
        uint256 interest = calculateInterest(user);
        uint256 totalDebt = info.borrowAmount + interest;
        if (totalDebt == 0) return type(uint256).max;
        return collateralValue.mul(lt) / totalDebt;
    }

    function getLTV(address user) external view returns (uint256) {
        BorrowInfo memory info = borrows[user];
        if (info.borrowAmount == 0) return 0;
        uint256 collateralValue = info.collateralAmount.mul(oracle.getPrice(info.collateralToken));
        return info.borrowAmount * 1e18 / collateralValue;
    }

    function pendingYield(address user) external view returns (uint256) {
        DepositInfo storage dep = deposits[user];
        uint256 pending = (dep.amount * accRewardPerShare / 1e18) - dep.rewardDebt;
        return dep.pendingRewards + pending;
    }

    function setLTV(address token, uint256 ltv) external onlyOwner {
        tokenLTV[token] = ltv;
    }

    function setLiquidationThreshold(address token, uint256 threshold) external onlyOwner {
        tokenLiquidationThreshold[token] = threshold;
    }

    function setBurnEngine(address _burnEngine) external onlyOwner {
        burnEngine = _burnEngine;
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

    function setOracle(address _oracle) external onlyOwner {
        oracle = ILongPriceOracle(_oracle);
    }

    function setReserveFactor(uint256 _factor) external onlyOwner {
        require(_factor <= 30e16, "too high");
        reserveFactor = _factor;
    }

    function setBurnEngineShare(uint256 _share) external onlyOwner {
        require(_share + reserveFactor <= 40e16, "too high");
        burnEngineShare = _share;
    }

    function setMatureMode(bool mature) external onlyOwner {
        if (mature) {
            burnRatio = matureBurnRatio;
            burnEngineShare = matureBurnEngineShare;
        } else {
            burnRatio = earlyBurnRatio;
            burnEngineShare = earlyBurnEngineShare;
        }
    }

    function setEarlyBurnRatio(uint256 _ratio) external onlyOwner {
        require(_ratio <= 5e16, "too high");
        earlyBurnRatio = _ratio;
    }

    function setMatureBurnRatio(uint256 _ratio) external onlyOwner {
        require(_ratio <= 10e16, "too high");
        matureBurnRatio = _ratio;
    }

    function setEarlyBurnEngineShare(uint256 _share) external onlyOwner {
        earlyBurnEngineShare = _share;
    }

    function setMatureBurnEngineShare(uint256 _share) external onlyOwner {
        matureBurnEngineShare = _share;
    }

    function receiveShortPoolInterest() external payable whenNotPaused {
        require(msg.sender == shortPool, "only short pool");
        if (msg.value > 0 && totalDeposits > 0) {
            accRewardPerShare += (msg.value * 1e18) / totalDeposits;
        }
    }

    address public shortPool;

    function setShortPool(address _shortPool) external onlyOwner {
        shortPool = _shortPool;
    }

    receive() external payable {}
}
