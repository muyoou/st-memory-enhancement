import { APP, BASE, DERIVED, EDITOR, SYSTEM, USER } from './core/manager.js';
import { Logger } from './services/logger.js';
import { openTableRendererPopup, updateSystemMessageTableStatus } from "./scripts/renderer/tablePushToChat.js";
import { loadSettings } from "./scripts/settings/userExtensionSetting.js";
import { resetPopupConfirmations } from './components/popupConfirm.js';
import { ext_getAllTables, ext_exportAllTablesAsJson } from './scripts/settings/standaloneAPI.js';
import { openTableDebugLogPopup } from "./scripts/settings/devConsole.js";
import { TableTwoStepSummary, triggerTableFillFromLastMessage } from "./scripts/runtime/separateTableUpdate.js";
import { saveStepData, readStepData, clearStepData } from './services/stepByStepStorage.js';
import { initTest } from "./components/_fotTest.js";
import { initAppHeaderTableDrawer, openAppHeaderTableDrawer } from "./scripts/renderer/appHeaderTableBaseDrawer.js";
import { initRefreshTypeSelector } from './scripts/runtime/absoluteRefresh.js';
import {refreshTempView, updateTableContainerPosition} from "./scripts/editor/tableTemplateEditView.js";
import { refreshContextView, autoImportFromStash } from "./scripts/editor/chatSheetsDataView.js";
import { functionToBeRegistered } from "./services/debugs.js";
import { parseLooseDict, replaceUserTag } from "./utils/stringUtil.js";
import { reloadCurrentChat } from "/script.js";
import {executeTranslation} from "./services/translate.js";
import { getCombinedWorldbookContent } from './core/lore.js';
import applicationFunctionManager from "./services/appFuncManager.js";


Logger.info("______________________记忆插件：开始加载______________________")

// --- [核心改造] 回调函数管理器 ---
// 将其定义在顶层作用域，确保在脚本加载后立即对其他窗口可用。
const tableUpdateCallbacks = [];
const tableFillStartCallbacks = []; // 新增：用于通知填表开始的回调
window.stMemoryEnhancement = {
    // 新增：触发“填表开始”的通知
    _notifyTableFillStart: function() {
        Logger.info(`[Memory Enhancement] _notifyTableFillStart called. Notifying ${tableFillStartCallbacks.length} callbacks.`);
        if (tableFillStartCallbacks.length === 0) {
            Logger.warn('[Memory Enhancement] No table fill start callbacks are registered.');
        }
        Logger.debug(`[Memory Enhancement] Notifying ${tableFillStartCallbacks.length} callbacks about table fill start.`);
        tableFillStartCallbacks.forEach(callback => {
            try {
                callback();
            } catch (e) {
                Logger.error('[Memory Enhancement] Error executing a table fill start callback:', e);
            }
        });
    },
    // 新增：注册“填表开始”的回调
    registerTableFillStartCallback: function(callback) {
        if (typeof callback === 'function' && !tableFillStartCallbacks.includes(callback)) {
            tableFillStartCallbacks.push(callback);
            Logger.info(`[Memory Enhancement] A new table fill start callback has been registered. Total callbacks: ${tableFillStartCallbacks.length}`);
            console.log('Registered callbacks:', tableFillStartCallbacks);
        }
    },
    // 新增：注销“填表开始”的回调
    unregisterTableFillStartCallback: function(callback) {
        const index = tableFillStartCallbacks.indexOf(callback);
        if (index > -1) {
            tableFillStartCallbacks.splice(index, 1);
            Logger.info('[Memory Enhancement] A table fill start callback has been unregistered.');
        }
    },
    ext_getAllTables,
    ext_exportAllTablesAsJson,
    /**
     * 从一个JSON对象或字符串加载所有表格数据，并覆盖现有数据。
     * @param {string|Object} jsonData - 包含表格数据的JSON字符串或对象。
     */
    ext_loadAllTablesFromJson: function(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            if (!data || typeof data !== 'object') {
                throw new Error('Provided data is not a valid object.');
            }
            
            // 假设 BASE.load 可以处理这种格式的数据来更新内存
            // 这需要 BASE.load 函数有能力解析 hash_sheets 和 cell_history
            const { hash_sheets, cell_history } = data;
            if (!hash_sheets || !cell_history) {
                // 如果数据格式不直接匹配，可能需要一个转换层
                // 但基于 v5.4.0 的文档，我们假设数据是直接从 ext_exportAllTablesAsJson 来的
                Logger.warn('ext_loadAllTablesFromJson: JSON data is missing hash_sheets or cell_history. Attempting to load directly.');
                BASE.load(data);
            } else {
                BASE.load(hash_sheets, cell_history);
            }

        // 通知UI更新
        window.stMemoryEnhancement._notifyTableUpdate(ext_exportAllTablesAsJson());
        Logger.info('[Memory Enhancement] Tables loaded and UI notified.');

    } catch (error) {
        Logger.error('[Memory Enhancement] Failed to load tables from JSON:', error);
        EDITOR.error(`从JSON加载表格失败: ${error.message}`);
    }
},
/**
 * [新增] 作为“导入”功能的正式接口，使用 applyJsonToChatSheets 实现完全覆盖。
 * @param {string|Object} jsonData - 包含表格数据的JSON字符串或对象。
 */
