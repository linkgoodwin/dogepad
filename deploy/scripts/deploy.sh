#!/bin/bash
set -e

PROJECT_DIR="/home/deploy/lanchpad"
WWW_DIR="/var/www/bsc-launchpad"

echo "🚀 BSC Launchpad Deployment"
echo "============================"

cd "$PROJECT_DIR"

echo "📦 Pulling latest code..."
git pull origin main

echo "📥 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔧 Building project..."
pnpm build

echo "📋 Deploying to Nginx..."
sudo cp -r dist/* "$WWW_DIR/"
sudo chown -R www-data:www-data "$WWW_DIR"

echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

echo "✅ Deployment complete!"
echo "🌐 https://你的域名"
