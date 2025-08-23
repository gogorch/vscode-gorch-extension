# 快速开始

## 🚀 一键构建和安装

```bash
# 构建扩展
./scripts/build.sh

# 安装到 VSCode
npm run install-local
```

## 🧪 测试扩展

1. 打开 `examples/sample.gorch` 文件
2. 验证语法高亮是否正常
3. 尝试输入 `start` 查看代码片段

## 📝 开发模式

1. 在 VSCode 中打开项目
2. 按 `F5` 启动扩展开发主机
3. 在新窗口中测试扩展功能

## 🔧 常用命令

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式编译
npm run watch

# 打包
npm run package

# 本地安装
npm run install-local
```

## 📁 项目结构

```
vscode-gorch-extension/
├── package.json                    # 扩展配置
├── tsconfig.json                   # TypeScript 配置
├── language-configuration.json     # 语言配置
├── .gitignore                      # Git 忽略文件
├── src/extension.ts               # 扩展逻辑
├── syntaxes/gorch.tmLanguage.json # 语法规则
├── snippets/gorch.json            # 代码片段
├── examples/sample.gorch          # 示例文件
├── scripts/build.sh               # 构建脚本
└── .vscode/                       # VSCode 配置
    ├── launch.json                # 调试配置
    └── tasks.json                 # 任务配置
```