ext_importAllTablesFromJson: function(jsonData) {
    try {
        const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        if (!data || typeof data !== 'object') {
            throw new Error('Provided data is not a valid object.');
        }
        BASE.applyJsonToChatSheets(data);
        Logger.info('[Memory Enhancement] Tables imported via applyJsonToChatSheets.');
        
        // [修复] 手动触发UI刷新
        BASE.refreshContextView(); // 刷新插件的表格数据页面
        window.stMemoryEnhancement._notifyTableUpdate(ext_exportAllTablesAsJson()); // 通知外部UI（美化界面）刷新

    } catch (error) {
        Logger.error('[Memory Enhancement] Failed to import tables from JSON:', error);
        EDITOR.error(`导入表格失败: ${error.message}`);
    }
},
triggerTableFillFromLastMessage,
/**
 * 注册一个回调函数，当表格数据更新时将被调用。
     * @param {function(Object)} callback - 当数据更新时要执行的回调函数，它将接收最新的表格JSON数据作为参数。
     */
    registerTableUpdateCallback: function(callback) {
        if (typeof callback === 'function' && !tableUpdateCallbacks.includes(callback)) {
            tableUpdateCallbacks.push(callback);
            Logger.info('[Memory Enhancement] A new table update callback has been registered.');
        }
    },
    /**
     * 注销一个已注册的回调函数。
     * @param {function} callback - 要移除的回调函数。
     */
    unregisterTableUpdateCallback: function(callback) {
        const index = tableUpdateCallbacks.indexOf(callback);
        if (index > -1) {
            tableUpdateCallbacks.splice(index, 1);
            Logger.info('[Memory Enhancement] A table update callback has been unregistered.');
        }
    },
    /**
     * (内部使用) 通知所有已注册的监听器数据已更新。
     * @param {Object} newData - 最新的表格JSON数据。
     */
    _notifyTableUpdate: function(newData) {
        Logger.debug(`[Memory Enhancement] Notifying ${tableUpdateCallbacks.length} callbacks about table update.`);
        tableUpdateCallbacks.forEach(callback => {
            try {
                callback(newData);
            } catch (e) {
                Logger.error('[Memory Enhancement] Error executing a table update callback:', e);
            }
        });
    }
};
// --- [核心改造] 结束 ---


let reloadDebounceTimer;
const VERSION = '2.1.1'

const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

/**
 * 修复值中不正确的转义单引号
 * @param {*} value
 * @returns
 */
function fixUnescapedSingleQuotes(value) {
    if (typeof value === 'string') {
        return value.replace(/\\'/g, "'");
    }
    if (typeof value === 'object' && value !== null) {
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                value[key] = fixUnescapedSingleQuotes(value[key]);
            }
        }
    }
    return value;
}

/**
 * 通过表格索引查找表格结构
 * @param {number} index 表格索引
 * @returns 此索引的表格结构
 */
export function findTableStructureByIndex(index) {
    return USER.tableBaseSetting.tableStructure[index];
}

/**
 * 检查数据是否为Sheet实例，不是则转换为新的Sheet实例
 * @param {Object[]} dataTable 所有表格对象数组
 */
function checkPrototype(dataTable) {
    // 旧的Table实例检查逻辑已被移除
    // 现在使用新的Sheet类处理表格数据
    // 这个函数保留是为了兼容旧代码调用，但内部逻辑已更新
    return dataTable;
}

export async function buildSheetsByTemplates(targetPiece) {
    // [修复] 仅在开始新对话时（通过消息数量判断）才尝试从暂存区自动加载
    if (USER.getContext().chat.length < 3) {
        const loadedFromStash = await autoImportFromStash();
        if (loadedFromStash) {
            // 如果从暂存区加载成功，则直接返回。
            // `autoImportFromStash` 内部的 `processImportedData` 已经处理了数据应用和UI渲染。
            // 移除原有的 `reloadCurrentChat()`，因为它会导致不必要的全局刷新，造成“覆盖”的错觉。
            return;
        }
        // [二次修复] 如果从暂存加载失败，并且当前没有任何聊天记录，则直接中止，防止在空载体情况下循环
        if (USER.getContext().chat.length === 0) {
            Logger.warn('[Memory Enhancement] 暂存为空，且无聊天载体，已中止表格创建。');
            return;
        }
    }

    // 如果不是新对话，或者暂存区为空，则按原计划从模板创建
    BASE.sheetsData.context = [];
    // USER.getChatPiece().hash_sheets = {};
    const templates = BASE.templates
    templates.forEach(template => {
        if(template.enable === false) return

        // 检查 template 结构
        if (!template || !template.hashSheet || !Array.isArray(template.hashSheet) || template.hashSheet.length === 0 || !Array.isArray(template.hashSheet[0]) || !template.cellHistory || !Array.isArray(template.cellHistory)) {
            Logger.error(`[Memory Enhancement] 在 buildSheetsByTemplates 中遇到无效的模板结构 (缺少 hashSheet 或 cellHistory)。跳过模板:`, template);
            return; // 跳过处理此模板
        }
        try {
            const newSheet = BASE.createChatSheetByTemp(template);
            newSheet.save(targetPiece);
        } catch (error) {
            EDITOR.error(`[Memory Enhancement] 从模板创建或保存 sheet 时出错:`, "", error);
        }
    })
    BASE.updateSelectBySheetStatus()
    USER.saveChat()
}

/**
 * 转化旧表格为sheets
 * @param {DERIVED.Table[]} oldTableList 旧表格数据
 */
