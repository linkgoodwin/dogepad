# FairForge 服务器部署完整指南

## 一、VPS 配置要求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 存储 | 40 GB SSD | 100 GB SSD |
| 带宽 | 10 Mbps | 50 Mbps |
| 系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> 推荐服务商: Contabo / Hetzner / Vultr / AWS Lightsail
> 4C8G 大约 $20-40/月

---

## 二、系统初始化（从零开始）

### 2.1 SSH 登录服务器

```bash
# 本地终端登录（替换为你的服务器IP）
ssh root@你的服务器IP
```

### 2.2 更新系统

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.3 安装基础工具

```bash
sudo apt install -y curl git wget ufw nginx certbot python3-certbot-nginx build-essential
```

### 2.4 配置防火墙

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
sudo ufw status
```

### 2.5 创建部署用户

```bash
sudo adduser deploy
# 设置密码，其余直接回车

sudo usermod -aG sudo deploy
sudo usermod -aG www-data deploy

# 切换到部署用户
su - deploy
```

### 2.6 安装 Node.js 22.x

```bash
# 方法1: 使用 NodeSource 仓库（推荐）
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # 应该显示 v22.x.x
npm -v    # 应该显示 10.x.x

# 安装 pnpm
sudo npm install -g pnpm
```

### 2.7 安装 Docker（可选，用于 The Graph 索引）

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy

# 退出重新登录使 docker 组生效
exit
ssh deploy@你的服务器IP

# 验证
docker --version
```

---

## 三、项目部署

### 3.1 上传项目到服务器

**方法A: Git 克隆（推荐）**

```bash
cd /home/deploy
git clone <你的仓库地址> fairforge
cd fairforge
```

**方法B: SCP 上传（如果没有 Git 仓库）**

```bash
# 在本地电脑执行（Windows PowerShell）
# 先打包项目
cd G:\lanchpad
Compress-Archive -Path * -DestinationPath fairforge.zip

# 上传到服务器
scp fairforge.zip deploy@你的服务器IP:/home/deploy/

# SSH 到服务器解压
ssh deploy@你的服务器IP
cd /home/deploy
unzip fairforge.zip -d fairforge
cd fairforge
```

### 3.2 安装依赖

```bash
cd /home/deploy/fairforge
pnpm install
```

### 3.3 配置环境变量

```bash
# 创建前端环境变量文件
cat > .env.production << 'EOF'
# WalletConnect 项目ID (去 https://cloud.walletconnect.com/ 免费注册)
VITE_WALLETCONNECT_PROJECT_ID=你的WalletConnect项目ID

# BSC RPC 节点
VITE_BSC_RPC_URL=https://bsc-dataseed1.binance.org/

# 链ID (56=主网, 97=测试网)
VITE_CHAIN_ID=56

# 合约地址（部署后填入）
VITE_BONDING_CURVE_ADDRESS=
VITE_FACTORY_ADDRESS=
VITE_LONG_POOL_ADDRESS=
VITE_SHORT_POOL_ADDRESS=
VITE_BUY_AND_BURN_ADDRESS=
VITE_LAUNCH_DAO_ADDRESS=
VITE_PRICE_ORACLE_ADDRESS=
EOF
```

### 3.4 构建前端

```bash
pnpm build
# 产物在 dist/ 目录
```

---

## 四、Nginx 配置

### 4.1 复制前端文件

```bash
sudo mkdir -p /var/www/fairforge
sudo cp -r /home/deploy/fairforge/dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge
```

### 4.2 创建 Nginx 配置

```bash
sudo tee /etc/nginx/sites-available/fairforge << 'EOF'
server {
    listen 80;
    server_name 你的域名.com www.你的域名.com;

    root /var/www/fairforge;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/javascript
        application/javascript
        application/json
        application/xml
        image/svg+xml;

    # SPA 路由 - 所有路径返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存（JS/CSS 带hash，可长期缓存）
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # HTML 不缓存（确保更新及时）
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # 禁止访问隐藏文件
    location ~ /\. {
        deny all;
    }
}
EOF
```

### 4.3 启用站点

```bash
sudo ln -sf /etc/nginx/sites-available/fairforge /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### 4.4 域名解析

在你的域名服务商（Cloudflare / 阿里云 / 腾讯云等）添加 DNS 记录：

```
类型: A
主机记录: @
记录值: 你的服务器IP

