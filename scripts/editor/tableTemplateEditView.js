// tableTemplateEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { PopupMenu } from '../../components/popupMenu.js';
import { Form } from '../../components/formManager.js';
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";
import { compareDataDiff } from "../../utils/utility.js";
import { SheetBase } from "../../core/table/base.js"
import { Cell } from '../../core/table/cell.js';

let drag = null;
let currentPopupMenu = null;
let dropdownElement = null;
const renderedTables = new Map();
let scope = 'chat'

const formConfigs = {
    sheet_origin: {
        formTitle: "Edit Table",
        formDescription: "General settings for single table.",
        fields: [

        ]
    },
    column_header: {
        formTitle: "Edit Column",
        formDescription: "Set column title and description.",
        fields: [
            { label: 'Column Title', type: 'text', dataKey: 'value' },
            { label: 'Unique Values Only', type: 'checkbox', dataKey: 'valueIsOnly' },
            {
                label: 'Data Type', type: 'select', dataKey: 'columnDataType',
                options: [
                    { value: 'text', text: 'Text' },
                    // { value: 'number', text: 'Number' },
                    // { value: 'option', text: 'Option' },
                ]
            },
            //{ label: 'Column Description', description: '', type: 'textarea', rows: 4, dataKey: 'columnNote' },
        ],
    },
    row_header: {
        formTitle: "Edit Row",
        formDescription: "Set row title and description.",
        fields: [
            { label: 'Row Title', type: 'text', dataKey: 'value' },
            //{ label: 'Row Description', description: '(Explain row purpose to AI)', type: 'textarea', rows: 4, dataKey: 'rowNote' },
        ],
    },
    cell: {
        formTitle: "Edit Cell",
        formDescription: "Edit cell content.",
        fields: [
            { label: 'Cell Content', type: 'textarea', dataKey: 'value' },
            //{ label: 'Cell Description', description: '(Explain cell purpose to AI)', type: 'textarea', rows: 4, dataKey: 'cellPrompt' },
        ],
    },
    sheetConfig: {
        formTitle: "Edit Table Properties",
        formDescription: "Set table domain, type and name.",
        fields: [
            /* {
                label: 'Default Save Location', type: 'select', dataKey: 'domain',
                options: [
                    // { value: 'global', text: `<i class="fa-solid fa-earth-asia"></i> Global (Stored in User Data)` },
                    // { value: 'role', text: `<i class="fa-solid fa-user-tag"></i> Role (Stored in Current Character)` },
                    { value: 'chat', text: `<i class="fa-solid fa-comment"></i> Chat (Stored in Current Chat)` },
                ],
            }, */
            {
                label: 'Type', type: 'select', dataKey: 'type',
                options: [
                    // { value: 'free', text: `<i class="fa-solid fa-table"></i> Free (AI can freely modify)` },
                    { value: 'dynamic', text: `<i class="fa-solid fa-arrow-down-wide-short"></i> Dynamic (AI can do all except insert columns)` },
                    // { value: 'fixed', text: `<i class="fa-solid fa-thumbtack"></i> Fixed (AI cannot insert/delete rows/cols)` },
                    // { value: 'static', text: `<i class="fa-solid fa-link"></i> Static (Read-only for AI)` }
                ],
            },
            { label: 'Table Name', type: 'text', dataKey: 'name' },
            { label: 'Table Note (Prompt)', type: 'textarea', rows: 6, dataKey: 'note', description: '(General prompt for this table, explaining functionality to AI)' },
            { label: 'Required', type: 'checkbox', dataKey: 'required' },
            { label: 'Trigger Send', type: 'checkbox', dataKey: 'triggerSend', },
            { label: 'Trigger Send Depth', type: 'number', dataKey: 'triggerSendDeep' },
            { label: 'Init Prompt', type: 'textarea', rows: 4, dataKey: 'initNode', description: '(If required & empty, this prompt urges AI to fill table)' },
            { label: 'Insert Prompt', type: 'textarea', rows: 4, dataKey: 'insertNode', description: '' },
            { label: 'Delete Prompt', type: 'textarea', rows: 4, dataKey: 'deleteNode', description: '' },
            { label: 'Update Prompt', type: 'textarea', rows: 4, dataKey: 'updateNode', description: '' },
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
        console.log("选择了", silent, $(this).val())
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

    // Table Basic Settings Button
    const settingButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wrench" style="cursor: pointer; height: 28px; width: 28px;" title="Edit Table Properties"></i>`);
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
        const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "Save", allowVerticalScrolling: true, cancelButton: "Cancel" });

        await popup.show();
        if (popup.result) {
            const diffData = compareDataDiff(formInstance.result(), initialData)
            console.log(diffData)
            let needRerender = false
            // Update table with data diff
            Object.keys(diffData).forEach(key => {
                console.log(key)
                if (['domain', 'type', 'name', 'required', 'triggerSend'].includes(key) && diffData[key] != null) {
                    console.log("Comparison success, updating " + key)
                    sheet[key] = diffData[key];
                    if (key === 'name') needRerender = true
                } else if (['note', 'initNode', 'insertNode', 'deleteNode', 'updateNode'].includes(key) && diffData[key] != null) {
                    sheet.data[key] = diffData[key];
                } else if (['triggerSendDeep'].includes(key) && diffData[key] != null) {
                    console.log("Comparison success, updating " + key)
                    sheet[key] = Math.max(0, Math.floor(diffData[key]));
                }
            })
            sheet.save()
            if (needRerender) refreshTempView()
        }
    });

    // Table Custom Style Button
    const styleButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wand-magic-sparkles" style="cursor: pointer; height: 28px; width: 28px;" title="Edit Table Style"></i>`);
    styleButton.on('click', async () => {
        await openSheetStyleRendererPopup(sheet);
    })
    const nameSpan = $(`<span style="margin-left: 0px;">#${index} ${sheet.name ? sheet.name : 'Unnamed Table'}</span>`);

    // New: Send to context checkbox
    const sendToContextCheckbox = $(`
        <label class="checkbox_label" style="margin-left: 10px; font-weight: normal; color: var(--text_primary);">
            <input type="checkbox" class="send_to_context_switch" ${sheet.sendToContext !== false ? 'checked' : ''} />
            <span data-i18n="Send to context">Send to context</span>
        </label>
    `);

    sendToContextCheckbox.find('.send_to_context_switch').on('change', function () {
        sheet.sendToContext = $(this).prop('checked');
        sheet.save();
        console.log(`Table "${sheet.name}" sendToContext status updated to: ${sheet.sendToContext}`);
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


    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: true, allowVerticalScrolling: true }, { okButton: "Save", cancelButton: "Cancel" });

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
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> Insert Column Right', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> Insert Row Below', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
            }
        } else if (rowIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Edit Column', async (e) => { await templateCellDataEdit(cell) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> Insert Column Left', (e) => { handleAction(cell, Cell.CellAction.insertLeftColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> Insert Column Right', (e) => { handleAction(cell, Cell.CellAction.insertRightColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> Delete Column', (e) => { handleAction(cell, Cell.CellAction.deleteSelfColumn) });
        } else if (colIndex === 0) {
            // if (sheetType === cell.parent.SheetType.dynamic) {
            //     cell.element.delete();
            //     return;
            // }

            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Edit Row', async (e) => { await templateCellDataEdit(cell) });
            if (sheetType === SheetBase.SheetType.free || sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> Insert Row Above', (e) => { handleAction(cell, Cell.CellAction.insertUpRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> Insert Row Below', (e) => { handleAction(cell, Cell.CellAction.insertDownRow) });
                cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> Delete Row', (e) => { handleAction(cell, Cell.CellAction.deleteSelfRow) });
            }
        } else {
            if (sheetType === SheetBase.SheetType.static) {
                cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> Edit Cell', async (e) => { await templateCellDataEdit(cell) });
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