export function convertOldTablesToNewSheets(oldTableList, targetPiece) {
    //USER.getChatPiece().hash_sheets = {};
    const sheets = []
    for (const oldTable of oldTableList) {
        const valueSheet = [oldTable.columns, ...oldTable.content].map(row => ['', ...row])
        const cols = valueSheet[0].length
        const rows = valueSheet.length
        const targetSheetUid = BASE.sheetsData.context.find(sheet => sheet.name === oldTable.tableName)?.uid
        if (targetSheetUid) {
            // 如果表格已存在，则更新表格数据
            const targetSheet = BASE.getChatSheet(targetSheetUid)
            Logger.info("表格已存在，更新表格数据", targetSheet)
            targetSheet.rebuildHashSheetByValueSheet(valueSheet)
            targetSheet.save(targetPiece)
            addOldTablePrompt(targetSheet)
            sheets.push(targetSheet)
            continue
        }
        // 如果表格未存在，则创建新的表格
        const newSheet = BASE.createChatSheet(cols, rows);
        newSheet.name = oldTable.tableName
        newSheet.domain = newSheet.SheetDomain.chat
        newSheet.type = newSheet.SheetType.dynamic
        newSheet.enable = oldTable.enable
        newSheet.required = oldTable.Required
        newSheet.config.toChat = true
        newSheet.triggerSend = false
        newSheet.triggerSendDeep = 1

        addOldTablePrompt(newSheet)
        newSheet.data.description = `${oldTable.note}\n${oldTable.initNode}\n${oldTable.insertNode}\n${oldTable.updateNode}\n${oldTable.deleteNode}`

        valueSheet.forEach((row, rowIndex) => {
            row.forEach((value, colIndex) => {
                const cell = newSheet.findCellByPosition(rowIndex, colIndex)
                cell.data.value = value
            })
        })

        newSheet.save(targetPiece)
        sheets.push(newSheet)
    }
    // USER.saveChat()
    Logger.info("转换旧表格数据为新表格数据", sheets)
    return sheets
}

/**
 * 添加旧表格结构中的提示词到新的表格中
 * @param {*} sheet 表格对象
 */
function addOldTablePrompt(sheet) {
    const tableStructure = USER.tableBaseSetting.tableStructure.find(table => table.tableName === sheet.name)
    Logger.debug("添加旧表格提示词", tableStructure, USER.tableBaseSetting.tableStructure, sheet.name)
    if (!tableStructure) return false
    const source = sheet.source
    source.required = tableStructure.Required
    source.data.initNode = tableStructure.initNode
    source.data.insertNode = tableStructure.insertNode
    source.data.updateNode = tableStructure.updateNode
    source.data.deleteNode = tableStructure.deleteNode
    source.data.note = tableStructure.note
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
export function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = USER.getContext().chat
    for (let i = isIncludeStartIndex ? startIndex : startIndex + 1; i < chat.length; i++) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { index: i, chat: chat[i] }
        }
    }
    return { index: - 1, chat: null }
}

/**
 * 搜寻最后一个含有表格数据的消息，并生成提示词
 * @returns 生成的完整提示词
 */
export async function initTableData(eventData) {
    const tablePrompt = getTablePrompt(eventData);
    const worldbookPrompt = await getCombinedWorldbookContent();

    let combinedData = tablePrompt;
    if (worldbookPrompt) {
        // 如果两个部分都有内容，用分隔符隔开
        if (tablePrompt) {
            combinedData = `${worldbookPrompt}\n\n---\n\n${tablePrompt}`;
        } else {
            combinedData = worldbookPrompt;
        }
    }

    const allPrompt = USER.tableBaseSetting.message_template.replace('{{tableData}}', combinedData);
    const promptContent = replaceUserTag(allPrompt); //替换所有的<user>标签
    Logger.debug("完整提示 (表格+世界书)", promptContent);
    return promptContent;
}

/**
 * 获取表格相关提示词
 * @returns {string} 表格相关提示词
 */
export function getTablePrompt(eventData, isPureData = false, ignoreToChatFilter = false) {
    // [v4.9.0] 核心重构：不再从历史消息中读取数据，而是动态生成包含最新表格状态的 piece。
    const currentSheets = BASE.getChatSheets();
    if (!currentSheets || currentSheets.length === 0) {
        return '';
    }

    // 创建一个临时的 piece 对象，用于收集所有当前表格的最新状态。
    const dynamicPiece = { hash_sheets: {} };
    currentSheets.forEach(sheet => {
        if (sheet.enable) {
            sheet.save(dynamicPiece); // 调用 save 方法将 sheet 的当前状态填充到 dynamicPiece 中
        }
    });

    if (Object.keys(dynamicPiece.hash_sheets).length === 0) {
        return ''; // 如果没有任何启用的表格，则不生成提示词
    }

    Logger.debug("动态生成的、包含最新表格数据的 piece:", dynamicPiece);
    return getTablePromptByPiece(dynamicPiece, isPureData, ignoreToChatFilter);
}

/**
 * 通过piece获取表格相关提示词
 * @param {Object} piece 聊天片段
 * @returns {string} 表格相关提示词
 */
export function getTablePromptByPiece(piece, isPureData = false, ignoreToChatFilter = false) {
    const {hash_sheets} = piece
    const sheets = BASE.hashSheetsToSheets(hash_sheets)
        .filter(sheet => sheet.enable);
    Logger.debug("构建提示词时的信息 (已过滤)", { hash_sheets, sheets });
    const customParts = isPureData ? ['title', 'headers', 'rows'] : ['title', 'node', 'headers', 'rows', 'editRules'];
    const sheetDataPrompt = sheets.map((sheet, index) => sheet.getTableText(index, customParts, piece, ignoreToChatFilter)).join('\n')
    return sheetDataPrompt
}

