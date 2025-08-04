// standaloneAPI.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { generateRandomSeed } from '../../utils/utility.js';
import LLMApiService from "../../services/llmApi.js";
import {PopupConfirm} from "../../components/popupConfirm.js";

let loadingToast = null;
let currentApiKeyIndex = 0;// 用于记录当前使用的API Key的索引

/**
 * 统一处理和规范化API响应数据。
 * @param {*} responseData - 原始响应数据
 * @returns {object} 规范化后的数据对象
 */
function normalizeApiResponse(responseData) {
    let data = responseData;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error("API响应JSON解析失败:", e);
            return { error: { message: 'Invalid JSON response' } };
        }
    }
    if (data && typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)) {
        if (Object.hasOwn(data.data, 'data')) {
            data = data.data;
        }
    }
    return data;
}

export function encryptXor(rawKey, deviceId) {
    const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
    const uniqueKeys = [...new Set(keys)];
    const uniqueKeyString = uniqueKeys.join(',');
    if (keys.length !== uniqueKeys.length) {
        return {
            encrypted: Array.from(uniqueKeyString).map((c, i) =>
                c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
            ).map(c => c.toString(16).padStart(2, '0')).join(''),
            duplicatesRemoved: keys.length - uniqueKeys.length
        };
    }
    return Array.from(uniqueKeyString).map((c, i) =>
        c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
    ).map(c => c.toString(16).padStart(2, '0')).join('');
}

export function processApiKey(rawKey, deviceId) {
    try {
        const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
        const invalidKeysCount = rawKey.split(',').length - keys.length;
        const encryptedResult = encryptXor(rawKey, deviceId);
        const totalKeys = rawKey.split(',').length;
        const remainingKeys = totalKeys - (encryptedResult.duplicatesRemoved || 0);
        let message = `已更新API Key，共${remainingKeys}个Key`;
        if(totalKeys - remainingKeys > 0 || invalidKeysCount > 0){
            const removedParts = [];
            if (totalKeys - remainingKeys > 0) removedParts.push(`${totalKeys - remainingKeys}个重复Key`);
            if (invalidKeysCount > 0) removedParts.push(`${invalidKeysCount}个空值`);
            message += `（已去除${removedParts.join('，')}）`;
        }
        return {
            encryptedResult,
            encrypted: encryptedResult.encrypted,
            duplicatesRemoved: encryptedResult.duplicatesRemoved,
            invalidKeysCount: invalidKeysCount,
            remainingKeys: remainingKeys,
            totalKeys: totalKeys,
            message: message,
        }
    } catch (error) {
        console.error('API Key 处理失败:', error);
        throw error;
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

async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b => parseInt(b, 16));
        return String.fromCharCode(...bytes.map((b, i) => b ^ deviceId.charCodeAt(i % deviceId.length)));
    } catch(e) {
        console.error('解密失败:', e);
        return null;
    }
}

async function createLoadingToast(isUseMainAPI = true, isSilent = false) {
    if (isSilent) {
        return Promise.resolve(false);
    }
    loadingToast?.close()
    loadingToast = new PopupConfirm();
    return await loadingToast.show(
        isUseMainAPI ? '正在使用【主API】重新生成完整表格...' : '正在使用【自定义API】重新生成完整表格...',
        '后台继续',
        '中止执行',
    )
}

export async function handleMainAPIRequest(systemPrompt, userPrompt, isSilent = false) {
    let suspended = false;
    createLoadingToast(true, isSilent).then((r) => {
        if (loadingToast) loadingToast.close();
        suspended = r;
    });

    let startTime = Date.now();
    if (loadingToast) {
        loadingToast.frameUpdate(() => {
            if (loadingToast) {
                loadingToast.text = `正在使用【主API】重新生成完整表格: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`;
            }
        });
    }

    if (Array.isArray(systemPrompt)) {
        if(!TavernHelper) throw new Error("酒馆助手未安装，总结功能依赖于酒馆助手插件，请安装后刷新");
        systemPrompt.unshift({ role: 'system', content: generateRandomSeed() });
        const response = await TavernHelper.generateRaw({ ordered_prompts: systemPrompt, should_stream: true });
        loadingToast.close();
        return suspended ? 'suspended' : response;
    } else {
        const fullSystemPrompt = `${generateRandomSeed()}\n${systemPrompt}`;
        const response = await EDITOR.generateRaw(userPrompt, '', false, false, fullSystemPrompt);
        loadingToast.close();
        return suspended ? 'suspended' : response;
    }
}