类型: A
主机记录: www
记录值: 你的服务器IP
```

等待 DNS 生效（通常 1-10 分钟），然后访问 http://你的域名.com 确认能看到页面。

---

## 五、SSL 证书（HTTPS）

```bash
# 使用 Let's Encrypt 免费证书
sudo certbot --nginx -d 你的域名.com -d www.你的域名.com

# 按提示操作:
# 1. 输入邮箱（用于证书过期提醒）
# 2. 同意服务条款
# 3. 选择是否重定向 HTTP → HTTPS（选是）

# 验证自动续期
sudo certbot renew --dry-run

# certbot 会自动添加定时任务，证书到期前自动续期
```

完成后访问 https://你的域名.com 确认HTTPS正常。

---

## 六、智能合约部署

### 6.1 配置 Hardhat 环境变量

```bash
cd /home/deploy/fairforge

# 创建 .env 文件（⚠️ 绝对不要提交到 Git！）
cat > .env << 'EOF'
# 部署钱包私钥（⚠️ 保密！不要泄露！）
DEPLOYER_PRIVATE_KEY=你的私钥

# BscScan API Key（用于验证合约，去 https://bscscan.com/myapikey 免费注册）
BSCSCAN_API_KEY=你的BscScan_API_Key
EOF

# 保护 .env 文件
chmod 600 .env
```

### 6.2 安装 Hardhat 依赖

```bash
cd /home/deploy/fairforge
pnpm add -D hardhat @nomicfoundation/hardhat-toolbox
pnpm add @openzeppelin/contracts prb-math
pnpm add dotenv
```

### 6.3 确认 hardhat.config.ts 配置

确保 `hardhat.config.ts` 中有以下内容：

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
      gasPrice: 20000000000,
    },
    bscMainnet: {
      url: "https://bsc-dataseed1.binance.org",
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
      gasPrice: 3000000000,
    },
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY,
  },
};

export default config;
```

### 6.4 先部署到 BSC 测试网

```bash
# 获取测试网 BNB（从水龙头）
# 访问 https://testnet.binance.org/faucet-smart
# 或 https://testnet.bnbchain.org/faucet-smart
# 粘贴你的部署钱包地址，获取测试BNB

# 编译合约
npx hardhat compile

# 部署到测试网
npx hardhat run scripts/deploy.ts --network bscTestnet

# 记录输出的合约地址！
```

部署成功后会输出类似：

```
PriceOracle: 0x...
ExponentialRateModel: 0x...
LinearRateModel: 0x...
BondingCurve: 0x...
BondingCurveFactory: 0x...
LongPool: 0x...
ShortPool: 0x...
BuyAndBurnEngine: 0x...
LaunchDAO: 0x...
```

### 6.5 验证合约（BscScan）

```bash
# 逐个验证（替换为实际地址和参数）
npx hardhat verify --network bscTestnet <PriceOracle地址>

npx hardhat verify --network bscTestnet <ExponentialRateModel地址>

npx hardhat verify --network bscTestnet <BondingCurve地址> "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" "<feeDistributor地址>"

npx hardhat verify --network bscTestnet <LongPool地址> "<linearRateModel地址>" "<priceOracle地址>"

npx hardhat verify --network bscTestnet <ShortPool地址> "<expRateModel地址>" "<priceOracle地址>" "<burnEngine地址>" "<longPool地址>" "<feeDistributor地址>"

npx hardhat verify --network bscTestnet <BuyAndBurnEngine地址> "0xD99D1c33F9fC3444f8101754aBC46c52416550D1" "<keeper地址>"

npx hardhat verify --network bscTestnet <LaunchDAO地址> "<bondingCurve地址>" "<feeDistributor地址>"
```

### 6.6 测试网充分测试后，部署到主网

```bash
# ⚠️ 确保部署钱包有足够的 BNB（约 0.5-1 BNB gas费）

# 部署到主网
npx hardhat run scripts/deploy.ts --network bscMainnet

# 验证主网合约
npx hardhat verify --network bscMainnet <合约地址> <构造函数参数>
```

### 6.7 更新前端合约地址

```bash
# 编辑 .env.production，填入主网合约地址
nano /home/deploy/fairforge/.env.production

# 重新构建前端
cd /home/deploy/fairforge
pnpm build

# 复制到 Nginx
sudo cp -r dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge
```

---

## 七、自动化部署脚本

### 7.1 一键部署脚本