/**
 * 将匹配到的整体字符串转化为单个语句的数组
 * @param {string[]} matches 匹配到的整体字符串
 * @returns 单条执行语句数组
 */
function handleTableEditTag(matches) {
    const functionRegex = /(updateRow|insertRow|deleteRow)\(/g;
    let A = [];
    let match;
    let positions = [];
    matches.forEach(input => {
        while ((match = functionRegex.exec(input)) !== null) {
            positions.push({
                index: match.index,
                name: match[1].replace("Row", "") // 转换成 update/insert/delete
            });
        }

        // 合并函数片段和位置
        for (let i = 0; i < positions.length; i++) {
            const start = positions[i].index;
            const end = i + 1 < positions.length ? positions[i + 1].index : input.length;
            const fullCall = input.slice(start, end);
            const lastParenIndex = fullCall.lastIndexOf(")");

            if (lastParenIndex !== -1) {
                const sliced = fullCall.slice(0, lastParenIndex); // 去掉最后一个 )
                const argsPart = sliced.slice(sliced.indexOf("(") + 1);
                const args = argsPart.match(/("[^"]*"|\{.*\}|[0-9]+)/g)?.map(s => s.trim());
                if(!args) continue
                A.push({
                    type: positions[i].name,
                    param: args,
                    index: positions[i].index,
                    length: end - start
                });
            }
        }
    });
    return A;
}

/**
 * 检查表格编辑字符串是否改变
 * @param {Chat} chat 单个聊天对象
 * @param {string[]} matches 新的匹配对象
 * @returns
 */
function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false
    }
    chat.tableEditMatches = matches
    return true
}

/**
 * 清除表格中的所有空行
 */
function clearEmpty() {
    DERIVED.any.waitingTable.forEach(table => {
        table.clearEmpty()
    })
}



/**
 * 处理文本内的表格编辑事件
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @returns
 */
export function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    parseTableEditTag(chat, mesIndex, ignoreCheck)
    updateSystemMessageTableStatus();   // 新增代码，将表格数据状态更新到系统消息中
    //executeTableEditTag(chat, mesIndex)
}

/**
 * 解析回复中的表格编辑标签
 * @param {*} piece 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @param {boolean} manualSave 是否强制保存聊天记录
 */
export function parseTableEditTag(piece, mesIndex = -1, ignoreCheck = false, manualSave = true) {
    const { matches } = getTableEditTag(piece.mes)
    if (!ignoreCheck && !isTableEditStrChanged(piece, matches)) return false
    const tableEditActions = handleTableEditTag(matches)
    tableEditActions.forEach((action, index) => tableEditActions[index].action = classifyParams(formatParams(action.param)))
    Logger.debug("解析到的表格编辑指令", tableEditActions)

    // 获取上一个表格数据
    const { piece: prePiece } = mesIndex === -1 ? BASE.getLastSheetsPiece(1) : BASE.getLastSheetsPiece(mesIndex - 1, 1000, false)
    const sheets = BASE.hashSheetsToSheets(prePiece.hash_sheets).filter(sheet => sheet.enable)
    Logger.debug("执行指令时的信息", sheets)
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets)
    }
    // 修复：只有在需要时才强制保存，避免在“立即填表”的撤销阶段引发文件竞争
    sheets.forEach(sheet => sheet.save(piece, manualSave))
    Logger.debug("聊天模板：", BASE.sheetsData.context)
    Logger.debug("获取到的表格数据", prePiece)
    Logger.debug("测试总chat", USER.getContext().chat)
    return true
}

/**
 * 直接通过编辑指令字符串执行操作
 * @param {string[]} matches 编辑指令字符串
 */
export function executeTableEditActions(matches, referencePiece) {
    const tableEditActions = handleTableEditTag(matches)
    tableEditActions.forEach((action, index) => tableEditActions[index].action = classifyParams(formatParams(action.param)))
    Logger.debug("解析到的表格编辑指令", tableEditActions)

    // 核心修复：不再信任传入的 referencePiece.hash_sheets，而是直接从 BASE 获取当前激活的、唯一的 Sheet 实例。
    const sheets = BASE.getChatSheets().filter(sheet => sheet.enable)
    if (!sheets || sheets.length === 0) {
        Logger.error("executeTableEditActions: 未找到任何启用的表格实例，操作中止。");
        return false;
    }

    Logger.debug("执行指令时的信息 (来自 BASE.getChatSheets)", sheets)
    for (const EditAction of sortActions(tableEditActions)) {
        executeAction(EditAction, sheets)
    }
    
    // 核心修复：确保修改被保存到当前最新的聊天片段中。
    const { piece: currentPiece } = USER.getChatPiece();
    if (!currentPiece) {
        Logger.error("executeTableEditActions: 无法获取当前聊天片段，保存操作失败。");
        return false;
    }
    sheets.forEach(sheet => sheet.save(currentPiece, true))

    Logger.debug("聊天模板：", BASE.sheetsData.context)
    Logger.debug("测试总chat", USER.getContext().chat)
    return true // 返回 true 表示成功
}

/**
 * 执行单个action指令
 */
