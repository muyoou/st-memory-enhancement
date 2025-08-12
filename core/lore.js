import { USER } from './manager.js';
import { Logger } from '../services/logger.js';

/**
 * 提取并合并当前角色所有关联世界书的内容，并根据新的、支持递归的筛选逻辑进行处理。
 * 
 * @returns {Promise<string>} - 返回一个包含所有最终触发的世界书条目内容的字符串。
 */
export async function getCombinedWorldbookContent() {
    // 确保 TavernHelper API 和 context 可用
    if (!window.TavernHelper?.getCharLorebooks || !window.TavernHelper?.getLorebookEntries) {
        Logger.warn('[Memory Enhancement] TavernHelper API 未提供，无法获取世界书内容。');
        return '';
    }
    
    const context = USER.getContext();
    if (!context) {
        Logger.warn('[Memory Enhancement] Context 未提供，无法获取世界书内容。');
        return '';
    }

    try {
        const chatHistory = context.chat.map(message => message.mes).join('\n').toLowerCase();

        // 1. 获取并分类所有已启用的世界书条目
        const charLorebooks = await window.TavernHelper.getCharLorebooks({ type: 'all' });
        const bookNames = [];
        if (charLorebooks.primary) bookNames.push(charLorebooks.primary);
        if (charLorebooks.additional?.length) bookNames.push(...charLorebooks.additional);

        if (bookNames.length === 0) return '';

        let allEnabledEntries = [];
        for (const bookName of bookNames) {
            if (bookName) {
                const entries = await window.TavernHelper.getLorebookEntries(bookName);
                if (entries?.length) {
                    allEnabledEntries.push(...entries.filter(entry => entry.enabled));
                }
            }
        }

        const getEntryKeywords = (entry) => [...new Set([...(entry.key || []), ...(entry.keys || [])])].map(k => k.toLowerCase());

        // 2. 初始化递归逻辑
        const blueLightEntries = allEnabledEntries.filter(entry => entry.type === 'constant');
        let pendingGreenLights = allEnabledEntries.filter(entry => entry.type !== 'constant');
        
        const triggeredEntries = new Set([...blueLightEntries]);

        // 3. 开始递归触发循环
        let recursionDepth = 0;
        const maxRecursionDepth = 10; // 防止无限循环

        while (recursionDepth < maxRecursionDepth) {
            let hasChangedInThisPass = false;
            
            // 构建本轮次的搜索文本
            const recursionSourceContent = Array.from(triggeredEntries)
                .filter(e => !e.prevent_recursion)
                .map(e => e.content)
                .join('\n')
                .toLowerCase();
            const fullSearchText = `${chatHistory}\n${recursionSourceContent}`;

            const nextPendingGreenLights = [];
            
            // 遍历待处理的绿灯条目
            for (const entry of pendingGreenLights) {
                const keywords = getEntryKeywords(entry);
                let isTriggered = false;
                if (keywords.length > 0) {
                    isTriggered = keywords.some(keyword => {
                        if (entry.exclude_recursion) {
                            return chatHistory.includes(keyword);
                        }
                        return fullSearchText.includes(keyword);
                    });
                }

                if (isTriggered) {
                    triggeredEntries.add(entry);
                    hasChangedInThisPass = true;
                } else {
                    nextPendingGreenLights.push(entry);
                }
            }
            
            // 如果本轮没有新条目被触发，则递归结束
            if (!hasChangedInThisPass) {
                break;
            }
            
            pendingGreenLights = nextPendingGreenLights;
            recursionDepth++;
        }

        if (recursionDepth >= maxRecursionDepth) {
            Logger.warn('[Memory Enhancement] 世界书递归达到最大深度，可能存在循环触发。');
        }

        // 4. 格式化并返回最终结果
        const finalContent = Array.from(triggeredEntries)
            .map(entry => entry.content)
            .filter(Boolean);

        if (finalContent.length === 0) {
            return '';
        }

        const combinedContent = finalContent.join('\n\n---\n\n');
        
        // 从记忆插件的设置中读取限制
        const limit = USER.tableBaseSetting?.world_book_limit || 60000;

        if (combinedContent.length > limit) {
            return combinedContent.substring(0, limit);
        }

        return combinedContent;

    } catch (error) {
        Logger.error(`[Memory Enhancement] 处理递归世界书逻辑时出错:`, error);
        return '';
    }
}
