// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPoolContracts.sol";

interface IUniswapV2Router02 {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IBurnableToken {
    function burn(uint256 amount) external;
}

interface IWUSDC {
    function deposit() external payable;
}

contract BuyAndBurnEngine is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    address public dexRouter;
    address public keeper;
    uint256 public burnThreshold = 1e17;
    uint256 public maxSlippage = 5e16;
    uint256 public maxSingleBurn = 1e18;
    uint256 public minInterval = 30;
    uint256 public lastBurnTimestamp;
    uint256 public randomDelayBlocks = 3;

    mapping(address => uint256) public pendingUsdc;
    mapping(address => uint256) public totalBurned;
    mapping(address => uint256) public totalUsdcUsed;
    mapping(address => uint256) public burnCount;

    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    address public wrappedNative;

    bool public isXyloRouter;

    event TokenBurned(address indexed token, uint256 tokensBurned, uint256 usdcUsed);
    event UsdcDeposited(address indexed token, uint256 amount);

    constructor(address _dexRouter, address _keeper, bool _isXyloRouter, address _wrappedNative) Ownable(msg.sender) {
        dexRouter = _dexRouter;
        keeper = _keeper;
        isXyloRouter = _isXyloRouter;
        wrappedNative = _wrappedNative;
    }

    function deposit(address token) external payable nonReentrant {
        require(msg.value > 0, "Zero value");
        pendingUsdc[token] += msg.value;
        emit UsdcDeposited(token, msg.value);
    }

    function executeBurn(address token, uint256 minTokensOut) external nonReentrant {
        require(msg.sender == keeper, "Not keeper");
        require(pendingUsdc[token] >= burnThreshold, "Below threshold");
        require(block.timestamp >= lastBurnTimestamp + minInterval, "Too soon");

        uint256 burnAmount = pendingUsdc[token];
        if (burnAmount > maxSingleBurn) {
            burnAmount = maxSingleBurn;
        }

        pendingUsdc[token] -= burnAmount;
        lastBurnTimestamp = block.timestamp;

        uint256 expectedOut = getEstimatedTokensOut(token, burnAmount);
        uint256 minOut = (expectedOut * (1e18 - maxSlippage)) / 1e18;
        require(minTokensOut >= minOut, "slippage exceeded");

        address[] memory path = new address[](2);
        path[0] = wrappedNative;
        path[1] = token;

        uint256 tokensBought;

        if (!isXyloRouter) {
            uint256[] memory amounts = IUniswapV2Router02(dexRouter).swapExactETHForTokens{value: burnAmount}(
                minTokensOut, path, address(this), block.timestamp + 300
            );
            tokensBought = amounts[amounts.length - 1];
        } else {
            IWUSDC(wrappedNative).deposit{value: burnAmount}();
            IERC20(wrappedNative).forceApprove(dexRouter, burnAmount);
            uint256[] memory amounts = IUniswapV2Router02(dexRouter).swapExactTokensForTokens(
                burnAmount, minTokensOut, path, address(this), block.timestamp + 300
            );
            tokensBought = amounts[amounts.length - 1];
        }

        try IBurnableToken(token).burn(tokensBought) {
            totalBurned[token] += tokensBought;
        } catch {
            IERC20(token).safeTransfer(DEAD_ADDRESS, tokensBought);
            totalBurned[token] += tokensBought;
        }

        totalUsdcUsed[token] += burnAmount;
        burnCount[token] += 1;

        emit TokenBurned(token, tokensBought, burnAmount);
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setBurnThreshold(uint256 _threshold) external onlyOwner {
        burnThreshold = _threshold;
    }

    function setMaxSlippage(uint256 _slippage) external onlyOwner {
        maxSlippage = _slippage;
    }

    function emergencyWithdraw(address payable to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0));
        require(amount <= address(this).balance);
        (bool success,) = to.call{value: amount}("");
        require(success);
    }

    function emergencyWithdrawToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0));
        IERC20(token).safeTransfer(to, amount);
    }

    function getEstimatedTokensOut(address token, uint256 usdcAmount) public view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = wrappedNative;
        path[1] = token;
        uint256[] memory amounts = IUniswapV2Router02(dexRouter).getAmountsOut(usdcAmount, path);
        return amounts[amounts.length - 1];
    }

    receive() external payable {}
}
