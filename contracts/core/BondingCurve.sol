// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BondingCurveMath.sol";
import "./BondingCurveToken.sol";
import "../interfaces/IBondingCurve.sol";

struct TI {
    address token;
    address creator;
    uint256 totalSupply;
    uint256 rUsdc;
    uint256 tokensSold;
    string metadataURI;
    bool cTS;
    bool cLS;
    bool cTA;
    bool listed;
    bool graduating;
}

interface IPriceOracle {
    function updateTwapPrice(address t, uint256 p) external;
}

interface IDexLister {
    function listTokenSimple(address token, address creator) external payable;
}

error TF(); error AL(); error ZU(); error ZT(); error ST();
error ICT(); error IR(); error OFD(); error IF_(); error FTF();
error NI(); error GNR(); error GIP(); error NA();

contract BondingCurve is IBondingCurve, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using BondingCurveMath for uint256;

    mapping(address => uint256) public refR;
    mapping(address => TI) public ti;
    address public factory;
    address public launchDao;
    address public dexRouter;
    bool public isXylo;
    address public baseAsset;
    address public feeDist;
    address public burnEng;
    address public priceOracle;
    address payable public dexLister;

    uint256 private constant BPS3 = 300;
    uint256 private constant BPS5 = 500;

    event Created(address indexed token, address indexed creator, string name, string symbol, uint256 totalSupply);
    event Bought(address indexed token, address indexed buyer, address indexed referrer, uint256 usdcIn, uint256 tokensOut, uint256 refReward);
    event Sold(address indexed token, address indexed seller, uint256 tokensIn, uint256 usdcOut);
    event GradTriggered(address indexed token, uint256 totalReserve);
    event RefPaid(address indexed token, address indexed referrer, address indexed buyer, uint256 reward);

    modifier onlyFD() {
        if (msg.sender != factory && msg.sender != launchDao) revert OFD();
        _;
    }

    constructor(address _r, address _f, bool _x, address _b) Ownable(msg.sender) {
        dexRouter = _r; feeDist = _f; isXylo = _x; baseAsset = _b;
    }

    function setFactory(address _f) external onlyOwner { factory = _f; }
    function setLaunchDao(address _d) external onlyOwner { launchDao = _d; }
    function setBuyAndBurnEngine(address _e) external onlyOwner { burnEng = _e; }
    function setPriceOracle(address _o) external onlyOwner { priceOracle = _o; }
    function setFeeDistributor(address _f) external onlyOwner { feeDist = _f; }
    function setDexRouterConfig(address _r, bool _x, address _b) external onlyOwner {
        dexRouter = _r; isXylo = _x; baseAsset = _b;
    }
    function setDexLister(address payable _d) external onlyOwner { dexLister = _d; }

    function createToken(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address creator,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external payable onlyFD nonReentrant returns (address) {
        if (!wantTaxShare && !wantLpShare && !wantTokenAllocation) revert NI();
        if (msg.sender != launchDao) {
            if (msg.value < 0.1 ether) revert IF_();
            (bool ok,) = feeDist.call{value: msg.value}("");
            if (!ok) revert FTF();
        }
        return _create(name, symbol, totalSupply, metadataURI, creator, wantTaxShare, wantLpShare, wantTokenAllocation);
    }

    function createTokenForDao(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address creator,
        uint256 /* voterAllocationBps */,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) external onlyFD nonReentrant returns (address) {
        if (!wantTaxShare && !wantLpShare && !wantTokenAllocation) revert NI();
        return _create(name, symbol, totalSupply, metadataURI, creator, wantTaxShare, wantLpShare, wantTokenAllocation);
    }

    function _create(
        string calldata name,
        string calldata symbol,
        uint256 totalSupply,
        string calldata metadataURI,
        address creator,
        bool wantTaxShare,
        bool wantLpShare,
        bool wantTokenAllocation
    ) internal returns (address) {
        // Bug #2 fix: bondingCurve set in constructor, no external setBondingCurve needed
        BondingCurveToken t = new BondingCurveToken(name, symbol, totalSupply, feeDist, creator, address(this));

        // These still need manual calls since BC owns the config
        if (burnEng != address(0)) t.setBuyAndBurnEngine(burnEng);
        if (dexLister != address(0)) t.setDexLister(dexLister);

        // Mint: 75% to BCT contract (for bonding curve sales), 10% to creator, 10% to BC (perp/burn reserve), 5% to feeDist
        t.mintTo(address(t), totalSupply * 75 / 100);
        t.mintTo(creator, totalSupply * 10 / 100);
        t.mintTo(address(this), totalSupply * 10 / 100);
        t.mintTo(feeDist, totalSupply * 5 / 100);

        TI storage i = ti[address(t)];
        i.token = address(t);
        i.creator = creator;
        i.totalSupply = totalSupply;
        i.metadataURI = metadataURI;
        i.cTS = wantTaxShare;
        i.cLS = wantLpShare;
        i.cTA = wantTokenAllocation;

        emit Created(address(t), creator, name, symbol, totalSupply);

        if (priceOracle != address(0)) IPriceOracle(priceOracle).updateTwapPrice(address(t), 100 gwei);

        return address(t);
    }

    function _buyInternal(address t, uint256 minOut, address recipient, address referrer, uint256 usdcIn) internal {
        TI storage i = ti[t];
        if (i.token == address(0)) revert TF();
        if (i.listed) revert AL();
        if (i.graduating) revert GIP();

        uint256 fee = (usdcIn * BPS3) / 10000;
        uint256 net = usdcIn - fee;
        uint256 tokens = BondingCurveMath.calcBuyAmount(net, i.tokensSold, 100 gwei, 10000);

        if (tokens == 0) revert ZT();
        if (tokens < minOut) revert ST();
        if (BondingCurveToken(t).balanceOf(address(this)) < tokens) revert ICT();

        i.rUsdc += net;
        i.tokensSold += tokens;
        BondingCurveToken(t).buyFromCurve(recipient, tokens);

        // Bug #6 fix: count referral tokens in tokensSold
        uint256 refReward = 0;
        if (referrer != address(0) && referrer != msg.sender && referrer != address(this)) {
            refReward = (net * BPS5) / 10000;
            uint256 refTokens = BondingCurveMath.calcBuyAmount(refReward, i.tokensSold, 100 gwei, 10000);
            if (refTokens > 0 && BondingCurveToken(t).balanceOf(address(this)) >= refTokens) {
                BondingCurveToken(t).buyFromCurve(referrer, refTokens);
                i.tokensSold += refTokens;  // Fix: track referral tokens
                refR[referrer] += refTokens;
                emit RefPaid(t, referrer, recipient, refTokens);
            }
        }

        if (fee > 0) {
            (bool ok,) = feeDist.call{value: fee}("");
            if (!ok) revert FTF();
        }

        emit Bought(t, recipient, referrer, usdcIn, tokens, refReward);
    }

    function buy(address t, uint256 minOut, address recipient, address referrer) external payable override nonReentrant {
        if (msg.value == 0) revert ZU();
        if (recipient == address(0)) recipient = msg.sender;
        _buyInternal(t, minOut, recipient, referrer, msg.value);
    }

    function buy(address t, uint256 minOut, address recipient) external payable override nonReentrant {
        if (msg.value == 0) revert ZU();
        if (recipient == address(0)) recipient = msg.sender;
        _buyInternal(t, minOut, recipient, address(0), msg.value);
    }

    function sell(address t, uint256 tokenAmt, uint256 minOut) external override nonReentrant {
        TI storage i = ti[t];
        if (i.token == address(0)) revert TF();
        if (i.listed) revert AL();
        if (i.graduating) revert GIP();
        if (tokenAmt == 0) revert ZT();

        uint256 usdcOut = BondingCurveMath.calcSellAmount(tokenAmt, i.tokensSold, 100 gwei, 10000);
        if (usdcOut == 0) revert ZT();
        if (usdcOut > i.rUsdc) revert IR();
        if (usdcOut < minOut) revert ST();

        uint256 fee = (usdcOut * BPS3) / 10000;
        uint256 net = usdcOut - fee;

        i.rUsdc -= usdcOut;
        i.tokensSold -= tokenAmt;

        BondingCurveToken(t).sellToCurve(msg.sender, tokenAmt);

        (bool ok,) = msg.sender.call{value: net}("");
        if (!ok) revert FTF();

        if (fee > 0) {
            (bool feeOk,) = feeDist.call{value: fee}("");
            if (!feeOk) revert FTF();
        }

        emit Sold(t, msg.sender, tokenAmt, net);
    }

    // Bug #8 fix: add permission control
    function triggerGraduation(address t) external nonReentrant {
        TI storage i = ti[t];
        if (i.token == address(0)) revert TF();
        if (i.listed) revert AL();
        if (msg.sender != factory && msg.sender != launchDao && msg.sender != i.creator) revert NA();
        i.graduating = true;
        emit GradTriggered(t, i.rUsdc);
    }

    // Bug #4 fix: add permission control (onlyFD or creator)
    function listOnDex(address t) external nonReentrant {
        TI storage i = ti[t];
        if (i.token == address(0)) revert TF();
        if (i.listed) revert AL();
        if (i.rUsdc == 0) revert AL();
        if (msg.sender != factory && msg.sender != launchDao && msg.sender != i.creator) revert NA();

        if (dexLister != address(0)) {
            IERC20(t).approve(dexLister, type(uint256).max);
            IDexLister(dexLister).listTokenSimple{value: i.rUsdc}(t, i.creator);
        }

        // Bug #7 fix: clear rUsdc after sending to DexLister
        i.rUsdc = 0;
        i.listed = true;
    }

    function getBuyPrice(address t, uint256 usdcAmt) external view override returns (uint256) {
        return BondingCurveMath.calcBuyAmount(usdcAmt, ti[t].tokensSold, 100 gwei, 10000);
    }

    function getSellPrice(address t, uint256 tokenAmt) external view override returns (uint256) {
        return BondingCurveMath.calcSellAmount(tokenAmt, ti[t].tokensSold, 100 gwei, 10000);
    }

    function getReserve(address t) external view override returns (uint256) {
        return ti[t].rUsdc;
    }

    function isListed(address t) external view override returns (bool) {
        return ti[t].listed;
    }

    receive() external payable {}
}
