import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {refreshTableActions, rebuildTableActions} from "./absoluteRefresh.js";
import {generateDeviceId} from "../../utils/utility.js";
import {encryptXor, updateModelList} from "../source/standaloneAPI.js";
import {filterTableDataPopup} from "../source/pluginSetting.js";

/**
 * 格式化深度设置
 */
function formatDeep() {
    USER.tableBaseConfig.deep = Math.abs(USER.tableBaseConfig.deep)
}

/**
 * 更新设置中的开关状态
 */
function updateSwitch(selector, switchValue) {
    if (switchValue) {
        $(selector).prop('checked', true);
    } else {
        $(selector).prop('checked', false);
    }
}

/**
 * 更新设置中的表格结构DOM
 */
function updateTableStructureDOM() {
    const container = $('#dataTable_tableEditor_list');
    container.empty();
    USER.tableBaseConfig.tableStructure.forEach((tableStructure) => {
        container.append(tableStructureToSettingDOM(tableStructure));
    })
}

/**
 * 将表格结构转为设置DOM
 * @param {object} tableStructure 表格结构
 * @returns 设置DOM
 */
function tableStructureToSettingDOM(tableStructure) {
    const tableIndex = tableStructure.tableIndex;
    const $item = $('<div>', { class: 'dataTable_tableEditor_item' });
    const $index = $('<div>').text(`#${tableIndex}`); // 编号
    const $input = $('<div>', {
        class: 'tableName_pole margin0',
    });
    $input.text(tableStructure.tableName);
    const $checkboxLabel = $('<label>', { class: 'checkbox' });
    const $checkbox = $('<input>', { type: 'checkbox', 'data-index': tableIndex, checked: tableStructure.enable, class: 'tableEditor_switch' });
    $checkboxLabel.append($checkbox, '启用');
    const $editButton = $('<div>', {
        class: 'menu_button menu_button_icon fa-solid fa-pencil tableEditor_editButton',
        title: '编辑',
        'data-index': tableIndex, // 绑定索引
    }).text('编辑');
    $item.append($index, $input, $checkboxLabel, $editButton);
    return $item;
}

/**
 * 导入插件设置
 */
async function importTableSet() {
    // 创建一个 input 元素，用于选择文件
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json'; // 限制文件类型为 JSON

    // 监听 input 元素的 change 事件，当用户选择文件后触发
    input.addEventListener('change', async (event) => {
        const file = event.target.files[0]; // 获取用户选择的文件

        if (!file) {
            return; // 用户未选择文件，直接返回
        }

        const reader = new FileReader(); // 创建 FileReader 对象来读取文件内容

        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result); // 解析 JSON 文件内容

                // 获取导入 JSON 的第一级 key
                const firstLevelKeys = Object.keys(importedData);

                // 构建展示第一级 key 的 HTML 结构
                let keyListHTML = '<ul>';
                firstLevelKeys.forEach(key => {
                    keyListHTML += `<li>${key}</li>`;
                });
                keyListHTML += '</ul>';

                const tableInitPopup = $(`<div>
                    <p>即将导入的设置项 (第一级):</p>
                    ${keyListHTML}
                    <p>是否继续导入并重置这些设置？</p>
                </div>`);

                const confirmation = await EDITOR.callGenericPopup(tableInitPopup, EDITOR.POPUP_TYPE.CONFIRM, '导入设置确认', { okButton: "继续导入", cancelButton: "取消" });
                if (!confirmation) return; // 用户取消导入

                // 用户确认导入后，进行数据应用
                // 注意：这里假设你需要将 importedData 的所有内容都合并到 USER.tableBaseConfig 中
                // 你可能需要根据实际需求调整数据合并逻辑，例如只合并第一级 key 对应的数据，或者进行更细粒度的合并
                for (let key in importedData) {
                    USER.tableBaseConfig[key] = importedData[key];
                }

                renderSetting(); // 重新渲染设置界面，应用新的设置
                EDITOR.success('导入成功并已重置所选设置'); // 提示用户导入成功

            } catch (error) {
                EDITOR.error('JSON 文件解析失败，请检查文件格式是否正确。'); // 提示 JSON 解析失败
                console.error("文件读取或解析错误:", error); // 打印详细错误信息到控制台
            }
        };

        reader.onerror = (error) => {
            EDITOR.error(`文件读取失败: ${error}`); // 提示文件读取失败
        };

        reader.readAsText(file); // 以文本格式读取文件内容
    });

    input.click(); // 模拟点击 input 元素，弹出文件选择框
}