export async function handleApiTestRequest(apiUrl, encryptedApiKeys, modelName) {
    if (!apiUrl || !encryptedApiKeys) {
        EDITOR.error('请先填写 API URL 和 API Key。');
        return [];
    }
    const decryptedApiKeysString = await getDecryptedApiKey();
    if (!decryptedApiKeysString) {
        EDITOR.error('API Key 解密失败或未设置！');
        return [];
    }
    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的 API Key。');
        return [];
    }
    const testAll = await EDITOR.callGenericPopup(`检测到 ${apiKeys.length} 个 API Key。\n注意：测试方式和酒馆自带的相同，将会发送一次消息（token数量很少），但如果使用的是按次计费的API请注意消费情况。`, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "测试第一个key", cancelButton: "取消" });
    if (testAll === null) return [];
    
    const keysToTest = testAll ? [apiKeys[0]] : [];
    if (keysToTest.length === 0) return [];

    EDITOR.info(`开始测试第 ${keysToTest.length} 个 API Key...`);

    try {
        const results = await testApiConnection(apiUrl, keysToTest, modelName);
        EDITOR.clear();
        let successCount = 0;
        let failureCount = 0;
        results.forEach(result => {
            if (result.success) successCount++;
            else {
                failureCount++;
                console.error(`Key ${result.keyIndex + 1} 测试失败: ${result.error}`);
            }
        });

        if (failureCount > 0) {
            EDITOR.error(`${failureCount} 个 Key 测试失败。请检查控制台获取详细信息。`);
            EDITOR.error(`API端点: ${apiUrl}`);
            EDITOR.error(`错误详情: ${results.find(r => !r.success)?.error || '未知错误'}`);
        }
        if (successCount > 0) {
            EDITOR.success(`${successCount} 个 Key 测试成功！`);
        }
        return results;
    } catch (error) {
        EDITOR.error(`API 测试过程中发生错误`, error.message, error);
        console.error("API Test Error:", error);
        return keysToTest.map((_, index) => ({
            keyIndex: apiKeys.indexOf(keysToTest[index]),
            success: false,
            error: `测试过程中发生错误: ${error.message}`
        }));
    }
}

export async function testApiConnection(apiUrl, apiKeys, modelName) {
    const useBackendProxy = USER.tableBaseSetting.custom_api_use_backend_proxy;
    const results = [];
    const testPrompt = "Say 'test'";
    const apiKey = apiKeys[0];

    if (useBackendProxy) {
        // 模式二：我的后端代理逻辑
        try {
            const data = await $.ajax({
                url: '/api/backends/chat-completions/generate',
                type: 'POST',
                contentType: 'application/json',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                data: JSON.stringify({
                    chat_completion_source: 'custom',
                    custom_url: apiUrl,
                    api_key: apiKey,
                    messages: [{ role: 'user', content: testPrompt }],
                    model: modelName || 'gpt-3.5-turbo',
                    temperature: 0.1, max_tokens: 50, stream: false,
                }),
            });
            const responseData = normalizeApiResponse(data);
            if (responseData && Array.isArray(responseData.choices)) {
                results.push({ keyIndex: 0, success: true });
            } else {
                throw new Error(responseData?.error?.message || `收到的响应无效或为空。`);
            }
        } catch (proxyError) {
            results.push({ keyIndex: 0, success: false, error: proxyError.statusText || proxyError.message });
        }
    } else {
        // 模式一：官方直连逻辑
        try {
            const llmService = new LLMApiService({
                api_url: apiUrl,
                api_key: apiKey,
                model_name: modelName || 'gpt-3.5-turbo',
                system_prompt: 'You are a test assistant.',
                temperature: 0.1
            });
            const response = await llmService.callLLM(testPrompt);
            if (response && typeof response === 'string') {
                results.push({ keyIndex: 0, success: true });
            } else {
                throw new Error('Invalid or empty response received.');
            }
        } catch (error) {
            let errorMessage = error.message || 'Unknown error';
            results.push({ keyIndex: 0, success: false, error: errorMessage });
        }
    }
    return results;
}

