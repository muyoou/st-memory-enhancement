import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
let sheet = null;
let config = {};
let selectedCustomStyle = null;

function staticPipeline(target) {
    console.log("进入静态渲染表格");
    const regexReplace = selectedCustomStyle.replace || '';
    if (!regexReplace || regexReplace === '') return target?.element || '<div>表格数据未加载</div>';
    if (!target) return regexReplace;
    return regexReplace.replace(/\$(\w)(\d+)/g, (match, colLetter, rowNumber) => {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const rowIndex = parseInt(rowNumber);
        console.log("静态渲染行:", rowIndex, "静态渲染列:", colIndex);
        const c = target.findCellByPosition(rowIndex, colIndex);
        console.log("获取单元格位置：", c, '\n获取单元格内容：', c.data.value);
        return c ? (c.data.value || `<span style="color: red">?</span>`) :
            `<span style="color: red">无单元格</span>`;
    });
}
/** 从表格实例中提取数据值
 *
 * @param {*} instance - 表格实例对象
 * @returns  -二维数组表格数据
 */
export function loadValueSheetBySheetHashSheet(instance) {
    if (!instance) return;
    return instance.hashSheet.map(row => row.map(hash => {
        const cell = instance.cells.get(hash);
        return cell ? cell.data.value : '';
    }));
}

function toArray(valueSheet, skipTop) {
    return skipTop ? valueSheet.slice(1) : valueSheet; //新增判定是否跳过表头
}

// 提高兼容性，可以处理非二位数组的情况
/**
 *
 * @param {*table} valueSheet 数据型数据表
 * @param {*boolean} skipTop 是否跳过表头
 * @returns html格式文本
 */
function toHtml(valueSheet, skipTop = false) {
    if (!Array.isArray(valueSheet)) {
        return "<table></table>"; // 返回空表格
    }

    let html = '<table>';
    let isFirstRow = true;

    for (const row of valueSheet) {
        if (!Array.isArray(row)) {
            continue; // 跳过非数组行
        }

        // 如果skipTop为true且是第一行，则跳过
        if (skipTop && isFirstRow) {
            isFirstRow = false;
            continue;
        }

        html += '<tr>';
        for (const cell of row) {
            html += `<td>${cell ?? ""}</td>`; // 处理可能的 undefined/null
        }
        html += '</tr>';

        isFirstRow = false;
    }
    html += '</table>';
    return html;
}
/**
 *
 * @param {*table} valueSheet 数据型数据表
 * @param {*boolean} skipTop 是否跳过表头
 * @returns cvs 格式文本
 */
function toCSV(valueSheet, skipTop = false) {

    return skipTop ? valueSheet.slice(1).map(row => row.join(',')).join('\n') : valueSheet.map(row => row.join(',')).join('\n');
}

function toMarkdown(valueSheet) {
    // 将 valueSheet 转换为 Markdown 表格
    let markdown = '| ' + valueSheet[0].join(' | ') + ' |\n';
    markdown += '| ' + valueSheet[0].map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < valueSheet.length; i++) {
        markdown += '| ' + valueSheet[i].join(' | ') + ' |\n';
    }
    return markdown;
}

function toJSON(valueSheet) {
    // 将 valueSheet 转换为 JSON 格式
    const columns = valueSheet[0];
    const content = valueSheet.slice(1);
    const json = content.map(row => {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
            obj[columns[i]] = row[i];
        }
        return obj;
    });
    return JSON.stringify(json, null, 2);
}
/**
 * 使用正则解析表格渲染样式
 * @param {Object} instance 表格对象
 * @param {Object} rendererConfig 渲染配置
 * @returns {string} 渲染后的HTML
 */
