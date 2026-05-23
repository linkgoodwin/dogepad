// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../core/BondingCurveToken.sol";

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

interface IShortPoolDeposit {
    function depositTokens(address token, uint256 amount) external;
}

interface ICreatorRewardManager {
    function createVesting(address asset, address beneficiary, uint256 amount, uint256 cliffDuration, uint256 vestingDuration) external;
}

interface ILongPoolDeposit {
    function deposit(address token) external payable;
}

struct DexListingParams {
    address token;
    uint256 totalUsdc;
    uint256 lpTokens;
    uint256 longPoolUsdc;
    uint256 shortPoolTokens;
    uint256 burnEngineUsdc;
    uint256 platformUsdc;
    uint256 creatorTokens;
    uint256 creatorLpBps;
    uint256 multiplier;
    address creator;
    uint8 incentiveCount;
    bool wantTaxShare;
    bool wantLpShare;
}

error BurnEngineTransferFailed();
error PlatformTransferFailed();

contract DexLister is Ownable {
    using SafeERC20 for IERC20;

    address public dexRouter;
    bool public isXyloRouter;
    address public baseAsset;
    address public longPool;
    address public shortPool;
    address public feeDistributor;
    address public buyAndBurnEngine;
    address public creatorRewardManager;
    address public bondingCurve;

    uint256 public constant BASE_TAX_SHARE_BPS = 5000;
    uint256 public constant BASE_LP_SHARE_BPS = 1000;
    uint256 public constant CREATOR_LP_VESTING = 180 days;

    uint256 public lpUsdcRatio = 70;
    uint256 public longPoolRatio = 25;
    uint256 public shortPoolTokenRatio = 30;
    uint256 public burnEngineRatio = 0;
    uint256 public platformRatio = 5;
    uint256 public lpTokenRatio = 60;

    event DexListed(address indexed token, uint256 lpUsdc, uint256 lpTokens);
    event CreatorIncentiveSet(address indexed token, address indexed creator, bool wantTaxShare, bool wantLpShare, bool wantTokenAllocation);

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

    function setDexRouterConfig(address _dexRouter, bool _isXyloRouter, address _baseAsset) external onlyOwner {
        dexRouter = _dexRouter;
        isXyloRouter = _isXyloRouter;
        baseAsset = _baseAsset;
    }

    function setPools(address _longPool, address _shortPool) external onlyOwner {
        longPool = _longPool;
        shortPool = _shortPool;
    }

    function setFeeDistributor(address _feeDistributor) external onlyOwner {
        feeDistributor = _feeDistributor;
    }

    function setBuyAndBurnEngine(address _engine) external onlyOwner {
        buyAndBurnEngine = _engine;
    }

    function setCreatorRewardManager(address _manager) external onlyOwner {
        creatorRewardManager = _manager;
    }

    function setBondingCurve(address _bondingCurve) external onlyOwner {
        bondingCurve = _bondingCurve;
    }

    function setRatios(
        uint256 _lpUsdc,
        uint256 _long,
        uint256 _shortToken,
        uint256 _burnEngine,
        uint256 _platform,
        uint256 _lpToken
    ) external onlyOwner {
        if (_lpUsdc + _long + _burnEngine + _platform != 100) revert();
        if (_lpToken + _shortToken > 100) revert();
        lpUsdcRatio = _lpUsdc;
        longPoolRatio = _long;
        shortPoolTokenRatio = _shortToken;
        burnEngineRatio = _burnEngine;
        platformRatio = _platform;
        lpTokenRatio = _lpToken;
    }

    function addLiquidityAndDistribute(DexListingParams calldata p) external payable {
        if (msg.sender != bondingCurve && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        uint256 lpUsdc = (p.totalUsdc * lpUsdcRatio) / 100;

        BondingCurveToken(p.token).setSkipHoldingLimit(true);

        IERC20(p.token).forceApprove(dexRouter, p.lpTokens);

        if (!isXyloRouter) {
            IUniswapV2Router02(dexRouter).addLiquidityETH{value: lpUsdc}(
                p.token,
                p.lpTokens,
                (p.lpTokens * 95) / 100,
                (lpUsdc * 95) / 100,
                address(this),
                block.timestamp + 300
            );
        } else {
            IWUSDC(baseAsset).deposit{value: lpUsdc}();
            IERC20(baseAsset).forceApprove(dexRouter, lpUsdc);
            IUniswapV2Router02(dexRouter).addLiquidity(
                baseAsset,
                p.token,
                lpUsdc,
                p.lpTokens,
                (lpUsdc * 95) / 100,
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

        if (lpToken != address(0)) {
            uint256 remainingLp = IERC20(lpToken).balanceOf(address(this));
            if (remainingLp > 0) {
                IERC20(lpToken).transfer(0x000000000000000000000000000000000000dEaD, remainingLp);
            }
        }

        if (p.creatorTokens > 0 && creatorRewardManager != address(0)) {
            IERC20(p.token).safeTransfer(creatorRewardManager, p.creatorTokens);
            ICreatorRewardManager(creatorRewardManager).createVesting(
                p.token, p.creator, p.creatorTokens, 90 days, 360 days
            );
        }

        if (p.longPoolUsdc > 0 && longPool != address(0)) {
            ILongPoolDeposit(longPool).deposit{value: p.longPoolUsdc}(p.token);
        }

        if (p.shortPoolTokens > 0 && shortPool != address(0)) {
            IERC20(p.token).forceApprove(shortPool, p.shortPoolTokens);
            IShortPoolDeposit(shortPool).depositTokens(p.token, p.shortPoolTokens);
        }

        if (p.burnEngineUsdc > 0 && buyAndBurnEngine != address(0)) {
            (bool sent, ) = buyAndBurnEngine.call{value: p.burnEngineUsdc}("");
            if (!sent) revert BurnEngineTransferFailed();
        }

        if (p.platformUsdc > 0) {
            (bool sent, ) = feeDistributor.call{value: p.platformUsdc}("");
            if (!sent) revert PlatformTransferFailed();
        }

        uint256 actualRemaining = IERC20(p.token).balanceOf(address(this));
        if (actualRemaining > 0) {
            BondingCurveToken(p.token).burn(actualRemaining);
        }

        emit DexListed(p.token, lpUsdc, p.lpTokens);
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

    function longPoolUsdcAmt(uint256 totalUsdc) external view returns (uint256) {
        uint256 base = (totalUsdc * longPoolRatio) / 100;
        uint256 accounted = (totalUsdc * (lpUsdcRatio + longPoolRatio + burnEngineRatio + platformRatio)) / 100;
        if (accounted < totalUsdc) {
            base += totalUsdc - accounted;
        }
        return base;
    }

    function burnEngineUsdcAmt(uint256 totalUsdc) external view returns (uint256) {
        return (totalUsdc * burnEngineRatio) / 100;
    }

    function platformUsdcAmt(uint256 totalUsdc) external view returns (uint256) {
        return (totalUsdc * platformRatio) / 100;
    }

    receive() external payable {}
}
