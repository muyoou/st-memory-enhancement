// tableTemplateEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { PopupMenu } from '../../components/popupMenu.js';
import { Form } from '../../components/formManager.js';
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { compareDataDiff } from "../../utils/utility.js";
import {SheetBase} from "../../core/table/base.js"
import { Cell } from '../../core/table/cell.js';

let drag = null;
let currentPopupMenu = null;
let dropdownElement = null;
const renderedTables = new Map();
let scope = 'chat'

const formConfigs = {
    sheet_origin: {
        formTitle: "编辑表格",
        formDescription: "单表格的整体设置。",
        fields: [

        ]
    },
    column_header: {
        formTitle: "编辑列",
        formDescription: "设置列的标题和描述信息。",
        fields: [
            { label: '列标题', type: 'text', dataKey: 'value' },
            { label: '不允许值重复', type: 'checkbox', dataKey: 'valueIsOnly' },
            {
                label: '数据类型', type: 'select', dataKey: 'columnDataType',
                options: [
                    { value: 'text', text: '文本' },
                    // { value: 'number', text: '数字' },
                    // { value: 'option', text: '选项' },
                ]
            },
            //{ label: '列描述', description: '', type: 'textarea', rows: 4, dataKey: 'columnNote' },
        ],
    },
    row_header: {
        formTitle: "编辑行",
        formDescription: "设置行的标题和描述信息。",
        fields: [
            { label: '行标题', type: 'text', dataKey: 'value' },
            //{ label: '行描述', description: '(给AI解释此行的作用)', type: 'textarea', rows: 4, dataKey: 'rowNote' },
        ],
    },
    cell: {
        formTitle: "编辑单元格",
        formDescription: "编辑单元格的具体内容。",
        fields: [
            { label: '单元格内容', type: 'textarea', dataKey: 'value' },
            //{ label: '单元格描述', description: '(给AI解释此单元格内容的作用)', type: 'textarea', rows: 4, dataKey: 'cellPrompt' },
        ],
    },
    sheetConfig: {
        formTitle: "编辑表格属性",
        formDescription: "设置表格的域、类型和名称。",
        fields: [
            /* {
                label: '默认保存位置', type: 'select', dataKey: 'domain',
                options: [
                    // { value: 'global', text: `<i class="fa-solid fa-earth-asia"></i> Global（该模板储存于用户数据中）` },
                    // { value: 'role', text: `<i class="fa-solid fa-user-tag"></i> Role（该模板储存于当前所选角色）` },
                    { value: 'chat', text: `<i class="fa-solid fa-comment"></i> Chat（该模板储存于当前对话）` },
                ],
            }, */
            {
                label: '类型', type: 'select', dataKey: 'type',
                options: [
                    // { value: 'free', text: `<i class="fa-solid fa-table"></i> Free（AI 可以任意修改此表格）` },
                    { value: 'dynamic', text: `<i class="fa-solid fa-arrow-down-wide-short"></i> Dynamic（AI 可进行插入列外的所有操作）` },
                    // { value: 'fixed', text: `<i class="fa-solid fa-thumbtack"></i> Fixed（AI 无法删除或插入行与列）` },
                    // { value: 'static', text: `<i class="fa-solid fa-link"></i> Static（该表对 AI 为只读）` }
                ],
            },
            { label: '表格名', type: 'text', dataKey: 'name' },
            { label: '表格说明（提示词）', type: 'textarea', rows: 6, dataKey: 'note', description: '(作为该表总体提示词，给AI解释此表格的作用)' },
            { label: '是否必填', type: 'checkbox', dataKey: 'required' },
            { label: '是否触发发送', type: 'checkbox', dataKey: 'triggerSend', },
            { label: '触发发送深度', type: 'number', dataKey: 'triggerSendDeep' },
            { label: '初始化提示词', type: 'textarea', rows: 4, dataKey: 'initNode', description: '（当该表格为必填，且表格为空时，会发送此提示词催促AI填表）' },
            { label: '插入提示词', type: 'textarea', rows: 4, dataKey: 'insertNode', description: '' },
            { label: '删除提示词', type: 'textarea', rows: 4, dataKey: 'deleteNode', description: '' },
            { label: '更新提示词', type: 'textarea', rows: 4, dataKey: 'updateNode', description: '' },
        ],
    },
};


