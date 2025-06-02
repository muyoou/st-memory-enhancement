// tablePushToChat.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { parseSheetRender, loadValueSheetBySheetHashSheet } from "./sheetCustomRenderer.js";
import { cellClickEditModeEvent, cellHighlight } from "../editor/chatSheetsDataView.js";
import { replaceUserTag } from "../../utils/stringUtil.js";


/**
 * 将自定义样式替换为符合HTML格式的样式
 * @param {string} replace -自定义样式字符串
 * @param {string} _viewSheetsContainer -DOM元素，作为工作表的容器
 * @returns {string} -替换后的样式字符串
 */
function divideCumstomReplace(replace, _viewSheetsContainer) {
    let viewSheetsContainer = '';
    const replaceContent = replace;

    // 1. 提取完整的<style>和<script>标签
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;

    viewSheetsContainer += (replaceContent.match(styleRegex) || []).join('');
    viewSheetsContainer += (replaceContent.match(scriptRegex) || []).join('');

    // 2. 清除标签（包括<style>和<script>）
    let dividedContent = replaceContent
        .replace(/<!DOCTYPE html[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '')
        .replace(/<\/html>/gi, '')
        .replace(/<head[^>]*>/gi, '')
        .replace(/<\/head>/gi, '')
        .replace(styleRegex, '')  // 新增：移除<style>标签
        .replace(scriptRegex, ''); // 新增：移除<script>标签

    // 3. 将样式和脚本追加到容器
    $(_viewSheetsContainer).append(viewSheetsContainer);
    // console.log('分离后的函数内的样式数据:', dividedContent);
    return dividedContent;
}

/**
 *  穿插及嵌入渲染
 * @param {@table} tableRole -按同名行提取后的嵌套数组
 * @param {Array} insertMark -是否嵌入的标记
 * @param {Array} indexForTableRole -嵌套数组元素对应的索引
 * @param {Array} _sheets -表格
 * @param {HTMLElement} _viewSheetsContainer -DOM元素，作为工作表的容器
 */
function insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer) {
    let customStyle = '';
    let index = 0;
    for (let i = 0; i < tableRole.length; i++) {
        index = indexForTableRole[i]
        // console.log("穿插及嵌入渲染表格角色索引：" + index);
        // console.log(_sheets[index].name, "穿插及嵌入渲染表格角色：" + tableRole[i]);
        _sheets[index].tableSheet = tableRole[i];
        // console.log("穿插及嵌入渲染表格角色赋值给sheet：", _sheets[index].name, _sheets[index].tableSheet);
        const customContent = parseSheetRender(_sheets[index]);
        // console.log("穿插及嵌入渲染表格返回文本customContentt：" + customContent);
        const placeholderPattern = `<replaceHolder${index}([^>]*)><\\/replaceHolder${index}>`;
        const placeholderRegex = new RegExp(placeholderPattern, 'g');

        if (insertMark[i] && customStyle.match(placeholderRegex)) {
            customStyle = customStyle.replace(placeholderRegex, customContent);
        } else {
            customStyle += customContent;
        }
    }
    // console.log("穿插及嵌入最终返回文本customStyle：" + customStyle);
    const sheetContainer = document.createElement('div')    //DOM元素，作为工作表的容器
    sheetContainer.innerHTML = replaceUserTag(customStyle) //替换掉自定义样式中的<user>标签
    $(_viewSheetsContainer).append(sheetContainer)
}


/**
 * 使用自定义样式渲染工作表
 * @param {@table} sheet -工作表数据
 * @param {HTMLElement} _viewSheetsContainer -DOM元素，作为工作表的容器
 */
function ordinarycustomStyleRender(sheet, _viewSheetsContainer) {
    // console.log('普通表格数据:', sheet.tableSheet);
    const customStyle = parseSheetRender(sheet)             //使用 parseSheetRender 解析工作表
    const sheetContainer = document.createElement('div')    //DOM元素，作为工作表的容器
    sheetContainer.innerHTML = replaceUserTag(customStyle) //替换掉自定义样式中的<user>标签
    $(_viewSheetsContainer).append(sheetContainer)
}

/**
 * 使用默认样式渲染工作表
 * @param {*} index -工作表索引
 * @param {*} sheet -工作表数据
 * @param {*} _viewSheetsContainer -DOM元素，作为工作表的容器
 */
