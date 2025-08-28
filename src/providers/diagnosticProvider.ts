/**
 * 诊断提供器
 * 处理语法检查和错误诊断功能
 */

import * as vscode from 'vscode';
import { OperatorInfo, FragmentInfo, DiagnosticCheckType } from '../models/types';
import { IndexService } from '../services/indexService';
import { OutputService } from '../services/outputService';

export class GorchDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private indexService: IndexService;
    private outputService: OutputService;

    constructor(diagnosticCollection: vscode.DiagnosticCollection) {
        this.diagnosticCollection = diagnosticCollection;
        this.indexService = IndexService.getInstance();
        this.outputService = OutputService.getInstance();
    }

    /**
     * 更新文档的诊断信息
     */
    async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        try {
            // 获取所有算子和Fragment信息
            const allOperators = this.indexService.getAllOperators();
            const allFragments = this.indexService.getAllFragments();

            // 检查算子序号唯一性
            this.checkOperatorSequenceUniqueness(allOperators, diagnostics, document);

            // 检查算子名称唯一性
            this.checkOperatorNameUniqueness(allOperators, diagnostics, document);

            // 检查未注册的算子使用
            await this.checkUnregisteredOperators(document, allOperators, diagnostics);

            // 检查 UNFOLD 指令的 FRAGMENT 匹配
            await this.checkUnfoldFragmentMatching(document, allFragments, diagnostics);

            // 检查 REGISTER 块中的 Go struct 存在性
            await this.checkGoStructExistence(document, allOperators, diagnostics);

            // 检查算子使用中的 Go struct 存在性（警告级别）
            await this.checkOperatorGoStructWarnings(document, allOperators, diagnostics);

            this.outputService.logDiagnosticCheck(document.fileName, diagnostics.length);

        } catch (error) {
            this.outputService.error(`Error updating diagnostics for ${document.fileName}: ${error}`);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * 检查算子序号唯一性
     */
    private checkOperatorSequenceUniqueness(
        operators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument
    ): void {
        const sequenceMap = new Map<number, OperatorInfo[]>();

        // 按序号分组
        operators.forEach(op => {
            const seq = parseInt(op.sequence || '0');
            if (!sequenceMap.has(seq)) {
                sequenceMap.set(seq, []);
            }
            sequenceMap.get(seq)!.push(op);
        });

        // 检查重复序号
        sequenceMap.forEach((ops, sequence) => {
            if (ops.length > 1) {
                ops.forEach(op => {
                    if (op.documentUri === document.uri.toString()) {
                        const range = this.findOperatorRange(document, op);
                        if (range) {
                            // 构建详细的重复信息，包含文件名
                            const duplicateInfo = ops.map(o => {
                                const fileName = this.getFileNameFromUri(o.documentUri);
                                return `${o.name} (${fileName})`;
                            }).join(', ');

                            const diagnostic = new vscode.Diagnostic(
                                range,
                                `Duplicate operator sequence ${sequence}. Found in: ${duplicateInfo}`,
                                vscode.DiagnosticSeverity.Error
                            );
                            diagnostic.code = 'duplicate-sequence';
                            diagnostics.push(diagnostic);
                        }
                    }
                });
            }
        });
    }

    /**
     * 检查算子名称唯一性
     */
    private checkOperatorNameUniqueness(
        operators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[],
        document: vscode.TextDocument
    ): void {
        const nameMap = new Map<string, OperatorInfo[]>();

        // 按名称分组
        operators.forEach(op => {
            if (!nameMap.has(op.name)) {
                nameMap.set(op.name, []);
            }
            nameMap.get(op.name)!.push(op);
        });

        // 检查重复名称
        nameMap.forEach((ops, name) => {
            if (ops.length > 1) {
                ops.forEach(op => {
                    if (op.documentUri === document.uri.toString()) {
                        const range = this.findOperatorRange(document, op);
                        if (range) {
                            // 构建详细的重复信息，包含文件名和包路径
                            const duplicateInfo = ops.map(o => {
                                const fileName = this.getFileNameFromUri(o.documentUri);
                                return `${o.packagePath}/${o.filePath} (${fileName})`;
                            }).join(', ');

                            const diagnostic = new vscode.Diagnostic(
                                range,
                                `Duplicate operator name '${name}'. Found in: ${duplicateInfo}`,
                                vscode.DiagnosticSeverity.Error
                            );
                            diagnostic.code = 'duplicate-name';
                            diagnostics.push(diagnostic);
                        }
                    }
                });
            }
        });
    }

    /**
     * 检查未注册的算子使用
     */
    private async checkUnregisteredOperators(
        document: vscode.TextDocument,
        registeredOperators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const text = document.getText();
        const registeredNames = new Set(registeredOperators.map(op => op.name));

        // 匹配算子调用（不在 REGISTER 块内的）
        const operatorCallRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        let match;

        // 获取所有 REGISTER 块的范围，避免在其中检查
        const registerRanges = this.getRegisterBlockRanges(document);

        while ((match = operatorCallRegex.exec(text)) !== null) {
            const operatorName = match[1];
            const position = document.positionAt(match.index);

            // 跳过关键字和在 REGISTER 块内的调用
            if (this.isKeyword(operatorName) || this.isInRegisterBlock(position, registerRanges)) {
                continue;
            }

            // 检查是否为未注册的算子
            if (!registeredNames.has(operatorName)) {
                const range = new vscode.Range(
                    position,
                    document.positionAt(match.index + operatorName.length)
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Unregistered operator '${operatorName}'. Please add it to a REGISTER block.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'unregistered-operator';
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查 UNFOLD 指令的 FRAGMENT 匹配
     */
    private async checkUnfoldFragmentMatching(
        document: vscode.TextDocument,
        allFragments: FragmentInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const text = document.getText();
        const fragmentNames = new Set(allFragments.map(f => f.name));

        // 匹配 UNFOLD 指令
        const unfoldRegex = /UNFOLD\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = unfoldRegex.exec(text)) !== null) {
            const fragmentName = match[1];
            const position = document.positionAt(match.index);

            // 检查 FRAGMENT 是否存在
            if (!fragmentNames.has(fragmentName)) {
                const range = new vscode.Range(
                    position,
                    document.positionAt(match.index + match[0].length)
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `FRAGMENT '${fragmentName}' not found. Please define it in a FRAGMENT block.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'fragment-not-found';
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查 REGISTER 块中的 Go struct 存在性
     */
    private async checkGoStructExistence(
        document: vscode.TextDocument,
        allOperators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const currentDocOperators = allOperators.filter(op => op.documentUri === document.uri.toString());
        
        for (const operator of currentDocOperators) {
            const goStruct = this.indexService.findGoStructByName(operator.structName);
            if (!goStruct) {
                const range = this.findOperatorRange(document, operator);
                if (range) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Go struct '${operator.structName}' not found. Please ensure the struct exists in your Go code.`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'go-struct-not-found';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    /**
     * 检查算子使用中的 Go struct 存在性（警告级别）
     */
    private async checkOperatorGoStructWarnings(
        document: vscode.TextDocument,
        allOperators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        // 这里可以添加更多的警告级别检查
        // 比如检查Go struct是否有正确的方法签名等
    }

    /**
     * 查找算子在文档中的位置范围
     */
    private findOperatorRange(document: vscode.TextDocument, operator: OperatorInfo): vscode.Range | undefined {
        const text = document.getText();
        const operatorRegex = new RegExp(
            `OPERATOR\\s*\\(\\s*"${this.escapeRegex(operator.filePath)}"\\s*,\\s*"${this.escapeRegex(operator.structName)}"\\s*,\\s*"${this.escapeRegex(operator.name)}"\\s*,\\s*${operator.sequence}\\s*\\)`,
            'g'
        );

        const match = operatorRegex.exec(text);
        if (match) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            return new vscode.Range(startPos, endPos);
        }

        return undefined;
    }

    /**
     * 获取所有 REGISTER 块的范围
     */
    private getRegisterBlockRanges(document: vscode.TextDocument): vscode.Range[] {
        const text = document.getText();
        const ranges: vscode.Range[] = [];
        const registerRegex = /REGISTER\s*\([^)]+\)\s*\{([\s\S]*?)\}/g;
        let match;

        while ((match = registerRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            ranges.push(new vscode.Range(startPos, endPos));
        }

        return ranges;
    }

    /**
     * 检查位置是否在 REGISTER 块内
     */
    private isInRegisterBlock(position: vscode.Position, registerRanges: vscode.Range[]): boolean {
        return registerRanges.some(range => range.contains(position));
    }

    /**
     * 检查是否为关键字
     */
    private isKeyword(word: string): boolean {
        const keywords = [
            'START', 'FRAGMENT', 'REGISTER', 'OPERATOR', 'ON_FINISH', 'UNFOLD',
            'GO', 'WAIT', 'SKIP', 'SWITCH', 'CASE', 'WRAP', 'NO_CHECK_MISS'
        ];
        return keywords.includes(word);
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 从URI中获取文件名
     */
    private getFileNameFromUri(uri: string): string {
        try {
            const parsedUri = vscode.Uri.parse(uri);
            return parsedUri.fsPath.split('/').pop() || 'unknown';
        } catch {
            return 'unknown';
        }
    }
}
