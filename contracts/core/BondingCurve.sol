// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/BondingCurveToken.sol";
import "../interfaces/IBondingCurve.sol";

interface IUniswapV2Router02 {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function factory() external view returns (address);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IWUSDC {
    function deposit() external payable;
}

interface IPriceOracleSetter {
    function updateTwapPrice(address token, uint256 newPrice) external;
}

struct DexListingParams {
    address token;
    uint256 totalBnb;
    uint256 lpTokens;
    uint256 longPoolBnb;
    uint256 shortPoolTokens;
    uint256 burnEngineBnb;
    uint256 platformBnb;
    uint256 creatorTokens;
    uint256 creatorLpBps;
    uint256 multiplier;
    address creator;
    uint8 incentiveCount;
    bool wantTaxShare;
    bool wantLpShare;
}

interface IShortPoolDeposit {
    function depositTokens(address token, uint256 amount) external;
}

interface ICreatorRewardManager {
    function createVesting(address asset, address beneficiary, uint256 amount, uint256 cliffDuration, uint256 vestingDuration) external;
}

error TokenNotFound();
error AlreadyListed();
error ZeroBnb();
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
error BnbRatiosInvalid();
error TokenRatiosInvalid();
error LongPoolTransferFailed();
error BurnEngineTransferFailed();
error PlatformTransferFailed();

contract BondingCurve is IBondingCurve, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    struct TokenInfo {
        address tokenAddress;
        address creator;
        uint256 totalSupply;
        uint256 reserveBnb;
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
    uint256 public creationFee = 0.1 ether;
    uint256 public defaultDexThreshold = 20000 ether;
    bool public daoOnlyLaunch = false;

    uint256 public lpRatio = 82;
    uint256 public longPoolRatio = 8;
    uint256 public shortPoolTokenRatio = 8;
    uint256 public burnEngineRatio = 5;
    uint256 public platformRatio = 5;

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
            reserveBnb: 0,
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
        if (info.isListedOnDex && info.reserveBnb == 0) revert AlreadyListed();
        if (msg.value == 0) revert ZeroBnb();

        uint256 fee = (msg.value * FEE_BPS) / 10000;
        uint256 bnbAfterFee = msg.value - fee;

        uint256 tokensToBuy = _calculateBuyAmount(token, bnbAfterFee);
        if (tokensToBuy == 0) revert ZeroTokens();
        if (tokensToBuy < minTokensOut) revert SlippageTooHigh();
        if (BondingCurveToken(token).balanceOf(token) < tokensToBuy) revert InsufficientCurveTokens();

        info.reserveBnb += bnbAfterFee;
        info.tokensSold += tokensToBuy;

        BondingCurveToken(token).buyFromCurve(recipient, tokensToBuy);

        if (fee > 0) {
            (bool sent, ) = feeDistributor.call{value: fee}("");
            if (!sent) revert FeeTransferFailed();
        }

        emit TokenBought(token, recipient, msg.value, tokensToBuy);

        _checkAndListOnDex(token);
    }

    function sell(address token, uint256 tokenAmount, uint256 minBnbOut) external override nonReentrant whenNotPaused {
        TokenInfo storage info = tokens[token];
        if (info.tokenAddress == address(0)) revert TokenNotFound();
        if (info.isListedOnDex && info.reserveBnb == 0) revert AlreadyListed();
        if (tokenAmount == 0) revert ZeroAmount();

        uint256 bnbToReturn = _calculateSellAmount(token, tokenAmount);
        if (bnbToReturn == 0) revert ZeroBnb();
        if (bnbToReturn > info.reserveBnb) revert InsufficientReserve();
        if (bnbToReturn < minBnbOut) revert SlippageTooHigh();

        uint256 fee = (bnbToReturn * FEE_BPS) / 10000;
        uint256 bnbAfterFee = bnbToReturn - fee;

        info.reserveBnb -= bnbToReturn;
        info.tokensSold -= tokenAmount;

        BondingCurveToken(token).sellToCurve(msg.sender, tokenAmount);

        (bool sent, ) = msg.sender.call{value: bnbAfterFee}("");
        if (!sent) revert TransferFailed();

        if (fee > 0) {
            (bool feeSent, ) = feeDistributor.call{value: fee}("");
            if (!feeSent) revert FeeTransferFailed();
        }

        emit TokenSold(token, msg.sender, tokenAmount, bnbAfterFee);
    }

