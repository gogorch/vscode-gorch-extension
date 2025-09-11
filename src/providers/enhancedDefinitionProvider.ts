/**
 * 增强的定义提供器
 * 处理Go to Definition功能，支持算子跳转和OPERATOR指令中struct名称跳转
 */

import * as vscode from 'vscode';
import { OperatorInfo, FragmentInfo, DefinitionContext, OperatorMatch } from '../models/types';
import { IndexService } from '../services/indexService';
import { OutputService } from '../services/outputService';
import { GoUtils } from '../utils/goUtils';
import { parseOperatorLine } from '../services/parser';
import { keywordDocs } from '../core/keywordDocs';

export class EnhancedDefinitionProvider implements vscode.DefinitionProvider {
    private indexService: IndexService;
    private outputService: OutputService;

    constructor() {
        this.indexService = IndexService.getInstance();
        this.outputService = OutputService.getInstance();
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        
        // 仅处理 .gorch 文件
        if (document.languageId !== 'gorch') {
            return undefined;
        }

        const context = this.createDefinitionContext(document, position);
        if (!context) {
            return undefined;
        }

        this.outputService.logDefinitionStart(
            context.word,
            `${context.position.line}:${context.position.character}`,
            'gorch-file'
        );

        // 检查是否为内置关键字
        if (this.isKeyword(context.word)) {
            const doc = keywordDocs[context.word];
            if (doc) {
                // 创建一个虚拟的markdown文件并打开它
                const content = new vscode.MarkdownString(doc).value;
                const uri = vscode.Uri.parse(`untitled:${context.word}.md`);
                const docToOpen = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(docToOpen, { preview: true });
                await editor.edit(editBuilder => {
                    editBuilder.insert(new vscode.Position(0, 0), content);
                });
                return; // 返回，因为我们已经处理了跳转
            }
        }

        // 检查是否在OPERATOR指令中
        const operatorMatch = this.parseOperatorInstruction(context);
        if (operatorMatch) {
            this.outputService.debug(`🔧 Detected OPERATOR instruction context for struct: ${operatorMatch.structName}`, 'Navigation');
            return await this.handleOperatorDefinition(context, operatorMatch);
        }

        // 检查是否是UNFOLD指令中的FRAGMENT名称
        const unfoldLocation = await this.handleUnfoldDefinition(context);
        if (unfoldLocation) {
            return unfoldLocation;
        }

        // 检查是否是算子调用
        const operatorLocation = await this.handleOperatorCallDefinition(context);
        if (operatorLocation) {
            return operatorLocation;
        }

        this.outputService.debug(`❌ No definition found for: ${context.word}`, 'Navigation');
        return undefined;
    }

    /**
     * 创建定义上下文
     */
    private createDefinitionContext(document: vscode.TextDocument, position: vscode.Position): DefinitionContext | undefined {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;

        return {
            document,
            position,
            word,
            wordRange,
            lineText
        };
    }

    /**
     * 解析OPERATOR指令
     */
    private parseOperatorInstruction(context: DefinitionContext): OperatorMatch | undefined {
        const { lineText, position } = context;
        
        const operatorMatch = parseOperatorLine(lineText);
        
        if (!operatorMatch) {
            return undefined;
        }

        // 检查光标是否在struct名称上
        if (position.character >= operatorMatch.structNameStart && position.character <= operatorMatch.structNameEnd) {
            return operatorMatch;
        }

        return undefined;
    }

    /**
     * 处理OPERATOR指令中的定义跳转
     */
    private async handleOperatorDefinition(
        context: DefinitionContext,
        operatorMatch: OperatorMatch
    ): Promise<vscode.Definition | undefined> {

        const { structName } = operatorMatch;
        this.outputService.debug(`🔍 Looking for Go struct: ${structName} (from OPERATOR instruction)`, 'Navigation');

        // 首先尝试使用Go扩展查找
        this.outputService.debug(`📡 Step 1: Trying Go extension lookup for struct: ${structName}`, 'Navigation');
        try {
            const goExtensionResult = await GoUtils.findStructUsingGoExtension(structName);
            if (goExtensionResult && goExtensionResult.length > 0) {
                this.outputService.logGoExtensionLookup(structName, true);
                this.outputService.logDefinitionJump(
                    `${context.document.fileName}:${context.position.line}`,
                    goExtensionResult[0].uri.fsPath,
                    'struct',
                    'go-extension'
                );
                return goExtensionResult;
            } else {
                this.outputService.logGoExtensionLookup(structName, false);
            }
        } catch (error) {
            this.outputService.logGoExtensionLookup(structName, false, String(error));
        }

        // 回退到索引查找
        this.outputService.debug(`📚 Step 2: Trying index lookup for struct: ${structName}`, 'Navigation');
        const goStruct = this.indexService.findGoStructByName(structName);
        if (goStruct) {
            this.outputService.logIndexLookup(structName, true, 'struct');
            const location = new vscode.Location(goStruct.uri, goStruct.range);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                goStruct.uri.fsPath,
                'struct',
                'index'
            );
            return location;
        } else {
            this.outputService.logIndexLookup(structName, false, 'struct');
        }

