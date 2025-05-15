// absoluteRefresh.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { findTableStructureByIndex, convertOldTablesToNewSheets } from "../../index.js";
import { insertRow, updateRow, deleteRow } from "../../core/table/oldTableActions.js";
import JSON5 from '../../utils/json5.min.mjs'
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest } from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { refreshContextView } from "../editor/chatSheetsDataView.js";
import { PopupConfirm } from "../../components/popupConfirm.js";

// 在解析响应后添加验证
function validateActions(actions) {
    if (!Array.isArray(actions)) {
        console.error('操作列表必须是数组');
        return false;
    }
    return actions.every(action => {
        // 检查必要字段
        if (!action.action || !['insert', 'update', 'delete'].includes(action.action.toLowerCase())) {
            console.error(`无效的操作类型: ${action.action}`);
            return false;
        }
        if (typeof action.tableIndex !== 'number') {
            console.error(`tableIndex 必须是数字: ${action.tableIndex}`);
            return false;
        }
        if (action.action !== 'insert' && typeof action.rowIndex !== 'number') {
            console.error(`rowIndex 必须是数字: ${action.rowIndex}`);
            return false;
        }
        // 检查 data 字段
        if (action.data && typeof action.data === 'object') {
            const invalidKeys = Object.keys(action.data).filter(k => !/^\d+$/.test(k));
            if (invalidKeys.length > 0) {
                console.error(`发现非数字键: ${invalidKeys.join(', ')}`);
                return false;
            }
        }
        return true;
    });
}

function confirmTheOperationPerformed(content) {
    console.log('content:', content);
    return `
<div class="wide100p padding5 dataBankAttachments">
    <div class="refresh-title-bar">
        <h2 class="refresh-title"> 请确认以下操作 </h2>
        <div>

        </div>
    </div>
    <div id="tableRefresh" class="refresh-scroll-content">
        <div>
            <div class="operation-list-container"> ${content.map(table => {
        return `
<h3 class="operation-list-title">${table.tableName}</h3>
<div class="operation-list">
    <table class="tableDom sheet-table">
        <thead>
            <tr>
                ${table.columns.map(column => `<th>${column}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${table.content.map(row => `
            <tr>
                ${row.map(cell => `<td>${cell}</td>`).join('')}
            </tr>
            `).join('')}
        </tbody>
    </table>
</div>
<hr>
`;
    }).join('')}
            </div>
        </div>
    </div>
</div>

<style>
    .operation-list-title {
        text-align: left;
        margin-top: 10px;
    }
    .operation-list-container {
        display: flex;
        flex-wrap: wrap;
    }
    .operation-list {
        width: 100%;
        max-width: 100%;
        overflow: auto;
    }