export async function handleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary = false, isSilent = false) {
    const decryptedApiKeysString = await getDecryptedApiKey();
    if (!decryptedApiKeysString) {
        EDITOR.error('API key解密失败或未设置!');
        return;
    }
    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key.');
        return;
    }

    let suspended = false;
    createLoadingToast(false, isSilent).then(r => {
        loadingToast?.close();
        suspended = r;
    });

    const useBackendProxy = USER.tableBaseSetting.custom_api_use_backend_proxy;

    if (useBackendProxy) {
        // 模式二：我的后端代理逻辑
        const keyIndexToTry = currentApiKeyIndex % apiKeys.length;
        const currentApiKey = apiKeys[keyIndexToTry];
        currentApiKeyIndex++;
        if (loadingToast) {
            loadingToast.text = `尝试使用第 ${keyIndexToTry + 1}/${apiKeys.length} 个自定义API Key...`;
        }
        let messages = Array.isArray(systemPrompt) ? systemPrompt.slice() : [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }];
        messages.unshift({ role: 'system', content: generateRandomSeed() });
        try {
            const requestData = {
                chat_completion_source: 'custom',
                custom_url: USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url,
                api_key: currentApiKey,
                messages: messages,
                model: USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name,
                temperature: USER.tableBaseSetting.custom_temperature,
                stream: false,
            };
            const response = await $.ajax({
                url: '/api/backends/chat-completions/generate',
                type: 'POST',
                contentType: 'application/json',
                headers: { 'Authorization': `Bearer ${currentApiKey}` },
                data: JSON.stringify(requestData),
            });
            const responseData = normalizeApiResponse(response);
            const responseText = responseData?.choices?.[0]?.message?.content;
            if (suspended) return 'suspended';
            if (!responseText) {
                throw new Error(responseData?.error?.message || `响应中未找到有效内容。`);
            }
            loadingToast?.close();
            return responseText;
        } catch (proxyError) {
            const finalErrorMessage = `代理模式失败: ${proxyError.statusText || proxyError.message}`;
            EDITOR.error(`API 调用失败 (Key ${keyIndexToTry + 1}): ${finalErrorMessage}`);
            loadingToast?.close();
            return `错误: ${finalErrorMessage}`;
        }
    } else {
        // 模式一：官方直连逻辑
        return await officialHandleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary, isSilent, apiKeys);
    }
}

async function officialHandleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary, isSilent, apiKeys){
    const USER_API_URL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const USER_API_MODEL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    const MAX_RETRIES = 0;
    if (!USER_API_URL || !USER_API_MODEL) {
        EDITOR.error('请填写完整的自定义API配置 (URL 和模型)');
        return;
    }

    const totalKeys = apiKeys.length;
    const attempts = MAX_RETRIES === 0 ? totalKeys : Math.min(MAX_RETRIES, totalKeys);
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        const keyIndexToTry = currentApiKeyIndex % totalKeys;
        const currentApiKey = apiKeys[keyIndexToTry];
        currentApiKeyIndex++;

        if (loadingToast) {
            loadingToast.text = `尝试使用第 ${keyIndexToTry + 1}/${totalKeys} 个自定义API Key...`;
        }
        try {
            let promptData = Array.isArray(systemPrompt) ? systemPrompt.slice() : userPrompt;
            if (Array.isArray(promptData)) {
                promptData.unshift({ role: 'system', content: generateRandomSeed() });
            }
            const llmService = new LLMApiService({
                api_url: USER_API_URL,
                api_key: currentApiKey,
                model_name: USER_API_MODEL,
                system_prompt: Array.isArray(promptData) ? "" : systemPrompt,
                temperature: USER.tableBaseSetting.custom_temperature,
                table_proxy_address: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                table_proxy_key: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key
            });

            const streamCallback = (chunk) => {
                if (loadingToast) {
                    loadingToast.text = `正在使用第 ${keyIndexToTry + 1} 个Key生成: ${chunk}`;
                }
            };
            const response = await llmService.callLLM(promptData, streamCallback);
            loadingToast?.close();
            return response;
        } catch (llmServiceError) {
            lastError = llmServiceError;
            EDITOR.error(`使用第 ${keyIndexToTry + 1} 个 Key 调用失败: ${llmServiceError.message || '未知错误'}`);
        }
    }
    loadingToast?.close();
    const errorMessage = `所有 ${attempts} 次尝试均失败。最后错误: ${lastError?.message || '未知错误'}`;
    EDITOR.error(errorMessage, "", lastError);
    return `错误: ${errorMessage}`;
}

