# Gorch Language Support for VSCode

这是一个为 [Gorch](https://github.com/gogorch/gorch) DSL 提供语法高亮和语言支持的 VSCode 扩展。

## 功能特性

### 🎨 语法高亮
- **关键字高亮**: START, FRAGMENT, REGISTER, ON_FINISH, UNFOLD, GO, WAIT, SKIP, SWITCH, CASE 等
- **操作符高亮**: `->`, `|`, `@`, `=`, `=>` 等
- **字面量高亮**: 字符串、数字、布尔值、时间duration
- **注释支持**: 支持 `//` 行注释和 `/* */` 块注释

### 📝 代码片段
提供常用的 Gorch DSL 代码片段，包括：
- `start` - START 指令模板
- `fragment` - FRAGMENT 指令模板  
- `register` - REGISTER 指令模板
- `operator` - OPERATOR 注册模板
- `switch` - SWITCH 语句模板
- `serial` - 串行执行模板
- `concurrent` - 并发执行模板
- 更多...

### 🔧 语言配置
- **括号匹配**: 自动匹配 `{}`, `[]`, `()` 括号
- **自动闭合**: 自动闭合括号和引号
- **智能缩进**: 基于语法结构的智能缩进
- **代码折叠**: 支持代码块折叠

## 开发和安装

### 开发环境设置
```bash
# 克隆或下载项目
cd vscode-gorch-extension

# 安装依赖
npm install

# 编译扩展
npm run compile

# 在开发模式下测试
# 在 VSCode 中打开项目，按 F5 启动扩展开发主机
```

### 打包和安装
```bash
# 安装 vsce 工具
npm install -g @vscode/vsce

# 打包扩展
vsce package

# 安装扩展
code --install-extension gorch-language-support-*.vsix
```

### 从源码安装
1. 克隆项目到本地
2. 运行 `npm install` 安装依赖
3. 运行 `npm run compile` 编译
4. 运行 `vsce package` 打包
5. 在 VSCode 中按 `Ctrl+Shift+P`，输入 "Extensions: Install from VSIX"
6. 选择生成的 `.vsix` 文件

## 使用方法

1. 创建 `.gorch` 文件
2. VSCode 会自动识别文件类型并应用语法高亮
3. 使用代码片段快速编写 Gorch DSL 代码

## 示例代码

```gorch
START("example", timeout=8s){
    ON_FINISH() { 
        cleanup(onfinish=true) 
    }

    UNFOLD("data_processing")
    -> validator(strict=true)
    -> [processor1, processor2, processor3]
    -> aggregator(timeout=5s, WAIT("async_task", timeout=10ms))
}

FRAGMENT("data_processing"){
    @fetcher(fatal=true) -> GO(transformer(mode="async"), "async_task")
}

REGISTER("github.com/myproject"){
    OPERATOR("ops", "Fetcher", "fetcher", 1)
    OPERATOR("ops", "Validator", "validator", 2)
    OPERATOR("ops", "Processor", "processor1", 3)
}
```

## 支持的语法

### 指令类型
- `START` - 执行入口
- `FRAGMENT` - 可复用片段
- `REGISTER` - 算子注册

### 控制流
- `->` - 串行执行
- `[]` - 并发执行
- `SWITCH/CASE` - 条件分支
- `GO/WAIT` - 异步执行
- `SKIP` - 跳过执行
- `UNFOLD` - 片段展开

### 数据类型
- 字符串: `"example"`
- 整数: `123`, `-456`
- 布尔值: `true`, `false`
- 时间: `10ms`, `5s`, `1h`
- 数组: `[1,2,3]`, `["a","b"]`

## 项目结构

```
vscode-gorch-extension/
├── package.json                    # 扩展配置和依赖
├── tsconfig.json                   # TypeScript 配置
├── language-configuration.json     # 语言配置（括号匹配、注释等）
├── src/
│   └── extension.ts               # 扩展主逻辑
├── syntaxes/
│   └── gorch.tmLanguage.json      # TextMate 语法规则
├── snippets/
│   └── gorch.json                 # 代码片段定义
└── README.md                      # 项目文档
```

## 功能验证

创建测试文件 `test.gorch`：
```gorch
// 测试语法高亮
START("example", timeout=8s){
    ON_FINISH() { cleanup(onfinish=true) }

    validator(strict=true)
    -> [processor1, processor2]
    -> aggregator(WAIT("async_task", timeout=10ms))
}

FRAGMENT("data_processing"){
    @fetcher(fatal=true) -> GO(transformer(), "async_task")
}

REGISTER("github.com/myproject"){
    OPERATOR("ops", "Validator", "validator", 1)
    OPERATOR("ops", "Processor", "processor1", 2)
}
```

验证功能：
- 关键字应该有语法高亮
- 输入 `start` 应该有代码片段补全
- 括号应该自动匹配和缩进

## 故障排除

### 语法高亮不工作
- 确保文件扩展名是 `.gorch`
- 检查 VSCode 右下角语言模式是否为 "Gorch"

### 代码片段不显示
- 确保在 `.gorch` 文件中输入
- 检查 VSCode 设置中是否启用了代码片段

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支: `git checkout -b feature/new-feature`
3. 提交更改: `git commit -am 'Add new feature'`
4. 推送分支: `git push origin feature/new-feature`
5. 创建 Pull Request

## 许可证

MIT License

## 更新日志

### 1.0.0
- 初始版本
- 完整语法高亮支持
- 15+ 代码片段
- 智能语言配置
- 文档符号支持
