/**
 * Go语言相关工具函数
 * 处理Go文件解析、struct查找等功能
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GoStructInfo } from '../models/types';
import { OutputService } from '../services/outputService';

export class GoUtils {
    private static outputService = OutputService.getInstance();

    /**
     * 在工作区中查找所有Go struct定义
     */
    public static async findAllGoStructs(): Promise<GoStructInfo[]> {
        const allStructs: GoStructInfo[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders) {
            this.outputService.warn('No workspace folders found for Go struct scanning');
            return allStructs;
        }

        for (const workspaceFolder of workspaceFolders) {
            const goFiles = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceFolder, '**/*.go'),
                '**/node_modules/**'
            );

            this.outputService.debug(`Found ${goFiles.length} Go files in workspace`);

            for (const goFile of goFiles) {
                try {
                    const structs = await this.parseGoStructsFromFile(goFile);
                    allStructs.push(...structs);
                    this.outputService.logGoFileScan(goFile.fsPath, structs.length);
                } catch (error) {
                    this.outputService.error(`Failed to parse Go file ${goFile.fsPath}: ${error}`);
                }
            }
        }

        this.outputService.info(`Total Go structs found: ${allStructs.length}`, 'GoUtils');
        return allStructs;
    }

    /**
     * 从单个Go文件中解析struct定义
     */
    public static async parseGoStructsFromFile(uri: vscode.Uri): Promise<GoStructInfo[]> {
        const structs: GoStructInfo[] = [];
        
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const text = document.getText();
            const stats = fs.statSync(uri.fsPath);
            
            // 获取包路径
            const packagePath = this.extractPackagePath(text, uri.fsPath);
            
            // 匹配struct定义的正则表达式
            const structRegex = /type\s+(\w+)\s+struct\s*\{/g;
            let match;

            while ((match = structRegex.exec(text)) !== null) {
                const structName = match[1];
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                
                const structInfo: GoStructInfo = {
                    name: structName,
                    packagePath: packagePath,
                    filePath: path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, uri.fsPath),
                    uri: uri,
                    range: new vscode.Range(startPos, endPos),
                    lastModified: stats.mtime.getTime()
                };
                
                structs.push(structInfo);
            }
        } catch (error) {
            this.outputService.error(`Error parsing Go file ${uri.fsPath}: ${error}`);
        }

        return structs;
    }

    /**
     * 根据struct名称查找对应的Go struct定义
     */
    public static async findGoStructByName(
        structName: string, 
        allStructs?: GoStructInfo[]
    ): Promise<GoStructInfo | undefined> {
        
        // 如果没有提供allStructs，则重新扫描
        if (!allStructs) {
            allStructs = await this.findAllGoStructs();
        }

        return allStructs.find(struct => struct.name === structName);
    }

    /**
     * 使用Go扩展的定义查找功能
     */
    public static async findStructUsingGoExtension(structName: string): Promise<vscode.Location[] | undefined> {
        try {
            // 检查Go扩展是否可用
            const goExtension = vscode.extensions.getExtension('golang.go');
            if (!goExtension) {
                this.outputService.warn('Go extension not found, falling back to manual search');
                return undefined;
            }

            // 确保Go扩展已激活
            if (!goExtension.isActive) {
                await goExtension.activate();
            }

            // 创建一个临时的Go文件内容来查找struct定义
            const tempContent = `package main\n\nvar x ${structName}`;
            const tempDoc = await vscode.workspace.openTextDocument({
                content: tempContent,
                language: 'go'
            });

            // 使用VS Code的内置命令查找定义
            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                tempDoc.uri,
                new vscode.Position(2, tempContent.length - structName.length)
            );

            return locations;
        } catch (error) {
            this.outputService.error(`Error using Go extension for struct lookup: ${error}`);
            return undefined;
        }
    }

    /**
     * 从Go文件内容中提取包路径
     */
    private static extractPackagePath(content: string, filePath: string): string {
        // 尝试从package声明中提取
        const packageMatch = content.match(/^package\s+(\w+)/m);
        if (packageMatch) {
            // 如果是main包，使用文件路径
            if (packageMatch[1] === 'main') {
                return path.dirname(filePath);
            }
            return packageMatch[1];
        }

        // 如果没有找到package声明，使用目录名
        return path.basename(path.dirname(filePath));
    }

    /**
     * 检查Go文件是否已修改
     */
    public static isGoFileModified(structInfo: GoStructInfo): boolean {
        try {
            const stats = fs.statSync(structInfo.uri.fsPath);
            return stats.mtime.getTime() > structInfo.lastModified;
        } catch (error) {
            // 文件可能已被删除
            return true;
        }
    }

    /**
     * 验证Go struct是否存在
     */
    public static async validateGoStruct(
        structName: string, 
        packagePath?: string
    ): Promise<{ exists: boolean; location?: vscode.Location }> {
        
        // 首先尝试使用Go扩展
        const goExtensionResult = await this.findStructUsingGoExtension(structName);
        if (goExtensionResult && goExtensionResult.length > 0) {
            return {
                exists: true,
                location: goExtensionResult[0]
            };
        }

        // 回退到手动搜索
        const allStructs = await this.findAllGoStructs();
        const struct = allStructs.find(s => {
            if (packagePath) {
                return s.name === structName && s.packagePath === packagePath;
            }
            return s.name === structName;
        });

        if (struct) {
            return {
                exists: true,
                location: new vscode.Location(struct.uri, struct.range)
            };
        }

        return { exists: false };
    }

    /**
     * 获取Go工作区的模块路径
     */
    public static async getGoModulePath(): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return undefined;
        }

        for (const folder of workspaceFolders) {
            const goModPath = path.join(folder.uri.fsPath, 'go.mod');
            if (fs.existsSync(goModPath)) {
                try {
                    const content = fs.readFileSync(goModPath, 'utf8');
                    const moduleMatch = content.match(/^module\s+(.+)$/m);
                    if (moduleMatch) {
                        return moduleMatch[1].trim();
                    }
                } catch (error) {
                    this.outputService.error(`Error reading go.mod: ${error}`);
                }
            }
        }

        return undefined;
    }
}