export async function updateModelList() {
    const apiUrl = $('#custom_api_url').val().trim();
    const $selector = $('#model_selector');
    if (!apiUrl) {
        EDITOR.error('请输入API URL');
        return;
    }
    const decryptedApiKeysString = await getDecryptedApiKey();
    if (!decryptedApiKeysString) {
        EDITOR.error('API Key解密失败或未设置!');
        return;
    }
    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key.');
        return;
    }
    
    $selector.prop('disabled', true).empty().append($('<option>', { value: '', text: '正在获取...' }));

    const processResponse = (rawResponseData) => {
        const responseData = normalizeApiResponse(rawResponseData);
        const models = responseData.data || [];
        if (responseData.error || !Array.isArray(models) || models.length === 0) {
            throw new Error(responseData?.error?.message || '未返回有效模型列表。');
        }
        $selector.prop('disabled', false).empty();
        const customModelName = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
        let hasMatchedModel = false;
        const getModelId = (model) => model.id || model.model;
        const sortedModels = models.sort((a, b) => (getModelId(a) || '').localeCompare(getModelId(b) || ''));
        sortedModels.forEach(model => {
            const modelId = getModelId(model);
            if (!modelId) return;
            $selector.append($('<option>', { value: modelId, text: modelId }));
            if (modelId === customModelName) hasMatchedModel = true;
        });
        if (hasMatchedModel) {
            $selector.val(customModelName);
        } else if (sortedModels.length > 0) {
            const firstModelId = getModelId(sortedModels[0]);
            $('#custom_model_name').val(firstModelId);
            USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = firstModelId;
        }
        EDITOR.success(`成功获取 ${sortedModels.length} 个模型`);
    };

    const useBackendProxy = USER.tableBaseSetting.custom_api_use_backend_proxy;

    if (useBackendProxy) {
        // 模式二：我的后端代理逻辑
        try {
            const data = await $.ajax({
                url: '/api/backends/chat-completions/status',
                type: 'POST',
                contentType: 'application/json',
                headers: { 'Authorization': `Bearer ${apiKeys[0]}` },
                data: JSON.stringify({
                    chat_completion_source: 'custom',
                    custom_url: apiUrl,
                    api_key: apiKeys[0],
                }),
            });
            processResponse(data);
        } catch (proxyError) {
            const finalErrorMessage = `代理模式失败: ${proxyError.statusText || proxyError.message}`;
            EDITOR.error(finalErrorMessage);
            $selector.prop('disabled', false).empty().append($('<option>', { value: '', text: '获取失败,请手动输入' }));
        }
    } else {
        // 模式一：官方直连逻辑
        try {
            const finalApiUrl = apiUrl.replace(/\/$/, '') + '/models';
            const response = await fetch(finalApiUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKeys[0]}` },
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || response.statusText || '请求失败');
            }
            const responseData = await response.json();
            processResponse(responseData);
        } catch (directError) {
            const finalErrorMessage = `直连模式失败: ${directError.message}`;
            EDITOR.error(finalErrorMessage);
            $selector.prop('disabled', false).empty().append($('<option>', { value: '', text: '获取失败,请手动输入' }));
        }
    }
}

export function estimateTokenCount(text) {
    let chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    let englishWords = text.match(/\b\w+\b/g) || [];
    let englishCount = englishWords.length;
    return chineseCount + Math.floor(englishCount * 1.2);
}

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
        if (tables && tables.length > 0) {
            tables.forEach(table => {
                if (!table.enable) return;
                try {
                    const rawContent = table.getContent(true) || [];
                    const sanitizedContent = rawContent.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []);
                    exportData[table.uid] = { uid: table.uid, name: table.name, content: sanitizedContent };
                } catch (error) {
                    console.error(`[Memory Enhancement] 导出表格 ${table.name} (UID: ${table.uid}) 时出错:`, error);
                }
            });
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从 hash_sheets 转换表格时发生意外错误:", error);
    }
    return exportData;
}

export function ext_exportAllTablesAsJson() {
    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) return {};
    const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
    if (!tables || tables.length === 0) return {};
    const exportData = {};
    tables.forEach(table => {
        if (!table.enable) return;
        try {
            const rawContent = table.getContent(true) || [];
            const sanitizedContent = rawContent.map(row => Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []);
            exportData[table.uid] = { uid: table.uid, name: table.name, content: sanitizedContent };
        } catch (error) {
            console.error(`[Memory Enhancement] 导出表格 ${table.name} (UID: ${table.uid}) 时出错:`, error);
        }
    });
    return exportData;
}

export async function saveDataToLocalStorage(key, content) {
    try {
        localStorage.setItem(key, content);
        return true;
    } catch (e) {
        console.error(`[Memory Enhancement] 写入 localStorage 失败:`, e);
        return false;
    }
}

export async function readDataFromLocalStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.error(`[Memory Enhancement] 从 localStorage 读取失败:`, e);
        return null;
    }
}
