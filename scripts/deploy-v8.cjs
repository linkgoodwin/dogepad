/**
 * deploy-v8.cjs
 * 部署 BondingCurve v8 + Factory v2 + DexLister v2 + LaunchDAO v2
 * 
 * 修复内容：
 * - P0: createTokenForDao 函数实现 (BondingCurve)
 * - P0: excludeFromTax/HoldingLimit 权限修复 (BCT)
 * - P1: listOnDex 真正调用 DexLister 添加流动性
 * - P1: 移除 try/catch 静默错误处理 (LaunchDAO)
 * - P2: launchHour=0, maxLaunchsPerDay=3
 * - 精简: 移除 presale 代码, 移除未使用视图函数, 简化分发逻辑
 */
const path = require('path');
const fs = require('fs');
const solc = require(path.join(process.cwd(), 'node_modules', 'solc'));

// Load env
['.env', '.env.local'].forEach(file => {
  const p = path.resolve(__dirname, '../' + file);
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

const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// 现有合约地址（不变的）
const DEX_ROUTER = process.env.VITE_ARC_TESTNET_SIMPLE_ROUTER_ADDRESS || '0x5D503fBc1476658f28B8f991A035167C5Ad29FCB';
const FEE_DISTRIBUTOR = process.env.VITE_ARC_TESTNET_FEE_DISTRIBUTOR_ADDRESS || '0x07A35B574987c5E9a0eE64eA3Bb0dD522041a288';
const BASE_ASSET = process.env.VITE_ARC_TESTNET_CREATOR_REWARD_MANAGER_ADDRESS || '0x67C4Edb80dF88dd707Cf72e5aB18A6805D8230fD';
const PRICE_ORACLE = process.env.VITE_ARC_TESTNET_PRICE_ORACLE_ADDRESS || '0xA5c5B084ebfF62fc4F61B3370Ab28eA28D967346';
const BUY_AND_BURN = process.env.VITE_ARC_TESTNET_BUY_AND_BURN_ADDRESS || '0x2f2b93878817940e4F064E86cc7bA52500299a2c';

// 旧合约地址（将被替换）
const OLD_BC = '0xB6ee95cA25dF7BfD3CB96c7A3ea103aB783f2FC2';
const OLD_DAO = '0x7b4AEda3229a41d859C59275E17Ef2D5E7144f33';
const OLD_DEX_LISTER = '0x026D1A2c92000754EA7Aa938046d62F32127AddB';
const OLD_FACTORY = '0x03baA5aC876d3AFBc325c13E8b178e0498091389';

// ========== 编译合约 ==========
function compileContracts() {
  console.log('Compiling contracts with solc 0.8.24...');
  
  const projectRoot = path.resolve(__dirname, '..');
  
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
    let hasErrors = false;
    for (const error of output.errors) {
      if (error.severity === 'error') {
        console.error('[ERROR]', error.formattedMessage);
        hasErrors = true;
      }
    }
    if (hasErrors) {
      console.error('❌ Compilation failed');
      process.exit(1);
    }
  }
  
  console.log('✅ Compilation successful');
  
  // Check contract sizes
  const SIZE_LIMIT = 24576;
  for (const file in output.contracts) {
    for (const contract in output.contracts[file]) {
      const bytecode = output.contracts[file][contract].evm.bytecode.object;
      const size = (bytecode.length - 2) / 2;
      if (size > SIZE_LIMIT) {
        console.error(`❌ ${contract} exceeds size limit: ${size} > ${SIZE_LIMIT}`);
        process.exit(1);
      }
    }
  }
  
  // Extract artifacts
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

async function main() {
  if (!PRIVATE_KEY) {
    console.error('❌ No DEPLOYER_PRIVATE_KEY found');
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const gasPrice = ethers.utils.parseUnits('25', 'gwei');

  console.log('========================================');
  console.log('  DogePad v8 部署 — 修复认购+交易逻辑');
  console.log('  基于 Musk + Alon Cohen + Jeremy Allaire');
  console.log('========================================');
  console.log('Deployer:', wallet.address);
  console.log('Network: Arc Testnet (5042002)');
  console.log('');

  // Check deployer balance
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.utils.formatEther(balance), 'USDC\n');

  // ========== 编译 ==========
  const artifacts = compileContracts();
  console.log(`Compiled ${Object.keys(artifacts).length} contracts\n`);

  // ========== Step 1: 部署 BondingCurve v8 ==========
  console.log('=== Step 1: 部署 BondingCurve v8 ===');
  const bcFactory = new ethers.ContractFactory(
    artifacts.BondingCurve.abi, 
    artifacts.BondingCurve.bytecode, 
    wallet
  );
  const bc = await bcFactory.deploy(DEX_ROUTER, FEE_DISTRIBUTOR, true, BASE_ASSET, {
    gasLimit: 25_000_000, gasPrice, type: 0
  });
  console.log('TX:', bc.deployTransaction.hash);
  await bc.deployTransaction.wait();
  const bcAddr = bc.address;
  console.log('✅ BondingCurve v8:', bcAddr);

  // ========== Step 2: 部署 Factory v2 ==========
  console.log('\n=== Step 2: 部署 Factory v2 ===');
  const fFactory = new ethers.ContractFactory(
    artifacts.BondingCurveFactory.abi,
    artifacts.BondingCurveFactory.bytecode,
    wallet
  );
  const factory = await fFactory.deploy(bcAddr, {
    gasLimit: 5_000_000, gasPrice, type: 0
  });
  console.log('TX:', factory.deployTransaction.hash);
  await factory.deployTransaction.wait();
  const factoryAddr = factory.address;
  console.log('✅ Factory v2:', factoryAddr);

  // ========== Step 3: 部署 DexLister v2 ==========
  console.log('\n=== Step 3: 部署 DexLister v2 ===');
  const dlFactory = new ethers.ContractFactory(
    artifacts.DexLister.abi,
    artifacts.DexLister.bytecode,
    wallet
  );
  const dl = await dlFactory.deploy(DEX_ROUTER, FEE_DISTRIBUTOR, true, BASE_ASSET, {
    gasLimit: 10_000_000, gasPrice, type: 0
  });
  console.log('TX:', dl.deployTransaction.hash);
  await dl.deployTransaction.wait();
  const dlAddr = dl.address;
  console.log('✅ DexLister v2:', dlAddr);

  // ========== Step 4: 部署 LaunchDAO v2 ==========
  console.log('\n=== Step 4: 部署 LaunchDAO v2 ===');
  const daoFactory = new ethers.ContractFactory(
    artifacts.LaunchDAO.abi,
    artifacts.LaunchDAO.bytecode,
    wallet
  );
  const dao = await daoFactory.deploy(bcAddr, FEE_DISTRIBUTOR, {
    gasLimit: 20_000_000, gasPrice, type: 0
  });
  console.log('TX:', dao.deployTransaction.hash);
  await dao.deployTransaction.wait();
  const daoAddr = dao.address;
  console.log('✅ LaunchDAO v2:', daoAddr);

  // ========== Step 5: 配置 BondingCurve ==========
  console.log('\n=== Step 5: 配置 BondingCurve v8 ===');
  console.log('Setting factory...');
  await (await bc.setFactory(factoryAddr, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ factory =', factoryAddr);

  console.log('Setting launchDao...');
  await (await bc.setLaunchDao(daoAddr, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ launchDao =', daoAddr);

  console.log('Setting dexLister...');
  await (await bc.setDexLister(dlAddr, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ dexLister =', dlAddr);

  console.log('Setting priceOracle...');
  await (await bc.setPriceOracle(PRICE_ORACLE, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ priceOracle =', PRICE_ORACLE);

  console.log('Setting buyAndBurnEngine...');
  await (await bc.setBuyAndBurnEngine(BUY_AND_BURN, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ burnEng =', BUY_AND_BURN);

  // ========== Step 6: 配置 DexLister ==========
  console.log('\n=== Step 6: 配置 DexLister v2 ===');
  console.log('Setting bondingCurve...');
  await (await dl.setBondingCurve(bcAddr, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ bondingCurve =', bcAddr);

  // ========== Step 7: 授权 PriceOracle ==========
  console.log('\n=== Step 7: 授权 PriceOracle ===');
  const oracle = new ethers.Contract(PRICE_ORACLE, artifacts.PriceOracle.abi, wallet);
  console.log('Authorizing BC v8 on PriceOracle...');
  await (await oracle.setAuthorizedUpdater(bcAddr, true, { gasLimit: 100000, gasPrice, type: 0 })).wait();
  console.log('✅ BC v8 authorized on PriceOracle');

  // ========== Step 8: 验证链上状态 ==========
  console.log('\n=== Step 8: 验证链上状态 ===');
  const [bcFactory_, bcLaunchDao, bcDexLister, bcOracle] = await Promise.all([
    bc.factory(), bc.launchDao(), bc.dexLister(), bc.priceOracle()
  ]);
  console.log('BondingCurve v8:');
  console.log('  factory:  ', bcFactory_);
  console.log('  launchDao:', bcLaunchDao);
  console.log('  dexLister:', bcDexLister);
  console.log('  oracle:   ', bcOracle);

  const [daoBC, daoCandidateCount, daoMaxLaunch, daoLaunchHour] = await Promise.all([
    dao.bondingCurve(), dao.getCandidateCount(), dao.maxLaunchsPerDay(), dao.launchHour()
  ]);
  console.log('LaunchDAO v2:');
  console.log('  bondingCurve:  ', daoBC);
  console.log('  candidateCount:', daoCandidateCount.toString());
  console.log('  maxLaunchsPerDay:', daoMaxLaunch.toString());
  console.log('  launchHour:', daoLaunchHour.toString());

  const dlBC = await dl.bondingCurve();
  console.log('DexLister v2:');
  console.log('  bondingCurve:', dlBC);

  // 关键验证
  console.log('\n=== 关键验证 ===');
  console.log('BC.launchDao == DAO:', bcLaunchDao.toLowerCase() === daoAddr.toLowerCase() ? '✅' : '❌');
  console.log('DAO.bondingCurve == BC:', daoBC.toLowerCase() === bcAddr.toLowerCase() ? '✅' : '❌');
  console.log('BC.dexLister == DL:', bcDexLister.toLowerCase() === dlAddr.toLowerCase() ? '✅' : '❌');
  console.log('DL.bondingCurve == BC:', dlBC.toLowerCase() === bcAddr.toLowerCase() ? '✅' : '❌');
  console.log('BC.factory == Factory:', bcFactory_.toLowerCase() === factoryAddr.toLowerCase() ? '✅' : '❌');
  console.log('maxLaunchsPerDay == 3:', daoMaxLaunch.toString() === '3' ? '✅' : '❌');
  console.log('launchHour == 0:', daoLaunchHour.toString() === '0' ? '✅' : '❌');
  console.log('candidateCount == 0:', daoCandidateCount.toString() === '0' ? '✅ (无旧数据!)' : '❌ (有旧数据!)');

  // ========== Step 9: 更新 .env ==========
  console.log('\n=== Step 9: 更新 .env ===');
  const envPath = path.resolve(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(
    /VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=.*/,
    `VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=${bcAddr}`
  );
  envContent = envContent.replace(
    /VITE_ARC_TESTNET_FACTORY_ADDRESS=.*/,
    `VITE_ARC_TESTNET_FACTORY_ADDRESS=${factoryAddr}`
  );
  envContent = envContent.replace(
    /VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=.*/,
    `VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${daoAddr}`
  );
  envContent = envContent.replace(
    /VITE_ARC_TESTNET_DEX_LISTER_ADDRESS=.*/,
    `VITE_ARC_TESTNET_DEX_LISTER_ADDRESS=${dlAddr}`
  );
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env updated');

  // ========== Step 10: 更新 .env.example ==========
  console.log('\n=== Step 10: 更新 .env.example ===');
  const envExamplePath = path.resolve(__dirname, '../.env.example');
  if (fs.existsSync(envExamplePath)) {
    let envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    envExampleContent = envExampleContent.replace(
      /VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=.*/,
      `VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=${bcAddr}`
    );
    envExampleContent = envExampleContent.replace(
      /VITE_ARC_TESTNET_FACTORY_ADDRESS=.*/,
      `VITE_ARC_TESTNET_FACTORY_ADDRESS=${factoryAddr}`
    );
    envExampleContent = envExampleContent.replace(
      /VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=.*/,
      `VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${daoAddr}`
    );
    envExampleContent = envExampleContent.replace(
      /VITE_ARC_TESTNET_DEX_LISTER_ADDRESS=.*/,
      `VITE_ARC_TESTNET_DEX_LISTER_ADDRESS=${dlAddr}`
    );
    fs.writeFileSync(envExamplePath, envExampleContent);
    console.log('✅ .env.example updated');
  }

  // ========== 总结 ==========
  console.log('\n========================================');
  console.log('  v8 部署完成!');
  console.log('========================================');
  console.log('BondingCurve v8:', bcAddr);
  console.log('Factory v2:    ', factoryAddr);
  console.log('DexLister v2:  ', dlAddr);
  console.log('LaunchDAO v2:  ', daoAddr);
  console.log('');
  console.log('旧合约已废弃:');
  console.log('  旧 BC v7:    ', OLD_BC);
  console.log('  旧 Factory:  ', OLD_FACTORY);
  console.log('  旧 DAO:      ', OLD_DAO);
  console.log('  旧 DexLister:', OLD_DEX_LISTER);
  console.log('');
  console.log('修复内容:');
  console.log('  ✅ P0: createTokenForDao 已实现');
  console.log('  ✅ P0: BCT 权限修复 (owner 可调用 setSkipHoldingLimit)');
  console.log('  ✅ P1: listOnDex 真正调用 DexLister');
  console.log('  ✅ P1: 移除 try/catch 静默错误');
  console.log('  ✅ P2: launchHour=0, maxLaunchsPerDay=3');
  console.log('  ✅ 精简: 移除 presale 代码, 合约 < 24576 字节');
  console.log('');
  console.log('下一步:');
  console.log('  1. 更新 GitHub Secrets:');
  console.log(`     VITE_ARC_TESTNET_BONDING_CURVE_ADDRESS=${bcAddr}`);
  console.log(`     VITE_ARC_TESTNET_FACTORY_ADDRESS=${factoryAddr}`);
  console.log(`     VITE_ARC_TESTNET_LAUNCH_DAO_ADDRESS=${daoAddr}`);
  console.log(`     VITE_ARC_TESTNET_DEX_LISTER_ADDRESS=${dlAddr}`);
  console.log('  2. git add + commit + push');
  console.log('  3. 在 dogepad.pro 测试认购流程');
}

main().catch(err => {
  console.error('部署失败:', err);
  process.exit(1);
});
