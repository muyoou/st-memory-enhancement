import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {getColumnLetter} from "./utils.js";
import {SheetBase} from "./base.js";

const CellAction = {
    editCell: 'editCell',
    insertLeftColumn: 'insertLeftColumn',
    insertRightColumn: 'insertRightColumn',
    insertUpRow: 'insertUpRow',
    insertDownRow: 'insertDownRow',
    deleteSelfColumn: 'deleteSelfColumn',
    deleteSelfRow: 'deleteSelfRow',
    clearSheet: 'clearSheet',
}
const CellType = {
    sheet_origin: 'sheet_origin',
    column_header: 'column_header',
    row_header: 'row_header',
    cell: 'cell',
}

/**
 * 单元格类，用于管理表格中的单元格数据
 * @description 单元格类用于管理表格中的单元格数据，包括单元格的位置、值、状态、类型等
 * @description 单元格类还提供了对单元格的操作，包括编辑、插入、删除等
 * @description 单元格类是 Sheet 类的子类，用于管理 Sheet 中的单元格数据
 */
export class Cell {
    static CellType = CellType;
    static CellAction = CellAction;

    constructor(parent, target = null) {
        this.uid = undefined;
        this.parent = parent;

        this.type = '';
        this.status = '';
        this.coordUid = undefined; // 用于存储单元格的坐标 uid
        // this.targetUid = undefined;
        this.element = null;
        this.data = new Proxy({}, {
            get: (target, prop) => {
                return target[prop];
            },
            set: (target, prop, value) => {
                this.editCellData({ prop, value });
                return true;
            },
        });

        this.customEventListeners = {}; // 存储自定义事件监听器，key 为事件名 (CellAction 或 '')，value 为回调函数
        this.#init(target);
    }