function executeAction(EditAction, sheets) {
    const action = EditAction.action
    const sheet = sheets[action.tableIndex]
    if (!sheet) {
        Logger.error("表格不存在，无法执行编辑操作", EditAction);
        return -1;
    }

    // 在所有操作前，深度清理一次action.data
    if (action.data) {
        action.data = fixUnescapedSingleQuotes(action.data);
    }
    switch (EditAction.type) {
        case 'update':
            // 执行更新操作
            const rowIndex = action.rowIndex ? parseInt(action.rowIndex):0
            if(rowIndex >= sheet.getRowCount()-1) return executeAction({...EditAction, type:'insert'}, sheets)
            if(!action?.data) return
            Object.entries(action.data).forEach(([key, value]) => {
                const cell = sheet.findCellByPosition(rowIndex + 1, parseInt(key) + 1)
                if (!cell) return -1
                cell.newAction(cell.CellAction.editCell, { value }, false)
            })
            break
        case 'insert': {
            // 执行插入操作
            const cell = sheet.findCellByPosition(sheet.getRowCount() - 1, 0)
            cell.newAction(cell.CellAction.insertDownRow, {}, false)
            const lastestRow = sheet.getRowCount() - 1
            const cells = sheet.getCellsByRowIndex(lastestRow)
            if(!cells || !action.data) return
            cells.forEach((cell, index) => {
                if (index === 0) return 
                cell.data.value = action.data[index - 1]
            })
        }
            break
        case 'delete':
            // 执行删除操作
            const deleteRow = parseInt(action.rowIndex) + 1
            const cell = sheet.findCellByPosition(deleteRow, 0)
            if (!cell) return -1
            cell.newAction(cell.CellAction.deleteSelfRow, {}, false)
            break
    }
    Logger.debug("执行表格编辑操作", EditAction)
    return 1
}


/**
 * 为actions排序
 * @param {Object[]} actions 要排序的actions
 * @returns 排序后的actions
 */
function sortActions(actions) {
    // 定义排序优先级
    const priority = {
        update: 0,
        insert: 1,
        delete: 2
    };
    return actions.sort((a, b) => (priority[a.type] === 2 && priority[b.type] === 2) ? (b.action.rowIndex - a.action.rowIndex) : (priority[a.type] - priority[b.type]));
}

/**
 * 格式化参数
 * @description 将参数数组中的字符串转换为数字或对象
 * @param {string[]} paramArray
 * @returns
 */
function formatParams(paramArray) {
    return paramArray.map(item => {
        const trimmed = item.trim();
        if (!isNaN(trimmed) && trimmed !== "") {
            return Number(trimmed);
        }
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            return parseLooseDict(trimmed);
        }

        // 其他情况都返回字符串
        return trimmed;
    });
}

/**
 * 分类参数
 * @param {string[]} param 参数
 * @returns {Object} 分类后的参数对象
 */
function classifyParams(param) {
    const action = {};
    for (const key in param) {
        if (typeof param[key] === 'number') {
            if (key === '0') action.tableIndex = param[key]
            else if (key === '1') action.rowIndex = param[key]
        } else if (typeof param[key] === 'object') {
            action.data = param[key]
        }
    }
    return action
}

/**
 * 执行回复中得编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {

    // 如果不是最新的消息，则更新接下来的表格
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex)
        if (index !== -1) handleEditStrInMessage(nextChat, index, true)
    }
}

/**
 * 干运行获取插入action的插入位置和表格插入更新内容
 */
function dryRunExecuteTableEditTag() {
    // TODO 使用新的Sheet系统处理表格编辑
}

/**
 * 获取生成的操作函数字符串
 * @returns 生成的操作函数字符串
 */
export function getTableEditActionsStr() {
    const tableEditActionsStr = DERIVED.any.tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n')
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n'
}

/**
 * 替换聊天中的TableEdit标签内的内容
 * @param {*} chat 聊天对象
 */
export function replaceTableEditTag(chat, newContent) {
    // 处理 mes
    if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.mes)) {
        chat.mes = chat.mes.replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>${newContent}</tableEdit>`);
    } else {
        chat.mes += `\n<tableEdit>${newContent}</tableEdit>`;
    }
    // 处理 swipes
    if (chat.swipes != null && chat.swipe_id != null)
        if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.swipes[chat.swipe_id])) {
            chat.swipes[chat.swipe_id] = chat.swipes[chat.swipe_id].replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>\n${newContent}\n</tableEdit>`);
        } else {
            chat.swipes[chat.swipe_id] += `\n<tableEdit>${newContent}</tableEdit>`;
        }
    USER.getContext().saveChat();
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (USER.tableBaseSetting.injection_mode) {
        case 'deep_system':
            return 'system'
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
    }
}

/**
 * 注入表格总体提示词
 * @param {*} eventData
 * @returns
 */
async function onChatCompletionPromptReady(eventData) {
    try {
        // 优先处理分步填表模式
        if (USER.tableBaseSetting.step_by_step === true) {
            // 仅当插件和AI读表功能开启时才注入
            if (USER.tableBaseSetting.isExtensionAble === true && USER.tableBaseSetting.isAiReadTable === true) {
                const tableData = getTablePrompt(eventData, true); // 获取纯净数据
                if (tableData) { // 确保有内容可注入
                    const finalPrompt = `以下是通过表格记录的当前场景信息以及历史记录信息，你需要以此为参考进行思考：\n${tableData}`;
                    if (USER.tableBaseSetting.deep === 0) {
                        eventData.chat.push({ role: getMesRole(), content: finalPrompt });
                    } else {
                        eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: finalPrompt });
                    }
                    Logger.info("分步填表模式：注入只读表格数据", eventData.chat);
                }
            }
            return; // 处理完分步模式后直接退出，不执行后续的常规注入
        }

        // 常规模式的注入逻辑
        if (eventData.dryRun === true ||
            USER.tableBaseSetting.isExtensionAble === false ||
            USER.tableBaseSetting.isAiReadTable === false ||
            USER.tableBaseSetting.injection_mode === "injection_off") {
            return;
        }

        Logger.debug("生成提示词前", USER.getContext().chat)
        const promptContent = await initTableData(eventData)
        if (USER.tableBaseSetting.deep === 0)
            eventData.chat.push({ role: getMesRole(), content: promptContent })
        else
            eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: promptContent })

        updateSheetsView()
    } catch (error) {
        EDITOR.error(`记忆插件：表格数据注入失败\n原因：`,error.message, error);
    }
    Logger.info("注入表格总体提示词", eventData.chat)
}

