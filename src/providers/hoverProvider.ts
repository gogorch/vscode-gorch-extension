/**
 * 悬停提供器
 * 处理鼠标悬停时显示Go struct信息的功能
 */

import * as vscode from 'vscode';
import { OperatorInfo, DefinitionContext, OperatorMatch } from '../models/types';
import { IndexService } from '../services/indexService';
import { OutputService } from '../services/outputService';
import { GoUtils } from '../utils/goUtils';

export class GorchHoverProvider implements vscode.HoverProvider {
    private indexService: IndexService;
    private outputService: OutputService;

    constructor() {
        this.indexService = IndexService.getInstance();
        this.outputService = OutputService.getInstance();
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        // 仅处理 .gorch 文件
        if (document.languageId !== 'gorch') {
            return undefined;
        }

        const context = this.createHoverContext(document, position);
        if (!context) {
            return undefined;
        }

        this.outputService.debug(`Hover request for word: ${context.word} at ${context.position.line}:${context.position.character}`);

        // 检查是否在OPERATOR指令中的struct名称
        const operatorMatch = this.parseOperatorInstruction(context);
        if (operatorMatch) {
            return await this.createStructHover(operatorMatch.structName, context.wordRange);
        }

        // 检查是否是START块内的算子调用
        const operatorHover = await this.handleOperatorHover(context);
        if (operatorHover) {
            return operatorHover;
        }

        return undefined;
    }

    /**
     * 创建悬停上下文
     */
    private createHoverContext(document: vscode.TextDocument, position: vscode.Position): DefinitionContext | undefined {
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
     * 处理算子悬停
     */
    private async handleOperatorHover(context: DefinitionContext): Promise<vscode.Hover | undefined> {
        const { word, wordRange } = context;

        // 检查是否是关键字
        if (this.isKeyword(word)) {
            return undefined;
        }

        // 检查是否在REGISTER块内（避免在REGISTER块内处理算子悬停）
        if (this.isInRegisterBlock(context)) {
            return undefined;
        }

        // 查找匹配的算子
        const operator = this.indexService.findOperatorByName(word);
        if (!operator) {
            return undefined;
        }

        this.outputService.debug(`Found operator for hover: ${operator.name} -> ${operator.structName}`);

        return await this.createStructHover(operator.structName, wordRange, operator);
    }

    /**
     * 创建Go struct的悬停信息
     */
    private async createStructHover(
        structName: string, 
        range: vscode.Range, 
        operator?: OperatorInfo
    ): Promise<vscode.Hover | undefined> {
        
        // 查找Go struct信息
        const goStruct = this.indexService.findGoStructByName(structName);
        
        let structInfo = '';
        let structDefinition = '';

        if (goStruct) {
            // 从索引中获取信息
            structInfo = `**Go Struct**: \`${structName}\`\n\n`;
            structInfo += `**Package**: \`${goStruct.packagePath}\`\n\n`;
            structInfo += `**File**: \`${goStruct.filePath}\`\n\n`;
            
            // 尝试获取struct的详细定义
            try {
                const document = await vscode.workspace.openTextDocument(goStruct.uri);
                const structDef = await this.extractStructDefinition(document, goStruct.range, structName);
                if (structDef) {
                    structDefinition = `**Definition**:\n\`\`\`go\n${structDef}\n\`\`\`\n\n`;
                }
            } catch (error) {
                this.outputService.debug(`Failed to read struct definition: ${error}`);
            }
        } else {
            // 尝试实时搜索
            const validationResult = await GoUtils.validateGoStruct(structName);
            if (validationResult.exists && validationResult.location) {
                structInfo = `**Go Struct**: \`${structName}\`\n\n`;
                structInfo += `**File**: \`${validationResult.location.uri.fsPath}\`\n\n`;
                
                try {
                    const document = await vscode.workspace.openTextDocument(validationResult.location.uri);
                    const structDef = await this.extractStructDefinition(document, validationResult.location.range, structName);
                    if (structDef) {
                        structDefinition = `**Definition**:\n\`\`\`go\n${structDef}\n\`\`\`\n\n`;
                    }
                } catch (error) {
                    this.outputService.debug(`Failed to read struct definition: ${error}`);
                }
            } else {
                structInfo = `**Go Struct**: \`${structName}\` *(not found)*\n\n`;
            }
        }

        // 如果有算子信息，添加算子相关信息
        let operatorInfo = '';
        if (operator) {
            operatorInfo = `**Operator**: \`${operator.name}\`\n\n`;
            operatorInfo += `**Sequence**: \`${operator.sequence}\`\n\n`;
            operatorInfo += `**Package**: \`${operator.packagePath}\`\n\n`;
        }

        const hoverContent = new vscode.MarkdownString();
        hoverContent.isTrusted = true;
        hoverContent.supportHtml = true;
        
        let content = '';
        if (operatorInfo) {
            content += operatorInfo;
        }
        content += structInfo;
        if (structDefinition) {
            content += structDefinition;
        }

        if (!content.trim()) {
            return undefined;
        }

        hoverContent.appendMarkdown(content);

        return new vscode.Hover(hoverContent, range);
    }

    /**
     * 提取struct定义
     */
    private async extractStructDefinition(
        document: vscode.TextDocument, 
        range: vscode.Range, 
        structName: string
    ): Promise<string | undefined> {
        try {
            const text = document.getText();
            const startOffset = document.offsetAt(range.start);
            
            // 查找struct定义的开始
            const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*\\{`, 'g');
            structRegex.lastIndex = Math.max(0, startOffset - 100); // 从稍早的位置开始搜索
            
            const match = structRegex.exec(text);
            if (!match) {
                return undefined;
            }

            const structStart = match.index;
            const braceStart = match.index + match[0].length - 1; // 开始大括号的位置
            
            // 找到匹配的结束大括号
            let braceCount = 1;
            let index = braceStart + 1;
            
            while (index < text.length && braceCount > 0) {
                if (text[index] === '{') {
                    braceCount++;
                } else if (text[index] === '}') {
                    braceCount--;
                }
                index++;
            }
            
            if (braceCount === 0) {
                const structEnd = index;
                let structDef = text.substring(structStart, structEnd);
                
                // 限制显示的行数，避免过长
                const lines = structDef.split('\n');
                if (lines.length > 20) {
                    structDef = lines.slice(0, 20).join('\n') + '\n    // ... (truncated)';
                }
                
                return structDef;
            }
        } catch (error) {
            this.outputService.debug(`Error extracting struct definition: ${error}`);
        }
        
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