function regexReplacePipeline(text) {
    if (!text || text === '') return text;
    if (!selectedCustomStyle) return text;

    // Get regex and replace strings from the configuration
    const regexString = selectedCustomStyle.regex || '';
    const replaceString = selectedCustomStyle.replaceDivide || '';
    // console.log("分离后的替换文本：", replaceString)
    // If either regex or replace is empty, return the original text
    if (!regexString || regexString === '') return text;

    try {
        // Extract regex pattern and flags
        let regexPattern = regexString;
        let regexFlags = '';

        // Check if the regex string is in format /pattern/flags
        const regexParts = regexString.match(/^\/(.*?)\/([gimuy]*)$/);
        if (regexParts) {
            regexPattern = regexParts[1];
            regexFlags = regexParts[2];
        }

        // Create a new RegExp object
        const regex = new RegExp(regexPattern, regexFlags);

        // Process the replacement string to handle escape sequences
        let processedReplaceString = replaceString
            .replace(/\\n/g, '\n')   // Convert \n to actual newlines
            .replace(/\\t/g, '\t')   // Convert \t to actual tabs
            .replace(/\\r/g, '\r')   // Convert \r to actual carriage returns
            .replace(/\\b/g, '\b')   // Convert \b to actual backspace
            .replace(/\\f/g, '\f')   // Convert \f to actual form feed
            .replace(/\\v/g, '\v')   // Convert \v to actual vertical tab
            .replace(/\\\\/g, '\\'); // Convert \\ to actual backslash
        // Apply the regex replacement first，增加特定标签包裹的循环替换功能
        let result = "";
        let cycleReplace = processedReplaceString.match(/<cycleDivide>([\s\S]*?)<\/cycleDivide>/);  //获取循环替换字符串

        if (cycleReplace) {
            let cycleReplaceString = cycleReplace[1]; //不含cycleDivide标签
            const cycleReplaceRegex = cycleReplace[0]; //含cycleDivide标签
            // console.log("进入循环替换，获取的循环替换字符串：", '类型：', typeof cycleReplaceString, '内容：', cycleReplaceString);
            processedReplaceString = processedReplaceString.replace(cycleReplaceRegex, "regexTemporaryString"); //临时替换循环替换字符串
            cycleReplaceString = text.replace(regex, cycleReplaceString); //按正则替换循环字符串代码
            // console.log("循环替换后的字符串：", cycleReplaceString);
            result = processedReplaceString.replace("regexTemporaryString", cycleReplaceString);
        } else {
            result = text.replace(regex, processedReplaceString);
            // }
            // Now convert newlines to HTML <br> tags to ensure they display properly in HTML
            if (selectedCustomStyle.basedOn !== 'html' && selectedCustomStyle.basedOn !== 'csv') {  //增加条件不是CSV格式的文本，目前测试出CSV使用该代码会出现渲染错误
                result = result.replace(/\n/g, '<br>');
            }
        }
        return result;

    } catch (error) {
        console.error('Error in regex replacement:', error);
        return text; // Return original text on error
    }
}
/**
 * 获取最近的剧情内容
 * @returns {string} - 获取最近的剧情内容，正则掉思维连
 */
function getLastPlot() {
    const chat = USER.getContext().chat;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].mes != "" && chat[i].is_user == false) {
            const regex1 = "<thinking>[\\s\\S]*?<\/thinking>";
            const regex2 = "临时停用<tableEdit>[\\s\\S]*?<\/tableEdit>";  //暂时不正则掉tableEdit内容看看效果
            const regex = new RegExp(`${regex1}|${regex2}`, "g")
            return chat[i].mes.replace(regex, '');
        }

    }
}
function triggerValueSheet(valueSheet = [], skipTop, alternateTable) {
    if (!Array.isArray(valueSheet)) {
        return Promise.reject(new Error("valueSheet必须为array类型!"));
    }
    const lastchat = getLastPlot();
    let triggerArray = [];
    let i = 0;
    // console.log("上个聊天内容lastchat：", lastchat);
    // console.log("valueSheet为：", valueSheet);
    // console.log("valueSheet第1行为：", valueSheet[0]);
    // console.log("判定前triggerArray为：", triggerArray);
    if (!alternateTable && !skipTop) {
        i = 1;
    }
    // console.log("触发数组triggerArray为：", triggerArray, "\ni为：",i);
    for (i; i < valueSheet.length; i++) {
        // console.log("触发词是：", valueSheet[i][1], "类型为：", typeof valueSheet[i][1]);
        if (lastchat.includes(valueSheet[i][1])) {
            triggerArray.push(valueSheet[i]);
        }
    }
    return triggerArray;
}
/** 用于初始化文本数据的函数，根据不同的格式要求将表格数据转换为指定格式的文本。
 *
 * @param {*table} target - 单个表格对象
 * @param {*string} selectedStyle  - 格式配置的对象
 * @returns {*string}  -表格处理后的文本
 */