    get position() {
        return this.#positionInParentCellSheet();
    }
    get headerX() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[p[0]][0];   // 获取当前单元格所在行的第一个单元格的 uid
        return this.parent.cells.get(targetUid);
    }
    get headerY() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[0][p[1]];   // 获取当前单元格所在列的第一个单元格的 uid
        return this.parent.cells.get(targetUid);
    }

    newAction(actionName, props, isSave = true) {
        this.#event(actionName, props, isSave);
    }
    /* newActions(actionList) {
        for (const action of actionList) {
            this.#event(action.type, { value: action.value }, [action.rowIndex, action.colIndex], false);
        }
        this.parent.renderSheet(this.parent.lastCellEventHandler);
        this.parent.save();
    } */
    editCellData(props) {
        this.#event(CellAction.editCell, props);
    }
    initCellRender(rowIndex = -1, colIndex = -1) {
        this.element = document.createElement('td');
        this.element.className = 'sheet-cell';
        this.renderCell(rowIndex, colIndex);

        return this.element;
    }
    // renderCell(rowIndex, colIndex) {
    //     return renderCell(this, rowIndex, colIndex)
    // }
    renderCell(rowIndex = -1, colIndex = -1) {
        if (rowIndex === -1 && colIndex === -1) {
            [rowIndex, colIndex] = this.#positionInParentCellSheet();
        }

        // 使用 instanceof 获取 this.parent 是 Sheet类 还是 SheetTemplate类
        if (this.parent?.constructor?.name === 'SheetTemplate') {
            if (rowIndex === 0 && colIndex === 0) {
                this.element.classList.add('sheet-cell-origin');
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || getColumnLetter(colIndex - 1); // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                if (this.parent.type === SheetBase.SheetType.dynamic || this.parent.type === SheetBase.SheetType.fixed) {
                    this.element.textContent = 'i'
                } else {
                    this.element.textContent = this.data.value || (rowIndex - 1); // Row headers (1, 2, 3...)
                }
                this.element.classList.add('sheet-header-cell-left');
            } else {
                if (this.parent.type === SheetBase.SheetType.static) {
                    const pos = [getColumnLetter(colIndex - 1), rowIndex].join(''); // Cell position (A1, B2, C3...)
                    this.element.textContent = this.data.value || pos; // 显示单元格值，默认为位置
                    this.element.style.fontSize = '0.8rem';
                    this.element.style.fontWeight = 'normal';
                    this.element.style.color = 'var(--SmartThemeEmColor)'
                } else {
                    this.element.style.cursor = 'not-allowed';
                }
                this.element.classList.add('sheet-cell-other');
            }
        } else if (this.parent?.constructor?.name === 'Sheet') {
            if (rowIndex === 0 && colIndex === 0) {
                // this.element.textContent = 0;
                this.element.classList.add('sheet-cell-origin');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || ''; // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                this.element.textContent = this.data.value || (rowIndex - 1); // Row headers (1, 2, 3...)
                this.element.classList.add('sheet-header-cell-left');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else {
                this.element.textContent = this.data.value || '';
                this.element.classList.add('sheet-cell-other');
                this.element.style.color = 'var(--SmartThemeEmColor)';
            }
        }
    }
    /**
     * 监听事件
     * @description 监听事件，支持监听所有事件、特定 CellAction 事件、原生 DOM 事件
     * @description 如果 event 为 `''` 字符串，则监听所有事件
     * @description 如果 event 是 `CellAction` 事件，则监听特定的 CellAction 事件
     * @description 如果 event 是原生 `DOM` 事件，则监听原生 DOM 事件
     * @param event
     * @param callback
     */
    on(event, callback) {
        if (typeof callback !== 'function') throw new Error('回调函数必须是一个函数');
        if (event === '') {
            if (!this.customEventListeners['']) {
                this.customEventListeners[''] = []; // 初始化为数组
            }
            this.customEventListeners[''].push(callback);           // 监听所有 #event 事件
        } else if (CellAction[event]) {
            if (!this.customEventListeners[event]) {
                this.customEventListeners[event] = []; // 初始化为数组
            }
            this.customEventListeners[event].push(callback);        // 监听特定的 CellAction 事件
        } else {
            try {
                this.element.addEventListener(event, callback); // 监听原生 DOM 事件
            } catch (e) {
                throw new Error(`无法监听事件: ${event}`);
            }
        }
    }

    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    bridge = {

    }
    #init(target) {
        let targetUid = target?.uid || target;
        let targetCell = {};
        if (targetUid) {
            if (target.uid === targetUid) {
                targetCell = target;
            }
            else {
                targetCell = this.parent.cells.get(targetUid);
            }
            if (!targetCell) {
                throw new Error(`未找到单元格，UID: ${targetUid}`);
            }
        }
        this.uid = targetCell.uid || `cell_${this.parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(16)}`;
        this.coordUid = targetCell.coordUid || `coo_${SYSTEM.generateRandomString(15)}`;
        this.type = targetCell.type || CellType.cell;
        this.status = targetCell.status || '';
        this.element = targetCell.element || null;
        this.targetUid = targetCell.targetUid || '';
        this.data = targetCell.data || {};
        this.element = document.createElement('td');
    }
    #positionInParentCellSheet() {
        return this.parent.positionCache[this.uid] || [-1, -1];
    }

    #event(actionName, props = {}, isSave = true) {
        const [rowIndex, colIndex] = this.#positionInParentCellSheet();
        switch (actionName) {
            case CellAction.editCell:
                this.#handleEditCell(props);
                break;
            case CellAction.insertLeftColumn:
                if (colIndex <= 0) return;
                this.#insertColumn(colIndex - 1);
                break;
            case CellAction.insertRightColumn:
                this.#insertColumn(colIndex);
                break;
            case CellAction.insertUpRow:
                if (rowIndex <= 0) return;
                this.#insertRow(rowIndex - 1);
                break;
            case CellAction.insertDownRow:
                this.#insertRow(rowIndex);
                break;
            case CellAction.deleteSelfColumn:
                if (colIndex <= 0) return;
                this.#deleteColumn(colIndex);
                break;
            case CellAction.deleteSelfRow:
                if (rowIndex <= 0) return;
                this.#deleteRow(rowIndex);
                break;
            case CellAction.clearSheet:
                this.#clearSheet();
                break;
            default:
                console.warn(`未处理的单元格操作: ${actionName}`);
        }

        // 触发自定义事件监听器
        if (this.customEventListeners[actionName]) {
            this.customEventListeners[actionName].forEach(callback => { // 遍历执行数组中的回调函数
                callback(this, actionName, props); // 传递 cell 实例, actionName, 和 props
            });
        }
        if (this.customEventListeners['']) {
            this.customEventListeners[''].forEach(callback => { // 遍历执行数组中的回调函数
                callback(this, actionName, props); // 监听所有事件的监听器
            });
        }
        if (isSave) {
            this.parent.save();
        }

        console.log(`单元格操作: ${actionName} 位置: ${[rowIndex, colIndex]}`);
    }
    #handleEditCell(props = {}) {
        if (!props || Object.keys(props).length === 0) {
            console.warn('未提供任何要修改的属性');
            return;
        }
        let cell = new Cell(this.parent);
        cell.coordUid = this.coordUid;
        cell.data = { ...this.data, ...props };
        const [rowIndex, colIndex] = this.#positionInParentCellSheet()
        this.parent.cells.set(cell.uid, cell);
        console.log("保存前的 cell", this.parent.cellHistory);
        this.parent.cellHistory.push(cell);
        this.parent.hashSheet[rowIndex][colIndex] = cell.uid;
        this.parent.markPositionCacheDirty();
    }

    #insertRow(targetRowIndex) {
        // 使用Array.from()方法在 hashSheet 中 targetRowIndex + 1 的位置插入新行
        const newRow = Array.from({ length: this.parent.hashSheet[0].length }, (_, j) => {
            let cell = new Cell(this.parent); // 创建新单元格
            if (j === 0) {
                // 如果是新行的第一个单元格（行头），设置 type 为 row_header
                cell.type = CellType.row_header;
            }
            this.parent.cells.set(cell.uid, cell);
            this.parent.cellHistory.push(cell);
            return cell.uid;
        });
        this.parent.hashSheet.splice(targetRowIndex + 1, 0, newRow);
        this.parent.markPositionCacheDirty();
    }
    #insertColumn(colIndex) {
        // 遍历每一行，在指定的 colIndex 位置插入新的单元格 UID
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            const newCell = new Cell(this.parent);
            this.parent.cells.set(newCell.uid, newCell);
            this.parent.cellHistory.push(newCell);
            row.splice(colIndex + 1, 0, newCell.uid);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #deleteRow(rowIndex) {
        console.log("删除行", rowIndex, this.parent.hashSheet.length)
        if (rowIndex === 0) return;
        if (this.parent.hashSheet.length < 2) return;
        this.parent.hashSheet.splice(rowIndex, 1);
        this.parent.markPositionCacheDirty();
    }
    #deleteColumn(colIndex) {
        if (colIndex === 0) return;
        if (this.parent.hashSheet[0].length <= 2) return;
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            row.splice(colIndex, 1);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #clearSheet() {
        throw new Error('未实现的方法');
    }
}