async function updateDropdownElement() {
    const templates = getSheets();
    // console.log("下滑模板", templates)
    if (dropdownElement === null) {
        dropdownElement = document.createElement('select');
        dropdownElement.id = 'table_template';
        dropdownElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle');
        dropdownElement.multiple = true;
    }
    dropdownElement.innerHTML = '';
    for (const t of templates) {
        const optionElement = document.createElement('option');
        optionElement.value = t.uid;
        optionElement.textContent = t.name;
        dropdownElement.appendChild(optionElement);
    }

    return dropdownElement;
}

function getAllDropdownOptions() {
    return $(dropdownElement).find('option').toArray().map(option => option.value);
}

function updateSelect2Dropdown() {
    let selectedSheets = getSelectedSheetUids()
    if (selectedSheets === undefined) {
        selectedSheets = [];
    }
    $(dropdownElement).val(selectedSheets).trigger("change", [true])
}

function initChatScopeSelectedSheets() {
    const newSelectedSheets = BASE.sheetsData.context.map(sheet => sheet.enable ? sheet.uid : null).filter(Boolean)
    USER.getContext().chatMetadata.selected_sheets = newSelectedSheets
    return newSelectedSheets
}

function updateSelectedSheetUids() {
    if (scope === 'chat') {
        USER.saveChat()
        console.log("这里触发的")
        BASE.refreshContextView()
    }
    else USER.saveSettings();
    updateDragTables();
}

function initializeSelect2Dropdown(dropdownElement) {
    $(dropdownElement).select2({
        closeOnSelect: false,
        templateResult: function (data) {
            if (!data.id) {
                return data.text;
            }
            var $wrapper = $('<span class="select2-option" style="width: 100%"></span>');
            var $checkbox = $('<input type="checkbox" class="select2-option-checkbox"/>');
            $checkbox.prop('checked', data.selected);
            $wrapper.append(data.text);
            return $wrapper;
        },
        templateSelection: function (data) {
            return data.text;
        },
        escapeMarkup: function (markup) {
            return markup;
        }
    });

    updateSelect2Dropdown()

    $(dropdownElement).on('change', function (e, silent) {
        //if(silent || scope === 'chat') return
        console.log("选择了",silent,$(this).val())
        if (silent) return
        setSelectedSheetUids($(this).val())
        updateSelectedSheetUids()
    });

    // 创建父级复选框与下拉框的关联
    const firstOptionText = $(dropdownElement).find('option:first-child').text();
    const tableMultipleSelectionDropdown = $('<span class="select2-option" style="width: 100%"></span>');
    const checkboxForParent = $('<input type="checkbox" class="select2-option-checkbox"/>');
    tableMultipleSelectionDropdown.append(checkboxForParent);
    tableMultipleSelectionDropdown.append(firstOptionText);
    $('#parentFileBox')?.append(tableMultipleSelectionDropdown);

    const select2MultipleSelection = $(dropdownElement).next('.select2-container--default');
    if (select2MultipleSelection.length) {
        select2MultipleSelection.css('width', '100%');
    }
}

function updateSheetStatusBySelect() {
    const selectedSheetsUid = getSelectedSheetUids()
    const templates = getSheets()
    templates.forEach(temp => {
        if (selectedSheetsUid.includes(temp.uid)) temp.enable = true
        else temp.enable = false
        temp.save && temp.save(undefined, true)
    })
}

export function updateSelectBySheetStatus() {
    const templates = getSheets()
    const selectedSheetsUid = templates.filter(temp => temp.enable).map(temp => temp.uid)
    setSelectedSheetUids(selectedSheetsUid)
}

let table_editor_container = null


