// googleAdapter.js

/**
 * 构建符合Google AI规范的请求体。
 * @param {Array<object>} messages - OpenAI格式的消息数组。
 * @param {object} settings - 插件的API设置。
 * @returns {object} - Google AI格式的请求体。
 */
export function buildGoogleRequest(messages, settings) {
    const contents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
    }));

    return {
        contents,
        generationConfig: {
            temperature: settings.custom_temperature,
            topP: settings.custom_top_p,
            maxOutputTokens: settings.custom_max_tokens,
        },
    };
}

/**
 * 解析Google AI的响应，并将其转换为OpenAI兼容的格式。
 * @param {object} responseData - 从Google AI收到的原始响应数据。
 * @returns {object} - OpenAI格式的响应体。
 */
export function processGoogleResponse(responseData) {
    if (responseData && responseData.candidates && responseData.candidates.length > 0) {
        const candidate = responseData.candidates[0];
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            return {
                choices: [{
                    message: {
                        role: 'assistant',
                        content: candidate.content.parts[0].text,
                    },
                }],
            };
        }
    }
    return { error: { message: 'Invalid Google AI response format' } };
}
