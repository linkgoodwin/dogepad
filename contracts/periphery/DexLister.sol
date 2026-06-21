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

interface IPerpetualPoolDeposit {
    function depositTokens(address token, uint256 amount) external;
    function depositUsdcToInsurance(address token) external payable;
}

interface ICreatorRewardManager {
    function createVesting(address asset, address beneficiary, uint256 amount, uint256 cliffDuration, uint256 vestingDuration) external;
}

struct DexListingParams {
    address token;
    uint256 totalUsdc;
    uint256 lpTokens;
    uint256 perpPoolUsdc;
    uint256 perpPoolTokens;
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
    address public perpetualPool;
    address public feeDistributor;
    address public buyAndBurnEngine;
    address public creatorRewardManager;
    address public bondingCurve;

    uint256 public constant BASE_TAX_SHARE_BPS = 5000;
    uint256 public constant BASE_LP_SHARE_BPS = 1000;
    uint256 public constant CREATOR_LP_VESTING = 180 days;

    uint256 public lpUsdcRatio = 70;
    uint256 public perpPoolUsdcRatio = 25;
    uint256 public perpPoolTokenRatio = 30;
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

    function setPerpetualPool(address _perpetualPool) external onlyOwner {
        perpetualPool = _perpetualPool;
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
        uint256 _perpUsdc,
        uint256 _perpToken,
        uint256 _burnEngine,
        uint256 _platform,
        uint256 _lpToken
    ) external onlyOwner {
        if (_lpUsdc + _perpUsdc + _burnEngine + _platform != 100) revert();
        if (_lpToken + _perpToken > 100) revert();
        lpUsdcRatio = _lpUsdc;
        perpPoolUsdcRatio = _perpUsdc;
        perpPoolTokenRatio = _perpToken;
        burnEngineRatio = _burnEngine;
        platformRatio = _platform;
        lpTokenRatio = _lpToken;
    }

    function addLiquidityAndDistribute(DexListingParams calldata p) external payable {
        if (msg.sender != bondingCurve && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);
        uint256 lpUsdc = (p.totalUsdc * lpUsdcRatio) / 100;

        IERC20(p.token).safeTransferFrom(msg.sender, address(this), p.lpTokens + p.perpPoolTokens + p.creatorTokens);

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

        if (p.perpPoolUsdc > 0 && perpetualPool != address(0)) {
            IPerpetualPoolDeposit(perpetualPool).depositUsdcToInsurance{value: p.perpPoolUsdc}(p.token);
        }

        if (p.perpPoolTokens > 0 && perpetualPool != address(0)) {
            IERC20(p.token).forceApprove(perpetualPool, p.perpPoolTokens);
            IPerpetualPoolDeposit(perpetualPool).depositTokens(p.token, p.perpPoolTokens);
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

        BondingCurveToken(p.token).setSkipHoldingLimit(false);

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

    function perpPoolUsdcAmt(uint256 totalUsdc) external view returns (uint256) {
        uint256 base = (totalUsdc * perpPoolUsdcRatio) / 100;
        uint256 accounted = (totalUsdc * (lpUsdcRatio + perpPoolUsdcRatio + burnEngineRatio + platformRatio)) / 100;
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

    /// @notice Simplified DEX listing for DAO-launched tokens
    /// @dev Called by BondingCurve with msg.value = USDC for LP, tokens transferred via safeTransferFrom
    /// @param token Token address to list
    /// @param creator Creator address (for potential future use)
    function listTokenSimple(address token, address creator) external payable {
        if (msg.sender != bondingCurve && msg.sender != owner()) revert OwnableUnauthorizedAccount(msg.sender);

        uint256 tokenBalance = IERC20(token).balanceOf(msg.sender);
        require(tokenBalance > 0, "no tokens");
        require(msg.value > 0, "no usdc");

        // Transfer all tokens from caller (BondingCurve) to DexLister
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenBalance);

        BondingCurveToken(token).setSkipHoldingLimit(true);
        IERC20(token).forceApprove(dexRouter, tokenBalance);

        uint256 lpUsdc = msg.value;

        if (!isXyloRouter) {
            IUniswapV2Router02(dexRouter).addLiquidityETH{value: lpUsdc}(
                token,
                tokenBalance,
                (tokenBalance * 95) / 100,
                (lpUsdc * 95) / 100,
                address(this),
                block.timestamp + 300
            );
        } else {
            IWUSDC(baseAsset).deposit{value: lpUsdc}();
            IERC20(baseAsset).forceApprove(dexRouter, lpUsdc);
            IUniswapV2Router02(dexRouter).addLiquidity(
                baseAsset,
                token,
                lpUsdc,
                tokenBalance,
                (lpUsdc * 95) / 100,
                (tokenBalance * 95) / 100,
                address(this),
                block.timestamp + 300
            );
        }

        // Set dexPair so tax/holding limit switches to DEX mode
        address lpToken = _getLpToken(token);
        if (lpToken != address(0)) {
            BondingCurveToken(token).setDexPair(lpToken);
            // Burn LP tokens (lock forever)
            uint256 remainingLp = IERC20(lpToken).balanceOf(address(this));
            if (remainingLp > 0) {
                IERC20(lpToken).transfer(0x000000000000000000000000000000000000dEaD, remainingLp);
            }
        }

        // Burn any remaining tokens
        uint256 actualRemaining = IERC20(token).balanceOf(address(this));
        if (actualRemaining > 0) {
            BondingCurveToken(token).burn(actualRemaining);
        }

        BondingCurveToken(token).setSkipHoldingLimit(false);

        emit DexListed(token, lpUsdc, tokenBalance);
    }

    receive() external payable {}
}
