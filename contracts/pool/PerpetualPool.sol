// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPerpOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IPerpToken {
    function dexPair() external view returns (address);
}

struct Position {
    uint256 margin;
    uint256 size;
    uint256 entryPrice;
    uint256 lastFundingTime;
    bool isLong;
    bool isActive;
}

struct LimitOrder {
    address user;
    address token;
    bool isLong;
    uint256 margin;
    uint256 leverage;
    uint256 triggerPrice;
    bool isTriggerAbove; // true: execute when markPrice >= triggerPrice; false: execute when markPrice <= triggerPrice
    bool isActive;
}

contract PerpetualPool is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    IPerpOracle public oracle;
    address public burnEngine;
    address public bondingCurve;
    address public dexLister;
    address public platformTreasury;

    uint256 public constant MAINTENANCE_MARGIN_RATIO = 6e16;
    uint256 public constant LIQUIDATION_FEE = 5e16;
    uint256 public constant MAX_LEVERAGE = 10e18;
    uint256 public constant FUNDING_INTERVAL = 8 hours;
    uint256 public constant MAX_FUNDING_RATE = 1e15;

    uint256 public baseFundingRate = 1e14;
    uint256 public protocolFeeBps = 10;
    uint256 public liquidatorIncentiveBps = 500;

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
    event PositionLiquidated(
        address indexed token,
        address indexed liquidator,
        address indexed borrower,
        bool isLong,
        uint256 size,
        uint256 exitPrice,
        uint256 timestamp
    );
    event FundingRateUpdated(address indexed token, uint256 rate, uint256 timestamp);
    event DepositTokens(address indexed token, uint256 amount);
    event InsuranceFundAdded(address indexed token, uint256 amount);
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

    constructor(address _oracle, address _burnEngine, address _platformTreasury) Ownable(msg.sender) {
        oracle = IPerpOracle(_oracle);
        burnEngine = _burnEngine;
        platformTreasury = _platformTreasury;
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

        uint256 size = (marginUsdc * leverage) / 1e18;
        uint256 entryPrice = markPrice;

        _settleFunding(token);

        pos.margin = marginUsdc;
        pos.size = size;
        pos.entryPrice = entryPrice;
        pos.lastFundingTime = block.timestamp;
        pos.isLong = isLong;
        pos.isActive = true;

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

        _settleFunding(token);

        uint256 markPrice = oracle.getPrice(token);
        require(markPrice > 0, "no price");

        int256 pnl = _calculatePnl(pos, markPrice);
        uint256 fundingPayment = _calculateFundingPayment(pos, token);

        uint256 returnAmount;
        if (pnl >= 0) {
            uint256 profit = uint256(pnl);
            if (fundingPayment > profit) {
                returnAmount = pos.margin - (fundingPayment - profit);
            } else {
                returnAmount = pos.margin + profit - fundingPayment;
            }
        } else {
            uint256 loss = uint256(-pnl);
            returnAmount = pos.margin + loss > fundingPayment
                ? pos.margin - loss - fundingPayment
                : 0;
        }

        if (pos.isLong) {
            tokenLongOpenInterest[token] -= pos.size;
        } else {
            tokenShortOpenInterest[token] -= pos.size;
        }

        if (returnAmount > 0 && returnAmount <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: returnAmount}("");
            require(success, "transfer failed");
        }

        emit PositionClosed(token, msg.sender, pos.isLong, pos.margin, pos.size, markPrice, pnl, block.timestamp);

        delete positions[msg.sender][token];
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

    function executeLimitOrder(uint256 orderId) external nonReentrant whenNotPaused {
        require(orderId < limitOrders.length, "invalid order");
        LimitOrder storage order = limitOrders[orderId];
        require(order.isActive, "order not active");

        uint256 markPrice = oracle.getPrice(order.token);
        require(markPrice > 0, "no price");

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

        uint256 marginRatio = _getMarginRatio(pos, markPrice);
        require(marginRatio < MAINTENANCE_MARGIN_RATIO, "position healthy");

        _settleFunding(token);

        int256 pnl = _calculatePnl(pos, markPrice);

        uint256 liquidationFee = (pos.margin * LIQUIDATION_FEE) / 1e18;
        uint256 liquidatorReward = (pos.margin * liquidatorIncentiveBps) / 10000;

        if (pos.isLong) {
            tokenLongOpenInterest[token] -= pos.size;
        } else {
            tokenShortOpenInterest[token] -= pos.size;
        }

        if (liquidatorReward > 0 && liquidatorReward <= address(this).balance) {
            (bool success, ) = payable(msg.sender).call{value: liquidatorReward}("");
            require(success, "liquidator reward failed");
        }

        uint256 insuranceDeposit = pos.margin - liquidationFee - liquidatorReward;
        if (insuranceDeposit > address(this).balance) {
            insuranceDeposit = address(this).balance;
        }

        if (liquidationFee > 0 && burnEngine != address(0)) {
            (bool sent, ) = payable(burnEngine).call{value: liquidationFee}("");
            require(sent, "burn fee failed");
        }

        emit PositionLiquidated(token, msg.sender, borrower, pos.isLong, pos.size, markPrice, block.timestamp);

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

        if (longOI > shortOI) {
            uint256 ratio = (longOI * 1e18) / (shortOI > 0 ? shortOI : 1);
            rate = int256((baseFundingRate * ratio * fundingPeriods) / 1e18);
            if (rate > int256(MAX_FUNDING_RATE * fundingPeriods)) {
                rate = int256(MAX_FUNDING_RATE * fundingPeriods);
            }
        } else if (shortOI > longOI) {
            uint256 ratio = (shortOI * 1e18) / (longOI > 0 ? longOI : 1);
            rate = -int256((baseFundingRate * ratio * fundingPeriods) / 1e18);
            if (-rate > int256(MAX_FUNDING_RATE * fundingPeriods)) {
                rate = -int256(MAX_FUNDING_RATE * fundingPeriods);
            }
        }

        if (rate > 0) {
            cumulativeFundingRate[token] += uint256(rate);
        } else if (rate < 0) {
            cumulativeFundingRate[token] -= uint256(-rate);
        }

        lastFundingTime[token] = block.timestamp;
        emit FundingRateUpdated(token, rate >= 0 ? uint256(rate) : uint256(-rate), block.timestamp);
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

    function _calculateFundingPayment(Position memory pos, address token) internal view returns (uint256) {
        uint256 currentCumulative = cumulativeFundingRate[token];
        uint256 periodsSinceLast = (block.timestamp - pos.lastFundingTime) / FUNDING_INTERVAL;

        if (periodsSinceLast == 0) return 0;

        uint256 ratePerPeriod = baseFundingRate;
        uint256 totalRate = ratePerPeriod * periodsSinceLast;

        if (pos.isLong) {
            return (pos.size * totalRate) / 1e18;
        } else {
            return (pos.size * totalRate) / 1e18;
        }
    }

    function _getMarginRatio(Position memory pos, uint256 markPrice) internal view returns (uint256) {
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

    // ============ View Functions ============

    function getPosition(address user, address token) external view returns (
        uint256 margin,
        uint256 size,
        uint256 entryPrice,
        uint256 lastFundingTime_,
        bool isLong,
        bool isActive
    ) {
        Position memory pos = positions[user][token];
        return (pos.margin, pos.size, pos.entryPrice, pos.lastFundingTime, pos.isLong, pos.isActive);
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

    function getOpenInterest(address token) external view returns (uint256 longOI, uint256 shortOI) {
        return (tokenLongOpenInterest[token], tokenShortOpenInterest[token]);
    }

    function getNextFundingTime(address token) external view returns (uint256) {
        if (lastFundingTime[token] == 0) return block.timestamp + FUNDING_INTERVAL;
        return lastFundingTime[token] + FUNDING_INTERVAL;
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

    receive() external payable {}
}
