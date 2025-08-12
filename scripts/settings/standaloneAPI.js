// standaloneAPI.js
import { EDITOR, USER } from '../../core/manager.js';
import { buildGoogleRequest, parseGoogleResponse } from '../../services/googleAdapter.js';
import {BASE} from "../../core/manager.js";

function encryptXor(rawKey, deviceId) {
    const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
    const uniqueKeys = [...new Set(keys)];
    const uniqueKeyString = uniqueKeys.join(',');
    if (keys.length !== uniqueKeys.length) {
        return {
            encrypted: Array.from(uniqueKeyString).map((c, i) => c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)).map(c => c.toString(16).padStart(2, '0')).join(''),
            duplicatesRemoved: keys.length - uniqueKeys.length
        };
    }
    return Array.from(uniqueKeyString).map((c, i) => c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)).map(c => c.toString(16).padStart(2, '0')).join('');
}

export function processApiKey(rawKey, deviceId) {
    try {
        const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
        const invalidKeysCount = rawKey.split(',').length - keys.length;
        const encryptedResult = encryptXor(rawKey, deviceId);
        const totalKeys = rawKey.split(',').length;
        const remainingKeys = totalKeys - (encryptedResult.duplicatesRemoved || 0);
        let message = `已更新API Key，共${remainingKeys}个Key`;
        if (totalKeys - remainingKeys > 0 || invalidKeysCount > 0) {
            const removedParts = [];
            if (totalKeys - remainingKeys > 0) removedParts.push(`${totalKeys - remainingKeys}个重复Key`);
            if (invalidKeysCount > 0) removedParts.push(`${invalidKeysCount}个空值`);
            message += `（已去除${removedParts.join('，')}）`;
        }
        return { encryptedResult, encrypted: encryptedResult.encrypted, duplicatesRemoved: encryptedResult.duplicatesRemoved, invalidKeysCount: invalidKeysCount, remainingKeys: remainingKeys, totalKeys: totalKeys, message: message };
    } catch (error) {
        console.error('API Key 处理失败:', error);
        throw error;
    }
}

async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b => parseInt(b, 16));
        return String.fromCharCode(...bytes.map((b, i) => b ^ deviceId.charCodeAt(i % deviceId.length)));
    } catch (e) {
        console.error('解密失败:', e);
        return null;
    }
}

export async function getDecryptedApiKey() {
    try {
        const encrypted = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const deviceId = localStorage.getItem('st_device_id');
        if (!encrypted || !deviceId) return null;
        return await decryptXor(encrypted, deviceId);
    } catch (error) {
        console.error('API Key 解密失败:', error);
        return null;
    }
}