</style>
`;
}



/**
 * 初始化表格刷新类型选择器
 * 根据profile_prompts对象动态生成下拉选择器的选项
 */
export function initRefreshTypeSelector() {
    const $selector = $('#table_refresh_type_selector');
    if (!$selector.length) return;

    // 清空并重新添加选项
    $selector.empty();

    // 遍历profile_prompts对象，添加选项
    Object.entries(profile_prompts).forEach(([key, value]) => {
        const option = $('<option></option>')
            .attr('value', key)
            .text((() => {
                switch (value.type) {
                    case 'refresh':
                        return '**旧** ' + (value.name || key);
                    case 'third_party':
                        return '**第三方作者** ' + (value.name || key);
                    default:
                        return value.name || key;
                }
            })());
        $selector.append(option);
    });

    // 如果没有选项，添加默认选项
    if ($selector.children().length === 0) {
        $selector.append($('<option></option>').attr('value', 'rebuild_base').text('~~~看到这个选项说明出问题了~~~~'));
    }

    console.log('表格刷新类型选择器已更新');

    // // 检查现有选项是否与profile_prompts一致
    // let needsUpdate = false;
    // const currentOptions = $selector.find('option').map(function() {
    //     return {
    //         value: $(this).val(),
    //         text: $(this).text()
    //     };
    // }).get();

    // // 检查选项数量是否一致
    // if (currentOptions.length !== Object.keys(profile_prompts).length) {
    //     needsUpdate = true;
    // } else {
    //     // 检查每个选项的值和文本是否一致
    //     Object.entries(profile_prompts).forEach(([key, value]) => {
    //         const currentOption = currentOptions.find(opt => opt.value === key);
    //         if (!currentOption ||
    //             currentOption.text !== ((value.type=='refresh'? '**旧** ':'')+value.name|| key)) {
    //             needsUpdate = true;
    //         }
    //     });
    // }

    // // 不匹配时清空并重新添加选项
    // if (needsUpdate) {
    //     $selector.empty();

    //     // 遍历profile_prompts对象，添加选项
    //     Object.entries(profile_prompts).forEach(([key, value]) => {
    //         const option = $('<option></option>')
    //             .attr('value', key)
    //             .text((value.type=='refresh'? '**旧** ':'')+value.name|| key);
    //         $selector.append(option);
    //     });

    //     // 如果没有选项，添加默认选项
    //     if ($selector.children().length === 0) {
    //         $selector.append($('<option></option>').attr('value', 'rebuild_base').text('~~~看到这个选项说明出问题了~~~~'));
    //     }

    //     console.log('表格刷新类型选择器已更新');
}



/**
 * 根据选择的刷新类型获取对应的提示模板并调用rebuildTableActions
 * @param {string} templateName 提示模板名称
 * @param {string} additionalPrompt 附加的提示内容
 * @param {boolean} force 是否强制刷新,不显示确认对话框
 * @param {boolean} isSilentUpdate 是否静默更新,不显示操作确认
 * @param {string} chatToBeUsed 要使用的聊天记录,为空则使用最近的聊天记录
 * @returns {Promise<void>}
 */
export async function getPromptAndRebuildTable(templateName = '', additionalPrompt ,force, isSilentUpdate, chatToBeUsed = '') {
    let systemPrompt = '';
    let userPrompt = '';
    let r='';

    try {
        // 根据刷新类型获取对应的提示模板
        const selectedPrompt = profile_prompts[templateName];
        if (!selectedPrompt) {
            // 提供更详细的错误信息
            const availablePrompts = Object.keys(profile_prompts).join(', ');
            const errorMsg = `未找到对应的提示模板: ${refreshType}。可用的模板有: ${availablePrompts}`;
            throw new Error(errorMsg);
        }
        console.log('选择的提示模板名称:', selectedPrompt.name, '附加的提示内容:', additionalPrompt);

        systemPrompt = selectedPrompt.system_prompt;

        // 构建userPrompt，由四部分组成：user_prompt_begin、history、last_table和core_rules
        userPrompt = selectedPrompt.user_prompt_begin || '';
        // 根据include_history决定是否包含聊天记录部分
        if (selectedPrompt.include_history) {
            userPrompt += `\n<聊天记录>\n    $1\n</聊天记录>\n`;
        }
        // 根据include_last_table决定是否包含当前表格部分
        if (selectedPrompt.include_last_table) {
            userPrompt += `\n<当前表格>\n    $0\n</当前表格>\n`;
        }

        // 添加core_rules部分
        if (selectedPrompt.core_rules) {
            userPrompt += `\n${selectedPrompt.core_rules}`;
        }
        // 仅当additionalPrompt非空时才添加用户附加需求部分
        if (additionalPrompt) {
            userPrompt += `\n<用户附加需求>\n${additionalPrompt}\n</用户附加需求>\n`;
        }

        // 如果不是默认表格，则根据当前表格，生成一份空表格作为格式示例
        if (selectedPrompt.name !== 'rebuild_base') {
            userPrompt += `\n回复格式示例。再次强调，直接按以下格式回复，不要思考过程，不要解释，不要多余内容：\n<新的表格>\n    $2\n</新的表格>\n`;
        }


        // 将获取到的提示模板设置到USER.tableBaseSetting中
        USER.tableBaseSetting.rebuild_system_message_template = systemPrompt;
        USER.tableBaseSetting.rebuild_user_message_template = userPrompt;

        console.log('获取到的提示模板:', systemPrompt, userPrompt);

        // 根据提示模板类型选择不同的表格处理函数
        // const force = $('#bool_force_refresh').prop('checked');
        const silentUpdate = isSilentUpdate !== undefined ? isSilentUpdate : $('#bool_silent_refresh').prop('checked');
        if (selectedPrompt.type === 'rebuild') {
            r = await rebuildTableActions(force || true, silentUpdate, chatToBeUsed);
        } else if (selectedPrompt.type === 'refresh') {
            r = await refreshTableActions(force || true, silentUpdate);
        } else {
            // 默认使用rebuildTableActions
            r = await rebuildTableActions(force || true, silentUpdate, chatToBeUsed);
        }
        return r;
    } catch (error) {
        console.error('获取提示模板失败:', error);
        EDITOR.error(`获取提示模板失败: ${error.message}`);
    }
}

/**
 * 重新生成完整表格
 * @param {*} force 是否强制刷新
 * @param {*} silentUpdate  是否静默更新
 * @param chatToBeUsed
 * @returns
 */
export async function rebuildTableActions(force = false, silentUpdate = false, chatToBeUsed = '') {
    let r = '';
    if (!SYSTEM.lazy('rebuildTableActions', 1000)) return;

    // 如果不是强制刷新，先确认是否继续
    // if (!force) {
    //     // 显示配置状态
    //     const tableRefreshPopup = getRefreshTableConfigStatus(1);
    //     const confirmation = await EDITOR.callGenericPopup(tableRefreshPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    //     if (!confirmation) return;
    // }

    // 开始重新生成完整表格
    console.log('开始重新生成完整表格');
    const isUseMainAPI = $('#use_main_api').prop('checked');

    try {
        const { piece } = BASE.getLastSheetsPiece();
        if (!piece) {
            throw new Error('findLastestTableData 未返回有效的表格数据');
        }
        const latestTables = BASE.hashSheetsToSheets(piece.hash_sheets).filter(sheet=>sheet.enable);
        DERIVED.any.waitingTable = latestTables;

        const oldTable = sheetsToTables(latestTables)
        let originText = JSON.stringify(tablesToString(latestTables));

        // 提取表头信息
        const tableHeadersOnly = oldTable.map((table, index) => {
            let name = `Table ${index + 1}`;
            if (typeof table.tableName === 'string' && table.tableName) {
                name = table.tableName;
            }
            let headers = [];
            if (Array.isArray(table.headers) && table.headers.length > 0) {
                headers = table.headers;
            } else if (Array.isArray(table.columns) && table.columns.length > 0) {
                headers = table.columns;
            }
            return {
                tableName: name,
                headers: headers
            };
        });
        const tableHeadersJson = JSON.stringify(tableHeadersOnly);
        console.log('表头数据 (JSON):', tableHeadersJson);

        console.log('重整理 - 最新的表格数据:', originText);

        // 获取最近clear_up_stairs条聊天记录
        const chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat,
            USER.tableBaseSetting.clear_up_stairs,
            USER.tableBaseSetting.ignore_user_sent,
            USER.tableBaseSetting.rebuild_token_limit_value
            // USER.tableBaseSetting.use_token_limit ? USER.tableBaseSetting.rebuild_token_limit_value : 0
        ) : chatToBeUsed;

        // 构建AI提示
        let systemPrompt = USER.tableBaseSetting.rebuild_system_message_template || USER.tableBaseSetting.rebuild_system_message;
        let userPrompt = USER.tableBaseSetting.rebuild_user_message_template;
        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);
        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats，将$2替换成空表头
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);
        userPrompt = userPrompt.replace(/\$2/g, tableHeadersJson);

        // console.log('systemPrompt:', systemPrompt);
        // console.log('userPrompt:', userPrompt);

        console.log('预估token数量为：' + estimateTokenCount(systemPrompt + userPrompt));

        // 生成响应内容
        let rawContent;
        if (isUseMainAPI) {
            try {
                rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消');
                    return
                }
            } catch (error) {
                EDITOR.clear();
                EDITOR.error('主API请求错误: ' + error.message);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.clear();
                    EDITOR.info('操作已取消');
                    return
                }
            } catch (error) {
                EDITOR.clear();
                EDITOR.error('自定义API请求错误: ' + error.message);
            }
        }
        console.log('rawContent:', rawContent);

        // 检查 rawContent 是否有效
        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            EDITOR.clear();
            EDITOR.error('API响应内容无效或为空，无法继续处理表格。');
            console.error('API响应内容无效或为空，rawContent:', rawContent);
            return;
        }

        //清洗
        let cleanContentTable = fixTableFormat(rawContent);
        console.log('cleanContent:', cleanContentTable);

        //将表格保存回去
        if (cleanContentTable) {
            try {
                // 验证数据格式
                if (!Array.isArray(cleanContentTable)) {
                    throw new Error("生成的新表格数据不是数组");
                }
                //标记改动
                // TODO
                compareAndMarkChanges(oldTable, cleanContentTable);
                // console.log('compareAndMarkChanges后的cleanContent:', cleanContentTable);

                // 深拷贝避免引用问题
                const clonedTables = tableDataToTables(cleanContentTable);
                console.log('深拷贝后的cleanContent:', clonedTables);

                // 防止修改标题
                clonedTables.forEach((table, index) => {
                    table.tableName = oldTable[index].tableName
                });

                // 如果不是静默更新，显示操作确认
                if (!silentUpdate) {
                    // 将uniqueActions内容推送给用户确认是否继续
                    const confirmContent = confirmTheOperationPerformed(clonedTables);
                    const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
                    EDITOR.clear();
                    await tableRefreshPopup.show();
                    if (!tableRefreshPopup.result) {
                        EDITOR.info('操作已取消');
                        return;
                    }
                }

                // 更新聊天记录
                const chat = USER.getContext().chat;
                const lastIndex = chat.length - 1;
                if (lastIndex >= 0) {
                    convertOldTablesToNewSheets(clonedTables, chat[lastIndex])
                    await USER.getContext().saveChat(); // 等待保存完成
                } else {
                    throw new Error("聊天记录为空");
                }

                // 刷新 UI
                const tableContainer = document.querySelector('#tableContainer');
                if (tableContainer) {
                    refreshContextView();
                    updateSystemMessageTableStatus();
                    EDITOR.success('生成表格成功！');
                    r = 'success';
                } else {
                    // console.error("无法刷新表格：容器未找到");
                    // EDITOR.error('生成表格失败：容器未找到');
                }
                return r;
            } catch (error) {
                console.error('保存表格时出错:', error);
                EDITOR.error(`生成表格失败：${error.message}`);
            }
        } else {
            EDITOR.error("生成表格保存失败：内容为空");
        }

    } catch (e) {
        console.error('Error in rebuildTableActions:', e);
        return;
    } finally {

    }
}

export async function refreshTableActions(force = false, silentUpdate = false, chatToBeUsed = '') {
    if (!SYSTEM.lazy('refreshTableActions', 1000)) return;

    // // 如果不是强制刷新，先确认是否继续
    // if (!force) {
    //     // 显示配置状态
    //     const tableRefreshPopup = getRefreshTableConfigStatus();
    //     const confirmation = await EDITOR.callGenericPopup(tableRefreshPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    //     if (!confirmation) return;
    // }

    // 开始执行整理表格
    const twoStepIsUseMainAPI = $('#step_by_step_use_main_api').prop('checked');

    try {
        const { piece } = BASE.getLastSheetsPiece();
        if (!piece) {
            throw new Error('findLastestTableData 未返回有效的表格数据');
        }
        const latestTables = BASE.hashSheetsToSheets(piece.hash_sheets);
        DERIVED.any.waitingTable = latestTables;

        let originText = '<表格内容>\n' + latestTables
            .map((table, index) => table.getTableText(index, ['title', 'node', 'headers', 'rows']))
            .join("\n");

        // 获取最近clear_up_stairs条聊天记录
        let chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat, USER.tableBaseSetting.clear_up_stairs, USER.tableBaseSetting.ignore_user_sent) : chatToBeUsed;

        // 构建AI提示
        let systemPrompt = USER.tableBaseSetting.refresh_system_message_template;
        let userPrompt = USER.tableBaseSetting.refresh_user_message_template;

        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);

        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        // 生成响应内容
        let rawContent;
        if (twoStepIsUseMainAPI) {
            try {
                rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消');
                    return 'suspended'
                }
            } catch (error) {
                EDITOR.error('主API请求错误: ' + error.message);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消');
                    return 'suspended'
                }
            } catch (error) {
                EDITOR.error('自定义API请求错误: ' + error.message);
            }
        }

        //统一清洗
        let cleanContent = cleanApiResponse(rawContent);

        // 解析响应内容
        let actions;
        try {
            // 增强清洗逻辑
            cleanContent = cleanContent
                // 时间格式保护（最先处理！！！！！）
                .replace(/(?<!")(\d{1,2}:\d{2})(?!")/g, '"$1"') // 使用负向断言确保不会重复处理
                // 统一键名处理
                .replace(/"([a-zA-Z_]\w*)"\s*:/g, '"$1":') // 仅处理合法键名格式
                // 尾逗号修复
                .replace(/,\s*([}\]])/g, '$1')
                // 数字键处理（需在时间处理后执行）
                .replace(/([{,]\s*)(\d+)(\s*:)/g, '$1"$2"$3')
                // 其他处理
                .replace(/\\\//g, '/')
                .replace(/\/\/.*/g, ''); // 行注释移除

            // 安全校验
            if (!cleanContent || typeof cleanContent !== 'string') {
                throw new Error('无效的响应内容');
            }

            actions = JSON5.parse(cleanContent);
            if (!validateActions(actions)) {
                throw new Error('AI返回了无效的操作格式');
            }
        } catch (parseError) {
            // 添加错误位置容错处理
            const position = parseError.position || 0;
            console.error('[解析错误] 详细日志：', {
                rawContent: cleanContent,
                errorPosition: parseError.stack,
                previewText: cleanContent.slice(
                    Math.max(0, position - 50),
                    position + 50
                )
            });
            throw new Error(`JSON解析失败：${parseError.message}`);
        }
        console.log('清洗后的内容:', cleanContent);

        // 去重并确保删除操作顺序
        let uniqueActions = [];
        const deleteActions = [];
        const nonDeleteActions = [];
        // 分离删除和非删除操作
        actions.forEach(action => {
            if (action.action.toLowerCase() === 'delete') {
                deleteActions.push(action);
            } else {
                nonDeleteActions.push(action);
            }
        });

        // 去重非删除操作，考虑表格现有内容
        const uniqueNonDeleteActions = nonDeleteActions.filter((action, index, self) => {
            if (action.action.toLowerCase() === 'insert') {
                const table = DERIVED.any.waitingTable[action.tableIndex];

                // 容错
                if (!table) {
                    console.warn(`表索引 ${action.tableIndex} 无效，跳过操作:`, action);
                    return;
                }
                if (!table.content || !Array.isArray(table.content)) {
                    const tableNameForLog = table.tableName ? `(名称: ${table.tableName})` : '';
                    console.warn(`表索引 ${action.tableIndex} ${tableNameForLog} 的 'content' 属性无效或不是数组。将初始化为空数组。原始 'content':`, table.content);
                    table.content = [];
                }


                const dataStr = JSON.stringify(action.data);
                // 检查是否已存在完全相同的行
                const existsInTable = table.content.some(row => JSON.stringify(row) === dataStr);
                const existsInPreviousActions = self.slice(0, index).some(a =>
                    a.action.toLowerCase() === 'insert' &&
                    a.tableIndex === action.tableIndex &&
                    JSON.stringify(a.data) === dataStr
                );
                return !existsInTable && !existsInPreviousActions;
            }
            return index === self.findIndex(a =>
                a.action === action.action &&
                a.tableIndex === action.tableIndex &&
                a.rowIndex === action.rowIndex &&
                JSON.stringify(a.data) === JSON.stringify(action.data)
            );
        });

        // 去重删除操作并按 rowIndex 降序排序
        const uniqueDeleteActions = deleteActions
            .filter((action, index, self) =>
                index === self.findIndex(a => (
                    a.tableIndex === action.tableIndex &&
                    a.rowIndex === action.rowIndex
                ))
            )
            .sort((a, b) => b.rowIndex - a.rowIndex); // 降序排序，确保大 rowIndex 先执行

        // 合并操作：先非删除，后删除
        uniqueActions = [...uniqueNonDeleteActions, ...uniqueDeleteActions];

        // 如果不是静默更新，显示操作确认
        if (!silentUpdate) {
            // 将uniqueActions内容推送给用户确认是否继续
            const confirmContent = confirmTheOperationPerformed(uniqueActions);
            const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
            EDITOR.clear();
            await tableRefreshPopup.show();
            if (!tableRefreshPopup.result) {
                EDITOR.info('操作已取消');
                return;
            }
        }

        // 处理用户确认的操作
        // 执行操作
        uniqueActions.forEach(action => {
            switch (action.action.toLowerCase()) {
                case 'update':
                    try {
                        const targetRow = DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex];
                        if (!targetRow || !targetRow[0]?.trim()) {
                            console.log(`Skipped update: table ${action.tableIndex} row ${action.rowIndex} 第一列为空`);
                            break;
                        }
                        updateRow(action.tableIndex, action.rowIndex, action.data);
                        console.log(`Updated: table ${action.tableIndex}, row ${action.rowIndex}`, DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex]);
                    } catch (error) {
                        console.error(`Update操作失败: ${error.message}`);
                    }
                    break;
                case 'insert':
                    const requiredColumns = findTableStructureByIndex(action.tableIndex)?.columns || [];
                    const isDataComplete = requiredColumns.every((_, index) => action.data.hasOwnProperty(index.toString()));
                    if (!isDataComplete) {
                        console.error(`插入失败：表 ${action.tableIndex} 缺少必填列数据`);
                        break;
                    }
                    insertRow(action.tableIndex, action.data);
                    break;
                case 'delete':
                    if (action.tableIndex === 0 || !USER.tableBaseSetting.bool_ignore_del) {
                        const deletedRow = DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex];
                        deleteRow(action.tableIndex, action.rowIndex);
                        console.log(`Deleted: table ${action.tableIndex}, row ${action.rowIndex}`, deletedRow);
                    } else {
                        console.log(`Ignore: table ${action.tableIndex}, row ${action.rowIndex}`);
                    }
                    break;
            }
        });

        if (USER.tableBaseSetting.bool_ignore_del) {
            EDITOR.success('删除保护启用，已忽略了删除操作（可在插件设置中修改）');
        }

        // 更新聊天数据
        chat = USER.getContext().chat[USER.getContext().chat.length - 1];
        chat.dataTable = DERIVED.any.waitingTable;
        USER.getContext().saveChat();
        // 刷新 UI
        const tableContainer = document.querySelector('#tableContainer');
        refreshContextView();
        updateSystemMessageTableStatus()
        EDITOR.success('表格整理完成');
    } catch (error) {
        console.error('整理过程出错:', error);
        EDITOR.error(`整理失败：${error.message}`);
    } finally {

    }
}

export async function rebuildSheets() {
    const container = document.createElement('div');
    console.log('测试开始');


    const style = document.createElement('style');
    style.innerHTML = `
        .rebuild-preview-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .rebuild-preview-text {
            display: flex;
            justify-content: left
        }
    `;
    container.appendChild(style);

    // Replace jQuery append with standard DOM methods
    const h3Element = document.createElement('h3');
    h3Element.textContent = '重建表格数据';
    container.appendChild(h3Element);

    const previewDiv1 = document.createElement('div');
    previewDiv1.className = 'rebuild-preview-item';
    previewDiv1.innerHTML = `<span>执行前确认？：</span>${USER.tableBaseSetting.bool_silent_refresh ? '否' : '是'}`;
    container.appendChild(previewDiv1);

    const previewDiv2 = document.createElement('div');
    previewDiv2.className = 'rebuild-preview-item';
    previewDiv2.innerHTML = `<span>API：</span>${USER.tableBaseSetting.use_main_api ? '使用主API' : '使用备用API'}`;
    container.appendChild(previewDiv2);

    const hr = document.createElement('hr');
    container.appendChild(hr);

    // 创建选择器容器
    const selectorContainer = document.createElement('div');
    container.appendChild(selectorContainer);

    // 添加提示模板选择器
    const selectorContent = document.createElement('div');
    selectorContent.innerHTML = `
        <span class="rebuild-preview-text" style="margin-top: 10px">提示模板：</span>
        <select id="rebuild_template_selector" class="rebuild-preview-text text_pole" style="width: 100%">
            <option value="">加载中...</option>
        </select>
        <span class="rebuild-preview-text" style="margin-top: 10px">模板末尾补充提示词：</span>
        <textarea id="rebuild_additional_prompt" class="rebuild-preview-text text_pole" style="width: 100%; height: 80px;"></textarea>
    `;
    selectorContainer.appendChild(selectorContent);

    // 初始化选择器选项
    const $selector = $(selectorContent.querySelector('#rebuild_template_selector'))
    const $additionalPrompt = $(selectorContent.querySelector('#rebuild_additional_prompt'))
    $selector.empty(); // 清空加载中状态

    // 添加选项
    Object.entries(profile_prompts).forEach(([key, prompt]) => {
        let prefix = '';
        if (prompt.type === 'refresh') prefix = '**旧** ';
        if (prompt.type === 'third_party') prefix = '**第三方** ';

        $selector.append(
            $('<option></option>')
                .val(key)
                .text(prefix + (prompt.name || key))
        );
    });

    // 设置默认选中项
    // 从USER中读取上次选择的选项，如果没有则使用默认值
    $selector.val(USER.tableBaseSetting?.lastSelectedTemplate || 'rebuild_base');
    // 保存当前选择到USER中
    USER.tableBaseSetting.lastSelectedTemplate = $selector.val();
    $additionalPrompt.val('');

    const confirmation = new EDITOR.Popup(container, EDITOR.POPUP_TYPE.CONFIRM, '', {
        okButton: "继续",
        cancelButton: "取消"
    });

    await confirmation.show();
    if (confirmation.result) {
        // 获取当前选中的模板
        const selectedTemplate = $selector.val();
        const additionalPrompt = $additionalPrompt.value;
        if (!selectedTemplate) {
            EDITOR.error('请选择一个有效的提示模板');
            return;
        }
        getPromptAndRebuildTable(selectedTemplate, additionalPrompt);
    }
}





/**________________________________________以下是辅助函数_________________________________________*/
/**________________________________________以下是辅助函数_________________________________________*/
/**________________________________________以下是辅助函数_________________________________________*/



// 将Table数组序列化为字符串
function tablesToString(sheets) {
    return JSON.stringify(sheetsToTables(sheets));
}

// 将sheets转化为tables
function sheetsToTables(sheets) {
    return sheets.map((sheet, index) => ({
        tableName: sheet.name,
        tableIndex: index,
        columns: sheet.getHeader(),
        content: sheet.getContent()
    }))
}

// 将tablesData解析回Table数组
function tableDataToTables(tablesData) {
    return tablesData.map(item => {
        // 强制确保 columns 是数组，且元素为字符串
        const columns = Array.isArray(item.columns)
            ? item.columns.map(col => String(col)) // 强制转换为字符串
            : inferColumnsFromContent(item.content); // 从 content 推断
        return {
            tableName: item.tableName || '未命名表格',
            columns,
            content: item.content || [],
            insertedRows: item.insertedRows || [],
            updatedRows: item.updatedRows || []
        }
    });
}

/**
 * 标记表格变动的内容，用于render时标记颜色
 * @param {*} oldTables
 * @param {*} newTables  *
 */
function compareAndMarkChanges(oldTables, newTables) {
    console.log("标记变动：", oldTables, newTables);
    newTables.forEach((newTable, tableIndex) => {
        const oldTable = oldTables[tableIndex];
        newTable.insertedRows = [];
        newTable.updatedRows = [];

        // 标记新增行（过滤空行）
        newTable.content.filter(Boolean).forEach((_, rowIndex) => {
            if (rowIndex >= oldTable.content.filter(Boolean).length) {
                newTable.insertedRows.push(rowIndex);
            }
        });

        // 标记更新单元格（只比较有效行）
        oldTable.content.filter(Boolean).forEach((oldRow, rowIndex) => {
            const newRow = newTable.content[rowIndex];
            if (newRow) {
                oldRow.forEach((oldCell, colIndex) => {
                    if (newRow[colIndex] !== oldCell) {
                        newTable.updatedRows.push(`${rowIndex}-${colIndex}`);
                    }
                });
            }
        });
    });
}

function inferColumnsFromContent(content) {
    if (!content || content.length === 0) return [];
    const firstRow = content[0];
    return firstRow.map((_, index) => `列${index + 1}`);
}

/**
* 提取聊天记录获取功能
* 提取最近的chatStairs条聊天记录
* @param {Array} chat - 聊天记录数组
* @param {number} chatStairs - 要提取的聊天记录数量
* @param {boolean} ignoreUserSent - 是否忽略用户发送的消息
* @param {number|null} tokenLimit - 最大token限制，null表示无限制，优先级高于chatStairs
* @returns {string} 提取的聊天记录字符串
*/
async function getRecentChatHistory(chat, chatStairs, ignoreUserSent = false, tokenLimit = 0) {
    let filteredChat = chat;

    // 处理忽略用户发送消息的情况
    if (ignoreUserSent && chat.length > 0) {
        filteredChat = chat.filter(c => c.is_user === false);
    }

    // 有效记录提示
    if (filteredChat.length < chatStairs && tokenLimit === 0) {
        EDITOR.success(`当前有效记录${filteredChat.length}条，小于设置的${chatStairs}条`);
    }

    const collected = [];
    let totalTokens = 0;

    // 从最新记录开始逆序遍历
    for (let i = filteredChat.length - 1; i >= 0; i--) {
        // 格式化消息并清理标签
        const currentStr = `${filteredChat[i].name}: ${filteredChat[i].mes}`
            .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');

        // 计算Token
        const tokens = await estimateTokenCount(currentStr);

        // 如果是第一条消息且token数超过限制，直接添加该消息
        if (i === filteredChat.length - 1 && tokenLimit !== 0 && tokens > tokenLimit) {
            totalTokens = tokens;
            EDITOR.success(`最近的聊天记录Token数为${tokens}，超过设置的${tokenLimit}限制，将直接使用该聊天记录`);
            console.log(`最近的聊天记录Token数为${tokens}，超过设置的${tokenLimit}限制，将直接使用该聊天记录`);
            collected.push(currentStr);
            break;
        }

        // Token限制检查
        if (tokenLimit !== 0 && (totalTokens + tokens) > tokenLimit) {
            EDITOR.success(`本次发送的聊天记录Token数约为${totalTokens}，共计${collected.length}条`);
            console.log(`本次发送的聊天记录Token数约为${totalTokens}，共计${collected.length}条`);
            break;
        }

        // 更新计数
        totalTokens += tokens;
        collected.push(currentStr);

        // 当 tokenLimit 为 0 时，进行聊天记录数量限制检查
        if (tokenLimit === 0 && collected.length >= chatStairs) {
            break;
        }
    }

    // 按时间顺序排列并拼接
    const chatHistory = collected.reverse().join('\n');
    return chatHistory;
}


/**
 * 清洗API返回的原始内容
 * @param {string} rawContent - 原始API响应内容
 * @param {Object} [options={}] - 清洗配置选项
 * @param {boolean} [options.removeCodeBlock=true] - 是否移除JSON代码块标记
 * @param {boolean} [options.extractJson=true] - 是否提取第一个JSON数组/对象
 * @param {boolean} [options.normalizeKeys=true] - 是否统一键名格式
 * @param {boolean} [options.convertSingleQuotes=true] - 是否转换单引号为双引号
 * @param {boolean} [options.removeBlockComments=true] - 是否移除块注释
 * @returns {string} 清洗后的标准化内容
 */
function cleanApiResponse(rawContent, options = {}) {
    const {
        removeCodeBlock = true,       // 移除代码块标记
        extractJson = true,           // 提取JSON部分
        convertFullWidthPunctuation = true, // 全角标点转半角`
        normalizeKeys = true,         // 统一键名格式
        convertSingleQuotes = true,   // 单引号转双引号
        removeBlockComments = true    // 移除块注释

    } = options;

    let content = rawContent;

    // 按顺序执行清洗步骤
    if (removeCodeBlock) {
        // 移除 ```json 和 ``` 代码块标记
        content = content.replace(/```json|```/g, '');
    }

    if (extractJson) {
        // 提取第一个完整的JSON数组/对象（支持跨行匹配）
        content = content.replace(/^[^[]*(\[.*\])[^]]*$/s, '$1');
    }

    if (convertFullWidthPunctuation) {
        // 全角标点符号转为半角标点符号
        content = content.replace(/[，]/g, ',')         // 全角逗号转半角
                        .replace(/[：]/g, ':')         // 全角冒号转半角
                        .replace(/[“”]/g, '"')        // 全角引号转半角
                        .replace(/[‘’]/g, "'") ;       // 全角单引号转半角
    }

    if (normalizeKeys) {
        // 统一键名格式：将带引号或不带引号的键名标准化为带双引号
        content = content.replace(/([{,]\s*)(?:"?([a-zA-Z_]\w*)"?\s*:)/g, '$1"$2":');
    }

    if (convertSingleQuotes) {
        // 将单引号转换为双引号（JSON标准要求双引号）
        content = content.replace(/'/g, '"');
    }

    if (removeBlockComments) {
        // 移除 /* ... */ 形式的块注释
        content = content.replace(/\/\*.*?\*\//g, '');
    }

    // 去除首尾空白
    content = content.trim();
    console.log('清洗前的内容:', rawContent);
    console.log('清洗后的内容:', content);

    return content;
}

/**
 * 修复表格格式
 * @param {string} inputText - 输入的文本
 * @returns {string} 修复后的文本
 * */
function fixTableFormat(inputText) {
    const safeParse = (str) => {
        try {
            return JSON.parse(str);
        } catch (primaryError) {
            // 深度清洗：处理未闭合引号和注释
            const deepClean = str
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')  // 修复键名引号
                .replace(/\/\/.*?\n/g, '')    // 移除行注释
                .replace(/([:,])\s*([^"{[\s-]+)(\s*[}\]])/g, '$1 "$2"$3') // 补全缺失引号
                .replace(/'/g, '"')           // 单引号转双引号
                .replace(/(\w)\s*"/g, '$1"')  // 清理键名后多余空格
                .replace(/,\s*]/g, ']')       // 移除尾逗号
                .replace(/}\s*{/g, '},{');    // 修复缺失的数组分隔符

            try {
                return JSON.parse(deepClean);
            } catch (fallbackError) {
                throw new Error(`解析失败: ${fallbackError.message}`);
            }
        }
    };

    const extractTable = (text) => {
        let balance = 0;
        let startIndex = -1;
        let inString = false;
        let escapeNext = false;

        // 查找潜在数组的第一个左方括号
        let initialArrayIndex = -1;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '[') {
                initialArrayIndex = i;
                break;
            }
        }

        if (initialArrayIndex === -1) {
            console.warn("extractTable: 未找到左方括号 '['。将回退到正则表达式。");
            const regex = /\[(?:[^\[\]"]|"(?:\\.|[^"\\])*"|\{[^{}]*?\})*?\]/g;
            let match;
            const candidates = [];
            while((match = regex.exec(text)) !== null) {
                try {
                    JSON5.parse(match[0]);
                    candidates.push(match[0]);
                } catch(e) { /* 忽略无效的JSON */ }
            }
            if (candidates.length > 0) return candidates.sort((a, b) => b.length - a.length)[0];
            const simpleCandidates = text.match(/\[[^\[\]]*\]/g) || [];
            return simpleCandidates.sort((a, b) => b.length - a.length)[0] || null;
        }

        startIndex = initialArrayIndex;

        for (let i = startIndex; i < text.length; i++) {
            const char = text[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
            }

            if (inString) {
                continue;
            }

            if (char === '[') {
                balance++;
            } else if (char === ']') {
                balance--;
                if (balance === 0 && startIndex !== -1) {
                    const extracted = text.substring(startIndex, i + 1);
                    try {
                        JSON5.parse(extracted);
                        return extracted;
                    } catch (e) {
                        console.error("extractTable: 通过括号计数提取的片段不是有效的JSON。片段:", extracted, "错误:", e, "正在回退。");
                        startIndex = -1; // 使当前尝试无效
                        balance = 0; // 重置计数
                        break; // 退出循环以进行回退
                    }
                }
            }
        }
        EDITOR.clear();
        EDITOR.error("整理失败！生成的回复不完整，大概率是破限问题!");
        throw new Error("未能找到完整的有效JSON数组，流程中止！");

        // console.warn("extractTable: 括号计数未能找到完整的有效JSON数组。将回退到正则表达式。");
        // const regex = /\[(?:[^\[\]"]|"(?:\\.|[^"\\])*"|\{[^{}]*?\})*?\]/g;
        // let match;
        // const candidates = [];
        // while((match = regex.exec(text)) !== null) {
        //     try {
        //         JSON5.parse(match[0]);
        //         candidates.push(match[0]);
        //     } catch(e) { /* 忽略无效的JSON */ }
        // }
        //
        // if (candidates.length > 0) {
        //     return candidates.sort((a, b) => b.length - a.length)[0];
        // }

        // console.warn("extractTable: 改进的正则表达式也失败了。将回退到原始的简单正则表达式。");
        // const simpleCandidates = text.match(/\[[^\[\]]*\]/g) || [];
        // return simpleCandidates.sort((a, b) => b.length - a.length)[0] || null;
    };

    // 主流程
    try {
        let jsonStr = cleanApiResponse(inputText)
        console.log('cleanApiResponse预处理后:', jsonStr);
        jsonStr = extractTable(jsonStr);
        console.log('extractTable提取后:', jsonStr);
        if (!jsonStr) throw new Error("未找到有效表格数据");

        // 关键预处理：修复常见格式错误
        jsonStr = jsonStr
            .replace(/(\w)\s*"/g, '$1"')        // 键名后空格
            .replace(/:\s*([^"{\[]+)(\s*[,}])/g, ': "$1"$2')    // 值缺失引号
            .replace(/"tableIndex":\s*"(\d+)"/g, '"tableIndex": $1')    // 移除tableIndex的引号
            .replace(/"\s*\+\s*"/g, '')         // 拼接字符串残留
            .replace(/\\n/g, '')                // 移除换行转义
            .replace(/({|,)\s*([a-zA-Z_]+)\s*:/g, '$1"$2":')    // 键名标准化
            .replace(/"(\d+)":/g, '$1:')  // 修复数字键格式

        console.log('关键预处理修复常见格式错误后:', jsonStr);

        // 强约束解析
        let tables = safeParse(jsonStr);
        console.log('safeParse强约束解析后:', tables);

        if (tables.length < 6) throw new Error("提取的表格数量不足");
        tables = tables.map(table => ({  // 新增：类型转换
            ...table,
            tableIndex: parseInt(table.tableIndex) || 0
        }));


        // 列对齐修正
        return tables.map((table, index) => {
            if (!table || typeof table !== 'object') {
                console.error(`处理索引 ${index} 处的表格时出错：表格数据无效（null、undefined 或不是对象）。接收到：`, table);
                return { tableName: `无效表格 (索引 ${index})`, columns: [], content: [] }; // 返回默认的空表格结构
            }

            let columnCount = 0;
            if (table.columns) {
                if (Array.isArray(table.columns)) {
                    columnCount = table.columns.length;
                } else {
                    console.error(`表格 "${table.tableName || `(原始索引 ${index})`}" 在映射索引 ${index} 处的表格结构错误：'columns' 属性不是数组。找到：`, table.columns);
                }
            } else {
                console.error(`表格 "${table.tableName || `(原始索引 ${index})`}" 在映射索引 ${index} 处的表格结构错误：未找到 'columns' 属性。找到：`, table);
            }

            if (Array.isArray(table.content)) {
                table.content = table.content.map(row => {
                    if (row === null || row === undefined) {
                        return Array(columnCount).fill("");
                    }
                    return Array.from({ length: columnCount }, (_, i) => row[i]?.toString().trim() || "");
                });
            } else {
                console.error(`表格 "${table.tableName || `(原始索引 ${index})`}" 在映射索引 ${index} 处的表格结构错误：'content' 属性不是数组。找到：`, table.content);
                table.content = []; // 如果 'content' 不是数组或缺失，则默认为空
            }
            return table;
        });
    } catch (error) {
        console.error("修复失败:", error);
        throw new Error('无法解析表格数据');
        // 原暴力提取逻辑已禁用
        // const rawTables = inputText.match(/{[^}]*?"tableIndex":\s*\d+[^}]*}/g) || [];
        // const sixTables = rawTables.slice(0, 6).map(t => JSON.parse(t.replace(/'/g, '"')));
        // return sixTables
    }
}
