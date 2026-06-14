// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPerpOracle {
    function getPrice(address token) external view returns (uint256);
    function getPriceUpdatedAt(address token) external view returns (uint256);
}

interface IPerpToken {
    function dexPair() external view returns (address);
}

interface IDexPair {
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

struct Position {
    uint256 margin;
    uint256 size;
    uint256 entryPrice;
    uint256 lastFundingTime;
    bool isLong;
    bool isActive;
    // P1: TP/SL fields
    uint256 tpPrice;
    uint256 slPrice;
    bool hasTpsl;
    // P1: cumulative funding tracking for correct direction
    int256 fundingDebt;
}

struct LimitOrder {
    address user;
    address token;
    bool isLong;
    uint256 margin;
    uint256 leverage;
    uint256 triggerPrice;
    bool isTriggerAbove;
    bool isActive;
}

// P1: TP/SL Order structure
struct TpslOrder {
    address user;
    address token;
    uint256 triggerPrice;
    bool isTp;
    bool isActive;
}

contract PerpetualPool is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IPerpOracle public oracle;
    address public burnEngine;
    address public bondingCurve;
    address public dexLister;
    address public platformTreasury;

    uint256 public constant MAINTENANCE_MARGIN_RATIO = 15e16; // 15% (was 6%)
    uint256 public constant LIQUIDATION_FEE = 5e16;
    uint256 public constant MAX_LEVERAGE = 5e18; // 5x (was 10x)
    uint256 public constant FUNDING_INTERVAL = 8 hours;
    uint256 public constant MAX_FUNDING_RATE = 1e15;
    uint256 public constant PRICE_STALENESS_THRESHOLD = 5 minutes;
    uint256 public constant INSURANCE_FEE_SPLIT = 3000; // 30% of liquidation fee to insurance

    uint256 public baseFundingRate = 1e14;
    uint256 public protocolFeeBps = 10;
    uint256 public liquidatorIncentiveBps = 500;
    uint256 public tpslExecutorRewardBps = 100; // 1% reward for TP/SL execution

    // Dynamic funding rate parameters
    uint256 public constant FUNDING_DEVIATION_MULTIPLIER = 2e18; // 2x multiplier per 1% deviation
    uint256 public constant MAX_FUNDING_DEVIATION_RATE = 5e15; // 0.5% max additional rate per period

    // Circuit breaker parameters
    uint256 public constant CIRCUIT_BREAKER_THRESHOLD = 15e15; // 15% deviation triggers circuit breaker
    uint256 public constant CIRCUIT_BREAKER_RESUME = 3e15; // 3% deviation to resume
    mapping(address => bool) public circuitBreakerActive;
    mapping(address => uint256) public circuitBreakerTriggeredAt;

    mapping(address => mapping(address => Position)) public positions;
    mapping(address => uint256) public tokenLongOpenInterest;
    mapping(address => uint256) public tokenShortOpenInterest;
    mapping(address => uint256) public cumulativeFundingRate;
    mapping(address => uint256) public lastFundingTime;
    mapping(address => uint256) public tokenInsuranceFund;

    mapping(address => uint256) public tokenAvailable;

    uint256 public totalInsuranceFund;

    address[] public listedTokens;
    mapping(address => bool) public isTokenListedForPerp;
    address public defaultToken;

    // Limit orders
    LimitOrder[] public limitOrders;
    mapping(address => uint256[]) public userLimitOrders;

    // P1: TP/SL orders
    TpslOrder[] public tpslOrders;
    mapping(address => mapping(address => uint256[])) public userTpslOrders;

    event TokenListedForPerp(address indexed token);
    event TokenDelistedForPerp(address indexed token);

    event PositionOpened(
        address indexed token,
        address indexed user,
        bool isLong,
        uint256 margin,
        uint256 size,
        uint256 entryPrice,
        uint256 timestamp
    );
    event PositionClosed(
        address indexed token,
        address indexed user,
        bool isLong,
        uint256 margin,
        uint256 size,
        uint256 exitPrice,
        int256 pnl,
        uint256 timestamp
    );
    event PositionPartiallyClosed(
        address indexed token,
        address indexed user,
        bool isLong,
        uint256 closeSize,
        uint256 remainingSize,
        uint256 exitPrice,
        int256 closePnl,
        uint256 timestamp
    );
    event PositionLiquidated(
        address indexed token,
        address indexed liquidator,
        address indexed borrower,
        bool isLong,
        uint256 size,
        uint256 exitPrice,
        int256 pnl,
        uint256 timestamp
    );
    event FundingRateUpdated(address indexed token, int256 rate, uint256 timestamp);
    event DepositTokens(address indexed token, uint256 amount);
    event InsuranceFundAdded(address indexed token, uint256 amount);
    event InsuranceFundUsed(address indexed token, uint256 amount, string reason);
    event LimitOrderPlaced(
        uint256 indexed orderId,
        address indexed user,
        address indexed token,
        bool isLong,
        uint256 margin,
        uint256 leverage,
        uint256 triggerPrice,
        bool isTriggerAbove
    );
    event LimitOrderCancelled(uint256 indexed orderId, address indexed user);
    event LimitOrderExecuted(uint256 indexed orderId, address indexed user, uint256 entryPrice);
    // P1: TP/SL events
    event TpslSet(address indexed user, address indexed token, uint256 tpPrice, uint256 slPrice);
    event TpslTriggered(address indexed user, address indexed token, bool isTp, uint256 triggerPrice, uint256 closePrice, uint256 executorReward);
    event TpslCancelled(address indexed user, address indexed token);
    // P1: Margin events
    event MarginAdded(address indexed user, address indexed token, uint256 amount, uint256 newMargin);
    event MarginRemoved(address indexed user, address indexed token, uint256 amount, uint256 newMargin);

