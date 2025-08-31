/**
 * 输出服务
 * 管理VSCode输出窗口的日志显示
 */

import * as vscode from 'vscode';
import { LogLevel, LogMessage } from '../models/types';

export class OutputService {
    private static instance: OutputService;
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Gorch Language Support');
    }

    public static getInstance(): OutputService {
        if (!OutputService.instance) {
            OutputService.instance = new OutputService();
        }
        return OutputService.instance;
    }

    /**
     * 设置日志级别
     */
    public setLogLevel(level: LogLevel): void {
        this.logLevel = level;
        this.log(LogLevel.INFO, `Log level set to ${level}`);
    }

    /**
     * 获取当前日志级别
     */
    public getLogLevel(): string {
        return this.logLevel;
    }

    /**
     * 记录日志消息
     */
    public log(level: LogLevel, message: string, source?: string): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const sourcePrefix = source ? `[${source}] ` : '';
        const logMessage = `[${timestamp}] [${level}] ${sourcePrefix}${message}`;
        
        this.outputChannel.appendLine(logMessage);

        // 对于错误和警告，也在状态栏显示
        if (level === LogLevel.ERROR) {
            vscode.window.showErrorMessage(`Gorch: ${message}`);
        } else if (level === LogLevel.WARN) {
            vscode.window.showWarningMessage(`Gorch: ${message}`);
        }
    }

    /**
     * 记录调试信息
     */
    public debug(message: string, source?: string): void {
        this.log(LogLevel.DEBUG, message, source);
    }

    /**
     * 记录信息
     */
    public info(message: string, source?: string): void {
        this.log(LogLevel.INFO, message, source);
    }

    /**
     * 记录警告
     */
    public warn(message: string, source?: string): void {
        this.log(LogLevel.WARN, message, source);
    }

    /**
     * 记录错误
     */
    public error(message: string, source?: string): void {
        this.log(LogLevel.ERROR, message, source);
    }

    /**
     * 显示输出窗口
     */
    public show(): void {
        this.outputChannel.show();
    }

    /**
     * 清空输出窗口
     */
    public clear(): void {
        this.outputChannel.clear();
    }

    /**
     * 记录索引更新开始
     */
    public logIndexUpdateStart(): void {
        this.info('Starting index update...', 'IndexService');
        this.outputChannel.appendLine('----------------------------------------');
    }

    /**
     * 记录索引更新完成
     */
    public logIndexUpdateComplete(
        operatorsCount: number,
        fragmentsCount: number,
        goStructsCount: number,
        duration: number,
        errors: string[]
    ): void {
        this.outputChannel.appendLine('Index Update Results:');
        this.outputChannel.appendLine(`  - Operators found: ${operatorsCount}`);
        this.outputChannel.appendLine(`  - Fragments found: ${fragmentsCount}`);
        this.outputChannel.appendLine(`  - Go structs found: ${goStructsCount}`);
        this.outputChannel.appendLine(`  - Duration: ${duration}ms`);
        
        if (errors.length > 0) {
            this.outputChannel.appendLine(`  - Errors: ${errors.length}`);
            errors.forEach(error => {
                this.outputChannel.appendLine(`    * ${error}`);
            });
        }
        
        this.outputChannel.appendLine('----------------------------------------');
        this.info(`Index update completed in ${duration}ms`, 'IndexService');
        
        // 在状态栏显示简要信息
        vscode.window.setStatusBarMessage(
            `Gorch: Index updated (${operatorsCount} operators, ${fragmentsCount} fragments)`,
            3000
        );
    }

    /**
     * 记录文件解析信息
     */
    public logFileParsing(filePath: string, operatorsCount: number, fragmentsCount: number): void {
        this.debug(`Parsed ${filePath}: ${operatorsCount} operators, ${fragmentsCount} fragments`, 'Parser');
    }

    /**
     * 记录Go文件扫描信息
     */
    public logGoFileScan(filePath: string, structsCount: number): void {
        this.debug(`Scanned ${filePath}: ${structsCount} structs found`, 'GoScanner');
    }

    /**
     * 记录诊断检查信息
     */
    public logDiagnosticCheck(documentPath: string, issuesCount: number): void {
        this.debug(`Diagnostic check for ${documentPath}: ${issuesCount} issues found`, 'Diagnostics');
    }

    /**
     * 记录跳转操作
     */
    public logDefinitionJump(from: string, to: string, type: 'operator' | 'fragment' | 'struct', method: 'index' | 'go-extension' | 'real-time-scan' = 'index'): void {
        this.info(`🔍 Definition jump (${type}) via ${method}: ${from} -> ${to}`, 'Navigation');
    }

    /**
     * 记录定义查找开始
     */
    public logDefinitionStart(word: string, position: string, context: string): void {
        this.info(`🎯 Definition lookup started: "${word}" at ${position} (${context})`, 'Navigation');
    }

    /**
     * 记录索引查找结果
     */
    public logIndexLookup(word: string, found: boolean, type: 'operator' | 'fragment' | 'struct'): void {
        const status = found ? '✅' : '❌';
        this.debug(`${status} Index lookup for ${type}: "${word}" - ${found ? 'FOUND' : 'NOT FOUND'}`, 'Navigation');
    }

    /**
     * 记录Go扩展查找结果
     */
    public logGoExtensionLookup(structName: string, found: boolean, error?: string): void {
        const status = found ? '✅' : '❌';
        const errorMsg = error ? ` (Error: ${error})` : '';
        this.debug(`${status} Go extension lookup: "${structName}" - ${found ? 'FOUND' : 'NOT FOUND'}${errorMsg}`, 'Navigation');
    }

    /**
     * 记录实时扫描结果
     */
    public logRealTimeScan(structName: string, found: boolean): void {
        const status = found ? '✅' : '❌';
        this.debug(`${status} Real-time scan: "${structName}" - ${found ? 'FOUND' : 'NOT FOUND'}`, 'Navigation');
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.outputChannel.dispose();
    }

    /**
     * 判断是否应该记录该级别的日志
     */
    private shouldLog(level: LogLevel): boolean {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        const currentLevelIndex = levels.indexOf(this.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        return messageLevelIndex >= currentLevelIndex;
    }
}
