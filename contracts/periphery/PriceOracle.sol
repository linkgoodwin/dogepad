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

contract PriceOracle is Ownable {
    mapping(address => address) public chainlinkFeeds;
    mapping(address => uint256) public twapPrices;
    mapping(address => uint256) public lastUpdateTime;
    uint256 public constant TWAP_PERIOD = 14400;
    uint256 public constant DEVIATION_THRESHOLD = 10e16;
    uint256 public constant PRICE_DELAY = 600;
    uint256 public constant MAX_PRICE_AGE = 1 hours;
    mapping(address => uint256) public effectivePriceTime;
    mapping(address => uint256) public effectivePrice;
    mapping(address => bool) public authorizedUpdaters;

    constructor() Ownable(msg.sender) {}

    function getPrice(address token) external view returns (uint256) {
        if (effectivePrice[token] != 0 && block.timestamp >= effectivePriceTime[token]) {
            return effectivePrice[token];
        }
        require(twapPrices[token] > 0, "price not set");
        require(lastUpdateTime[token] > 0 && block.timestamp - lastUpdateTime[token] <= MAX_PRICE_AGE, "stale price");
        return twapPrices[token];
    }

    function updateTwapPrice(address token, uint256 newPrice) external {
        require(authorizedUpdaters[msg.sender], "not authorized");
        twapPrices[token] = newPrice;
        lastUpdateTime[token] = block.timestamp;
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
