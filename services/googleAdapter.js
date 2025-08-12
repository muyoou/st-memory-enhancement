/**
 * @typedef {object} OpenAIMessage
 * @property {string} role - The role of the message author (e.g., 'user', 'assistant', 'system').
 * @property {string} content - The content of the message.
 */

/**
 * @typedef {object} GooglePart
 * @property {string} text - The text content of the part.
 */

/**
 * @typedef {object} GoogleContent
 * @property {string} role - The role of the content author (e.g., 'user', 'model').
 * @property {GooglePart[]} parts - An array of parts that make up the content.
 */

/**
 * @typedef {object} GoogleGenerationConfig
 * @property {number} [temperature]
 * @property {number} [topP]
 * @property {number} [topK]
 * @property {number} [maxOutputTokens]
 * @property {string[]} [stopSequences]
 * @property {number} [presencePenalty]
 * @property {number} [frequencyPenalty]
 */

/**
 * @typedef {object} GoogleSafetySetting
 * @property {string} category
 * @property {string} threshold
 */

/**
 * @typedef {object} GoogleRequestPayload
 * @property {GoogleContent[]} contents
 * @property {GoogleGenerationCode} generationConfig
 * @property {GoogleSafetySetting[]} safetySettings
 */


const extensionName = 'st-memory-enhancement';

/**
 * Converts OpenAI-formatted messages to Google Gemini's `contents` format.
 * It also separates the system prompt.
 *
 * @param {OpenAIMessage[]} messages - The array of messages in OpenAI format.
 * @returns {{contents: GoogleContent[], system_instruction: GoogleContent | null}} - An object containing the converted contents and the system instruction.
 */
function convertOaiToGoogle(messages) {
    const contents = [];
    let system_instruction = null;
    let lastRole = '';

    for (const message of messages) {
        // In Google's format, consecutive messages must alternate between 'user' and 'model'.
        // If we have two 'user' messages in a row, we merge them.
        if (message.role === 'user' && lastRole === 'user') {
            const lastContent = contents[contents.length - 1];
            lastContent.parts.push({ text: `\n\n${message.content}` });
            continue;
        }
        
        // Assistant messages are mapped to 'model' role
        if (message.role === 'assistant') {
            contents.push({
                role: 'model',
                parts: [{ text: message.content }],
            });
            lastRole = 'model';
        } else {
            contents.push({
                role: 'user',
                parts: [{ text: message.content }],
            });
            lastRole = 'user';
        }
    }

    return { contents, system_instruction };
}


/**
 * Constructs the full request payload for the Google Gemini API.
 *
 * @param {OpenAIMessage[]} messages - The messages in OpenAI format.
 * @param {object} apiSettings - The current API settings from the plugin.
 * @returns {GoogleRequestPayload} - The complete payload for the Google API.
 */
function buildGoogleRequest(messages, apiSettings) {
    const { contents } = convertOaiToGoogle(messages);

    const generationConfig = {
        temperature: apiSettings.temperature,
        topP: apiSettings.top_p,
        topK: apiSettings.top_k,
        maxOutputTokens: apiSettings.max_tokens,
    };
    
    // According to Google's API docs, topK is an integer.
    if(generationConfig.topK) generationConfig.topK = Math.round(generationConfig.topK);

    // Filter out undefined values
    Object.keys(generationConfig).forEach(key => {
        if (generationConfig[key] === undefined || generationConfig[key] === null) {
            delete generationConfig[key];
        }
    });

    // Gemini requires at least one content entry.
    if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Hi' }] });
    }

    const safetySettings = [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ];

    const payload = {
        contents,
        generationConfig,
        safetySettings,
    };

    return payload;
}

/**
 * Parses the response from Google Gemini API and converts it back to an OpenAI-like choice format.
 *
 * @param {object} googleResponse - The raw JSON response from the Google API.
 * @returns {{choices: {message: {content: string}}[]}} - The response in a format compatible with the plugin.
 */
function parseGoogleResponse(googleResponse) {
    try {
        const candidates = googleResponse?.candidates;
        if (!candidates || candidates.length === 0) {
            let message = `${extensionName}: Google API returned no candidates.`;
            if (googleResponse?.promptFeedback?.blockReason) {
                message += `\nPrompt was blocked due to: ${googleResponse.promptFeedback.blockReason}`;
                console.error(message, googleResponse.promptFeedback.safetyRatings);
            }
            return { choices: [{ message: { content: `Error: ${message}` } }] };
        }

        const responseContent = candidates[0].content;
        const responseText = responseContent?.parts?.map(part => part.text).join('') || '';
        
        if (!responseText) {
            let message = `${extensionName}: Google API response text is empty.`;
            console.warn(message, googleResponse);
            return { choices: [{ message: { content: 'Error: Received an empty response from the API.' } }] };
        }

        return {
            choices: [{
                message: {
                    content: responseText
                }
            }]
        };
    } catch (error) {
        console.error(`${extensionName}: Error parsing Google response:`, error, googleResponse);
        return { choices: [{ message: { content: `Error: Failed to parse Google API response. Details: ${error.message}` } }] };
    }
}


export {
    buildGoogleRequest,
    parseGoogleResponse,
};
