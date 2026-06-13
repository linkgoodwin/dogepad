// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IChainlinkAggregator {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

interface ISimplePair {
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast);
    function token0() external view returns (address);
}

interface ISimpleFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

contract PriceOracle is Ownable {
    mapping(address => address) public chainlinkFeeds;
    mapping(address => uint256) public twapPrices;
    mapping(address => uint256) public lastUpdateTime;
    uint256 public constant TWAP_PERIOD = 14400;
    uint256 public constant DEVIATION_THRESHOLD = 5e15; // 0.5% deviation threshold
    uint256 public constant PRICE_DELAY = 600;
    uint256 public constant MAX_PRICE_AGE = 1 hours;
    mapping(address => uint256) public effectivePriceTime;
    mapping(address => uint256) public effectivePrice;
    mapping(address => bool) public authorizedUpdaters;

    // DEX price source
    address public dexFactory;
    address public baseAsset;
    mapping(address => address) public tokenDexPairs; // token => pair address (override)

    event PriceUpdatedFromDex(address indexed token, uint256 price, uint256 reserveBase, uint256 reserveToken);

    constructor() Ownable(msg.sender) {}

    function setDexConfig(address _dexFactory, address _baseAsset) external onlyOwner {
        dexFactory = _dexFactory;
        baseAsset = _baseAsset;
    }

    function setTokenDexPair(address token, address pair) external onlyOwner {
        tokenDexPairs[token] = pair;
    }

    function getPriceUpdatedAt(address token) external view returns (uint256) {
        return effectivePriceTime[token] > 0 ? effectivePriceTime[token] - PRICE_DELAY : lastUpdateTime[token];
    }

    function getPrice(address token) external view returns (uint256) {
        if (effectivePrice[token] != 0 && block.timestamp >= effectivePriceTime[token]) {
            return effectivePrice[token];
        }
        if (twapPrices[token] > 0 && lastUpdateTime[token] > 0 && block.timestamp - lastUpdateTime[token] <= MAX_PRICE_AGE) {
            return twapPrices[token];
        }
        // Fallback: calculate price from DEX reserves
        uint256 dexPrice = _getPriceFromDex(token);
        require(dexPrice > 0, "stale price");
        return dexPrice;
    }

    function updateTwapPrice(address token, uint256 newPrice) external {
        require(authorizedUpdaters[msg.sender], "not authorized");
        twapPrices[token] = newPrice;
        lastUpdateTime[token] = block.timestamp;
    }

    function updatePriceFromDex(address token) external returns (uint256) {
        uint256 dexPrice = _getPriceFromDex(token);
        require(dexPrice > 0, "no dex price");
        twapPrices[token] = dexPrice;
        lastUpdateTime[token] = block.timestamp;
        emit PriceUpdatedFromDex(token, dexPrice, 0, 0);
        return dexPrice;
    }

    function updateEffectivePrice(address token) external {
        require(authorizedUpdaters[msg.sender], "not authorized");
        uint256 currentPrice = twapPrices[token];
        address feed = chainlinkFeeds[token];
        if (feed != address(0)) {
            uint256 chainlinkPrice = _getChainlinkPrice(token);
            if (chainlinkPrice != 0) {
                if (_checkDeviation(currentPrice, chainlinkPrice)) {
                    currentPrice = chainlinkPrice;
                }
            }
        }
        effectivePrice[token] = currentPrice;
        effectivePriceTime[token] = block.timestamp + PRICE_DELAY;
    }

    function setChainlinkFeed(address token, address feed) external onlyOwner {
        chainlinkFeeds[token] = feed;
    }

    function setAuthorizedUpdater(address updater, bool authorized) external onlyOwner {
        authorizedUpdaters[updater] = authorized;
    }

    function _getPriceFromDex(address token) internal view returns (uint256) {
        address pair = tokenDexPairs[token];
        if (pair == address(0) && dexFactory != address(0) && baseAsset != address(0)) {
            pair = ISimpleFactory(dexFactory).getPair(token, baseAsset);
        }
        if (pair == address(0)) return 0;

        (uint256 reserve0, uint256 reserve1,) = ISimplePair(pair).getReserves();
        if (reserve0 == 0 || reserve1 == 0) return 0;

        address token0 = ISimplePair(pair).token0();
        // price = baseAsset per token (in 18 decimals)
        // If token0 == baseAsset: price = reserve0 / reserve1 * 1e18
        // If token0 == token: price = reserve1 / reserve0 * 1e18
        if (token0 == baseAsset) {
            return (reserve0 * 1e18) / reserve1;
        } else {
            return (reserve1 * 1e18) / reserve0;
        }
    }

    function _getChainlinkPrice(address token) internal view returns (uint256) {
        address feed = chainlinkFeeds[token];
        if (feed == address(0)) return 0;
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = IChainlinkAggregator(feed).latestRoundData();
        if (answer <= 0) return 0;
        if (answeredInRound < roundId) return 0;
        if (block.timestamp - updatedAt > MAX_PRICE_AGE) return 0;
        uint8 decimals = IChainlinkAggregator(feed).decimals();
        return uint256(answer) * (10 ** (18 - decimals));
    }

    function _checkDeviation(uint256 price1, uint256 price2) internal pure returns (bool) {
        if (price1 == 0 || price2 == 0) return true;
        uint256 diff = price1 > price2 ? price1 - price2 : price2 - price1;
        uint256 avgPrice = (price1 + price2) / 2;
        return (diff * 1e18) / avgPrice < DEVIATION_THRESHOLD;
    }
}