/**
  * 宏获取提示词
  */
async function getMacroPrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return ""
        if (USER.tableBaseSetting.step_by_step === true) {
            const tablePrompt = replaceUserTag(getTablePrompt(undefined, true));
            const worldbookPrompt = await getCombinedWorldbookContent();
            let combinedPrompt = tablePrompt;
            if (worldbookPrompt) {
                combinedPrompt = tablePrompt ? `${worldbookPrompt}\n\n---\n\n${tablePrompt}` : worldbookPrompt;
            }
            return `以下是通过表格记录的当前场景信息以及历史记录信息，你需要以此为参考进行思考：\n${combinedPrompt}`
        }
        const promptContent = await initTableData()
        return promptContent
    }catch (error) {
        EDITOR.error(`记忆插件：宏提示词注入失败\n原因：`, error.message, error);
        return ""
    }
}

/**
  * 宏获取表格提示词
  */
function getMacroTablePrompt() {
    try {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return ""
        if(USER.tableBaseSetting.step_by_step === true){
            const promptContent = replaceUserTag(getTablePrompt(undefined, true))
            return promptContent
        }
        const promptContent = replaceUserTag(getTablePrompt())
        return promptContent
    }catch (error) {
        EDITOR.error(`记忆插件：宏提示词注入失败\n原因：`, error.message, error);
        return ""
    }
}

/**
 * 去掉编辑指令两端的空格和注释标签
 * @param {string} str 输入的编辑指令字符串
 * @returns
 */
function trimString(str) {
    const str1 = str.trim()
    if (!str1.startsWith("<!--") || !str1.endsWith("-->")) {
        editErrorInfo.forgotCommentTag = true
    }
    return str1
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim()
}

/**
 * 获取表格的tableEdit标签内的内容
 * @param {string} mes 消息正文字符串
 * @returns {matches} 匹配到的内容数组
 */

export function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches }
}

/**
 * 消息编辑时触发
 * @param this_edit_mes_id 此消息的ID
 */
async function onMessageEdited(this_edit_mes_id) {
    // “二次拦截”逻辑已通过 MutationObserver 实现，此处不再需要。
    // 保留原有的、处理手动编辑的逻辑。
    const chat_message = USER.getContext().chat[this_edit_mes_id];
    if (!chat_message || USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === true) return;
    if (chat_message.is_user === true || USER.tableBaseSetting.isAiWriteTable === false) return;
    try {
        handleEditStrInMessage(chat_message, parseInt(this_edit_mes_id));
    } catch (error) {
        EDITOR.error("记忆插件：表格编辑失败\n原因：", error.message, error);
    }
    updateSheetsView();
}

/**
 * 检查“填完再发”功能是否已启用
 * @returns {boolean}
 */
function isWaitThenSendEnabled() {
    return USER.tableBaseSetting.isExtensionAble === true &&
           USER.tableBaseSetting.wait_for_fill_then_send === true &&
           USER.tableBaseSetting.step_by_step === true &&
           USER.getContext().chat.length > 2;
}

/**
 * 执行“填完再发”流程，确保数据模型同步
 * @param {number} chat_id 消息ID
 * @param {string} messageContent 用于填表的、最新的（可能已优化）文本内容
 */
