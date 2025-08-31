/**
 * 索引服务
 * 管理Gorch文件和Go文件的索引，提供缓存和增量更新功能
 */

import * as vscode from 'vscode';
import {
    OperatorInfo,
    FragmentInfo,
    GoStructInfo,
    IndexInfo,
    IndexUpdateResult
} from '../models/types';
import { OutputService } from './outputService';
import { GoUtils } from '../utils/goUtils';

export class IndexService {
    private static instance: IndexService;
    private indexInfo: IndexInfo;
    private outputService: OutputService;
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private updateInProgress = false;
    private pendingUpdates = new Set<string>();

    private constructor() {
        this.outputService = OutputService.getInstance();
        this.indexInfo = {
            operators: [],
            fragments: [],
            goStructs: [],
            lastUpdated: 0,
            version: '1.0.0'
        };
        this.setupFileWatcher();
    }

    public static getInstance(): IndexService {
        if (!IndexService.instance) {
            IndexService.instance = new IndexService();
        }
        return IndexService.instance;
    }

    /**
     * 获取当前索引信息
     */
    public getIndexInfo(): IndexInfo {
        return { ...this.indexInfo };
    }

    /**
     * 手动刷新索引
     */
    public async refreshIndex(): Promise<IndexUpdateResult> {
        if (this.updateInProgress) {
            this.outputService.warn('Index update already in progress, skipping...');
            return {
                success: false,
                operatorsCount: 0,
                fragmentsCount: 0,
                goStructsCount: 0,
                duration: 0,
                errors: ['Update already in progress']
            };
        }

        this.updateInProgress = true;
        const startTime = Date.now();
        const errors: string[] = [];

        try {
            this.outputService.logIndexUpdateStart();

            // 清空当前索引
            this.indexInfo.operators = [];
            this.indexInfo.fragments = [];
            this.indexInfo.goStructs = [];

            // 更新Gorch文件索引
            await this.updateGorchIndex(errors);

            // 更新Go文件索引
            await this.updateGoIndex(errors);

            // 更新索引时间戳
            this.indexInfo.lastUpdated = Date.now();

            const duration = Date.now() - startTime;
            const result: IndexUpdateResult = {
                success: true,
                operatorsCount: this.indexInfo.operators.length,
                fragmentsCount: this.indexInfo.fragments.length,
                goStructsCount: this.indexInfo.goStructs.length,
                duration,
                errors
            };

            this.outputService.logIndexUpdateComplete(
                result.operatorsCount,
                result.fragmentsCount,
                result.goStructsCount,
                result.duration,
                result.errors
            );

            // 索引更新后，触发所有打开文档的诊断检查
            this.triggerDiagnosticsUpdate();

            return result;

        } catch (error) {
            const errorMsg = `Index update failed: ${error}`;
            this.outputService.error(errorMsg);
            errors.push(errorMsg);

            return {
                success: false,
                operatorsCount: this.indexInfo.operators.length,
                fragmentsCount: this.indexInfo.fragments.length,
                goStructsCount: this.indexInfo.goStructs.length,
                duration: Date.now() - startTime,
                errors
            };
        } finally {
            this.updateInProgress = false;
            this.pendingUpdates.clear();
        }
    }

    /**
     * 获取所有算子信息
     */
    public getAllOperators(): OperatorInfo[] {
        return [...this.indexInfo.operators];
    }

    /**
     * 获取所有Fragment信息
     */
    public getAllFragments(): FragmentInfo[] {
        return [...this.indexInfo.fragments];
    }

    /**
     * 获取所有Go struct信息
     */
    public getAllGoStructs(): GoStructInfo[] {
        return [...this.indexInfo.goStructs];
    }

    /**
     * 根据名称查找算子
     */
    public findOperatorByName(name: string): OperatorInfo | undefined {
        return this.indexInfo.operators.find(op => op.name === name);
    }

    /**
     * 根据名称查找Fragment
     */
    public findFragmentByName(name: string): FragmentInfo | undefined {
        return this.indexInfo.fragments.find(frag => frag.name === name);
    }

    /**
     * 根据名称查找Go struct
     */
    public findGoStructByName(name: string): GoStructInfo | undefined {
        return this.indexInfo.goStructs.find(struct => struct.name === name);
    }

    /**
     * 检查索引是否需要更新
     */
    public needsUpdate(): boolean {
        // 如果从未更新过，需要更新
        if (this.indexInfo.lastUpdated === 0) {
            return true;
        }

        // 如果有待处理的更新，需要更新
        if (this.pendingUpdates.size > 0) {
            return true;
        }

        // 可以添加更多的检查逻辑，比如检查文件修改时间等
        return false;
    }