/**主API调用
 * @param {string|Array<object>} systemPrompt - 系统提示或消息数组
 * @param {string} [userPrompt] - 用户提示 (如果第一个参数是消息数组，则此参数被忽略)
 * @param {boolean} [isSilent=false] - 是否以静默模式运行，不显示加载提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleMainAPIRequest(systemPrompt, userPrompt, isSilent = false) {
    let finalSystemPrompt = '';
    let finalUserPrompt = '';
    let suspended = false;

    if (Array.isArray(systemPrompt)) {
        const messages = systemPrompt;
        // Simplified logic without the toast for now to ensure stability
        const response = await TavernHelper.generateRaw({
            ordered_prompts: messages,
            should_stream: true,
        });
        return suspended ? 'suspended' : response;
    } else {
        finalSystemPrompt = systemPrompt;
        finalUserPrompt = userPrompt;
        // Simplified logic without the toast for now to ensure stability
        const response = await EDITOR.generateRaw(
            finalUserPrompt,
            '',
            false,
            false,
            finalSystemPrompt,
        );
        return suspended ? 'suspended' : response;
    }
}

function normalizeApiResponse(responseData) {
    let data = responseData;
    if (typeof data === 'string') {
        try { data = JSON.parse(data); } 
        catch (e) { return { error: { message: 'Invalid JSON response' } }; }
    }
    if (data && typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)) {
        if (Object.hasOwn(data.data, 'data')) { data = data.data; }
    }
    if (data && data.choices && data.choices[0]) { return { content: data.choices[0].message?.content?.trim() }; }
    if (data && data.content) { return { content: data.content.trim() }; }
    if (data && data.data) { return { data: data.data }; }
    if (data && data.error) { return { error: data.error }; }
    return data;
}

export async function handleApiTestRequest(apiSettings) {
    const decryptedApiKey = await getDecryptedApiKey();
    if (!decryptedApiKey) {
        EDITOR.error('API Key 解密失败或未设置！');
        return false;
    }
    
    // Use the first key for testing
    apiSettings.api_key = decryptedApiKey.split(',')[0].trim();

    if ((apiSettings.api_mode !== 'google' && !apiSettings.api_url) || !apiSettings.api_key || !apiSettings.model_name) {
        EDITOR.error('请先填写所有必需的API设置。');
        return false;
    }

    try {
        const result = await testApiConnection(apiSettings);
        if (result.success) {
            EDITOR.success(`测试成功！API返回: "${result.content}"`, 'API连接正常');
        } else {
            throw new Error(result.error || '未知错误');
        }
        return result.success;
    } catch (error) {
        console.error(`API连接测试失败:`, error);
        EDITOR.error(`测试失败: ${error.message}`, 'API连接失败');
        return false;
    }
}

async function testApiConnection(apiSettings) {
    const testMessages = [{ role: 'user', content: 'Say "Hi"' }];
    let result;

    console.log(`[Memory Enhancement] 开始API连接测试 (模式: ${apiSettings.api_mode})...`);

    if (apiSettings.api_mode === 'backend') {
        const rawResponse = await $.ajax({
            url: '/api/backends/chat-completions/generate',
            type: 'POST',
            contentType: 'application/json',
            headers: { 'Authorization': `Bearer ${apiSettings.api_key}` },
            data: JSON.stringify({
                messages: testMessages,
                model: apiSettings.model_name,
                max_tokens: 5,
                temperature: apiSettings.temperature,
                top_p: apiSettings.top_p,
                presence_penalty: apiSettings.presence_penalty,
                frequency_penalty: apiSettings.frequency_penalty,
                stream: false,
                chat_completion_source: 'custom',
                custom_url: apiSettings.api_url,
                api_key: apiSettings.api_key,
            }),
        });
        console.log('[Memory Enhancement] 后端代理测试收到原始响应:', rawResponse);
        result = normalizeApiResponse(rawResponse);
    } else {
        let finalApiUrl, body, headers = { 'Content-Type': 'application/json' }, responseParser = normalizeApiResponse;

        if (apiSettings.api_mode === 'google') {
            const apiVersion = 'v1beta';
            finalApiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${apiSettings.model_name}:generateContent?key=${apiSettings.api_key}`;
            body = JSON.stringify(buildGoogleRequest(testMessages, { ...apiSettings, max_tokens: 5 }));
            responseParser = (resp) => normalizeApiResponse(parseGoogleResponse(resp));
        } else { // frontend
            headers['Authorization'] = `Bearer ${apiSettings.api_key}`;
            finalApiUrl = apiSettings.api_url.replace(/\/$/, '') + '/chat/completions';
            body = JSON.stringify({
                messages: testMessages, model: apiSettings.model_name, max_tokens: 5,
                temperature: apiSettings.temperature, top_p: apiSettings.top_p,
                presence_penalty: apiSettings.presence_penalty, frequency_penalty: apiSettings.frequency_penalty,
                stream: false,
            });
        }

        console.log(`[Memory Enhancement] 准备发送前端请求至 ${finalApiUrl}`);
        console.log('[Memory Enhancement] 请求体:', body);
        
        const response = await fetch(finalApiUrl, { method: 'POST', headers, body });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const jsonResponse = await response.json();
        console.log('[Memory Enhancement] 前端直连收到原始响应:', jsonResponse);
        result = responseParser(jsonResponse);
    }

    if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
    if (result.content !== undefined) return { success: true, content: result.content };
    
    throw new Error('API响应中未找到有效内容。');
}

export async function updateModelList() {
    const api_mode = $('#custom_api_mode').val();
    let api_url = $('#custom_api_url').val().trim();
    const decryptedApiKey = await getDecryptedApiKey();
    const $selector = $('#model_selector');

    if (!decryptedApiKey) {
        EDITOR.error('API Key解密失败或未设置!');
        return;
    }
    const apiKey = decryptedApiKey.split(',')[0].trim();

    if (api_mode !== 'google' && !api_url) {
        EDITOR.error('请输入API URL');
        return;
    }
    
    $selector.prop('disabled', true).empty().append($('<option>', { value: '', text: '正在获取...' }));

    try {
        let rawResponse;
        if (api_mode === 'backend') {
            rawResponse = await $.ajax({
                url: '/api/backends/chat-completions/status',
                type: 'POST',
                contentType: 'application/json',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                data: JSON.stringify({ chat_completion_source: 'custom', custom_url: api_url, api_key: apiKey }),
            });
        } else {
            let modelsUrl, headers = {}, responseTransformer = (json) => json.data || [];
            if (api_mode === 'google') {
                const apiVersion = 'v1beta';
                modelsUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models?key=${apiKey}`;
                responseTransformer = (json) => json.models
                    ?.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                    ?.map(m => ({ id: m.name.replace('models/', '') })) || [];
            } else { // frontend
                headers['Authorization'] = `Bearer ${apiKey}`;
                modelsUrl = api_url.replace(/\/$/, '') + '/models';
            }
            const response = await fetch(modelsUrl, { method: 'GET', headers });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            rawResponse = { data: responseTransformer(await response.json()) };
        }

        const result = normalizeApiResponse(rawResponse);
        const models = result.data || [];
        if (result.error || !Array.isArray(models)) {
            throw new Error(result.error?.message || 'API未返回有效的模型列表数组。');
        }

        $selector.prop('disabled', false).empty();
        const customModelName = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
        let hasMatchedModel = false;
        models.sort((a, b) => (a.id || '').localeCompare(b.id || '')).forEach(model => {
            if (model.id) {
                $selector.append($('<option>', { value: model.id, text: model.id }));
                if (model.id === customModelName) hasMatchedModel = true;
            }
        });

        if (hasMatchedModel) $selector.val(customModelName);
        else if (models.length > 0) {
            $('#custom_model_name').val(models[0].id);
            USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = models[0].id;
        }

        EDITOR.success(`成功获取 ${models.length} 个模型`);

    } catch (error) {
        console.error(`获取模型列表失败:`, error);
        EDITOR.error(`获取模型列表失败: ${error.message}`);
        $selector.prop('disabled', false).empty().append($('<option>', { value: '', text: '获取失败,请手动输入' }));
    }
}


// Other functions from the original file that are not related to API calls can be kept if needed.
// For this refactoring, we focus on the API interaction logic.

/**
 * 估算 Token 数量
 * @param {string} text - 要估算 token 数量的文本
 * @returns {number} 估算的 token 数量
 */
