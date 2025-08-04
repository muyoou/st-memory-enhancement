import { USER } from "../core/manager.js";

/**
 * 替换字符串中的user标签
 */
export function replaceUserTag(str) {
    if (str == null) return ''; // 处理 null 或 undefined
    if (typeof str !== 'string') {
        console.warn('非字符串输入:', str);
        str = String(str); // 强制转换为字符串
    }
    return str.replace(/<user>/g, USER.getContext().name1);
}

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell
 * @returns 处理后的单元格值
 */
export function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * 截断最后的括号后的内容
 * @param {string} str
 * @returns {string} 处理后的字符串
 */
export function truncateAfterLastParenthesis(str) {
    const lastIndex = str.lastIndexOf(')');
    if (lastIndex !== -1) {
        return str.slice(0, lastIndex).trim();
    }
    return str.trim();
}

/**
 * 解析字符串字典为对象
 * @param {*} str
 * @returns object
 */
export function parseLooseDict(str) {
    const result = {};
    const content = str.replace(/\s+/g, '').replace(/\\"/g, '"').slice(1, -1);
    console.log("解析",content)
    let i = 0;
    const len = content.length;

    while (i < len) {
        // 读取 key
        let key = '';
        while (i < len && content[i] !== ':') {
            key += content[i++];
        }
        key = key.trim().replace(/^["']|["']$/g, ''); // 去除引号
        i++; // 跳过冒号

        // 读取 value
        let value = '';
        let quoteChar = null;
        let inString = false;

        // 判断起始引号（可以没有）
        if (content[i] === '"' || content[i] === "'") {
            quoteChar = content[i];
            inString = true;
            i++;
        }

        while (i < len) {
            const char = content[i];

            if (inString) {
                // 如果遇到嵌套引号，替换为另一种
                if (char === quoteChar) {
                    if (content[i + 1] === ','||content[i + 1] == null) {
                        i++; // 跳过结尾引号
                        break;
                    } else {
                        value += char === '"' ? "'" : '"'
                        i++;
                        continue;
                    }
                }

                value += char;
            } else {
                // 无引号字符串，直到逗号结束
                if (char === ',') break;
                value += char;
            }

            i++;
        }

        result[key] = value.trim().replace(/,/g, '/'); // 替换逗号

        // 跳过分隔符和空格
        while (i < len && (content[i] === ',' || content[i] === ' ')) {
            i++;
        }
    }
    console.log('解析后的对象:', result);

    return result;
}

/**
 * 手动解析纯 JSON 字符串，处理嵌套引号
 * @param {string} jsonStr - JSON 字符串
 * @returns {any} 解析后的对象
 */
export function parseManualJson(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') {
        throw new Error('输入必须是有效的字符串');
    }

    const str = jsonStr.trim();
    let index = 0;

    function parseValue() {
        skipWhitespace();
        
        const char = str[index];
        
        if (char === '{') {
            return parseObject();
        } else if (char === '[') {
            return parseArray();
        } else if (char === '"' || char === "'") {
            return parseString();
        } else if (char === 't' || char === 'f') {
            return parseBoolean();
        } else if (char === 'n') {
            return parseNull();
        } else if (char === '-' || (char >= '0' && char <= '9')) {
            return parseNumber();
        } else {
            throw new Error(`意外字符 '${char}' 在位置 ${index}`);
        }
    }

    function parseObject() {
        const obj = {};
        index++; // 跳过 '{'
        skipWhitespace();

        if (str[index] === '}') {
            index++; // 跳过 '}'
            return obj;
        }

        while (index < str.length) {
            // 解析 key
            const key = parseString();
            skipWhitespace();

            if (str[index] !== ':') {
                throw new Error(`期望 ':' 在位置 ${index}`);
            }
            index++; // 跳过 ':'
            skipWhitespace();

            // 解析 value
            const value = parseValue();
            obj[key] = value;

            skipWhitespace();

            if (str[index] === '}') {
                index++; // 跳过 '}'
                break;
            } else if (str[index] === ',') {
                index++; // 跳过 ','
                skipWhitespace();
            } else {
                throw new Error(`期望 ',' 或 '}' 在位置 ${index}`);
            }
        }

        return obj;
    }

    function parseArray() {
        const arr = [];
        index++; // 跳过 '['
        skipWhitespace();

        if (str[index] === ']') {
            index++; // 跳过 ']'
            return arr;
        }

        while (index < str.length) {
            const value = parseValue();
            arr.push(value);

            skipWhitespace();

            if (str[index] === ']') {
                index++; // 跳过 ']'
                break;
            } else if (str[index] === ',') {
                index++; // 跳过 ','
                skipWhitespace();
            } else {
                throw new Error(`期望 ',' 或 ']' 在位置 ${index}`);
            }
        }

        return arr;
    }

    function parseString() {
        const quoteChar = str[index]; // '"' 或 "'"
        if (quoteChar !== '"' && quoteChar !== "'") {
            throw new Error(`期望引号在位置 ${index}`);
        }

        index++; // 跳过起始引号
        let result = '';

        while (index < str.length) {
            const char = str[index];

            if (char === quoteChar) {
                // 检查是否是转义的引号
                if (index + 1 < str.length && str[index + 1] === quoteChar) {
                    // 嵌套引号处理：连续两个相同引号当作一个引号
                    result += char;
                    index += 2; // 跳过两个引号
                    continue;
                } else {
                    // 结束引号
                    index++; // 跳过结束引号
                    break;
                }
            } else if (char === '\\') {
                // 处理转义字符
                index++;
                if (index >= str.length) {
                    throw new Error('意外的字符串结束');
                }
                
                const nextChar = str[index];
                switch (nextChar) {
                    case '"':
                    case "'":
                    case '\\':
                    case '/':
                        result += nextChar;
                        break;
                    case 'b':
                        result += '\b';
                        break;
                    case 'f':
                        result += '\f';
                        break;
                    case 'n':
                        result += '\n';
                        break;
                    case 'r':
                        result += '\r';
                        break;
                    case 't':
                        result += '\t';
                        break;
                    case 'u':
                        // Unicode 转义
                        if (index + 4 >= str.length) {
                            throw new Error('不完整的 Unicode 转义');
                        }
                        const unicode = str.substr(index + 1, 4);
                        result += String.fromCharCode(parseInt(unicode, 16));
                        index += 4;
                        break;
                    default:
                        result += nextChar;
                }
                index++;
            } else {
                result += char;
                index++;
            }
        }

        // 替换逗号为斜杠（类似原函数的处理）
        return result.replace(/,/g, '/');
    }

    function parseNumber() {
        let numStr = '';
        
        if (str[index] === '-') {
            numStr += str[index++];
        }

        while (index < str.length && str[index] >= '0' && str[index] <= '9') {
            numStr += str[index++];
        }

        if (str[index] === '.') {
            numStr += str[index++];
            while (index < str.length && str[index] >= '0' && str[index] <= '9') {
                numStr += str[index++];
            }
        }

        if (str[index] === 'e' || str[index] === 'E') {
            numStr += str[index++];
            if (str[index] === '+' || str[index] === '-') {
                numStr += str[index++];
            }
            while (index < str.length && str[index] >= '0' && str[index] <= '9') {
                numStr += str[index++];
            }
        }

        return parseFloat(numStr);
    }

    function parseBoolean() {
        if (str.substr(index, 4) === 'true') {
            index += 4;
            return true;
        } else if (str.substr(index, 5) === 'false') {
            index += 5;
            return false;
        } else {
            throw new Error(`无效的布尔值在位置 ${index}`);
        }
    }

    function parseNull() {
        if (str.substr(index, 4) === 'null') {
            index += 4;
            return null;
        } else {
            throw new Error(`无效的 null 值在位置 ${index}`);
        }
    }

    function skipWhitespace() {
        while (index < str.length && /\s/.test(str[index])) {
            index++;
        } 
    }

    try {
        const result = parseValue();
        skipWhitespace();
        
        if (index < str.length) {
            throw new Error(`解析完成后还有多余字符在位置 ${index}`);
        }
        
        console.log('手动解析 JSON 成功:', result);
        return result;
    } catch (error) {
        console.error('JSON 解析错误:', error.message);
        throw error;
    }
}

/**
 * 安全的 JSON 解析函数，从文本中提取所有 JSON 数组
 * @param {string} jsonStr - 包含 JSON 数组的字符串
 * @returns {Array} 解析后的 JSON 数组列表
 */
export function safeParse(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') {
        throw new Error('输入必须是有效的字符串');
    }

    const results = [];
    let startIndex = 0;

    // 查找所有的 JSON 数组
    while (startIndex < jsonStr.length) {
        const bracketStart = jsonStr.indexOf('[', startIndex);
        if (bracketStart === -1) {
            break; // 没有更多的 [ 了
        }

        // 找到对应的 ] 
        let bracketEnd = -1;
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = bracketStart; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' || char === "'") {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '[') {
                    bracketCount++;
                } else if (char === ']') {
                    bracketCount--;
                    if (bracketCount === 0) {
                        bracketEnd = i;
                        break;
                    }
                }
            }
        }

        if (bracketEnd !== -1) {
            // 提取JSON数组字符串
            const jsonArrayStr = jsonStr.substring(bracketStart, bracketEnd + 1);
            console.log('发现JSON数组:', jsonArrayStr);

            try {
                // 优先使用原生 JSON.parse
                const parsed = JSON.parse(jsonArrayStr);
                results.push(parsed);
                console.log('成功解析JSON数组:', parsed);
            } catch (error) {
                console.warn('原生 JSON.parse 失败，尝试手动解析:', error.message);
                try {
                    const parsed = parseManualJson(jsonArrayStr);
                    results.push(parsed);
                    console.log('手动解析成功:', parsed);
                } catch (manualError) {
                    console.error('手动解析也失败:', manualError.message);
                    // 继续查找下一个数组，不抛出错误
                }
            }

            startIndex = bracketEnd + 1;
        } else {
            // 没有找到匹配的 ]，跳过这个 [
            startIndex = bracketStart + 1;
        }
    }

    if (results.length === 0) {
        console.warn('未找到有效的JSON数组');
        return [];
    }

    console.log(`总共解析出 ${results.length} 个JSON数组:`, results);
    return results;
}