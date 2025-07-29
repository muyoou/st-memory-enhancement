import {EDITOR, SYSTEM, USER, BASE} from '../../core/manager.js';
import JSON5 from '../../utils/json5.min.mjs'

let isPopupOpening = false; // 防止在弹窗打开时推送日志导致循环
let debugEventHistory = [];

function updateTableDebugLog(type, message, detail = "", timeout, stack) {
    const newLog = {
        time: new Date().toLocaleTimeString(),
        type: type,
        message: message || '',
        stack,
    };
    switch (type) {
        case 'info':
            toastr.info(message, detail, { timeOut: timeout });
            break;
        case 'success':
            toastr.success(message, detail, { timeOut: timeout });
            break;
        case 'warning':
            console.warn(message, detail);
            toastr.warning(message, detail, { timeOut: timeout });
            break;
        case 'error':
            console.error(message, detail);
            // Assuming 'detail' is intended as the title for toastr.
            // If detail is an empty string, toastr might not show a title, which is fine.
            toastr.error(message, detail, { timeOut: timeout });
            if (isPopupOpening) break;
            if (USER.tableBaseSetting.tableDebugModeAble) {
                setTimeout(() => {
                    openTableDebugLogPopup().then(r => {});
                }, 0);
            }
            break;
        case 'clear':
            toastr.clear();
            break;
        default:
            break;
    }

    if (isPopupOpening) return;
    debugEventHistory = debugEventHistory || [];
    debugEventHistory.unshift(newLog);
}

const copyButtonStyle = `
<div class="menu_button log-copy-button">
    <i class="fa-solid fa-copy"></i>
</div>
`

async function copyPopup(log) {
    const logDetails = `Time: ${log.time}\nType: ${log.type}\nMessage: ${log.message}${log.stack ? `\nStack:\n${log.stack}` : ''}`;
    const textarea = $('<textarea class="log-copy-textarea" style="height: 100%"></textarea>').val(logDetails);
    const manager = await SYSTEM.getTemplate('popup');
    const copyPopupInstance = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const container = copyPopupInstance.dlg.querySelector('#popup_content');
    container.append(textarea[0]);

    textarea.focus();
    textarea.select();
    await copyPopupInstance.show();
}

/**
 * 渲染Debug日志到容器
 * @param $container jQuery对象，日志容器
 * @param logs 日志数组
 * @param onlyError 是否仅显示错误日志
 */
function renderDebugLogs($container, logs, onlyError) {
    $container.empty(); // 清空容器

    if (!logs || logs.length === 0) {
        $container.append('<div class="debug-log-item">No debug log found.</div>');
        return;
    }

    // 用于匹配堆栈信息行，并捕获函数名、URL和行号列号
    const stackLineRegex = /at\s+([^\s]*?)\s+\((https?:\/\/[^\s:]+(?::\d+)?(?:[^\s:]+)*)(?::(\d+):(\d+))?\)/g;
    logs.forEach(log => {
        if (onlyError && log.type !== 'error') {
            return; // 如果只显示错误日志且当前日志不是 error 类型，则跳过
        }

        const logElement = $('<div class="debug-log-item"></div>'); // 创建一个 div 元素来显示每条 log
        const timeSpan = $('<span class="log-time"></span>').text(`[${log.time}]`);
        const typeSpan = $('<span class="log-type"></span>').addClass(`log-type-${log.type}`).text(`[${log.type}]`);
        const messageSpan = $('<span class="log-message"></span>').text(log.message);
        const copyButton = $(`${copyButtonStyle}`);

        logElement.append(timeSpan).append(' ').append(typeSpan).append(': ').append(messageSpan).append(' ').append(copyButton); // 添加复制按钮

        copyButton.on('click', () => {
            copyPopup(log);
        })

        if (log.stack) {
            // 使用正则表达式替换堆栈信息行，并高亮函数名，URL可点击
            const formattedStack = log.stack.replace(stackLineRegex, (match, functionName, urlBase, lineNumber, columnNumber) => {
                // functionName 是函数名 (例如 getPromptAndRebuildTable, dispatch)
                // urlBase 是链接的基础部分
                // lineNumber 是行号 (如果存在)
                // columnNumber 是列号 (如果存在)

                let functionNameHtml = '';
                if (functionName) {
                    functionNameHtml = `<span style="color: #bbb">${functionName}</span> `;
                }
                let linkHtml = `<a href="${urlBase}" target="_blank" style="color: rgb(98, 145, 179)">${urlBase}</a>`;
                let locationHtml = '';
                if (lineNumber && columnNumber) {
                    locationHtml = `<span style="color: rgb(98, 145, 179)">:${lineNumber}:${columnNumber}</span>`;
                }
                return `at ${functionNameHtml}(${linkHtml}${locationHtml})`; // 重新构建堆栈信息行
            });
            const stackPre = $('<pre class="log-stack"></pre>').html(formattedStack);
            logElement.append(stackPre);
        }

        $container.append(logElement);
    });
}