    function _calculateBuyAmount(address token, uint256 bnbAmount) internal view returns (uint256) {
        TokenInfo storage info = tokens[token];
        uint256 s0 = info.tokensSold;

        uint256 priceS0 = _getPrice(s0);

        if (SLOPE == 0) {
            if (priceS0 == 0) return 0;
            return (bnbAmount * PRICE_PRECISION) / priceS0;
        }

        uint256 discriminant = priceS0 * priceS0 + 2 * SLOPE * bnbAmount;
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

        uint256 bnbOut = (tokenAmount * (priceS0 + priceS1)) / (2 * PRICE_PRECISION);
        return bnbOut;
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

    function _getLpToken(address token) internal view returns (address) {
        address factory_ = IUniswapV2Router02(dexRouter).factory();
        return IUniswapV2Factory(factory_).getPair(token, baseAsset);
    }

    function _handleCreatorLpShare(address lpToken, address creator, uint256 creatorLpBps) internal {
        if (lpToken == address(0)) return;
        uint256 totalLp = IERC20(lpToken).balanceOf(address(this));
        uint256 creatorLpAmount = (totalLp * creatorLpBps) / 10000;
        if (creatorLpAmount > 0) {
            IERC20(lpToken).safeTransfer(creatorRewardManager, creatorLpAmount);
            ICreatorRewardManager(creatorRewardManager).createVesting(
                lpToken, creator, creatorLpAmount, 0, CREATOR_LP_VESTING
            );
        }
    }

    function _checkAndListOnDex(address token) internal {
        TokenInfo storage info = tokens[token];
        if (info.reserveBnb < info.dexListingThreshold) return;
        if (info.isListedOnDex) return;

        info.isListedOnDex = true;
        emit DexListingReady(token);
    }

    function listOnDex(address token) external nonReentrant whenNotPaused {
        TokenInfo storage info = tokens[token];
        if (!info.isListedOnDex) revert NotReadyForListing();
        if (info.reserveBnb == 0) revert AlreadyDexListed();

        uint256 totalBnb = info.reserveBnb;
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

        uint256 lpTokens = (totalTokens * lpRatio) / 100;
        uint256 shortPoolTokens = (totalTokens * shortPoolTokenRatio) / 100;

        info.reserveBnb = 0;

        _addLiquidityAndDistribute(DexListingParams({
            token: token,
            totalBnb: totalBnb,
            lpTokens: lpTokens,
            longPoolBnb: longPoolBnbAmt(totalBnb),
            shortPoolTokens: shortPoolTokens,
            burnEngineBnb: burnEngineBnbAmt(totalBnb),
            platformBnb: platformBnbAmt(totalBnb),
            creatorTokens: creatorTokens,
            creatorLpBps: creatorLpBps,
            multiplier: multiplier,
            creator: info.creator,
            incentiveCount: count,
            wantTaxShare: ci.wantTaxShare,
            wantLpShare: ci.wantLpShare
        }));
    }

    function longPoolBnbAmt(uint256 totalBnb) internal view returns (uint256) {
        uint256 base = (totalBnb * longPoolRatio) / 100;
        uint256 accounted = (totalBnb * (lpRatio + longPoolRatio + burnEngineRatio + platformRatio)) / 100;
        if (accounted < totalBnb) {
            base += totalBnb - accounted;
        }
        return base;
    }

    function burnEngineBnbAmt(uint256 totalBnb) internal view returns (uint256) {
        return (totalBnb * burnEngineRatio) / 100;
    }

    function platformBnbAmt(uint256 totalBnb) internal view returns (uint256) {
        return (totalBnb * platformRatio) / 100;
    }

    function _addLiquidityAndDistribute(DexListingParams memory p) internal {
        uint256 lpBnb = (p.totalBnb * lpRatio) / 100;

        BondingCurveToken(p.token).setSkipHoldingLimit(true);

        IERC20(p.token).forceApprove(dexRouter, p.lpTokens);

        if (!isXyloRouter) {
            IUniswapV2Router02(dexRouter).addLiquidityETH{value: lpBnb}(
                p.token,
                p.lpTokens,
                (p.lpTokens * 95) / 100,
                (lpBnb * 95) / 100,
                address(this),
                block.timestamp + 300
            );
        } else {
            IWUSDC(baseAsset).deposit{value: lpBnb}();
            IERC20(baseAsset).forceApprove(dexRouter, lpBnb);
            IUniswapV2Router02(dexRouter).addLiquidity(
                baseAsset,
                p.token,
                lpBnb,
                p.lpTokens,
                (lpBnb * 95) / 100,
                (p.lpTokens * 95) / 100,
                address(this),
                block.timestamp + 300
            );
        }

        address lpToken = _getLpToken(p.token);
        if (lpToken != address(0)) {
            BondingCurveToken(p.token).setDexPair(lpToken);
        }

        BondingCurveToken(p.token).setSkipHoldingLimit(false);

        if (p.incentiveCount > 0 && p.wantTaxShare) {
            uint256 creatorTaxBps = (BASE_TAX_SHARE_BPS * p.multiplier) / 10000;
            BondingCurveToken(p.token).setCreatorTaxReceiver(p.creator, creatorTaxBps);
        }

        if (p.incentiveCount > 0 && p.wantLpShare && creatorRewardManager != address(0)) {
            _handleCreatorLpShare(lpToken, p.creator, p.creatorLpBps);
        }

        if (p.creatorTokens > 0 && creatorRewardManager != address(0)) {
            IERC20(p.token).safeTransfer(creatorRewardManager, p.creatorTokens);
            ICreatorRewardManager(creatorRewardManager).createVesting(
                p.token, p.creator, p.creatorTokens, CREATOR_TOKEN_CLIFF, CREATOR_TOKEN_VESTING
            );
        }

        if (p.longPoolBnb > 0 && longPool != address(0)) {
            (bool sent, ) = longPool.call{value: p.longPoolBnb}("");
            if (!sent) revert LongPoolTransferFailed();
        }

        if (p.shortPoolTokens > 0 && shortPool != address(0)) {
            IERC20(p.token).forceApprove(shortPool, p.shortPoolTokens);
            IShortPoolDeposit(shortPool).depositTokens(p.token, p.shortPoolTokens);
        }

        if (p.burnEngineBnb > 0 && buyAndBurnEngine != address(0)) {
            (bool sent, ) = buyAndBurnEngine.call{value: p.burnEngineBnb}("");
            if (!sent) revert BurnEngineTransferFailed();
        }

        if (p.platformBnb > 0) {
            (bool sent, ) = feeDistributor.call{value: p.platformBnb}("");
            if (!sent) revert PlatformTransferFailed();
        }

        uint256 actualRemaining = IERC20(p.token).balanceOf(address(this));
        if (actualRemaining > 0) {
            BondingCurveToken(p.token).burn(actualRemaining);
        }

        emit DexListed(p.token, lpBnb, p.lpTokens);
    }

    function getBuyPrice(address token, uint256 bnbAmount) external view override returns (uint256) {
        return _calculateBuyAmount(token, bnbAmount);
    }

    function getSellPrice(address token, uint256 tokenAmount) external view override returns (uint256) {
        return _calculateSellAmount(token, tokenAmount);
    }

    function getReserve(address token) external view override returns (uint256) {
        return tokens[token].reserveBnb;
    }

    function isListed(address token) external view override returns (bool) {
        return tokens[token].isListedOnDex;
    }

    function getTokenInfo(address token) external view returns (
        address tokenAddress,
        address creator,
        uint256 totalSupply,
        uint256 reserveBnb,
        uint256 tokensSold,
        bool isListedOnDex,
        uint256 dexListingThreshold,
        string memory metadataURI
    ) {
        TokenInfo storage info = tokens[token];
        return (info.tokenAddress, info.creator, info.totalSupply, info.reserveBnb, info.tokensSold, info.isListedOnDex, info.dexListingThreshold, info.metadataURI);
    }

    function setPools(address _longPool, address _shortPool) external onlyOwner {
        longPool = _longPool;
        shortPool = _shortPool;
    }

    function setRatios(
        uint256 _lp,
        uint256 _long,
        uint256 _shortToken,
        uint256 _burnEngine,
        uint256 _platform
    ) external onlyOwner {
        if (_lp + _long + _burnEngine + _platform != 100) revert BnbRatiosInvalid();
        if (_lp + _shortToken > 100) revert TokenRatiosInvalid();
        lpRatio = _lp;
        longPoolRatio = _long;
        shortPoolTokenRatio = _shortToken;
        burnEngineRatio = _burnEngine;
        platformRatio = _platform;
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

    function isMature(address token) external view returns (bool) {
        if (isMatureOverride[token]) return true;
        if (tokens[token].isListedOnDex) return true;
        if (tokens[token].reserveBnb >= maturityThreshold) return true;
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
