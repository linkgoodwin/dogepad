// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SimplePair is ERC20, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    address public factory;
    address public token0;
    address public token1;

    uint256 private _reserve0;
    uint256 private _reserve1;
    uint256 private _blockTimestampLast;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint256 reserve0, uint256 reserve1);

    constructor() ERC20("SimpleSwap LP", "SSLP") Ownable(msg.sender) {}

    function initialize(address _token0, address _token1) external onlyOwner {
        require(token0 == address(0), "ALREADY_INITIALIZED");
        token0 = _token0;
        token1 = _token1;
        factory = msg.sender;
    }

    function getReserves() public view returns (uint256, uint256, uint256) {
        return (_reserve0, _reserve1, _blockTimestampLast);
    }

    function mint(address to) external returns (uint256 liquidity) {
        uint256 reserve0_ = _reserve0;
        uint256 reserve1_ = _reserve1;
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0_;
        uint256 amount1 = balance1 - reserve1_;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = _min(
                (amount0 * _totalSupply) / reserve0_,
                (amount1 * _totalSupply) / reserve1_
            );
        }
        require(liquidity > 0, "INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, reserve0_, reserve1_);

        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to) external returns (uint256 amount0, uint256 amount1) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);

        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external {
        require(amount0Out > 0 || amount1Out > 0, "INSUFFICIENT_OUTPUT_AMOUNT");
        uint256 reserve0_ = _reserve0;
        uint256 reserve1_ = _reserve1;
        require(amount0Out < reserve0_ && amount1Out < reserve1_, "INSUFFICIENT_LIQUIDITY");

        if (amount0Out > 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0 > reserve0_ - amount0Out ? balance0 - (reserve0_ - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1_ - amount1Out ? balance1 - (reserve1_ - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "INSUFFICIENT_INPUT_AMOUNT");

        uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
        uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
        require(
            balance0Adjusted * balance1Adjusted >= reserve0_ * reserve1_ * 1000000,
            "K"
        );

        _update(balance0, balance1, reserve0_, reserve1_);

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function skim(address to) external {
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - _reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - _reserve1);
    }

    function sync() external {
        _update(
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            _reserve0,
            _reserve1
        );
    }

    function _update(uint256 balance0, uint256 balance1, uint256 reserve0_, uint256 reserve1_) private {
        _reserve0 = balance0;
        _reserve1 = balance1;
        _blockTimestampLast = block.timestamp;
        emit Sync(_reserve0, _reserve1);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