export const consoleMessageToEditor = {
    info: (message, detail, timeout) => updateTableDebugLog('info', message, detail, timeout),
    success: (message, detail, timeout) => updateTableDebugLog('success', message, detail, timeout),
    warning: (message, detail, timeout) => updateTableDebugLog('warning', message, detail, timeout),
    // 如果 error 参数是一个真正的 Error 对象，则可以附加 error.message 或 error.name。
    // 但如果调用者只传递了字符串，那么 error 参数会是 undefined。
    // 假设主要的错误信息已经在 message 或 detail 中。
    // 如果需要显示堆栈，则 error 参数应该是 Error 对象。
    error: (message, detail, errorObj, timeout) => {
        let fullMessage = message;
        // 如果 detail 存在，可以考虑如何合并它，或者假设它已包含在 message 中。
        // For now, let's assume 'message' contains the primary string and 'detail' is secondary.
        // The 'errorObj' is specifically for stack trace.
        updateTableDebugLog('error', fullMessage, detail, timeout, errorObj?.stack);
    },
    clear: () => updateTableDebugLog('clear', ''),
}

/**
 * +.新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableDebugLogPopup() {
    if (!SYSTEM.lazy('openTableDebugLogPopup')) return;

    isPopupOpening = true;
    const manager = await SYSTEM.getTemplate('debugLog');
    const tableDebugLogPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const $dlg = $(tableDebugLogPopup.dlg);
    const $debugLogContainer = $dlg.find('#debugLogContainer');
    const $onlyErrorLogCheckbox = $dlg.find('#only_error_log'); // 获取 checkbox
    const $exportButton = $dlg.find('#table_debug_log_export_button'); // 获取导出按钮
    const $exportInfoButton = $dlg.find('#table_debug_info_export_button'); // 获取导出调试信息按钮
    const $importInfoButton = $dlg.find('#table_debug_info_import_button'); // 获取导入调试信息按钮

    $debugLogContainer.empty(); // 清空容器，避免重复显示旧日志
    toastr.clear()

    // 初始化渲染日志，根据 checkbox 状态决定是否只显示 error
    renderDebugLogs($debugLogContainer, debugEventHistory, $onlyErrorLogCheckbox.is(':checked'));

    $onlyErrorLogCheckbox.off('change').on('change', function () { // 移除之前的事件监听，避免重复绑定
        const onlyError = $(this).is(':checked'); // 获取 checkbox 的选中状态
        renderDebugLogs($debugLogContainer, debugEventHistory, onlyError); // 重新渲染日志
    });
    $exportButton.on('click', () => {
        const logData = debugEventHistory.map(log => {
            return {
                time: log.time,
                type: log.type,
                message: log.message,
                stack: log.stack
            }
        });
        const logDataString = JSON5.stringify(logData, null, 2);
        const blob = new Blob([logDataString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'table_debug_log.json';
        a.click();
        URL.revokeObjectURL(url);
    })

    $exportInfoButton.on('click', () => {
        const infoData = {
            chatMate: BASE.sheetsData.context,
            lastestSheet: BASE.getLastSheetsPiece(),
            allHash: USER.getContext().chat.map(chat => chat.hash_sheets ?? null),
        };
        const infoDataString = JSON.stringify(infoData, null, 2);
        const blob = new Blob([infoDataString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'table_debug_info.json';
        a.click();
        URL.revokeObjectURL(url);
    })

    $importInfoButton.on('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    BASE.sheetsData.context = json.chatMate;
                    const lastestPiece = USER.getChatPiece().piece
                    lastestPiece.hash_sheets = json.lastestSheet.piece.hash_sheets;
                    console.log('导入的调试信息：', json);
                    USER.saveChat()
                } catch (error) {
                    console.error('导入失败：', error);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    await tableDebugLogPopup.show();
    isPopupOpening = false;
}
