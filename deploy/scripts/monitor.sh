#!/bin/bash

echo "========================================="
echo "  BSC Launchpad - Health Monitor"
echo "========================================="
echo ""

NGINX_OK=true
if ! systemctl is-active --quiet nginx; then
  echo "❌ Nginx: DOWN"
  NGINX_OK=false
else
  echo "✅ Nginx: Running"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://localhost 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Website: Accessible (HTTP $HTTP_CODE)"
else
  echo "❌ Website: Not accessible (HTTP $HTTP_CODE)"
fi

DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 85 ]; then
  echo "⚠️  Disk Usage: ${DISK_USAGE}% (HIGH)"
else
  echo "✅ Disk Usage: ${DISK_USAGE}%"
fi

MEM_USAGE=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
if [ "$MEM_USAGE" -gt 90 ]; then
  echo "⚠️  Memory Usage: ${MEM_USAGE}% (HIGH)"
else
  echo "✅ Memory Usage: ${MEM_USAGE}%"
fi

CPU_LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
echo "✅ CPU Load: ${CPU_LOAD}"

echo ""
echo "--- BSC Chain Status ---"

GAS_PRICE=$(curl -s -X POST https://bsc-dataseed.binance.org/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_gasPrice","params":[],"id":1}' \
  2>/dev/null | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('result','0x0'),16)/1e9)" 2>/dev/null || echo "N/A")
echo "📡 BNB Gas Price: ${GAS_PRICE} Gwei"

BLOCK_NUMBER=$(curl -s -X POST https://bsc-dataseed.binance.org/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  2>/dev/null | python3 -c "import sys,json; print(int(json.load(sys.stdin).get('result','0x0'),16))" 2>/dev/null || echo "N/A")
echo "📦 Current Block: ${BLOCK_NUMBER}"

echo ""
echo "========================================="
echo "  Monitor completed at $(date)"
echo "========================================="
