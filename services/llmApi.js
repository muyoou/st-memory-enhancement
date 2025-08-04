import {EDITOR, USER} from '../core/manager.js';
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
 * 统一处理和规范化API响应数据。
 * - 自动解析JSON字符串。
 * - 自动处理嵌套的 'data' 对象。
 * @param {*} responseData - 从API收到的原始响应数据
 * @returns {object} 规范化后的数据对象
 */
function normalizeApiResponse(responseData) {
    let data = responseData;
    // 1. 如果响应是字符串，尝试解析为JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error("API响应JSON解析失败:", e);
            // 返回一个错误结构，以便下游可以一致地处理
            return { error: { message: 'Invalid JSON response' } };
        }
    }
    // 2. 检查并解开嵌套的 'data' 属性
    // 这种情况经常出现在一些代理服务中，例如 { "data": { "data": [...] } }
    if (data && typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)) {
        if (Object.hasOwn(data.data, 'data')) {
            data = data.data;
        }
    }
    return data;
}

export class LLMApiService {
    constructor(config = {}) {
        this.config = {
            api_url: config.api_url || "https://api.openai.com/v1",
            api_key: config.api_key || "",
            model_name: config.model_name || "gpt-3.5-turbo",
            system_prompt: config.system_prompt || "You are a helpful assistant.",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 63000, // 将默认值从 20000 修改为 63000
            stream: config.stream || false
        };
    }

    async callLLM(prompt, streamCallback = null) {
        if (!prompt) {
            throw new Error("输入内容不能为空");
        }

        if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
            throw new Error("API配置不完整");
        }

        let messages;
        if (Array.isArray(prompt)) {
            // 如果 prompt 是数组，直接作为 messages
            messages = prompt;
        } else if (typeof prompt === 'string') {
            // 如果 prompt 是字符串，保持旧逻辑
            if (prompt.trim().length < 2) throw new Error("输入文本太短");
            messages = [
                { role: 'system', content: this.config.system_prompt },
                { role: 'user', content: prompt }
            ];
        } else {
            throw new Error("无效的输入类型，只接受字符串或消息数组");
        }

        this.config.stream = streamCallback !== null;

