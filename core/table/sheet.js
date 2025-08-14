import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { Logger } from '../../services/logger.js';
import { SheetBase } from "./base.js";
import { cellStyle, filterSavingData } from "./utils.js";
import {Cell} from "./cell.js";

/**
 * 表格类，用于管理表格数据
 * @description 表格类用于管理表格数据，包括表格的名称、域、类型、单元格数据等
 * @description 表格类还提供了对表格的操作，包括创建、保存、删除、渲染等
 */
export class Sheet extends SheetBase {
    constructor(target = null) {
        super(target);

        this.currentPopupMenu = null;           // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.element = null;                    // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;       // 保存最后一次使用的 cellEventHandler
        this.template = null;       // 用于存储模板
        this.#load(target);
    }

    /**
     * 渲染表格
     * @description 接受 cellEventHandler 参数，提供一个 `Cell` 对象作为回调函数参数，用于处理单元格事件
     * @description 可以通过 `cell.parent` 获取 Sheet 对象，因此不再需要传递 Sheet 对象
     * @description 如果不传递 cellEventHandler 参数，则使用上一次的 cellEventHandler
     * @param {Function} cellEventHandler
     * @param targetHashSheet
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler, targetHashSheet = this.hashSheet) {
        this.lastCellEventHandler = cellEventHandler;

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

        const tbody = document.createElement('tbody');
        this.element.appendChild(tbody);
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 hashSheet，渲染每一个单元格
        targetHashSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                let cell = this.cells.get(cellUid)
                if(!cell) {
                    Logger.warn(`Cell not found: ${cellUid}`);
                    cell = new Cell(this); // 如果没有找到对应的单元格，则创建一个新的 Cell 实例
                    cell.uid = cellUid; // 设置 uid
                    cell.data = { value: '' }; // 初始化数据
                    this.cells.set(cellUid, cell); // 将新创建的单元格添加到 cells 中
                }
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

    /**
     * 保存表格数据
     * @returns {Sheet|boolean}
     */
    save(targetPiece = USER.getChatPiece()?.piece, manualSave = false) {
        const sheetDataToSave = this.filterSavingData()
        sheetDataToSave.template = this.template?.uid;

        let sheets = BASE.sheetsData.context ?? [];
        try {
            if (sheets.some(t => t.uid === sheetDataToSave.uid)) {
                sheets = sheets.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                sheets.push(sheetDataToSave);
            }
            BASE.sheetsData.context = sheets;
            if (!targetPiece) {
                Logger.warn("没用消息能承载hash_sheets数据，不予保存")
                return this
            }
            if (!targetPiece.hash_sheets) targetPiece.hash_sheets = {};
            targetPiece.hash_sheets[this.uid] = this.hashSheet?.map(row => row.map(hash => hash));
            Logger.debug('保存表格数据', targetPiece, this.hashSheet);
            // [持久化修复] 调用防抖保存函数，确保在操作后能自动保存聊天记录。
            // 如果需要立即保存，则直接调用，否则使用防抖版本。
            if (manualSave) {
                USER.saveChat();
            } else {
                USER.debouncedSaveChat();
            }
            
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return false;
        }
    }

    /**
     * 创建新的 Sheet 实例
     * @returns {Sheet} - 返回新的 Sheet 实例
     */
    createNewSheet(column = 2, row = 2, isSave = true) {
        this.init(column, row);     // 初始化基本数据结构
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = `新表格_${this.uid.slice(-4)}`;
        if (isSave) this.save();    // 保存新创建的 Sheet
        return this;                // 返回 Sheet 实例自身
    }