```bash
cat > /home/deploy/fairforge/deploy.sh << 'SCRIPT'
#!/bin/bash
set -e

echo "🔥 FairForge 部署开始..."
cd /home/deploy/fairforge

echo "📦 拉取最新代码..."
git pull origin main

echo "📥 安装依赖..."
pnpm install

echo "🔨 构建前端..."
pnpm build

echo "📋 复制到 Nginx..."
sudo cp -r dist/* /var/www/fairforge/
sudo chown -R www-data:www-data /var/www/fairforge

echo "✅ FairForge 部署完成！"
echo "🌐 https://你的域名.com"
SCRIPT

chmod +x /home/deploy/fairforge/deploy.sh
```

### 7.2 监控脚本

```bash
cat > /home/deploy/fairforge/monitor.sh << 'SCRIPT'
#!/bin/bash

echo "📊 FairForge 系统状态"
echo "====================="

echo ""
echo "🖥️  服务器资源:"
echo "  CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')%"
echo "  内存: $(free -h | awk '/Mem:/ {print $3 "/" $2}')"
echo "  磁盘: $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 " used)"}')"

echo ""
echo "🌐 Nginx 状态:"
systemctl is-active nginx && echo "  ✅ 运行中" || echo "  ❌ 已停止"

echo ""
echo "📦 前端文件:"
echo "  最后更新: $(stat -c %y /var/www/fairforge/index.html 2>/dev/null | cut -d. -f1 || echo '未找到')"

echo ""
echo "🔗 合约检查:"
# 替换为你的实际合约地址
BONDING_CURVE="0x..."
echo "  BondingCurve: $BONDING_CURVE"

echo ""
echo "⏰ 当前时间: $(date)"
SCRIPT

chmod +x /home/deploy/fairforge/monitor.sh
```

### 7.3 备份脚本

```bash
cat > /home/deploy/fairforge/backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "💾 备份 FairForge..."
tar -czf "$BACKUP_DIR/fairforge_$DATE.tar.gz" \
  -C /home/deploy/fairforge \
  --exclude=node_modules \
  --exclude=artifacts \
  --exclude=cache \
  --exclude=dist \
  .

# 保留最近7个备份
ls -t $BACKUP_DIR/fairforge_*.tar.gz | tail -n +8 | xargs -r rm

echo "✅ 备份完成: fairforge_$DATE.tar.gz"
echo "📁 备份目录: $BACKUP_DIR"
SCRIPT

chmod +x /home/deploy/fairforge/backup.sh
```

### 7.4 设置定时备份

```bash
# 每天凌晨3点自动备份
crontab -e
# 添加以下行:
0 3 * * * /home/deploy/fairforge/backup.sh >> /home/deploy/backups/backup.log 2>&1
```

---

## 八、安全加固

### 8.1 SSH 安全

```bash
# 修改 SSH 配置
sudo nano /etc/ssh/sshd_config

# 修改以下项:
Port 2222                    # 改掉默认22端口
PermitRootLogin no           # 禁止root登录
PasswordAuthentication no    # 禁止密码登录（需要配置SSH Key）
MaxAuthTries 3

# 重启 SSH
sudo systemctl restart sshd

# ⚠️ 先确保你已经配置了 SSH Key 登录再禁用密码！
```

### 8.2 配置 SSH Key 登录

```bash
# 在本地电脑生成密钥（如果还没有）
ssh-keygen -t ed25519

# 上传公钥到服务器
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@你的服务器IP
```

### 8.3 自动安全更新

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# 选择 Yes
```

### 8.4 Fail2Ban 防暴力破解

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 查看状态
sudo fail2ban-client status
```

---

## 九、合约运营管理

### 9.1 关键运营参数

| 参数 | 合约 | 调整函数 | 当前值 |
|------|------|----------|--------|
| 创建费用 | BondingCurve | setCreationFee() | 0.1 BNB |
| DEX上线阈值 | BondingCurve | setDexThreshold() | 30 BNB |
| 候选费用 | LaunchDAO | setCandidateFee() | 0.05 BNB |
| DAO独占发射 | BondingCurve | setDaoOnlyLaunch() | true |
| 销毁阈值 | BuyAndBurnEngine | setBurnThreshold() | 0.1 BNB |

### 9.2 通过 Hardhat 控制台管理

```bash
npx hardhat console --network bscMainnet

# 读取合约
const dao = await ethers.getContractAt("LaunchDAO", "0x...")

# 修改候选费用
await dao.setCandidateFee(ethers.parseEther("0.1"))

# 读取当前epoch
await dao.currentDay()

# 读取候选列表
await dao.getActiveCandidates()
```

