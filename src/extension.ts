/**
 * Gorch Language Support Extension
 * 重构后的主入口文件，使用模块化架构
 */

import * as vscode from 'vscode';
import { EnhancedDefinitionProvider } from './providers/enhancedDefinitionProvider';
import { GorchDiagnosticProvider } from './providers/diagnosticProvider';
import { GorchDocumentSymbolProvider } from './providers/documentSymbolProvider';
import { GorchHoverProvider } from './providers/hoverProvider';
import { IndexService } from './services/indexService';
import { OutputService } from './services/outputService';


export function activate(context: vscode.ExtensionContext) {
    const outputService = OutputService.getInstance();
    const indexService = IndexService.getInstance();

    outputService.info('Gorch Language Support extension is now active!');

    // 初始化索引
    initializeIndex(indexService, outputService);

    // 注册语言服务提供器
    const diagnosticProvider = registerLanguageProviders(context, outputService);

    // 注册命令
    registerCommands(context, indexService, outputService, diagnosticProvider);

    // 设置文档监听器
    setupDocumentListeners(context, outputService, diagnosticProvider);

    outputService.info('Extension activation completed');
}

/**
 * 初始化索引
 */
async function initializeIndex(indexService: IndexService, outputService: OutputService): Promise<void> {
    try {
        // 如果需要更新索引，则进行初始化
        if (indexService.needsUpdate()) {
            outputService.info('Initializing index...');
            await indexService.refreshIndex();
        }
    } catch (error) {
        outputService.error(`Failed to initialize index: ${error}`);
    }
}

/**
 * 注册命令
 */
function registerCommands(
    context: vscode.ExtensionContext,
    indexService: IndexService,
    outputService: OutputService,
    diagnosticProvider: GorchDiagnosticProvider
): void {

    // 格式化命令
    const formatCommand = vscode.commands.registerCommand('gorch.format', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'gorch') {
            vscode.window.showInformationMessage('Gorch formatting is not yet implemented');
        }
    });

    // 验证命令
    const validateCommand = vscode.commands.registerCommand('gorch.validate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'gorch') {
            const operators = indexService.getAllOperators();
            const fragments = indexService.getAllFragments();
            const message = `Found ${operators.length} operators and ${fragments.length} fragments across all .gorch files`;
            vscode.window.showInformationMessage(message);
            outputService.info(message);
        }
    });

    // 刷新索引命令
    const refreshIndexCommand = vscode.commands.registerCommand('gorch.refreshIndex', async () => {
        outputService.info('Manual index refresh requested');
        outputService.show(); // 显示输出窗口

        try {
            const result = await indexService.refreshIndex();
            if (result.success) {
                vscode.window.showInformationMessage(
                    `Index refreshed successfully! Found ${result.operatorsCount} operators, ${result.fragmentsCount} fragments`
                );
            } else {
                vscode.window.showErrorMessage('Index refresh failed. Check output for details.');
            }
        } catch (error) {
            outputService.error(`Index refresh failed: ${error}`);
            vscode.window.showErrorMessage('Index refresh failed. Check output for details.');
        }
    });

    // 显示输出窗口命令
    const showOutputCommand = vscode.commands.registerCommand('gorch.showOutput', () => {
        outputService.show();
    });

    // 清空输出窗口命令
    const clearOutputCommand = vscode.commands.registerCommand('gorch.clearOutput', () => {
        outputService.clear();
        outputService.info('Output cleared');
    });

    // 手动检查诊断命令（用于调试）
    const checkDiagnosticsCommand = vscode.commands.registerCommand('gorch.checkDiagnostics', async () => {
        outputService.info('Manual diagnostic check requested');
        outputService.show(); // 显示输出窗口

        const gorchDocs = vscode.workspace.textDocuments.filter(doc => doc.languageId === 'gorch');
        outputService.info(`Found ${gorchDocs.length} open .gorch documents`);

        for (const document of gorchDocs) {
            outputService.info(`Checking diagnostics for: ${document.fileName}`);
            await diagnosticProvider.updateDiagnostics(document);
        }

        vscode.window.showInformationMessage(`Diagnostic check completed for ${gorchDocs.length} files`);
    });

    // 切换详细日志命令
    const toggleVerboseLoggingCommand = vscode.commands.registerCommand('gorch.toggleVerboseLogging', () => {
        const currentLevel = outputService.getLogLevel();
        const newLevel = currentLevel === 'DEBUG' ? 'INFO' : 'DEBUG';
        outputService.setLogLevel(newLevel as any);

        const status = newLevel === 'DEBUG' ? 'enabled' : 'disabled';
        const message = `Verbose logging ${status}`;
        outputService.info(message);
        vscode.window.showInformationMessage(`Gorch: ${message}`);
    });

    // 内部命令：更新诊断
    const updateDiagnosticsCommand = vscode.commands.registerCommand('gorch.internal.updateDiagnostics', async () => {
        outputService.info('Triggering diagnostic update for all open .gorch files');
        // 更新所有打开的.gorch文档的诊断
        const gorchDocs = vscode.workspace.textDocuments.filter(doc => doc.languageId === 'gorch');
        outputService.debug(`Found ${gorchDocs.length} open .gorch documents for diagnostic update`);

        for (const document of gorchDocs) {
            outputService.debug(`Updating diagnostics for: ${document.fileName}`);
            await diagnosticProvider.updateDiagnostics(document);
        }
    });

    context.subscriptions.push(
        formatCommand,
        validateCommand,
        refreshIndexCommand,
        showOutputCommand,
        clearOutputCommand,
        checkDiagnosticsCommand,
        toggleVerboseLoggingCommand,
        updateDiagnosticsCommand
    );
}

