// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPerpOracle {
    function getPrice(address token) external view returns (uint256);
}

interface IBCTRecapitalize {
    function mintTo(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}

error ZA(); error ZU(); error ST(); error OFD(); error NA();
error OI_LIMIT(); error INSOLVENT(); error PAUSED();

struct TokenPool {
    uint256 usdcBalance;
    uint256 tokenBalance;
    uint256 longOI;
    uint256 shortOI;
    bool active;
}

contract SharedLiquidityPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IPerpOracle public oracle;
    address public perpetualPool;
    address public bctToken;
    bool public paused;

    uint256 public constant MAX_OI_MULTIPLIER = 5e18;
    uint256 public constant INSOLVENCY_THRESHOLD = 8e17;  // 80%
    uint256 public constant RECAP_MINT_BPS = 50;          // 0.5% per recap
    uint256 public constant RECAP_INTERVAL = 1 hours;
    uint256 public constant LP_WITHDRAW_DELAY = 1 days;

    mapping(address => TokenPool) public pools;

    mapping(address => uint256) public lpShares;
    uint256 public totalShares;
    uint256 public totalUsdcValue;

    mapping(address => uint256) public lastRecapTime;

    event LiquidityAdded(address indexed token, uint256 usdcAmount, uint256 tokenAmount);
    event LiquidityRemoved(address indexed token, uint256 usdcAmount, uint256 tokenAmount);
    event PositionSettled(address indexed token, address indexed user, int256 pnl, uint256 marginReturned);
    event MarginDeposited(address indexed token, address indexed user, uint256 amount);
    event Recapitalized(address indexed token, uint256 deficit, uint256 bctMinted);
    event PoolPaused(bool paused);

    modifier onlyPerp() {
        if (msg.sender != perpetualPool && msg.sender != owner()) revert OFD();
        _;
    }

    modifier notPaused() {
        if (paused) revert PAUSED();
        _;
    }

    constructor(address _oracle) Ownable(msg.sender) {
        oracle = IPerpOracle(_oracle);
    }

    function setPerpetualPool(address _pool) external onlyOwner {
        perpetualPool = _pool;
    }

    function setBctToken(address _bct) external onlyOwner {
        bctToken = _bct;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PoolPaused(_paused);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = IPerpOracle(_oracle);
    }

    function activateToken(address token) external onlyOwner {
        pools[token].active = true;
    }

    function deactivateToken(address token) external onlyOwner {
        pools[token].active = false;
    }

    function addLiquidity(address token) external payable nonReentrant notPaused {
        if (msg.value == 0) revert ZU();
        if (!pools[token].active) revert NA();

        pools[token].usdcBalance += msg.value;

        uint256 shares = msg.value;
        lpShares[msg.sender] += shares;
        totalShares += shares;
        totalUsdcValue += msg.value;

        emit LiquidityAdded(token, msg.value, 0);
    }

    function addTokenLiquidity(address token, uint256 amount) external nonReentrant notPaused {
        if (amount == 0) revert ZU();
        if (!pools[token].active) revert NA();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        pools[token].tokenBalance += amount;

        emit LiquidityAdded(token, 0, amount);
    }

    function removeLiquidity(address token, uint256 shareAmount) external nonReentrant notPaused {
        if (shareAmount == 0) revert ZU();
        if (lpShares[msg.sender] < shareAmount) revert ST();
        if (totalShares == 0) revert ST();

        uint256 usdcShare = (pools[token].usdcBalance * shareAmount) / totalShares;
        uint256 tokenShare = (pools[token].tokenBalance * shareAmount) / totalShares;

        lpShares[msg.sender] -= shareAmount;
        totalShares -= shareAmount;

        if (usdcShare > 0) {
            pools[token].usdcBalance -= usdcShare;
            totalUsdcValue -= usdcShare;
            (bool ok,) = msg.sender.call{value: usdcShare}("");
            if (!ok) revert ST();
        }

        if (tokenShare > 0) {
            pools[token].tokenBalance -= tokenShare;
            IERC20(token).safeTransfer(msg.sender, tokenShare);
        }

        emit LiquidityRemoved(token, usdcShare, tokenShare);
    }

    function depositMargin(address token, address user) external payable onlyPerp notPaused {
        if (msg.value == 0) revert ZU();
        pools[token].usdcBalance += msg.value;
        emit MarginDeposited(token, user, msg.value);
    }