export function initializeText(target, selectedStyle) {
    let initialize = '';
    // console.log("瞅瞅target是："+target.config.triggerSendToChat); //调试用，正常不开启
    let valueSheet = target.tableSheet;  // 获取表格数据，二维数组
    // console.log(target.name,"初始化文本表格：" , valueSheet);
    // 新增，判断是否需要触发sendToChat
    if (target.config.triggerSendToChat) {
        // console.log(target.name + "开启触发推送" + valueSheet);
        valueSheet = triggerValueSheet(valueSheet, target.config.skipTop, target.config.alternateTable);
        // console.log(target.name + "检索后valueSheet是否为数组：" + Array.isArray(valueSheet) + "\n检索后valueSheet最后是什么：" + valueSheet);
    }
    const method = selectedStyle.basedOn || 'array';
    switch (method) {
        case 'array':
            initialize = toArray(valueSheet, target.config.skipTop);
            break;
        case 'html':
            initialize = toHtml(valueSheet, target.config.skipTop);
            break;
        case 'csv':
            initialize = toCSV(valueSheet, target.config.skipTop);
            break;
        case 'markdown':
            initialize = toMarkdown(valueSheet);
            break;
        case 'json':
            initialize = toJSON(valueSheet);
            break;
        default:
            console.error('不支持的格式:', method);
    }
    // console.log('初始化值:', method, initialize);
    return initialize;
}

/**用于处理正则表达式替换流程的管道函数
 *
 * @param {Object} target - 单个表格对象
 * @param {Object} rendererConfig 渲染配置
 * @returns {string} 渲染后的HTML
 */
function regexPipeline(target, selectedStyle = selectedCustomStyle) {
    const initText = initializeText(target, selectedStyle);  //初始化文本
    // console.log(target.name,"初始化文本：", initText);
    let result = selectedStyle.replace || '';
    // console.log("初始化文本的长度", result.length);
    const r = result ? regexReplacePipeline(initText) : initText;  //没有替换内容则显示初始化内容，有则进行正则替换
    // console.log("替换后的结果：",r)
    return r
}
/** 根据不同的自定义样式模式来渲染目标元素的函数
 *
 * @param {*table} target - 单个表格，要渲染的目标对象，包含需要渲染的元素
 * @returns {*Html} 处理后的HTML字符串
 */
function executeRendering(target) {
    let resultHtml = target?.element || '<div>表格数据未加载</div>';
    if (config.useCustomStyle === false) {
        // resultHtml = target?.element || '<div>表格数据未加载</div>';
        throw new Error('未启用自定义样式，你需要在 parseSheetRender 外部排除 config.useCustomStyle === false 的情况');
    }
    if (selectedCustomStyle.mode === 'regex') {
        resultHtml = regexPipeline(target);
    } else if (selectedCustomStyle.mode === 'simple') {
        resultHtml = staticPipeline(target);
    }
    return resultHtml;
}

/**
 * 解析表格渲染样式
 * @param {Object} instance 表格对象
 * @param {Object} rendererConfig 渲染配置
 * @returns {string} 渲染后的HTML
 */
export function parseSheetRender(instance, rendererConfig = undefined) {
    let config;
    if (rendererConfig !== undefined) {
        config = rendererConfig;
    } else {
        // 直接使用 instance 的 config
        config = instance.config || {};  // 修改这里
    }

    // 添加防御性编程
    if (!config.customStyles) {
        config.customStyles = {};
    }
    if (!config.selectedCustomStyleKey) {
        config.selectedCustomStyleKey = 'default'; // 使用默认自定义样式
    }

    selectedCustomStyle = config.customStyles[config.selectedCustomStyleKey] || {};

    const r = executeRendering(instance);
    return r;
}