function bindSheetSetting(sheet, index) {
    const titleBar = document.createElement('div');
    titleBar.className = 'table-title-bar';
    titleBar.style.display = 'flex';
    titleBar.style.alignItems = 'center';
    titleBar.style.minWidth = '500px';
    titleBar.style.gap = '5px';
    titleBar.style.color = 'var(--SmartThemeEmColor)';
    titleBar.style.fontSize = '0.8rem';
    titleBar.style.fontWeight = 'normal';

    // 表格基础设置按钮
    const settingButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wrench" style="cursor: pointer; height: 28px; width: 28px;" title="编辑表格属性"></i>`);
    settingButton.on('click', async () => {
        const initialData = {
            domain: sheet.domain,
            type: sheet.type,
            name: sheet.name,
            note: sheet.data.note,
            initNode: sheet.data.initNode,
            insertNode: sheet.data.insertNode,
            deleteNode: sheet.data.deleteNode,
            updateNode: sheet.data.updateNode,
            required: sheet.required,
            triggerSend: sheet.triggerSend,
            triggerSendDeep: sheet.triggerSendDeep
        };
        const formInstance = new Form(formConfigs.sheetConfig, initialData);
        const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "保存", allowVerticalScrolling: true, cancelButton: "取消" });

        await popup.show();
        if (popup.result) {
            const diffData = compareDataDiff(formInstance.result(), initialData)
            console.log(diffData)
            let needRerender = false
            // 将比较数据差异的结果更新至表格
            Object.keys(diffData).forEach(key => {
                console.log(key)
                if (['domain', 'type', 'name', 'required', 'triggerSend'].includes(key) && diffData[key] != null) {
                    console.log("对比成功将更新" + key)
                    sheet[key] = diffData[key];
                    if (key === 'name') needRerender = true
                } else if (['note', 'initNode', 'insertNode', 'deleteNode', 'updateNode'].includes(key) && diffData[key] != null) {
                    sheet.data[key] = diffData[key];
                } else if (['triggerSendDeep'].includes(key) && diffData[key] != null) {
                    console.log("对比成功将更新" + key)
                    sheet[key] = Math.max(0, Math.floor(diffData[key]));
                }
            })
            sheet.save()
            if (needRerender) refreshTempView()
        }
    });

    // 表格自定义样式按钮
    const styleButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wand-magic-sparkles" style="cursor: pointer; height: 28px; width: 28px;" title="编辑表格显示样式"></i>`);
    styleButton.on('click', async () => {
        await openSheetStyleRendererPopup(sheet);
    })
    const nameSpan = $(`<span style="margin-left: 0px;">#${index} ${sheet.name ? sheet.name : 'Unnamed Table'}</span>`);

    // 新增：发送到上下文的复选框
    const sendToContextCheckbox = $(`
        <label class="checkbox_label" style="margin-left: 10px; font-weight: normal; color: var(--text_primary);">
            <input type="checkbox" class="send_to_context_switch" ${sheet.sendToContext !== false ? 'checked' : ''} />
            <span data-i18n="Send to context">发送到上下文</span>
        </label>
    `);

    sendToContextCheckbox.find('.send_to_context_switch').on('change', function() {
        sheet.sendToContext = $(this).prop('checked');
        sheet.save();
        console.log(`表格 "${sheet.name}" 的 sendToContext 状态已更新为: ${sheet.sendToContext}`);
    });

    titleBar.appendChild(settingButton[0]);
    // titleBar.appendChild(originButton[0]);
    titleBar.appendChild(styleButton[0]);
    titleBar.appendChild(nameSpan[0]);
    titleBar.appendChild(sendToContextCheckbox[0]);

    return titleBar;
}

async function templateCellDataEdit(cell) {
    const initialData = { ...cell.data };
    const formInstance = new Form(formConfigs[cell.type], initialData);

    formInstance.on('editRenderStyleEvent', (formData) => {
        alert('编辑表格样式功能待实现' + JSON.stringify(formData));
    });


    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: true, allowVerticalScrolling: true }, { okButton: "保存修改", cancelButton: "取消" });

    await popup.show();
    if (popup.result) {
        const diffData = compareDataDiff(formInstance.result(), initialData)
        console.log(diffData)
        Object.keys(diffData).forEach(key => {
            cell.data[key] = diffData[key];
        })
        const pos = cell.position
        cell.parent.save()
        cell.renderCell()
        // cell.parent.updateRender()
        refreshTempView(true);
        if (scope === 'chat') BASE.refreshContextView()
    }
}

function handleAction(cell, action) {
    console.log("开始执行操作")
    cell.newAction(action)
    console.log("执行操作然后刷新")
    refreshTempView();
    // 如果是chat域，则刷新表格
    if (scope === 'chat') BASE.refreshContextView()
}


