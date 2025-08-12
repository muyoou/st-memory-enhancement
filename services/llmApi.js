import { EDITOR, USER } from '../core/manager.js';
import { buildGoogleRequest, parseGoogleResponse } from './googleAdapter.js';

// @ts-ignore
let ChatCompletionService = undefined;
try {
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    // It's okay if this fails, the new logic in standaloneAPI will handle it.
}

/**
 * A simplified service class. The core logic for mode switching will now live in standaloneAPI.js.
 */
export class LLMApiService {
    constructor(config = {}) {
        this.config = {
            api_mode: config.api_mode || 'frontend',
            api_url: config.api_url || "https://api.openai.com/v1",
            api_key: config.api_key || "",
            model_name: config.model_name || "gpt-3.5-turbo",
            temperature: config.temperature !== undefined ? config.temperature : 1.0,
            max_tokens: config.max_tokens !== undefined ? config.max_tokens : 4096,
            top_p: config.top_p !== undefined ? config.top_p : 1.0,
            presence_penalty: config.presence_penalty !== undefined ? config.presence_penalty : 0.0,
            frequency_penalty: config.frequency_penalty !== undefined ? config.frequency_penalty : 0.0,
        };
    }

    // The callLLM and testConnection logic will now be primarily handled in standaloneAPI,
    // which is a better separation of concerns (UI logic vs. pure API service).
    // This class is kept for configuration holding and potential future use.
}

export default LLMApiService;
