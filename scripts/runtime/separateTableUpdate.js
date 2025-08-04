import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { Logger } from '../../services/logger.js';
import { executeIncrementalUpdateFromSummary } from "./absoluteRefresh.js";
import { newPopupConfirm, alwaysConfirmPopups } from '../../components/popupConfirm.js';
import { clearStepData } from '../../services/stepByStepStorage.js';
import { reloadCurrentChat } from "/script.js"
import {getTablePrompt,initTableData, undoSheets, triggerTableUpdateCallbacks} from "../../index.js"
import { ext_hashSheetsToJson } from '../settings/standaloneAPI.js';

let toBeExecuted = [];

/**
 * 初始化两步总结所需的数据
 * @param chat
 * */
function InitChatForTableTwoStepSummary(chat) {
    // 如果currentPiece.uid未定义，则初始化为随机字符串
    if (chat.uid === undefined) {
        chat.uid = SYSTEM.generateRandomString(22);
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_links === undefined) {
        chat.two_step_links = {};
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_waiting === undefined) {
        chat.two_step_waiting = {};
    }
}

/**
 * 获取当前滑动对话的唯一标识符
 * @param chat
 * @returns {string}
 */
function getSwipeUid(chat) {
    // 初始化chat
    InitChatForTableTwoStepSummary(chat);
    // 获取当前swipe的唯一标识符
    const swipeUid = `${chat.uid}_${chat.swipe_id}`;
    // 检查当前swipe是否已经存在必要的数据结构
    if (!(swipeUid in chat.two_step_links)) chat.two_step_links[swipeUid] = [];
    if (!(swipeUid in chat.two_step_waiting)) chat.two_step_waiting[swipeUid] = true;
    return swipeUid;
}

/**
 * 检查当前chat是否已经被父级chat执行过
 * @param chat
 * @param targetSwipeUid
 * @returns {*}
 */
function checkIfChatIsExecuted(chat, targetSwipeUid) {
    const chatSwipeUid = getSwipeUid(chat); // 获取当前chat的唯一标识符
    const chatExecutedSwipes = chat.two_step_links[chatSwipeUid]; // 获取当前chat已经执行过的父级chat
    return chatExecutedSwipes.includes(targetSwipeUid);   // 检查当前chat是否已经被目标chat执行过
}

/**
 * 处理对话中的标识符
 * @param string
 * @returns {string}
 */
function handleMessages(string) {
    let r = string.replace(/<(tableEdit|think|thinking)>[\s\S]*?<\/\1>/g, '');

    return r;
}

