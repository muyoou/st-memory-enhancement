import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { Cell } from '../../core/table/cell.js';
import {estimateTokenCount} from "../settings/standaloneAPI.js";

const statistics = `
<style>
.table-statistics-content {
    padding: 10px;
}
.stat-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.stat-label {
    font-weight: 500;
}
.stat-value {
    font-weight: 600;
}
</style>
<div class="table-statistics">
    <div id="dialogue_popup_text">
        <h3>表格数据统计</h3>
        <div class="table-statistics-header">
            <div class="menu_button_icon menu_button interactable gap5" id="clear_table_statistics_button" tabindex="0">
                <i class="fa-solid fa-broom"></i>
                <span>清理不在对话树的历史单元</a>
            </div>
        </div>
        <div class="table-statistics-content">
            <!-- 动态内容将在这里插入 -->
        </div>
    </div>
</div>
`

async function updataTableStatisticsData(container) {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const sheetsData = BASE.sheetsData.context;
    if (!piece || !piece.hash_sheets) return;
    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets);
    const cellHistories = sheetsData.map(sheet => sheet.cellHistory);
    const sheetDataPrompt = sheets.map((sheet, index) => sheet.getTableText(index)).join('\n')
    const sheetsValueCount = estimateTokenCount(sheetDataPrompt);
    const lastChangeFloor = `${deep}/${USER.getContext().chat.length - 1}`;

    // 定义要显示的统计数据
    const statsData = [
        { label: '已开启表格数量', value: sheets.length },
        { label: '历史总单元格数量', value: cellHistories.reduce((acc, cellHistory) => acc + cellHistory.length, 0) },
        { label: '历史数据总大小', value: `${(JSON.stringify(sheetsData).length / 1024).toFixed(2)} KB` },
        { label: '当前表格模糊计算的Token数', value: Math.round(sheetsValueCount * 0.6) },
        { label: '当前表格最后一次修改位置', value: lastChangeFloor }
    ];

    // 获取内容容器
    const contentContainer = $(container).find('.table-statistics-content');
    contentContainer.empty(); // 清空现有内容

    // 动态创建统计项
    statsData.forEach(stat => {
        const statItem = $('<div class="stat-item"></div>');
        const statLabel = $(`<div class="stat-label">${stat.label}</div>`);
        const statValue = $(`<div class="stat-value">${stat.value}</div>`);

        statItem.append(statLabel);
        statItem.append(statValue);
        contentContainer.append(statItem);
    });
}

async function clearTableStatisticsButton(statisticsContainer) {
    const chat = USER.getContext().chat;
    if (!chat || chat.length === 0) return;

    const messageHashSheets = JSON.parse(JSON.stringify(USER.getContext().chat
        .filter(message => message.hash_sheets)
        .map(message => message.hash_sheets)));
    let hashList = []
    messageHashSheets.forEach(hashSheets => {
        Object.entries(hashSheets).forEach(([sheetId, sheet]) => {
            hashList = [...hashList, ...sheet.map(row => row.flat()).flat()]
        })
    });
    const filterDuplicateMap = new Set(hashList);

    const sheetsData = BASE.sheetsData.context;
    const cellHistories = sheetsData.map(sheet => sheet.cellHistory);
    let cellHistoryHashNum = 0;
    let lastCellHistoryHashNum = 0;
    cellHistories.forEach((cellHistory, index) => {
        cellHistory.forEach((cell, cellIndex) => {
            lastCellHistoryHashNum++
            if (cell && cell.uid && filterDuplicateMap.has(cell.uid)) {
                cellHistoryHashNum++;
                delete cell.bridge;
            } else {
                cellHistories[index].splice(cellIndex, 1);
            }
        })
    })

    setTimeout(() => {
        if (lastCellHistoryHashNum === cellHistoryHashNum) {
            updataTableStatisticsData(statisticsContainer);
            EDITOR.success(`清理历史单元格操作完成, 有效单元格数量: ${cellHistoryHashNum}`);
            USER.saveChat()
            return;
        } else {
            EDITOR.info(`本轮清理单元格数量: ${lastCellHistoryHashNum - cellHistoryHashNum}`);
            clearTableStatisticsButton(statisticsContainer)
        }
    }, 0)
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openTableStatisticsPopup(){
    const manager = statistics;
    const tableStatisticsPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true });
    const statisticsContainer = $(tableStatisticsPopup.dlg)[0];
    // 绑定清理按钮事件
    const clearButton = $(statisticsContainer).find('#clear_table_statistics_button');
    clearButton.on('click', () => {
        clearTableStatisticsButton(statisticsContainer)
    });

    updataTableStatisticsData(statisticsContainer);

    await tableStatisticsPopup.show();
}
