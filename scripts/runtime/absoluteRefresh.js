// absoluteRefresh.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import {  convertOldTablesToNewSheets, executeTableEditActions, getTableEditTag } from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { TableTwoStepSummary } from "./separateTableUpdate.js";
import { estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest } from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { Form } from '../../components/formManager.js';
import { refreshRebuildTemplate } from "../settings/userExtensionSetting.js"
import { safeParse } from '../../utils/stringUtil.js';

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
export async function getPromptAndRebuildTable(templateName = '', additionalPrompt, force, isSilentUpdate = USER.tableBaseSetting.bool_silent_refresh, chatToBeUsed = '') {
    let r = '';
    try {
        r = await rebuildTableActions(force || true, isSilentUpdate, chatToBeUsed);
        return r;
    } catch (error) {
        console.error('总结失败:', error);
        EDITOR.error(`总结失败: ${error.message}`);
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
    // #region 表格总结执行
    let r = '';
    if (!SYSTEM.lazy('rebuildTableActions', 1000)) return;

    console.log('开始重新生成完整表格');
    const isUseMainAPI = $('#use_main_api').prop('checked');
    try {
        const { piece } = BASE.getLastSheetsPiece();
        if (!piece) {
            throw new Error('findLastestTableData 未返回有效的表格数据');
        }
        const latestTables = BASE.hashSheetsToSheets(piece.hash_sheets).filter(sheet => sheet.enable);
        DERIVED.any.waitingTable = latestTables;
        DERIVED.any.waitingTableIdMap = latestTables.map(table => table.uid);

        const tableJson = latestTables.map((table, index) => ({...table.getReadableJson(), tableIndex: index}));
        const tableJsonText = JSON.stringify(tableJson);

        // 提取表头信息
        const tableHeaders = latestTables.map(table => {
            return {
                tableId: table.uid,
                headers: table.getHeader()
            };
        });
        const tableHeadersText = JSON.stringify(tableHeaders);

        console.log('表头数据 (JSON):', tableHeadersText);
        console.log('重整理 - 最新的表格数据:', tableJsonText);

        // 获取最近clear_up_stairs条聊天记录
        const chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat,
            USER.tableBaseSetting.clear_up_stairs,
            USER.tableBaseSetting.ignore_user_sent,
            USER.tableBaseSetting.rebuild_token_limit_value
        ) : chatToBeUsed;

        // 构建AI提示
        const select = USER.tableBaseSetting.lastSelectedTemplate ?? "rebuild_base"
        const template = select === "rebuild_base" ? {
            name: "rebuild_base",
            system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
            user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
        } : USER.tableBaseSetting.rebuild_message_template_list[select]
        if (!template) {
            console.error('未找到对应的提示模板，请检查配置', select, template);
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

        const replacePrompt = (input) => {
            let output = input
            output = output.replace(/\$0/g, tableJsonText);
            output = output.replace(/\$1/g, lastChats);
            output = output.replace(/\$2/g, tableHeadersText);
            output = output.replace(/\$3/g, DERIVED.any.additionalPrompt ?? '');
            return output
        }

        if (typeof parsedSystemPrompt === 'string') {
            // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
            parsedSystemPrompt = replacePrompt(parsedSystemPrompt);
        } else {
            parsedSystemPrompt = parsedSystemPrompt.map(mes => ({ ...mes, content: replacePrompt(mes.content) }))
        }


        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats，将$2替换成空表头
        userPrompt = userPrompt.replace(/\$0/g, tableJsonText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);
        userPrompt = userPrompt.replace(/\$2/g, tableHeadersText);
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
                EDITOR.error('主API请求错误: ' , error.message, error);
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
                EDITOR.error('自定义API请求错误: ' , error.message, error);
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
            EDITOR.error('API响应内容为空，空回复一般是破限问题');
            console.error('API响应内容为空，rawContent:', rawContent);
            return;
        }

        const temp = USER.tableBaseSetting.rebuild_message_template_list[USER.tableBaseSetting.lastSelectedTemplate];
        if (temp && temp.parseType === 'text') {
            showTextPreview(rawContent);
        }

        console.log('响应内容如下：', rawContent);
        let cleanContentTable = null;
        try{
            const parsed = safeParse(rawContent);
            cleanContentTable = Array.isArray(parsed) ? parsed[parsed.length - 1] : parsed;
        }catch (error) {
            console.error('解析响应内容失败:', error);
            EDITOR.clear();
            EDITOR.error('解析响应内容失败，请检查API返回的内容是否符合预期格式。', error.message, error);
            showErrorTextPreview(rawContent);
            return;
        }
        
        console.log('cleanContent:', cleanContentTable);

        //将表格保存回去
        if (cleanContentTable) {
            try {
                // 验证数据格式
                if (!Array.isArray(cleanContentTable)) {
                    throw new Error("生成的新表格数据不是数组");
                }

                // 如果不是静默更新，显示操作确认
                if (!silentUpdate) {
                    // 将uniqueActions内容推送给用户确认是否继续
                    const confirmContent = confirmTheOperationPerformed(cleanContentTable);
                    const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
                    EDITOR.clear();
                    await tableRefreshPopup.show();
                    if (!tableRefreshPopup.result) {
                        EDITOR.info('操作已取消');
                        return;
                    }
                }

                // 更新聊天记录
                const { piece } = USER.getChatPiece()
                if (piece) {
                    for (const index in cleanContentTable) {
                        let sheet;
                        const table = cleanContentTable[index];
                        if (table.tableUid){
                            sheet = BASE.getChatSheet(table.tableUid)
                        }else if(table.tableIndex !== undefined) {
                            const uid = DERIVED.any.waitingTableIdMap[table.tableIndex]
                            sheet = BASE.getChatSheet(uid)
                        }else{
                            const uid = DERIVED.any.waitingTableIdMap[index]
                            sheet = BASE.getChatSheet(uid)
                        }
                        if(!sheet) {
                            console.error(`无法找到表格 ${table.tableName} 对应的sheet`);
                            continue;
                        }
                        const valueSheet = [table.columns, ...table.content].map(row => ['', ...row])
                        sheet.rebuildHashSheetByValueSheet(valueSheet);
                        sheet.save(piece, true)
                    }
                    await USER.getContext().saveChat(); // 等待保存完成
                } else {
                    throw new Error("聊天记录为空，请至少有一条聊天记录后再总结");
                }

                BASE.refreshContextView();
                updateSystemMessageTableStatus();
                EDITOR.success('生成表格成功！');
            } catch (error) {
                console.error('保存表格时出错:', error);
                EDITOR.error(`生成表格失败`, error.message, error);
            }
        } else {
            EDITOR.error("生成表格保存失败：内容为空");
            true
        }

    } catch (e) {
        console.error('Error in rebuildTableActions:', e);
        return;
    } finally {

    }
    // #endregion
}

