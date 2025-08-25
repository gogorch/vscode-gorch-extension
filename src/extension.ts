import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
    let validateCommand = vscode.commands.registerCommand('gorch.validate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'gorch') {
            const provider = new GorchDefinitionProvider();
            const operators = await (provider as any).parseAllOperators();
            vscode.window.showInformationMessage(`Found ${operators.length} operators across all .gorch files: ${operators.map((op: any) => op.name).join(', ')}`);
        }
    });

    // 注册文档符号提供器
    let documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
        { scheme: 'file', language: 'gorch' },
        new GorchDocumentSymbolProvider()
    );

    // 注册定义提供器（Go to Definition）
    let definitionProvider = vscode.languages.registerDefinitionProvider(
        { scheme: 'file', language: 'gorch' },
        new GorchDefinitionProvider()
    );

    // 注册引用提供器（Go to References）- 支持从 Go 文件查找 Gorch 中的引用
    let referenceProvider = vscode.languages.registerReferenceProvider(
        { scheme: 'file', language: 'go' },
        new GoToGorchReferenceProvider()
    );

    // 注册重命名提供器（Rename）- 支持 Go struct 重命名时同步更新 Gorch 文件
    let renameProvider = vscode.languages.registerRenameProvider(
        { scheme: 'file', language: 'go' },
        new GoStructRenameProvider()
    );

    // 注册诊断提供器（错误检查）
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('gorch');
    const diagnosticProvider = new GorchDiagnosticProvider(diagnosticCollection);

    // 监听文档变化，实时检查错误
    let documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (event.document.languageId === 'gorch') {
            await diagnosticProvider.updateDiagnostics(event.document);
        }
    });

    // 监听文档打开，检查错误
    let documentOpenListener = vscode.workspace.onDidOpenTextDocument(async (document) => {
        if (document.languageId === 'gorch') {
            await diagnosticProvider.updateDiagnostics(document);
        }
    });

    context.subscriptions.push(
        formatCommand,
        validateCommand,
        documentSymbolProvider,
        definitionProvider,
        referenceProvider,
        renameProvider,
        diagnosticCollection,
        documentChangeListener,
        documentOpenListener
    );
}

export function deactivate() {}

