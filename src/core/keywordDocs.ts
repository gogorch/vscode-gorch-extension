/**
 * 内置指令文档
 * 存储所有Gorch内置指令的Markdown格式文档
 */

export const keywordDocs: { [key: string]: string } = {
    'REGISTER': `
# REGISTER 指令

\`REGISTER\` 指令用于声明一个注册块，在其中可以注册一系列算子（OPERATOR）。

### 语法

\`\`\`gorch
REGISTER("path/to/your/go/package") {
    // OPERATOR 指令放在这里
}
\`\`\`

### 参数

1.  **包路径 (string)**:
    *   必需。
    *   定义了这个 \`REGISTER\` 块内所有算子 Go struct 的根 Go 包路径。
    *   在 \`OPERATOR\` 指令中定义的路径将是相对于此路径的。

### 示例

\`\`\`gorch
REGISTER("github.com/gogorch/gorch/examples/operators") {
    OPERATOR("opa", "Opa", "Opa", 1)
    OPERATOR("opb", "Opb", 2) // 省略算子名，将使用 "Opb" 作为算子名
}
\`\`\`
`,
    'OPERATOR': `
# OPERATOR 指令

\`OPERATOR\` 指令用于将一个 Go struct 注册为一个可在流程中使用的算子。

### 语法

\`\`\`gorch
// 4个参数: 路径, Struct名称, 算子名称, 序号
OPERATOR("relative/path", "StructName", "UniqueOperatorName", 1)

// 3个参数: 路径, Struct名称, 序号 (Struct名称将作为算子名称)
OPERATOR("relative/path", "StructName", 2)
\`\`\`

### 参数

1.  **相对路径 (string)**:
    *   必需。
    *   相对于 \`REGISTER\` 块中定义的根包路径。
2.  **Struct名称 (string)**:
    *   必需。
    *   算子对应的 Go struct 名称。必须与 Go 代码中的 struct 名称完全匹配。
    *   支持 **Cmd/Ctrl + 点击** 跳转到 Go struct 定义。
    *   支持 **鼠标悬停** 显示 struct 定义。
3.  **算子名称 (string)**:
    *   可选。
    *   算子的全局唯一名称，用于在 \`START\` 流程中调用。
    *   如果省略，将默认使用 **Struct名称** 作为算子名称。
4.  **序号 (integer)**:
    *   必需。
    *   在当前 \`REGISTER\` 块内唯一的整数ID。

### 示例

\`\`\`gorch
REGISTER("github.com/gogorch/gorch/examples/operators") {
    // "Opa" 是 struct 名, "MyOpa" 是算子名
    OPERATOR("opa", "Opa", "MyOpa", 1)

    // "Opb" 同时是 struct 名和算子名
    OPERATOR("opb", "Opb", 2)
}

START("main") {
    MyOpa -> Opb
}
\`\`\`
`,
    'START': `
# START 指令

\`START\` 指令定义了一个执行流程的入口点。

### 语法

\`\`\`gorch
START("flow_name", arg1="value", arg2=123) {
    // 算子执行流程
}
\`\`\`

### 参数

1.  **流程名称 (string)**:
    *   必需。
    *   定义流程的唯一名称。
2.  **流程参数 (key=value)**:
    *   可选。
    *   可以为流程定义一系列参数，在流程内部使用。

### 示例

\`\`\`gorch
START("main_flow") {
    OperatorA -> OperatorB
}
\`\`\`
`,
    'FRAGMENT': `
# FRAGMENT 指令

\`FRAGMENT\` 指令用于定义一个可复用的算子执行片段。它可以被 \`UNFOLD\` 指令在其他流程中调用。

### 语法

\`\`\`gorch
FRAGMENT("fragment_name") {
    // 可复用的算子执行流程
}
\`\`\`

### 参数

1.  **片段名称 (string)**:
    *   必需。
    *   定义该片段的唯一名称。

### 示例

\`\`\`gorch
FRAGMENT("sub_flow") {
    OperatorC -> OperatorD
}

START("main_flow") {
    OperatorA -> UNFOLD("sub_flow") -> OperatorE
}
\`\`\`
`,
    'UNFOLD': `
# UNFOLD 指令

\`UNFOLD\` 指令用于在其所在位置展开并执行一个 \`FRAGMENT\` 定义的子流程。

### 语法

\`\`\`gorch
UNFOLD("fragment_name")
\`\`\`

### 参数

1.  **片段名称 (string)**:
    *   必需。
    *   要引用的 \`FRAGMENT\` 的名称。
    *   支持 **Cmd/Ctrl + 点击** 跳转到 \`FRAGMENT\` 定义。

### 示例

\`\`\`gorch
START("main_flow") {
    OperatorA -> UNFOLD("sub_flow")
}
\`\`\`
`,
    'ON_FINISH': `
# ON_FINISH 指令

\`ON_FINISH\` 指令用于定义在 \`START\` 主流程执行完毕后（无论成功或失败）需要执行的清理流程。

### 语法

\`\`\`gorch
START("main_flow") {
    ON_FINISH() {
        // 清理流程
    }
    // 主流程
}
\`\`\`

### 示例

\`\`\`gorch
START("main_flow") {
    ON_FINISH() {
        CleanOperator
    }
    TaskOperator
}
\`\`\`
`,
    'GO': `
# GO 指令

\`GO\` 指令用于在后台异步执行一个或多个算子。

### 语法

\`\`\`gorch
GO(OperatorA, "event_name")
\`\`\`

### 参数

1.  **执行体**:
    *   必需。
    *   一个或多个算子，可以是串行或并行流程。
2.  **事件名称 (string)**:
    *   必需。
    *   定义一个事件名称，后续可以通过 \`WAIT\` 指令等待此异步任务完成。

### 示例

\`\`\`gorch
START("main") {
    [
        GO(OperatorA, "event_a"),
        GO(OperatorB, "event_b")
    ] -> WAIT("event_a") -> FinalOperator
}
\`\`\`
`,
    'WAIT': `
# WAIT 指令

\`WAIT\` 指令用于暂停当前流程，直到一个或多个由 \`GO\` 指令启动的异步任务完成。

### 语法

\`\`\`gorch
WAIT("event_name")
\`\`\`

### 参数

1.  **事件名称 (string)**:
    *   要等待的事件名称，对应 \`GO\` 指令中定义的事件。

2. 可选参数：

| 参数 | 说明 | 示例 |
|------|------|------|
| \`timeout\` | 等待超时时间（从开始等待时计算） | \`timeout=30s\` |
| \`totalTimeout\` | 总超时时间（从任务开始执行时计算） | \`totalTimeout=60s\` |
| \`allowUnstarted\` | 允许等待未启动的任务 | \`allowUnstarted=true\` |

### 示例

\`\`\`gorch
START("main") {
    GO(LongTask, "long_task_done") -> QuickTask -> WAIT("long_task_done")
}
\`\`\`
`,
    'SKIP': `
# SKIP 指令

\`SKIP\` 指令用于在串行流程中跳过一个算子的执行。

### 语法

\`\`\`gorch
SKIP(OperatorToSkip)
\`\`\`

### 示例

\`\`\`gorch
START("main") {
    OperatorA -> SKIP(OperatorB) -> OperatorC
    // 如果在OperatorB算子内执行SkipSerial函数，则会跳过OperatorC函数的执行
}
\`\`\`
`,
    'SWITCH': `
# SWITCH 指令

\`SWITCH\` 指令提供了一个基于前置算子输出结果进行分支选择的逻辑。

### 语法

\`\`\`gorch
SWITCH(BranchSelectorOperator) {
    CASE "output_value_1" => OperatorA,
    CASE "output_value_2" => OperatorB,
    CASE "default" => DefaultOperator
}
\`\`\`

### 结构

*   **BranchSelectorOperator**: 一个算子，其执行结果（通常是一个字符串）将用于匹配 \`CASE\`。
*   **CASE**: 定义一个分支。包含一个期望的匹配值和一个当匹配成功时要执行的算子或流程。

### 示例

\`\`\`gorch
START("main") {
    CheckUserType -> SWITCH(GetBranch) {
        CASE "admin" => AdminPanel,
        CASE "user" => UserDashboard
    }
}
\`\`\`
`,
    'CASE': `
# CASE 指令

\`CASE\` 是 \`SWITCH\` 指令的一部分，用于定义一个具体的分支逻辑。

### 语法

\`\`\`gorch
CASE "match_value" => OperatorOrFlow
\`\`\`

### 参数

1.  **匹配值 (string)**:
    *   必需。
    *   用于和 \`SWITCH\` 中的前置算子输出进行比较的值。
2.  **执行体**:
    *   必需。
    *   当匹配成功时要执行的算子或流程。

`,
    'WRAP': `
# WRAP 指令

\`WRAP\` 指令用于创建一个算子链，其中前一个算子的输出是后一个算子的输入，形成一个包装或管道模式。

### 语法

\`\`\`gorch
(OperatorA | OperatorB | OperatorC)
\`\`\`
*注意：在串行流中，需要用括号包裹。*

### 示例

\`\`\`gorch
START("main") {
    // Request -> (AuthWrapper | LogWrapper | MainHandler) -> Response
    Request -> (AuthWrapper | LogWrapper | MainHandler) -> Response
}
\`\`\`
`,
    'NO_CHECK_MISS': `
# NO_CHECK_MISS 指令

\`NO_CHECK_MISS\` 指令用于告知 Gorch 在当前 \`START\` 块中，即使有未被执行的算子（例如在 \`SWITCH\` 的未命中分支中），也不要报错。

### 语法

\`\`\`gorch
START("main") {
    NO_CHECK_MISS()
    // ... a flow where some operators might not be executed
}
\`\`\`
`
};