function bindCellClickEvent(cell) {
    cell.on('click', async (event) => {
        event.stopPropagation();
        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
            }
        } else if (rowIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async (e) => { await templateCellDataEdit(cell) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> 向左插入列', (e) => { handleAction(cell, Cell.CellAction.insertLeftColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除列', (e) => { handleAction(cell, Cell.CellAction.deleteSelfColumn) });
        } else if (colIndex === 0) {
            // if (sheetType === cell.parent.SheetType.dynamic) {
            //     cell.element.delete();
            //     return;
            // }

            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该行', async (e) => { await templateCellDataEdit(cell) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> 向上插入行', (e) => { handleAction(cell, Cell.CellAction.insertUpRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除行', (e) => { handleAction(cell, Cell.CellAction.deleteSelfRow) });
            }
        } else {
            if (sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async (e) => { await templateCellDataEdit(cell) });
            } else {
                return;
            }
        }

        const element = event.target
        // 备份当前cell的style，以便在菜单关闭时恢复
        const style = element.style.cssText;
        const rect = element.getBoundingClientRect();
        const dragSpaceRect = drag.dragSpace.getBoundingClientRect();
        let popupX = rect.left - dragSpaceRect.left;
        let popupY = rect.top - dragSpaceRect.top;
        popupX /= drag.scale;
        popupY /= drag.scale;
        popupY += rect.height / drag.scale + 3;

        element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';

        drag.add('menu', cell.parent.currentPopupMenu.renderMenu());
        cell.parent.currentPopupMenu.show(popupX, popupY).then(() => {
            element.style.cssText = style;
        });
    });
}

function getSelectedSheetUids() {
    return scope === 'chat' ? USER.getContext().chatMetadata.selected_sheets ?? initChatScopeSelectedSheets() : USER.getSettings().table_selected_sheets ?? []
}

function setSelectedSheetUids(selectedSheets) {
    if (scope === 'chat') {
        USER.getContext().chatMetadata.selected_sheets = selectedSheets;
    } else {
        USER.getSettings().table_selected_sheets = selectedSheets;
    }
    updateSheetStatusBySelect()
}

function getSheets() {
    return scope === 'chat' ? BASE.getChatSheets() : BASE.templates
}


async function updateDragTables() {
    if (!drag) return;

    const selectedSheetUids = getSelectedSheetUids()
    const container = $(drag.render).find('#tableContainer');
    table_editor_container.querySelector('#contentContainer').style.outlineColor = scope === 'chat' ? '#cf6e64' : '#41b681';

    if (currentPopupMenu) {
        currentPopupMenu.destroy();
        currentPopupMenu = null;
    }

    container.empty();
    console.log("dragSpace是什么", drag.dragSpace)

    selectedSheetUids.forEach((uid, index) => {

        let sheetDataExists;
        if (scope === 'chat') {
            // 检查 uid 是否存在于 BASE.sheetsData.context
            sheetDataExists = BASE.sheetsData.context?.some(sheetData => sheetData.uid === uid);
        } else {
            // 检查 uid 是否存在于 BASE.templates
            sheetDataExists = BASE.templates?.some(templateData => templateData.uid === uid);
        }
        // 如果数据不存在，则记录警告并跳过此 uid
        if (!sheetDataExists) {
            console.warn(`在 updateDragTables 中未找到 UID 为 ${uid} 的表格数据 (scope: ${scope})。跳过此表格。`);
            return;
        }

        let sheet = scope === 'chat'
            ? BASE.getChatSheet(uid)
            : new BASE.SheetTemplate(uid);
        sheet.currentPopupMenu = currentPopupMenu;

        // if (!sheet || !sheet.hashSheet) {
        //     console.warn(`无法加载模板或模板数据为空，UID: ${uid}`);
        //     return
        // }

        const tableElement = sheet.renderSheet(bindCellClickEvent, sheet.hashSheet.slice(0, 1), NaN);
        tableElement.style.marginLeft = '5px'
        renderedTables.set(uid, tableElement);
        container.append(tableElement);

        // 在添加表格后，添加 hr 元素
        const hr = document.createElement('hr');
        tableElement.appendChild(hr);

        const captionElement = document.createElement('caption');
        captionElement.appendChild(bindSheetSetting(sheet, index));
        if (tableElement.querySelector('caption')) {
            tableElement.querySelector('caption').replaceWith(captionElement);
        } else {
            tableElement.insertBefore(captionElement, tableElement.firstChild);
        }
    })

}