/**
 * 注册语言服务提供器
 */
function registerLanguageProviders(context: vscode.ExtensionContext, outputService: OutputService): GorchDiagnosticProvider {
    // 注册增强的定义提供器
    const definitionProvider = vscode.languages.registerDefinitionProvider(
        { scheme: 'file', language: 'gorch' },
        new EnhancedDefinitionProvider()
    );

    // 注册文档符号提供器
    const documentSymbolProvider = vscode.languages.registerDocumentSymbolProvider(
        { scheme: 'file', language: 'gorch' },
        new GorchDocumentSymbolProvider()
    );

    // 注册悬停提供器
    const hoverProvider = vscode.languages.registerHoverProvider(
        { scheme: 'file', language: 'gorch' },
        new GorchHoverProvider()
    );

    // 注册诊断提供器
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('gorch');
    const diagnosticProvider = new GorchDiagnosticProvider(diagnosticCollection);



    // 立即检查当前打开的所有.gorch文件
    const checkInitialDocuments = async () => {
        const gorchDocs = vscode.workspace.textDocuments.filter(doc => doc.languageId === 'gorch');
        outputService.info(`Found ${gorchDocs.length} open .gorch documents for initial diagnostic check`);

        for (const document of gorchDocs) {
            outputService.debug(`Running initial diagnostic check for: ${document.fileName}`);
            await diagnosticProvider.updateDiagnostics(document);
        }
    };

    // 延迟执行，确保索引已经初始化
    setTimeout(checkInitialDocuments, 1000);

    context.subscriptions.push(
        definitionProvider,
        documentSymbolProvider,
        hoverProvider,
        diagnosticCollection
    );

    outputService.debug('Language providers registered');

    return diagnosticProvider;
}

/**
 * 设置文档监听器
 */
function setupDocumentListeners(context: vscode.ExtensionContext, outputService: OutputService, diagnosticProvider: GorchDiagnosticProvider): void {

    // 监听文档变化，实时检查错误
    const documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (event.document.languageId === 'gorch') {
            await diagnosticProvider.updateDiagnostics(event.document);
        }
    });

    // 监听文档打开，检查错误
    const documentOpenListener = vscode.workspace.onDidOpenTextDocument(async (document) => {
        if (document.languageId === 'gorch') {
            await diagnosticProvider.updateDiagnostics(document);
        }
    });

    context.subscriptions.push(
        documentChangeListener,
        documentOpenListener
    );

    outputService.debug('Document listeners setup completed');
}

export function deactivate() {
    // 清理资源
    const indexService = IndexService.getInstance();
    const outputService = OutputService.getInstance();

    indexService.dispose();
    outputService.dispose();
}