// 诊断提供器
class GorchDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private definitionProvider: GorchDefinitionProvider;

    constructor(diagnosticCollection: vscode.DiagnosticCollection) {
        this.diagnosticCollection = diagnosticCollection;
        this.definitionProvider = new GorchDefinitionProvider();
    }

    async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        const diagnostics: vscode.Diagnostic[] = [];

        try {
            // 获取所有算子注册信息
            const allOperators = await this.definitionProvider.parseAllOperators();

            // 检查算子序号唯一性
            this.checkOperatorSequenceUniqueness(allOperators, diagnostics, document);

            // 检查算子名称唯一性
            this.checkOperatorNameUniqueness(allOperators, diagnostics, document);

            // 检查未注册的算子使用
            await this.checkUnregisteredOperators(document, allOperators, diagnostics);

            // 检查 UNFOLD 指令的 FRAGMENT 匹配
            await this.checkUnfoldFragmentMatching(document, diagnostics);

            // 检查 REGISTER 块中的 Go struct 存在性
            await this.checkGoStructExistence(document, allOperators, diagnostics);

            // 检查算子使用中的 Go struct 存在性（警告级别）
            await this.checkOperatorGoStructWarnings(document, allOperators, diagnostics);

        } catch (error) {
            console.error('Error updating diagnostics:', error);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    // 检查算子序号唯一性
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

    // 检查算子名称唯一性
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

    // 检查未注册的算子使用
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

    // 查找算子在文档中的位置范围
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

    // 获取所有 REGISTER 块的范围
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

    // 检查位置是否在 REGISTER 块内
    private isInRegisterBlock(position: vscode.Position, registerRanges: vscode.Range[]): boolean {
        return registerRanges.some(range => range.contains(position));
    }

    // 检查是否为关键字
    private isKeyword(word: string): boolean {
        const keywords = [
            'START', 'FRAGMENT', 'REGISTER', 'OPERATOR', 'ON_FINISH', 'UNFOLD',
            'GO', 'WAIT', 'SKIP', 'SWITCH', 'CASE', 'WRAP', 'NO_CHECK_MISS'
        ];
        return keywords.includes(word);
    }

    // 转义正则表达式特殊字符
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 检查 UNFOLD 指令的 FRAGMENT 匹配
    private async checkUnfoldFragmentMatching(
        document: vscode.TextDocument,
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const text = document.getText();

        // 获取所有 FRAGMENT 定义
        const allFragments = await this.parseAllFragments();
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

    // 解析工作区中所有 .gorch 文件的 FRAGMENT 定义
    private async parseAllFragments(): Promise<FragmentInfo[]> {
        const allFragments: FragmentInfo[] = [];

        // 查找工作区中所有 .gorch 文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('No workspace folders found for fragment parsing');
            return allFragments;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    const fragments = this.parseFragments(document);
                    allFragments.push(...fragments);
                    console.log(`Parsed ${fragments.length} fragments from ${gorchFile.fsPath}`);
                } catch (error) {
                    console.error(`Failed to parse fragments from ${gorchFile.fsPath}:`, error);
                }
            }
        }

        console.log(`Total fragments found across all files: ${allFragments.length}`);
        return allFragments;
    }

    // 解析单个文档中的 FRAGMENT 定义
    private parseFragments(document: vscode.TextDocument): FragmentInfo[] {
        const fragments: FragmentInfo[] = [];
        const text = document.getText();

        // 匹配 FRAGMENT 定义
        const fragmentRegex = /FRAGMENT\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = fragmentRegex.exec(text)) !== null) {
            const fragmentName = match[1];
            const position = document.positionAt(match.index);

            const fragment: FragmentInfo = {
                name: fragmentName,
                documentUri: document.uri.toString(),
                startLine: position.line
            };

            console.log('Found fragment:', fragment);
            fragments.push(fragment);
        }

        return fragments;
    }

    // 检查是否是 UNFOLD 指令中的 FRAGMENT 名称，如果是则返回 FRAGMENT 定义位置
    private async checkUnfoldFragmentDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string
    ): Promise<vscode.Location | undefined> {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // 检查当前位置是否在 UNFOLD 指令中
        const unfoldRegex = /UNFOLD\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = unfoldRegex.exec(lineText)) !== null) {
            const fragmentName = match[1];
            const matchStart = match.index + lineText.indexOf(`"${fragmentName}"`);
            const matchEnd = matchStart + fragmentName.length + 2; // +2 for quotes

            // 检查光标是否在 FRAGMENT 名称上（包括引号）
            if (position.character >= matchStart && position.character <= matchEnd && fragmentName === word) {
                // 查找对应的 FRAGMENT 定义
                const allFragments = await this.parseAllFragments();
                const targetFragment = allFragments.find(f => f.name === fragmentName);

                if (targetFragment) {
                    const fragmentDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetFragment.documentUri));
                    const fragmentPosition = new vscode.Position(targetFragment.startLine, 0);
                    return new vscode.Location(fragmentDocument.uri, fragmentPosition);
                }
            }
        }

        return undefined;
    }

    // 检查 REGISTER 块中的 Go struct 是否存在
    private async checkGoStructExistence(
        document: vscode.TextDocument,
        operators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        // 只检查当前文档中定义的算子
        const currentDocOperators = operators.filter(op => op.documentUri === document.uri.toString());

        for (const operator of currentDocOperators) {
            const structExists = await this.findGoStructExists(operator);

            if (!structExists) {
                const range = this.findOperatorRange(document, operator);
                if (range) {
                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Go struct '${operator.structName}' not found in package '${operator.packagePath}'. Please ensure the struct exists and is accessible.`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'go-struct-not-found';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    // 检查 Go struct 是否存在
    private async findGoStructExists(operator: OperatorInfo): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return false;
        }

        // 构建可能的搜索路径
        const searchPaths = [
            // 当前项目中的路径
            operator.filePath,
            operator.packagePath.replace(/^github\.com\/[^\/]+\/[^\/]+\//, ''),
            operator.packagePath.split('/').slice(-1)[0], // 包名
            operator.packagePath.split('/').slice(-2).join('/'), // 最后两级路径
        ];

        // 搜索 Go 文件
        for (const workspaceFolder of workspaceFolders) {
            // 1. 在指定路径中搜索
            for (const searchPath of searchPaths) {
                const found = await this.searchGoStructInPath(workspaceFolder, searchPath, operator.structName);
                if (found) {
                    return true;
                }
            }

            // 2. 全局搜索所有 Go 文件
            const goFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.go'),
                '**/node_modules/**'
            );

            for (const goFile of goFiles) {
                const found = await this.findStructInGoFile(goFile, operator.structName);
                if (found) {
                    return true;
                }
            }
        }

        // 3. 检查 GOPATH 和模块缓存（简化版本）
        // 这里可以扩展为检查 go.mod 依赖和 GOPATH
        return false;
    }

    // 在指定路径中搜索 Go struct
    private async searchGoStructInPath(
        workspaceFolder: vscode.WorkspaceFolder,
        searchPath: string,
        structName: string
    ): Promise<boolean> {
        const possiblePaths = [
            path.join(searchPath, `${structName.toLowerCase()}.go`),
            path.join(searchPath, 'types.go'),
            path.join(searchPath, 'models.go'),
            path.join(searchPath, 'structs.go'),
            `${searchPath}.go`
        ];

        for (const relativePath of possiblePaths) {
            const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);

            if (fs.existsSync(fullPath)) {
                const uri = vscode.Uri.file(fullPath);
                const found = await this.findStructInGoFile(uri, structName);
                if (found) {
                    return true;
                }
            }
        }

        return false;
    }

    // 在 Go 文件中查找 struct 定义
    private async findStructInGoFile(uri: vscode.Uri, structName: string): Promise<boolean> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();

            // 匹配 struct 定义
            const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*\\{`, 'g');
            const match = structRegex.exec(text);

            return match !== null;
        } catch (error) {
            // 文件读取失败，忽略
            return false;
        }
    }

    // 检查算子使用中的 Go struct 存在性（警告级别）
    private async checkOperatorGoStructWarnings(
        document: vscode.TextDocument,
        allOperators: OperatorInfo[],
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const text = document.getText();
        const registeredOperators = new Map<string, OperatorInfo>();

        // 建立算子名称到算子信息的映射
        allOperators.forEach(op => {
            registeredOperators.set(op.name, op);
        });

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

            // 检查是否为已注册的算子
            const operatorInfo = registeredOperators.get(operatorName);
            if (operatorInfo) {
                // 算子已注册，检查对应的 Go struct 是否存在
                const structExists = await this.findGoStructExists(operatorInfo);

                if (!structExists) {
                    const range = new vscode.Range(
                        position,
                        document.positionAt(match.index + operatorName.length)
                    );

                    const diagnostic = new vscode.Diagnostic(
                        range,
                        `Operator '${operatorName}' is registered but Go struct '${operatorInfo.structName}' not found in package '${operatorInfo.packagePath}'. Please ensure the struct exists.`,
                        vscode.DiagnosticSeverity.Warning
                    );
                    diagnostic.code = 'operator-struct-not-found';
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    // 从 URI 中提取文件名
    private getFileNameFromUri(uriString: string): string {
        try {
            const uri = vscode.Uri.parse(uriString);
            return path.basename(uri.fsPath);
        } catch (error) {
            return 'unknown';
        }
    }
}

// Go 到 Gorch 引用提供器
class GoToGorchReferenceProvider implements vscode.ReferenceProvider {
    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];

        // 获取当前位置的单词（Go struct 名称）
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return references;
        }

        const structName = document.getText(wordRange);
        console.log('Looking for Gorch references to Go struct:', structName);

        // 检查是否是 struct 定义
        const line = document.lineAt(position.line);
        const isStructDefinition = /type\s+\w+\s+struct/.test(line.text);

        if (!isStructDefinition) {
            return references;
        }

        // 查找所有 .gorch 文件中对该 struct 的引用
        const gorchReferences = await this.findGorchReferences(structName);
        references.push(...gorchReferences);

        return references;
    }

    // 在所有 .gorch 文件中查找对指定 struct 的引用
    private async findGorchReferences(structName: string): Promise<vscode.Location[]> {
        const references: vscode.Location[] = [];

        // 查找工作区中所有 .gorch 文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return references;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    const fileReferences = this.findStructReferencesInDocument(document, structName);
                    references.push(...fileReferences);
                } catch (error) {
                    console.error(`Failed to search references in ${gorchFile.fsPath}:`, error);
                }
            }
        }

        console.log(`Found ${references.length} Gorch references to struct ${structName}`);
        return references;
    }

    // 在单个 .gorch 文档中查找 struct 引用
    private findStructReferencesInDocument(document: vscode.TextDocument, structName: string): vscode.Location[] {
        const references: vscode.Location[] = [];
        const text = document.getText();

        // 1. 在 REGISTER 块中查找 OPERATOR 定义
        const operatorRegex = new RegExp(`OPERATOR\\s*\\([^)]*"${this.escapeRegex(structName)}"[^)]*\\)`, 'g');
        let match;

        while ((match = operatorRegex.exec(text)) !== null) {
            // 找到 struct 名称在 OPERATOR 定义中的精确位置
            const operatorText = match[0];
            const structIndex = operatorText.indexOf(`"${structName}"`);

            if (structIndex !== -1) {
                const absoluteIndex = match.index + structIndex + 1; // +1 跳过引号
                const position = document.positionAt(absoluteIndex);
                const range = new vscode.Range(
                    position,
                    document.positionAt(absoluteIndex + structName.length)
                );

                references.push(new vscode.Location(document.uri, range));
            }
        }

        // 2. 查找算子调用（通过 REGISTER 信息间接关联）
        // 这需要先解析所有算子注册信息，然后查找对应的算子调用
        const operatorCalls = this.findOperatorCallsForStruct(document, structName);
        references.push(...operatorCalls);

        return references;
    }

    // 查找与指定 struct 关联的算子调用
    private findOperatorCallsForStruct(document: vscode.TextDocument, structName: string): vscode.Location[] {
        const references: vscode.Location[] = [];
        const text = document.getText();

        // 首先找到所有使用该 struct 的算子名称
        const operatorNames: string[] = [];
        const operatorRegex = /OPERATOR\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g;
        let match;

        while ((match = operatorRegex.exec(text)) !== null) {
            if (match[2] === structName) {
                operatorNames.push(match[3]); // 算子名称
            }
        }

        // 然后查找这些算子的调用
        for (const operatorName of operatorNames) {
            const callRegex = new RegExp(`\\b${this.escapeRegex(operatorName)}\\s*\\(`, 'g');
            let callMatch;

            while ((callMatch = callRegex.exec(text)) !== null) {
                const position = document.positionAt(callMatch.index);
                const range = new vscode.Range(
                    position,
                    document.positionAt(callMatch.index + operatorName.length)
                );

                // 确保不在 REGISTER 块内
                if (!this.isInRegisterBlock(position, document)) {
                    references.push(new vscode.Location(document.uri, range));
                }
            }
        }

        return references;
    }

    // 检查位置是否在 REGISTER 块内
    private isInRegisterBlock(position: vscode.Position, document: vscode.TextDocument): boolean {
        const text = document.getText();
        const registerRanges: vscode.Range[] = [];
        const registerRegex = /REGISTER\s*\([^)]+\)\s*\{([\s\S]*?)\}/g;
        let match;

        while ((match = registerRegex.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + match[0].length);
            registerRanges.push(new vscode.Range(startPos, endPos));
        }

        return registerRanges.some(range => range.contains(position));
    }

    // 转义正则表达式特殊字符
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Go Struct 重命名提供器
class GoStructRenameProvider implements vscode.RenameProvider {
    async provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken
    ): Promise<vscode.WorkspaceEdit | undefined> {

        // 获取当前位置的单词（Go struct 名称）
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        const oldStructName = document.getText(wordRange);
        console.log(`Renaming Go struct from '${oldStructName}' to '${newName}'`);

        // 检查是否是 struct 定义
        const line = document.lineAt(position.line);
        const isStructDefinition = /type\s+\w+\s+struct/.test(line.text);

        if (!isStructDefinition) {
            return undefined;
        }

        // 创建工作区编辑
        const workspaceEdit = new vscode.WorkspaceEdit();

        // 1. 重命名 Go 文件中的 struct
        workspaceEdit.replace(document.uri, wordRange, newName);

        // 2. 查找并更新所有 .gorch 文件中的引用
        await this.updateGorchReferences(workspaceEdit, oldStructName, newName);

        return workspaceEdit;
    }

    async prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Range | { range: vscode.Range; placeholder: string } | undefined> {

        // 获取当前位置的单词
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }

        // 检查是否是 struct 定义
        const line = document.lineAt(position.line);
        const isStructDefinition = /type\s+\w+\s+struct/.test(line.text);

        if (!isStructDefinition) {
            throw new Error('Rename is only supported on struct definitions');
        }

        const structName = document.getText(wordRange);
        return {
            range: wordRange,
            placeholder: structName
        };
    }

    // 更新所有 .gorch 文件中的 struct 引用
    private async updateGorchReferences(
        workspaceEdit: vscode.WorkspaceEdit,
        oldStructName: string,
        newStructName: string
    ): Promise<void> {

        // 查找工作区中所有 .gorch 文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    this.updateStructReferencesInDocument(workspaceEdit, document, oldStructName, newStructName);
                } catch (error) {
                    console.error(`Failed to update references in ${gorchFile.fsPath}:`, error);
                }
            }
        }
    }

    // 在单个 .gorch 文档中更新 struct 引用
    private updateStructReferencesInDocument(
        workspaceEdit: vscode.WorkspaceEdit,
        document: vscode.TextDocument,
        oldStructName: string,
        newStructName: string
    ): void {
        const text = document.getText();

        // 在 REGISTER 块中查找并替换 OPERATOR 定义中的 struct 名称
        const operatorRegex = new RegExp(
            `(OPERATOR\\s*\\([^)]*)"${this.escapeRegex(oldStructName)}"([^)]*)\\)`,
            'g'
        );
        let match;

        while ((match = operatorRegex.exec(text)) !== null) {
            // 找到 struct 名称在 OPERATOR 定义中的精确位置
            const beforeStruct = match[1];
            const afterStruct = match[2];
            const structStartIndex = match.index + beforeStruct.length + 1; // +1 跳过引号
            const structEndIndex = structStartIndex + oldStructName.length;

            const range = new vscode.Range(
                document.positionAt(structStartIndex),
                document.positionAt(structEndIndex)
            );

            workspaceEdit.replace(document.uri, range, newStructName);
            console.log(`Updating struct reference in ${document.uri.fsPath}: ${oldStructName} -> ${newStructName}`);
        }
    }

    // 转义正则表达式特殊字符
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// 算子注册信息接口
interface OperatorInfo {
    name: string;           // 算子名称
    structName: string;     // Go struct 名称
    packagePath: string;    // 包路径
    filePath: string;       // 相对文件路径
    sequence: string;       // 算子序号
    documentUri: string;    // 文档URI
}