### 9.3 紧急暂停

```bash
npx hardhat console --network bscMainnet

const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.pause()    # 暂停所有交易
await curve.unpause()  # 恢复

const longPool = await ethers.getContractAt("LongPool", "0x...")
await longPool.pause()
await longPool.unpause()
```

### 9.4 Owner 转多签（主网必须！）

```bash
# 部署 Gnosis Safe 多签钱包后，将合约 Owner 转移
npx hardhat console --network bscMainnet

const curve = await ethers.getContractAt("BondingCurve", "0x...")
await curve.transferOwnership("多签钱包地址")

const dao = await ethers.getContractAt("LaunchDAO", "0x...")
await dao.transferOwnership("多签钱包地址")
```

---

## 十、日常运维

### 10.1 查看日志

```bash
# Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 系统日志
sudo journalctl -u nginx -f
```

### 10.2 更新部署

```bash
# 代码更新后一键部署
cd /home/deploy/fairforge
./deploy.sh
```

### 10.3 健康检查

```bash
# 运行监控脚本
./monitor.sh

# 检查 HTTPS 证书
sudo certbot certificates

# 检查磁盘空间
df -h

# 检查内存
free -h
```

---

## 十一、完整部署检查清单

### 服务器准备
- [ ] VPS 购买并登录
- [ ] 系统更新 `apt update && apt upgrade`
- [ ] 安装 Node.js 22.x
- [ ] 安装 Nginx
- [ ] 配置防火墙 (ufw)
- [ ] 创建部署用户

### 域名与网络
- [ ] 域名购买
- [ ] DNS A记录指向服务器IP
- [ ] Nginx 站点配置
- [ ] SSL证书 (Let's Encrypt)
- [ ] HTTPS 访问正常

### 合约部署
- [ ] 准备部署钱包（私钥保密！）
- [ ] 钱包有足够BNB
- [ ] 测试网部署成功
- [ ] 测试网合约验证
- [ ] 测试网功能测试通过
- [ ] 主网部署成功
- [ ] 主网合约验证
- [ ] Owner 转多签钱包

### 前端部署
- [ ] 项目上传到服务器
- [ ] 安装依赖 `pnpm install`
- [ ] 配置 .env.production
- [ ] 构建成功 `pnpm build`
- [ ] 复制到 Nginx 目录
- [ ] 网站可访问

### 安全
- [ ] SSH Key 登录
- [ ] 禁用root SSH
- [ ] Fail2Ban 安装
- [ ] .env 文件权限 600
- [ ] 自动安全更新

### 运维
- [ ] 部署脚本 deploy.sh
- [ ] 监控脚本 monitor.sh
- [ ] 备份脚本 backup.sh
- [ ] 定时备份 crontab
- [ ] WalletConnect 项目ID

---

## 十二、成本估算

| 项目 | 月费用（USD） |
|------|--------------|
| VPS (4C8G) | $20-40 |
| 域名 (.com) | $1-2 |
| BSC RPC (免费节点) | $0 |
| BSC RPC (QuickNode等) | $49-299 |
| WalletConnect | 免费起步 |
| SSL (Let's Encrypt) | $0 |
| BscScan API | 免费起步 |
| **合计（起步）** | **~$22-43/月** |
| **合计（生产）** | **~$70-340/月** |

---

## 十三、常见问题

### Q: 前端页面空白？
```bash
# 检查 Nginx 配置
sudo nginx -t
# 检查文件是否存在
ls -la /var/www/fairforge/
# 检查 Nginx 错误日志
sudo tail -20 /var/log/nginx/error.log
```

### Q: 合约部署失败 gas 不够？
```bash
# 检查钱包余额
npx hardhat console --network bscTestnet
const [deployer] = await ethers.getSigners();
const balance = await ethers.provider.getBalance(deployer.address);
console.log(ethers.formatEther(balance), "BNB");
```

### Q: Nginx 502 Bad Gateway？
```bash
# 确认 Nginx 在运行
sudo systemctl status nginx
# 确认端口没被占用
sudo lsof -i :80
```

### Q: SSL 证书续期失败？
```bash
# 手动续期
sudo certbot renew
# 重载 Nginx
sudo systemctl reload nginx
```

### Q: 如何查看合约状态？
```bash
npx hardhat console --network bscMainnet
const dao = await ethers.getContractAt("LaunchDAO", "0x...")
await dao.currentDay()
await dao.getPhase()
await dao.getEpochTimeRemaining()
```