async function performWaitThenSend(chat_id, messageContent) {
    // [持久化改造] 在执行任何操作前，先将待办任务存入localStorage
    saveStepData({ chatId: chat_id, content: messageContent });

    let messageElement;
    const maxAttempts = 20; // 最多尝试20次（2秒）
    let attempts = 0;

    // 轮询等待DOM元素出现
    while (attempts < maxAttempts) {
        messageElement = $(`div.mes[mesid="${chat_id}"]`);
        if (messageElement.length > 0) break;
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    if (!messageElement || messageElement.length === 0) {
        console.error(`[Memory Enhancement] 轮询2秒后，仍无法找到消息元素 (ID: ${chat_id})。`);
        await TableTwoStepSummary("auto_wait", messageContent);
        await USER.getContext().saveChat();
        return;
    }

    try {
        // 1. [新方案] 拦截但不隐藏，立即将内容替换为“处理中”状态，以避免破坏 /chat-jump 的目标。
        messageElement.find('.mes_text').html('<em>正在处理表格，请稍候...</em>');

        // 2. 处理
        const result = await TableTwoStepSummary("auto_wait", messageContent);

        // 3. 根据填表结果决定后续操作
        if (result === 'success') {
            // 填表成功，更新数据模型
            const chat = USER.getContext().chat;
            if (chat[chat_id]) {
                chat[chat_id].mes = messageContent;
            }
            await USER.getContext().saveChat();

            // a. 将消息内容更新为成功提示
            messageElement.find('.mes_text').html('<em>表格更新成功，正在刷新...</em>');
            
            // b. 延迟执行破坏性的UI重载，为酒馆的内部命令（如 /chat-jump）提供一个安全的执行窗口
            setTimeout(() => {
                reloadCurrentChat();
            }, 100); // 保持100ms延迟作为安全余量

        } else {
            // 填表失败或被用户取消
            const reason = result === 'cancelled' ? '用户取消' : '执行失败';
            EDITOR.error(`后台分步填表${reason}。`);
            
            // [新方案] 恢复原始消息内容，而不是简单地 .show() 一个被隐藏的元素
            const originalContent = USER.getContext().chat[chat_id]?.mes ?? '内容恢复失败。';
            messageElement.find('.mes_text').html(originalContent);
        }
    } catch(e) {
        EDITOR.error("“填完再发”流程发生错误: ", e.message, e);
        // [新方案] 发生错误时，也尝试恢复原始消息内容
        try {
            const originalContent = USER.getContext().chat[chat_id]?.mes ?? '发生错误，无法恢复内容。';
            messageElement.find('.mes_text').html(originalContent);
        } catch (innerErr) {
            // 如果连恢复都失败了，就显示一个错误消息
             messageElement.find('.mes_text').html('<em>处理时发生严重错误，请检查控制台。</em>');
        }
        messageElement.show(); // 确保在任何意外情况下，元素最终都是可见的。
    }
}

/**
 * 消息接收时触发
 * @param {number} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    setTimeout(async () => {
        Logger.group(`onMessageReceived - chat_id: ${chat_id}`);
        try {
            if (USER.tableBaseSetting.isExtensionAble === false) return;
            
            // "填完再发" 的首次拦截（即无优化插件时）或常规流程
            if (isWaitThenSendEnabled()) {
                // 检查优化插件是否存在，如果不存在，则执行首次拦截
                if (!window.Amily2ChatOptimisation) {
                    Logger.info('[Memory Enhancement] 未检测到优化插件，执行首次拦截-填完再发流程。');
                    const chat = USER.getContext().chat[chat_id];
                    if (chat) {
                        await performWaitThenSend(chat_id, chat.mes);
                    }
                }
                // 如果优化插件存在，则不做任何事，等待 MutationObserver 进行二次拦截
                else {
                    Logger.info('[Memory Enhancement] “填完再发”已激活，等待二次拦截。');
                }
                return;
            }

            const chat = USER.getContext().chat[chat_id];
            if (!chat) {
                Logger.warn(`[Memory Enhancement] onMessageReceived: 在延迟后未找到 chat_id ${chat_id} 对应的聊天对象。`);
                return;
            }

            // 其他模式的原始逻辑
            if (USER.tableBaseSetting.step_by_step === true && USER.getContext().chat.length > 2) {
                TableTwoStepSummary("auto");
            } else {
                if (USER.tableBaseSetting.isAiWriteTable === false) return;
                handleEditStrInMessage(chat);
            }

            updateSheetsView();
        } catch (error) {
            EDITOR.error("记忆插件：onMessageReceived 处理失败\n原因：", error.message, error);
        } finally {
            Logger.groupEnd();
        }
    }, 0);
}

/**
 * 解析字符串中所有 {{GET::...}} 宏
 * @param {string} text - 需要解析的文本
 * @returns {string} - 解析并替换宏之后的文本
 */
function resolveTableMacros(text) {
    if (typeof text !== 'string' || !text.includes('{{GET::')) {
        return text;
    }

    return text.replace(/{{GET::\s*([^:]+?)\s*:\s*([A-Z]+\d+)\s*}}/g, (match, tableName, cellAddress) => {
        const sheets = BASE.getChatSheets();
        const targetTable = sheets.find(t => t.name.trim() === tableName.trim());

        if (!targetTable) {
            return `<span style="color: red">[GET: 未找到表格 "${tableName}"]</span>`;
        }

        try {
            const cell = targetTable.getCellFromAddress(cellAddress);
            const cellValue = cell ? cell.data.value : undefined;
            return cellValue !== undefined ? cellValue : `<span style="color: orange">[GET: 在 "${tableName}" 中未找到单元格 "${cellAddress}"]</span>`;
        } catch (error) {
            Logger.error(`Error resolving GET macro for ${tableName}:${cellAddress}`, error);
            return `<span style="color: red">[GET: 处理时出错]</span>`;
        }
    });
}

/**
 * 聊天变化时触发
 */
async function onChatChanged() {
    try {
        // 更新表格视图
        updateSheetsView();

        // 在聊天消息中渲染宏
        document.querySelectorAll('.mes_text').forEach(mes => {
            if (mes.dataset.macroProcessed) return;

            const originalHtml = mes.innerHTML;
            const newHtml = resolveTableMacros(originalHtml);

            if (originalHtml !== newHtml) {
                mes.innerHTML = newHtml;
                mes.dataset.macroProcessed = true;
            }
        });

    } catch (error) {
        EDITOR.error("记忆插件：处理聊天变更失败\n原因：", error.message, error)
    }
}


/**
 * 滑动切换消息事件
 */
async function onMessageSwiped(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiWriteTable === false) return
    const chat = USER.getContext().chat[chat_id];
    Logger.info("滑动切换消息", chat)
    if (!chat.swipe_info[chat.swipe_id]) return
    try {
        handleEditStrInMessage(chat)
    } catch (error) {
        EDITOR.error("记忆插件：swipe切换失败\n原因：", error.message, error)
    }

    updateSheetsView()
}

/**
 * 恢复指定层数的表格
 */
export async function undoSheets(deep) {
    const {piece, deep:findDeep} = BASE.getLastSheetsPiece(deep)
    if(findDeep === -1) return 
    Logger.info("撤回表格数据", piece, findDeep)
    // 修复：在撤销操作中调用 handleEditStrInMessage 时，传递第四个参数为 false，以禁止其内部的强制保存操作，从而避免文件竞争。
    handleEditStrInMessage(piece, findDeep, true, false)
    updateSheetsView()
}