function defaultStyleRender(index, sheet, _viewSheetsContainer) {
    const instance = sheet
    const sheetContainer = document.createElement('div')
    const sheetTitleText = document.createElement('h3')
    sheetContainer.style.overflowX = 'none'
    sheetContainer.style.overflowY = 'auto'
    sheetTitleText.innerText = `#${index} ${sheet.name}`

    let sheetElement = null
    sheetElement = instance.renderSheet(cell => cell.element.style.cursor = 'default')
    cellHighlight(instance)
    $(sheetContainer).append(sheetElement)

    $(_viewSheetsContainer).append(sheetTitleText)
    $(_viewSheetsContainer).append(sheetContainer)
    $(_viewSheetsContainer).append(`<hr>`)
}
/** 辅助函数，判定排序后的数组的当前第i行与第i+1行是否为同一表格的循环行，如果是，则返回true，否则返回false。
 * @param {*} cycleDivideMark  -循环标记
 * @param {*} indexForRowAlternate -对应原表格的索引
 * @param {*} i - 行号
 * @returns - 真假值
 */
function cycleJudge(cycleDivideMark, indexForRowAlternate, i) {
    if (i < 0) return false;
    return cycleDivideMark[indexForRowAlternate[i]] === true && cycleDivideMark[indexForRowAlternate[i + 1]] === true && indexForRowAlternate[i] === indexForRowAlternate[i + 1];
}
/**根据工作表的配置(是否使用自定义样式)，将多个工作表渲染到指定的DOM容器中，支持两种渲染方式：自定义样式渲染和默认样式渲染,自定义样式又分为普通渲染和穿插渲染
 *
 * @param {*table} _sheets -工作表数组，包含多个工作表数据
 * @param {*} _viewSheetsContainer -DOM元素，作为工作表的容器
 */
