// 保存到 scripts/diagnose-contracts.mjs
// 运行: node scripts/diagnose-contracts.mjs

const RPC_URL = 'https://rpc.testnet.arc.network';

const CONTRACTS = {
  bondingCurve: '0xe38C20F127728823102295C288C2Ac9C1223F37b',
  launchDAO: '0x4aA53a4e95ff30d9395342F8d111858Cf2704AAA',
  dexLister: '0x9E8cE555C8ad970D385E743b92Bf321Cd7053B79',
};

async function ethCall(to, data) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
      id: 1
    })
  });
  const result = await response.json();
  return result;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DogePad 合约快速诊断');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('BondingCurve 函数检查:');
  
  const functions = [
    { sel: '0xfc5465de', name: 'createTokenForDao' },
    { sel: '0xdb61c76e', name: 'buy' },
    { sel: '0x6a272462', name: 'sell' },
    { sel: '0x1f69565f', name: 'getTokenInfo' },
    { sel: '0xf794062e', name: 'isListed' },
    { sel: '0x9c8b1217', name: 'listOnDex' },
  ];
  
  let passed = 0;
  for (const fn of functions) {
    try {
      const result = await ethCall(CONTRACTS.bondingCurve, fn.sel + '0'.repeat(64));
      const ok = !result.error;
      console.log(`  ${fn.name.padEnd(20)} ${ok ? '✓' : '✗'}`);
      if (ok) passed++;
    } catch (e) {
      console.log(`  ${fn.name.padEnd(20)} ✗`);
    }
  }
  
  console.log(`\n通过: ${passed}/${functions.length}`);
  
  console.log('\nLaunchDAO 引用检查:');
  try {
    const bc = await ethCall(CONTRACTS.launchDAO, '0x5d495b7c' + '0'.repeat(64));
    if (bc.result && bc.result !== '0x' + '0'.repeat(64)) {
      console.log(`  bondingCurve: 0x${bc.result.slice(26)}`);
    } else {
      console.log('  bondingCurve: ✗ 未设置');
    }
  } catch (e) {
    console.log('  bondingCurve: ✗');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  if (passed === functions.length) {
    console.log('  ✓ 所有核心功能正常!');
  } else {
    console.log('  ✗ 需要重新部署 BondingCurve 合约');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main();
