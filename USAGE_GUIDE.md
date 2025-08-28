# Gorch VSCode Extension 使用指南

## 🚀 快速开始

### 安装和激活
1. 在 VSCode 中打开包含 `.gorch` 文件的项目
2. 插件会自动激活并开始索引文件
3. 查看输出窗口 "Gorch Language Support" 了解索引状态

### 首次使用
```bash
# 打开命令面板 (Ctrl+Shift+P / Cmd+Shift+P)
> Gorch: Refresh Index    # 手动刷新索引
> Gorch: Show Output      # 显示输出窗口
```

## 🎯 核心功能

### 1. 增强的跳转功能

#### 算子名称跳转
```gorch
START("main") {
    fetcher()  # Cmd+点击跳转到对应的 Go struct
    //  ↑ 跳转到 Fetcher struct 定义
}
```

#### **新功能**: OPERATOR 指令中 struct 名称跳转
```gorch
REGISTER("github.com/myproject/ops") {
    OPERATOR("ops", "Fetcher", "fetcher", 1)
    //              ^^^^^^^^^ Cmd+点击直接跳转到 Go struct
}
```

#### FRAGMENT 跳转
```gorch
START("main") {
    UNFOLD("common_setup")  # Cmd+点击跳转到 FRAGMENT 定义
    //      ↑ 跳转到对应的 FRAGMENT 块
}

FRAGMENT("common_setup") {
    // FRAGMENT 定义
}
```

### 2. 智能语法检查

#### 算子序号唯一性检查
```gorch
REGISTER("pkg1") {
    OPERATOR("ops", "Fetcher", "fetcher", 1)  # ❌ 重复序号
}
REGISTER("pkg2") {
    OPERATOR("ops", "Loader", "loader", 1)    # ❌ 重复序号
}
```

#### 算子名称唯一性检查
```gorch
REGISTER("pkg1") {
    OPERATOR("ops", "Fetcher", "fetcher", 1)  # ❌ 重复名称
}
REGISTER("pkg2") {
    OPERATOR("ops", "Loader", "fetcher", 2)   # ❌ 重复名称
}
```

#### 未注册算子检查
```gorch
START("main") {
    unknown_operator()  # ❌ 未注册的算子
}
```

#### Go struct 存在性检查
```gorch
REGISTER("github.com/myproject/ops") {
    OPERATOR("ops", "NonExistentStruct", "test", 1)  # ❌ Go struct 不存在
}
```

### 3. 索引管理

#### 自动索引更新
- 文件保存时自动更新索引
- 监听 `.gorch` 和 `.go` 文件变化
- 增量更新，性能优化

#### 手动索引管理
```bash
# 命令面板操作
> Gorch: Refresh Index     # 手动刷新索引
> Gorch: Show Output       # 显示详细日志
> Gorch: Clear Output      # 清空输出窗口
```

### 4. 输出窗口日志

#### 查看索引状态
```
[2024-01-01T10:00:00.000Z] [INFO] Starting index update...
----------------------------------------
Index Update Results:
  - Operators found: 25
  - Fragments found: 8  
  - Go structs found: 15
  - Duration: 150ms
  - Errors: 0
----------------------------------------
```

#### 调试信息
```
[2024-01-01T10:00:01.000Z] [DEBUG] [Parser] Parsed main.gorch: 5 operators, 2 fragments
[2024-01-01T10:00:01.100Z] [DEBUG] [GoScanner] Scanned fetcher.go: 3 structs found
[2024-01-01T10:00:01.200Z] [DEBUG] [Navigation] Definition jump (struct): main.gorch:10 -> fetcher.go:15
```

## 🔧 高级功能

### Go 扩展集成
插件会自动检测并使用 Go 扩展的索引功能：
1. **优先级**: Go 扩展 > 本地索引 > 实时搜索
2. **性能**: 利用 Go 扩展的高性能索引
3. **准确性**: 支持复杂的 Go 项目结构

### 大纲视图 (Outline)
- **START** 块显示为函数符号
- **FRAGMENT** 块显示为模块符号  
- **REGISTER** 块显示为包符号
- **OPERATOR** 显示为操作符符号，包含序号信息

### 代码片段支持
```gorch
# 输入 "start" + Tab
START("${1:name}") {
    ${2:// your code here}
}

# 输入 "fragment" + Tab  
FRAGMENT("${1:name}") {
    ${2:// fragment content}
}

# 输入 "register" + Tab
REGISTER("${1:package_path}") {
    OPERATOR("${2:file_path}", "${3:struct_name}", "${4:operator_name}", ${5:sequence})
}
```

## 🛠️ 故障排除

### 常见问题

#### 1. 跳转不工作
```bash
# 解决方案
> Gorch: Refresh Index    # 刷新索引
> Gorch: Show Output      # 查看错误日志
```

#### 2. Go struct 找不到
- 确保 Go 文件在工作区内
- 检查 `go.mod` 文件是否正确
- 安装并启用 Go 扩展

#### 3. 性能问题
- 大型项目首次索引可能较慢
- 后续操作会使用缓存，速度很快
- 可以通过输出窗口监控性能

### 调试模式
```json
// settings.json
{
    "gorch.logLevel": "DEBUG",
    "gorch.enableGoIntegration": true,
    "gorch.autoRefreshIndex": true
}
```

## 📊 性能优化建议

### 项目结构
```
project/
├── main.gorch           # 主流程文件
├── fragments/           # Fragment 定义
│   ├── common.gorch
│   └── utils.gorch
├── operators/           # 算子注册
│   ├── fetchers.gorch
│   └── processors.gorch
└── go/                  # Go 源码
    ├── fetcher/
    └── processor/
```

### 最佳实践
1. **模块化**: 将相关功能分组到不同文件
2. **命名规范**: 使用清晰的算子和 struct 名称
3. **索引优化**: 避免频繁的文件修改
4. **Go 集成**: 确保 Go 扩展正常工作

## 🔄 版本兼容性

### 支持的 VSCode 版本
- VSCode 1.60.0 或更高版本
- 支持最新的 Language Server Protocol

### Go 扩展兼容性
- 推荐使用官方 Go 扩展 (golang.go)
- 支持 Go 1.16 或更高版本
- 兼容 Go modules 和 GOPATH 模式

## 📞 支持和反馈

### 获取帮助
1. 查看输出窗口的详细日志
2. 使用 `> Gorch: Show Output` 命令
3. 检查 VSCode 开发者工具控制台

### 报告问题
请提供以下信息：
- VSCode 版本
- 插件版本  
- 错误日志（来自输出窗口）
- 重现步骤

---

🎉 **恭喜！** 你现在已经掌握了重构后的 Gorch VSCode Extension 的所有功能。享受更高效的开发体验吧！