export function estimateTokenCount(text) {
    // 统计中文字符数量
    let chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;

    // 统计英文单词数量
    let englishWords = text.match(/\b\w+\b/g) || [];
    let englishCount = englishWords.length;

    // 估算 token 数量
    let estimatedTokenCount = chineseCount + Math.floor(englishCount * 1.2);
    return estimatedTokenCount;
}

/**
 * Main function to call the custom API for summarizing/updating tables.
 * This is called by absoluteRefresh.js.
 * @param {string|Array<object>} systemPrompt - The system prompt or full message array.
 * @param {string} [userPrompt] - The user prompt (ignored if systemPrompt is an array).
 * @param {boolean} [isStepByStepSummary=false]
 * @param {boolean} [isSilentMode=false]
 * @returns {Promise<string>} The API response content.
 */
export async function handleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary = false, isSilentMode = false) {
    console.group(`[Memory Enhancement] handleCustomAPIRequest`);
    const decryptedApiKey = await getDecryptedApiKey();
    if (!decryptedApiKey) {
        EDITOR.error('API key解密失败或未设置!');
        console.groupEnd();
        return 'error';
    }

    const apiSettings = {
        api_mode: USER.tableBaseSetting.custom_api_mode || 'frontend',
        api_url: USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url,
        api_key: decryptedApiKey.split(',')[0].trim(), // Use the first key
        model_name: USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name,
        temperature: USER.tableBaseSetting.custom_temperature,
        max_tokens: USER.tableBaseSetting.custom_max_tokens,
        top_p: USER.tableBaseSetting.custom_top_p,
        presence_penalty: USER.tableBaseSetting.custom_presence_penalty,
        frequency_penalty: USER.tableBaseSetting.custom_frequency_penalty,
    };

    const messages = Array.isArray(systemPrompt) ? systemPrompt : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ];

    try {
        let result;
        console.log(`[Memory Enhancement] 执行API请求 (模式: ${apiSettings.api_mode})`);

        if (apiSettings.api_mode === 'backend') {
            const requestData = {
                messages: messages,
                model: apiSettings.model_name,
                max_tokens: apiSettings.max_tokens,
                temperature: apiSettings.temperature,
                top_p: apiSettings.top_p,
                presence_penalty: apiSettings.presence_penalty,
                frequency_penalty: apiSettings.frequency_penalty,
                stream: false,
                chat_completion_source: 'custom',
                custom_url: apiSettings.api_url,
                api_key: apiSettings.api_key,
            };
            console.log('[Memory Enhancement] 后端代理请求体:', JSON.stringify(requestData, null, 2));

            const rawResponse = await $.ajax({
                url: '/api/backends/chat-completions/generate',
                type: 'POST',
                contentType: 'application/json',
                headers: { 'Authorization': `Bearer ${apiSettings.api_key}` },
                data: JSON.stringify(requestData),
            });
            console.log('[Memory Enhancement] 后端代理收到原始响应:', rawResponse);
            result = normalizeApiResponse(rawResponse);
        } else {
            let finalApiUrl, body, headers = { 'Content-Type': 'application/json' }, responseParser = normalizeApiResponse;

            if (apiSettings.api_mode === 'google') {
                const apiVersion = 'v1beta';
                finalApiUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models/${apiSettings.model_name}:generateContent?key=${apiSettings.api_key}`;
                body = JSON.stringify(buildGoogleRequest(messages, apiSettings));
                responseParser = (resp) => normalizeApiResponse(parseGoogleResponse(resp));
            } else { // frontend
                headers['Authorization'] = `Bearer ${apiSettings.api_key}`;
                finalApiUrl = apiSettings.api_url.replace(/\/$/, '') + '/chat/completions';
                body = JSON.stringify({
                    messages: messages,
                    model: apiSettings.model_name,
                    max_tokens: apiSettings.max_tokens,
                    temperature: apiSettings.temperature,
                    top_p: apiSettings.top_p,
                    presence_penalty: apiSettings.presence_penalty,
                    frequency_penalty: apiSettings.frequency_penalty,
                    stream: false,
                });
            }
            
            console.log(`[Memory Enhancement] 准备发送前端请求至 ${finalApiUrl}`);
            console.log('[Memory Enhancement] 请求体:', body);

            const response = await fetch(finalApiUrl, { method: 'POST', headers, body });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            const jsonResponse = await response.json();
            console.log('[Memory Enhancement] 前端直连收到原始响应:', jsonResponse);
            result = responseParser(jsonResponse);
        }

        if (result.error) throw new Error(result.error.message || JSON.stringify(result.error));
        if (result.content !== undefined) return result.content;
        
        throw new Error('API响应中未找到有效内容。');

    } catch (error) {
        EDITOR.error('自定义API请求错误: ' + error.message);
        return `错误: ${error.message}`;
    } finally {
        console.groupEnd();
    }
}

// The functions ext_getAllTables, ext_exportAllTablesAsJson etc. should be kept.

export function ext_getAllTables() {
    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) return [];
    const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
    if (!tables || tables.length === 0) return [];
    return tables.map(table => {
        if (!table.enable) return null;
        return { name: table.name, data: [table.getHeader(), ...table.getBody()] };
    }).filter(Boolean);
}

export function ext_hashSheetsToJson(hashSheets) {
    const exportData = {};
    if (!hashSheets) return exportData;
    try {
        const tables = BASE.hashSheetsToSheets(hashSheets);
        tables?.forEach(table => {
            if (table.enable) {
                exportData[table.uid] = { uid: table.uid, name: table.name, content: table.getContent(true) || [] };
            }
        });
    } catch (error) {
        console.error("从 hash_sheets 转换表格时发生意外错误:", error);
    }
    return exportData;
}

export function ext_exportAllTablesAsJson() {
    let exportData = {};
    try {
        const { piece } = BASE.getLastSheetsPiece();
        if (piece && piece.hash_sheets) {
            exportData = ext_hashSheetsToJson(piece.hash_sheets);
        }
    } catch (error) {
        console.error("从聊天记录导出表格时发生意外错误:", error);
    }
    return exportData;
}

/**
 * 将表格数据暂存到浏览器本地存储 (localStorage)
 * @param {string} key - 存储的键名
 * @param {string} content - 要存储的内容 (JSON字符串)
 * @returns {Promise<boolean>} - 是否成功
 */
export async function saveDataToLocalStorage(key, content) {
    try {
        localStorage.setItem(key, content);
        console.log(`[Memory Enhancement] 成功将数据暂存到 localStorage (key: ${key})`);
        return true;
    } catch (e) {
        console.error(`[Memory Enhancement] 写入 localStorage 失败:`, e);
        return false;
    }
}

/**
 * 从浏览器本地存储 (localStorage) 读取暂存的表格数据
 * @param {string} key - 存储的键名
 * @returns {Promise<string|null>} - 存储的内容或null
 */
export async function readDataFromLocalStorage(key) {
    try {
        const content = localStorage.getItem(key);
        console.log(`[Memory Enhancement] 从 localStorage 读取数据 (key: ${key}):`, content ? '找到内容' : '未找到内容');
        return content;
    } catch (e) {
        console.error(`[Memory Enhancement] 从 localStorage 读取失败:`, e);
        return null;
    }
}
