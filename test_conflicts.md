# 冲突检测测试说明

## 测试步骤

1. 在VSCode中打开 `examples/conf/reg.gorch` 文件
2. 该文件包含以下冲突：

### 算子名称冲突
```gorch
OPERATOR("gorch/examples/opa", "OperatorA1", "a1", 2)  // 第3行
OPERATOR("gorch/examples/opb", "OperatorB0", "a1", 2)  // 第4行
```
两个算子都使用了名称 "a1"

### 算子序号冲突
```gorch
OPERATOR("gorch/examples/opa", "OperatorA1", "a1", 2)  // 第3行
OPERATOR("gorch/examples/opb", "OperatorB0", "a1", 2)  // 第4行
```
两个算子都使用了序号 2

## 预期结果

应该在第3行和第4行看到红色波浪线，显示以下错误：
- "Duplicate operator name 'a1'. Found in: ..."
- "Duplicate operator sequence 2. Found in: ..."

## 调试步骤

如果没有看到错误：

1. 打开命令面板 (Cmd+Shift+P)
2. 执行 `Gorch: Show Output` 查看日志
3. 执行 `Gorch: Refresh Index` 手动刷新索引
4. 检查输出窗口中的调试信息

## 调试日志示例

正常工作时应该看到类似的日志：
```
[INFO] Starting index update...
[DEBUG] Parsed operator: a0, sequence: 1, from reg.gorch
[DEBUG] Parsed operator: a1, sequence: 2, from reg.gorch
[DEBUG] Parsed operator: a1, sequence: 2, from reg.gorch
[DEBUG] Parsed operator: b1, sequence: 11, from reg.gorch
[DEBUG] Updating diagnostics for reg.gorch, found 4 operators total
[DEBUG] Checking sequence uniqueness for 4 operators
[DEBUG] Found 2 operators with sequence 2
[DEBUG] 2 of them are in current document
[DEBUG] Added sequence conflict diagnostic for operator a1
```