async function showTextPreview(text) {
    const previewHtml = `
        <div>
            <span style="margin-right: 10px;">返回的总结结果，请复制后使用</span>
        </div>
        <textarea rows="10" style="width: 100%">${text}</textarea>
    `;

    const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, '', { wide: true });
    await popup.show();
}

async function showErrorTextPreview(text) {
    const previewHtml = `
        <div>
            <span style="margin-right: 10px;">这是AI返回的信息，无法被脚本解析而停止</span>
        </div>
        <textarea rows="10" style="width: 100%">${text}</textarea>
    `;

    const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, '', { wide: true });
    await popup.show();
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
    if (defaultTemplate === 'rebuild_base') {
        $templateInfo.text("默认模板，适用于Gemini，Grok，DeepSeek，使用聊天记录和表格信息重建表格，应用于初次填表、表格优化等场景。破限来源于TT老师。");
    } else {
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
 * 修复表格格式
 * @param {string} inputText - 输入的文本
 * @returns {string} 修复后的文本
 * */
function fixTableFormat(inputText) {
    try {
        return safeParse(inputText);
    } catch (error) {
        console.error("修复失败:", error);
        const popup = new EDITOR.Popup(`脚本无法解析返回的数据，可能是破限力度问题，也可能是输出掉格式。这里是返回的数据：<div>${inputText}</div>`, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "确定" });
        popup.show();
        throw new Error('无法解析表格数据');
    }
}

