/**
 * deploy-v9.cjs
 * 部署 BondingCurve v9 + Factory v3 + DexLister v3 + LaunchDAO v3
 * 修复全部 12 个 Bug + LAUNCH_THRESHOLD 可配置
 */
const path = require('path');
const fs = require('fs');

// Load env
['.env', '.env.local'].forEach(file => {
  const p = path.resolve(__dirname, file);
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const t = line.trim();
      if (t && !t.startsWith('#')) {
        const idx = t.indexOf('=');
        if (idx > 0) {
          const k = t.substring(0, idx);
          const v = t.substring(idx + 1);
          if (k && !process.env[k]) process.env[k] = v;
        }
      }
    });
  }
});

const { ethers } = require('ethers');
const solc = require(path.join(__dirname, 'node_modules', 'solc'));

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Bug #1 fix: baseAsset 必须是 WUSDC 而非 CreatorRewardManager
const DEX_ROUTER = process.env.VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS || '0x5D503fBc1476658f28B8f991A035167C5Ad29FCB';
const FEE_DISTRIBUTOR = process.env.VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS || '0x07A35B574987c5E9a0eE64eA3Bb0dD522041a288';
const WUSDC = process.env.VITE_ARC_TESTNET_WUSDC_ADDRESS || '0x911b4000D3422F482F4062a913885f7b035382Df';
const PRICE_ORACLE = process.env.VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS || '0xA5c5B084ebfF62fc4F61B3370Ab28eA28D967346';
const BUY_AND_BURN = process.env.VITE_ARC_TESTNET_BUY_AND_BURN_ADDRESS || '0x2f2b93878817940e4F064E86cc7bA52500299a2c';

function compile() {
  const projectRoot = __dirname;
  function findSolFiles(dir, files = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'cache' || entry.name === 'artifacts') continue;
        findSolFiles(fullPath, files);
      } else if (entry.name.endsWith('.sol')) {
        files.push(fullPath);
      }
    }
    return files;
  }
  const solFiles = findSolFiles(path.join(projectRoot, 'contracts'));
  const sources = {};
  for (const file of solFiles) {
    const relativePath = path.relative(projectRoot, file).replace(/\\/g, '/');
    sources[relativePath] = { content: fs.readFileSync(file, 'utf8') };
  }
  function findImports(importPath) {
    const tries = [
      path.join(projectRoot, 'node_modules', importPath),
      path.join(projectRoot, 'contracts', importPath.replace(/^\.\.\//, '')),
      path.join(projectRoot, importPath),
    ];
    for (const p of tries) {
      if (fs.existsSync(p)) return { contents: fs.readFileSync(p, 'utf8') };
    }
    return { error: 'File not found: ' + importPath };
  }
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 1 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors) {
    for (const error of output.errors) {
      if (error.severity === 'error') {
        console.error('[ERROR]', error.formattedMessage);
        process.exit(1);
      }
    }
  }
  const artifacts = {};
  for (const file in output.contracts) {
    for (const contract in output.contracts[file]) {
      artifacts[contract] = {
        abi: output.contracts[file][contract].abi,
        bytecode: '0x' + output.contracts[file][contract].evm.bytecode.object
      };
    }
  }
  return artifacts;
}

async function deployContract(wallet, provider, artifacts, name, args, gasLimit) {
  const factory = new ethers.ContractFactory(artifacts[name].abi, artifacts[name].bytecode, wallet);
  const nonce = await provider.getTransactionCount(wallet.address);
  const gasPrice = ethers.utils.parseUnits('50', 'gwei');
  const unsignedTx = await factory.getDeployTransaction(...args);
  unsignedTx.gasLimit = gasLimit;
  unsignedTx.gasPrice = gasPrice;
  unsignedTx.type = 0;
  unsignedTx.nonce = nonce;
  const signedTx = await wallet.signTransaction(unsignedTx);
  const txHash = await provider.send('eth_sendRawTransaction', [signedTx]);
  console.log(`  TX: ${txHash}`);
  const receipt = await provider.waitForTransaction(txHash, 1, 120000);
  if (receipt.status === 1) {
    console.log(`  ✅ ${name} deployed at: ${receipt.contractAddress} (gas: ${receipt.gasUsed.toString()})`);
    return receipt.contractAddress;
  } else {
    throw new Error(`${name} deployment failed (gas: ${receipt.gasUsed.toString()})`);
  }
}

