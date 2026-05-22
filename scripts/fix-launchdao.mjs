
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const ARC_RPC = 'https://arc-testnet.drpc.org';
const BONDING_CURVE = '0xFc6da38B132b48d8FCe1502C3868d389BeC71cBe';
const LAUNCH_DAO = '0xb5e49D1cF38B3abeE2bA34e3661Da20C1aC506d3';

const ABI = [
  "function setLaunchDao(address _launchDao) external",
  "function launchDao() external view returns (address)"
];

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error('❌ 请先在 .env 文件中设置 DEPLOYER_PRIVATE_KEY');
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(ARC_RPC);
  const wallet = new ethers.Wallet(pk, provider);
  const contract = new ethers.Contract(BONDING_CURVE, ABI, wallet);

  console.log('🔍 当前 launchDao:', await contract.launchDao());
  console.log('📝 正在设置 launchDao 为:', LAUNCH_DAO);

  const tx = await contract.setLaunchDao(LAUNCH_DAO, { gasLimit: 100000 });
  console.log('⏳ 交易已发送:', tx.hash);
  await tx.wait();
  console.log('✅ 成功！');
  console.log('🔍 新 launchDao:', await contract.launchDao());
}

main().catch(console.error);
