import { DERIVED } from '../../core/manager.js';

let initialized = false;
let panelElement = null;
let searchInput = null;
let resultContainer = null;
let dragState = null;

function getRenderingSheets() {
    return (DERIVED.any.renderingSheets || []).filter(sheet => sheet?.enable !== false);
}

function getCellValue(cell) {
    return String(cell?.data?.value ?? '').trim();
}

function getSheetSize(sheet) {
    const rows = Array.isArray(sheet.hashSheet) ? sheet.hashSheet.length : 0;
    const cols = rows > 0 && Array.isArray(sheet.hashSheet[0]) ? sheet.hashSheet[0].length : 0;
    return { rows, cols };
}

function isMobileView() {
    return window.matchMedia?.('(max-width: 768px)').matches;
}

function closePanel() {
    panelElement?.classList.remove('open');
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function stopEvent(event) {
    event.stopPropagation();
}

function movePanel(left, top) {
    if (!panelElement) return;
    const rect = panelElement.getBoundingClientRect();
    const maxLeft = Math.max(window.innerWidth - rect.width, 0);
    const maxTop = Math.max(window.innerHeight - rect.height, 0);
    panelElement.style.left = `${clamp(left, 0, maxLeft)}px`;
    panelElement.style.top = `${clamp(top, 0, maxTop)}px`;
    panelElement.style.right = 'auto';
    panelElement.style.bottom = 'auto';
}

function startDrag(event) {
    if (!panelElement || event.target.closest('button, input, textarea, select')) return;
    if (isMobileView()) return;

    const rect = panelElement.getBoundingClientRect();
    dragState = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
    };
    panelElement.classList.add('dragging');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
}

function dragPanel(event) {
    if (!dragState) return;
    movePanel(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
    event.preventDefault();
    event.stopPropagation();
}

function endDrag(event) {
    if (!dragState) return;
    event.currentTarget.releasePointerCapture?.(dragState.pointerId);
    dragState = null;
    panelElement?.classList.remove('dragging');
    event.stopPropagation();
}

function togglePanel(event) {
    event?.stopPropagation();
    panelElement?.classList.toggle('open');
    if (panelElement?.classList.contains('open')) {
        refreshTableDirectory();
    }
}

function highlightElement(element) {
    if (!element) return;
    element.classList.remove('table-directory-target-highlight');
    void element.offsetWidth;
    element.classList.add('table-directory-target-highlight');
    setTimeout(() => element.classList.remove('table-directory-target-highlight'), 1800);
}

function jumpToResult(result) {
    const sheet = getRenderingSheets().find(item => item.uid === result.sheetUid);
    if (!sheet) return;

    const target = result.cell || sheet.element;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    highlightElement(target);

    const title = document.querySelector(`[data-table-directory-sheet-title="${CSS.escape(result.sheetUid)}"]`);
    highlightElement(title);
}

function createResultItem(result) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'table-directory-result-item';
    item.dataset.sheetUid = result.sheetUid;
    item.dataset.resultType = result.type;

    const title = document.createElement('div');
    title.className = 'table-directory-result-title';
    title.textContent = result.title;

    const meta = document.createElement('div');
    meta.className = 'table-directory-result-meta';
    meta.textContent = result.meta;

    item.append(title, meta);
    item.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        jumpToResult(result);
    });
    return item;
}

function createGroup(title, results) {
    if (!results.length) return null;

    const group = document.createElement('div');
    group.className = 'table-directory-result-group';

    const groupTitle = document.createElement('div');
    groupTitle.className = 'table-directory-group-title';
    groupTitle.textContent = `${title} (${results.length})`;
    group.appendChild(groupTitle);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'table-directory-group-items';
    results.forEach(result => itemsContainer.appendChild(createResultItem(result)));
    group.appendChild(itemsContainer);

    return group;
}

function collectDirectoryResults() {
    return getRenderingSheets().map((sheet, index) => {
        const { rows, cols } = getSheetSize(sheet);
        return {
            type: 'table',
            sheetUid: sheet.uid,
            cell: null,
            title: `#${index} ${sheet.name || '未命名表格'}`,
            meta: `${Math.max(rows - 1, 0)} 行 · ${Math.max(cols - 1, 0)} 列 · ${sheet.type || '未知类型'}`,
        };
    });
}

