import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Gorch Language Support extension is now active!');

    // 注册命令：格式化 Gorch 文档
    let formatCommand = vscode.commands.registerCommand('gorch.format', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'gorch') {
            vscode.window.showInformationMessage('Gorch formatting is not yet implemented');
        }
    });

    // 注册命令：验证 Gorch 语法
    let validateCommand = vscode.commands.registerCommand('gorch.validate', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'gorch') {
            vscode.window.showInformationMessage('Gorch validation is not yet implemented');
        }
    });

    // 注册文档符号提供器
    let documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
        { scheme: 'file', language: 'gorch' },
        new GorchDocumentSymbolProvider()
    );

    context.subscriptions.push(formatCommand, validateCommand, documentSymbolProvider);
}

export function deactivate() {}

class GorchDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const symbols: vscode.DocumentSymbol[] = [];
        
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            const text = line.text;
            
            // 匹配 START 指令
            const startMatch = text.match(/START\s*\(\s*"([^"]+)"\s*\)/);
            if (startMatch) {
                const symbol = new vscode.DocumentSymbol(
                    `START: ${startMatch[1]}`,
                    '',
                    vscode.SymbolKind.Function,
                    line.range,
                    line.range
                );
                symbols.push(symbol);
            }
            
            // 匹配 FRAGMENT 指令
            const fragmentMatch = text.match(/FRAGMENT\s*\(\s*"([^"]+)"\s*\)/);
            if (fragmentMatch) {
                const symbol = new vscode.DocumentSymbol(
                    `FRAGMENT: ${fragmentMatch[1]}`,
                    '',
                    vscode.SymbolKind.Module,
                    line.range,
                    line.range
                );
                symbols.push(symbol);
            }
            
            // 匹配 REGISTER 指令
            const registerMatch = text.match(/REGISTER\s*\(\s*"([^"]+)"\s*\)/);
            if (registerMatch) {
                const symbol = new vscode.DocumentSymbol(
                    `REGISTER: ${registerMatch[1]}`,
                    '',
                    vscode.SymbolKind.Package,
                    line.range,
                    line.range
                );
                symbols.push(symbol);
            }
        }
        
        return symbols;
    }
}