async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer) {
    let sumAlternateLevel = 0;          // 计数器，统计需要穿插的表格数量
    let levelIndexAlternate = [];       // 统计需要穿插的层级索引
    let indexOriginary = [];      // 记录使用普通自定义定样式的表格索引
    let cycleDivideMark = [];       // 是否具有表格内循环输出的标记
    console.log("穿插模式是否开启：" + USER.tableBaseSetting.alternate_switch)
    if (USER.tableBaseSetting.alternate_switch) {    //首先判断是否开启了穿插模式，再看是否有必要进入穿插模型
        for (let [index, sheet] of _sheets.entries()) {
            if (sheet.config.useCustomStyle === true) {
                _sheets[index].config.customStyles[sheet.config.selectedCustomStyleKey].replaceDivide = divideCumstomReplace(sheet.config.customStyles[sheet.config.selectedCustomStyleKey].replace, _viewSheetsContainer); //对CSS代码进行整理使得最后的文本更符合html格式
            }
            if (sheet.config.toChat === true && sheet.config.useCustomStyle === true && sheet.config.alternateTable === true && sheet.config.alternateLevel > 0) {
                sumAlternateLevel++;        // 符合条件的计数器增加
                levelIndexAlternate.push([Number(sheet.config.alternateLevel), index]); // 加入层级和索引对应数组，强制转换成数字类型，提高健壮性
                sheet.config.skipTop = false;  //穿擦模式只对表格内容进行渲染，且不需要跳过header行
                cycleDivideMark[index] = sheet.config.customStyles[sheet.config.selectedCustomStyleKey].replace.includes('<cycleDivide>');
            }
            else if (sheet.config.toChat === true) {
                indexOriginary.push(index); // 加入普通自定义样式表格索引
            }
        }
    }
    if (sumAlternateLevel > 0) {
        // console.log('穿插模式');
        let tableAlternate = [];  // 用于存储需要穿插的表格
        let indexForRowAlternate = [];  // 用于记录排序后表格的行对应的原表格索引
        // console.log('初始的层级索引对应：', levelIndexAlternate);
        levelIndexAlternate.sort((a, b) => {  // 保证稳定排序
            if (a[0] !== b[0]) {
                return a[0] - b[0]; // 层级不同，按层级排序
            } else {
                return a[1] - b[1]; // 层级相同，按原索引排序（确保稳定）
            }
        });
        // 获得待排序的表格并记录原索引
        for (const [level, index] of levelIndexAlternate) {
            const sheetData = loadValueSheetBySheetHashSheet(_sheets[index]).slice(1);
            // 将每张表的所有行平铺到tableAlternate中
            sheetData.forEach(row => {
                tableAlternate.push(row);
                indexForRowAlternate.push(index); // 记录原表格索引
            });
        }


        // 创建包含行数据、原表格索引和当前索引的对象数组
        const indexedTable = tableAlternate.map((row, currentIndex) => ({
            row,
            originalIndex: indexForRowAlternate[currentIndex],
            currentIndex
        }));

        // 排序（按第2列角色名）
        indexedTable.sort((a, b) => {
            const clean = (str) => String(str).trim().replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
            const roleA = clean(a.row[1]) || "";
            const roleB = clean(b.row[1]) || "";

            // 创建角色首次出现的索引映射
            const firstAppearance = new Map();
            indexedTable.forEach((item, idx) => {
                const role = clean(item.row[1]);
                if (!firstAppearance.has(role)) {
                    firstAppearance.set(role, idx);
                }
            });

            // 角色分组排序
            if (roleA !== roleB) {
                return firstAppearance.get(roleA) - firstAppearance.get(roleB);
            }
        });

        // 提取排序后的行和对应的原表格索引
        tableAlternate = indexedTable.map(item => item.row);
        indexForRowAlternate = indexedTable.map(item => item.originalIndex);
        let tableRole = [];     //按同名行分组熏染的临时辅助数组
        let insertMark = [];    //标记是否要嵌入渲染
        let cycleMark = [];     //临时辅助数组临时标记
        let indexForTableRole = [];
        let j = 0;              //标记用变量
        // console.log("排序后的表格：", tableAlternate);
        // 穿插+合并表格的渲染
        for (let i = 0; i < tableAlternate.length; i++) {
            // console.log('当前行：', i, tableAlternate[i][1])
            if (i === tableAlternate.length - 1) {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {
                    tableRole[j].push(tableAlternate[i]);
                } else {
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                    cycleMark[j] = false;
                }
                // console.log('最后一行提取结束：', j, tableAlternate[i][1])
                // console.log('最后一行提取结束tableRole', tableRole);
                insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer)
            } else if (tableAlternate[i][1] === tableAlternate[i + 1][1]) {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //标记循环的行输入同一个嵌套数组
                    if (!tableRole[j]) {   //判定是否标记循环开始
                        tableRole[j] = [];
                        indexForTableRole[j] = indexForRowAlternate[i];
                        insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                        cycleMark[j] = true;
                        // console.log('循环标记开始', j, i);
                        // console.log('循环标记开始的tableRole：', tableRole);
                    }
                    tableRole[j].push(tableAlternate[i]);
                    if (!cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //判定标记循环结束
                        j++;
                        // console.log('循环标记结束', j, i);
                    }
                } else {                                                        //非循环标记的行输入单独的嵌套数组
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                    cycleMark[j] = false;
                    // console.log('非循环输入提取：', _sheets[indexForRowAlternate[i]].name, j, i);
                    j++;
                }

            } else {
                if (cycleJudge(cycleDivideMark, indexForRowAlternate, i - 1) || cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {
                    tableRole[j].push(tableAlternate[i]);
                    if (!cycleJudge(cycleDivideMark, indexForRowAlternate, i)) {  //判定标记循环结束
                        j++;
                        // console.log('循环标记结束', j, i);
                    }
                } else {
                    tableRole.push([tableAlternate[i]]);
                    indexForTableRole[j] = indexForRowAlternate[i];
                    insertMark[j] = _sheets[indexForRowAlternate[i]].config.insertTable;
                }
                // console.log('同名行提取结束：', j, tableAlternate[i][1])
                // console.log('同名行提取结束tableRole', tableRole);
                insertCustomRender(tableRole, insertMark, cycleMark, indexForTableRole, _sheets, _viewSheetsContainer)
                tableRole = [];
                j = 0;
            }
        }

        // 对普通表格进行渲染
        // console.log('普通表格的索引:', indexOriginary, '普通表格的长度', indexOriginary.length);
        for (let i = 0; i < indexOriginary.length; i++) {
            let sheet = _sheets[indexOriginary[i]];
            sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
            // console.log('进行普通渲染当前普通表格内容：',sheet.tableSheet);
            if (sheet.config.toChat === false) continue; // 如果不需要推送到聊天，则跳过
            if (sheet.config.useCustomStyle === true) {
                // 确保 customStyles 存在且选中的样式有 replace 属性
                if (sheet.config.customStyles &&
                    sheet.config.selectedCustomStyleKey &&
                    sheet.config.customStyles[sheet.config.selectedCustomStyleKey]?.replace) {
                    sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
                    ordinarycustomStyleRender(sheet, _viewSheetsContainer);
                    continue; // 处理完成后跳过默认渲染
                }
            }
            defaultStyleRender(indexOriginary[i], sheet, _viewSheetsContainer);

        }
    }
    else {
        // console.log('进入普通渲染模式');
        for (let [index, sheet] of _sheets.entries()) {
            // 如果不需要推送到聊天，则跳过
            if (sheet.config.toChat === false) continue;

            // 检查是否使用自定义样式且满足条件
            if (sheet.config.useCustomStyle === true) {
                // 确保 customStyles 存在且选中的样式有 replace 属性
                if (sheet.config.customStyles &&
                    sheet.config.selectedCustomStyleKey &&
                    sheet.config.customStyles[sheet.config.selectedCustomStyleKey]?.replace) {

                    sheet.tableSheet = loadValueSheetBySheetHashSheet(sheet);
                    ordinarycustomStyleRender(sheet, _viewSheetsContainer);
                    continue; // 处理完成后跳过默认渲染
                }
            }

            // 默认样式渲染（包括 useCustomStyle=false 或 customStyles 不满足条件的情况）
            defaultStyleRender(index, sheet, _viewSheetsContainer);
        }
    }
}