    constructor(address _oracle, address _burnEngine, address _platformTreasury) Ownable(msg.sender) {
        oracle = IPerpOracle(_oracle);
        burnEngine = _burnEngine;
        platformTreasury = _platformTreasury;
    }

    // ============ Price Validation ============

    function _validatePriceFreshness(address token) internal view {
        uint256 updatedAt = oracle.getPriceUpdatedAt(token);
        require(updatedAt > 0, "price never updated");
        require(block.timestamp - updatedAt <= PRICE_STALENESS_THRESHOLD, "price stale");
    }

    // ============ Market Order ============

    function openPosition(
        address token,
        bool isLong,
        uint256 marginUsdc,
        uint256 leverage
    ) external payable nonReentrant whenNotPaused {
        require(leverage >= 1e18 && leverage <= MAX_LEVERAGE, "invalid leverage");
        require(msg.value >= marginUsdc, "insufficient margin");
        require(marginUsdc > 0, "zero margin");
        require(isTokenListedForPerp[token], "token not listed for perp");

        Position storage pos = positions[msg.sender][token];
        require(!pos.isActive, "close existing position first");

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");
        _validatePriceFreshness(token);

        // Circuit breaker check
        _checkCircuitBreaker(token, markPrice);
        require(!circuitBreakerActive[token], "circuit breaker active");

        uint256 size = (marginUsdc * leverage) / 1e18;
        uint256 entryPrice = markPrice;

        _settleFunding(token);

        pos.margin = marginUsdc;
        pos.size = size;
        pos.entryPrice = entryPrice;
        pos.lastFundingTime = block.timestamp;
        pos.isLong = isLong;
        pos.isActive = true;
        pos.fundingDebt = 0;
        pos.tpPrice = 0;
        pos.slPrice = 0;
        pos.hasTpsl = false;

        if (isLong) {
            tokenLongOpenInterest[token] += size;
        } else {
            tokenShortOpenInterest[token] += size;
        }

        uint256 protocolFee = (marginUsdc * protocolFeeBps) / 10000;
        if (protocolFee > 0 && burnEngine != address(0)) {
            (bool sent, ) = payable(burnEngine).call{value: protocolFee}("");
            require(sent, "fee transfer failed");
        }

        emit PositionOpened(token, msg.sender, isLong, marginUsdc, size, entryPrice, block.timestamp);
    }

    function closePosition(address token) external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");

