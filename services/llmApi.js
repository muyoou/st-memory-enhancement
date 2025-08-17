import {EDITOR, USER} from '../core/manager.js';
import { MultiApiService } from './multiApiService.js';

// @ts-ignore
let ChatCompletionService = undefined;
try {
    // 动态导入，兼容模块不存在的情况
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    console.warn("未检测到 /scripts/custom-request.js 或未正确导出 ChatCompletionService，将禁用代理相关功能。", e);
}

/**
 * LLM API服务类 - 兼容旧接口的包装器
 * 内部使用新的MultiApiService实现多格式API支持
 */
export class LLMApiService {
    constructor(config = {}) {
        // 从用户设置中获取API格式和其他参数
        const apiFormat = USER.tableBaseSetting?.api_format || 'auto';
        
        this.multiApiService = new MultiApiService({
            ...config,
            api_format: apiFormat,
            system_prompt: USER.tableBaseSetting?.custom_system_prompt || config.system_prompt || "",
            max_tokens: USER.tableBaseSetting?.custom_max_tokens || config.max_tokens || 63000,
            top_p: USER.tableBaseSetting?.custom_top_p || config.top_p || 1.0,
            top_k: USER.tableBaseSetting?.custom_top_k || config.top_k || 40,
            frequency_penalty: USER.tableBaseSetting?.custom_frequency_penalty || config.frequency_penalty || 0.0,
            presence_penalty: USER.tableBaseSetting?.custom_presence_penalty || config.presence_penalty || 0.0,
            temperature: USER.tableBaseSetting?.custom_temperature || config.temperature || 1.0
        });
        
        // 保持向后兼容的config属性
        this.config = this.multiApiService.config;
    }

    /**
     * 调用LLM API
     * @param {string|Array} prompt - 提示词
     * @param {Function} streamCallback - 流式回调
     * @returns {Promise<string>} - API响应
     */
    async callLLM(prompt, streamCallback = null) {
        return await this.multiApiService.callLLM(prompt, streamCallback);
    }

    /**
     * 测试API连接
     * @returns {Promise<string>} - 测试响应
     */
    async testConnection() {
        return await this.multiApiService.testConnection();
    }

    /**
     * 清理响应文本
     * @param {string} text - 原始文本
     * @returns {string} - 清理后的文本
     */
    #cleanResponse(text) {
        return this.multiApiService.cleanResponse(text);
    }
}

export default LLMApiService;