// FRAGMENT 信息接口
interface FragmentInfo {
    name: string;           // FRAGMENT 名称
    documentUri: string;    // 文档URI
    startLine: number;      // 开始行号
}

// Gorch 定义提供器
class GorchDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {

        console.log('provideDefinition called for position:', position);

        // 获取当前位置的单词
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            console.log('No word range found at position');
            return undefined;
        }

        const word = document.getText(wordRange);
        console.log('Word at position:', word);

        // 解析工作区中所有 .gorch 文件的算子注册信息
        const operators = await this.parseAllOperators();

        // 首先检查是否是 UNFOLD 指令中的 FRAGMENT 名称
        const unfoldLocation = await this.checkUnfoldFragmentDefinition(document, position, word);
        if (unfoldLocation) {
            console.log('Found UNFOLD fragment location:', unfoldLocation.uri.fsPath);
            return unfoldLocation;
        }

        // 查找匹配的算子
        const operator = operators.find((op: OperatorInfo) => op.name === word);
        if (!operator) {
            console.log('No operator found for word:', word);
            console.log('Available operators:', operators.map((op: OperatorInfo) => op.name));
            return undefined;
        }

        console.log('Found matching operator:', operator);

        // 查找对应的 Go 文件
        const goFileLocation = await this.findGoStruct(operator);
        if (goFileLocation) {
            console.log('Found Go file location:', goFileLocation.uri.fsPath);
            return new vscode.Location(goFileLocation.uri, goFileLocation.range);
        }

        console.log('No Go file location found');
        return undefined;
    }

    // 解析工作区中所有 .gorch 文件的算子注册信息
    public async parseAllOperators(): Promise<OperatorInfo[]> {
        const allOperators: OperatorInfo[] = [];

        // 查找工作区中所有 .gorch 文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('No workspace folders found');
            return allOperators;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            console.log(`Found ${gorchFiles.length} .gorch files in workspace`);

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    const operators = this.parseOperators(document);
                    allOperators.push(...operators);
                    console.log(`Parsed ${operators.length} operators from ${gorchFile.fsPath}`);
                } catch (error) {
                    console.error(`Failed to parse ${gorchFile.fsPath}:`, error);
                }
            }
        }

        console.log(`Total operators found across all files: ${allOperators.length}`);
        return allOperators;
    }

    // 解析单个文档中的 REGISTER 块中的算子信息
    private parseOperators(document: vscode.TextDocument): OperatorInfo[] {
        const operators: OperatorInfo[] = [];
        const text = document.getText();

        console.log('Parsing operators from document:', document.fileName);

        // 匹配 REGISTER 块 (使用 [\s\S] 匹配包括换行符在内的所有字符)
        const registerRegex = /REGISTER\s*\(\s*"([^"]+)"\s*\)\s*\{([\s\S]*?)\}/g;
        let registerMatch;

        while ((registerMatch = registerRegex.exec(text)) !== null) {
            const packagePath = registerMatch[1];
            const registerBlock = registerMatch[2];

            console.log('Found REGISTER block:', packagePath);
            console.log('Register block content:', registerBlock);

            // 匹配 OPERATOR 指令
            const operatorRegex = /OPERATOR\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g;
            let operatorMatch;

            while ((operatorMatch = operatorRegex.exec(registerBlock)) !== null) {
                const operator: OperatorInfo = {
                    name: operatorMatch[3],        // 算子名称
                    structName: operatorMatch[2],  // struct 名称
                    packagePath: packagePath,      // 包路径
                    filePath: operatorMatch[1],    // 文件路径
                    sequence: operatorMatch[4],    // 算子序号
                    documentUri: document.uri.toString()  // 文档URI
                };
                console.log('Found operator:', operator);
                operators.push(operator);
            }
        }

        console.log('Total operators found:', operators.length);
        return operators;
    }

    // 查找 Go struct 的位置
    private async findGoStruct(operator: OperatorInfo): Promise<{ uri: vscode.Uri, range: vscode.Range } | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return undefined;
        }

        // 构建可能的文件路径
        const possiblePaths = [
            path.join(operator.filePath, `${operator.structName.toLowerCase()}.go`),
            path.join(operator.filePath, 'operator.go'),
            path.join(operator.filePath, 'ops.go'),
            `${operator.filePath}.go`
        ];

        for (const workspaceFolder of workspaceFolders) {
            for (const relativePath of possiblePaths) {
                const fullPath = path.join(workspaceFolder.uri.fsPath, relativePath);

                if (fs.existsSync(fullPath)) {
                    const uri = vscode.Uri.file(fullPath);
                    const range = await this.findStructInFile(uri, operator.structName);
                    if (range) {
                        return { uri, range };
                    }
                }
            }

            // 递归搜索工作区中的所有 .go 文件
            const goFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.go'),
                '**/node_modules/**'
            );

            for (const goFile of goFiles) {
                const range = await this.findStructInFile(goFile, operator.structName);
                if (range) {
                    return { uri: goFile, range };
                }
            }
        }

        return undefined;
    }

    // 在 Go 文件中查找 struct 定义
    private async findStructInFile(uri: vscode.Uri, structName: string): Promise<vscode.Range | undefined> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();

            // 匹配 struct 定义
            const structRegex = new RegExp(`type\\s+${structName}\\s+struct\\s*\\{`, 'g');
            const match = structRegex.exec(text);

            if (match) {
                const position = document.positionAt(match.index);
                return new vscode.Range(position, position);
            }
        } catch (error) {
            // 文件读取失败，忽略
        }

        return undefined;
    }

    // 检查是否是 UNFOLD 指令中的 FRAGMENT 名称，如果是则返回 FRAGMENT 定义位置
    private async checkUnfoldFragmentDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string
    ): Promise<vscode.Location | undefined> {
        const line = document.lineAt(position.line);
        const lineText = line.text;

        // 检查当前位置是否在 UNFOLD 指令中
        const unfoldRegex = /UNFOLD\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = unfoldRegex.exec(lineText)) !== null) {
            const fragmentName = match[1];
            const matchStart = match.index + lineText.indexOf(`"${fragmentName}"`);
            const matchEnd = matchStart + fragmentName.length + 2; // +2 for quotes

            // 检查光标是否在 FRAGMENT 名称上（包括引号）
            if (position.character >= matchStart && position.character <= matchEnd && fragmentName === word) {
                // 查找对应的 FRAGMENT 定义
                const allFragments = await this.parseAllFragments();
                const targetFragment = allFragments.find(f => f.name === fragmentName);

                if (targetFragment) {
                    const fragmentDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetFragment.documentUri));
                    const fragmentPosition = new vscode.Position(targetFragment.startLine, 0);
                    return new vscode.Location(fragmentDocument.uri, fragmentPosition);
                }
            }
        }

        return undefined;
    }

    // 解析工作区中所有 .gorch 文件的 FRAGMENT 定义
    private async parseAllFragments(): Promise<FragmentInfo[]> {
        const allFragments: FragmentInfo[] = [];

        // 查找工作区中所有 .gorch 文件
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            console.log('No workspace folders found for fragment parsing');
            return allFragments;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    const fragments = this.parseFragments(document);
                    allFragments.push(...fragments);
                    console.log(`Parsed ${fragments.length} fragments from ${gorchFile.fsPath}`);
                } catch (error) {
                    console.error(`Failed to parse fragments from ${gorchFile.fsPath}:`, error);
                }
            }
        }

        console.log(`Total fragments found across all files: ${allFragments.length}`);
        return allFragments;
    }

    // 解析单个文档中的 FRAGMENT 定义
    private parseFragments(document: vscode.TextDocument): FragmentInfo[] {
        const fragments: FragmentInfo[] = [];
        const text = document.getText();

        // 匹配 FRAGMENT 定义
        const fragmentRegex = /FRAGMENT\s*\(\s*"([^"]+)"\s*\)/g;
        let match;

        while ((match = fragmentRegex.exec(text)) !== null) {
            const fragmentName = match[1];
            const position = document.positionAt(match.index);

            const fragment: FragmentInfo = {
                name: fragmentName,
                documentUri: document.uri.toString(),
                startLine: position.line
            };

            console.log('Found fragment:', fragment);
            fragments.push(fragment);
        }

        return fragments;
    }
}

class GorchDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
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
