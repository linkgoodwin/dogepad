// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/BondingCurveToken.sol";
import "../interfaces/IBondingCurve.sol";
import "../periphery/DexLister.sol";

interface IPriceOracleSetter {
    function updateTwapPrice(address token, uint256 newPrice) external;
}

error TokenNotFound();
error AlreadyListed();
error ZeroUsdc();
error ZeroTokens();
error SlippageTooHigh();
error InsufficientCurveTokens();
error InsufficientReserve();
error OnlyFactoryOrDao();
error OnlyDao();
error DaoOnlyLaunch();
error InsufficientFee();
error FeeTransferFailed();
error VoterAllocationTooHigh();
error NoIncentive();
error NotReadyForListing();
error AlreadyDexListed();
error ZeroAmount();
error TransferFailed();
error ExceedsSoldTokens();

contract BondingCurve is IBondingCurve, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    struct TokenInfo {
        address tokenAddress;
        address creator;
        uint256 totalSupply;
        uint256 reserveUsdc;
        uint256 tokensSold;
        bool isListedOnDex;
        uint256 dexListingThreshold;
        string metadataURI;
    }

    struct CreatorIncentive {
        bool wantTaxShare;
        bool wantLpShare;
        bool wantTokenAllocation;
        uint8 incentiveCount;
    }

    uint256 public constant BASE_PRICE = 100 gwei;
    uint256 public constant SLOPE = 10000;
    uint256 public constant FEE_BPS = 100;
    uint256 public constant PRICE_PRECISION = 1e18;

    uint256 public constant BASE_TAX_SHARE_BPS = 5000;
    uint256 public constant BASE_LP_SHARE_BPS = 1000;
    uint256 public constant BASE_TOKEN_ALLOCATION_BPS = 500;
    uint256 public constant CREATOR_TOKEN_CLIFF = 90 days;
    uint256 public constant CREATOR_TOKEN_VESTING = 360 days;
    uint256 public constant CREATOR_LP_VESTING = 180 days;

    uint256 public constant SHARE_MULTIPLIER_1 = 10000;
    uint256 public constant SHARE_MULTIPLIER_2 = 4500;
    uint256 public constant SHARE_MULTIPLIER_3 = 2800;

    mapping(address => TokenInfo) public tokens;
    mapping(address => CreatorIncentive) public creatorIncentives;
    address public factory;
    address public launchDao;
    address public dexRouter;
    bool public isXyloRouter;
    address public baseAsset;
    address public longPool;
    address public shortPool;
    address public feeDistributor;
    address public buyAndBurnEngine;
    address public priceOracle;
    address public creatorRewardManager;
    address payable public dexLister;
    uint256 public creationFee = 0.1 ether;
    uint256 public defaultDexThreshold = 20 ether;
    bool public daoOnlyLaunch = false;

    uint256 public maturityThreshold = 100 ether;
    mapping(address => bool) public isMatureOverride;

    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, uint256 totalSupply);
    event DexListingReady(address indexed token);

    modifier onlyFactoryOrDao() {
        if (msg.sender != factory && msg.sender != launchDao) revert OnlyFactoryOrDao();
        _;
    }

    modifier onlyDao() {
        if (msg.sender != launchDao) revert OnlyDao();
        _;
    }

    constructor(
        address _dexRouter,
        address _feeDistributor,
        bool _isXyloRouter,
        address _baseAsset
    ) Ownable(msg.sender) {
        dexRouter = _dexRouter;
        feeDistributor = _feeDistributor;
        isXyloRouter = _isXyloRouter;
        baseAsset = _baseAsset;
    }

    function setFactory(address _factory) external onlyOwner {
        factory = _factory;
    }

    function setLaunchDao(address _launchDao) external onlyOwner {
        launchDao = _launchDao;
    }

    function setBuyAndBurnEngine(address _engine) external onlyOwner {
        buyAndBurnEngine = _engine;
    }

    function setPriceOracle(address _oracle) external onlyOwner {
        priceOracle = _oracle;
    }

    function setDaoOnlyLaunch(bool _daoOnly) external onlyOwner {
        daoOnlyLaunch = _daoOnly;
    }

    function setCreatorRewardManager(address _manager) external onlyOwner {
        creatorRewardManager = _manager;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external payable onlyFactoryOrDao nonReentrant returns (address) {
        if (daoOnlyLaunch) {
            if (msg.sender != launchDao) revert DaoOnlyLaunch();
        }
        uint8 count = _validateIncentive(wantTaxShare, wantLpShare, wantTokenAllocation);
        address tokenAddr = _createToken(name, symbol, totalSupply, metadataURI, address(0), 0);
        _setCreatorIncentive(tokenAddr, wantTaxShare, wantLpShare, wantTokenAllocation, count);
        return tokenAddr;
    }

    function createTokenForDao(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address voterPool,
        uint256 voterAllocationBps,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external payable onlyDao nonReentrant returns (address) {
        if (voterAllocationBps > 3000) revert VoterAllocationTooHigh();
        uint8 count = _validateIncentive(wantTaxShare, wantLpShare, wantTokenAllocation);
        address tokenAddr = _createToken(name, symbol, totalSupply, metadataURI, voterPool, voterAllocationBps);
        _setCreatorIncentive(tokenAddr, wantTaxShare, wantLpShare, wantTokenAllocation, count);
        return tokenAddr;
    }

    function _validateIncentive(
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) internal pure returns (uint8) {
        uint8 count = 0;
        if (wantTaxShare) count++;
        if (wantLpShare) count++;
        if (wantTokenAllocation) count++;
        if (count == 0) revert NoIncentive();
        return count;
    }

    function _setCreatorIncentive(
        address token,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation,
        uint8 count
    ) internal {
        creatorIncentives[token] = CreatorIncentive({
            wantTaxShare: wantTaxShare,
            wantLpShare: wantLpShare,
            wantTokenAllocation: wantTokenAllocation,
            incentiveCount: count
        });
        emit CreatorIncentiveSet(token, tokens[token].creator, wantTaxShare, wantLpShare, wantTokenAllocation);
    }

    function _createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address voterPool,
        uint256 voterAllocationBps
    ) internal returns (address) {
        if (msg.sender != launchDao) {
            if (msg.value < creationFee) revert InsufficientFee();
            if (msg.value > 0) {
                (bool sent, ) = feeDistributor.call{value: msg.value}("");
                if (!sent) revert FeeTransferFailed();
            }
        }

        BondingCurveToken token = new BondingCurveToken(
            name,
            symbol,
            totalSupply,
            feeDistributor,
            address(this)
        );

        token.setBondingCurve(address(this));

        if (buyAndBurnEngine != address(0)) {
            token.setBuyAndBurnEngine(buyAndBurnEngine);
        }

        if (voterPool != address(0)) {
            token.excludeFromTax(voterPool);
            token.excludeFromHoldingLimit(voterPool);
            if (voterAllocationBps > 0) {
                uint256 voterAmount = (totalSupply * voterAllocationBps) / 10000;
                token.buyFromCurve(voterPool, voterAmount);
            }
        }

        token.transferOwnership(msg.sender);

        tokens[address(token)] = TokenInfo({
            tokenAddress: address(token),
            creator: msg.sender,
            totalSupply: totalSupply,
            reserveUsdc: 0,
            tokensSold: 0,
            isListedOnDex: false,
            dexListingThreshold: defaultDexThreshold,
            metadataURI: metadataURI
        });

        emit TokenCreated(address(token), msg.sender, name, symbol, totalSupply);

        if (priceOracle != address(0)) {
            IPriceOracleSetter(priceOracle).updateTwapPrice(address(token), BASE_PRICE);
        }

        return address(token);
    }

    function buy(address token, uint256 minTokensOut, address recipient) external payable override nonReentrant whenNotPaused {
        if (recipient == address(0)) recipient = msg.sender;
        if (recipient != msg.sender && msg.sender != launchDao) revert OnlyDao();
        TokenInfo storage info = tokens[token];
        if (info.tokenAddress == address(0)) revert TokenNotFound();
        if (info.isListedOnDex && info.reserveUsdc == 0) revert AlreadyListed();
        if (msg.value == 0) revert ZeroUsdc();

        uint256 fee = 0;
        if (msg.sender != launchDao) {
            fee = (msg.value * FEE_BPS) / 10000;
        }
        uint256 usdcAfterFee = msg.value - fee;

        uint256 tokensToBuy = _calculateBuyAmount(token, usdcAfterFee);
        if (tokensToBuy == 0) revert ZeroTokens();
        if (tokensToBuy < minTokensOut) revert SlippageTooHigh();
        if (BondingCurveToken(token).balanceOf(token) < tokensToBuy) revert InsufficientCurveTokens();

        info.reserveUsdc += usdcAfterFee;
        info.tokensSold += tokensToBuy;

        BondingCurveToken(token).buyFromCurve(recipient, tokensToBuy);

        if (fee > 0) {
            (bool sent, ) = feeDistributor.call{value: fee}("");
            if (!sent) revert FeeTransferFailed();
        }

        emit TokenBought(token, recipient, msg.value, tokensToBuy);

        _checkAndListOnDex(token);
    }

    function sell(address token, uint256 tokenAmount, uint256 minUsdcOut) external override nonReentrant whenNotPaused {
        TokenInfo storage info = tokens[token];
        if (info.tokenAddress == address(0)) revert TokenNotFound();
        if (info.isListedOnDex && info.reserveUsdc == 0) revert AlreadyListed();
        if (tokenAmount == 0) revert ZeroAmount();

        uint256 usdcToReturn = _calculateSellAmount(token, tokenAmount);
        if (usdcToReturn == 0) revert ZeroUsdc();
        if (usdcToReturn > info.reserveUsdc) revert InsufficientReserve();
        if (usdcToReturn < minUsdcOut) revert SlippageTooHigh();

        uint256 fee = (usdcToReturn * FEE_BPS) / 10000;
        uint256 usdcAfterFee = usdcToReturn - fee;

        info.reserveUsdc -= usdcToReturn;
        info.tokensSold -= tokenAmount;

        BondingCurveToken(token).sellToCurve(msg.sender, tokenAmount);

        (bool sent, ) = msg.sender.call{value: usdcAfterFee}("");
        if (!sent) revert TransferFailed();

        if (fee > 0) {
            (bool feeSent, ) = feeDistributor.call{value: fee}("");
            if (!feeSent) revert FeeTransferFailed();
        }

        emit TokenSold(token, msg.sender, tokenAmount, usdcAfterFee);
    }

    function _calculateBuyAmount(address token, uint256 usdcAmount) internal view returns (uint256) {
        TokenInfo storage info = tokens[token];
        uint256 s0 = info.tokensSold;

        uint256 priceS0 = _getPrice(s0);

        if (SLOPE == 0) {
            if (priceS0 == 0) return 0;
            return (usdcAmount * PRICE_PRECISION) / priceS0;
        }

        uint256 discriminant = priceS0 * priceS0 + 2 * SLOPE * usdcAmount;
        if (discriminant < priceS0 * priceS0) return 0;

        uint256 sqrtD = _sqrt(discriminant);
        uint256 ds = (sqrtD - priceS0) * PRICE_PRECISION / SLOPE;

        if (ds == 0) return 0;
        return ds;
    }

    function _calculateSellAmount(address token, uint256 tokenAmount) internal view returns (uint256) {
        TokenInfo storage info = tokens[token];
        if (info.tokensSold < tokenAmount) revert ExceedsSoldTokens();

        uint256 s1 = info.tokensSold;
        uint256 s0 = s1 - tokenAmount;

        uint256 priceS1 = _getPrice(s1);
        uint256 priceS0 = _getPrice(s0);

        uint256 usdcOut = (tokenAmount * (priceS0 + priceS1)) / (2 * PRICE_PRECISION);
        return usdcOut;
    }

    function _getPrice(uint256 supply) internal pure returns (uint256) {
        uint256 curveComponent = (SLOPE * supply) / PRICE_PRECISION;
        return BASE_PRICE + curveComponent;
    }

    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = x;
        uint256 y = (x + 1) / 2;
        while (y < z) {
            z = y;
            y = (x / y + y) / 2;
        }
        return z;
    }

    function _checkAndListOnDex(address token) internal {
        TokenInfo storage info = tokens[token];
        if (info.reserveUsdc < info.dexListingThreshold) return;
        if (info.isListedOnDex) return;

        info.isListedOnDex = true;
        emit DexListingReady(token);
    }

    function listOnDex(address token) external nonReentrant whenNotPaused {
        TokenInfo storage info = tokens[token];
        if (!info.isListedOnDex) revert NotReadyForListing();
        if (info.reserveUsdc == 0) revert AlreadyDexListed();

        uint256 totalUsdc = info.reserveUsdc;
        uint256 totalTokens = BondingCurveToken(token).balanceOf(token);

        BondingCurveToken(token).buyFromCurve(address(this), totalTokens);

        CreatorIncentive storage ci = creatorIncentives[token];
        uint8 count = ci.incentiveCount;

        uint256 multiplier = 0;
        if (count > 0) {
            if (count == 1) multiplier = SHARE_MULTIPLIER_1;
            else if (count == 2) multiplier = SHARE_MULTIPLIER_2;
            else multiplier = SHARE_MULTIPLIER_3;
        }

        uint256 creatorTokenBps = (count > 0 && ci.wantTokenAllocation) ? (BASE_TOKEN_ALLOCATION_BPS * multiplier) / 10000 : 0;
        uint256 creatorLpBps = (count > 0 && ci.wantLpShare) ? (BASE_LP_SHARE_BPS * multiplier) / 10000 : 0;
        uint256 creatorTokens = (totalTokens * creatorTokenBps) / 10000;

        uint256 lpTokens = (totalTokens * DexLister(dexLister).lpTokenRatio()) / 100;
        uint256 shortPoolTokens = (totalTokens * DexLister(dexLister).shortPoolTokenRatio()) / 100;

        info.reserveUsdc = 0;

        IERC20(token).forceApprove(dexLister, totalTokens);

        DexLister(dexLister).addLiquidityAndDistribute{value: totalUsdc}(DexListingParams({
            token: token,
            totalUsdc: totalUsdc,
            lpTokens: lpTokens,
            longPoolUsdc: DexLister(dexLister).longPoolUsdcAmt(totalUsdc),
            shortPoolTokens: shortPoolTokens,
            burnEngineUsdc: DexLister(dexLister).burnEngineUsdcAmt(totalUsdc),
            platformUsdc: DexLister(dexLister).platformUsdcAmt(totalUsdc),
            creatorTokens: creatorTokens,
            creatorLpBps: creatorLpBps,
            multiplier: multiplier,
            creator: info.creator,
            incentiveCount: count,
            wantTaxShare: ci.wantTaxShare,
            wantLpShare: ci.wantLpShare
        }));
    }

    function getBuyPrice(address token, uint256 usdcAmount) external view override returns (uint256) {
        return _calculateBuyAmount(token, usdcAmount);
    }

    function getSellPrice(address token, uint256 tokenAmount) external view override returns (uint256) {
        return _calculateSellAmount(token, tokenAmount);
    }

    function getReserve(address token) external view override returns (uint256) {
        return tokens[token].reserveUsdc;
    }

    function isListed(address token) external view override returns (bool) {
        return tokens[token].isListedOnDex;
    }

    function getTokenInfo(address token) external view returns (
        address tokenAddress,
        address creator,
        uint256 totalSupply,
        uint256 reserveUsdc,
        uint256 tokensSold,
        bool isListedOnDex,
        uint256 dexListingThreshold,
        string memory metadataURI
    ) {
        TokenInfo storage info = tokens[token];
        return (info.tokenAddress, info.creator, info.totalSupply, info.reserveUsdc, info.tokensSold, info.isListedOnDex, info.dexListingThreshold, info.metadataURI);
    }

    function setPools(address _longPool, address _shortPool) external onlyOwner {
        longPool = _longPool;
        shortPool = _shortPool;
    }

    function setCreationFee(uint256 _fee) external onlyOwner {
        creationFee = _fee;
    }

    function setDexThreshold(uint256 _threshold) external onlyOwner {
        defaultDexThreshold = _threshold;
    }

    function setFeeDistributor(address _feeDistributor) external onlyOwner {
        feeDistributor = _feeDistributor;
    }

    function setDexRouterConfig(address _dexRouter, bool _isXyloRouter, address _baseAsset) external onlyOwner {
        dexRouter = _dexRouter;
        isXyloRouter = _isXyloRouter;
        baseAsset = _baseAsset;
    }

    function setDexLister(address payable _dexLister) external onlyOwner {
        dexLister = _dexLister;
    }

    function isMature(address token) external view returns (bool) {
        if (isMatureOverride[token]) return true;
        if (tokens[token].isListedOnDex) return true;
        if (tokens[token].reserveUsdc >= maturityThreshold) return true;
        return false;
    }

    function setMaturityThreshold(uint256 _threshold) external onlyOwner {
        maturityThreshold = _threshold;
    }

    function setMatureOverride(address token, bool mature) external onlyOwner {
        isMatureOverride[token] = mature;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    receive() external payable {}
}
