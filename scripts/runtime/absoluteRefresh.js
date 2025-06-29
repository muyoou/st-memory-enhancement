// absoluteRefresh.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { findTableStructureByIndex, convertOldTablesToNewSheets, executeTableEditActions, getTableEditTag } from "../../index.js";
import { insertRow, updateRow, deleteRow } from "../../core/table/oldTableActions.js";
import JSON5 from '../../utils/json5.min.mjs'
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { TableTwoStepSummary } from "./separateTableUpdate.js";
import { estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest } from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { refreshContextView } from "../editor/chatSheetsDataView.js";
import { Form } from '../../components/formManager.js';
import {refreshRebuildTemplate} from "../settings/userExtensionSetting.js"

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
export async function getPromptAndRebuildTable(templateName = '', additionalPrompt ,force, isSilentUpdate = USER.tableBaseSetting.bool_silent_refresh, chatToBeUsed = '') {
    let r='';
    try {
        // 根据提示模板类型选择不同的表格处理函数
        // const force = $('#bool_force_refresh').prop('checked');
        r = await rebuildTableActions(force || true, isSilentUpdate, chatToBeUsed);
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
export async function rebuildTableActions(force = false, silentUpdate = USER.tableBaseSetting.bool_silent_refresh, chatToBeUsed = '') {
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
        let originText = tablesToString(latestTables);

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
        const select = USER.tableBaseSetting.lastSelectedTemplate ?? "rebuild_base"
        const template = select === "rebuild_base"? {
            name: "rebuild_base",
            system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
            user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
        } : USER.tableBaseSetting.rebuild_message_template_list[select]
        if(!template) {
            console.error('未找到对应的提示模板，请检查配置',select, template);
            EDITOR.error('未找到对应的提示模板，请检查配置');
            return;
        }
        let systemPrompt = template.system_prompt
        let userPrompt = template.user_prompt_begin;

        let parsedSystemPrompt

        try {
            parsedSystemPrompt = JSON5.parse(systemPrompt)
            console.log('解析后的 systemPrompt:', parsedSystemPrompt);
        } catch (error) {
            console.log("未解析成功", error)
            parsedSystemPrompt = systemPrompt
        }

        const replacePrompt = (input)=>{
            let output = input
            output = output.replace(/\$0/g, originText);
            output = output.replace(/\$1/g, lastChats);
            output = output.replace(/\$2/g, tableHeadersJson);
            output = output.replace(/\$3/g, DERIVED.any.additionalPrompt ?? '');
            return output
        }

        if(typeof parsedSystemPrompt === 'string') {
            // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
            parsedSystemPrompt = replacePrompt(parsedSystemPrompt);
        }else{
            parsedSystemPrompt = parsedSystemPrompt.map(mes => ({...mes, content: replacePrompt(mes.content)}))
        }

        
        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats，将$2替换成空表头
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);
        userPrompt = userPrompt.replace(/\$2/g, tableHeadersJson);
        userPrompt = userPrompt.replace(/\$3/g, DERIVED.any.additionalPrompt ?? '');

        console.log('systemPrompt:', parsedSystemPrompt);
        // console.log('userPrompt:', userPrompt);

        

        // 生成响应内容
        let rawContent;
        if (isUseMainAPI) {
            try {
                rawContent = await handleMainAPIRequest(parsedSystemPrompt, userPrompt);
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消');
                    return
                }
            } catch (error) {
                EDITOR.clear();
                EDITOR.error('主API请求错误: ' + error.message);
                console.error('主API请求错误:', error);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(parsedSystemPrompt, userPrompt);
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
        if (typeof rawContent !== 'string') {
            EDITOR.clear();
            EDITOR.error('API响应内容无效，无法继续处理表格。');
            console.error('API响应内容无效，rawContent:', rawContent);
            return;
        }

        if (!rawContent.trim()) {
            EDITOR.clear();
            EDITOR.error('API响应内容为空，无法继续处理表格。');
            console.error('API响应内容为空，rawContent:', rawContent);
            return;
        }

        const temp = USER.tableBaseSetting.rebuild_message_template_list[USER.tableBaseSetting.lastSelectedTemplate];
        if(temp && temp.parseType === 'text'){
            const previewHtml = `
                <div>
                    <div style="margin-bottom: 10px; display: flex; align-items: center;">
                        <span style="margin-right: 10px;">返回的总结结果，请复制后使用</span>
                    </div>
                    <textarea id="rebuild_text_preview" rows="10" style="width: 100%">${rawContent}</textarea>
                </div>`;
            
            const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, '', { wide: true });
            await popup.show()
            return
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
                const {piece} = USER.getChatPiece()
                if (piece) {
                    convertOldTablesToNewSheets(clonedTables, piece)
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
        EDITOR.success('表格总结完成');
    } catch (error) {
        console.error('总结过程出错:', error);
        EDITOR.error(`总结失败：${error.message}`);
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
    previewDiv1.innerHTML = `<span>执行完毕后确认？：</span>${USER.tableBaseSetting.bool_silent_refresh ? '否' : '是'}`;
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
        <span class="rebuild-preview-text" style="margin-top: 10px">模板信息：</span>
        <div id="rebuild_template_info" class="rebuild-preview-text" style="margin-top: 10px"></div>
        <span class="rebuild-preview-text" style="margin-top: 10px">其他要求：</span>
        <textarea id="rebuild_additional_prompt" class="rebuild-preview-text text_pole" style="width: 100%; height: 80px;"></textarea>
    `;
    selectorContainer.appendChild(selectorContent);

    // 初始化选择器选项
    const $selector = $(selectorContent.querySelector('#rebuild_template_selector'))
    const $templateInfo = $(selectorContent.querySelector('#rebuild_template_info'))
    const $additionalPrompt = $(selectorContent.querySelector('#rebuild_additional_prompt'))
    $selector.empty(); // 清空加载中状态

    const temps = USER.tableBaseSetting.rebuild_message_template_list
    // 添加选项
    Object.entries(temps).forEach(([key, prompt]) => {

        $selector.append(
            $('<option></option>')
                .val(key)
                .text(prompt.name || key)
        );
    });

    // 设置默认选中项
    // 从USER中读取上次选择的选项，如果没有则使用默认值
    const defaultTemplate = USER.tableBaseSetting?.lastSelectedTemplate || 'rebuild_base';
    $selector.val(defaultTemplate);
    // 更新模板信息显示
    if(defaultTemplate === 'rebuild_base') {
        $templateInfo.text("默认模板，适用于Gemini，Grok，DeepSeek，使用聊天记录和表格信息重建表格，应用于初次填表、表格优化等场景。破限来源于TT老师。");
    }else{
        const templateInfo = temps[defaultTemplate]?.info || '无模板信息';
        $templateInfo.text(templateInfo);
    }
    

    // 监听选择器变化
    $selector.on('change', function () {
        const selectedTemplate = $(this).val();
        const template = temps[selectedTemplate];
        $templateInfo.text(template.info || '无模板信息');
    })

    
    
    const confirmation = new EDITOR.Popup(container, EDITOR.POPUP_TYPE.CONFIRM, '', {
        okButton: "继续",
        cancelButton: "取消"
    });

    await confirmation.show();
    if (confirmation.result) {
        const selectedTemplate = $selector.val();
        const additionalPrompt = $additionalPrompt.val();
        USER.tableBaseSetting.lastSelectedTemplate = selectedTemplate; // 保存用户选择的模板
        DERIVED.any.additionalPrompt = additionalPrompt; // 保存附加提示内容
        getPromptAndRebuildTable();
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
export function sheetsToTables(sheets) { // Ensure this is exported
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

// 测试清理效果
window.testFuncClean = function(strTest) {
    strTest = ``
    cleanApiResponse(strTest)
};

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
        normalizeKeys = true,         // 统一键名格式
        convertSingleQuotes = true,   // 单引号转双引号
        normalizeTableStructure = true, // 标准化表格结构，处理tablename到columns部分，中文引号改为英文引号
        normalizeAndValidateColumnsContentPairs = true, // 标准化表格结构，处理content部分，中文引号改为英文引号，然后检查列数和行数是否匹配以及格式问题，否则回退到原始内容
        removeBlockComments = true    // 移除块注释
    } = options;

    let content = rawContent;

    // 按顺序执行清洗步骤
    if (removeCodeBlock) {
        // 移除 ```json 和 ``` 代码块标记
        content = content.replace(/```json|```/g, '');
        console.log("removeCodeBlock", content)
    }
    if (extractJson) {
        // 提取第一个完整的JSON数组/对象（支持跨行匹配）
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']');
        if (start === -1 || end === -1 || end <= start) {
            console.error('未找到合法的 JSON 数组结构');
            return null;
        }
        content = content.slice(start, end + 1);
    }
    if (normalizeKeys) {
        // 统一键名格式：将带引号或不带引号的键名标准化为带双引号
        content = content.replace(/([{,]\s*)(?:"?([a-zA-Z_]\w*)"?\s*:)/g, '$1"$2":');
        console.log("normalizeKeys", content)
    }
    if (convertSingleQuotes) {
        // 将单引号转换为双引号（JSON标准要求双引号）
        content = content.replace(/'/g, '"');
        console.log("convertSingleQuotes", content)
    }
    if (normalizeTableStructure) {
        // 标准化表格结构，处理tablename到columns部分，中文引号改为英文引号
        const regex = /([\"“”])tableName\1\s*:\s*([\"“”])(.+?)\2\s*,\s*([\"“”])tableIndex\4\s*:\s*(\d+)\s*,\s*([\"“”])columns(?:[\"“”]?)/g;
        content =  content.replace(regex, (match, g1QuoteKeyTable, g2QuoteValueTable, g3TableName, g4QuoteKeyIndex, g5TableIndex, g6QuoteKeyColumns) => {
            return `"tableName":"${g3TableName}","tableIndex":${g5TableIndex},"columns"`;
        });
        console.log("normalizeTableStructure", content)
    }
    function replaceQuotesInContext(text) {
        if (typeof text !== 'string') return text;
        return text.replace(/[“”]/g, (match, offset, fullString) => {
            const charBefore = offset > 0 ? fullString[offset - 1] : null;
            const charAfter = offset + match.length < fullString.length ? fullString[offset + match.length] : null;
            const contextChars = ['[', ']', ','];

            if ((charBefore && contextChars.includes(charBefore)) || (charAfter && contextChars.includes(charAfter))) {
                return '"';
            }
            return match;
        });
    }

    if (normalizeAndValidateColumnsContentPairs) {
        // 标准化表格结构，处理content部分，中文引号改为英文引号，然后检查列数和行数是否匹配以及格式问题，否则回退到原始内容
        const regex = /([\"“”])columns\1\s*:\s*(\[.*?\])\s*,\s*([\"“”])content\3\s*:\s*(\[(?:\[.*?\](?:,\s*\[.*?\])*)?\])/g;
        content = content.replace(regex, (match, _quoteKeyColumns, columnsArrayStr, _quoteKeyContent, contentArrayStr) => {
            let normalizedColumnsArrayStr = replaceQuotesInContext(columnsArrayStr);
            let normalizedContentArrayStr = replaceQuotesInContext(contentArrayStr);

            let columns;
            try {
              columns = JSON.parse(normalizedColumnsArrayStr);
              if (!Array.isArray(columns) || !columns.every(col => typeof col === 'string')) {
                console.warn("警告: 'columns' 部分解析后不是一个有效的字符串数组。原始片段:", columnsArrayStr, "处理后尝试解析:", normalizedColumnsArrayStr, "解析结果:", columns);
                return match;
              }
            } catch (e) {
              console.warn("警告: 解析 'columns' 数组失败。错误:", e, "原始片段:", columnsArrayStr, "处理后尝试解析:", normalizedColumnsArrayStr);
              return match;
            }

            let contentRows;
            try {
              contentRows = JSON.parse(normalizedContentArrayStr);
              if (!Array.isArray(contentRows)) {
                console.warn("警告: 'content' 部分解析后不是一个有效的数组。原始片段:", contentArrayStr, "处理后尝试解析:", normalizedContentArrayStr, "解析结果:", contentRows);
                return match;
              }
            } catch (e) {
              console.warn("警告: 解析 'content' 数组失败。错误:", e, "原始片段:", contentArrayStr, "处理后尝试解析:", normalizedContentArrayStr);
              return match;
            }

            const numColumns = columns.length;
            const validatedContentRows = [];
            let allRowsValid = true;

            for (const row of contentRows) {
              if (!Array.isArray(row) || row.length !== numColumns) {
                console.warn(`警告: 内容行与列数 (${numColumns}) 不匹配或行本身不是数组。行数据:`, row);
                allRowsValid = false;
                break;
              }
              if (!row.every(cell => typeof cell === 'string')) {
                console.warn("警告: 内容行中并非所有单元格都是字符串。行数据:", row);
                allRowsValid = false;
                break;
              }
              validatedContentRows.push(row);
            }

            if (!allRowsValid) {
              console.warn("警告: 'content' 数组的某些行未通过验证，该 'columns'-'content' 片段将不会被修改。");
              return match;
            }

            const finalColumnsStr = JSON.stringify(columns);
            const finalContentStr = JSON.stringify(validatedContentRows);

            return `"columns":${finalColumnsStr},"content":${finalContentStr}`;
          });
          console.log("normalizeAndValidateColumnsContentPairs", content)
    }
    if (removeBlockComments) {
        // 移除 /* ... */ 形式的块注释
        content = content.replace(/\/\*.*?\*\//g, '');
        console.log("removeBlockComments", content)
    }
    // 通过括号配平来确定JSON的结束位置
    const openChar = content[0];
    const closeChar = (openChar === '[') ? ']' : '}';
    let balance = 0;
    let lastCharIndex = -1;

    for (let i = 0; i < content.length; i++) {
        if (content[i] === openChar) {
            balance++;
        } else if (content[i] === closeChar) {
            balance--;
        }
        if (balance === 0) {
            lastCharIndex = i;
            content = content.substring(0, lastCharIndex + 1);
            break;
        }
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
        EDITOR.error("API返回了一个错误信息!");
        EDITOR.error(inputText.length > 300 ? inputText.slice(0, 300) + '...' : inputText);
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

/**
 * 修改重整理模板
 */
export async function modifyRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    const sheetConfig= {
        formTitle: "编辑表格总结模板",
        formDescription: "设置总结时的提示词结构，$0为当前表格数据，$1为上下文聊天记录，$2为表格模板[表头]数据，$3为用户输入的附加提示",
        fields: [
            { label: '模板名字：', type: 'label', text: selectedTemplate },
            { label: '系统提示词', type: 'textarea', rows: 6, dataKey: 'system_prompt', description: '(填写破限，或者直接填写提示词整体json结构，填写结构的话，整理规则将被架空)' },
            { label: '总结规则', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin', description: '(用于给AI说明怎么重新整理）' },
        ],
    }
    let initialData = null
    if(selectedTemplate === 'rebuild_base') 
        return EDITOR.warning('默认模板不能修改，请新建模板');
    else 
        initialData = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate]
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "保存", allowVerticalScrolling: true, cancelButton: "取消" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        USER.tableBaseSetting.rebuild_message_template_list = {
            ...USER.tableBaseSetting.rebuild_message_template_list,
            [selectedTemplate]: {
                ...result,
                name: selectedTemplate,
            }
        }
        EDITOR.success(`修改模板 "${selectedTemplate}" 成功`);
    }
}
/*         

/**
 * 新建重整理模板
 */
export async function newRebuildTemplate() {
    const sheetConfig= {
        formTitle: "新建表格总结模板",
        formDescription: "设置表格总结时的提示词结构，$0为当前表格数据，$1为上下文聊天记录，$2为表格模板[表头]数据，$3为用户输入的附加提示",
        fields: [
            { label: '模板名字', type: 'text', dataKey: 'name' },
            { label: '系统提示词', type: 'textarea', rows: 6, dataKey: 'system_prompt', description: '(填写破限，或者直接填写提示词整体json结构，填写结构的话，整理规则将被架空)' },
            { label: '整理规则', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin', description: '(用于给AI说明怎么重新整理）' },
        ],
    }
    const initialData = {
        name: "新表格总结模板",
        system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
        user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
    };
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "保存", allowVerticalScrolling: true, cancelButton: "取消" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        const name  = createUniqueName(result.name)
        result.name = name;
        USER.tableBaseSetting.rebuild_message_template_list={
            ...USER.tableBaseSetting.rebuild_message_template_list,
            [name]: result
        }
        USER.tableBaseSetting.lastSelectedTemplate = name;
        refreshRebuildTemplate()
        EDITOR.success(`新建模板 "${name}" 成功`);
    }
}

/**
 * 创建不重复的名称
 * @param {string} baseName - 基础名称
 */
function createUniqueName(baseName) {
    let name = baseName;
    let counter = 1;
    while (USER.tableBaseSetting.rebuild_message_template_list[name]) {
        name = `${baseName} (${counter})`;
        counter++;
    }
    return name;
}

/**
 * 删除重整理模板
 */
export async function deleteRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') {
        return EDITOR.warning('默认模板不能删除');
    }
    const confirmation = await EDITOR.callGenericPopup('是否删除此模板？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        const newTemplates = {};
        Object.values(USER.tableBaseSetting.rebuild_message_template_list).forEach((template) => {
            if (template.name !== selectedTemplate) {
                newTemplates[template.name] = template;
            }
        });
        USER.tableBaseSetting.rebuild_message_template_list = newTemplates;
        USER.tableBaseSetting.lastSelectedTemplate = 'rebuild_base';
        refreshRebuildTemplate();
        EDITOR.success(`删除模板 "${selectedTemplate}" 成功`);
    }
}

/**
 * 导出重整理模板
 */
export async function exportRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') {
        return EDITOR.warning('默认模板不能导出');
    }
    const template = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
    if (!template) {
        return EDITOR.error(`未找到模板 "${selectedTemplate}"`);
    }
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    EDITOR.success(`导出模板 "${selectedTemplate}" 成功`);
}

/**
 * 导入重整理模板
 */
export async function importRebuildTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            EDITOR.error('未选择文件');
            return;
        }
        try {
            const text = await file.text();
            const template = JSON.parse(text);
            if (!template.name || !template.system_prompt || !template.user_prompt_begin) {
                throw new Error('无效的模板格式');
            }
            const name = createUniqueName(template.name);
            template.name = name;
            USER.tableBaseSetting.rebuild_message_template_list = {
                ...USER.tableBaseSetting.rebuild_message_template_list,
                [name]: template
            };
            USER.tableBaseSetting.lastSelectedTemplate = name;
            refreshRebuildTemplate();
            EDITOR.success(`导入模板 "${name}" 成功`);
        } catch (error) {
            EDITOR.error(`导入失败：${error.message}`);
        } finally {
            document.body.removeChild(input);
        }
    });

    input.click();
}

/**
 * 手动触发一次分步填表
 */
export async function triggerStepByStepNow() {
    console.log('[Memory Enhancement] Manually triggering step-by-step update...');
    TableTwoStepSummary("manual")
}

/**
 * 执行增量更新（可用于普通刷新和分步总结）
 * @param {string} chatToBeUsed - 要使用的聊天记录, 为空则使用最近的聊天记录
 * @param {string} originTableText - 当前表格的文本表示
 * @param {Array} referencePiece - 参考用的piece
 * @param {boolean} useMainAPI - 是否使用主API
 * @param {boolean} silentUpdate - 是否静默更新,不显示操作确认
 * @param {boolean} [isSilentMode=false] - 是否以静默模式运行API调用（不显示加载提示）
 * @returns {Promise<string>} 'success', 'suspended', 'error', or empty
 */
export async function executeIncrementalUpdateFromSummary(
    chatToBeUsed = '',
    originTableText,
    finalPrompt,
    referencePiece,
    useMainAPI,
    silentUpdate = USER.tableBaseSetting.bool_silent_refresh,
    isSilentMode = false
) {
    if (!SYSTEM.lazy('executeIncrementalUpdate', 1000)) return '';

    try {
        DERIVED.any.waitingPiece = referencePiece;
        const lastChats = chatToBeUsed;

        let systemPromptForApi;
        let userPromptForApi;

        console.log("[Memory Enhancement] Step-by-step summary: Parsing and using multi-message template string.");
        const stepByStepPromptString = USER.tableBaseSetting.step_by_step_user_prompt;
        let promptMessages;

        try {
            promptMessages = JSON5.parse(stepByStepPromptString);
            if (!Array.isArray(promptMessages) || promptMessages.length === 0) {
                throw new Error("Parsed prompt is not a valid non-empty array.");
            }
        } catch (e) {
            console.error("Error parsing step_by_step_user_prompt string:", e, "Raw string:", stepByStepPromptString);
            EDITOR.error("独立填表提示词格式错误，无法解析。请检查插件设置。");
            return 'error';
        }

        const replacePlaceholders = (text) => {
            if (typeof text !== 'string') return '';
            text = text.replace(/(?<!\\)\$0/g, () => originTableText);
            text = text.replace(/(?<!\\)\$1/g, () => lastChats);
            text = text.replace(/(?<!\\)\$3/g, () => finalPrompt);
            return text;
        };

        // 完整处理消息数组，替换每个消息中的占位符
        const processedMessages = promptMessages.map(msg => ({
            ...msg,
            content: replacePlaceholders(msg.content)
        }));

        // 将处理后的完整消息数组传递给API请求处理函数
        systemPromptForApi = processedMessages;
        userPromptForApi = null; // 在这种情况下，userPromptForApi 不再需要

        console.log("Step-by-step: Prompts constructed from parsed multi-message template and sent as an array.");

        // 打印将要发送到API的最终数据
        if (Array.isArray(systemPromptForApi)) {
            console.log('API-bound data (as message array):', systemPromptForApi);
            const totalContent = systemPromptForApi.map(m => m.content).join('');
            console.log('Estimated token count:', estimateTokenCount(totalContent));
        } else {
            console.log('System Prompt for API:', systemPromptForApi);
            console.log('User Prompt for API:', userPromptForApi);
            console.log('Estimated token count:', estimateTokenCount(systemPromptForApi + (userPromptForApi || '')));
        }
        
        let rawContent;
        if (useMainAPI) { // Using Main API
            try {
                // If it's step-by-step summary, systemPromptForApi is already the message array
                // Pass the array as the first arg and null/empty as the second for multi-message format
                // Otherwise, pass the separate system and user prompts for normal refresh
                rawContent = await handleMainAPIRequest(
                    systemPromptForApi,
                    null,
                    isSilentMode
                );
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消 (主API)');
                    return 'suspended';
                }
            } catch (error) {
                console.error('主API请求错误:', error);
                EDITOR.error('主API请求错误: ' + error.message,error);
                return 'error';
            }
        } else { // Using Custom API
            try {
                rawContent = await handleCustomAPIRequest(systemPromptForApi, userPromptForApi, true, isSilentMode);
                if (rawContent === 'suspended') {
                    EDITOR.info('操作已取消 (自定义API)');
                    return 'suspended';
                }
            } catch (error) {
                EDITOR.error('自定义API请求错误: ' + error.message);
                return 'error';
            }
        }

        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            EDITOR.error('API响应内容无效或为空。');
            return 'error';
        }
        
        let processedRawContent = rawContent.replace(/^```(?:xml|json|javascript|html)?\s*\n?/im, '').replace(/\n?```$/m, '');
        
        let operationsString = '';
        const openTag = '<tableEdit>';
        const closeTag = '</tableEdit>';
        const startIndex = processedRawContent.indexOf(openTag);

        if (startIndex !== -1) {
            let endIndex = processedRawContent.indexOf(closeTag, startIndex + openTag.length);
            if (endIndex === -1) {
                 EDITOR.error("API响应被截断：表格操作指令不完整，缺少</tableEdit>结束标签。");
                 return 'error';
            }
            const contentBetweenTags = processedRawContent.substring(startIndex + openTag.length, endIndex);
            const singleCommentMatch = contentBetweenTags.match(/^\s*<!--([\s\S]*?)-->\s*$/);
            if (singleCommentMatch && singleCommentMatch[1] && singleCommentMatch[1].trim() !== '') {
                operationsString = singleCommentMatch[1].trim();
            } else {
                operationsString = contentBetweenTags.replace(/<!--[\s\S]*?-->/g, '').trim();
            }
        } else {
            EDITOR.error("API响应格式错误：未找到<tableEdit>标签。");
            return 'error';
        }

        if (operationsString === '') {
             EDITOR.info("AI在<tableEdit>标签内未提供任何操作指令，表格内容未发生变化。");
             return 'success';
        }

        try{
            executeTableEditActions([operationsString], referencePiece)
        }catch(e){
            EDITOR.error("执行表格操作指令时出错: " , e.message, e);
            console.error("错误原文: ", operationsString);
        }
        USER.saveChat()
        refreshContextView();
        updateSystemMessageTableStatus();
        EDITOR.success('独立填表完成！');
        return 'success';

    } catch (error) {
        console.error('执行增量更新时出错:', error);
        EDITOR.error(`执行增量更新失败：${error.message}`);
        console.log('[Memory Enhancement Plugin] Error context:', {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
        });
        return 'error';
    }
}
