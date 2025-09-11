
import * as vscode from 'vscode';
import { OperatorInfo, OperatorMatch } from '../models/types';

// 正则表达式，用于匹配 OPERATOR 指令，兼容3参数和4参数
const OPERATOR_REGEX_GLOBAL = /OPERATOR\s*\(\s*"(.*?)"\s*,\s*"(.*?)"\s*(?:,\s*"(.*?)"\s*)?,\s*(\d+)\s*\)/g;

/**
 * 解析一行文本，提取 OPERATOR 指令信息
 * @param lineText - 行文本
 * @returns OperatorMatch | null - 匹配的算子信息或 null
 */
export function parseOperatorLine(lineText: string): OperatorMatch | null {
    // 使用一个新的正则表达式，因为它需要处理单行，并且我们需要捕获位置
    const singleLineRegex = /OPERATOR\s*\(\s*"(.*?)"\s*,\s*"(.*?)"\s*(?:,\s*"(.*?)"\s*)?,\s*(\d+)\s*\)/;
    const match = lineText.match(singleLineRegex);

    if (!match) {
        return null;
    }

    const fullMatch = match[0];
    // match[1] is the package path from the operator line itself, which we might ignore in favor of the REGISTER block's path
    const structName = match[2];
    const operatorName = match[3] || structName; // 如果没有第3个参数，则使用structName
    const sequence = match[4];
    const startIndex = match.index!;
    const endIndex = startIndex + fullMatch.length;

    // 计算 structName 的起始和结束位置
    // "OPERATOR(pkg, "structName"..."
    // We need to find the index of the second quote-enclosed string.
    const structNamePattern = `"${structName}"`;
    // To make it more robust, let's find the start index of the second argument.
    const firstCommaIndex = fullMatch.indexOf(',');
    const structNameSubstr = fullMatch.substring(firstCommaIndex);
    const structNameStartIndexInMatch = fullMatch.indexOf(structNamePattern, firstCommaIndex);

    const structNameStart = startIndex + structNameStartIndexInMatch + 1; // +1 for the opening quote
    const structNameEnd = structNameStart + structName.length;

    return {
        fullMatch,
        packagePath: match[1], // This is the package path defined in the OPERATOR line
        structName,
        operatorName,
        sequence,
        startIndex,
        endIndex,
        structNameStart,
        structNameEnd,
    };
}