        // 如果索引中没有找到，尝试实时搜索
        this.outputService.debug(`🔎 Step 3: Trying real-time scan for struct: ${structName}`, 'Navigation');
        const validationResult = await GoUtils.validateGoStruct(structName);
        if (validationResult.exists && validationResult.location) {
            this.outputService.logRealTimeScan(structName, true);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                validationResult.location.uri.fsPath,
                'struct',
                'real-time-scan'
            );
            return validationResult.location;
        } else {
            this.outputService.logRealTimeScan(structName, false);
        }

        this.outputService.warn(`❌ Go struct '${structName}' not found in any lookup method`, 'Navigation');
        return undefined;
    }

    /**
     * 处理UNFOLD指令中的FRAGMENT定义跳转
     */
    private async handleUnfoldDefinition(context: DefinitionContext): Promise<vscode.Definition | undefined> {
        const { lineText, position, word } = context;

        // 检查是否在UNFOLD指令中
        const unfoldRegex = /UNFOLD\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = unfoldRegex.exec(lineText)) !== null) {
            const fragmentName = match[1];
            const matchStart = match.index + lineText.indexOf(`"${fragmentName}"`);
            const matchEnd = matchStart + fragmentName.length + 2; // +2 for quotes

            // 检查光标是否在FRAGMENT名称上
            if (position.character >= matchStart && position.character <= matchEnd && fragmentName === word) {
                this.outputService.debug(`🧩 Detected UNFOLD instruction context for fragment: ${fragmentName}`, 'Navigation');
                this.outputService.debug(`📚 Looking up fragment in index: ${fragmentName}`, 'Navigation');

                const fragment = this.indexService.findFragmentByName(fragmentName);

                if (fragment) {
                    this.outputService.logIndexLookup(fragmentName, true, 'fragment');
                    const fragmentDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(fragment.documentUri));
                    const fragmentPosition = new vscode.Position(fragment.startLine, 0);
                    const location = new vscode.Location(fragmentDocument.uri, fragmentPosition);

                    this.outputService.logDefinitionJump(
                        `${context.document.fileName}:${context.position.line}`,
                        fragmentDocument.uri.fsPath,
                        'fragment',
                        'index'
                    );

                    return location;
                } else {
                    this.outputService.logIndexLookup(fragmentName, false, 'fragment');
                }
            }
        }

        return undefined;
    }

    /**
     * 处理算子调用的定义跳转
     */
    private async handleOperatorCallDefinition(context: DefinitionContext): Promise<vscode.Definition | undefined> {
        const { word } = context;

        // 检查是否是关键字
        if (this.isKeyword(word)) {
            this.outputService.debug(`⏭️ Skipping keyword: ${word}`, 'Navigation');
            return undefined;
        }

        // 检查是否在REGISTER块内（避免在REGISTER块内查找算子调用）
        if (this.isInRegisterBlock(context)) {
            this.outputService.debug(`⏭️ Skipping operator lookup in REGISTER block: ${word}`, 'Navigation');
            return undefined;
        }

        this.outputService.debug(`🎯 Detected potential operator call: ${word}`, 'Navigation');

        // 查找匹配的算子
        this.outputService.debug(`📚 Step 1: Looking up operator in index: ${word}`, 'Navigation');
        const operator = this.indexService.findOperatorByName(word);
        if (!operator) {
            this.outputService.logIndexLookup(word, false, 'operator');
            return undefined;
        }

        this.outputService.logIndexLookup(word, true, 'operator');
        this.outputService.debug(`✅ Found operator: ${operator.name} -> struct: ${operator.structName}`, 'Navigation');

        // 查找对应的Go struct
        this.outputService.debug(`📚 Step 2: Looking up Go struct in index: ${operator.structName}`, 'Navigation');
        const goStruct = this.indexService.findGoStructByName(operator.structName);
        if (goStruct) {
            this.outputService.logIndexLookup(operator.structName, true, 'struct');
            const location = new vscode.Location(goStruct.uri, goStruct.range);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                goStruct.uri.fsPath,
                'operator',
                'index'
            );
            return location;
        } else {
            this.outputService.logIndexLookup(operator.structName, false, 'struct');
        }

        // 如果索引中没有找到，尝试实时搜索
        this.outputService.debug(`🔎 Step 3: Trying real-time scan for struct: ${operator.structName}`, 'Navigation');
        const validationResult = await GoUtils.validateGoStruct(operator.structName);
        if (validationResult.exists && validationResult.location) {
            this.outputService.logRealTimeScan(operator.structName, true);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                validationResult.location.uri.fsPath,
                'operator',
                'real-time-scan'
            );
            return validationResult.location;
        } else {
            this.outputService.logRealTimeScan(operator.structName, false);
        }

        this.outputService.warn(`❌ Go struct '${operator.structName}' for operator '${operator.name}' not found in any lookup method`, 'Navigation');
        return undefined;
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
     * 检查是否在REGISTER块内
     */
    private isInRegisterBlock(context: DefinitionContext): boolean {
        const text = context.document.getText();
        const currentOffset = context.document.offsetAt(context.position);
        
        const registerRegex = /REGISTER\s*\([^)]+\)\s*\{([\s\S]*?)\}/g;
        let match;

        while ((match = registerRegex.exec(text)) !== null) {
            const blockStart = match.index;
            const blockEnd = match.index + match[0].length;
            
            if (currentOffset >= blockStart && currentOffset <= blockEnd) {
                return true;
            }
        }

        return false;
    }
}