async function sendTx(wallet, provider, to, data, gasLimit) {
  const nonce = await provider.getTransactionCount(wallet.address);
  const gasPrice = ethers.utils.parseUnits('50', 'gwei');
  const tx = { from: wallet.address, to, data, gasLimit, gasPrice, type: 0, nonce };
  const signedTx = await wallet.signTransaction(tx);
  const txHash = await provider.send('eth_sendRawTransaction', [signedTx]);
  const receipt = await provider.waitForTransaction(txHash, 1, 120000);
  return receipt;
}

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log('========================================');
  console.log('  DogePad v9 — 全 Bug 修复 + 可配置阈值');
  console.log('========================================');
  console.log('Deployer:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.utils.formatEther(balance), 'USDC');
  console.log('WUSDC (baseAsset):', WUSDC);
  console.log('');

  console.log('Compiling...');
  const artifacts = compile();
  console.log('Compiled.\n');

  // Step 1: BondingCurve v9 — baseAsset = WUSDC (Bug #1 fix)
  console.log('=== Step 1: BondingCurve v9 (baseAsset=WUSDC) ===');
  const bcAddr = await deployContract(wallet, provider, artifacts, 'BondingCurve',
    [DEX_ROUTER, FEE_DISTRIBUTOR, true, WUSDC], 15_000_000);

  // Step 2: Factory v3
  console.log('\n=== Step 2: Factory v3 ===');
  const factoryAddr = await deployContract(wallet, provider, artifacts, 'BondingCurveFactory',
    [bcAddr], 5_000_000);

  // Step 3: DexLister v3 — baseAsset = WUSDC
  console.log('\n=== Step 3: DexLister v3 (baseAsset=WUSDC) ===');
  const dlAddr = await deployContract(wallet, provider, artifacts, 'DexLister',
    [DEX_ROUTER, FEE_DISTRIBUTOR, true, WUSDC], 10_000_000);

  // Step 4: LaunchDAO v3
  console.log('\n=== Step 4: LaunchDAO v3 ===');
  const daoAddr = await deployContract(wallet, provider, artifacts, 'LaunchDAO',
    [bcAddr, FEE_DISTRIBUTOR], 15_000_000);

  // Step 5: 配置 BondingCurve
  console.log('\n=== Step 5: 配置 BondingCurve v9 ===');
  const bc = new ethers.Contract(bcAddr, artifacts.BondingCurve.abi, wallet);
  let r;
  r = await sendTx(wallet, provider, bcAddr, bc.interface.encodeFunctionData('setFactory', [factoryAddr]), 200000);
  console.log('  factory:', factoryAddr, r.status === 1 ? '✓' : '❌');
  r = await sendTx(wallet, provider, bcAddr, bc.interface.encodeFunctionData('setLaunchDao', [daoAddr]), 200000);
  console.log('  launchDao:', daoAddr, r.status === 1 ? '✓' : '❌');
  r = await sendTx(wallet, provider, bcAddr, bc.interface.encodeFunctionData('setDexLister', [dlAddr]), 200000);
  console.log('  dexLister:', dlAddr, r.status === 1 ? '✓' : '❌');
  r = await sendTx(wallet, provider, bcAddr, bc.interface.encodeFunctionData('setPriceOracle', [PRICE_ORACLE]), 200000);
  console.log('  priceOracle:', PRICE_ORACLE, r.status === 1 ? '✓' : '❌');
  r = await sendTx(wallet, provider, bcAddr, bc.interface.encodeFunctionData('setBuyAndBurnEngine', [BUY_AND_BURN]), 200000);
  console.log('  burnEng:', BUY_AND_BURN, r.status === 1 ? '✓' : '❌');

  // Step 6: 配置 DexLister
  console.log('\n=== Step 6: 配置 DexLister v3 ===');
  const dl = new ethers.Contract(dlAddr, artifacts.DexLister.abi, wallet);
  r = await sendTx(wallet, provider, dlAddr, dl.interface.encodeFunctionData('setBondingCurve', [bcAddr]), 200000);
  console.log('  bondingCurve:', bcAddr, r.status === 1 ? '✓' : '❌');

  // Step 7: 授权 PriceOracle
  console.log('\n=== Step 7: 授权 PriceOracle ===');
  const oracle = new ethers.Contract(PRICE_ORACLE, artifacts.PriceOracle.abi, wallet);
  r = await sendTx(wallet, provider, PRICE_ORACLE, oracle.interface.encodeFunctionData('setAuthorizedUpdater', [bcAddr, true]), 200000);
  console.log('  BC v9 authorized:', r.status === 1 ? '✓' : '❌');

  // Step 8: 验证
  console.log('\n=== Step 8: 链上验证 ===');
  const [bcFactory, bcDao, bcDl, bcOracle, bcBaseAsset] = await Promise.all([
    bc.factory(), bc.launchDao(), bc.dexLister(), bc.priceOracle(), bc.baseAsset()
  ]);
  console.log('BondingCurve v9:');
  console.log('  factory:  ', bcFactory);
  console.log('  launchDao:', bcDao);
  console.log('  dexLister:', bcDl);
  console.log('  oracle:   ', bcOracle);
  console.log('  baseAsset:', bcBaseAsset, bcBaseAsset.toLowerCase() === WUSDC.toLowerCase() ? '✅ WUSDC' : '❌ WRONG!');

  const dao = new ethers.Contract(daoAddr, artifacts.LaunchDAO.abi, wallet);
  const [daoBC, daoMaxLaunch, daoLaunchHour, daoThreshold] = await Promise.all([
    dao.bondingCurve(), dao.maxLaunchsPerDay(), dao.launchHour(), dao.launchThreshold()
  ]);
  console.log('LaunchDAO v3:');
  console.log('  bondingCurve:  ', daoBC);
  console.log('  maxLaunchsPerDay:', daoMaxLaunch.toString());
  console.log('  launchHour:', daoLaunchHour.toString());
  console.log('  launchThreshold:', ethers.utils.formatEther(daoThreshold), 'USDC');

  console.log('\n=== 关键验证 ===');
  const checks = [
    ['BC.launchDao == DAO', bcDao.toLowerCase() === daoAddr.toLowerCase()],
    ['DAO.bondingCurve == BC', daoBC.toLowerCase() === bcAddr.toLowerCase()],
    ['BC.dexLister == DL', bcDl.toLowerCase() === dlAddr.toLowerCase()],
    ['BC.baseAsset == WUSDC', bcBaseAsset.toLowerCase() === WUSDC.toLowerCase()],
    ['maxLaunchsPerDay == 3', daoMaxLaunch.toString() === '3'],
    ['launchHour == 0', daoLaunchHour.toString() === '0'],
    ['launchThreshold == 20 USDC', daoThreshold.toString() === ethers.utils.parseEther('20').toString()],
  ];
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  }

  // Step 9: 更新 .env
  console.log('\n=== Step 9: 更新 .env ===');
  const envPath = path.resolve(__dirname, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  const replacements = {
    'VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS': bcAddr,
    'VITE_ARC_TESTNET_FACTORY_ADDRESS': factoryAddr,
    'VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS': daoAddr,
    'VITE_ARC_TESTNET_DEX_LISTER_ADDRESS': dlAddr,
  };
  for (const [key, value] of Object.entries(replacements)) {
    envContent = envContent.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
  }
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env updated');

  // Step 10: 更新 .env.example
  const envExamplePath = path.resolve(__dirname, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    let envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    for (const [key, value] of Object.entries(replacements)) {
      envExampleContent = envExampleContent.replace(new RegExp(`${key}=.*`), `${key}=${value}`);
    }
    fs.writeFileSync(envExamplePath, envExampleContent);
    console.log('✅ .env.example updated');
  }

  // Step 11: 更新 contracts.ts fallback
  const contractsTsPath = path.resolve(__dirname, 'src/config/contracts.ts');
  let contractsTs = fs.readFileSync(contractsTsPath, 'utf8');
  contractsTs = contractsTs.replace(/0x7a477Ef4F24e32ad4C23e281f7a4Fec1a8C28c0A/g, bcAddr);
  contractsTs = contractsTs.replace(/0xeCD121c970f9Af17f25FC4a3C7D0aB27965fDfa9/g, factoryAddr);
  contractsTs = contractsTs.replace(/0xB4Fd7143C1ce3Cc526306CE1295F2E56CBB51E89/g, daoAddr);
  contractsTs = contractsTs.replace(/0x94F7490317935560364Ab5c3Be344c786468F4AE/g, dlAddr);
  fs.writeFileSync(contractsTsPath, contractsTs);
  console.log('✅ contracts.ts fallback updated');

  console.log('\n========================================');
  console.log('  v9 部署完成!');
  console.log('========================================');
  console.log('BondingCurve v9:', bcAddr);
  console.log('Factory v3:     ', factoryAddr);
  console.log('DexLister v3:   ', dlAddr);
  console.log('LaunchDAO v3:   ', daoAddr);
  console.log('\nBug 修复清单:');
  console.log('  ✅ #1  baseAsset=WUSDC (DEX 上币修复)');
  console.log('  ✅ #2  BCT setBondingCurve onlyOwner+一次性');
  console.log('  ✅ #3  前端 ABI 清理 (5个废弃函数)');
  console.log('  ✅ #4  listOnDex 权限控制');
  console.log('  ✅ #5  Factory 传入真实 creator');
  console.log('  ✅ #6  推荐奖励计入 tokensSold');
  console.log('  ✅ #7  rUsdc 上币后清零');
  console.log('  ✅ #8  triggerGraduation 权限控制');
  console.log('  ✅ #9  BCT 删除 presale 死代码');
  console.log('  ✅ #10 createTokenForDao creator 参数');
  console.log('  ✅ #11 BCT 错误消息修正');
  console.log('  ✅ #12 .env 添加 WUSDC 地址');
  console.log('\n新功能:');
  console.log('  ✅ launchThreshold 可配置 (当前 20U, 可切换 20000U)');
  console.log('     切换命令: dao.setLaunchThreshold(ethers.utils.parseEther("20000"))');
  console.log('\n下一步:');
  console.log('  1. 更新 GitHub Secrets (4个地址)');
  console.log('  2. git add + commit + push');
}

main().catch(err => {
  console.error('部署失败:', err.message?.substring(0, 500));
  process.exit(1);
});