/**
 * 导出插件设置
 */
async function exportTableSet() {
    const { filterData, confirmation } = await filterTableDataPopup(EDITOR.allData)
    if (!confirmation) return;

    try {
        const blob = new Blob([JSON.stringify(filterData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a')
        a.href = url;
        a.download = `tableCustomConfig-${SYSTEM.generateRandomString(8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        EDITOR.success('导出成功');
    } catch (error) {
        EDITOR.error(`导出失败: ${error}`);
    }
}

/**
 * 重置设置
 */
async function resetSettings() {
    const { filterData, confirmation } = await filterTableDataPopup(BASE.defaultSettings)
    if (!confirmation) return;

    try {
        for (let key in filterData) {
            USER.tableBaseConfig[key] = filterData[key]
        }
        renderSetting()
        EDITOR.success('已重置所选设置');
    } catch (error) {
        EDITOR.error(`重置设置失败: ${error}`);
    }
}

function InitBinging() {
    console.log('初始化绑定')
    // 开始绑定事件
    // 导入预设
    $('#table-set-import').on('click', () => importTableSet());
    // 导出
    $("#table-set-export").on('click', () => exportTableSet());
    // 重置设置
    $("#table-reset").on('click', () => resetSettings());
    // 插件总体开关
    $('#table_switch').change(function () {
        USER.tableBaseConfig.isExtensionAble = this.checked;
        EDITOR.success(this.checked ? '插件已开启' : '插件已关闭，可以打开和手动编辑表格但AI不会读表和生成');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });
    // 调试模式开关
    $('#table_switch_debug_mode').change(function () {
        USER.tableBaseConfig.tableDebugModeAble = this.checked;
        EDITOR.success(this.checked ? '调试模式已开启' : '调试模式已关闭');
    });
    // 插件读表开关
    $('#table_read_switch').change(function () {
        USER.tableBaseConfig.isAiReadTable = this.checked;
        EDITOR.success(this.checked ? 'AI现在会读取表格' : 'AI现在将不会读表');
    });
    // 插件写表开关
    $('#table_edit_switch').change(function () {
        USER.tableBaseConfig.isAiWriteTable = this.checked;
        EDITOR.success(this.checked ? 'AI的更改现在会被写入表格' : 'AI的更改现在不会被写入表格');
    });

    // 表格插入模式
    $('#dataTable_injection_mode').change(function (event) {
        USER.tableBaseConfig.injection_mode = event.target.value;
    });
    // 表格结构编辑
    $('#step_by_step').change(function() {
        $('#reply_options').toggle(!this.checked);
        $('#step_by_step_options').toggle(this.checked);
        USER.tableBaseConfig.step_by_step = this.checked;
    });
    // 开启多轮字数累计
    $('#sum_multiple_rounds').change(function() {
        USER.tableBaseConfig.sum_multiple_rounds = $(this).prop('checked');
    })
    //整理表格相关高级设置
    $('#advanced_settings').change(function() {
        $('#advanced_options').toggle(this.checked);
        USER.tableBaseConfig.advanced_settings = this.checked;
    });
    // 忽略删除
    $('#ignore_del').change(function() {
        USER.tableBaseConfig.bool_ignore_del = $(this).prop('checked');
    });
    // 忽略用户回复
    $('#ignore_user_sent').change(function() {
        USER.tableBaseConfig.ignore_user_sent = $(this).prop('checked');
    });
    // 强制刷新
    $('#bool_force_refresh').change(function() {
        USER.tableBaseConfig.bool_force_refresh = $(this).prop('checked');
    });
    // 静默刷新
    $('#bool_silent_refresh').change(function() {
        USER.tableBaseConfig.bool_silent_refresh = $(this).prop('checked');
    });
    //token限制代替楼层限制
    $('#use_token_limit').change(function() {
        $('#token_limit_container').toggle(this.checked);
        $('#clear_up_stairs_container').toggle(!this.checked);
        USER.tableBaseConfig.use_token_limit = this.checked;
    });
    // 初始化API设置显示状态
    $('#use_main_api').change(function() {
        $('#custom_api_settings').toggle(!this.checked);
        USER.tableBaseConfig.use_main_api = this.checked;
    });
    // 根据下拉列表选择的模型更新自定义模型名称
    $('#model_selector').change(function() {
        const selectedModel = $(this).val();
        $('#custom_model_name').val(selectedModel);
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = selectedModel;
    });
    // 表格推送至对话开关
    $('#table_to_chat').change(function () {
        USER.tableBaseConfig.isTableToChat = this.checked;
        EDITOR.success(this.checked ? '表格会被推送至对话中' : '关闭表格推送至对话');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });


    // API URL
    $('#custom_api_url').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = $(this).val();
    });
    // API KEY
    $('#custom_api_key').on('input', async function() {
        try {
            const rawKey = $(this).val();
            // 加密
            USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = encryptXor(rawKey, generateDeviceId());
            // console.log('加密后的API密钥:', USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key);
        } catch (error) {
            console.error('API Key 处理失败:', error);
            EDITOR.error('未能获取到API KEY，请重新输入~');
        }
    })
    // 模型名称
    $('#custom_model_name').on('input', function() {
        USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = $(this).val();
    });
    // 表格消息模板
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        USER.tableBaseConfig.message_template = value;
    })
    // 表格深度
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        USER.tableBaseConfig.deep = Math.abs(value);
    })
    // 触发分步总结的字数阈值
    $('#step_by_step_threshold').on('input', function() {
        const value = $(this).val();
        $('#step_by_step_threshold_value').text(value);
        USER.tableBaseConfig.step_by_step_threshold = Number(value);
    });
    // 清理聊天记录楼层
    $('#clear_up_stairs').on('input', function() {
        const value = $(this).val();
        $('#clear_up_stairs_value').text(value);
        USER.tableBaseConfig.clear_up_stairs = Number(value);
    });
    // token限制
    $('#rebuild_token_limit').on('input', function() {
        const value = $(this).val();
        $('#rebuild_token_limit_value').text(value);
        USER.tableBaseConfig.rebuild_token_limit_value = Number(value);
    });
    // 模型温度设定
    $('#custom_temperature').on('input', function() {
        const value = $(this).val();
        $('#custom_temperature_value').text(value);
        USER.tableBaseConfig.custom_temperature = Number(value);
    });



    // 获取模型列表
    $('#fetch_models_button').on('click', updateModelList);
    // 开始整理表格
    $("#table_clear_up").on('click', () => refreshTableActions(USER.tableBaseConfig.bool_force_refresh, USER.tableBaseConfig.bool_silent_refresh));
    // 完整重建表格
    $('#rebuild_table').on('click', () => rebuildTableActions(USER.tableBaseConfig.bool_force_refresh, USER.tableBaseConfig.bool_silent_refresh));
    // 表格推送至对话
    $("#dataTable_to_chat_button").on("click", async function () {
        const result = await EDITOR.callGenericPopup("自定义推送至对话的表格的包裹样式，支持HTML与CSS，使用$0表示表格整体的插入位置", EDITOR.POPUP_TYPE.INPUT, USER.tableBaseConfig.to_chat_container, { rows: 10 })
        if (result) {
            USER.tableBaseConfig.to_chat_container = result;
            updateSystemMessageTableStatus()
        }
    })
}

/**
 * 渲染设置
 */
export function renderSetting() {
    // 初始化数值
    $(`#dataTable_injection_mode option[value="${USER.tableBaseConfig.injection_mode}"]`).attr('selected', true);
    $('#custom_api_url').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url || '');
    $('#custom_api_key').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key || '');
    $('#custom_model_name').val(USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name || '');
    $('#dataTable_message_template').val(USER.tableBaseConfig.message_template);
    $('#dataTable_deep').val(USER.tableBaseConfig.deep);
    $('#clear_up_stairs').val(USER.tableBaseConfig.clear_up_stairs);
    $('#clear_up_stairs_value').text(USER.tableBaseConfig.clear_up_stairs);
    $('#rebuild_token_limit').val(USER.tableBaseConfig.rebuild_token_limit_value);
    $('#rebuild_token_limit_value').text(USER.tableBaseConfig.rebuild_token_limit_value);
    $('#custom_temperature').val(USER.tableBaseConfig.custom_temperature);
    $('#custom_temperature_value').text(USER.tableBaseConfig.custom_temperature);
    $('#step_by_step_threshold').val(USER.tableBaseConfig.step_by_step_threshold);
    $('#step_by_step_threshold_value').text(USER.tableBaseConfig.step_by_step_threshold);

    // 初始化开关状态
    updateSwitch('#table_switch', USER.tableBaseConfig.isExtensionAble);
    updateSwitch('#table_switch_debug_mode', USER.tableBaseConfig.tableDebugModeAble);
    updateSwitch('#table_read_switch', USER.tableBaseConfig.isAiReadTable);
    updateSwitch('#table_edit_switch', USER.tableBaseConfig.isAiWriteTable);
    updateSwitch('#table_to_chat', USER.tableBaseConfig.isTableToChat);
    updateSwitch('#advanced_settings', USER.tableBaseConfig.advanced_settings);
    updateSwitch('#step_by_step', USER.tableBaseConfig.step_by_step);
    updateSwitch('#use_main_api', USER.tableBaseConfig.use_main_api);
    updateSwitch('#ignore_del', USER.tableBaseConfig.bool_ignore_del);
    updateSwitch('#sum_multiple_rounds', USER.tableBaseConfig.sum_multiple_rounds);
    updateSwitch('#bool_force_refresh', USER.tableBaseConfig.bool_force_refresh);
    updateSwitch('#bool_silent_refresh', USER.tableBaseConfig.bool_silent_refresh);
    updateSwitch('#use_token_limit', USER.tableBaseConfig.use_token_limit);
    updateSwitch('#ignore_user_sent', USER.tableBaseConfig.ignore_user_sent);

    // 设置元素结构可见性
    $('#advanced_options').toggle(USER.tableBaseConfig.advanced_settings);
    $('#custom_api_settings').toggle(!USER.tableBaseConfig.use_main_api);
    $('#reply_options').toggle(!USER.tableBaseConfig.step_by_step);
    $('#step_by_step_options').toggle(USER.tableBaseConfig.step_by_step);

    updateTableStructureDOM()
    console.log("设置已渲染")
}

/**
 * 加载设置
 */
export function loadSettings() {
    USER.IMPORTANT_USER_PRIVACY_DATA = USER.IMPORTANT_USER_PRIVACY_DATA || {};

    if (USER.tableBaseConfig.updateIndex != 3) {
        USER.tableBaseConfig.message_template = BASE.defaultSettings.message_template
        USER.tableBaseConfig.to_chat_container = BASE.defaultSettings.to_chat_container
        USER.tableBaseConfig.tableStructure = BASE.defaultSettings.tableStructure
        USER.tableBaseConfig.updateIndex = 3
    }
    if (USER.tableBaseConfig.deep < 0) formatDeep()

    renderSetting();
    InitBinging();
}