function collectSearchResults(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const tableResults = [];
    const columnResults = [];
    const cellResults = [];

    getRenderingSheets().forEach((sheet, sheetIndex) => {
        const sheetName = sheet.name || '未命名表格';
        if (sheetName.toLowerCase().includes(lowerKeyword)) {
            const { rows, cols } = getSheetSize(sheet);
            tableResults.push({
                type: 'table',
                sheetUid: sheet.uid,
                cell: null,
                title: `#${sheetIndex} ${sheetName}`,
                meta: `${Math.max(rows - 1, 0)} 行 · ${Math.max(cols - 1, 0)} 列 · 表名匹配`,
            });
        }

        const hashSheet = Array.isArray(sheet.hashSheet) ? sheet.hashSheet : [];
        hashSheet.forEach((row, rowIndex) => {
            if (!Array.isArray(row)) return;
            row.forEach((cellUid, colIndex) => {
                const cell = sheet.cells?.get(cellUid);
                const value = getCellValue(cell);
                if (!value || !value.toLowerCase().includes(lowerKeyword)) return;

                if (rowIndex === 0 && colIndex > 0) {
                    columnResults.push({
                        type: 'column',
                        sheetUid: sheet.uid,
                        cell: cell.element,
                        title: `${sheetName} / ${value}`,
                        meta: `第 ${colIndex} 列 · 列名匹配`,
                    });
                } else if (rowIndex > 0 && colIndex > 0) {
                    const columnHeader = getCellValue(sheet.cells?.get(hashSheet[0]?.[colIndex])) || `第 ${colIndex} 列`;
                    cellResults.push({
                        type: 'cell',
                        sheetUid: sheet.uid,
                        cell: cell.element,
                        title: `${sheetName} / 第 ${rowIndex} 行 / ${columnHeader}`,
                        meta: value,
                    });
                }
            });
        });
    });

    return { tableResults, columnResults, cellResults };
}

function renderEmpty(message) {
    const empty = document.createElement('div');
    empty.className = 'table-directory-empty';
    empty.textContent = message;
    resultContainer.appendChild(empty);
}

export function refreshTableDirectory() {
    if (!resultContainer) return;

    resultContainer.innerHTML = '';
    const keyword = String(searchInput?.value || '').trim();

    if (!keyword) {
        const directoryResults = collectDirectoryResults();
        const group = createGroup('全部表格', directoryResults);
        if (group) resultContainer.appendChild(group);
        else renderEmpty('当前没有可显示的表格');
        return;
    }

    const { tableResults, columnResults, cellResults } = collectSearchResults(keyword);
    const groups = [
        createGroup('表名匹配', tableResults),
        createGroup('列名匹配', columnResults),
        createGroup('内容匹配', cellResults),
    ].filter(Boolean);

    if (!groups.length) {
        renderEmpty('没有找到匹配结果');
        return;
    }

    groups.forEach(group => resultContainer.appendChild(group));
}

function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'table_directory_panel';
    panel.className = 'table-directory-panel';
    panel.innerHTML = `
        <div class="table-directory-header">
            <div class="table-directory-title">表格目录</div>
            <button type="button" class="menu_button table-directory-close" title="关闭">×</button>
        </div>
        <input id="table_directory_search" class="text_pole table-directory-search" type="search" placeholder="搜索表名、列名、单元格内容...">
        <div id="table_directory_results" class="table-directory-results"></div>
    `;
    document.body.appendChild(panel);

    panelElement = panel;
    searchInput = panel.querySelector('#table_directory_search');
    resultContainer = panel.querySelector('#table_directory_results');

    panel.addEventListener('click', stopEvent);
    panel.addEventListener('mousedown', stopEvent);
    panel.addEventListener('mouseup', stopEvent);
    panel.addEventListener('pointerup', stopEvent);

    const header = panel.querySelector('.table-directory-header');
    header.addEventListener('pointerdown', startDrag);
    header.addEventListener('pointermove', dragPanel);
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    panel.querySelector('.table-directory-close').addEventListener('click', event => {
        event.stopPropagation();
        closePanel();
    });
    searchInput.addEventListener('click', stopEvent);
    searchInput.addEventListener('input', refreshTableDirectory);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panelElement?.classList.contains('open')) closePanel();
    });
}

export function initTableDirectoryControls() {
    if (initialized) return;
    initialized = true;

    createPanel();
    $(document).on('click', '#table_directory_button', togglePanel);
}