export function updateTableContainerPosition() {
    const windowHeight = window.innerHeight;
    const contentContainer = table_editor_container.querySelector('#contentContainer');
    // console.log("contentContainer", contentContainer)
    const sendFormHeight = document.querySelector('#send_form')?.getBoundingClientRect().height || 0;
    const rect = contentContainer.getBoundingClientRect();
    // console.log("contentContainer 位置变化", rect, windowHeight, sendFormHeight)
    contentContainer.style.position = 'flex';
    contentContainer.style.bottom = '0';
    contentContainer.style.left = '0';
    contentContainer.style.width = '100%';
    contentContainer.style.height = `calc(${windowHeight}px - ${rect.top}px - ${sendFormHeight}px)`;
}

export async function refreshTempView(ignoreGlobal = false) {
    if (ignoreGlobal && scope === 'global') return
    console.log("刷新表格模板视图")
    await updateDropdownElement()
    initializeSelect2Dropdown(dropdownElement);
    await updateDragTables();
}

async function initTableEdit(mesId) {
    table_editor_container = $(await SYSTEM.getTemplate('sheetTemplateEditor')).get(0);
    const tableEditTips = table_editor_container.querySelector('#tableEditTips');
    const tableContainer = table_editor_container.querySelector('#tableContainer');
    const contentContainer = table_editor_container.querySelector('#contentContainer');
    const scopeSelect = table_editor_container.querySelector('#structure_setting_scope');

    dropdownElement = await updateDropdownElement()
    $(tableEditTips).after(dropdownElement)
    initializeSelect2Dropdown(dropdownElement);

    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    const draggable = drag.render
    contentContainer.append(draggable);
    drag.add('tableContainer', tableContainer);

    // 添加事件监听器
    contentContainer.addEventListener('mouseenter', updateTableContainerPosition);
    contentContainer.addEventListener('focus', updateTableContainerPosition);

    $(scopeSelect).val(scope).on('change', async function () {
        scope = $(this).val();
        console.log("切换到", scope)
        await refreshTempView()
    })

    $(document).on('click', '#add_table_template_button', async function () {
        console.log("触发")
        let newTemplateUid = null
        let newTemplate = null
        if (scope === 'chat') {
            newTemplate = BASE.createChatSheet(2, 1)
            newTemplateUid = newTemplate.uid
            newTemplate.save()
        } else {
            newTemplate = new BASE.SheetTemplate().createNewTemplate();
            newTemplateUid = newTemplate.uid
        }

        let currentSelectedValues = getSelectedSheetUids()
        setSelectedSheetUids([...currentSelectedValues, newTemplateUid])
        if (scope === 'chat') USER.saveChat()
        else USER.saveSettings();
        await updateDropdownElement();
        //updateDragTables();
        console.log("测试", [...currentSelectedValues, newTemplateUid])
        $(dropdownElement).val([...currentSelectedValues, newTemplateUid]).trigger("change", [true]);
        updateSelectedSheetUids()
    });
    $(document).on('click', '#import_table_template_button', function () {

    })
    $(document).on('click', '#export_table_template_button', function () {

    })
    // $(document).on('click', '#sort_table_template_button', function () {
    //
    // })

    // $(document).on('click', '#table_template_history_button', function () {
    //
    // })
    // $(document).on('click', '#destroy_table_template_button', async function () {
    //     const r = scope ==='chat'? BASE.destroyAllContextSheets() : BASE.destroyAllTemplates()
    //     if (r) {
    //         await updateDropdownElement();
    //         $(dropdownElement).val([]).trigger('change');
    //         updateDragTables();
    //     }
    // });

    updateDragTables();

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    // 如果已经初始化过，直接返回缓存的容器，避免重复创建
    if (table_editor_container) {
        // 更新下拉菜单和表格，但不重新创建整个容器
        await refreshTempView(false);
        return table_editor_container;
    }
    return await initTableEdit(mesId);
}