/**
 * 将table数据推送至聊天内容中显示
 * @param sheets
 */
function replaceTableToStatusTag(sheets) {
    let chatContainer
    if (USER.tableBaseSetting.table_to_chat_mode === 'context_bottom') {
        chatContainer = window.document.querySelector('#chat');
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'last_message') {
        chatContainer = window.document.querySelector('.last_mes')?.querySelector('.mes_text'); // 获取最后一条消息的容器
    } else if (USER.tableBaseSetting.table_to_chat_mode === 'macro') {
        // 在document中查找到{{sheetsView}}的位置

    }

    // 定义具名的事件监听器函数
    const touchstartHandler = function (event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function (event) {
        event.stopPropagation();
    };
    const touchendHandler = function (event) {
        event.stopPropagation();
    };

    setTimeout(async () => {
        // 此处注意竞态条件，可能在setTimeout执行前，上一轮tableStatusContainer还未被添加
        const currentTableStatusContainer = document.querySelector('#tableStatusContainer');
        if (currentTableStatusContainer) {
            // 移除之前的事件监听器，防止重复添加 (虽然在这个场景下不太可能重复添加)
            currentTableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            currentTableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            currentTableStatusContainer.removeEventListener('touchend', touchendHandler);
            currentTableStatusContainer?.remove(); // 移除旧的 tableStatusContainer
        }

        // 在这里添加新的 tableStatusContainer
        const r = USER.tableBaseSetting.to_chat_container.replace(/\$0/g, `<tableStatus id="table_push_to_chat_sheets"></tableStatus>`);
        $(chatContainer).append(`<div class="wide100p" id="tableStatusContainer">${r}</div>`); // 添加新的 tableStatusContainer
        const tableStatusContainer = chatContainer?.querySelector('#table_push_to_chat_sheets');
        renderEditableSheetsDOM(sheets, tableStatusContainer);

        // 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // 添加事件监听器，使用具名函数
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        // console.log('tableStatusContainer:', newTableStatusContainer);
    }, 0);
}

/**
 * 更新最后一条 System 消息的 <tableStatus> 标签内容
 */
export function updateSystemMessageTableStatus(force = false) {
    console.log("更新最后一条 System 消息的 <tableStatus> 标签内容", USER.tableBaseSetting.isTableToChat)
    if (force === false) {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isTableToChat === false) {
            window.document.querySelector('#tableStatusContainer')?.remove();
            return;
        }
    }
    // console.log("更新最后一条 System ")
    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);

    replaceTableToStatusTag(sheets);
}
/**
 * 触发穿插模式
 */
export function updateAlternateTable() {

    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);

    replaceTableToStatusTag(sheets);
}

/**
 * 新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableRendererPopup() {
    const manager = await SYSTEM.getTemplate('customSheetStyle');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const sheetsData = BASE.getLastSheetsPiece()?.piece.hash_sheets;
    if (!sheetsData) {
        // console.warn("openTableRendererPopup: 未能获取到有效的 table 对象。");
        return;
    }
    const sheets = BASE.hashSheetsToSheets(sheetsData)[0];
    let sheetElements = '';
    for (let sheet of sheets) {
        if (!sheet.tochat) continue;
        if (!sheet.data.customStyle || sheet.data.customStyle === '') {
            sheetElements += sheet.renderSheet().outerHTML;
            continue;
        }
        // parseTableRender()
    }

    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    // 修改中实时渲染
    console.log("openTableRendererPopup-elements.rendererDisplay 是否存在:", !!elements.rendererDisplay);
    console.log("jQuery 对象长度:", elements.rendererDisplay?.length || 0);
    const renderHTML = () => {
        $tableRendererDisplay.html(sheetElements);
    };

    renderHTML();
    $htmlEditor.on('input', renderHTML); // 监听 input 事件，实时渲染

    await tableRendererPopup.show();
}
