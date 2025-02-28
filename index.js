import { eventSource, event_types, saveSettingsDebounced, } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../popup.js';
import JSON5 from './index.min.mjs'
import { generateRaw } from '../../../../../../script.js';

const VERSION = '1.2.1'

let clearUpButton = null;
let clearUpButtonManager = null;
let clearUpRevertButton = null;
let waitingTable = null
let waitingTableIndex = null
let tablePopup = null
let copyTableData = null
let exportTableData = null
let importTableData = null
let selectedCell = null
let tableEditActions = []
// let tableEditHistory = []
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

/**
 * 默认插件设置
 */
const defaultSettings = {
    // // 该设置仅在插件第一次安装和重置时生效
    // // !!以下应该为只读，请注意该设置的安全性
    // // ！！！！！！！！！！！！！！！！！！！！
    // // ！！！！！！！！！！！！！！！！！！！！
    // OPENAI_API_KEY: 'xxxx',
    // OPENAI_ENDPOINT: 'https://xxx/v1/chat/completions',
    // OPENAI_API_MODEL: "gpt-3.5-turbo",
    // custom_api_url: '',
    // custom_api_key: '',
    // custom_model_name: '',
    // // ！！！！！！！！！！！！！！！！！！！！
    // // ！！！！！！！！！！！！！！！！！！！！

    // 以下可读写
    injection_mode: 'deep_system',
    deep: 2,
    isExtensionAble: true,
    isAiReadTable: true,
    isAiWriteTable: true,
    isTableToChat: false,
    // enableHistory: true,
    step_by_step: false,
    //自动整理表格
    use_main_api: true,
    custom_temperature: 1.0,
    custom_max_tokens: 2048,
    custom_top_p: 1,
    tableBackups: {}, // 新增表格备份存储
    bool_ignore_del: true,
    clear_up_stairs:3,//有几层聊天记录纳入范围
    tableStructure: [
        {
            tableName: "时空表格", tableIndex: 0, columns: ['日期', '时间', '地点（当前描写）', '此地角色'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, asStatus: true, toChat: true, note: "记录时空信息的表格，应保持在一行",
            initNode: '本轮需要记录当前时间、地点、人物信息，使用insertRow函数', updateNode: "当描写的场景，时间，人物变更时", deleteNode: "此表大于一行时应删除多余行"
        },
        {
            tableName: '角色特征表格', tableIndex: 1, columns: ['角色名', '身体特征', '性格', '职业', '爱好', '喜欢的事物（作品、虚拟人物、物品等）', '住所', '其他重要信息'], enable: true, Required: true, asStatus: true, toChat: true, columnsIndex: [0, 1, 2, 3, 4, 5, 6, 7], note: '角色天生或不易改变的特征csv表格，思考本轮有否有其中的角色，他应作出什么反应',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色的身体出现持久性变化时，例如伤痕/当角色有新的爱好，职业，喜欢的事物时/当角色更换住所时/当角色提到重要信息时", deleteNode: ""
        },
        {
            tableName: '角色与<user>社交表格', tableIndex: 2, columns: ['角色名', '对<user>关系', '对<user>态度', '对<user>好感'], columnsIndex: [0, 1, 2, 3], enable: true, Required: true, asStatus: true, toChat: true, note: '思考如果有角色和<user>互动，应什么态度',
            initNode: '本轮必须从上文寻找已知的所有角色使用insertRow插入，角色名不能为空', insertNode: '当本轮出现表中没有的新角色时，应插入', updateNode: "当角色和<user>的交互不再符合原有的记录时/当角色和<user>的关系改变时", deleteNode: ""
        },
        {
            tableName: '任务、命令或者约定表格', tableIndex: 3, columns: ['角色', '任务', '地点', '持续时间'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, asStatus: true, toChat: true, note: '思考本轮是否应该执行任务/赴约',
            insertNode: '当特定时间约定一起去做某事时/某角色收到做某事的命令或任务时', updateNode: "", deleteNode: "当大家赴约时/任务或命令完成时/任务，命令或约定被取消时"
        },
        {
            tableName: '重要事件历史表格', tableIndex: 4, columns: ['角色', '事件简述', '日期', '地点', '情绪'], columnsIndex: [0, 1, 2, 3, 4], enable: true, Required: true, asStatus: true, toChat: true, note: '记录<user>或角色经历的重要事件',
            initNode: '本轮必须从上文寻找可以插入的事件并使用insertRow插入', insertNode: '当某个角色经历让自己印象深刻的事件时，比如表白、分手等', updateNode: "", deleteNode: ""
        },
        {
            tableName: '重要物品表格', tableIndex: 5, columns: ['拥有人', '物品描述', '物品名', '重要原因'], columnsIndex: [0, 1, 2, 3], enable: true, Required: false, asStatus: true, toChat: true, note: '对某人很贵重或有特殊纪念意义的物品',
            insertNode: '当某人获得了贵重或有特殊意义的物品时/当某个已有物品有了特殊意义时', updateNode: "", deleteNode: ""
        },
    ],
    to_chat_container: `<div class="table-preview-bar"><details> <summary>记忆增强表格</summary>
$0
</details></div>

<style>
.table-preview-bar {
    padding: 0 8px;
    border-radius: 10px;
    color: #888;
    font-size: 0.8rem;
}
</style>`,
    message_template: `# dataTable 说明
## 用途
- dataTable是 CSV 格式表格，存储数据和状态，是你生成下文的重要参考。
- 新生成的下文应基于 dataTable 发展，并允许更新表格。
## 数据与格式
- 你可以在这里查看所有的表格数据，相关说明和修改表格的触发条件。
- 命名格式：
    - 表名: [tableIndex:表名] (示例: [2:角色特征表格])
    - 列名: [colIndex:列名] (示例: [2:示例列])
    - 行名: [rowIndex]

{{tableData}}

# 增删改dataTable操作方法：
-当你生成正文后，需要根据【增删改触发条件】对每个表格是否需要增删改进行检视。如需修改，请在<tableEdit>标签中使用 JavaScript 函数的写法调用函数，并使用下面的 OperateRule 进行。

## 操作规则 (必须严格遵守)
<OperateRule>
-在某个表格中插入新行时，使用insertRow函数：
insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
例如：insertRow(0, {0: "2021-09-01", 1: "12:00", 2: "阳台", 3: "小花"})
-在某个表格中删除行时，使用deleteRow函数：
deleteRow(tableIndex:number, rowIndex:number)
例如：deleteRow(0, 0)
-在某个表格中更新行时，使用updateRow函数：
updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
例如：updateRow(0, 0, {3: "惠惠"})
</OperateRule>

# 重要操作原则 (必须遵守)
-当<user>要求修改表格时，<user>的要求优先级最高。
-每次回复都必须根据剧情在正确的位置进行增、删、改操作，禁止捏造信息和填入未知。
-使用 insertRow 函数插入行时，请为所有已知的列提供对应的数据。且检查data:{[colIndex:number]:string|number}参数是否包含所有的colIndex。
-单元格中禁止使用逗号，语义分割应使用 / 。
-string中，禁止出现双引号。
-社交表格(tableIndex: 2)中禁止出现对<user>的态度。反例 (禁止)：insertRow(2, {"0":"<user>","1":"未知","2":"无","3":"低"})
-<tableEdit>标签内必须使用<!-- -->标记进行注释

# 输出示例：
<tableEdit>
<!--
insertRow(0, {"0":"十月","1":"冬天/下雪","2":"学校","3":"<user>/悠悠"})
deleteRow(1, 2)
insertRow(1, {0:"悠悠", 1:"体重60kg/黑色长发", 2:"开朗活泼", 3:"学生", 4:"羽毛球", 5:"鬼灭之刃", 6:"宿舍", 7:"运动部部长"})
insertRow(1, {0:"<user>", 1:"制服/短发", 2:"忧郁", 3:"学生", 4:"唱歌", 5:"咒术回战", 6:"自己家", 7:"学生会长"})
insertRow(2, {0:"悠悠", 1:"同学", 2:"依赖/喜欢", 3:"高"})
updateRow(4, 1, {0: "小花", 1: "破坏表白失败", 2: "10月", 3: "学校",4:"愤怒"})
insertRow(4, {0: "<user>/悠悠", 1: "悠悠向<user>表白", 2: "2021-10-05", 3: "教室",4:"感动"})
insertRow(5, {"0":"<user>","1":"社团赛奖品","2":"奖杯","3":"比赛第一名"})
-->
</tableEdit>
`,
    refresh_system_message_template: `你是一个专业的表格整理助手，请严格按照用户的指令和格式要求处理表格数据。`,
    refresh_user_message_template: `根据以下规则整理表格：
<整理规则>
    1. 修正格式错误，删除所有data[0]为空的行，此操作只允许整行操作！
    2. 补全空白/未知内容，但禁止捏造信息
    3. 当"重要事件历史表格"(tableIndex: 4)超过10行时，检查是否有重复或内容相近的行，适当合并或删除多余的行，此操作只允许整行操作！
    4. "角色与User社交表格"(tableIndex: 2)中角色名禁止重复，有重复的需要整行删除，此操作只允许整行操作！
    5. "时空表格"(tableIndex: 0）只允许有一行，删除所有旧的内容，此操作只允许整行操作！
    6. 如果一个格子中超过15个字，则进行简化使之不超过15个字；如果一个格子中斜杠分隔的内容超过4个，则简化后只保留不超过4个
    7. 时间格式统一为YYYY-MM-DD HH：MM   (时间中的冒号应当用中文冒号，未知的部分可以省略，例如：2023-10-01 12：00 或 2023-10-01 或 12：00)
    8. 地点格式为 大陆>国家>城市>具体地点 (未知的部分可以省略，例如：大陆>中国>北京>故宫 或 异世界>酒馆)
    9. 单元格中禁止使用逗号，语义分割应使用 /
    10. 单元格内的string中禁止出现双引号
    11. 禁止插入与现有表格内容完全相同的行，检查现有表格数据后再决定是否插入
</整理规则>

<聊天记录>
    $1
</聊天记录>

<当前表格>
    $0
</当前表格>

请用纯JSON格式回复操作列表，确保：
    1. 所有键名必须使用双引号包裹，例如 "action" 而非 action
    2. 数值键名必须加双引号，例如 "0" 而非 0
    3. 使用双引号而非单引号，例如 "value" 而非 'value'
    4. 斜杠（/）必须转义为 \/
    5. 不要包含注释或多余的Markdown标记
    6. 将所有删除操作放在最后发送，并且删除的时候先发送row值较大的操作
    7. 有效的格式：
        [{
            "action": "insert/update/delete",
            "tableIndex": 数字,
            "rowIndex": 数字（delete/update时需要）,
            "data": {列索引: "值"}（insert/update时需要）
        }]
    8. 强调：delete操作不包含"data"，insert操作不包含"rowIndex"
    9. 强调：tableIndex和rowIndex的值为数字，不加双引号，例如 0 而非 "0"

<正确回复示例>
    [
        {
            "action": "update",
            "tableIndex": 0,
            "rowIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        }，
        {
            "action": "insert",",
            "tableIndex": 0,
            "data": {
            "0": "2023-10-01",
            "1": "12：00",
            "2": "大陆>中国>北京>故宫"
            }
        },
        {
            "action": "delete",
            "tableIndex": 0,
            "rowIndex": 0,
        }
    ]
</正确格式示例>`
};

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
 * 更新设置中的表格结构DOM
 */
function updateTableStructureDOM() {
    const container = $('#dataTable_tableEditor_list');
    container.empty();
    extension_settings.muyoo_dataTable.tableStructure.forEach((tableStructure) => {
        container.append(tableStructureToSettingDOM(tableStructure));
    })
}

/**
 * 通过表格索引查找表格结构
 * @param {number} index 表格索引
 * @returns 此索引的表格结构
 */
function findTableStructureByIndex(index) {
    return extension_settings.muyoo_dataTable.tableStructure.find(table => table.tableIndex === index);
}

/**
 * 导入表格数据文件
 * */
async function importTableDataFile(){
    const importFileElement = document.querySelector('#table-set-importFile'); // 获取文件输入元素

    // 定义一个具名的事件处理函数
    async function changeEventHandler(event) {
        const files = event.target.files; // 从事件对象中获取 files 列表
        console.log("选择的文件列表:", files);

        if (files && files.length > 0) { // 确保用户选择了文件
            await importTableSet(files); // 调用 importTableSet 函数处理文件
            importFileElement.value = null; // 清空文件输入框的值，以便下次可以选择相同文件
        } else {
            console.log("用户取消了文件选择或未选择文件。");
        }

        // 移除事件监听器
        importFileElement.removeEventListener('change', changeEventHandler); // 使用具名函数引用移除
    }

    // 添加 change 事件监听器，使用具名函数引用
    importFileElement.addEventListener('change', changeEventHandler);

    importFileElement.click(); // 触发文件选择对话框
}

/**
 * 加载设置
 */
function loadSettings() {
    extension_settings.muyoo_dataTable = extension_settings.muyoo_dataTable || {};
    extension_settings.IMPORTANT_USER_PRIVACY_DATA = extension_settings.IMPORTANT_USER_PRIVACY_DATA || {};

    for (const key in defaultSettings) {
        if (!Object.hasOwn(extension_settings.muyoo_dataTable, key)) {
            extension_settings.muyoo_dataTable[key] = defaultSettings[key];
        }
    }
    if (extension_settings.muyoo_dataTable.updateIndex != 3) {
        extension_settings.muyoo_dataTable.message_template = defaultSettings.message_template
        extension_settings.muyoo_dataTable.to_chat_container = defaultSettings.to_chat_container
        extension_settings.muyoo_dataTable.tableStructure = defaultSettings.tableStructure
        extension_settings.muyoo_dataTable.updateIndex = 3
    }
    if (extension_settings.muyoo_dataTable.deep < 0) formatDeep()
    renderSetting()

    //api初始化
    $('#step_by_step').prop('checked', extension_settings.muyoo_dataTable.step_by_step ?? true);
    $('#reply_options').toggle(!extension_settings.muyoo_dataTable.step_by_step);
    $('#use_main_api').prop('checked', extension_settings.muyoo_dataTable.use_main_api ?? true);
    $('#custom_api_settings').toggle(!extension_settings.muyoo_dataTable.use_main_api);

    $('#custom_api_url').val(extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_url || '');
    $('#custom_api_key').val(extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_key || '');
    $('#custom_model_name').val(extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name || '');

    if (typeof extension_settings.muyoo_dataTable.bool_ignore_del === 'undefined') {
        extension_settings.muyoo_dataTable.bool_ignore_del = defaultSettings.bool_ignore_del;
    }

    extension_settings.muyoo_dataTable.clear_up_stairs = extension_settings.muyoo_dataTable.clear_up_stairs || 3;
    $('#clear_up_stairs').val(extension_settings.muyoo_dataTable.clear_up_stairs);
    $('#clear_up_stairs_value').text(extension_settings.muyoo_dataTable.clear_up_stairs);

    extension_settings.muyoo_dataTable.custom_temperature = extension_settings.muyoo_dataTable.custom_temperature || 1.0;
    $('#custom_temperature').val(extension_settings.muyoo_dataTable.custom_temperature);
    $('#custom_temperature_value').text(extension_settings.muyoo_dataTable.custom_temperature);
    $('#bool_force_refresh').prop('checked', extension_settings.muyoo_dataTable.bool_force_refresh || false);
    $('#bool_silent_refresh').prop('checked', extension_settings.muyoo_dataTable.bool_silent_refresh || false);
}


/**
 * 渲染设置
 */
function renderSetting() {
    $(`#dataTable_injection_mode option[value="${extension_settings.muyoo_dataTable.injection_mode}"]`).attr('selected', true);
    $('#dataTable_deep').val(extension_settings.muyoo_dataTable.deep);
    $('#dataTable_message_template').val(extension_settings.muyoo_dataTable.message_template);
    updateSwitch("#table_switch", extension_settings.muyoo_dataTable.isExtensionAble)
    updateSwitch("#table_read_switch", extension_settings.muyoo_dataTable.isAiReadTable)
    updateSwitch("#table_edit_switch", extension_settings.muyoo_dataTable.isAiWriteTable)
    updateSwitch("#table_to_chat", extension_settings.muyoo_dataTable.isTableToChat)
    updateSwitch("#advanced_settings", extension_settings.muyoo_dataTable.advanced_settings)
    $('#advanced_options').toggle(extension_settings.muyoo_dataTable.advanced_settings)
    $('#custom_api_settings').toggle(!extension_settings.muyoo_dataTable.use_main_api);
    updateTableStructureDOM()
    console.log("设置已渲染")
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
 * 导出插件设置
 */
function exportTableSet() {
    const blob = new Blob([JSON.stringify(extension_settings.muyoo_dataTable)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a')
    a.href = url;
    a.download = `tableExtensionPrompt.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 导入插件设置
 */
async function importTableSet(/**@type {FileList}*/files) {
    for (let i = 0; i < files.length; i++) {
        await importSingleTableSet(files.item(i))
    }
}

async function importSingleTableSet(/**@type {File}*/file) {
    try {
        const text = await file.text()
        const props = JSON.parse(text)
        console.log(props)
        if (props.message_template && props.tableStructure) {
            extension_settings.muyoo_dataTable.tableStructure = props.tableStructure
            extension_settings.muyoo_dataTable.message_template = props.message_template
            extension_settings.muyoo_dataTable.to_chat_container = props.to_chat_container
            extension_settings.muyoo_dataTable.deep = props.deep
            extension_settings.muyoo_dataTable.injection_mode = props.injection_mode
            saveSettingsDebounced()
            renderSetting()
            toastr.success('导入成功')
        } else toastr.error('导入失败，非记忆插件预设')
    } catch (e) {
        toastr.error('导入失败，请检查文件格式')
    }

}

/**
 * 重置设置
 */
async function resetSettings() {
    const tableInitPopup = $(tableInitPopupDom)
    const confirmation = await callGenericPopup(tableInitPopup, POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        // 千万不要简化以下的三元表达式和赋值顺序！！！，否则会导致重置设置无法正确运行
        // 判断是否重置所有基础设置(这条判断语句必须放在第一行)
        let newSettings = tableInitPopup.find('#table_init_basic').prop('checked') ? {...extension_settings.muyoo_dataTable, ...defaultSettings} : {...extension_settings.muyoo_dataTable};

        // 以下的赋值顺序可以改变
        // 判断是否重置消息模板
        if (tableInitPopup.find('#table_init_message_template').prop('checked')) {
            newSettings.message_template = defaultSettings.message_template;
        } else {
            newSettings.message_template = extension_settings.muyoo_dataTable.message_template;
        }
        // 判断是否重置重新整理表格的提示词
        if (tableInitPopup.find('#table_init_refresh_template').prop('checked')) {
            newSettings.refresh_system_message_template = defaultSettings.refresh_system_message_template;
            newSettings.refresh_user_message_template = defaultSettings.refresh_user_message_template;
        } else {
            newSettings.refresh_system_message_template = extension_settings.muyoo_dataTable.refresh_system_message_template;
            newSettings.refresh_user_message_template = extension_settings.muyoo_dataTable.refresh_user_message_template;
        }
        // 判断是否重置所有表格结构
        if (tableInitPopup.find('#table_init_structure').prop('checked')) {
            newSettings.tableStructure = defaultSettings.tableStructure;
        } else {
            newSettings.tableStructure = extension_settings.muyoo_dataTable.tableStructure;
        }
        // 判断是否重置推送到聊天框的内容样式
        if (tableInitPopup.find('#table_init_to_chat_container').prop('checked')) {
            newSettings.to_chat_container = defaultSettings.to_chat_container;
        } else {
            newSettings.to_chat_container = extension_settings.muyoo_dataTable.to_chat_container;
        }

        // 以下为独立的赋值，不会影响其他设置
        // 判断是否重置用户个人API设置
        if (tableInitPopup.find('#table_init_api').prop('checked')) {
            extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = '';
            extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = '';
            extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = '';
        }

        extension_settings.muyoo_dataTable = newSettings;
        saveSettingsDebounced();
        renderSetting()
        toastr.success('已重置所选设置');
    }
}

/**
 * 初始化所有表格
 * @returns 所有表格对象数组
 */
function initAllTable() {
    return extension_settings.muyoo_dataTable.tableStructure.map(data => new Table(data.tableName, data.tableIndex, data.columns))
}

/**
 * 检查数据是否为Table实例，不是则重新创建
 * @param {Table[]} dataTable 所有表格对象数组
 */
function checkPrototype(dataTable) {
    for (let i = 0; i < dataTable.length; i++) {
        if (!(dataTable[i] instanceof Table)) {
            const table = dataTable[i]
            dataTable[i] = new Table(table.tableName, table.tableIndex, table.columns, table.content, table.insertedRows, table.updatedRows)
        }
    }
}

/**
 * 寻找最新的表格数据，若没有，就新建一个
 * @param isIncludeEndIndex 搜索时是否包含endIndex
 * @param endIndex 结束索引，自此索引向上寻找，默认是最新的消息索引
 * @returns 自结束索引向上寻找，最近的表格数据
 */
function findLastestTableData(isIncludeEndIndex = false, endIndex = -1) {
    let chat = getContext().chat
    if (endIndex === -1) chat = isIncludeEndIndex ? chat : chat.slice(0, -1)
    else chat = chat.slice(0, isIncludeEndIndex ? endIndex + 1 : endIndex)
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { tables: chat[i].dataTable, index: i }
        }
    }
    const newTableList = initAllTable()
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false) {
            return { tables: newTableList, index: i }
        }
    }
    return { tables: newTableList, index: -1 }
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = getContext().chat
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
export function initTableData() {
    const { tables } = findLastestTableData(true)
    const promptContent = getAllPrompt(tables)
    console.log("完整提示", promptContent)
    return promptContent
}

/**
 * 获取所有的完整提示词
 * @param {Table[]} tables 所有表格对象数组
 * @returns 完整提示词
 */
function getAllPrompt(tables) {
    const tableDataPrompt = tables.map(table => table.getTableText()).join('\n')
    return extension_settings.muyoo_dataTable.message_template.replace('{{tableData}}', tableDataPrompt)
}

/**
 * 深拷贝所有表格数据，拷贝时保留 Table 类的原型链
 * @param {Table[]} tableList 要拷贝的表格对象数组
 * @returns 拷贝后的表格对象数组
 */
function copyTableList(tableList) {
    return tableList.map(table => {
        const newTable = new Table(table.tableName, table.tableIndex, table.columns, JSON.parse(JSON.stringify(table.content)));
        newTable.insertedRows = [...table.insertedRows];
        newTable.updatedRows = [...table.updatedRows];
        return newTable;
    });
}

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell
 * @returns 处理后的单元格值
 */
function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * 获取表格为空时的提示词
 * @param {boolean} Required 此表格是否为必填表格
 * @param {string} node 此表格的初始化提示词
 * @returns
 */
function getEmptyTablePrompt(Required, node) {
    return '（此表格为空' + (Required ? (node ? ('，' + node) : '') : '') + '）\n'
}

/**
 * 获取表格编辑规则提示词
 * @param {Structure} structure 表格结构信息
 * @param {boolean} isEmpty 表格是否为空
 * @returns
 */
function getTableEditRules(structure, isEmpty) {
    if (structure.Required && isEmpty) return '【增删改触发条件】\n插入：' + replaceUserTag(structure.initNode) + '\n'
    else {
        let editRules = '【增删改触发条件】\n'
        if (structure.insertNode) editRules += ('插入：' + replaceUserTag(structure.insertNode) + '\n')
        if (structure.updateNode) editRules += ('更新：' + replaceUserTag(structure.updateNode) + '\n')
        if (structure.deleteNode) editRules += ('删除：' + replaceUserTag(structure.deleteNode) + '\n')
        return editRules
    }
}

/**
 * 处理表格中的单元格点击事件
 * @param {Event} event 点击事件
 */
function onTdClick(event) {
    if (selectedCell) {
        selectedCell.removeClass("selected");
    }
    selectedCell = $(this);
    selectedCell.addClass("selected");
    saveTdData(selectedCell.data("tableData"))
    // 计算工具栏位置
    const cellOffset = selectedCell.offset();
    const containerOffset = $("#tableContainer").offset();
    const relativeX = cellOffset.left - containerOffset.left;
    const relativeY = cellOffset.top - containerOffset.top;
    const clickedElement = event.target;
    hideAllEditPanels()
    if (clickedElement.tagName.toLowerCase() === "td") {
        $("#tableToolbar").css({
            top: relativeY + 32 + "px",
            left: relativeX + "px"
        }).show();
    } else if (clickedElement.tagName.toLowerCase() === "th") {
        $("#tableHeaderToolbar").css({
            top: relativeY + 32 + "px",
            left: relativeX + "px"
        }).show();
    }
    event.stopPropagation(); // 阻止事件冒泡
}

/**
 * 隐藏所有的编辑浮窗
 */
function hideAllEditPanels() {
    $("#tableToolbar").hide();
    $("#tableHeaderToolbar").hide();
}

/**
 * 将保存的data数据字符串保存到设置中
 * @param {string} data 保存的data属性字符串
 */
function saveTdData(data) {
    const [tableIndex, rowIndex, colIndex] = data.split("-");
    userTableEditInfo.tableIndex = parseInt(tableIndex);
    userTableEditInfo.rowIndex = parseInt(rowIndex);
    userTableEditInfo.colIndex = parseInt(colIndex);
}

/**
 * 表格类
 */
class Table {
    constructor(tableName, tableIndex, columns, content = [], insertedRows = [], updatedRows = []) {
        this.tableName = tableName
        this.tableIndex = tableIndex
        this.columns = columns
        this.content = content
        this.insertedRows = insertedRows
        this.updatedRows = updatedRows
    }

    /**
     * 清空插入或更新记录
     */
    clearInsertAndUpdate() {
        this.insertedRows = []
        this.updatedRows = []
    }

    /**
     * 获取表格内容的提示词，可以通过指定['title', 'node', 'headers', 'rows', 'editRules']中的部分，只获取部分内容
     * @returns 表格内容提示词
     */
    getTableText(customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        const structure = findTableStructureByIndex(this.tableIndex);
        if (!structure) return;

        const title = `* ${this.tableIndex}:${replaceUserTag(this.tableName)}\n`;
        const node = structure.note && structure.note !== '' ? '【说明】' + structure.note + '\n' : '';
        const headers = "rowIndex," + this.columns.map((colName, index) => index + ':' + replaceUserTag(colName)).join(',') + '\n';
        const newContent = this.content.filter(Boolean);
        const rows = newContent.length > 0 ? (newContent.map((row, index) => index + ',' + row.join(',')).join('\n') + '\n') : getEmptyTablePrompt(structure.Required, replaceUserTag(structure.initNode));
        const editRules = getTableEditRules(structure, newContent.length === 0) + '\n';

        let result = '';

        if (customParts.includes('title')) {
            result += title;
        }
        if (customParts.includes('node')) {
            result += node;
        }
        if (customParts.includes('headers')) {
            result += '【表格内容】\n' + headers;
        }
        if (customParts.includes('rows')) {
            result += rows;
        }
        if (customParts.includes('editRules')) {
            result += editRules;
        }

        return result;
    }

    /**
     * 插入一行数据
     * @param {object} data
     */
    insert(data) {
        const newRow = new Array(this.columns.length).fill("");
        Object.entries(data).forEach(([key, value]) => {
            const colIndex = parseInt(key);
            if (colIndex < this.columns.length) { // 防止越界
                newRow[colIndex] = handleCellValue(value);
            }
        });
        const newRowIndex = this.content.length; // 直接使用当前长度作为新索引
        this.content.push(newRow);
        this.insertedRows.push(newRowIndex);
        return newRowIndex;
    }

    /**
     * 插入一个空行
     * @param {number} rowIndex 插入空行的索引
     */
    insertEmptyRow(rowIndex) {
        this.content.splice(rowIndex, 0, this.getEmptyRow())
    }

    /**
     * 获取一个空行
     * @returns 一个空行
     */
    getEmptyRow() {
        return this.columns.map(() => '')
    }

    /**
     * 更新单个行的内容
     * @param {number} rowIndex 需要更新的行索引
     * @param {object} data 需要更新的数据
     */
    update(rowIndex, data) {
        const row = this.content[rowIndex]
        if (!row) return this.insert(data)
        Object.entries(data).forEach(([key, value]) => {
            if (key >= this.columns.length) return
            row[key] = handleCellValue(value)
            this.updatedRows.push(`${rowIndex}-${key}`)
        })
    }

    /**
     * 删除单个行
     * @param {number} rowIndex 删除单个行的索引
     */
    delete(rowIndex) {
        this.content[rowIndex] = null
    }

    /**
     * 清除空行
     */
    clearEmpty() {
        this.content = this.content.filter(Boolean)
    }

    /**
     * 获取某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @returns 此单元格的值
     */
    getCellValue(rowIndex, colIndex) {
        return this.content[rowIndex][colIndex]
    }

    /**
     * 设置某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @param {any} value 需要设置的值
     */
    setCellValue(rowIndex, colIndex, value) {
        this.content[rowIndex][colIndex] = handleCellValue(value)
    }

    /**
     * 干运行
     * @param {TableEditAction[]} actions 需要执行的编辑操作
     */
    dryRun(actions) {
        this.clearInsertAndUpdate()
        let nowRowIndex = this.content.length
        for (const action of actions) {
            if (action.tableIndex !== this.tableIndex) continue
            if (action.type === 'Insert') {
                action.rowIndex = nowRowIndex
                this.insertedRows.push(nowRowIndex)
                nowRowIndex++
            } else if (action.type === 'Update') {
                const updateData = action.data
                for (const colIndex in updateData) {
                    this.updatedRows.push(`${action.rowIndex}-${colIndex}`)
                }
            }
        }
    }

    /**
     * 把表格数据渲染成DOM元素
     * @returns DOM容器元素
     */
    render() {
        const container = document.createElement('div')
        container.classList.add('justifyLeft')
        container.classList.add('scrollable')
        const title = document.createElement('h3')
        title.innerText = replaceUserTag(this.tableName)
        const table = document.createElement('table')
        if (userTableEditInfo.editAble) {
            $(table).on('click', 'td', onTdClick)
            $(table).on('click', 'th', onTdClick)
        }
        table.classList.add('tableDom')
        const thead = document.createElement('thead')
        const titleTr = document.createElement('tr')
        this.columns.forEach(colName => {
            const th = document.createElement('th')
            $(th).data("tableData", this.tableIndex + '-0-0')
            th.innerText = replaceUserTag(colName)
            titleTr.appendChild(th)
        })
        thead.appendChild(titleTr)
        table.appendChild(thead)
        const tbody = document.createElement('tbody')
        for (let rowIndex in this.content) {
            const tr = document.createElement('tr')
            for (let cellIndex in this.content[rowIndex]) {
                const td = document.createElement('td')
                $(td).data("tableData", this.tableIndex + '-' + rowIndex + '-' + cellIndex)
                td.innerText = this.content[rowIndex][cellIndex]
                if (this.updatedRows && this.updatedRows.includes(rowIndex + '-' + cellIndex)) $(td).css('background-color', 'rgba(0, 98, 128, 0.2)')
                tr.appendChild(td)
            }
            if (this.insertedRows && this.insertedRows.includes(parseInt(rowIndex))) {
                $(tr).css('background-color', 'rgba(0, 128, 0, 0.2)')
            }
            tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        container.appendChild(title)
        container.appendChild(table)
        return container
    }
}

async function onChatChanged() {
}

/**
 * 替换字符串中的user标签
 */
function replaceUserTag(str) {
    if (str == null) return
    return str.replace(/<user>/g, getContext().name1)
}

/**
 * 在表格末尾插入行
 * @param {number} tableIndex 表格索引
 * @param {object} data 插入的数据
 * @returns 新插入行的索引
 */
function insertRow(tableIndex, data) {
    if (tableIndex == null) return toastr.error('insert函数，tableIndex函数为空');
    if (data == null) return toastr.error('insert函数，data函数为空');
    const table = waitingTable[tableIndex];
    const newRow = Object.entries(data)
        .reduce((row, [key, value]) => {
            row[parseInt(key)] = handleCellValue(value);
            return row;
        }, new Array(table.columns.length).fill(""));
    const dataStr = JSON.stringify(newRow);
    // 检查是否已存在相同行
    if (table.content.some(row => JSON.stringify(row) === dataStr)) {
        console.log(`跳过重复插入: table ${tableIndex}, data ${dataStr}`);
        return -1; // 返回-1表示未插入
    }
    const newRowIndex = table.insert(data);
    console.log(`插入成功: table ${tableIndex}, row ${newRowIndex}`);
    return newRowIndex;
}

/**
 * 删除行
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 */
function deleteRow(tableIndex, rowIndex) {
    if (tableIndex == null) return toastr.error('delete函数，tableIndex函数为空');
    if (rowIndex == null) return toastr.error('delete函数，rowIndex函数为空');
    const table = waitingTable[tableIndex]
    table.delete(rowIndex)
}

/**
 * 更新单个行的信息
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 * @param {object} data 更新的数据
 */
function updateRow(tableIndex, rowIndex, data) {
    if (tableIndex == null) return toastr.error('update函数，tableIndex函数为空');
    if (rowIndex == null) return toastr.error('update函数，rowIndex函数为空');
    if (data == null) return toastr.error('update函数，data函数为空');
    const table = waitingTable[tableIndex]
    table.update(rowIndex, data)
}

/**
 * 清除表格中的所有空行
 */
function clearEmpty() {
    waitingTable.forEach(table => {
        table.clearEmpty()
    })
}

/**
 * 命令执行对象
 */
class TableEditAction {
    constructor(str) {
        this.able = true
        if (!str) return
        this.str = str.trim()
        this.parsingFunctionStr()
    }

    setActionInfo(type, tableIndex, rowIndex, data) {
        this.type = type
        this.tableIndex = tableIndex
        this.rowIndex = rowIndex
        this.data = data
    }

    parsingFunctionStr() {
        const { type, newFunctionStr } = isTableEditFunction(this.str)
        this.type = type
        if (this.type === 'Comment') {
            if (!this.str.startsWith('//')) this.str = '// ' + this.str
        }
        this.params = ParseFunctionParams(newFunctionStr)
        this.AssignParams()
    }

    AssignParams() {
        for (const paramIndex in this.params) {
            if (typeof this.params[paramIndex] === 'number')
                switch (paramIndex) {
                    case '0':
                        this.tableIndex = this.params[paramIndex]
                        break
                    case '1':
                        this.rowIndex = this.params[paramIndex]
                        break
                    default:
                        break
                }
            else if (typeof this.params[paramIndex] === 'string') {
                // 暂时处理第二位参数为undefined的情况
                if (paramIndex == '1') this.rowIndex = 0
            }
            else if (typeof this.params[paramIndex] === 'object' && this.params[paramIndex] !== null) {
                this.data = this.params[paramIndex]
            }
        }
    }

    execute() {
        try {
            switch (this.type) {
                case 'Update':
                    updateRow(this.tableIndex, this.rowIndex, this.data)
                    break
                case 'Insert':
                    const newRowIndex = insertRow(this.tableIndex, this.data)
                    this.rowIndex = newRowIndex
                    break
                case 'Delete':
                    deleteRow(this.tableIndex, this.rowIndex)
                    break
            }
        } catch (err) {
            toastr.error('表格操作函数执行错误，请重新生成本轮文本\n错误语句：' + this.str + '\n错误信息：' + err.message);
        }
    }

    format() {
        switch (this.type) {
            case 'Update':
                return `updateRow(${this.tableIndex}, ${this.rowIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Insert':
                return `insertRow(${this.tableIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Delete':
                return `deleteRow(${this.tableIndex}, ${this.rowIndex})`
            default:
                return this.str
        }
    }

}

/**
 * 将匹配到的整体字符串转化为单个语句的数组
 * @param {string[]} matches 匹配到的整体字符串
 * @returns 单条执行语句数组
 */
function handleTableEditTag(matches) {
    let functionList = [];
    matches.forEach(matchBlock => {
        const lines = trimString(matchBlock)
            .split('\n')
            .filter(line => line.length > 0);
        let currentFunction = '';
        let parenthesisCount = 0;
        for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine.startsWith('//')) {
                functionList.push(trimmedLine)
                continue
            };
            currentFunction += trimmedLine;
            parenthesisCount += (trimmedLine.match(/\(/g) || []).length;
            parenthesisCount -= (trimmedLine.match(/\)/g) || []).length;
            if (parenthesisCount === 0 && currentFunction) {
                const formatted = currentFunction
                    .replace(/\s*\(\s*/g, '(')   // 移除参数括号内空格
                    .replace(/\s*\)\s*/g, ')')   // 移除结尾括号空格
                    .replace(/\s*,\s*/g, ',');   // 统一逗号格式
                functionList.push(formatted);
                currentFunction = '';
            }
        }
    });
    return functionList;
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
 * 修复将update和insert函数名写错的问题
 * @param {string} str 单个函数执行语句
 * @returns 修复后的函数执行语句
 */
function fixFunctionNameError(str) {
    if (str.startsWith("update("))
        return str.replace("update(", "updateRow(");
    if (str.startsWith("insert("))
        return str.replace("insert(", "insertRow(");
    if (str.startsWith("delete("))
        return str.replace("delete(", "deleteRow(");
    if (str.startsWith("updateRow(") || str.startsWith("insertRow(") || str.startsWith("deleteRow(")) return str
    return
}

/**
 * 检测单个语句是否是执行表格编辑的函数
 * @param {string} str 单个函数执行语句
 * @returns 是那种类型的表格编辑函数
 */
function isTableEditFunction(str) {
    let type = 'Comment'
    let newFunctionStr = ''
    if (str.startsWith("update(") || str.startsWith("updateRow(")) type = 'Update'
    if (str.startsWith("insert(") || str.startsWith("insertRow(")) type = 'Insert'
    if (str.startsWith("delete(") || str.startsWith("deleteRow(")) type = 'Delete'
    if (str.startsWith("update(") || str.startsWith("insert(") || str.startsWith("delete(")) editErrorInfo.functionNameError = true
    if (type !== 'Comment') newFunctionStr = str.replace(/^(insertRow|deleteRow|updateRow|update|insert|delete)\s*/, '').trim()
    return { type, newFunctionStr }
}

/**
 * 解析函数的参数字符串，并返回参数数组
 * @param {string} str 参数字符串
 * @returns 参数数组
 */
function ParseFunctionParams(str) {
    const paramStr = str.replace(/\/\/.*$/, '').trim().replace(/^\(|\)$/g, '');
    const params = splitParams(paramStr)
    // 使用正则表达式匹配对象、字符串、数字
    const newParams = params.map(arg => {
        if (/^{.*}$/.test(arg)) {
            return handleJsonStr(arg); // 替换单引号为双引号后解析对象
        } else if (/^\d+$/.test(arg)) {
            return Number(arg); // 解析数字
        } else {
            return arg.replace(/^['"]|['"]$/g, ''); // 去除字符串的引号
        }
    });
    return newParams
}

/**
 * 分割函数的参数部分
 */
function splitParams(paramStr) {
    let params = [];
    let current = "";
    let inString = false;
    let inObject = 0; // 追踪 `{}` 作用域
    let quoteType = null;

    for (let i = 0; i < paramStr.length; i++) {
        let char = paramStr[i];
        // 处理字符串状态
        if ((char === '"' || char === "'") && paramStr[i - 1] !== '\\') {
            if (!inString) {
                inString = true;
                quoteType = char;
            } else if (char === quoteType) {
                inString = false;
            }
        }
        // 处理对象 `{}` 作用域
        if (char === '{' && !inString) inObject++;
        if (char === '}' && !inString) inObject--;
        // 遇到 `,` 只有在不在字符串和对象里的时候才分割
        if (char === ',' && !inString && inObject === 0) {
            params.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current.trim()) params.push(current.trim()); // 最后一个参数
    return params;
}

/**
 * 处理json格式的字符串
 * @param {string} str json格式的字符串
 * @returns
 */
function handleJsonStr(str) {
    const jsonStr = str.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    console.log("asasasa", str);

    return JSON5.parse(jsonStr);
}

/**
 * 处理文本内的表格编辑事件
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @returns
 */
function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    if (!parseTableEditTag(chat, mesIndex, ignoreCheck)) {
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        return
    }
    executeTableEditTag(chat, mesIndex)
    updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
}

/**
 * 解析回复中的表格编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 */
function parseTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    const { matches } = getTableEditTag(chat.mes)
    if (!ignoreCheck && !isTableEditStrChanged(chat, matches)) return false
    const functionList = handleTableEditTag(matches)
    // 寻找最近的表格数据
    const { tables, index: lastestIndex } = findLastestTableData(false, mesIndex)
    waitingTableIndex = lastestIndex
    waitingTable = copyTableList(tables)
    clearEmpty()
    // 对最近的表格执行操作
    tableEditActions = functionList.map(functionStr => new TableEditAction(functionStr))
    dryRunExecuteTableEditTag()
    return true
}

/**
 * 执行回复中得编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    // 执行action
    waitingTable.forEach(table => table.clearInsertAndUpdate())
    tableEditActions.filter(action => action.able && action.type !== 'Comment').forEach(tableEditAction => tableEditAction.execute())
    clearEmpty()
    replaceTableEditTag(chat, getTableEditActionsStr())
    chat.dataTable = waitingTable
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
    waitingTable.forEach(table => table.dryRun(tableEditActions))
}

/**
 * 获取生成的操作函数字符串
 * @returns 生成的操作函数字符串
 */
function getTableEditActionsStr() {
    const tableEditActionsStr = tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n')
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n'
}

/**
 * 替换聊天中的TableEdit标签内的内容
 * @param {*} chat 聊天对象
 */
function replaceTableEditTag(chat, newContent) {
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
    getContext().saveChat();
}

/**
 * 获取在干运行中collection中排序的真实消息索引（未使用）
 * @param {*} identifier
 * @param {*} collection
 * @returns
 */
function getRealIndexInCollectionInDryRun(identifier, collection) {
    const newCollection = collection.filter(Boolean).filter(item => item.collection && item.collection.length !== 0)
    let index = 0
    for (let i in newCollection) {
        if (newCollection[i].identifier === identifier) break
        const newMes = newCollection[i].collection.filter((mes) => mes.content !== '')
        index += newMes.length
    }
    return index
}

/**
 * 获取在collection中排序的真实消息索引（未使用）
 * @param {*} identifier
 * @param {*} collection
 * @returns
 */
function getRealIndexInCollection(identifier, collection) {
    const excludeList = ['newMainChat', 'newChat', 'groupNudge'];
    const shouldSquash = (message) => {
        return !excludeList.includes(message.identifier) && message.role === 'system' && !message.name;
    };
    let index = 0
    let isSquash = false
    for (let i in collection) {
        if (collection[i].identifier === identifier) break
    }
    return index
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (extension_settings.muyoo_dataTable.injection_mode) {
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
        updateSystemMessageTableStatus(eventData);   // 将表格数据状态更新到系统消息中
        if (eventData.dryRun === true || extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isAiReadTable === false) return

        const promptContent = initTableData()
        if (extension_settings.muyoo_dataTable.deep === 0)
            eventData.chat.push({ role: getMesRole(), content: promptContent })
        else
            eventData.chat.splice(-extension_settings.muyoo_dataTable.deep, 0, { role: getMesRole(), content: promptContent })
    } catch (error) {
        // 获取堆栈信息
        const stack = error.stack;
        let lineNumber = '未知行';
        if (stack) {
            // 尝试从堆栈信息中提取行号，这里假设堆栈信息格式是常见的格式，例如 "at functionName (http://localhost:8080/file.js:12:34)"
            const match = stack.match(/:(\d+):/); // 匹配冒号和数字，例如 ":12:"
            if (match && match[1]) {
                lineNumber = match[1] + '行';
            } else {
                // 如果无法提取到行号，则显示完整的堆栈信息，方便调试
                lineNumber = '行号信息提取失败，堆栈信息：' + stack;
            }
        }

        toastr.error(`记忆插件：表格数据注入失败\n原因：${error.message}\n位置：第${lineNumber}`);
    }
    console.log("注入表格总体提示词", eventData.chat)
    /* console.log("dryRun", eventData.dryRun)
    console.log("chatCompletionPromptReady", promptManager)
    const prompts = promptManager.getPromptCollection();
    const systemPrompt = { role: 'system', content: promptContent, identifier: 'groupNudge' }
    const markerIndex = prompts.index("tableData");
    const newPrompt = promptManager.preparePrompt(systemPrompt);
    const message = await Message.fromPromptAsync(newPrompt);
    const messageCollection = new MessageCollection("tableData", message)
    if (promptManager.messages.collection[markerIndex] == null) promptManager.messages.collection[markerIndex] = messageCollection;
    if (false === eventData.dryRun) promptManager.render(false)
    const realIndex = getRealIndexInCollectionInDryRun('tableData', promptManager.messages.collection)
    eventData.chat.splice(realIndex, 0, { role: "system", content: promptContent }) */
}

/**
 * 格式化深度设置
 */
function formatDeep() {
    extension_settings.muyoo_dataTable.deep = Math.abs(extension_settings.muyoo_dataTable.deep)
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
function getTableEditTag(mes) {
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
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    if (extension_settings.muyoo_dataTable.step_by_step === true) {

    } else {
        const chat = getContext().chat[this_edit_mes_id]
        if (chat.is_user === true ||extension_settings.muyoo_dataTable.isAiWriteTable === false) return
        try {
            handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
        } catch (error) {
            toastr.error("记忆插件：表格编辑失败\n原因：", error.message)
        }
    }
}

/**
 * 消息接收时触发
 * @param {number} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    if (extension_settings.muyoo_dataTable.step_by_step === true) {
        await TableTwoStepSummary();
    } else {
        if (extension_settings.muyoo_dataTable.isAiWriteTable === false) return
        const chat = getContext().chat[chat_id];
        console.log("收到消息", chat_id)
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            toastr.error("记忆插件：表格自动更改失败\n原因：", error.message)
        }
    }
}

/**
 * 执行两步总结
 * */
async function TableTwoStepSummary() {
    console.log("执行两步总结")
    if (extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.step_by_step === false) return
    const chat = getContext().chat;
    const currentChat = chat[chat.length - 1];
    if (currentChat.is_user === true) return
    if (currentChat.enabledTwoStepSummary === true) {
        console.log("当前消息已执行两步总结")
        return;
    }
    await refreshTableActions(true, true);
    currentChat.enabledTwoStepSummary = true;
}

/**
 * 打开表格编辑历史记录弹窗
 * */
async function openTableHistoryPopup(){
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'history');
    const tableHistoryPopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const tableEditHistory = getContext().chat;
    const $dlg = $(tableHistoryPopup.dlg);
    const $tableHistory = $dlg.find('#tableHistory');
    $tableHistory.empty();
    console.log(tableEditHistory);

    if (tableEditHistory && tableEditHistory.length > 0) {
        // 倒序遍历聊天记录，从最新的消息开始处理
        for (let i = tableEditHistory.length - 1; i >= 0; i--) {
            const item = tableEditHistory[i];
            // 过滤掉用户消息
            if (!item.is_user) {
                const mesContent = item.mes;
                // 解析消息内容，提取表格编辑信息
                if (mesContent) {
                    const tableEditMatch = mesContent.match(/<tableEdit>(.*?)<\/tableEdit>/s);
                    // 如果匹配到表格编辑信息
                    if (tableEditMatch) {
                        const tableEditBlock = tableEditMatch[1].trim();
                        const commentMatch = tableEditBlock.match(/<!--(.*?)-->/s);
                        // 如果匹配到注释信息
                        if (commentMatch) {
                            const commentContent = commentMatch[1].trim();
                            const functions = commentContent.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.startsWith('insertRow') || line.startsWith('updateRow') || line.startsWith('deleteRow'));
                            // 处理函数列表
                            if (functions.length > 0) {
                                const $historyGroup = $('<div>').addClass('history-group');
                                // 如果不是最后一条消息，添加可折叠 class
                                if (i < tableEditHistory.length - 1) {
                                    $historyGroup.addClass('collapsible-history-group');
                                }
                                // 在 history-group 级别创建原始消息按钮 和 折叠按钮
                                const $buttonGroup = $('<div>').addClass('history-button-group'); // 创建按钮组容器
                                const $originalButton = $('<button><i class="fa-solid fa-quote-left"></i>')
                                    .addClass('original-message-button')
                                    .on('click', function(e) {
                                        e.stopPropagation(); // 阻止事件冒泡
                                        const $currentHistoryGroup = $(this).closest('.history-group');
                                        const $originalMessageDisplay = $currentHistoryGroup.find('.original-message-display');

                                        if ($originalMessageDisplay.is(':visible')) {
                                            // 如果原始消息当前是显示的，切换回表格视图
                                            $originalMessageDisplay.hide();
                                            $currentHistoryGroup.find('.history-item').show();
                                            $currentHistoryGroup.find('.params-table').show(); // 确保参数表格也显示出来
                                        } else {
                                            // 如果原始消息当前是隐藏的，显示原始消息
                                            $currentHistoryGroup.find('.history-item').hide();
                                            $currentHistoryGroup.find('.params-table').hide();
                                            if ($originalMessageDisplay.length === 0) { // 避免重复添加
                                                const $newMessageDisplay = $('<div>').addClass('original-message-display').text(`原始消息内容:\n\n${mesContent}`);
                                                $currentHistoryGroup.append($newMessageDisplay); // 添加原始消息展示
                                            } else {
                                                $originalMessageDisplay.show(); // 如果已存在则显示
                                            }
                                        }
                                    });
                                const $collapseButton = $('<button><i class="fa-solid fa-square-caret-down"></i></button>')
                                    .addClass('collapse-button')
                                    .on('click', function(e) {
                                        e.stopPropagation(); // 阻止事件冒泡
                                        const $currentHistoryGroup = $(this).closest('.history-group');
                                        const $paramsTable = $currentHistoryGroup.find('.params-table');
                                        const $indexPreview = $currentHistoryGroup.find('.index-preview'); // 获取预览元素
                                        const $icon = $(this).find('i');

                                        $paramsTable.slideToggle();
                                        $indexPreview.slideToggle(); // 同时切换预览元素的显示

                                        if ($paramsTable.is(':visible')) {
                                            $icon.removeClass('fa-square-caret-down').addClass('fa-square-caret-up');
                                        } else {
                                            $icon.removeClass('fa-square-caret-up').addClass('fa-square-caret-down');
                                        }
                                    });
                                $buttonGroup.append($collapseButton); // 将折叠按钮添加到按钮组
                                $buttonGroup.append($originalButton); // 将原始消息按钮添加到按钮组
                                $historyGroup.append($buttonGroup); // 将按钮组添加到 history-group

                                functions.forEach((func, funcIndex) => { // functions.forEach 添加 index
                                    const isValidFormat = validateFunctionFormat(func);
                                    const $funcItem = $('<div>').addClass('history-item');
                                    const $leftRectangle = $('<div>').addClass('left-rectangle');
                                    if (isValidFormat) {
                                        const funcDetails = parseFunctionDetails(func);
                                        const $itemIndex = $('<div>').addClass('item-index').text(`${funcIndex}`);
                                        const renderResult = renderParamsTable(funcDetails.name, funcDetails.params); // 获取 renderParamsTable 的返回结果
                                        const $paramsTable = renderResult.$table; // 从返回结果中获取 $table
                                        const indexData = renderResult.indexData; // 从返回结果中获取 indexData
                                        const funcIcon = renderWithType();

                                        // 根据函数类型添加不同的背景色和图标
                                        function renderWithType() {
                                            if (func.startsWith('insertRow')) {
                                                $leftRectangle.addClass('insert-item');
                                                return `<i class="fa-solid fa-plus"></i>`;
                                            } else if (func.startsWith('updateRow')) {
                                                $leftRectangle.addClass('update-item');
                                                return `<i class="fa-solid fa-pen"></i>`;
                                            } else if (func.startsWith('deleteRow')) {
                                                $leftRectangle.addClass('delete-item');
                                                return `<i class="fa-solid fa-trash"></i>`;
                                            }
                                            return '';
                                        }
                                        $funcItem.append($leftRectangle);
                                        $funcItem.append($itemIndex); // 将序号添加到 history-item 的最前面
                                        $funcItem.append($paramsTable);

                                        if (i < tableEditHistory.length - 1) $paramsTable.hide();   // 如果是可折叠的 history-group，初始隐藏参数表格
                                    } else {
                                        // 添加序号 div，即使是错误格式也添加序号
                                        const $itemIndex = $('<div>').addClass('item-index').addClass('error-index').text(`${funcIndex}`); // 错误格式序号添加 error-index class
                                        $funcItem.addClass('error-item');
                                        $funcItem.append($itemIndex);
                                        $funcItem.append($('<div>').addClass('function-name error-function').text('Error Format: ' + func));
                                    }
                                    $historyGroup.append($funcItem);
                                });
                                $tableHistory.prepend($historyGroup);
                            } else {
                                $tableHistory.append($('<p>').text('注释信息中没有匹配到有效的表格编辑函数。'));
                            }
                        } else {
                            $tableHistory.append($('<p>').text('表格编辑标签中没有匹配到注释信息。'));
                        }
                    } else {
                        $tableHistory.append($('<p>').text('本轮对话消息中没有发现表格编辑标签。'));
                    }
                } else {
                    $tableHistory.append($('<p>').text('没有找到可解析的消息内容。'));
                }
            }
        }
        if ($tableHistory.is(':empty')) {
            $tableHistory.append($('<p>').text('没有找到数据表编辑历史。'));
        }
    } else {
        $tableHistory.append($('<p>').text('聊天记录为空，无法查看数据表编辑历史。'));
    }
    setTimeout(() => {
        // 确保在 DOM 更新后执行滚动到底部
        $tableHistory.scrollTop($tableHistory[0].scrollHeight);
    }, 0);

    await tableHistoryPopup.show();
}

/**
 * 验证函数字符串格式是否正确
 * @param {string} funcStr 函数字符串
 * @returns {boolean} true 如果格式正确，false 否则
 */
function validateFunctionFormat(funcStr) {
    const trimmedFuncStr = funcStr.trim();
    if (!(trimmedFuncStr.startsWith('insertRow') || trimmedFuncStr.startsWith('updateRow') || trimmedFuncStr.startsWith('deleteRow'))) {
        return false;
    }

    const functionName = trimmedFuncStr.split('(')[0];
    const paramsStr = trimmedFuncStr.substring(trimmedFuncStr.indexOf('(') + 1, trimmedFuncStr.lastIndexOf(')'));
    const params = parseFunctionDetails(trimmedFuncStr).params; // Reuse parseFunctionDetails to get params array

    if (functionName === 'insertRow') {
        if (params.length !== 2) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'object' || params[1] === null) return false;
        for (const key in params[1]) {
            if (params[1].hasOwnProperty(key) && isNaN(Number(key))) return false;
        }
    } else if (functionName === 'updateRow') {
        if (params.length !== 3) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'number') return false;
        if (typeof params[2] !== 'object' || params[2] === null) return false;
        for (const key in params[2]) {
            if (params[2].hasOwnProperty(key) && isNaN(Number(key))) return false;
        }
    } else if (functionName === 'deleteRow') {
        if (params.length !== 2) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'number') return false;
    }
    return true;
}


/**
 * 解析函数调用字符串，提取函数名和参数 (JSON 感知)
 * @param {string} funcStr 函数调用字符串
 * @returns {object} 包含函数名和参数的对象，参数为数组
 */
function parseFunctionDetails(funcStr) {
    const nameMatch = funcStr.match(/^(insertRow|updateRow|deleteRow)\(/);
    const name = nameMatch ? nameMatch[1] : funcStr.split('(')[0];
    let paramsStr = funcStr.substring(funcStr.indexOf('(') + 1, funcStr.lastIndexOf(')'));
    let params = [];

    if (paramsStr) {
        let currentParam = '';
        let bracketLevel = 0;
        let quoteLevel = 0;

        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];

            if (quoteLevel === 0 && char === '{') {
                bracketLevel++;
                currentParam += char;
            } else if (quoteLevel === 0 && char === '}') {
                bracketLevel--;
                currentParam += char;
            } else if (quoteLevel === 0 && char === ',' && bracketLevel === 0) {
                params.push(parseParamValue(currentParam.trim()));
                currentParam = '';
            } else if (quoteLevel === 0 && (char === '"' || char === "'")) {
                quoteLevel = (char === '"' ? 2 : 1);
                currentParam += char;
            } else if (quoteLevel !== 0 && char === (quoteLevel === 2 ? '"' : "'") && paramsStr[i-1] !== '\\') {
                quoteLevel = 0;
                currentParam += char;
            }
            else {
                currentParam += char;
            }
        }
        if (currentParam.trim()) {
            params.push(parseParamValue(currentParam.trim()));
        }
    }
    return { name, params };
}

/**
 * 解析参数值，尝试解析为数字或 JSON，否则作为字符串返回
 * @param {string} paramStr 参数字符串
 * @returns {any} 解析后的参数值
 */
function parseParamValue(paramStr) {
    const trimmedParam = paramStr.trim();
    const num = Number(trimmedParam);
    if (!isNaN(num)) {
        return num;
    }
    if (trimmedParam.startsWith('{') && trimmedParam.endsWith('}')) {
        try {
            return JSON5.parse(trimmedParam);
        } catch (e) {
            // JSON 解析失败，返回原始字符串 (可能不是有效的 JSON 字符串)
        }
    }
    if (trimmedParam.startsWith('"') && trimmedParam.endsWith('"') || trimmedParam.startsWith("'") && trimmedParam.endsWith("'")) {
        return trimmedParam.slice(1, -1);
    }
    return trimmedParam;
}

/**
 * 渲染参数表格，根据函数类型进行优化显示
 * @param {string} functionName 函数名 (insertRow, updateRow, deleteRow)
 * @param {array} params 参数数组
 * @returns {object} 包含参数表格和 index 数据的对象
 */
function renderParamsTable(functionName, params) {
    const $table = $('<table>').addClass('params-table');
    const $tbody = $('<tbody>');
    let indexData = {}; // 用于存储 index 数据的对象

    // 提取公共的 Table Index 和 Row Index 添加逻辑
    const addIndexRows = (tableIndex, rowIndex) => {
        if (typeof tableIndex === 'number') {
            $tbody.append($('<tr>').append($('<th style="color: #82e8ff; font-weight: bold;">').text('#')).append($('<td>').text(tableIndex, ))); // 加粗
            indexData.tableIndex = tableIndex; // 存储 tableIndex
        }
        if (typeof rowIndex === 'number') {
            $tbody.append($('<tr>').append($('<th style="color: #82e8ff; font-weight: bold;">').text('^')).append($('<td>').text(rowIndex))); // 加粗
            indexData.rowIndex = rowIndex; // 存储 rowIndex
        }
    };

    if (functionName === 'insertRow') {
        // insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
        const tableIndex = params[0];
        const data = params[1];

        if (typeof tableIndex === 'number' && data && typeof data === 'object') {
            addIndexRows(tableIndex, tableIndex); // 仅添加 Table Index
            for (const colIndex in data) {
                if (data.hasOwnProperty(colIndex)) {
                    const value = data[colIndex];
                    $tbody.append($('<tr>').append($('<th>').text(`${colIndex}`)).append($('<td>').text(value)));
                }
            }
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else if (functionName === 'updateRow') {
        // updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
        const tableIndex = params[0];
        const rowIndex = params[1];
        const data = params[2];

        if (typeof tableIndex === 'number' && typeof rowIndex === 'number' && data && typeof data === 'object') {
            addIndexRows(tableIndex, rowIndex); // 添加 Table Index 和 Row Index
            for (const colIndex in data) {
                if (data.hasOwnProperty(colIndex)) {
                    const value = data[colIndex];
                    $tbody.append($('<tr>').append($('<th>').text(`${colIndex}`)).append($('<td>').text(value)));
                }
            }
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else if (functionName === 'deleteRow') {
        // deleteRow(tableIndex:number, rowIndex:number)
        const tableIndex = params[0];
        const rowIndex = params[1];

        if (typeof tableIndex === 'number' && typeof rowIndex === 'number') {
            addIndexRows(tableIndex, rowIndex); // 添加 Table Index 和 Row Index
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else {
        $tbody.append(createRawParamsRow(params));
    }

    $table.append($tbody);
    return { $table, indexData }; // 返回包含 $table 和 indexData 的对象
}

/**
 * 创建显示原始参数的表格行
 * @param {object} params 参数对象
 * @returns {JQuery<HTMLElement>} 包含原始参数的表格行
 */
function createRawParamsRow(params) {
    const $tr = $('<tr>');
    $tr.append($('<th>').text('Raw Parameters'));
    $tr.append($('<td>').text(JSON.stringify(params)));
    return $tr;
}






let _currentTableIndex = -1;    // +.
let _currentTablePD = null;     // +.
/**
 * +.新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
async function openTableRendererPopup() {
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'renderer');
    const tableRendererPopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const tableStructure = findTableStructureByIndex(_currentTableIndex);
    const table = findLastestTableData(true).tables[_currentTableIndex];
    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    const tableRenderContent = tableStructure?.tableRender || "";
    // $tablePreview.html(tablePreview.render().outerHTML);
    $htmlEditor.val(tableRenderContent);

    // 修改中实时渲染
    const renderHTML = () => {
        $tableRendererDisplay.html(parseTableRender($htmlEditor.val(), table));
    };
    renderHTML();
    $htmlEditor.on('input', renderHTML); // 监听 input 事件，实时渲染

    await tableRendererPopup.show();
    tableStructure.tableRender = $htmlEditor.val();
    _currentTablePD.find('#dataTable_tableSetting_tableRender').val($htmlEditor.val());
}

/**
 * 打开表格设置弹窗
 * @param {number} tableIndex 表格索引
 */
async function openTableSettingPopup(tableIndex) {
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'setting');
    const tableSettingPopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, allowVerticalScrolling: true });
    const tableStructure = findTableStructureByIndex(tableIndex);
    const $dlg = $(tableSettingPopup.dlg);
    const $tableName = $dlg.find('#dataTable_tableSetting_tableName');
    const $note = $dlg.find('#dataTable_tableSetting_note');
    const $initNote = $dlg.find('#dataTable_tableSetting_initNode');
    const $updateNode = $dlg.find('#dataTable_tableSetting_updateNode');
    const $insertNode = $dlg.find('#dataTable_tableSetting_insertNode');
    const $deleteNode = $dlg.find('#dataTable_tableSetting_deleteNode');
    const $required = $dlg.find('#dataTable_tableSetting_required');
    const $toChat = $dlg.find('#dataTable_tableSetting_toChat');        // +.新增发送到聊天，当开启时该表格发送到聊天
    const $tableRender = $dlg.find('#dataTable_tableSetting_tableRender');  // +.新增该表格的自定义html渲染
    _currentTablePD = $dlg;     // +.新增，保存当前弹窗
    $tableName.val(tableStructure.tableName);
    $note.val(tableStructure.note);
    $initNote.val(tableStructure.initNode);
    $updateNode.val(tableStructure.updateNode);
    $insertNode.val(tableStructure.insertNode);
    $deleteNode.val(tableStructure.deleteNode);
    $required.prop('checked', tableStructure.Required);
    $toChat.prop('checked', tableStructure.toChat ?? false);     // +.
    $tableRender.val(tableStructure.tableRender);       // +.
    _currentTableIndex = tableIndex;    // +.
    const changeEvent = (name, value) => {
        tableStructure[name] = value.trim();
    };
    $tableName.on('change', function () { changeEvent("tableName", $(this).val()); });
    $note.on('change', function () { changeEvent("note", $(this).val()); });
    $initNote.on('change', function () { changeEvent("initNode", $(this).val()); });
    $updateNode.on('change', function () { changeEvent("updateNode", $(this).val()); });
    $insertNode.on('change', function () { changeEvent("insertNode", $(this).val()); });
    $deleteNode.on('change', function () { changeEvent("deleteNode", $(this).val()); });
    $required.on('change', function () { tableStructure.Required = $(this).prop('checked'); });
    $toChat.on('change', function () { tableStructure.toChat = $(this).prop('checked'); });         // +.
    $tableRender.on('change', function () { changeEvent("tableRender", $(this).val()); });      // +.
    await tableSettingPopup.show();
    console.log("保持", extension_settings.muyoo_dataTable.tableStructure);
    saveSettingsDebounced();
    renderSetting();
    updateSystemMessageTableStatus();
}

/**
 * 打开表格展示/编辑弹窗
 * @param {number} mesId 需要打开的消息ID，-1为最新一条
 */
async function openTablePopup(mesId = -1) {
    const manager = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'manager');
    tablePopup = new Popup(manager, POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    // 是否可编辑
    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    const tableEditTips = tablePopup.dlg.querySelector('#tableEditTips');
    const tableRefresh = tablePopup.dlg.querySelector('#table_clear_up_button');

    $(tableContainer).on('click', hideAllEditPanels)
    $(tableRefresh).on('click', refreshTableActions)
    // 设置编辑提示
    setTableEditTips(tableEditTips)
    // 开始寻找表格
    const { tables, index } = findLastestTableData(true, mesId)
    userTableEditInfo.chatIndex = index
    userTableEditInfo.tables = tables
    // 获取action信息
    if (userTableEditInfo.editAble && index !== -1 && (!waitingTableIndex || waitingTableIndex !== index)) {
        parseTableEditTag(getContext().chat[index], -1, true)
    }

    // 渲染
    renderTablesDOM(userTableEditInfo.tables, tableContainer, userTableEditInfo.editAble)
    // 拷贝粘贴
    const copyTableButton = tablePopup.dlg.querySelector('#copy_table_button');
    const pasteTableButton = tablePopup.dlg.querySelector('#paste_table_button');
    const clearTableButton = tablePopup.dlg.querySelector('#clear_table_button');
    const importTableButton = tablePopup.dlg.querySelector('#import_clear_up_button');
    const exportTableButton = tablePopup.dlg.querySelector('#export_table_button');
    if (!userTableEditInfo.editAble) $(pasteTableButton).hide()
    else pasteTableButton.addEventListener('click', () => pasteTable(index, tableContainer))
    copyTableButton.addEventListener('click', () => copyTable(tables))
    clearTableButton.addEventListener('click', () => clearTable(index, tableContainer))
    importTableButton.addEventListener('click', () => importTable(index, tableContainer))
    exportTableButton.addEventListener('click', () => exportTable(tables))
    await tablePopup.show()
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    const tips = $(tableEditTips)
    tips.empty()
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) {
        tips.append('目前插件已关闭，将不会要求AI更新表格。')
        tips.css("color", "rgb(211 39 39)")
    } else if (userTableEditInfo.editAble) {
        tips.append('点击单元格选择编辑操作。绿色单元格为本轮插入，蓝色单元格为本轮修改。')
        tips.css("color", "lightgreen")
    } else {
        tips.append('此表格为中间表格，为避免混乱，不可被编辑和粘贴。你可以打开最新消息的表格进行编辑')
        tips.css("color", "lightyellow")
    }
}

/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} tables 所有表格数据
 * @param {Element} tableContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
function renderTablesDOM(tables = [], tableContainer, isEdit = false) {
    $(tableContainer).empty()
    if (isEdit) {
        const tableToolbar = $(tableEditToolbarDom)
        const tableHeaderToolbar = $(tableHeaderEditToolbarDom)
        tableToolbar.on('click', '#deleteRow', onDeleteRow)
        tableToolbar.on('click', '#editCell', onModifyCell)
        tableToolbar.on('click', '#insertRow', onInsertRow)
        tableHeaderToolbar.on('click', '#insertRow', onInsertFirstRow)
        $(tableContainer).append(tableToolbar)
        $(tableContainer).append(tableHeaderToolbar)
    }
    for (let table of tables) {
        $(tableContainer).append(table.render()).append(`<hr />`)
    }
}

/**
 * 删除行事件
 */
async function onDeleteRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接修改', result: 3 }
    const result = await callGenericPopup("请选择删除方式<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI删除", cancelButton: "取消", customButtons: [button] })
    if (result) {
        // 伪装修改
        if (result !== 3) {
            if (!table.insertedRows || !table.updatedRows)
                return toastr.error("由于旧数据兼容性问题，请再聊一次后再使用此功能")
            findAndDeleteActionsForDelete()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.delete(userTableEditInfo.rowIndex)
        }
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        getContext().saveChat()
        toastr.success('已删除')
    }
}

/**
 * 修改单元格事件
 */
async function onModifyCell() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const cellValue = table.getCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex)
    const button = { text: '直接修改', result: 3 }
    const tableEditPopup = new Popup("注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.INPUT, cellValue, { okButton: "伪装为AI修改", cancelButton: "取消", customButtons: [button], rows: 5 });
    const newValue = await tableEditPopup.show()
    if (newValue) {
        const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
        // 伪装修改
        if (tableEditPopup.result !== 3) {
            findAndEditOrAddActionsForUpdate(newValue)
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.setCellValue(userTableEditInfo.rowIndex, userTableEditInfo.colIndex, newValue)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        getContext().saveChat()
        toastr.success('已修改')
    }
}

/**
 * 寻找actions中是否有与修改值相关的行动，有则修改
 */
function findAndEditOrAddActionsForUpdate(newValue) {
    let haveAction = false
    tableEditActions.forEach((action) => {
        if (action.type === 'Update' || action.type === 'Insert') {
            if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
                action.data[userTableEditInfo.colIndex] = newValue
                haveAction = true
            }
        }
    })
    if (!haveAction) {
        const newAction = new TableEditAction()
        const data = {}
        data[userTableEditInfo.colIndex] = newValue
        newAction.setActionInfo("Update", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, data)
        tableEditActions.push(newAction)
    }
}

/**
 * 寻找actions中是否有与删除值相关的行动，有则删除
 */
function findAndDeleteActionsForDelete() {
    let haveAction = false
    tableEditActions.forEach(action => {
        if (action.tableIndex === userTableEditInfo.tableIndex && action.rowIndex === userTableEditInfo.rowIndex) {
            action.able = false
            haveAction = true
            if (action.type === 'Update') {
                const newAction = new TableEditAction()
                newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
                tableEditActions.push(newAction)
            }
        }
    })
    tableEditActions = tableEditActions.filter(action => action.able)
    if (!haveAction) {
        const newAction = new TableEditAction()
        newAction.setActionInfo("Delete", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex)
        tableEditActions.push(newAction)
    }
}

/**
 * 在actions中插入值
 */
function addActionForInsert() {
    const newAction = new TableEditAction()
    newAction.setActionInfo("Insert", userTableEditInfo.tableIndex, userTableEditInfo.rowIndex, {})
    tableEditActions.push(newAction)
}


/**
 * 下方插入行事件
 */
async function onInsertRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.insertEmptyRow(userTableEditInfo.rowIndex + 1)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        getContext().saveChat()
        toastr.success('已插入')
    }
}

/**
 * 首行插入事件
 */
async function onInsertFirstRow() {
    const table = userTableEditInfo.tables[userTableEditInfo.tableIndex]
    const button = { text: '直接插入', result: 3 }
    const result = await callGenericPopup("请选择插入方式，目前伪装插入只能插入在表格底部<br/>注意：如果你本轮需要使用直接和伪装两种方式，请先做完所有伪装操作，再做直接操作，以避免表格混乱", POPUP_TYPE.CONFIRM, "", { okButton: "伪装为AI插入", cancelButton: "取消", customButtons: [button] })
    const tableContainer = tablePopup.dlg.querySelector('#tableContainer');
    if (result) {
        // 伪装输出
        if (result !== 3) {
            addActionForInsert()
            const chat = getContext().chat[userTableEditInfo.chatIndex]
            replaceTableEditTag(chat, getTableEditActionsStr())
            handleEditStrInMessage(getContext().chat[userTableEditInfo.chatIndex], -1)
            userTableEditInfo.tables = waitingTable
        } else {
            table.insertEmptyRow(0)
        }
        renderTablesDOM(userTableEditInfo.tables, tableContainer, true)
        updateSystemMessageTableStatus();
        getContext().saveChat()
        toastr.success('已插入')
    }
}

/**
 * 滑动切换消息事件
 */
async function onMessageSwiped(chat_id) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false) return
    if (extension_settings.muyoo_dataTable.step_by_step === true) {
        await TableTwoStepSummary();
    } else {
        if (extension_settings.muyoo_dataTable.isAiWriteTable === false) return
        const chat = getContext().chat[chat_id];
        if (!chat.swipe_info[chat.swipe_id]) return
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            toastr.error("记忆插件：swipe切换失败\n原因：", error.message)
        }
    }
}

async function updateTablePlugin() {

}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
async function copyTable(tables = []) {
    copyTableData = JSON.stringify(tables)
    toastr.success('已复制')
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function pasteTable(mesId, tableContainer) {
    if (mesId === -1) {
        toastr.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await callGenericPopup('粘贴会清空原有的表格数据，是否继续？', POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            checkPrototype(tables)
            getContext().chat[mesId].dataTable = tables
            renderTablesDOM(tables, tableContainer, true)
            updateSystemMessageTableStatus();
            toastr.success('粘贴成功')
        } else {
            toastr.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, tableContainer) {
    if (mesId === -1) {
        toastr.error("请至少让ai回复一条消息作为表格载体")
        return
    }

    // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
    fileInput.accept = '.json';

    // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
    fileInput.addEventListener('change', function(event) {
        // 获取用户选择的文件列表 (FileList 对象)
        const files = event.target.files;

        // 检查是否选择了文件
        if (files && files.length > 0) {
            // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
            const file = files[0];

            // 3. 创建 FileReader 对象，用于读取文件内容
            const reader = new FileReader();

            // 4. 定义 FileReader 的 onload 事件处理函数
            // 当文件读取成功后，会触发 onload 事件
            reader.onload = function(loadEvent) {
                // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
                const fileContent = loadEvent.target.result;

                try {
                    // 5. 尝试解析 JSON 数据
                    const tables = JSON.parse(fileContent)
                    checkPrototype(tables)
                    getContext().chat[mesId].dataTable = tables
                    renderTablesDOM(tables, tableContainer, true)
                    updateSystemMessageTableStatus();
                    toastr.success('导入成功')
                } catch (error) {
                    // 7. 捕获 JSON 解析错误，并打印错误信息
                    console.error("JSON 解析错误:", error);
                    alert("JSON 文件解析失败，请检查文件格式是否正确。");
                }
            };

            reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable(tables = []) {
    if (!tables || tables.length === 0) {
        toastr.warning('当前表格没有数据，无法导出');
        return;
    }

    const jsonTables = JSON.stringify(tables, null, 2); // 使用 2 空格缩进，提高可读性
    const blob = new Blob([jsonTables], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // 默认文件名
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    toastr.success('已导出');
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function clearTable(mesId, tableContainer) {
    if (mesId === -1) return
    const confirmation = await callGenericPopup('清空此条的所有表格数据，是否继续？', POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        const emptyTable = initAllTable()
        getContext().chat[mesId].dataTable = emptyTable
        renderTablesDOM(emptyTable, tableContainer, true)
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        toastr.success('清空成功')
    }
}

/**
 * +.解析html，将其中代表表格单元格的\$\w\d+字符串替换为对应的表格单元格内容
 * 对于任意\$\w\d+字符串，其中\w为表格的列数，\d+为表格的行数，例如$B3表示表格第二列第三行的内容，行数从header行开始计数，header行为0
 * */
function parseTableRender(html, table) {
    if (!html) {
        return table.render(); // 如果html为空，则直接返回
    }
    if (!table || !table.content || !table.columns) return html;
    html = html.replace(/\$(\w)(\d+)/g, function (match, colLetter, rowNumber) {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0); // 将列字母转换为列索引 (A=0, B=1, ...)
        const rowIndex = parseInt(rowNumber);
        const r = `<span style="color: red">无单元格</span>`;
        try {
            return rowIndex === 0
                ? table.columns[colIndex]                   // 行数从header行开始计数，header行为0
                : table.content[rowIndex - 1][colIndex];    // content的行数从1开始
        } catch (error) {
            console.error(`Error parsing cell ${match}:`, error);
            return r;
        }
    });
    return html;
}

/**
 * +.将table数据推送至聊天内容中显示
 * @param tableStatusHTML 表格状态html
 */
function replaceTableToStatusTag(tableStatusHTML) {
    const r = extension_settings.muyoo_dataTable.to_chat_container.replace(/\$0/g, `<tableStatus>${tableStatusHTML}</tableStatus>`);
    const chatContainer = window.document.querySelector('#chat');
    let tableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');

    // 定义具名的事件监听器函数
    const touchstartHandler = function(event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function(event) {
        event.stopPropagation();
    };
    const touchendHandler = function(event) {
        event.stopPropagation();
    };

    setTimeout(() => {
        if (tableStatusContainer) {
            // 移除之前的事件监听器，防止重复添加 (虽然在这个场景下不太可能重复添加)
            tableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            tableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            tableStatusContainer.removeEventListener('touchend', touchendHandler);
            chatContainer.removeChild(tableStatusContainer); // 移除旧的 tableStatusContainer
        }
        chatContainer.insertAdjacentHTML('beforeend', `<div class="wide100p" id="tableStatusContainer">${r}</div>`);
        // 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // 添加事件监听器，使用具名函数
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        // 更新 tableStatusContainer 变量指向新的元素，以便下次移除
        tableStatusContainer = newTableStatusContainer;
    }, 0);
}

/**
 * +.更新最后一条 System 消息的 <tableStatus> 标签内容
 */
function updateSystemMessageTableStatus(eventData) {
    if (extension_settings.muyoo_dataTable.isExtensionAble === false || extension_settings.muyoo_dataTable.isTableToChat === false) {
        window.document.querySelector('#tableStatusContainer')?.remove();
        return;
    }

    const tables = findLastestTableData(true).tables;
    let tableStatusHTML = '';
    for (let i = 0; i < tables.length; i++) {
        const structure = findTableStructureByIndex(i);
        if (!structure.enable || !structure.toChat) continue;
        // 如果有自定义渲染器，则使用自定义渲染器，否则使用默认渲染器
        tableStatusHTML += structure.tableRender
            ? parseTableRender(structure.tableRender, tables[i])
            : tables[i].render().outerHTML;
    }
    replaceTableToStatusTag(tableStatusHTML);
}

//random一个唯一id加密用
function generateUniId() {
    return `st-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// 解密
async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b =>
            parseInt(b, 16)
        );
        return String.fromCharCode(...bytes.map((b, i) =>
            b ^ deviceId.charCodeAt(i % deviceId.length)
        ));
    } catch(e) {
        console.error('解密失败:', e);
        return null;
    }
}

// api解密
async function getDecryptedApiKey() {
    try {
        const encrypted = extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const deviceId = localStorage.getItem('st_device_id');
        if (!encrypted || !deviceId) return null;

        return await decryptXor(encrypted, deviceId);
    } catch (error) {
        console.error('API Key 解密失败:', error);
        return null;
    }
}


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

function getRefreshTableConfigStatus() {
    // 显示所有相关的配置信息
    const isUseMainAPI = extension_settings.muyoo_dataTable.use_main_api;
    const userApiUrl = extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const userApiModel = extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    const userApiTemperature = extension_settings.muyoo_dataTable.custom_temperature;
    const clearUpStairs = extension_settings.muyoo_dataTable.clear_up_stairs;
    const isIgnoreDel = extension_settings.muyoo_dataTable.bool_ignore_del;
    const systemMessageTemplate = extension_settings.muyoo_dataTable.refresh_system_message_template;
    const userMessageTemplate = extension_settings.muyoo_dataTable.refresh_user_message_template;

    return `<div class="wide100p padding5 dataBankAttachments">
                <span>将重新整理表格，是否继续？</span><br><span style="color: rgb(211 39 39)">（建议重置前先备份数据）</span>
                <br><div id="config_sheet_container" style="justify-content: center; display: flex; margin: 10px;">
                    <table class="table table-bordered table-striped">
                        <thead><tr><th>配置项</th><th style="padding: 0 20px">配置值</th></tr></thead>
                        <tbody>
                        <tr> <td>纳入参考的聊天记录</td> <td>${clearUpStairs}条</td> </tr>
                        <tr> <td>不允许AI删除</td> <td>${isIgnoreDel ? '是' : '否'}</td> </tr>
                        <tr> <td>使用的API</td> <td>${isUseMainAPI ? '主API' : '自定义API'}</td> </tr>
                        ${isUseMainAPI ? '' : `
                        <tr> <td>API URL</td> <td>${userApiUrl}</td> </tr>
                        <tr> <td>API Model</td> <td>${userApiModel}</td> </tr>
                        <tr> <td>Temperature</td> <td>${userApiTemperature}</td> </tr>
                        `}
                        </tbody>
                    </table>
                </div>
            </div>
`;}

function confirmTheOperationPerformed(content) {
    return `
<div class="wide100p padding5 dataBankAttachments">
    <div class="refresh-title-bar">
        <h2 class="refresh-title"> 请确认以下操作 </h2>
        <div>

        </div>
    </div>
    <div id="tableRefresh" class="refresh-scroll-content">
        <div>
            <div class="operation-list-container"> ${content.map(action => {
                const { action: type, tableIndex, rowIndex, data } = action;
                return `<div class="operation-item">
                        <div class="operation-detail">
                            <span class="detail-label">操作类型:</span>
                            <span class="detail-value">${type}</span>
                        </div>
                        <div class="operation-detail">
                            <span class="detail-label">表格索引:</span>
                            <span class="detail-value">${tableIndex}</span>
                        </div>
                        <div class="operation-detail">
                            <span class="detail-label">行索引:</span>
                            <span class="detail-value">${rowIndex}</span>
                        </div>
                        <div class="operation-detail data-detail">
                            <span class="detail-label">数据:</span>
                            <div class="detail-value data-json">
                                ${typeof data === 'object' && data !== null ?
        Object.entries(data).map(([key, value]) => {
            return `<div class="json-item">
                        <span class="json-key">"${key}":</span>
                        <span class="json-value">"${value}"</span>
                    </div>`;
        }).join('')
        : `<span class="json-fallback">${JSON.stringify(data, null, 2)}</span>`
    }
                            </div>
                        </div>
                    </div>`;
}).join('')}
            </div>
        </div>
    </div>
</div>
`;
}

async function refreshTableActions(force = false, silentUpdate = false) {
    const tableRefreshPopup = (getRefreshTableConfigStatus());

    // 如果不是强制刷新，先确认是否继续
    if (!force) {
        // 显示配置状态
        const confirmation = await callGenericPopup(tableRefreshPopup, POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
        if (!confirmation) return;
    }

    // 开始执行整理表格
    let response;
    const isUseMainAPI = $('#use_main_api').prop('checked');
    const loadingToast = toastr.info(isUseMainAPI
            ? '正在使用【主API】整理表格...'
            : '正在使用【自定义API】整理表格...',
        '',
        { timeOut: 0 }
    );
    try {
        const latestData = findLastestTableData(true);
        if (!latestData || typeof latestData !== 'object' || !('tables' in latestData)) {
            throw new Error('findLastestTableData 未返回有效的表格数据');
        }
        const { tables: latestTables } = latestData;
        waitingTable = copyTableList(latestTables);

        let originText = '<表格内容>\n' + latestTables
            .map(table => table.getTableText(['title', 'node', 'headers', 'rows']))
            .join("\n");

        // 获取最近clear_up_stairs条聊天记录
        let chat = getContext().chat;
        let lastChats = '';
        if (chat.length < extension_settings.muyoo_dataTable.clear_up_stairs) {
            toastr.success(`当前聊天记录只有${chat.length}条，小于设置的${extension_settings.muyoo_dataTable.clear_up_stairs}条`);
            for (let i = 0; i < chat.length; i++) {  // 从0开始遍历所有现有消息
                let currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
                lastChats += `\n${currentChat}`;
            }
        } else {
            for (let i = Math.max(0, chat.length - extension_settings.muyoo_dataTable.clear_up_stairs); i < chat.length; i++) {
                let currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
                lastChats += `\n${currentChat}`;
            }
        }

        // 构建AI提示
        let systemPrompt = extension_settings.muyoo_dataTable.refresh_system_message_template;
        let userPrompt = extension_settings.muyoo_dataTable.refresh_user_message_template;

        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);

        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        // 生成响应内容
        let cleanContent;
        if (isUseMainAPI) {
            // 主API
            response = await generateRaw(
                userPrompt,
                '',
                false,
                false,
                systemPrompt,
            )
            console.log('原始响应内容:', response);

            // 清洗响应内容
            cleanContent = response
                .replace(/```json|```/g, '')
                .trim();
        } else {
            // 自定义API
            const USER_API_URL = extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
            const USER_API_KEY = await getDecryptedApiKey(); // 使用解密后的密钥
            const USER_API_MODEL = extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;

            if (!USER_API_URL || !USER_API_KEY || !USER_API_MODEL) {
                toastr.error('请填写完整的自定义API配置');
                return;
            }
            const apiUrl = new URL(USER_API_URL);
            apiUrl.pathname = '/v1/chat/completions';

            response = await fetch(apiUrl.href, { // <--- 使用 apiUrl.href 作为 URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${USER_API_KEY}`
                },
                body: JSON.stringify({
                    model: USER_API_MODEL,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: extension_settings.muyoo_dataTable.custom_temperature
                })
            }).catch(error => {
                throw new Error(`网络连接失败: ${error.message}`);
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API请求失败 [${response.status}]: ${errorBody}`);
            }

            const result = await response.json();
            const rawContent = result.choices[0].message.content;

            console.log('原始响应内容:', rawContent);
            // 清洗响应内容
            cleanContent = rawContent
                .replace(/```json|```/g, '') // 移除JSON代码块标记
                .replace(/([{,]\s*)(?:"?([a-zA-Z_]\w*)"?\s*:)/g, '$1"$2":') // 严格限定键名格式
                .replace(/'/g, '"') // 单引号转双引号
                .replace(/\/\*.*?\*\//g, '') // 移除块注释
                .trim();
        }

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

            // 新增安全校验
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
                const table = waitingTable[action.tableIndex];
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
        if (!silentUpdate){
            // 将uniqueActions内容推送给用户确认是否继续
            const confirmContent = confirmTheOperationPerformed(uniqueActions);
            const tableRefreshPopup = new Popup(confirmContent, POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
            toastr.clear(loadingToast);
            await tableRefreshPopup.show();
            if (!tableRefreshPopup.result) {
                toastr.info('操作已取消');
                return;
            }
        }

        // 处理用户确认的操作
        // 执行操作
        uniqueActions.forEach(action => {
            switch (action.action.toLowerCase()) {
                case 'update':
                    try {
                        const targetRow = waitingTable[action.tableIndex].content[action.rowIndex];
                        if (!targetRow || !targetRow[0]?.trim()) {
                            console.log(`Skipped update: table ${action.tableIndex} row ${action.rowIndex} 第一列为空`);
                            break;
                        }
                        updateRow(action.tableIndex, action.rowIndex, action.data);
                        console.log(`Updated: table ${action.tableIndex}, row ${action.rowIndex}`, waitingTable[action.tableIndex].content[action.rowIndex]);
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
                    if (action.tableIndex === 0 || !extension_settings.muyoo_dataTable.bool_ignore_del) {
                        const deletedRow = waitingTable[action.tableIndex].content[action.rowIndex];
                        deleteRow(action.tableIndex, action.rowIndex);
                        console.log(`Deleted: table ${action.tableIndex}, row ${action.rowIndex}`, deletedRow);
                    } else {
                        console.log(`Ignore: table ${action.tableIndex}, row ${action.rowIndex}`);
                        toastr.success('删除保护启用，已忽略了删除操作（可在插件设置中修改）');
                    }
                    break;
            }
        });

        // 更新聊天数据
        chat = getContext().chat[getContext().chat.length - 1];
        chat.dataTable = waitingTable;
        getContext().saveChat();

        // 刷新 UI
        const tableContainer = document.querySelector('#tableContainer');
        renderTablesDOM(waitingTable, tableContainer, true);

        toastr.success('表格整理完成');
    } catch (error) {
        console.error('整理过程出错:', error);
        toastr.error(`整理失败：${error.message}`);
    } finally {
        toastr.clear(loadingToast);
    }
}

async function updateModelList(){
    const apiUrl = $('#custom_api_url').val().trim();
    const apiKey = await getDecryptedApiKey();// 使用解密后的API密钥

    if (!apiKey) {
        toastr.error('API key解密失败，请重新输入API key吧！');
        return;
    }
    if (!apiUrl) {
        toastr.error('请输入API URL');
        return;
    }

    try {
        // 规范化URL路径
        const normalizedUrl = new URL(apiUrl);
        normalizedUrl.pathname = '/v1/models';

        const response = await fetch(normalizedUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`请求失败: ${response.status}`);

        const data = await response.json();
        const $selector = $('#model_selector').empty();

        data.data.forEach(model => {
            $selector.append($('<option>', {
                value: model.id,
                text: model.id
            }));
        });

        toastr.success('成功获取模型列表');
    } catch (error) {
        console.error('模型获取失败:', error);
        toastr.error(`模型获取失败: ${error.message}`);
    }
}



const openTableButtonDom = `
<div title="查看表格" class="mes_button open_table_by_id">
    表格
</div>`;

/**
 * 表格编辑浮窗
 */
const tableEditToolbarDom = `<div class="tableToolbar" id="tableToolbar">
    <button id="editCell" class="menu_button">编辑</button>
    <button id="deleteRow" class="menu_button">删除行</button>
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>`

/**
 * 表头编辑浮窗
 */
const tableHeaderEditToolbarDom = `
<div class="tableToolbar" id="tableHeaderToolbar">
    <button id="insertRow" class="menu_button">下方插入行</button>
</div>
`

/**
 * 表格重置弹出窗
 */
const tableInitPopupDom = `<span>将重置以下表格数据，是否继续？</span><br><span style="color: rgb(211 39 39)">（建议重置前先备份数据）</span>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_basic" checked><span>基础设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_message_template"><span>消息模板</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_refresh_template"><span>重新整理表格设置与消息模板</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_to_chat_container"><span>对话中的面板样式</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_structure"><span>所有表格结构数据</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_api"><span>个人API配置</span>
</div>
`


jQuery(async () => {
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) toastr.warning(res.toastrText)
            if (res.message) $("#table_message_tip").html(res.message)
        }
    })
    const html = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'index');
    const buttonHtml = await renderExtensionTemplateAsync('third-party/st-memory-enhancement', 'buttons');

    // 开始添加各部分的根DOM
    // 添加表格编辑工具栏
    $('#translation_container').append(html);
    // 添加表格编辑浮窗
    $('#data_bank_wand_container').append(buttonHtml);
    // 添加进入表格编辑按钮
    $('.extraMesButtons').append(openTableButtonDom);

    // 开始绑定事件
    // 表格弹出窗
    // $('.open_table_by_id').on('click', function () {
    //     const messageId = $(this).closest('.mes').attr('mesid');
    //     openTablePopup(parseInt(messageId));
    // })
    // 表格插入模式
    $('#dataTable_injection_mode').on('change', (event) => {
        extension_settings.muyoo_dataTable.injection_mode = event.target.value;
        saveSettingsDebounced();
    });
    // 表格消息模板
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.message_template = value;
        saveSettingsDebounced();
    })
    // 表格推送至对话
    $("#dataTable_to_chat_button").on("click", async function () {
        const result = await callGenericPopup("自定义推送至对话的表格的包裹样式，支持HTML与CSS，使用$0表示表格整体的插入位置", POPUP_TYPE.INPUT, extension_settings.muyoo_dataTable.to_chat_container, { rows: 10 })
        if (result) {
            extension_settings.muyoo_dataTable.to_chat_container = result;
            saveSettingsDebounced()
            updateSystemMessageTableStatus()
        }
    })
    // 表格深度
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        extension_settings.muyoo_dataTable.deep = Math.abs(value);
        saveSettingsDebounced();
    })
    // 打开表格
    $("#open_table").on('click', () => openTablePopup());
    // 导入预设
    $('#table-set-import').on('click', () => importTableDataFile());
    // 导出
    $("#table-set-export").on('click', () => exportTableSet());
    // 重置设置
    $("#table-reset").on('click', () => resetSettings());
    // 插件总体开关
    $('#table_switch').change(function () {
        extension_settings.muyoo_dataTable.isExtensionAble = this.checked;
        saveSettingsDebounced();
        toastr.success(this.checked ? '插件已开启' : '插件已关闭，可以打开和手动编辑表格但AI不会读表和生成');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });
    // 插件读表开关
    $('#table_read_switch').change(function () {
        extension_settings.muyoo_dataTable.isAiReadTable = this.checked;
        saveSettingsDebounced();
        toastr.success(this.checked ? 'AI现在会读取表格' : 'AI现在将不会读表');
    });
    // 插件写表开关
    $('#table_edit_switch').change(function () {
        extension_settings.muyoo_dataTable.isAiWriteTable = this.checked;
        saveSettingsDebounced();
        toastr.success(this.checked ? 'AI的更改现在会被写入表格' : 'AI的更改现在不会被写入表格');
    });


    $('#step_by_step').on('change', function() {
        $('#reply_options').toggle(!this.checked);
        extension_settings.muyoo_dataTable.step_by_step = this.checked;
        saveSettingsDebounced();
    });


    // 表格推送至对话开关
    $('#table_to_chat').change(function () {
        extension_settings.muyoo_dataTable.isTableToChat = this.checked;
        saveSettingsDebounced();
        toastr.success(this.checked ? '表格会被推送至对话中' : '关闭表格推送至对话');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });


    //整理表格相关高级设置
    $('#advanced_settings').on('change', function() {
        $('#advanced_options').toggle(this.checked);
        extension_settings.muyoo_dataTable.advanced_settings = this.checked;
        saveSettingsDebounced();
    });
    // 忽略删除
    $('#ignore_del').on('change', function() {
        extension_settings.muyoo_dataTable.bool_ignore_del = $(this).prop('checked');
        saveSettingsDebounced();
        console.log('bool_ignore_del:' + extension_settings.muyoo_dataTable.bool_ignore_del);
    });
    // 清理聊天记录楼层
    $('#clear_up_stairs').on('input', function() {
        const value = $(this).val();
        $('#clear_up_stairs_value').text(value);
        extension_settings.muyoo_dataTable.clear_up_stairs = Number(value);
        saveSettingsDebounced();
    });
    // 模型温度设定
    $('#custom_temperature').on('input', function() {
        const value = $(this).val();
        $('#custom_temperature_value').text(value);
        extension_settings.muyoo_dataTable.custom_temperature = Number(value);
        saveSettingsDebounced();
    });


    // API设置
    // 初始化API设置显示状态
    $('#use_main_api').on('change', function() {
        $('#custom_api_settings').toggle(!this.checked);
        extension_settings.muyoo_dataTable.use_main_api = this.checked;
        saveSettingsDebounced();
    });
    // API URL
    $('#custom_api_url').on('input', function() {
        extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = $(this).val();
        saveSettingsDebounced();
    });
    // API KEY
    $('#custom_api_key').on('input', async function() {
        try {
            const rawKey = $(this).val();

            // 获取或生成设备ID
            let deviceId = localStorage.getItem('st_device_id') || generateUniId();
            if (!localStorage.getItem('st_device_id')) {
                localStorage.setItem('st_device_id', deviceId);
            }

            // 加密
            const xorEncrypted = Array.from(rawKey).map((c, i) =>
                c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
            ).map(c => c.toString(16).padStart(2, '0')).join('');

            extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = xorEncrypted;
            console.log('加密后的API密钥:', xorEncrypted);
            saveSettingsDebounced();

        } catch (error) {
            console.error('API Key 处理失败:', error);
            toastr.error('未能获取到API KEY，请重新输入~');
        }
    })

    // 模型名称
    $('#custom_model_name').on('input', function() {
        extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = $(this).val();
        saveSettingsDebounced();
    });
    // 获取模型列表
    $('#fetch_models_button').on('click', updateModelList);
    // 根据下拉列表选择的模型更新自定义模型名称
    $('#model_selector').on('change', function() {
        const selectedModel = $(this).val();
        $('#custom_model_name').val(selectedModel);
        extension_settings.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = selectedModel;
        saveSettingsDebounced();
    });
    // 开始整理表格
    $("#table_clear_up").on('click', () => refreshTableActions(
        extension_settings.muyoo_dataTable.bool_force_refresh,
        extension_settings.muyoo_dataTable.bool_silent_refresh));

    $('#bool_force_refresh').on('change', function() {
        extension_settings.muyoo_dataTable.bool_force_refresh = $(this).prop('checked');
        console.log('bool_force_refresh:',extension_settings.muyoo_dataTable.bool_force_refresh)
        saveSettingsDebounced();
    });

    $('#bool_silent_refresh').on('change', function() {
        extension_settings.muyoo_dataTable.bool_silent_refresh = $(this).prop('checked');
        console.log('bool_silent_refresh:',extension_settings.muyoo_dataTable.bool_silent_refresh)
        saveSettingsDebounced();
    });

    // 应用程序启动时加载设置
    loadSettings();

    // 设置表格编辑按钮
    $(document).on('click', '.tableEditor_editButton', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        openTableSettingPopup(index);
    })
    // 点击表格渲染样式设置按钮
    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    })
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 设置表格开启开关
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
        saveSettingsDebounced();
    })

    // 监听主程序事件
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
});