    function settlePosition(
        address token,
        address payable user,
        uint256 margin,
        int256 pnl
    ) external onlyPerp nonReentrant notPaused {
        TokenPool storage pool = pools[token];
        if (!pool.active) revert NA();

        uint256 payout;
        if (pnl >= 0) {
            payout = margin + uint256(pnl);
            if (payout > pool.usdcBalance) {
                _recapitalize(token, uint256(pnl) - (payout > pool.usdcBalance ? payout - pool.usdcBalance : 0));
                payout = margin + uint256(pnl);
                if (payout > pool.usdcBalance) {
                    payout = pool.usdcBalance;
                }
            }
            pool.usdcBalance -= payout;
            totalUsdcValue -= payout > totalUsdcValue ? totalUsdcValue : payout;
        } else {
            uint256 loss = uint256(-pnl);
            if (loss >= margin) {
                payout = 0;
                pool.usdcBalance += margin;
                totalUsdcValue += margin;
            } else {
                payout = margin - loss;
                uint256 retained = margin - payout;
                pool.usdcBalance += retained;
                totalUsdcValue += retained;
            }
        }

        if (payout > 0) {
            (bool ok,) = user.call{value: payout}("");
            if (!ok) revert ST();
        }

        emit PositionSettled(token, user, pnl, payout);
    }

    function updateOI(address token, uint256 longDelta, uint256 shortDelta, bool isAdd) external onlyPerp {
        TokenPool storage pool = pools[token];
        if (isAdd) {
            pool.longOI += longDelta;
            pool.shortOI += shortDelta;
        } else {
            pool.longOI = pool.longOI > longDelta ? pool.longOI - longDelta : 0;
            pool.shortOI = pool.shortOI > shortDelta ? pool.shortOI - shortDelta : 0;
        }

        uint256 totalOI = pool.longOI + pool.shortOI;
        uint256 maxOI = (pool.usdcBalance * MAX_OI_MULTIPLIER) / 1e18;
        if (totalOI > maxOI) revert OI_LIMIT();
    }

    function _recapitalize(address token, uint256 deficit) internal {
        if (bctToken == address(0)) return;
        if (block.timestamp < lastRecapTime[token] + RECAP_INTERVAL) return;

        lastRecapTime[token] = block.timestamp;

        uint256 bctMintAmount = (deficit * RECAP_MINT_BPS) / 10000;
        if (bctMintAmount > 0) {
            IBCTRecapitalize(bctToken).mintTo(address(this), bctMintAmount);

            // Note: In production, minted BCT would be sold via OTC/Dutch auction for USDC
            // For now, we track it as potential future value
            emit Recapitalized(token, deficit, bctMintAmount);
        }
    }

    function getPoolInfo(address token) external view returns (
        uint256 usdcBalance,
        uint256 tokenBalance,
        uint256 longOI,
        uint256 shortOI,
        uint256 maxOI,
        bool active,
        bool solvent
    ) {
        TokenPool storage pool = pools[token];
        uint256 netExposure = pool.longOI > pool.shortOI
            ? pool.longOI - pool.shortOI
            : pool.shortOI - pool.longOI;

        maxOI = (pool.usdcBalance * MAX_OI_MULTIPLIER) / 1e18;
        solvent = pool.usdcBalance == 0 || netExposure <= (pool.usdcBalance * INSOLVENCY_THRESHOLD) / 1e18;

        return (pool.usdcBalance, pool.tokenBalance, pool.longOI, pool.shortOI, maxOI, pool.active, solvent);
    }

    function getLPShareValue(address lp, address token) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (pools[token].usdcBalance * lpShares[lp]) / totalShares;
    }

    function getNetExposure(address token) external view returns (int256) {
        TokenPool storage pool = pools[token];
        return int256(pool.longOI) - int256(pool.shortOI);
    }

    function getHealthFactor(address token) external view returns (uint256) {
        TokenPool storage pool = pools[token];
        if (pool.usdcBalance == 0) return 0;
        uint256 netExposure = pool.longOI > pool.shortOI
            ? pool.longOI - pool.shortOI
            : pool.shortOI - pool.longOI;
        return (pool.usdcBalance * 1e18) / (netExposure > 0 ? netExposure : 1);
    }

    receive() external payable {}
}