    /**
     * 获取表格内容的提示词，可以通过指定['title', 'node', 'headers', 'rows', 'editRules']中的部分，只获取部分内容
     * @returns 表格内容提示词
     */
    getTableText(index, customParts = ['title', 'node', 'headers', 'rows', 'editRules'], eventData, ignoreToChatFilter = false) {
        Logger.debug('获取表格内容提示词', this, `ignoreToChatFilter: ${ignoreToChatFilter}`)
        if (ignoreToChatFilter === false && this.config.toChat === false) return ''; // 如果配置为不发送到聊天，则直接返回空
        if (this.triggerSend && this.triggerSendDeep < 1) return ''; // 如果触发深度=0，则不发送，可以用作信息一览表
        const title = `* ${index}:${this.name}\n`;
        const node = this.source.data.note && this.source.data.note !== '' ? '【说明】' + this.source.data.note + '\n' : '';
        const headers = "rowIndex," + this.getCellsByRowIndex(0).slice(1).map((cell, index) => index + ':' + cell.data.value).join(',') + '\n';
        let rows = this.getSheetCSV()
        const editRules = this.#getTableEditRules() + '\n';
        // 新增触发式表格内容发送，检索聊天内容的角色名
        if (eventData && eventData.chat && rows && this.triggerSend) {
            // 提取所有聊天内容中的 content 值
            const chatContents = eventData.chat.map(chat => chat.content).join('\n');
            // console.log("获取事件数据-聊天内容", chatContents);  //调试用，正常情况不打开
            const rowsArray = rows.split('\n').filter(line => {
                line = line.trim();
                if (!line) return false;
                const parts = line.split(',');
                const str1 = parts?.[1] ?? ""; // 字符串1对应索引1
                return chatContents.includes(str1);
            });
            rows = rowsArray.join('\n');
        }
        let result = '';
        Logger.debug('测试获取表格内容提示词', customParts, result, this);
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
     * 获取表格的content数据（与旧版兼容）
     * @returns {string[][]} - 返回表格的content数据
     */
    getContent(withHead = false) {
        if (!withHead && this.isEmpty()) return [];
        const content = this.hashSheet.map((row) =>
            row.map((cellUid) => {
                const cell = this.cells.get(cellUid);
                if (!cell) return "";
                return cell.data.value;
            })
        );

        // 去掉每一行的第一个元素
        const trimmedContent = content.map(row => row.slice(1));
        if (!withHead) return trimmedContent.slice(1);
        return content;
    }

    getJson() {
        const sheetDataToSave = this.filterSavingData(["uid", "name", "domain", "type", "enable", "required", "toChat", "triggerSend", "triggerSendDeep", "config", "sourceData", "content"])
        delete sheetDataToSave.cellHistory
        delete sheetDataToSave.hashSheet
        sheetDataToSave.sourceData = this.source.data
        sheetDataToSave.content = this.getContent(true)
        return sheetDataToSave
    }
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    #load(target) {
        if (target == null) {
            return this;
        }
        if (typeof target === 'string') {
            let targetSheetData = BASE.sheetsData.context?.find(t => t.uid === target);
            if (targetSheetData?.uid) {
                this.loadJson(targetSheetData)
                return this;
            }
            throw new Error('未找到对应的模板');
        }
        if (typeof target === 'object') {
            if (target.domain === this.SheetDomain.global) {
                Logger.info('从模板转化表格', target, this);
                // 修复：手动从模板复制属性，而不是使用不安全的 `loadJson`
                this.name = (target.name || '新表格').replace('模板', '表格');
                this.type = target.type;
                this.enable = target.enable;
                this.required = target.required;
                this.triggerSend = target.triggerSend;
                this.triggerSendDeep = target.triggerSendDeep;
                // 使用深拷贝确保配置和数据隔离
                this.config = JSON.parse(JSON.stringify(target.config || {}));
                this.hashSheet = JSON.parse(JSON.stringify(target.hashSheet || []));
                this.cellHistory = JSON.parse(JSON.stringify(target.cellHistory || []));
                this.loadCells(); // 关键：从复制的 cellHistory 重建内部 cells Map

                // 为这个聊天专用的表格实例设置新的身份
                this.domain = 'chat';
                this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
                this.template = target; // 保留对原始模板的引用
                this.markPositionCacheDirty();
                return this;

            } else {
                // 对于非模板对象，继续使用现有的加载逻辑
                this.loadJson(target)
                return this;
            }
        }
    }
    /**
     * 获取表格编辑规则提示词
     * @returns
     */
    #getTableEditRules() {
        const source = this.source;
        if (this.required && this.isEmpty()) return '【增删改触发条件】\n插入：' + source.data.initNode + '\n'
        else {
            let editRules = '【增删改触发条件】\n'
            if (source.data.insertNode) editRules += ('插入：' + source.data.insertNode + '\n')
            if (source.data.updateNode) editRules += ('更新：' + source.data.updateNode + '\n')
            if (source.data.deleteNode) editRules += ('删除：' + source.data.deleteNode + '\n')
            return editRules
        }
    }

    /**
     * 初始化hashSheet，只保留表头
     */
    initHashSheet() {
        this.hashSheet = [this.hashSheet[0].map(uid => uid)];
        this.markPositionCacheDirty();
    }
    
    /**
     * 根据 "A1" 格式的地址获取单元格
     * @param {string} address - 例如 "A1", "B2"
     * @returns {Cell|null}
     */
    getCellFromAddress(address) {
        if (typeof address !== 'string' || !/^[A-Z]+\d+$/.test(address)) {
            return null;
        }

        const colStr = address.match(/^[A-Z]+/)[0];
        const rowStr = address.match(/\d+$/)[0];

        const row = parseInt(rowStr, 10) - 1;

        let col = 0;
        for (let i = 0; i < colStr.length; i++) {
            col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        col -= 1;

        if (row < 0 || col < 0) return null;

        const cellUid = this.hashSheet?.[row]?.[col];
        return cellUid ? this.cells.get(cellUid) : null;
    }
}