function MarkChatAsWaiting(chat, swipeUid) {
    Logger.debug('Current chat context:', USER.getContext().chat);
    Logger.debug('chat.two_step_links:', chat.two_step_links);
    Logger.debug('chat.two_step_waiting:', chat.two_step_waiting);
    chat.two_step_waiting[swipeUid] = true;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary(mode, messageContent = null) {
    Logger.group(`TableTwoStepSummary - mode: ${mode}`);
    try {
        if (mode !== "manual" && (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false)) return;

        let todoChats;

    if (messageContent) {
        todoChats = messageContent;
        Logger.info('使用提供的消息内容进行填表:', todoChats);
    } else {
        const { piece: todoPiece } = USER.getChatPiece();
        if (!todoPiece || !todoPiece.mes) {
            EDITOR.error('未找到待填表的对话片段，请检查当前对话是否正确。');
            return;
        }
        todoChats = todoPiece.mes;
    }

    Logger.info('待填表的对话片段:', todoChats);

    const popupId = 'stepwiseSummaryConfirm';
    let confirmResult;

    // 核心修复：在调用弹窗前，先检查 "一直选是" 的状态
    const alwaysConfirm = alwaysConfirmPopups[popupId];

    if (alwaysConfirm) {
        // 如果用户已经选择“一直选是”，则跳过弹窗，直接设置为 true
        confirmResult = true;
        Logger.info(`[Memory Enhancement] 检测到 “${popupId}” 已设置为 '一直选是'，跳过弹窗。`);
    } else {
        // 否则，正常显示弹窗
        const popupContentHtml = `<p>累计 ${todoChats.length} 长度的文本，是否开始独立填表？</p>`;
        confirmResult = await newPopupConfirm(
            popupContentHtml,
            "取消",
            "执行填表",
            popupId,
            "不再提示",
            "一直选是"
        );
        Logger.info('newPopupConfirm result for stepwise summary:', confirmResult);
    }

    if (confirmResult === false) {
        Logger.info('用户取消执行独立填表: ', `(${todoChats.length}) `, toBeExecuted);
        // MarkChatAsWaiting is not fully implemented, commenting out for now
        // MarkChatAsWaiting(currentPiece, swipeUid);
        return 'cancelled'; // 返回取消状态
    } else {
        // [新增功能] 在确认填表后，如果“填完再发”未开启，则自动跳转
        if (USER.tableBaseSetting.wait_for_fill_then_send === false) {
            // [修复] 采用轮询+延迟的方式，确保跳转时目标消息已渲染，解决竞态条件
            (async () => {
                try {
                    if (typeof globalThis.TavernHelper?.triggerSlash !== 'function' || typeof globalThis.TavernHelper?.getLastMessageId !== 'function') {
                        return;
                    }

                    const lastMessageId = globalThis.TavernHelper.getLastMessageId();
                    let messageElement;
                    const maxAttempts = 30; // 最多尝试30次 (3秒)
                    let attempts = 0;

                    // 轮询等待DOM元素出现
                    while (attempts < maxAttempts) {
                        messageElement = document.querySelector(`div.mes[mesid="${lastMessageId}"]`);
                        if (messageElement) break;
                        await new Promise(resolve => setTimeout(resolve, 100));
                        attempts++;
                    }

                    if (messageElement) {
                        // 找到元素后，再短暂延迟，确保渲染稳定
                        await new Promise(resolve => setTimeout(resolve, 150));
                        // [新增] 通知前端UI显示加载动画
                        if (globalThis.stMemoryEnhancement && typeof globalThis.stMemoryEnhancement._notifyTableFillStart === 'function') {
                            globalThis.stMemoryEnhancement._notifyTableFillStart();
                        }
                        Logger.info(`[Memory Enhancement] 分步填表开始，执行跳转: /chat-jump ${lastMessageId}`);
                        globalThis.TavernHelper.triggerSlash(`/chat-jump ${lastMessageId}`);
                    } else {
                        Logger.warn(`[Memory Enhancement] 轮询3秒后，仍无法找到目标消息 (ID: ${lastMessageId})，跳转取消。`);
                    }
                } catch (e) {
                    Logger.error('[Memory Enhancement] 执行 /chat-jump 失败:', e);
                }
            })();
        }

        // 根据模式决定是否刷新页面
        const shouldReload = mode !== 'auto_wait';
        // 移除 “检测到自动确认设置...” 的提示
        // 核心修复：返回 manualSummaryChat 的执行结果
        return manualSummaryChat(todoChats, confirmResult, shouldReload);
    }
    } finally {
        Logger.groupEnd();
    }
}


/**
 * 手动总结聊天（立即填表）
 * 重构逻辑：
 * 1. 恢复：首先调用内建的 `undoSheets` 函数，将表格状态恢复到上一版本。
 * 2. 执行：以恢复后的干净状态为基础，调用标准增量更新流程，向AI请求新的操作并执行。
 * @param {Array} todoChats - 需要用于填表的聊天记录。
 * @param {string|boolean} confirmResult - 用户的确认结果。
 * @param {boolean} shouldReload - 是否在完成后刷新页面。
 */
export async function manualSummaryChat(todoChats, confirmResult, shouldReload = true) {
    let finalStatus = 'error'; // 用于跟踪流程的最终结果

    try {
        // 步骤一：检查是否需要执行“撤销”操作
        const { piece: initialPiece } = USER.getChatPiece();
        if (!initialPiece) {
            Logger.warn('[Memory Enhancement] 无法获取当前的聊天片段，自动填充已中止。');
            return 'no_carrier';
        }

        if (initialPiece.hash_sheets && Object.keys(initialPiece.hash_sheets).length > 0) {
            Logger.info('[Memory Enhancement] 立即填表：检测到表格中有数据，执行恢复操作...');
            await undoSheets(0); // 此操作内部的保存将被“保存锁”拦截
            EDITOR.success('表格已恢复到上一版本。');
            Logger.info('[Memory Enhancement] 表格恢复成功，准备执行填表。');
        } else {
            Logger.info('[Memory Enhancement] 立即填表：检测到为空表，跳过恢复步骤，直接执行填表。');
        }

        // 步骤二：以当前状态（可能已恢复）为基础，继续执行填表
        const { piece: referencePiece } = USER.getChatPiece();
        if (!referencePiece) {
            EDITOR.error("无法获取用于操作的聊天片段，操作中止。");
            return 'error';
        }
        
        const originText = getTablePrompt(referencePiece, false, true);
        const finalPrompt = initTableData();
        const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;
        const isSilentMode = confirmResult === 'dont_remind_active';

        const r = await executeIncrementalUpdateFromSummary(
            todoChats,
            originText,
            finalPrompt,
            referencePiece,
            useMainApiForStepByStep,
            USER.tableBaseSetting.bool_silent_refresh,
            isSilentMode
        );

        Logger.info('执行独立填表（增量更新）结果:', r);
        if (r === 'success') {
            finalStatus = 'success';
            clearStepData();
            toBeExecuted = [];

            // [v9.0.5] 修复：统一调用内部和外部UI刷新
            triggerTableUpdateCallbacks();
            BASE.refreshContextView();

        } else {
            finalStatus = r || 'error';
            Logger.warn('执行增量独立填表失败或取消: ', `(${todoChats.length}) `, toBeExecuted);
        }
        
        // [v9.0.6] 修复：在操作成功后直接保存
        if (finalStatus === 'success') {
            await USER.saveChat();
        }

    } catch (e) {
        EDITOR.error('“立即填表”流程发生严重错误', e.message, e);
        finalStatus = 'error';
    }
    
    return finalStatus; // 返回最终状态
}

/**
 * (外部调用) 根据最新的AI回复，仅执行增量填表操作。
 * 专为特殊角色卡等需要后置触发填表的场景设计。
 * 核心逻辑：确保使用内存中的实时表格数据作为操作基础，执行更新，然后将更新后的数据同步回主内存状态。
 */
export async function triggerTableFillFromLastMessage() {
    let finalStatus = 'error';

    try {
        // 1. 获取当前最新消息（AI的回复），这是需要分析以更新表格的内容。
        const { piece: messagePiece } = USER.getChatPiece();
        if (!messagePiece || !messagePiece.mes) {
            Logger.error('[Memory Enhancement] 外部触发填表失败：未找到最新的对话内容。');
            return 'no_content';
        }
        const todoChats = messagePiece.mes;

        // 2. 核心修复：确保我们使用内存中的实时表格数据作为操作基础，并将其写回当前消息条目。
        Logger.info('[Memory Enhancement] 外部触发填表：从内存动态获取实时表格数据，并覆盖当前消息中的表格。');
        messagePiece.hash_sheets = {};
        messagePiece.cell_history = {};
        const sheets = BASE.getChatSheets();
        sheets.forEach(sheet => {
            sheet.save(messagePiece);
        });

        // 3. 准备提示词和设置
        const originText = getTablePrompt(messagePiece, false, true);
        const finalPrompt = initTableData();
        const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;

        // 4. 静默执行增量更新
        Logger.info('[Memory Enhancement] 正在从外部触发器执行增量填表...');
        const r = await executeIncrementalUpdateFromSummary(
            todoChats,
            originText,
            finalPrompt,
            messagePiece,
            useMainApiForStepByStep,
            USER.tableBaseSetting.bool_silent_refresh,
            true
        );

        // 5. 处理结果
        if (r === 'success') {
            finalStatus = 'success';
            clearStepData();

            try {
                Logger.info('[Memory Enhancement] 填表成功，正在将更新后的数据同步回主内存状态...');
                // [hotfix] 修复了v6.0.6版本中因API调用错误导致外部触发填表失败的问题。
                // 旧的 `BASE.load` 不存在，应使用 `applyJsonToChatSheets` 来更新内存中的表格数据。
                BASE.applyJsonToChatSheets(messagePiece.hash_sheets, 'data');
                Logger.info('[Memory Enhancement] 主内存状态同步完成。');
            } catch (e) {
                Logger.error('[Memory Enhancement] 将更新后的表格同步回BASE内存失败:', e);
            }

            try {
                // [v9.0.5] 修复：统一调用内部和外部UI刷新
                triggerTableUpdateCallbacks();
                BASE.refreshContextView();
            } catch (e) {
                Logger.error('[Memory Enhancement] 外部触发填表后，通知UI更新失败:', e);
            }
            Logger.info('[Memory Enhancement] 外部触发填表成功。');

        } else {
            finalStatus = r || 'error';
            Logger.error('[Memory Enhancement] 外部触发填表失败。结果:', r);
        }
    } catch (e) {
        finalStatus = 'error';
        Logger.error('[Memory Enhancement] 外部触发填表流程发生严重错误', e);
    }
    
    // [v9.0.6] 修复：在操作成功后直接保存
    if (finalStatus === 'success') {
        await USER.saveChat();
    }
    
    return finalStatus;
}
