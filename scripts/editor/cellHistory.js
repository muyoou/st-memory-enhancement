import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { Cell } from '../../core/table/cell.js';

const histories = `
<style>
.cell-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.cell-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
}
.history-sheets-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
}
.history-sheet-container {
    display: none;
    border-radius: 5px;
    height: 100%;
}
.history-sheet-container.active {
    display: flex;
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.history-cell-list {
    overflow-y: auto;
    width: 100%;
    /* 防止内容跳动 */
    will-change: transform;
    transform: translateZ(0);
}
.history-cell-item {
    display: flex;
    flex: 1;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 5px;
    padding: 5px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
.history-cell-action {
    display: flex;
    flex-direction: column;
    flex: 1;
    align-items: center;
    justify-content: center;
    font-family: 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace;
    font-size: 12px;
    color: #999;
    min-width: 45px;
    max-width: 45px;
}
.history-cell-timestamp {
}
</style>

<div class="cell-history">
    <h3>表格单元格历史记录</h3>
<!--    <div class="history-tabs">-->
<!--        &lt;!&ndash; 动态生成tabs &ndash;&gt;-->
<!--    </div>-->
    <div class="cell-history-content">
        <div class="history-sheets-content">
            <!-- 动态生成的单元格历史记录内容 -->
        </div>
    </div>
</div>
`

function scrollToBottom(container) {
    // 在弹窗显示后滚动到底部
    const contentContainer = $(container).find('.cell-history-content');
    contentContainer.scrollTop(contentContainer[0].scrollHeight);
}

async function reloadCellHistory(cell, historyCell, container) {
    const currentValue = cell.data.value;
    const targetValue = historyCell.data.value;
    let resultValue = targetValue;

    const tracebackCellHistoryPopup = new EDITOR.Popup(`
    <style>
        .cell-history-confirm {
            display: flex;
            flex-direction: column;
            justify-content: left;
        }
        .cell-history-confirm .cell-history-confirm-last {
            user-select: none;
            cursor: not-allowed;
            margin: 10px 0;
            text-align: left;
            color: var(--SmartThemeEmColor);
        }
        .cell-history-confirm .cell-history-confirm-value {
            margin-top: 10px;
            text-align: left;
            color: var(--SmartThemeBodyColor);
        }
    </style>
    <div class="cell-history">
        <h3>确认回溯单元格历史记录</h3>
        <div class="cell-history-confirm">
            <textarea class="cell-history-confirm-last" readonly>${currentValue}</textarea>
            <span>修改为:</span>
            <textarea class="cell-history-confirm-value" rows="8">${targetValue}</textarea>
        </div>
    </div>
    `, EDITOR.POPUP_TYPE.CONFIRM, '', { wide: true, allowVerticalScrolling: false, okButton: "继续", cancelButton: "取消" });

    // 监听cell-history-confirm-value的输入事件
    const confirmValue = $(tracebackCellHistoryPopup.dlg).find('.cell-history-confirm-value');
    confirmValue.on('input', function () {
        resultValue = $(this).val();
    });

    await tracebackCellHistoryPopup.show();
    if (tracebackCellHistoryPopup.result) {
        cell.newAction(Cell.CellAction.editCell, { value: resultValue }, true)
        const targetCell = cell.parent.cellHistory[cell.parent.cellHistory.length - 1]
        updateCellHistoryData(container, targetCell);  // 更新历史记录
        scrollToBottom(container);
        BASE.refreshContextView();
    }
}

function updateCellHistoryData(container, cell) {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const sheetsData = BASE.sheetsData.context;
    if (!piece || !piece.hash_sheets) return;

    // 获取内容容器
    const contentContainer = $(container).find('.cell-history-content');

    const cellHistory = cell.parent.cellHistory
    const selfHistory = cellHistory.filter(c => {
        if (c.coordUid === cell.coordUid) {
            return c
        } else {
            return false
        }
    });

    // 清空现有内容
    const sheetsContainer = $(contentContainer).find('.history-sheets-content');
    sheetsContainer.empty();

    // 如果没有历史数据，显示提示
    if (!selfHistory || selfHistory.length === 0) {
        sheetsContainer.append('<div class="history-empty">此单元格没有历史数据</div>');
        return;
    }

    // 创建单元格历史内容区域
    const historyContainer = $('<div class="history-sheet-container active"></div>');
    const cellListContainer = $('<div class="history-cell-list"></div>');

    // 遍历历史记录
    selfHistory.forEach((historyCell, index) => {
        // 只显示有值的历史记录
        if (!historyCell.data || !historyCell.data.value) return;

        // 创建历史条目
        const historyItem = $('<div class="history-cell-item"></div>');
        const valueElement = $(`<div class="history-cell-value">${historyCell.data.value}</div>`);
        const actionElement = $(`<div class="history-cell-action"></div>`);
        const timestampElement = $(`<div class="history-cell-timestamp">${historyCell.uid.slice(-4)}</div>`);
        const indexElement = $(`<div class="history-cell-index">${selfHistory.length - index}/${selfHistory.length}</div>`);
        const reloadElement = $(`<div class="history-cell-reload"><i class="menu_button menu_button_icon fa-solid fa-rotate-right"></i></div>`);

        historyItem.append(valueElement);
        historyItem.append(actionElement);
        actionElement.append(timestampElement);
        actionElement.append(indexElement);
        actionElement.append(reloadElement);

        cellListContainer.append(historyItem);

        // 绑定点击事件
        reloadElement.on('click', async () => {
            try {
                await reloadCellHistory(cell, historyCell, container);
            } catch (error) {
                console.error('Error reloading cell history:', error);
            }
        });
    });

    historyContainer.append(cellListContainer);
    sheetsContainer.append(historyContainer);
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openCellHistoryPopup(cell){
    const cellHistoryPopup = new EDITOR.Popup(histories, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: false });
    const historyContainer = $(cellHistoryPopup.dlg)[0];

    updateCellHistoryData(historyContainer, cell);

    cellHistoryPopup.show();
    scrollToBottom(historyContainer);   // 滚动到底部
}
