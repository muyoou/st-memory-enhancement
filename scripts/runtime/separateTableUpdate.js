import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { executeIncrementalUpdateFromSummary, sheetsToTables } from "./absoluteRefresh.js";
import { newPopupConfirm } from '../../components/popupConfirm.js';
import { reloadCurrentChat } from "/script.js"
import {getTablePrompt,initTableData} from "../../index.js"

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
    console.log(USER.getContext().chat);
    console.log('chat.two_step_links:',chat.two_step_links);
    console.log('chat.two_step_waiting:',chat.two_step_waiting);
    chat.two_step_waiting[swipeUid] = true;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary(mode) {
    if (mode!=="manual" && (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false)) return

    // 获取需要执行的两步总结
    const {piece: todoPiece} = USER.getChatPiece()

    if (todoPiece === undefined) {
        console.log('未找到待填表的对话片段');
        EDITOR.error('未找到待填表的对话片段，请检查当前对话是否正确。');
        return;
    }
    let todoChats = todoPiece.mes;

    console.log('待填表的对话片段:', todoChats);

    // 检查是否开启执行前确认
    const popupContentHtml = `<p>累计 ${todoChats.length} 长度的文本，是否开始独立填表？</p>`;
    // 移除了模板选择相关的HTML和逻辑

    const popupId = 'stepwiseSummaryConfirm';
    const confirmResult = await newPopupConfirm(
        popupContentHtml,
        "取消",
        "执行填表",
        popupId,
        "一直选是" // <--- 修改按钮文本
    );

    console.log('newPopupConfirm result for stepwise summary:', confirmResult);

    if (confirmResult === false) {
        console.log('用户取消执行独立填表: ', `(${todoChats.length}) `, toBeExecuted);
        MarkChatAsWaiting(currentPiece, swipeUid);
    } else {
        // This block executes if confirmResult is true OR 'dont_remind_active'
        if (confirmResult === 'dont_remind_active') {
            console.log('独立填表弹窗已被禁止，自动执行。');
            EDITOR.info('已选择“一直选是”，操作将在后台自动执行...'); // <--- 增加后台执行提示
        } else { // confirmResult === true
            console.log('用户确认执行独立填表 (或首次选择了“一直选是”并确认)');
        }
        manualSummaryChat(todoChats, confirmResult);
    }
}

/**
 * 手动总结聊天
 * @param {} chat 
 */
export async function manualSummaryChat(todoChats, confirmResult) {

    // 设置一个旗标，用于在onChatCompletionPromptReady中判断是否为填表请求
    DERIVED.any.isAITableFillingRequest = true;

    // 参考piece
    const referencePiece = BASE.getReferencePiece();

    // 表格数据
    const originText = getTablePrompt()

    // 表格总体提示词
    const finalPrompt = initTableData(); // 获取表格相关提示词
    
    // 设置
    const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;
    const isSilentMode = confirmResult === 'dont_remind_active';

    const r = await executeIncrementalUpdateFromSummary(
        todoChats,
        originText,
        finalPrompt,
        referencePiece,
        useMainApiForStepByStep, // API choice for step-by-step
        USER.tableBaseSetting.bool_silent_refresh, // isSilentUpdate
        isSilentMode // Pass silent mode flag
    );

    console.log('执行独立填表（增量更新）结果:', r);
    if (r === 'success') {
        toBeExecuted.forEach(chat => {
            const chatSwipeUid = getSwipeUid(chat);
            chat.two_step_links[chatSwipeUid].push(swipeUid);   // 标记已执行的两步总结
        });
        toBeExecuted = [];
        reloadCurrentChat();
        return true;
    } else if (r === 'suspended' || r === 'error' || !r) {
        console.log('执行增量独立填表失败或取消: ', `(${todoChats.length}) `, toBeExecuted);
        return false;
    }
    
}