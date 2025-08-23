#!/bin/bash

# Gorch VSCode 扩展构建脚本

set -e

echo "🚀 开始构建 Gorch Language Support 扩展..."

# 检查 Node.js 和 npm
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm，请先安装 npm"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 编译 TypeScript
echo "🔨 编译 TypeScript..."
npm run compile

# 打包扩展
echo "📦 打包扩展..."
npm run package

echo "✅ 构建完成！"
echo ""
echo "生成的文件:"
ls -la *.vsix 2>/dev/null || echo "未找到 .vsix 文件"

echo ""
echo "🚀 安装扩展:"
echo "npm run install-local"
echo ""
echo "或手动安装:"
echo "code --install-extension gorch-language-support-*.vsix"
