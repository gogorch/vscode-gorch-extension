/**
 * 文档符号提供器
 * 为大纲视图提供符号信息
 */

import * as vscode from 'vscode';
import { OutputService } from '../services/outputService';

export class GorchDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private outputService: OutputService;

    constructor() {
        this.outputService = OutputService.getInstance();
    }

    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        
        try {
            // 解析START指令
            this.parseStartSymbols(document, symbols);
            
            // 解析FRAGMENT指令
            this.parseFragmentSymbols(document, symbols);
            
            // 解析REGISTER指令
            this.parseRegisterSymbols(document, symbols);

            this.outputService.debug(`Found ${symbols.length} symbols in ${document.fileName}`);
            
        } catch (error) {
            this.outputService.error(`Error parsing document symbols: ${error}`);
        }
        
        return symbols;
    }

    /**
     * 解析START指令符号
     */
    private parseStartSymbols(document: vscode.TextDocument, symbols: vscode.DocumentSymbol[]): void {
        const text = document.getText();
        const startRegex = /START\s*\(\s*"([^"]+)"[^)]*\)\s*\{/g;
        let match;

        while ((match = startRegex.exec(text)) !== null) {
            const startName = match[1];
            const startPos = document.positionAt(match.index);
            
            // 找到对应的结束大括号
            const endPos = this.findMatchingBrace(text, match.index + match[0].length - 1);
            const endPosition = endPos ? document.positionAt(endPos) : startPos;
            
            const range = new vscode.Range(startPos, endPosition);
            const selectionRange = new vscode.Range(
                startPos,
                document.positionAt(match.index + match[0].length)
            );

            const symbol = new vscode.DocumentSymbol(
                `START: ${startName}`,
                'Entry point for execution flow',
                vscode.SymbolKind.Function,
                range,
                selectionRange
            );

            // 解析START块内的子符号
            this.parseStartBlockChildren(document, symbol, match.index, endPos || match.index + match[0].length);
            
            symbols.push(symbol);
        }
    }

    /**
     * 解析FRAGMENT指令符号
     */
    private parseFragmentSymbols(document: vscode.TextDocument, symbols: vscode.DocumentSymbol[]): void {
        const text = document.getText();
        const fragmentRegex = /FRAGMENT\s*\(\s*"([^"]+)"\s*\)\s*\{/g;
        let match;

        while ((match = fragmentRegex.exec(text)) !== null) {
            const fragmentName = match[1];
            const startPos = document.positionAt(match.index);
            
            // 找到对应的结束大括号
            const endPos = this.findMatchingBrace(text, match.index + match[0].length - 1);
            const endPosition = endPos ? document.positionAt(endPos) : startPos;
            
            const range = new vscode.Range(startPos, endPosition);
            const selectionRange = new vscode.Range(
                startPos,
                document.positionAt(match.index + match[0].length)
            );

            const symbol = new vscode.DocumentSymbol(
                `FRAGMENT: ${fragmentName}`,
                'Reusable code fragment',
                vscode.SymbolKind.Module,
                range,
                selectionRange
            );

            symbols.push(symbol);
        }
    }

    /**
     * 解析REGISTER指令符号
     */
    private parseRegisterSymbols(document: vscode.TextDocument, symbols: vscode.DocumentSymbol[]): void {
        const text = document.getText();
        const registerRegex = /REGISTER\s*\(\s*"([^"]+)"\s*\)\s*\{([\s\S]*?)\}/g;
        let match;

        while ((match = registerRegex.exec(text)) !== null) {
            const packagePath = match[1];
            const registerBlock = match[2];
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            
            const range = new vscode.Range(startPos, endPos);
            const selectionRange = new vscode.Range(
                startPos,
                document.positionAt(match.index + match[0].indexOf('{'))
            );

            const symbol = new vscode.DocumentSymbol(
                `REGISTER: ${packagePath}`,
                'Operator registration block',
                vscode.SymbolKind.Package,
                range,
                selectionRange
            );

            // 解析REGISTER块内的OPERATOR符号
            this.parseOperatorSymbols(document, symbol, registerBlock, match.index);
            
            symbols.push(symbol);
        }
    }

    /**
     * 解析OPERATOR符号
     */
    private parseOperatorSymbols(
        document: vscode.TextDocument, 
        parentSymbol: vscode.DocumentSymbol, 
        registerBlock: string,
        blockStartIndex: number
    ): void {
        const operatorRegex = /OPERATOR\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g;
        let match;

        while ((match = operatorRegex.exec(registerBlock)) !== null) {
            const filePath = match[1];
            const structName = match[2];
            const operatorName = match[3];
            const sequence = match[4];

            const operatorStartIndex = blockStartIndex + match.index;
            const startPos = document.positionAt(operatorStartIndex);
            const endPos = document.positionAt(operatorStartIndex + match[0].length);
            
            const range = new vscode.Range(startPos, endPos);

            const operatorSymbol = new vscode.DocumentSymbol(
                `${operatorName} (${sequence})`,
                `${structName} -> ${filePath}`,
                vscode.SymbolKind.Operator,
                range,
                range
            );

            parentSymbol.children.push(operatorSymbol);
        }
    }

    /**
     * 解析START块内的子符号
     */
    private parseStartBlockChildren(
        document: vscode.TextDocument,
        parentSymbol: vscode.DocumentSymbol,
        blockStartIndex: number,
        blockEndIndex: number
    ): void {
        const text = document.getText();
        const blockText = text.substring(blockStartIndex, blockEndIndex);

        // 解析ON_FINISH块
        const onFinishRegex = /ON_FINISH\s*\(\s*\)\s*\{/g;
        let match;

        while ((match = onFinishRegex.exec(blockText)) !== null) {
            const startPos = document.positionAt(blockStartIndex + match.index);
            const endBracePos = this.findMatchingBrace(blockText, match.index + match[0].length - 1);
            const endPos = endBracePos ? 
                document.positionAt(blockStartIndex + endBracePos) : 
                startPos;
            
            const range = new vscode.Range(startPos, endPos);

            const onFinishSymbol = new vscode.DocumentSymbol(
                'ON_FINISH',
                'Cleanup operations',
                vscode.SymbolKind.Event,
                range,
                new vscode.Range(startPos, document.positionAt(blockStartIndex + match.index + match[0].length))
            );

            parentSymbol.children.push(onFinishSymbol);
        }

        // 解析UNFOLD指令
        const unfoldRegex = /UNFOLD\s*\(\s*"([^"]+)"\s*\)/g;
        while ((match = unfoldRegex.exec(blockText)) !== null) {
            const fragmentName = match[1];
            const startPos = document.positionAt(blockStartIndex + match.index);
            const endPos = document.positionAt(blockStartIndex + match.index + match[0].length);
            
            const range = new vscode.Range(startPos, endPos);

            const unfoldSymbol = new vscode.DocumentSymbol(
                `UNFOLD: ${fragmentName}`,
                'Fragment expansion',
                vscode.SymbolKind.Method,
                range,
                range
            );

            parentSymbol.children.push(unfoldSymbol);
        }
    }

    /**
     * 找到匹配的大括号位置
     */
    private findMatchingBrace(text: string, startIndex: number): number | undefined {
        let braceCount = 1;
        let index = startIndex + 1;

        while (index < text.length && braceCount > 0) {
            if (text[index] === '{') {
                braceCount++;
            } else if (text[index] === '}') {
                braceCount--;
            }
            index++;
        }

        return braceCount === 0 ? index - 1 : undefined;
    }
}