window.fixTableFormat = fixTableFormat; // 暴露给全局

/**
 * 修改重整理模板
 */
export async function modifyRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    const sheetConfig = {
        formTitle: "编辑表格总结模板",
        formDescription: "设置总结时的提示词结构，$0为当前表格数据，$1为上下文聊天记录，$2为表格模板[表头]数据，$3为用户输入的附加提示",
        fields: [
            { label: '模板名字：', type: 'label', text: selectedTemplate },
            { label: '系统提示词', type: 'textarea', rows: 6, dataKey: 'system_prompt', description: '(填写破限，或者直接填写提示词整体json结构，填写结构的话，整理规则将被架空)' },
            { label: '总结规则', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin', description: '(用于给AI说明怎么重新整理）' },
        ],
    }
    let initialData = null
    if (selectedTemplate === 'rebuild_base')
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
    const sheetConfig = {
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
        const name = createUniqueName(result.name)
        result.name = name;
        USER.tableBaseSetting.rebuild_message_template_list = {
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
            EDITOR.error(`导入失败`, error.message, error);
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
        const separateReadContextLayers = Number($('#separateReadContextLayers').val());
        const contextChats = await getRecentChatHistory(USER.getContext().chat, separateReadContextLayers, true);
        const summaryChats = chatToBeUsed;

        // 获取角色世界书内容
        let lorebookContent = '';
        if (USER.tableBaseSetting.separateReadLorebook && window.TavernHelper) {
            try {
                const charLorebooks = await window.TavernHelper.getCharLorebooks({ type: 'all' });
                const bookNames = [];
                if (charLorebooks.primary) {
                    bookNames.push(charLorebooks.primary);
                }
                if (charLorebooks.additional && charLorebooks.additional.length > 0) {
                    bookNames.push(...charLorebooks.additional);
                }

                for (const bookName of bookNames) {
                    if (bookName) {
                        const entries = await window.TavernHelper.getLorebookEntries(bookName);
                        if (entries && entries.length > 0) {
                            lorebookContent += entries.map(entry => entry.content).join('\n');
                        }
                    }
                }
            } catch (e) {
                console.error('[Memory Enhancement] Error fetching lorebook content:', e);
            }
        }

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
            EDITOR.error("独立填表提示词格式错误，无法解析。请检查插件设置。", e.message, e);
            return 'error';
        }

        const replacePlaceholders = (text) => {
            if (typeof text !== 'string') return '';
            text = text.replace(/(?<!\\)\$0/g, () => originTableText);
            text = text.replace(/(?<!\\)\$1/g, () => contextChats);
            text = text.replace(/(?<!\\)\$2/g, () => summaryChats);
            text = text.replace(/(?<!\\)\$3/g, () => finalPrompt);
            text = text.replace(/(?<!\\)\$4/g, () => lorebookContent);
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
                EDITOR.error('主API请求错误: ' , error.message, error);
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
                EDITOR.error('自定义API请求错误: ' , error.message, error);
                return 'error';
            }
        }

        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            EDITOR.error('API响应内容无效或为空。');
            return 'error';
        }

        // **核心修复**: 使用与常规填表完全一致的 getTableEditTag 函数来提取指令
        const { matches } = getTableEditTag(rawContent);

        if (!matches || matches.length === 0) {
            EDITOR.info("AI未返回任何有效的<tableEdit>操作指令，表格内容未发生变化。");
            return 'success';
        }

        try {
            // 将提取到的、未经修改的原始指令数组传递给执行器
            executeTableEditActions(matches, referencePiece)
        } catch (e) {
            EDITOR.error("执行表格操作指令时出错: ", e.message, e);
            console.error("错误原文: ", matches.join('\n'));
        }
        USER.saveChat()
        BASE.refreshContextView();
        updateSystemMessageTableStatus();
        EDITOR.success('独立填表完成！');
        return 'success';

    } catch (error) {
        console.error('执行增量更新时出错:', error);
        EDITOR.error(`执行增量更新失败`, error.message, error);
        console.log('[Memory Enhancement Plugin] Error context:', {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
        });
        return 'error';
    }
}
