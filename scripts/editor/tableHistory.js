import { BASE, DERIVED, EDITOR, SYSTEM, USER } from "../../core/manager.js";
import { getColumnLetter } from "../../core/table/utils.js";
import { debugLog } from "../../services/debugs.js";
// import { deleteRow, insertRow, updateRow } from "../oldTableActions.js";
// import JSON5 from '../../utils/json5.min.mjs'

const histories = `
<style>
.table-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.table-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
}
.history-tabs {
    display: flex;
    overflow-x: auto;
    z-index: 999;
}

/* 使.history-tabs的滚动条显示在上方 */
.history-tabs::-webkit-scrollbar {

}

.history-tab {
    margin-right: 15px;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    padding: 0 5px;
    color: var(--SmartThemeBodyColor);
    white-space: nowrap;
    transition: background-color 0.3s;
}
.history-tab.active {
    color: var(--SmartThemeQuoteColor);
    background-color: rgba(100, 100, 255, 0.3);
    font-weight: bold;
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
.history-cell-position {
    font-weight: bold;
    color: var(--SmartThemeQuoteColor);
    width: 60px;
}
.history-cell-value {
    display: flex;
    flex: 1;
    width: 100%;
    padding: 0 10px;
    font-weight: normal;
    word-break: break-all;
}
.history-cell-timestamp {
    color: var(--SmartThemeEmColor);
    font-size: 0.9em;
    width: 60px;
    text-align: right;
}
.history-empty {
    font-style: italic;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
    padding: 10px;
}
</style>
<div class="table-history">
    <h3>表格单元格历史记录</h3>
    <div class="history-tabs">
        <!-- 动态生成tabs -->
    </div>
    <div class="table-history-content">
        <div class="history-sheets-content">
            <!-- 动态生成的表格历史记录内容 -->
        </div>
    </div>
</div>
`;

function scrollToBottom(container) {
	// 在弹窗显示后滚动到底部
	const contentContainer = $(container).find(".table-history-content");
	contentContainer.scrollTop(contentContainer[0].scrollHeight);
}

async function updateTableHistoryData(container) {
	const { piece, deep } = BASE.getLastSheetsPiece();
	const sheetsData = BASE.getChatSheets();
	if (!piece || !piece.hash_sheets) return;

	// 获取内容容器
	const contentContainer = $(container).find(".table-history-content");
	const tabsContainer = $(container).find(".history-tabs");
	const sheetsContainer = $(contentContainer).find(".history-sheets-content");

	// 清空现有内容
	tabsContainer.empty();
	sheetsContainer.empty();

	// 如果没有表格数据，显示提示
	if (!sheetsData || sheetsData.length === 0) {
		sheetsContainer.append(
			'<div class="history-empty">没有可显示的历史数据</div>'
		);
		return;
	}

	// 有效的表格计数（用于处理首个激活标签）
	let validSheetCount = 0;

	// 遍历所有表格
	sheetsData.forEach((sheetData, index) => {
		if (!sheetData.cellHistory || sheetData.cellHistory.length === 0)
			return;

		const sheetName = sheetData.name || `表格${index + 1}`;
		const sheetId = `history-sheet-${index}`;
		validSheetCount++;

		// 创建Tab
		const tab = $(
			`<div class="history-tab" data-target="${sheetId}">#${index} ${sheetName}</div>`
		);
		if (validSheetCount === 1) {
			tab.addClass("active");
		}
		tabsContainer.append(tab);

		// 创建表格内容区域
		const sheetContainer = $(
			`<div id="${sheetId}" class="history-sheet-container ${
				validSheetCount === 1 ? "active" : ""
			}"></div>`
		);
		const cellListContainer = $('<div class="history-cell-list"></div>');

		// 计数有效的历史记录数量
		let validHistoryCount = 0;

		sheetData.cellHistory.forEach((cell) => {
			const cellInstance = sheetData.cells.get(cell.uid);
			const [rowIndex, colIndex] = cellInstance.position;
			// debugLog(rowIndex, colIndex, cellInstance);

			// 只显示有值的单元格
			if (!cell.data || !cell.data.value) return;

			// // 跳过第一行第一列（表格原始单元格）
			// if (rowIndex === 0 && colIndex === 0) return;

			// 创建位置显示
			const positionDisplay = () => {
				if (rowIndex === 0 && colIndex === 0) {
					return `<span style="color: var(--SmartThemeEmColor);">表格源</span>`;
				} else if (rowIndex === 0) {
					return `列 <span style="color: var(--SmartThemeQuoteColor);">${colIndex}</span>`;
				} else if (colIndex === 0) {
					return `行 <span style="color: var(--SmartThemeQuoteColor);">${rowIndex}</span>`;
				} else if (rowIndex > 0 && colIndex > 0) {
					return `<span style="color: #4C8BF5;">${getColumnLetter(
						colIndex - 1
					)}</span><span style="color: #34A853;">${rowIndex}</span>`;
				}
				return '<span style="color: #EA4335;">旧数据</span>';
			};

			// 创建历史条目
			const historyItem = $('<div class="history-cell-item"></div>');
			const positionElement = $(
				`<div class="history-cell-position">${positionDisplay()}</div>`
			);
			const valueElement = $(
				`<div class="history-cell-value">${cell.data.value}</div>`
			);
			const timestampElement = $(
				`<div class="history-cell-timestamp">${cell.uid.slice(
					-4
				)}</div>`
			);

			historyItem.append(positionElement);
			historyItem.append(valueElement);
			// historyItem.append(timestampElement);

			cellListContainer.append(historyItem);
			validHistoryCount++;
		});

		// 如果没有历史条目，显示提示
		if (validHistoryCount === 0) {
			cellListContainer.append(
				'<div class="history-empty">此表格没有历史数据</div>'
			);
		}

		sheetContainer.append(cellListContainer);
		sheetsContainer.append(sheetContainer);
	});

	// 如果没有任何表格有历史数据，显示提示
	if (validSheetCount === 0) {
		sheetsContainer.append(
			'<div class="history-empty">没有可显示的历史数据</div>'
		);
	}

	// 添加标签切换事件
	tabsContainer.find(".history-tab").on("click", function () {
		// 移除所有活跃状态
		tabsContainer.find(".history-tab").removeClass("active");
		sheetsContainer.find(".history-sheet-container").removeClass("active");

		// 添加当前项的活跃状态
		$(this).addClass("active");
		const targetId = $(this).data("target");
		$(`#${targetId}`).addClass("active");

		// 滚动内容区域到底部
		scrollToBottom(container);
	});
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openTableHistoryPopup() {
	const tableHistoryPopup = new EDITOR.Popup(
		histories,
		EDITOR.POPUP_TYPE.TEXT,
		"",
		{ large: true, wide: true, allowVerticalScrolling: false }
	);
	const historyContainer = $(tableHistoryPopup.dlg)[0];

	updateTableHistoryData(historyContainer);
	tableHistoryPopup.show();
}