/**
 * 更新新表格视图
 * @description 更新表格视图，使用新的Sheet系统
 * @returns {Promise<*[]>}
 */
async function updateSheetsView() {
    const task = new SYSTEM.taskTiming('openAppHeaderTableDrawer_task')
    try{
       // 刷新表格视图
        Logger.info("========================================\n更新表格视图")
        refreshTempView(true).then(() => task.log());
        Logger.info("========================================\n更新表格内容视图")
        refreshContextView().then(() => task.log());

        // 更新系统消息中的表格状态
        updateSystemMessageTableStatus(); 
    }catch (error) {
        EDITOR.error("记忆插件：更新表格视图失败\n原因：", error.message, error)
    }
}

/**
 * 打开表格drawer
 */
export function openDrawer() {
    const drawer = $('#table_database_settings_drawer .drawer-toggle')
    if (isDrawerNewVersion()) {
        applicationFunctionManager.doNavbarIconClick.call(drawer)
    }else{
        return openAppHeaderTableDrawer()
    }
}

/**
 * 获取是新版还是旧版drawer
 */
export function isDrawerNewVersion() {
    return !!applicationFunctionManager.doNavbarIconClick
}

jQuery(async () => {
    // 在插件加载时立即重置所有确认框的状态
    resetPopupConfirmations();
    
    // 版本检查
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: USER.getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) EDITOR.warning(res.toastrText)
            if (res.message) $("#table_message_tip").html(res.message)
        }
    })

    // 注意：已移除旧表格系统的初始化代码，现在使用新的Sheet系统

    // 分离手机和电脑事件
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        Logger.info("手机端")
        // 手机端事件
    } else {
        Logger.info("电脑端")
        // 电脑端事件
        initTest();
    }

    // 开始添加各部分的根DOM
    // 添加表格编辑工具栏
    $('#translation_container').after(await SYSTEM.getTemplate('index'));
    // 添加顶部表格管理工具弹窗
    $('#extensions-settings-button').after(await SYSTEM.getTemplate('appHeaderTableDrawer'));

    // 应用程序启动时加载设置
    loadSettings();

    // 注册宏
    USER.getContext().registerMacro("tablePrompt", () =>getMacroPrompt())
    USER.getContext().registerMacro("tableData", () =>getMacroTablePrompt())
    USER.getContext().registerMacro("GET_ALL_TABLES_JSON", () => {
        try {
            const jsonData = ext_exportAllTablesAsJson();
            if (Object.keys(jsonData).length === 0) {
                return "{}"; // 如果没有数据，返回一个空的JSON对象
            }
            // 返回JSON字符串，不带额外的格式化，以便在代码中直接使用
            return JSON.stringify(jsonData);
        } catch (error) {
            Logger.error("GET_ALL_TABLES_JSON 宏执行出错:", error);
            EDITOR.error("导出所有表格数据时出错。");
            return "{}"; // 出错时返回空JSON对象
        }
    });

    // 设置表格编辑按钮
    Logger.info("设置表格编辑按钮", applicationFunctionManager.doNavbarIconClick)
    if (isDrawerNewVersion()) {
        $('#table_database_settings_drawer .drawer-toggle').on('click', applicationFunctionManager.doNavbarIconClick);
    }else{
        $('#table_drawer_content').attr('data-slide-toggle', 'hidden').css('display', 'none');
        $('#table_database_settings_drawer .drawer-toggle').on('click', openAppHeaderTableDrawer);
    }
    // // 设置表格编辑按钮
    // $(document).on('click', '.tableEditor_editButton', function () {
    //     let index = $(this).data('index'); // 获取当前点击的索引
    //     openTableSettingPopup(index);
    // })
    // // 设置表格编辑按钮
    // $(document).on('click', '.tableEditor_editButton', function () {
    //     let index = $(this).data('index'); // 获取当前点击的索引
    //     openTableSettingPopup(index);
    // })
    // 点击表格渲染样式设置按钮
    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    })
    // 点击打开查看表格日志按钮
    $(document).on('click', '#table_debug_log_button', function () {
        openTableDebugLogPopup();
    })
    // 对话数据表格弹出窗
    $(document).on('click', '.open_table_by_id', function () {
        const messageId = $(this).closest('.mes').attr('mesid');
        initRefreshTypeSelector();
    })
    // 设置表格开启开关
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
    })

    initAppHeaderTableDrawer().then();  // 初始化表格编辑器
    functionToBeRegistered()    // 注册用于调试的各种函数

    executeTranslation(); // 执行翻译函数

    // 增加延迟，确保主程序完全加载后再绑定事件，防止竞态条件
    setTimeout(() => {
        // 监听主程序事件
        APP.eventSource.on(APP.event_types.MESSAGE_RECEIVED, onMessageReceived);
        APP.eventSource.on(APP.event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
        APP.eventSource.on(APP.event_types.CHAT_CHANGED, onChatChanged);
        APP.eventSource.on(APP.event_types.MESSAGE_EDITED, onMessageEdited);
        APP.eventSource.on(APP.event_types.MESSAGE_SWIPED, onMessageSwiped);
        APP.eventSource.on(APP.event_types.MESSAGE_DELETED, onChatChanged);
        Logger.info("______________________记忆插件：事件监听器已激活______________________");
    }, 500); // 500毫秒延迟


    Logger.info("______________________记忆插件：加载完成______________________")
});
