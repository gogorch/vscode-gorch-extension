/**
 * 类型定义文件
 * 定义插件中使用的所有接口和类型
 */

import * as vscode from 'vscode';

// 算子注册信息接口
export interface OperatorInfo {
    name: string;           // 算子名称
    structName: string;     // Go struct 名称
    packagePath: string;    // 包路径
    filePath: string;       // 相对文件路径
    sequence: string;       // 算子序号
    documentUri: string;    // 文档URI
    startLine: number;      // 在文档中的起始行号
    endLine: number;        // 在文档中的结束行号
}

// FRAGMENT 信息接口
export interface FragmentInfo {
    name: string;           // FRAGMENT 名称
    documentUri: string;    // 文档URI
    startLine: number;      // 开始行号
    endLine: number;        // 结束行号
}

// Go struct 信息接口
export interface GoStructInfo {
    name: string;           // struct 名称
    packagePath: string;    // 包路径
    filePath: string;       // 文件路径
    uri: vscode.Uri;        // 文件URI
    range: vscode.Range;    // struct定义的位置范围
    lastModified: number;   // 最后修改时间
}

// 索引信息接口
export interface IndexInfo {
    operators: OperatorInfo[];      // 所有算子信息
    fragments: FragmentInfo[];      // 所有FRAGMENT信息
    goStructs: GoStructInfo[];      // 所有Go struct信息
    lastUpdated: number;            // 最后更新时间
    version: string;                // 索引版本
}

// 文件变化事件接口
export interface FileChangeEvent {
    uri: vscode.Uri;
    type: 'created' | 'changed' | 'deleted';
    timestamp: number;
}

// 索引更新结果接口
export interface IndexUpdateResult {
    success: boolean;
    operatorsCount: number;
    fragmentsCount: number;
    goStructsCount: number;
    duration: number;
    errors: string[];
}

// 诊断检查类型
export type DiagnosticCheckType = 
    | 'duplicate-sequence'
    | 'duplicate-name'
    | 'unregistered-operator'
    | 'fragment-not-found'
    | 'go-struct-not-found'
    | 'go-struct-warning';

// 日志级别
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

// 日志消息接口
export interface LogMessage {
    level: LogLevel;
    message: string;
    timestamp: Date;
    source?: string;
}

// 配置接口
export interface GorchConfig {
    enableIndexing: boolean;        // 是否启用索引
    autoRefreshIndex: boolean;      // 是否自动刷新索引
    indexRefreshInterval: number;   // 索引刷新间隔（毫秒）
    enableGoIntegration: boolean;   // 是否启用Go扩展集成
    logLevel: LogLevel;             // 日志级别
    maxIndexSize: number;           // 最大索引大小
}

// 跳转上下文接口
export interface DefinitionContext {
    document: vscode.TextDocument;
    position: vscode.Position;
    word: string;
    wordRange: vscode.Range;
    lineText: string;
}

// OPERATOR 指令解析结果（同时兼容 3 参数与 4 参数）
export interface OperatorMatch {
    fullMatch: string;
    packagePath: string;
    structName: string;
    /**
     * 4 参数场景：第 3 个显式算子名
     * 3 参数场景：与 structName 相同
     */
    operatorName: string;
    sequence: string;
    startIndex: number;
    endIndex: number;
    structNameStart: number;
    structNameEnd: number;
}