        _closePositionInternal(msg.sender, token, pos.size, false);
    }

    // P1: Partial close
    function closePositionPartial(address token, uint256 closeSize) external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");
        require(closeSize > 0 && closeSize <= pos.size, "invalid close size");

        _closePositionInternal(msg.sender, token, closeSize, false);
    }

    function _closePositionInternal(address user, address token, uint256 closeSize, bool /*isTpslClose*/) internal {
        Position storage pos = positions[user][token];
        require(pos.isActive, "no position");

        _settleFunding(token);

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");
        _validatePriceFreshness(token);

        // Calculate close ratio
        uint256 closeRatio = (closeSize * 1e18) / pos.size;

        // Calculate PnL for closed portion
        int256 totalPnl = _calculatePnl(pos, markPrice);
        int256 closePnl = (totalPnl * int256(closeRatio)) / 1e18;

        // Apply funding payment to position before closing
        _applyFundingPayment(pos, token);

        uint256 marginToReturn = (pos.margin * closeRatio) / 1e18;

        // Calculate return amount considering PnL
        uint256 returnAmount;
        if (closePnl >= 0) {
            returnAmount = marginToReturn + uint256(closePnl);
        } else {
            uint256 loss = uint256(-closePnl);
            returnAmount = loss >= marginToReturn ? 0 : marginToReturn - loss;
        }

        // Update OI
        if (pos.isLong) {
            tokenLongOpenInterest[token] -= closeSize;
        } else {
            tokenShortOpenInterest[token] -= closeSize;
        }

        // Update position
        if (closeSize == pos.size) {
            // Full close
            if (returnAmount > 0 && returnAmount <= address(this).balance) {
                (bool success, ) = payable(user).call{value: returnAmount}("");
                require(success, "transfer failed");
            }

            emit PositionClosed(token, user, pos.isLong, pos.margin, pos.size, markPrice, closePnl, block.timestamp);
            delete positions[user][token];
        } else {
            // Partial close
            pos.size -= closeSize;
            pos.margin -= marginToReturn;
            pos.lastFundingTime = block.timestamp;
            pos.fundingDebt = 0;

            if (returnAmount > 0 && returnAmount <= address(this).balance) {
                (bool success, ) = payable(user).call{value: returnAmount}("");
                require(success, "transfer failed");
            }

            emit PositionPartiallyClosed(token, user, pos.isLong, closeSize, pos.size, markPrice, closePnl, block.timestamp);
        }
    }

    // P1: Add margin
    function addMargin(address token) external payable nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");
        require(msg.value > 0, "zero margin");

        pos.margin += msg.value;

        emit MarginAdded(msg.sender, token, msg.value, pos.margin);
    }

    // P1: Remove margin
    function removeMargin(address token, uint256 amount) external nonReentrant whenNotPaused {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");
        require(amount > 0 && amount < pos.margin, "invalid amount");

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");

        uint256 newMargin = pos.margin - amount;
        uint256 newMarginRatio = _getMarginRatioWithParams(pos.size, newMargin, markPrice, pos.entryPrice, pos.isLong);

        // Must maintain healthy margin ratio with 2% safety buffer
        require(newMarginRatio >= MAINTENANCE_MARGIN_RATIO + 2e16, "margin ratio too low after removal");

        pos.margin = newMargin;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "transfer failed");

        emit MarginRemoved(msg.sender, token, amount, pos.margin);
    }

    // ============ TP/SL (P1) ============

    function setTpsl(address token, uint256 tpPrice, uint256 slPrice) external {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");

        if (pos.isLong) {
            require(tpPrice == 0 || tpPrice > pos.entryPrice, "TP must > entry");
            require(slPrice == 0 || slPrice < pos.entryPrice, "SL must < entry");
        } else {
            require(tpPrice == 0 || tpPrice < pos.entryPrice, "TP must < entry");
            require(slPrice == 0 || slPrice > pos.entryPrice, "SL must > entry");
        }

        pos.tpPrice = tpPrice;
        pos.slPrice = slPrice;
        pos.hasTpsl = (tpPrice > 0 || slPrice > 0);

        emit TpslSet(msg.sender, token, tpPrice, slPrice);
    }

    function cancelTpsl(address token) external {
        Position storage pos = positions[msg.sender][token];
        require(pos.isActive, "no position");

        pos.tpPrice = 0;
        pos.slPrice = 0;
        pos.hasTpsl = false;

        emit TpslCancelled(msg.sender, token);
    }

    function executeTpsl(address user, address token, bool isTp) external nonReentrant whenNotPaused {
        Position storage pos = positions[user][token];
        require(pos.isActive && pos.hasTpsl, "no tpsl");

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");
        _validatePriceFreshness(token);

        uint256 triggerPrice = isTp ? pos.tpPrice : pos.slPrice;
        require(triggerPrice > 0, "not set");

        // Validate trigger condition
        if (pos.isLong) {
            if (isTp) require(markPrice >= triggerPrice, "TP not reached");
            else require(markPrice <= triggerPrice, "SL not reached");
        } else {
            if (isTp) require(markPrice <= triggerPrice, "TP not reached");
            else require(markPrice >= triggerPrice, "SL not reached");
        }

        // Calculate executor reward
        uint256 executorReward = (pos.margin * tpslExecutorRewardBps) / 10000;
        if (executorReward > 0 && executorReward <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: executorReward}("");
            require(success, "executor reward failed");
        }

        // Close position
        _closePositionInternal(user, token, pos.size, true);

        emit TpslTriggered(user, token, isTp, triggerPrice, markPrice, executorReward);
    }

    // ============ Limit Order ============

    function placeLimitOrder(
        address token,
        bool isLong,
        uint256 marginUsdc,
        uint256 leverage,
        uint256 triggerPrice,
        bool isTriggerAbove
    ) external payable nonReentrant whenNotPaused {
        require(leverage >= 1e18 && leverage <= MAX_LEVERAGE, "invalid leverage");
        require(msg.value >= marginUsdc, "insufficient margin");
        require(marginUsdc > 0, "zero margin");
        require(triggerPrice > 0, "zero trigger price");
        require(isTokenListedForPerp[token], "token not listed for perp");

        Position storage pos = positions[msg.sender][token];
        require(!pos.isActive, "close existing position first");

        uint256 orderId = limitOrders.length;
        limitOrders.push(LimitOrder({
            user: msg.sender,
            token: token,
            isLong: isLong,
            margin: marginUsdc,
            leverage: leverage,
            triggerPrice: triggerPrice,
            isTriggerAbove: isTriggerAbove,
            isActive: true
        }));

        userLimitOrders[msg.sender].push(orderId);

        emit LimitOrderPlaced(orderId, msg.sender, token, isLong, marginUsdc, leverage, triggerPrice, isTriggerAbove);
    }

    function cancelLimitOrder(uint256 orderId) external nonReentrant {
        require(orderId < limitOrders.length, "invalid order");
        LimitOrder storage order = limitOrders[orderId];
        require(order.user == msg.sender, "not your order");
        require(order.isActive, "order not active");

        order.isActive = false;

        // Refund margin
        if (order.margin > 0 && order.margin <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: order.margin}("");
            require(success, "refund failed");
        }

        emit LimitOrderCancelled(orderId, msg.sender);
    }

    // P1: Limit order execution with reward
    function executeLimitOrder(uint256 orderId) external nonReentrant whenNotPaused {
        require(orderId < limitOrders.length, "invalid order");
        LimitOrder storage order = limitOrders[orderId];
        require(order.isActive, "order not active");

        uint256 markPrice = oracle.getPrice(order.token);
        require(markPrice > 0, "no price");
        _validatePriceFreshness(order.token);

        // Check trigger condition
        if (order.isTriggerAbove) {
            require(markPrice >= order.triggerPrice, "price not reached");
        } else {
            require(markPrice <= order.triggerPrice, "price not reached");
        }

        // Check user doesn't have active position
        Position storage pos = positions[order.user][order.token];
        require(!pos.isActive, "user has position");

        order.isActive = false;

        uint256 size = (order.margin * order.leverage) / 1e18;

        _settleFunding(order.token);

        pos.margin = order.margin;
        pos.size = size;
        pos.entryPrice = markPrice;
        pos.lastFundingTime = block.timestamp;
        pos.isLong = order.isLong;
        pos.isActive = true;
        pos.fundingDebt = 0;

        if (order.isLong) {
            tokenLongOpenInterest[order.token] += size;
        } else {
            tokenShortOpenInterest[order.token] += size;
        }

        uint256 protocolFee = (order.margin * protocolFeeBps) / 10000;
        if (protocolFee > 0 && burnEngine != address(0)) {
            (bool sent, ) = payable(burnEngine).call{value: protocolFee}("");
            require(sent, "fee transfer failed");
        }

        // P1: Executor reward for limit orders
        uint256 executorReward = (order.margin * tpslExecutorRewardBps) / 10000;
        if (executorReward > 0 && executorReward <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: executorReward}("");
            require(success, "executor reward failed");
        }

        emit LimitOrderExecuted(orderId, order.user, markPrice);
        emit PositionOpened(order.token, order.user, order.isLong, order.margin, size, markPrice, block.timestamp);
    }

    function getUserLimitOrders(address user) external view returns (
        uint256[] memory orderIds,
        address[] memory tokens,
        bool[] memory isLongs,
        uint256[] memory margins,
        uint256[] memory leverages,
        uint256[] memory triggerPrices,
        bool[] memory isTriggerAboves,
        bool[] memory actives
    ) {
        uint256[] storage ids = userLimitOrders[user];
        uint256 len = ids.length;
        orderIds = new uint256[](len);
        tokens = new address[](len);
        isLongs = new bool[](len);
        margins = new uint256[](len);
        leverages = new uint256[](len);
        triggerPrices = new uint256[](len);
        isTriggerAboves = new bool[](len);
        actives = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            uint256 oid = ids[i];
            LimitOrder storage o = limitOrders[oid];
            orderIds[i] = oid;
            tokens[i] = o.token;
            isLongs[i] = o.isLong;
            margins[i] = o.margin;
            leverages[i] = o.leverage;
            triggerPrices[i] = o.triggerPrice;
            isTriggerAboves[i] = o.isTriggerAbove;
            actives[i] = o.isActive;
        }
    }

    function getLimitOrderCount() external view returns (uint256) {
        return limitOrders.length;
    }

    // ============ Liquidation ============

    function liquidate(address borrower, address token) external nonReentrant whenNotPaused {
        Position storage pos = positions[borrower][token];
        require(pos.isActive, "no position");

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");
        _validatePriceFreshness(token);

        uint256 marginRatio = _getMarginRatio(pos, markPrice);
        require(marginRatio < MAINTENANCE_MARGIN_RATIO, "position healthy");

        _settleFunding(token);

        int256 pnl = _calculatePnl(pos, markPrice);

        // Calculate fees
        uint256 liquidationFee = (pos.margin * LIQUIDATION_FEE) / 1e18;
        uint256 liquidatorReward = (pos.margin * liquidatorIncentiveBps) / 10000;
        uint256 insuranceShare = (pos.margin * INSURANCE_FEE_SPLIT) / 10000;

        // Handle bankruptcy (position value < 0)
        uint256 totalFees = liquidationFee + liquidatorReward + insuranceShare;
        if (totalFees > pos.margin) {
            // Scale down proportionally if fees exceed margin
            uint256 scale = (pos.margin * 1e18) / totalFees;
            liquidationFee = (liquidationFee * scale) / 1e18;
            liquidatorReward = (liquidatorReward * scale) / 1e18;
            insuranceShare = pos.margin - liquidationFee - liquidatorReward;
        }

        // Update OI
        if (pos.isLong) {
            tokenLongOpenInterest[token] -= pos.size;
        } else {
            tokenShortOpenInterest[token] -= pos.size;
        }

        // Pay liquidator
        if (liquidatorReward > 0 && liquidatorReward <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: liquidatorReward}("");
            require(success, "liquidator reward failed");
        }

        // Pay liquidation fee to burn engine
        if (liquidationFee > 0 && burnEngine != address(0)) {
            (bool sent, ) = payable(burnEngine).call{value: liquidationFee}("");
            require(sent, "burn fee failed");
        }

        // Add to insurance fund
        if (insuranceShare > 0) {
            tokenInsuranceFund[token] += insuranceShare;
            totalInsuranceFund += insuranceShare;
            emit InsuranceFundAdded(token, insuranceShare);
        }

        // Handle bankruptcy: if pnl is very negative, use insurance fund
        if (pnl < 0) {
            uint256 loss = uint256(-pnl);
            if (loss > pos.margin && tokenInsuranceFund[token] > 0) {
                uint256 deficit = loss - pos.margin;
                uint256 insurancePayout = deficit > tokenInsuranceFund[token] ? tokenInsuranceFund[token] : deficit;
                tokenInsuranceFund[token] -= insurancePayout;
                totalInsuranceFund -= insurancePayout;
                emit InsuranceFundUsed(token, insurancePayout, "bankruptcy");
            }
        }

        emit PositionLiquidated(token, msg.sender, borrower, pos.isLong, pos.size, markPrice, pnl, block.timestamp);

        delete positions[borrower][token];
    }

    // ============ Admin ============

    function depositTokens(address token, uint256 amount) external {
        require(msg.sender == bondingCurve || msg.sender == dexLister || msg.sender == owner(), "not authorized");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenAvailable[token] += amount;
        emit DepositTokens(token, amount);
    }

    function depositUsdcToInsurance(address token) external payable {
        require(msg.value > 0);
        tokenInsuranceFund[token] += msg.value;
        totalInsuranceFund += msg.value;
        emit InsuranceFundAdded(token, msg.value);
    }

    // ============ Funding Rate (FIXED) ============

    function _settleFunding(address token) internal {
        if (lastFundingTime[token] == 0) {
            lastFundingTime[token] = block.timestamp;
            return;
        }

        uint256 timeElapsed = block.timestamp - lastFundingTime[token];
        if (timeElapsed < FUNDING_INTERVAL) return;

        uint256 longOI = tokenLongOpenInterest[token];
        uint256 shortOI = tokenShortOpenInterest[token];

        if (longOI == 0 && shortOI == 0) {
            lastFundingTime[token] = block.timestamp;
            return;
        }

        uint256 fundingPeriods = timeElapsed / FUNDING_INTERVAL;
        int256 rate;

        // Use dynamic funding rate based on price deviation
        uint256 dynamicRate = getDynamicFundingRate(token);

        if (longOI > shortOI) {
            uint256 ratio = (longOI * 1e18) / (shortOI > 0 ? shortOI : 1);
            rate = int256((dynamicRate * ratio * fundingPeriods) / 1e18);
            if (rate > int256(MAX_FUNDING_RATE * fundingPeriods)) {
                rate = int256(MAX_FUNDING_RATE * fundingPeriods);
            }
        } else if (shortOI > longOI) {
            uint256 ratio = (shortOI * 1e18) / (longOI > 0 ? longOI : 1);
            rate = -int256((dynamicRate * ratio * fundingPeriods) / 1e18);
            if (-rate > int256(MAX_FUNDING_RATE * fundingPeriods)) {
                rate = -int256(MAX_FUNDING_RATE * fundingPeriods);
            }
        }

        if (rate > 0) {
            cumulativeFundingRate[token] += uint256(rate);
        } else if (rate < 0) {
            // Prevent underflow if cumulative rate is smaller than the negative rate
            uint256 absRate = uint256(-rate);
            if (cumulativeFundingRate[token] >= absRate) {
                cumulativeFundingRate[token] -= absRate;
            } else {
                cumulativeFundingRate[token] = 0;
            }
        }

        lastFundingTime[token] = block.timestamp;
        emit FundingRateUpdated(token, rate, block.timestamp);
    }

    function _calculatePnl(Position memory pos, uint256 markPrice) internal pure returns (int256) {
        if (pos.isLong) {
            if (markPrice >= pos.entryPrice) {
                return int256((pos.size * (markPrice - pos.entryPrice)) / pos.entryPrice);
            } else {
                return -int256((pos.size * (pos.entryPrice - markPrice)) / pos.entryPrice);
            }
        } else {
            if (markPrice <= pos.entryPrice) {
                return int256((pos.size * (pos.entryPrice - markPrice)) / pos.entryPrice);
            } else {
                return -int256((pos.size * (markPrice - pos.entryPrice)) / pos.entryPrice);
            }
        }
    }

    // FIXED: Funding payment with correct direction
    function _calculateFundingPayment(Position memory pos, address token) internal view returns (int256) {
        if (pos.lastFundingTime >= block.timestamp) return 0;

        uint256 periodsSinceLast = (block.timestamp - pos.lastFundingTime) / FUNDING_INTERVAL;
        if (periodsSinceLast == 0) return 0;

        uint256 longOI = tokenLongOpenInterest[token];
        uint256 shortOI = tokenShortOpenInterest[token];

        if (longOI == 0 && shortOI == 0) return 0;

        // Calculate funding payment based on OI imbalance direction
        uint256 ratePerPeriod = baseFundingRate;
        uint256 totalRate = ratePerPeriod * periodsSinceLast;
        uint256 payment = (pos.size * totalRate) / 1e18;

        if (longOI > shortOI) {
            // Longs pay shorts
            return pos.isLong ? int256(payment) : -int256(payment);
        } else if (shortOI > longOI) {
            // Shorts pay longs
            return pos.isLong ? -int256(payment) : int256(payment);
        }

        return 0; // Balanced - no funding payment
    }

    // Apply funding payment to position margin
    function _applyFundingPayment(Position storage pos, address token) internal {
        int256 payment = _calculateFundingPayment(pos, token);

        if (payment > 0) {
            // User pays funding fee
            uint256 fee = uint256(payment);
            if (fee > pos.margin) fee = pos.margin;
            pos.margin -= fee;
            tokenInsuranceFund[token] += fee;
            totalInsuranceFund += fee;
        } else if (payment < 0) {
            // User receives funding rebate
            uint256 rebate = uint256(-payment);
            pos.margin += rebate;
            if (tokenInsuranceFund[token] >= rebate) {
                tokenInsuranceFund[token] -= rebate;
                totalInsuranceFund -= rebate;
            }
        }

        pos.lastFundingTime = block.timestamp;
    }

    function _getMarginRatio(Position memory pos, uint256 markPrice) internal pure returns (uint256) {
        int256 pnl = _calculatePnl(pos, markPrice);
        uint256 positionValue;

        if (pos.isLong) {
            positionValue = (pos.size * markPrice) / pos.entryPrice;
        } else {
            positionValue = (pos.size * pos.entryPrice) / markPrice;
        }

        uint256 marginAfterPnl;
        if (pnl >= 0) {
            marginAfterPnl = pos.margin + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            marginAfterPnl = loss >= pos.margin ? 0 : pos.margin - loss;
        }

        if (positionValue == 0) return type(uint256).max;
        return (marginAfterPnl * 1e18) / positionValue;
    }

    function _getMarginRatioWithParams(uint256 size, uint256 margin, uint256 markPrice, uint256 entryPrice, bool isLong) internal pure returns (uint256) {
        uint256 positionValue;
        if (isLong) {
            positionValue = (size * markPrice) / entryPrice;
        } else {
            positionValue = (size * entryPrice) / markPrice;
        }
        if (positionValue == 0) return type(uint256).max;
        return (margin * 1e18) / positionValue;
    }

    // ============ View Functions ============

    function getPosition(address user, address token) external view returns (
        uint256 margin,
        uint256 size,
        uint256 entryPrice,
        uint256 lastFundingTime_,
        bool isLong,
        bool isActive,
        uint256 tpPrice,
        uint256 slPrice,
        bool hasTpsl
    ) {
        Position memory pos = positions[user][token];
        return (pos.margin, pos.size, pos.entryPrice, pos.lastFundingTime, pos.isLong, pos.isActive, pos.tpPrice, pos.slPrice, pos.hasTpsl);
    }

    function getMarginRatio(address user, address token) external view returns (uint256) {
        Position memory pos = positions[user][token];
        if (!pos.isActive) return type(uint256).max;
        uint256 markPrice = oracle.getPrice(token);
        return _getMarginRatio(pos, markPrice);
    }

    function getPnl(address user, address token) external view returns (int256) {
        Position memory pos = positions[user][token];
        if (!pos.isActive) return 0;
        uint256 markPrice = oracle.getPrice(token);
        return _calculatePnl(pos, markPrice);
    }

    // P1: Get liquidation price
    function getLiquidationPrice(address user, address token) external view returns (uint256) {
        Position memory pos = positions[user][token];
        if (!pos.isActive) return 0;

        uint256 effectiveMargin = pos.margin;
        if (effectiveMargin == 0) return 0;

        if (pos.isLong) {
            // Long liquidation: marginRatio = (margin - loss) / positionValue < MAINTENANCE
            // loss = size * (entryPrice - liqPrice) / entryPrice
            // (margin - size*(entry-liq)/entry) / (size*liq/entry) = MAINTENANCE
            // Solving: liqPrice = entryPrice * margin / (size * (1 + MAINTENANCE))
            uint256 numerator = pos.entryPrice * effectiveMargin;
            uint256 denominator = pos.size * (1e18 + MAINTENANCE_MARGIN_RATIO) / 1e18;
            return denominator > 0 ? numerator / denominator : 0;
        } else {
            // Short liquidation
            uint256 numerator = pos.entryPrice * effectiveMargin;
            uint256 denominator = pos.size * (1e18 - MAINTENANCE_MARGIN_RATIO) / 1e18;
            return denominator > 0 ? numerator / denominator : type(uint256).max;
        }
    }

    // P1: Get margin health (0-100)
    function getMarginHealth(address user, address token) external view returns (uint256) {
        Position memory pos = positions[user][token];
        if (!pos.isActive) return 100;

        uint256 liqPrice = this.getLiquidationPrice(user, token);
        uint256 markPrice = oracle.getPrice(token);
        if (markPrice == 0) return 0;

        if (pos.isLong) {
            if (markPrice <= liqPrice) return 0;
            uint256 totalRange = pos.entryPrice > liqPrice ? pos.entryPrice - liqPrice : 1;
            uint256 currentRange = markPrice - liqPrice;
            return (currentRange * 100) / totalRange;
        } else {
            if (markPrice >= liqPrice) return 0;
            uint256 totalRange = liqPrice > pos.entryPrice ? liqPrice - pos.entryPrice : 1;
            uint256 currentRange = liqPrice - markPrice;
            return (currentRange * 100) / totalRange;
        }
    }

    function getOpenInterest(address token) external view returns (uint256 longOI, uint256 shortOI) {
        return (tokenLongOpenInterest[token], tokenShortOpenInterest[token]);
    }

    function getNextFundingTime(address token) external view returns (uint256) {
        if (lastFundingTime[token] == 0) return block.timestamp + FUNDING_INTERVAL;
        return lastFundingTime[token] + FUNDING_INTERVAL;
    }

    function getCurrentFundingRate(address token) external view returns (int256) {
        uint256 longOI = tokenLongOpenInterest[token];
        uint256 shortOI = tokenShortOpenInterest[token];

        if (longOI == 0 && shortOI == 0) return 0;

        if (longOI > shortOI) {
            uint256 ratio = (longOI * 1e18) / (shortOI > 0 ? shortOI : 1);
            int256 rate = int256((baseFundingRate * ratio) / 1e18);
            if (rate > int256(MAX_FUNDING_RATE)) {
                rate = int256(MAX_FUNDING_RATE);
            }
            return rate;
        } else if (shortOI > longOI) {
            uint256 ratio = (shortOI * 1e18) / (longOI > 0 ? longOI : 1);
            int256 rate = -int256((baseFundingRate * ratio) / 1e18);
            if (-rate > int256(MAX_FUNDING_RATE)) {
                rate = -int256(MAX_FUNDING_RATE);
            }
            return rate;
        }

        return 0;
    }

    function getMarkPrice(address token) external view returns (uint256) {
        return oracle.getPrice(token);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = IPerpOracle(_oracle);
    }

    function setBurnEngine(address _burnEngine) external onlyOwner {
        burnEngine = _burnEngine;
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }

    function setDexLister(address _dexLister) external onlyOwner {
        dexLister = _dexLister;
    }

    function setPlatformTreasury(address _treasury) external onlyOwner {
        platformTreasury = _treasury;
    }

    function setBaseFundingRate(uint256 _rate) external onlyOwner {
        require(_rate <= MAX_FUNDING_RATE, "too high");
        baseFundingRate = _rate;
    }

    function setProtocolFeeBps(uint256 _bps) external onlyOwner {
        require(_bps <= 100, "too high");
        protocolFeeBps = _bps;
    }

    function setLiquidatorIncentiveBps(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "too high");
        liquidatorIncentiveBps = _bps;
    }

    function setTpslExecutorRewardBps(uint256 _bps) external onlyOwner {
        require(_bps <= 500, "too high");
        tpslExecutorRewardBps = _bps;
    }

    function listTokenForPerp(address token) external onlyOwner {
        require(token != address(0), "zero address");
        require(!isTokenListedForPerp[token], "already listed");
        isTokenListedForPerp[token] = true;
        listedTokens.push(token);
        if (defaultToken == address(0)) {
            defaultToken = token;
        }
        emit TokenListedForPerp(token);
    }

    function delistTokenForPerp(address token) external onlyOwner {
        require(isTokenListedForPerp[token], "not listed");
        require(token != defaultToken, "cannot delist default");
        isTokenListedForPerp[token] = false;
        for (uint256 i = 0; i < listedTokens.length; i++) {
            if (listedTokens[i] == token) {
                listedTokens[i] = listedTokens[listedTokens.length - 1];
                listedTokens.pop();
                break;
            }
        }
        emit TokenDelistedForPerp(token);
    }

    function setDefaultToken(address token) external onlyOwner {
        require(isTokenListedForPerp[token], "not listed");
        defaultToken = token;
    }

    function getListedTokens() external view returns (address[] memory) {
        return listedTokens;
    }

    function getListedTokensCount() external view returns (uint256) {
        return listedTokens.length;
    }

    // ============ Dynamic Funding Rate & Circuit Breaker ============

    function _getDexSpotPrice(address token) internal view returns (uint256) {
        address pair = IPerpToken(token).dexPair();
        if (pair == address(0)) return 0;

        IDexPair dexPair = IDexPair(pair);
        (uint256 reserve0, uint256 reserve1,) = dexPair.getReserves();
        address token0 = dexPair.token0();
        address token1 = dexPair.token1();

        // Assume one of the tokens is the base asset (e.g., WUSDC)
        // Price = reserveBase / reserveToken
        if (token0 == token) {
            return (reserve1 * 1e18) / reserve0;
        } else if (token1 == token) {
            return (reserve0 * 1e18) / reserve1;
        }
        return 0;
    }

    function _getPriceDeviation(address token, uint256 markPrice) internal view returns (uint256) {
        uint256 spotPrice = _getDexSpotPrice(token);
        if (spotPrice == 0 || markPrice == 0) return 0;

        uint256 diff = markPrice > spotPrice ? markPrice - spotPrice : spotPrice - markPrice;
        return (diff * 1e18) / spotPrice;
    }

    function _checkCircuitBreaker(address token, uint256 markPrice) internal {
        uint256 deviation = _getPriceDeviation(token, markPrice);

        if (deviation >= CIRCUIT_BREAKER_THRESHOLD) {
            circuitBreakerActive[token] = true;
            circuitBreakerTriggeredAt[token] = block.timestamp;
            emit CircuitBreakerTriggered(token, deviation, markPrice);
        } else if (deviation <= CIRCUIT_BREAKER_RESUME && circuitBreakerActive[token]) {
            circuitBreakerActive[token] = false;
            emit CircuitBreakerResumed(token, deviation, markPrice);
        }
    }

    function getDynamicFundingRate(address token) public view returns (uint256) {
        uint256 markPrice = oracle.getPrice(token);
        uint256 deviation = _getPriceDeviation(token, markPrice);

        // Base rate + dynamic adjustment based on deviation
        uint256 dynamicRate = (deviation * FUNDING_DEVIATION_MULTIPLIER) / 1e18;
        if (dynamicRate > MAX_FUNDING_DEVIATION_RATE) {
            dynamicRate = MAX_FUNDING_DEVIATION_RATE;
        }

        return baseFundingRate + dynamicRate;
    }

    function getPriceDeviation(address token) external view returns (uint256 markPrice, uint256 spotPrice, uint256 deviation) {
        markPrice = oracle.getPrice(token);
        spotPrice = _getDexSpotPrice(token);
        deviation = _getPriceDeviation(token, markPrice);
    }

    function isCircuitBreakerActive(address token) external view returns (bool) {
        return circuitBreakerActive[token];
    }

    // ============ Spot Fee Injection to Insurance Fund ============

    function injectInsuranceFund(address token, uint256 amount) external payable {
        require(amount > 0, "zero amount");
        require(isTokenListedForPerp[token], "token not listed");
        require(msg.value >= amount, "insufficient value");

        tokenInsuranceFund[token] += amount;
        emit InsuranceFundInjected(token, amount, msg.sender);
    }

    event CircuitBreakerTriggered(address indexed token, uint256 deviation, uint256 markPrice);
    event CircuitBreakerResumed(address indexed token, uint256 deviation, uint256 markPrice);
    event InsuranceFundInjected(address indexed token, uint256 amount, address indexed injector);

    receive() external payable {}
}
