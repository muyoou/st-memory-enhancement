import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {SheetBase} from "./base.js";
import {cellStyle} from "./utils.js";

export class SheetTemplate extends SheetBase {
    constructor(target = null) {
        super();
        this.domain = SheetBase.SheetDomain.global
        this.currentPopupMenu = null;           // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.element = null;                    // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;       // 保存最后一次使用的 cellEventHandler

        this.#load(target);
    }

    /**
     * 渲染表格
     * @description 接受 cellEventHandler 参数，提供一个 `Cell` 对象作为回调函数参数，用于处理单元格事件
     * @description 可以通过 `cell.parent` 获取 Sheet 对象，因此不再需要传递 Sheet 对象
     * @description 如果不传递 cellEventHandler 参数，则使用上一次的 cellEventHandler
     * @param {Function} cellEventHandler
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler) {
        this.lastCellEventHandler = cellEventHandler;

        if (!this.element) {
            this.element = document.createElement('table');
            this.element.classList.add('sheet-table', 'tableDom');
            this.element.style.position = 'relative';
            this.element.style.display = 'flex';
            this.element.style.flexDirection = 'column';
            this.element.style.flexGrow = '0';
            this.element.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = cellStyle;
            this.element.appendChild(styleElement);
        }

        // 确保 element 中有 tbody，没有则创建
        let tbody = this.element.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.element.appendChild(tbody);
        }
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 hashSheet，渲染每一个单元格
        this.hashSheet.forEach((rowUids, rowIndex) => {
            if (rowIndex > 0) return;
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.cells.get(cellUid)
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);    // 调用 Cell 的 initCellRender 方法，仍然需要传递 rowIndex, colIndex 用于渲染单元格内容
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // 将 rowElement 添加到 tbody 中
        });
        return this.element;
    }

    createNewTemplate(column = 2, row = 2, isSave = true) {
        this.init(column, row); // 初始化基本数据结构
        this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        this.name = `新模板_${this.uid.slice(-4)}`;
        this.loadCells();
        isSave && this.save(); // 保存新创建的 Sheet
        return this; // 返回 Sheet 实例自身
    }

    /**
     * 保存表格数据
     * @returns {SheetTemplate}
     */
    save(manualSave = false) {
        let templates = BASE.templates;
        if (!templates) templates = [];
        try {
            const sheetDataToSave = this.filterSavingData();
            if (templates.some(t => t.uid === sheetDataToSave.uid)) {
                templates = templates.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                templates.push(sheetDataToSave);
            }
            console.log("保存模板数据", templates)
            USER.getSettings().table_database_templates = templates;
            if(!manualSave) USER.saveSettings();
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败`, e.message, e);
            return null;
        }
    }
    /**
     * 删除表格数据，根据 domain 决定删除的位置
     * @returns {*}
     */
    delete() {
        let templates = BASE.templates;
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }

    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    #load(target) {
        if (target === null) {
            // 创建一个新的空 Sheet
            this.init();
            return this;
        }
        // 从模板库中加载
        let targetUid = target?.uid || target;
        let targetSheetData = BASE.templates?.find(t => t.uid === targetUid);
        if (targetSheetData?.uid) {
            Object.assign(this, targetSheetData);
            this.loadCells();
            this.markPositionCacheDirty();
            return this;
        }

        throw new Error('未找到对应的模板');
        // if (target instanceof Sheet) {
        //     // 从 Sheet 实例模板化
        //     this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        //     this.name = target.name.replace('表格', '模板');
        //     this.hashSheet = [target.hashSheet[0]];
        //     this.cellHistory = target.cellHistory.filter(c => this.hashSheet[0].includes(c.uid));
        //     this.loadCells();
        //     this.markPositionCacheDirty();
        //     return this;
        // } else {
        //     // 从模板库中加载
        //     let targetUid = target?.uid || target;
        //     let targetSheetData = BASE.templates?.find(t => t.uid === targetUid);
        //     if (targetSheetData?.uid) {
        //         Object.assign(this, targetSheetData);
        //         this.loadCells();
        //         this.markPositionCacheDirty();
        //         return this;
        //     }
        //
        //     throw new Error('未找到对应的模板');
        // }
    }

}