        // 如果配置了代理地址，则使用 SillyTavern 的内部路由
        if (USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address) {
            console.log("检测到代理配置，将使用 SillyTavern 内部路由");
            if (typeof ChatCompletionService === 'undefined' || !ChatCompletionService?.processRequest) {
                const errorMessage = "当前酒馆版本过低，无法发送自定义请求。请更新你的酒馆版本";
                EDITOR.error(errorMessage);
                throw new Error(errorMessage);
            }
            try {
                const requestData = {
                    stream: this.config.stream,
                    messages: messages,
                    max_tokens: this.config.max_tokens,
                    model: this.config.model_name,
                    temperature: this.config.temperature,
                    chat_completion_source: 'openai', // 假设代理目标是 OpenAI 兼容的
                    custom_url: this.config.api_url,
                    reverse_proxy: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                    proxy_password: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key || null,
                };

                if (this.config.stream) {
                    if (!streamCallback || typeof streamCallback !== 'function') {
                        throw new Error("流式模式下必须提供有效的streamCallback函数");
                    }
                    const streamGenerator = await ChatCompletionService.processRequest(requestData, {}, false); // extractData = false for stream
                    let fullResponse = '';
                    for await (const chunk of streamGenerator()) {
                        if (chunk.text) {
                            fullResponse += chunk.text;
                            streamCallback(chunk.text);
                        }
                    }
                    return this.#cleanResponse(fullResponse);
                } else {
                    const responseData = await ChatCompletionService.processRequest(requestData, {}, true); // extractData = true for non-stream
                    if (!responseData || !responseData.content) {
                        throw new Error("通过内部路由获取响应失败或响应内容为空");
                    }
                    return this.#cleanResponse(responseData.content);
                }
            } catch (error) {
                console.error("通过 SillyTavern 内部路由调用 LLM API 错误:", error);
                throw error;
            }
        } else {
            // 未配置代理，使用原始的直接 fetch 逻辑
            console.log("未检测到代理配置，将使用直接 fetch");
            let apiEndpoint = this.config.api_url;
            if (!apiEndpoint.endsWith("/chat/completions")) {
                apiEndpoint += "/chat/completions";
            }

            const headers = {
                'Authorization': `Bearer ${this.config.api_key}`,
                'Content-Type': 'application/json'
            };

            const data = {
                model: this.config.model_name,
                messages: messages,
                temperature: this.config.temperature,
                max_tokens: this.config.max_tokens,
                stream: this.config.stream
            };

            try {
                if (this.config.stream) {
                    if (!streamCallback || typeof streamCallback !== 'function') {
                        throw new Error("流式模式下必须提供有效的streamCallback函数");
                    }
                    return await this.#handleStreamResponse(apiEndpoint, headers, data, streamCallback);
                } else {
                    return await this.#handleRegularResponse(apiEndpoint, headers, data);
                }
            } catch (error) {
                console.error("直接调用 LLM API 错误:", error);
                throw error;
            }
        }
    }

    async #handleRegularResponse(apiEndpoint, headers, data) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const rawResponseData = await response.json();
        const responseData = normalizeApiResponse(rawResponseData);


        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            const errorMessage = responseData?.error?.message || "API返回无效的响应结构";
            throw new Error(`${errorMessage} 响应: ${JSON.stringify(rawResponseData)}`);
        }

        let translatedText = responseData.choices[0].message.content;
        return this.#cleanResponse(translatedText);
    }

    async #handleStreamResponse(apiEndpoint, headers, data, streamCallback) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';
        let chunkIndex = 0; // Add chunk index for logging

        try {
            console.log('[Stream] Starting stream processing for custom API...'); // Log stream start
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    console.log('[Stream] Custom API stream finished (done=true).'); // Log stream end
                    break;
                }

                const decodedChunk = decoder.decode(value, { stream: true });
                buffer += decodedChunk;
                chunkIndex++;
                console.log(`[Stream] Custom API received chunk ${chunkIndex}. Buffer length: ${buffer.length}`); // Log received chunk and buffer size

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep potential incomplete line in buffer

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;
                    console.log(`[Stream] Custom API processing line: "${trimmedLine}"`); // Log processed line

                    try {
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            if (dataStr === '[DONE]') {
                                console.log('[Stream] Custom API received [DONE] marker.'); // Log DONE marker
                                continue; // Skip further processing for this line
                            }

                            const jsonData = JSON.parse(dataStr);
                            // Optional: Log parsed structure if needed for deep debugging
                            // console.log('[Stream] Custom API parsed JSON:', JSON.stringify(jsonData));

                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                // console.log(`[Stream] Custom API extracted content: "${content}"`); // Log extracted content if needed
                                streamCallback(content); // Pass content to the callback
                            } else {
                                // console.log('[Stream] Custom API line parsed, but no content found in delta.');
                            }
                        } else {
                             console.log('[Stream] Custom API line does not start with "data: ". Skipping.');
                        }
                    } catch (e) {
                        console.warn("[Stream] Custom API error parsing line JSON:", e, "Line:", trimmedLine); // Log parsing errors
                    }
                }
                 // Optional: Log buffer state after processing lines
                 // console.log(`[Stream] Custom API buffer after processing lines (potential incomplete line): "${buffer}"`);
            }

            // Process any remaining data in the buffer after the loop finishes
            const finalBufferTrimmed = buffer.trim();
            if (finalBufferTrimmed) {
                console.log(`[Stream] Custom API processing final buffer content: "${finalBufferTrimmed}"`); // Log final buffer processing
                try {
                    // Attempt to handle potential JSON object directly in buffer (less common for SSE)
                    if (finalBufferTrimmed.startsWith('data: ')) {
                         const dataStr = finalBufferTrimmed.substring(6).trim();
                         if (dataStr !== '[DONE]') {
                            const jsonData = JSON.parse(dataStr);
                             // Optional: Log parsed structure if needed
                             // console.log('[Stream] Custom API parsed final buffer JSON:', JSON.stringify(jsonData));
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                // console.log(`[Stream] Custom API extracted final buffer content: "${content}"`);
                                streamCallback(content);
                            }
                         }
                    } else {
                         // Maybe it's a non-SSE JSON object? Or just leftover text.
                         console.warn("[Stream] Custom API final buffer content does not start with 'data: '. Attempting direct parse (if applicable) or ignoring.");
                         // Example: try parsing directly if expecting a single JSON object
                         // const jsonData = JSON.parse(buffer);
                         // ... handle jsonData ...
                    }
                } catch (e) {
                    console.warn("[Stream] Custom API error processing final buffer content:", e);
                }
            }

            console.log('[Stream] Custom API stream processing complete. Full response length:', fullResponse.length); // Log final length
            return this.#cleanResponse(fullResponse);
        } catch (streamError) {
            console.error('[Stream] Custom API error during stream reading:', streamError); // Log errors during read()
            throw streamError; // Re-throw the error
        } finally {
            console.log('[Stream] Custom API releasing stream lock.'); // Log lock release
            reader.releaseLock();
        }
    }

    #cleanResponse(text) {
        // 清理响应文本，移除可能的前缀或后缀
        return text.trim();
    }

    async testConnection() {
        const testPrompt = "Say hello.";
        const messages = [
            { role: 'system', content: this.config.system_prompt },
            { role: 'user', content: testPrompt }
        ];

        // 如果配置了代理地址，则使用 SillyTavern 的内部路由进行测试
        if (USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address) {
            console.log("检测到代理配置，将使用 SillyTavern 内部路由进行连接测试");
            try {
                const requestData = {
                    stream: false, // 测试连接不需要流式
                    messages: messages,
                    max_tokens: 50, // 测试连接不需要太多 token
                    model: this.config.model_name,
                    temperature: this.config.temperature,
                    chat_completion_source: 'openai', // 假设代理目标是 OpenAI 兼容的
                    custom_url: this.config.api_url,
                    reverse_proxy: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                    proxy_password: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key || null,
                };
                // 使用 processRequest 进行非流式请求测试
                const responseData = await ChatCompletionService.processRequest(requestData, {}, true);
                if (!responseData || !responseData.content) {
                    throw new Error("通过内部路由测试连接失败或响应内容为空");
                }
                return responseData.content; // 返回响应内容表示成功
            } catch (error) {
                console.error("通过 SillyTavern 内部路由测试 API 连接错误:", error);
                throw error;
            }
        } else {
            // 未配置代理，使用原始的直接 fetch 逻辑进行测试
            console.log("未检测到代理配置，将使用直接 fetch 进行连接测试");
            let apiEndpoint = this.config.api_url;
            if (!apiEndpoint.endsWith("/chat/completions")) {
                apiEndpoint += "/chat/completions";
            }

            const headers = {
                'Authorization': `Bearer ${this.config.api_key}`,
                'Content-Type': 'application/json'
            };

            const data = {
                model: this.config.model_name,
                messages: messages,
                temperature: this.config.temperature,
                max_tokens: 50, // 测试连接不需要太多 token
                stream: false
            };

            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API测试请求失败: ${response.status} - ${errorText}`);
                }

                const responseData = await response.json();
                // 检查响应是否有效
                if (!responseData.choices || responseData.choices.length === 0 || !responseData.choices[0].message || !responseData.choices[0].message.content) {
                    throw new Error("API测试返回无效的响应结构");
                }
                return responseData.choices[0].message.content; // 返回响应内容表示成功
            } catch (error) {
                console.error("直接 fetch 测试 API 连接错误:", error);
                throw error;
            }
        }
    }
}

export default LLMApiService;
