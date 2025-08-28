/**
 * 增强的定义提供器
 * 处理Go to Definition功能，支持算子跳转和OPERATOR指令中struct名称跳转
 */

import * as vscode from 'vscode';
import { OperatorInfo, FragmentInfo, DefinitionContext, OperatorMatch } from '../models/types';
import { IndexService } from '../services/indexService';
import { OutputService } from '../services/outputService';
import { GoUtils } from '../utils/goUtils';

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

        this.outputService.debug(`Definition request for word: ${context.word} at ${context.position.line}:${context.position.character}`);

        // 检查是否在OPERATOR指令中
        const operatorMatch = this.parseOperatorInstruction(context);
        if (operatorMatch) {
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

        this.outputService.debug(`No definition found for: ${context.word}`);
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
        
        // 检查当前行是否包含OPERATOR指令
        const operatorRegex = /OPERATOR\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/;
        const match = operatorRegex.exec(lineText);
        
        if (!match) {
            return undefined;
        }

        // 计算各个参数在行中的位置
        const fullMatch = match[0];
        const startIndex = lineText.indexOf(fullMatch);
        
        // 找到第二个参数（struct名称）的位置
        const firstQuoteEnd = lineText.indexOf('"', startIndex) + 1;
        const firstParamEnd = lineText.indexOf('"', firstQuoteEnd);
        const secondQuoteStart = lineText.indexOf('"', firstParamEnd + 1);
        const secondQuoteEnd = lineText.indexOf('"', secondQuoteStart + 1);

        // 检查光标是否在第二个参数（struct名称）上
        if (position.character >= secondQuoteStart && position.character <= secondQuoteEnd) {
            return {
                fullMatch: fullMatch,
                packagePath: match[1],
                structName: match[2],
                operatorName: match[3],
                sequence: match[4],
                startIndex: startIndex,
                endIndex: startIndex + fullMatch.length,
                structNameStart: secondQuoteStart + 1,
                structNameEnd: secondQuoteEnd
            };
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
        this.outputService.debug(`Looking for Go struct: ${structName}`);

        // 首先尝试使用Go扩展查找
        try {
            const goExtensionResult = await GoUtils.findStructUsingGoExtension(structName);
            if (goExtensionResult && goExtensionResult.length > 0) {
                this.outputService.logDefinitionJump(
                    `${context.document.fileName}:${context.position.line}`,
                    goExtensionResult[0].uri.fsPath,
                    'struct'
                );
                return goExtensionResult;
            }
        } catch (error) {
            this.outputService.warn(`Go extension lookup failed: ${error}`);
        }

        // 回退到索引查找
        const goStruct = this.indexService.findGoStructByName(structName);
        if (goStruct) {
            const location = new vscode.Location(goStruct.uri, goStruct.range);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                goStruct.uri.fsPath,
                'struct'
            );
            return location;
        }

        // 如果索引中没有找到，尝试实时搜索
        const validationResult = await GoUtils.validateGoStruct(structName);
        if (validationResult.exists && validationResult.location) {
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                validationResult.location.uri.fsPath,
                'struct'
            );
            return validationResult.location;
        }

        this.outputService.warn(`Go struct '${structName}' not found`);
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
                const fragment = this.indexService.findFragmentByName(fragmentName);
                
                if (fragment) {
                    const fragmentDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(fragment.documentUri));
                    const fragmentPosition = new vscode.Position(fragment.startLine, 0);
                    const location = new vscode.Location(fragmentDocument.uri, fragmentPosition);
                    
                    this.outputService.logDefinitionJump(
                        `${context.document.fileName}:${context.position.line}`,
                        fragmentDocument.uri.fsPath,
                        'fragment'
                    );
                    
                    return location;
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
            return undefined;
        }

        // 检查是否在REGISTER块内（避免在REGISTER块内查找算子调用）
        if (this.isInRegisterBlock(context)) {
            return undefined;
        }

        // 查找匹配的算子
        const operator = this.indexService.findOperatorByName(word);
        if (!operator) {
            return undefined;
        }

        this.outputService.debug(`Found operator: ${operator.name} -> ${operator.structName}`);

        // 查找对应的Go struct
        const goStruct = this.indexService.findGoStructByName(operator.structName);
        if (goStruct) {
            const location = new vscode.Location(goStruct.uri, goStruct.range);
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                goStruct.uri.fsPath,
                'operator'
            );
            return location;
        }

        // 如果索引中没有找到，尝试实时搜索
        const validationResult = await GoUtils.validateGoStruct(operator.structName);
        if (validationResult.exists && validationResult.location) {
            this.outputService.logDefinitionJump(
                `${context.document.fileName}:${context.position.line}`,
                validationResult.location.uri.fsPath,
                'operator'
            );
            return validationResult.location;
        }

        this.outputService.warn(`Go struct '${operator.structName}' for operator '${operator.name}' not found`);
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