    /**
     * 更新Gorch文件索引
     */
    private async updateGorchIndex(errors: string[]): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            errors.push('No workspace folders found');
            return;
        }

        for (const workspaceFolder of workspaceFolders) {
            const gorchFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.gorch'),
                '**/node_modules/**'
            );

            this.outputService.debug(`Found ${gorchFiles.length} .gorch files`);

            for (const gorchFile of gorchFiles) {
                try {
                    const document = await vscode.workspace.openTextDocument(gorchFile);
                    const operators = this.parseOperators(document);
                    const fragments = this.parseFragments(document);
                    
                    this.indexInfo.operators.push(...operators);
                    this.indexInfo.fragments.push(...fragments);
                    
                    this.outputService.logFileParsing(
                        gorchFile.fsPath, 
                        operators.length, 
                        fragments.length
                    );
                } catch (error) {
                    const errorMsg = `Failed to parse ${gorchFile.fsPath}: ${error}`;
                    errors.push(errorMsg);
                    this.outputService.error(errorMsg);
                }
            }
        }
    }

    /**
     * 更新Go文件索引
     */
    private async updateGoIndex(errors: string[]): Promise<void> {
        try {
            const goStructs = await GoUtils.findAllGoStructs();
            this.indexInfo.goStructs = goStructs;
        } catch (error) {
            const errorMsg = `Failed to update Go index: ${error}`;
            errors.push(errorMsg);
            this.outputService.error(errorMsg);
        }
    }

    /**
     * 解析单个文档中的算子信息
     */
    private parseOperators(document: vscode.TextDocument): OperatorInfo[] {
        const operators: OperatorInfo[] = [];
        const text = document.getText();

        // 匹配 REGISTER 块
        const registerRegex = /REGISTER\s*\(\s*"([^"]+)"\s*\)\s*\{([\s\S]*?)\}/g;
        let registerMatch;

        while ((registerMatch = registerRegex.exec(text)) !== null) {
            const packagePath = registerMatch[1];
            const registerBlock = registerMatch[2];

            // 匹配 OPERATOR 指令
            const operatorRegex = /OPERATOR\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)/g;
            let operatorMatch;

            while ((operatorMatch = operatorRegex.exec(registerBlock)) !== null) {
                const operatorStartPos = document.positionAt(
                    registerMatch.index + registerMatch[0].indexOf(registerBlock) + operatorMatch.index
                );
                const operatorEndPos = document.positionAt(
                    registerMatch.index + registerMatch[0].indexOf(registerBlock) + 
                    operatorMatch.index + operatorMatch[0].length
                );

                const operator: OperatorInfo = {
                    name: operatorMatch[3],
                    structName: operatorMatch[2],
                    packagePath: packagePath,
                    filePath: operatorMatch[1],
                    sequence: operatorMatch[4],
                    documentUri: document.uri.toString(),
                    startLine: operatorStartPos.line,
                    endLine: operatorEndPos.line
                };

                this.outputService.debug(`Parsed operator: ${operator.name}, sequence: ${operator.sequence}, from ${document.fileName}`);
                operators.push(operator);
            }
        }

        return operators;
    }

    /**
     * 解析单个文档中的Fragment信息
     */
    private parseFragments(document: vscode.TextDocument): FragmentInfo[] {
        const fragments: FragmentInfo[] = [];
        const text = document.getText();

        // 匹配 FRAGMENT 定义
        const fragmentRegex = /FRAGMENT\s*\(\s*"([^"]+)"\s*\)\s*\{/g;
        let match;

        while ((match = fragmentRegex.exec(text)) !== null) {
            const fragmentName = match[1];
            const startPos = document.positionAt(match.index);
            
            // 找到对应的结束大括号（简化处理，假设每个FRAGMENT都有对应的结束括号）
            const endPos = this.findMatchingBrace(text, match.index + match[0].length - 1);
            const endLine = endPos ? document.positionAt(endPos).line : startPos.line;

            const fragment: FragmentInfo = {
                name: fragmentName,
                documentUri: document.uri.toString(),
                startLine: startPos.line,
                endLine: endLine
            };

            fragments.push(fragment);
        }

        return fragments;
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

    /**
     * 设置文件监听器
     */
    private setupFileWatcher(): void {
        // 监听.gorch文件变化
        const gorchWatcher = vscode.workspace.createFileSystemWatcher('**/*.gorch');
        gorchWatcher.onDidCreate(uri => this.onFileChanged(uri, 'created'));
        gorchWatcher.onDidChange(uri => this.onFileChanged(uri, 'changed'));
        gorchWatcher.onDidDelete(uri => this.onFileChanged(uri, 'deleted'));

        // 监听.go文件变化
        const goWatcher = vscode.workspace.createFileSystemWatcher('**/*.go');
        goWatcher.onDidCreate(uri => this.onFileChanged(uri, 'created'));
        goWatcher.onDidChange(uri => this.onFileChanged(uri, 'changed'));
        goWatcher.onDidDelete(uri => this.onFileChanged(uri, 'deleted'));

        this.fileWatcher = gorchWatcher; // 保存引用用于清理
    }

    /**
     * 处理文件变化事件
     */
    private onFileChanged(uri: vscode.Uri, type: 'created' | 'changed' | 'deleted'): void {
        this.pendingUpdates.add(uri.toString());
        this.outputService.debug(`File ${type}: ${uri.fsPath}`, 'FileWatcher');

        // 延迟更新，避免频繁更新
        setTimeout(() => {
            if (!this.updateInProgress && this.pendingUpdates.size > 0) {
                this.refreshIndex();
            }
        }, 1000);
    }

    /**
     * 触发诊断更新
     */
    private triggerDiagnosticsUpdate(): void {
        // 发送自定义事件，通知诊断提供器更新
        vscode.commands.executeCommand('gorch.internal.updateDiagnostics');
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
        }
    }
}
