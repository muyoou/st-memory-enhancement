import { EDITOR, USER } from "../core/manager.js";

/**
 * 多格式API服务类
 * 支持OpenAI、Gemini、Claude等不同格式的API调用
 *
 * 主要功能：
 * - 自动检测API格式
 * - 根据格式自动补全URL端点
 * - 统一的请求/响应处理
 * - 流式和非流式调用支持
 * - 代理模式支持
 *
 * @author muyoo
 * @version 2.2.0
 */
export class MultiApiService {
	constructor(config = {}) {
		this.config = {
			api_url: config.api_url || "",
			api_key: config.api_key || "",
			model_name: config.model_name || "",
			system_prompt: config.system_prompt || "",
			temperature: config.temperature || 1.0,
			max_tokens: config.max_tokens || 63000,
			top_p: config.top_p || 1.0,
			top_k: config.top_k || 40,
			frequency_penalty: config.frequency_penalty || 0.0,
			presence_penalty: config.presence_penalty || 0.0,
			stream: config.stream || false,
			api_format: config.api_format || "auto", // 支持: 'openai', 'gemini', 'claude', 'auto'
		};

		// 根据URL自动检测API格式
		if (this.config.api_format === "auto") {
			this.config.api_format = this.detectApiFormat(this.config.api_url);
		}
	}

	/**
	 * 根据URL检测API格式
	 * 使用正则表达式精准匹配各种API格式的特征
	 * @param {string} url - API URL
	 * @returns {string} - 检测到的API格式
	 */
	detectApiFormat(url) {
		if (!url) return "openai";

		const urlLower = url.toLowerCase();

		// Gemini API 正则匹配模式
		const geminiPatterns = [
			/googleapis\.com/, // Google APIs 域名
			/generativelanguage\.googleapis\.com/, // Gemini 专用域名
			/\/v1beta(?:\/|$)/, // v1beta 版本路径
			/\/models\/[^\/]*:generatecontent/i, // Gemini API 端点特征
			/:generatecontent/i, // generateContent 方法
			/\/v1beta\/models\//, // 完整 Gemini 路径模式
		];

		// Claude API 正则匹配模式
		const claudePatterns = [
			/anthropic\.com/, // Anthropic 域名
			/claude\.ai/, // Claude 域名
			/\/v1\/messages(?:\/|$)/, // Claude API 端点
			/api\.anthropic\.com/, // Claude API 域名
		];

		// OpenAI API 正则匹配模式
		const openaiPatterns = [
			/openai\.com/, // OpenAI 域名
			/\/v1\/chat\/completions(?:\/|$)/, // OpenAI 聊天端点
			/api\.openai\.com/, // OpenAI API 域名
		];

		// 按优先级检测：先检测特殊格式，最后检测OpenAI
		for (const pattern of geminiPatterns) {
			if (pattern.test(urlLower)) {
				return "gemini";
			}
		}

		for (const pattern of claudePatterns) {
			if (pattern.test(urlLower)) {
				return "claude";
			}
		}

		for (const pattern of openaiPatterns) {
			if (pattern.test(urlLower)) {
				return "openai";
			}
		}

		// 如果都不匹配，默认为OpenAI格式
		return "openai";
	}

	/**
	 * 根据API格式补全URL
	 * 使用正则表达式精准匹配和智能补全API端点
	 * @param {string} url - 基础URL
	 * @param {string} format - API格式
	 * @returns {string} - 补全后的URL
	 */
	completeApiUrl(url, format) {
		if (!url) return url;

		// 统一处理URL末尾的斜杠
		const normalizedUrl = url.replace(/\/+$/, "");

		switch (format) {
			case "openai":
				return this.completeOpenAIUrl(normalizedUrl);

			case "gemini":
				return this.completeGeminiUrl(normalizedUrl);

			case "claude":
				return this.completeClaudeUrl(normalizedUrl);

			default:
				return normalizedUrl;
		}
	}

	/**
	 * 补全OpenAI格式的URL
	 * @param {string} url - 规范化的URL
	 * @returns {string} - 补全后的URL
	 */
	completeOpenAIUrl(url) {
		// OpenAI API 端点正则匹配
		const completionEndpoint = /\/v1\/chat\/completions$/;
		const v1Endpoint = /\/v1$/;

		// 如果已经包含完整端点，直接返回
		if (completionEndpoint.test(url)) {
			return url;
		}

		// 如果只有 /v1 结尾，补全聊天端点
		if (v1Endpoint.test(url)) {
			return url + "/chat/completions";
		}

		// 如果没有任何端点，添加完整路径
		return url + "/v1/chat/completions";
	}

	/**
	 * 补全Gemini格式的URL
	 * @param {string} url - 规范化的URL
	 * @returns {string} - 补全后的URL
	 */
	completeGeminiUrl(url) {
		// Gemini API 端点正则匹配
		const generateContentEndpoint = /:generateContent$/;
		const modelsWithModelEndpoint = /\/models\/[^\/]+$/;
		const modelsEndpoint = /\/models$/;
		const v1betaEndpoint = /\/v1beta$/;

		const rawModelName = this.config.model_name || "gemini-pro";
		// 智能处理模型名称：如果已经包含 models/ 前缀，则直接使用；否则添加前缀
		const modelName = rawModelName.startsWith("models/")
			? rawModelName.substring(7)
			: rawModelName;

		// 如果已经包含完整的 generateContent 端点，直接返回
		if (generateContentEndpoint.test(url)) {
			return url;
		}

		// 如果包含 /models/模型名 但没有 :generateContent
		if (modelsWithModelEndpoint.test(url)) {
			return url + ":generateContent";
		}

		// 如果只有 /models 结尾
		if (modelsEndpoint.test(url)) {
			return url + `/${modelName}:generateContent`;
		}

		// 如果只有 /v1beta 结尾
		if (v1betaEndpoint.test(url)) {
			return url + `/models/${modelName}:generateContent`;
		}

		// 如果没有任何端点，添加完整路径
		return url + `/v1beta/models/${modelName}:generateContent`;
	}

	/**
	 * 补全Claude格式的URL
	 * @param {string} url - 规范化的URL
	 * @returns {string} - 补全后的URL
	 */
	completeClaudeUrl(url) {
		// Claude API 端点正则匹配
		const messagesEndpoint = /\/v1\/messages$/;
		const v1Endpoint = /\/v1$/;

		// 如果已经包含完整端点，直接返回
		if (messagesEndpoint.test(url)) {
			return url;
		}

		// 如果只有 /v1 结尾，补全消息端点
		if (v1Endpoint.test(url)) {
			return url + "/messages";
		}

		// 如果没有任何端点，添加完整路径
		return url + "/v1/messages";
	}

	/**
	 * 根据API格式构建请求头
	 * @param {string} format - API格式
	 * @returns {Object} - 请求头对象
	 */
	buildHeaders(format) {
		const headers = {
			"Content-Type": "application/json",
		};

		switch (format) {
			case "openai":
				headers["Authorization"] = `Bearer ${this.config.api_key}`;
				break;

			case "gemini":
				headers["X-goog-api-key"] = this.config.api_key;
				console.log(
					"[MultiApiService] buildHeaders: Gemini headers",
					headers
				);
				break;

			case "claude":
				headers["Authorization"] = `Bearer ${this.config.api_key}`;
				headers["anthropic-version"] = "2023-06-01";
				break;
		}

		console.log(
			"[MultiApiService] buildHeaders: Final headers for",
			format,
			headers
		);
		return headers;
	}

	/**
	 * 根据API格式构建请求体
	 * @param {Array} messages - 消息数组
	 * @param {string} format - API格式
	 * @returns {Object} - 请求体对象
	 */
	buildRequestBody(messages, format) {
		switch (format) {
			case "openai":
				const openaiBody = {
					model: this.config.model_name,
					messages: messages,
					temperature: this.config.temperature,
					max_tokens: this.config.max_tokens,
					stream: this.config.stream,
				};

				// 添加可选参数
				if (this.config.top_p !== 1.0)
					openaiBody.top_p = this.config.top_p;
				if (this.config.top_k !== 40)
					openaiBody.top_k = this.config.top_k;
				if (this.config.frequency_penalty !== 0.0)
					openaiBody.frequency_penalty =
						this.config.frequency_penalty;
				if (this.config.presence_penalty !== 0.0)
					openaiBody.presence_penalty = this.config.presence_penalty;

				return openaiBody;

			case "gemini":
				// 转换消息格式为Gemini格式
				const geminiMessages = this.convertToGeminiFormat(messages);
				const geminiBody = {
					contents: geminiMessages,
					generationConfig: {
						temperature: this.config.temperature,
						maxOutputTokens: this.config.max_tokens,
					},
				};

				// 添加Gemini特有参数
				if (this.config.top_p !== 1.0)
					geminiBody.generationConfig.topP = this.config.top_p;
				if (this.config.top_k !== 40)
					geminiBody.generationConfig.topK = this.config.top_k;
				// Gemini支持frequency_penalty和presence_penalty，但需要转换为不同的参数名
				if (this.config.frequency_penalty !== 0.0)
					geminiBody.generationConfig.frequencyPenalty =
						this.config.frequency_penalty;
				if (this.config.presence_penalty !== 0.0)
					geminiBody.generationConfig.presencePenalty =
						this.config.presence_penalty;

				return geminiBody;

			case "claude":
				// 分离system消息和其他消息
				const systemMessage = messages.find(
					(msg) => msg.role === "system"
				);
				const nonSystemMessages = messages.filter(
					(msg) => msg.role !== "system"
				);

				const claudeBody = {
					model: this.config.model_name,
					messages: nonSystemMessages,
					max_tokens: this.config.max_tokens,
					temperature: this.config.temperature,
				};

				if (systemMessage) {
					claudeBody.system = systemMessage.content;
				}

				// Claude支持top_p参数
				if (this.config.top_p !== 1.0)
					claudeBody.top_p = this.config.top_p;
				// Claude支持top_k参数（在某些版本中）
				if (this.config.top_k !== 40)
					claudeBody.top_k = this.config.top_k;
				// Claude 3+支持frequency_penalty和presence_penalty参数
				if (this.config.frequency_penalty !== 0.0)
					claudeBody.frequency_penalty =
						this.config.frequency_penalty;
				if (this.config.presence_penalty !== 0.0)
					claudeBody.presence_penalty = this.config.presence_penalty;

				return claudeBody;

			default:
				// 默认使用OpenAI格式
				return this.buildRequestBody(messages, "openai");
		}
	}

	/**
	 * 转换消息格式为Gemini格式
	 * @param {Array} messages - OpenAI格式的消息数组
	 * @returns {Array} - Gemini格式的消息数组
	 */
	convertToGeminiFormat(messages) {
		const geminiMessages = [];

		for (const message of messages) {
			if (message.role === "system") {
				// 系统消息转换为用户消息前缀
				geminiMessages.push({
					role: "user",
					parts: [{ text: `System: ${message.content}` }],
				});
			} else if (message.role === "user") {
				geminiMessages.push({
					role: "user",
					parts: [{ text: message.content }],
				});
			} else if (message.role === "assistant") {
				geminiMessages.push({
					role: "model",
					parts: [{ text: message.content }],
				});
			}
		}

		return geminiMessages;
	}

	/**
	 * 根据API格式解析响应
	 * @param {Object} responseData - 响应数据
	 * @param {string} format - API格式
	 * @returns {string} - 提取的文本内容
	 */
	parseResponse(responseData, format) {
		console.log("[MultiApiService] parseResponse: 开始解析响应", {
			format,
			responseData: JSON.stringify(responseData, null, 2),
		});

		switch (format) {
			case "openai":
				if (
					!responseData.choices ||
					responseData.choices.length === 0 ||
					!responseData.choices[0].message ||
					!responseData.choices[0].message.content
				) {
					throw new Error("OpenAI API返回无效的响应结构");
				}
				const openaiContent = responseData.choices[0].message.content;
				console.log(
					"[MultiApiService] parseResponse: OpenAI内容",
					openaiContent
				);
				return openaiContent;

			case "gemini":
				if (
					!responseData.candidates ||
					responseData.candidates.length === 0 ||
					!responseData.candidates[0].content ||
					!responseData.candidates[0].content.parts ||
					responseData.candidates[0].content.parts.length === 0
				) {
					throw new Error("Gemini API返回无效的响应结构");
				}
				// 检查是否有实际的文本内容
				const textParts =
					responseData.candidates[0].content.parts.filter(
						(part) => part.text && part.text.trim() !== ""
					);
				console.log("[MultiApiService] parseResponse: Gemini文本部分", {
					allParts: responseData.candidates[0].content.parts,
					textParts: textParts,
				});

				if (textParts.length === 0) {
					console.warn(
						"[MultiApiService] parseResponse: Gemini没有有效文本内容"
					);
					return ""; // 返回空字符串而不是抛出错误
				}
				if (textParts.length > 1) {
					const combinedText = textParts
						.map((part) => part.text)
						.join("");
					console.log(
						"[MultiApiService] parseResponse: Gemini合并多个文本部分",
						combinedText
					);
					return combinedText;
				}
				const singleText = textParts[0].text;
				console.log(
					"[MultiApiService] parseResponse: Gemini单个文本部分",
					singleText
				);
				return singleText;

			case "claude":
				if (
					!responseData.content ||
					responseData.content.length === 0 ||
					!responseData.content[0].text
				) {
					throw new Error("Claude API返回无效的响应结构");
				}
				const claudeContent = responseData.content[0].text;
				console.log(
					"[MultiApiService] parseResponse: Claude内容",
					claudeContent
				);
				return claudeContent;

			default:
				// 默认使用OpenAI格式解析
				console.log(
					"[MultiApiService] parseResponse: 使用默认OpenAI格式解析"
				);
				return this.parseResponse(responseData, "openai");
		}
	}

	/**
	 * 调用LLM API
	 * @param {string|Array} prompt - 提示词（字符串或消息数组）
	 * @param {Function} streamCallback - 流式回调函数
	 * @returns {Promise<string>} - API响应内容
	 */
	async callLLM(prompt, streamCallback = null) {
		if (!prompt) {
			throw new Error("输入内容不能为空");
		}

		if (
			!this.config.api_url ||
			!this.config.api_key ||
			!this.config.model_name
		) {
			throw new Error("API配置不完整");
		}

		// 构建消息数组
		let messages;
		if (Array.isArray(prompt)) {
			messages = prompt;
		} else if (typeof prompt === "string") {
			if (prompt.trim().length < 2) throw new Error("输入文本太短");
			messages = [];

			// 只有在系统提示词不为空时才添加系统消息
			if (this.config.system_prompt && this.config.system_prompt.trim()) {
				messages.push({
					role: "system",
					content: this.config.system_prompt,
				});
			}

			messages.push({ role: "user", content: prompt });
		} else {
			throw new Error("无效的输入类型，只接受字符串或消息数组");
		}

		this.config.stream =
			streamCallback !== null && streamCallback !== undefined;

		// 检查是否使用代理
		if (USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address) {
			// 代理模式下，如果streamCallback为null或undefined，强制设置为非流式
			if (!streamCallback || typeof streamCallback !== "function") {
				this.config.stream = false;
			}
			return await this.callWithProxy(messages, streamCallback);
		} else {
			return await this.callDirectly(messages, streamCallback);
		}
	}

	/**
	 * 直接调用API
	 * @param {Array} messages - 消息数组
	 * @param {Function} streamCallback - 流式回调函数
	 * @returns {Promise<string>} - API响应内容
	 */
	async callDirectly(messages, streamCallback) {
		const format = this.config.api_format;
		let apiEndpoint = this.completeApiUrl(this.config.api_url, format);

		const headers = this.buildHeaders(format);
		const requestBody = this.buildRequestBody(messages, format);

		console.log("[MultiApiService] callDirectly: Request details", {
			format,
			apiEndpoint,
			headers,
			hasApiKey: !!this.config.api_key,
			requestBody,
		});

		try {
			if (this.config.stream) {
				if (!streamCallback || typeof streamCallback !== "function") {
					throw new Error(
						"流式模式下必须提供有效的streamCallback函数"
					);
				}
				return await this.handleStreamResponse(
					apiEndpoint,
					headers,
					requestBody,
					format,
					streamCallback
				);
			} else {
				return await this.handleRegularResponse(
					apiEndpoint,
					headers,
					requestBody,
					format
				);
			}
		} catch (error) {
			console.error(`调用${format.toUpperCase()} API错误:`, error);
			throw error;
		}
	}

	/**
	 * 通过代理调用API（暂时保持原有逻辑，后续可扩展）
	 * @param {Array} messages - 消息数组
	 * @param {Function} streamCallback - 流式回调函数
	 * @returns {Promise<string>} - API响应内容
	 */
	async callWithProxy(messages, streamCallback) {
		console.log("检测到代理配置，将使用 SillyTavern 内部路由");

		// 动态导入ChatCompletionService
		let ChatCompletionService;
		try {
			const module = await import("/scripts/custom-request.js");
			ChatCompletionService = module.ChatCompletionService;
		} catch (e) {
			throw new Error(
				"当前酒馆版本过低，无法发送自定义请求。请更新你的酒馆版本"
			);
		}

		if (
			typeof ChatCompletionService === "undefined" ||
			!ChatCompletionService?.processRequest
		) {
			throw new Error(
				"当前酒馆版本过低，无法发送自定义请求。请更新你的酒馆版本"
			);
		}

		try {
			const requestData = {
				stream: this.config.stream,
				messages: messages,
				max_tokens: this.config.max_tokens,
				model: this.config.model_name,
				temperature: this.config.temperature,
				// 添加高级模型参数
				top_p: this.config.top_p,
				top_k: this.config.top_k,
				frequency_penalty: this.config.frequency_penalty,
				presence_penalty: this.config.presence_penalty,
				chat_completion_source:
					this.config.api_format === "openai" ? "openai" : "custom",
				custom_url: this.config.api_url,
				reverse_proxy:
					USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
				proxy_password:
					USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key || null,
			};

			if (this.config.stream) {
				if (!streamCallback || typeof streamCallback !== "function") {
					throw new Error(
						"流式模式下必须提供有效的streamCallback函数"
					);
				}
				const streamGenerator =
					await ChatCompletionService.processRequest(
						requestData,
						{},
						false
					);
				let fullResponse = "";
				for await (const chunk of streamGenerator()) {
					if (chunk.text) {
						fullResponse += chunk.text;
						streamCallback(chunk.text);
					}
				}
				return this.cleanResponse(fullResponse);
			} else {
				const responseData = await ChatCompletionService.processRequest(
					requestData,
					{},
					true
				);
				if (!responseData || !responseData.content) {
					throw new Error("通过内部路由获取响应失败或响应内容为空");
				}
				return this.cleanResponse(responseData.content);
			}
		} catch (error) {
			console.error("通过 SillyTavern 内部路由调用API错误:", error);
			throw error;
		}
	}

	/**
	 * 处理常规响应
	 * @param {string} apiEndpoint - API端点
	 * @param {Object} headers - 请求头
	 * @param {Object} data - 请求体
	 * @param {string} format - API格式
	 * @returns {Promise<string>} - 响应内容
	 */
	async handleRegularResponse(apiEndpoint, headers, data, format) {
		const response = await fetch(apiEndpoint, {
			method: "POST",
			headers: headers,
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`${format.toUpperCase()} API请求失败: ${
					response.status
				} - ${errorText}`
			);
		}

		const responseData = await response.json();
		const content = this.parseResponse(responseData, format);

		return this.cleanResponse(content);
	}

	/**
	 * 处理流式响应
	 * @param {string} apiEndpoint - API端点
	 * @param {Object} headers - 请求头
	 * @param {Object} data - 请求体
	 * @param {string} format - API格式
	 * @param {Function} streamCallback - 流式回调函数
	 * @returns {Promise<string>} - 完整响应内容
	 */
	async handleStreamResponse(
		apiEndpoint,
		headers,
		data,
		format,
		streamCallback
	) {
		const response = await fetch(apiEndpoint, {
			method: "POST",
			headers: headers,
			body: JSON.stringify(data),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`${format.toUpperCase()} API流式请求失败: ${
					response.status
				} - ${errorText}`
			);
		}

		if (!response.body) {
			throw new Error("无法获取响应流");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder("utf-8");
		let buffer = "";
		let fullResponse = "";

		try {
			console.log(`[Stream] 开始${format.toUpperCase()}流式处理...`);

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					console.log(`[Stream] ${format.toUpperCase()}流式处理完成`);
					break;
				}

				const decodedChunk = decoder.decode(value, { stream: true });
				buffer += decodedChunk;

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (trimmedLine === "") continue;

					try {
						let content = "";

						if (format === "openai") {
							content = this.parseOpenAIStreamLine(trimmedLine);
						} else if (format === "gemini") {
							content = this.parseGeminiStreamLine(trimmedLine);
						} else if (format === "claude") {
							content = this.parseClaudeStreamLine(trimmedLine);
						}

						if (content) {
							fullResponse += content;
							streamCallback(content);
						}
					} catch (e) {
						console.warn(
							`[Stream] ${format.toUpperCase()}解析行错误:`,
							e,
							"行内容:",
							trimmedLine
						);
					}
				}
			}

			return this.cleanResponse(fullResponse);
		} catch (streamError) {
			console.error(
				`[Stream] ${format.toUpperCase()}流式读取错误:`,
				streamError
			);
			throw streamError;
		} finally {
			reader.releaseLock();
		}
	}

	/**
	 * 解析OpenAI流式响应行
	 * @param {string} line - 响应行
	 * @returns {string} - 提取的内容
	 */
	parseOpenAIStreamLine(line) {
		if (line.startsWith("data: ")) {
			const dataStr = line.substring(6).trim();
			if (dataStr === "[DONE]") return "";

			const jsonData = JSON.parse(dataStr);
			return jsonData.choices?.[0]?.delta?.content || "";
		}
		return "";
	}

	/**
	 * 解析Gemini流式响应行（Gemini通常不支持SSE流式，这里作为预留）
	 * @param {string} line - 响应行
	 * @returns {string} - 提取的内容
	 */
	parseGeminiStreamLine(line) {
		if (line.startsWith("data: ")) {
			const dataStr = line.substring(6).trim();
			if (dataStr === "[DONE]") return "";

			try {
				const jsonData = JSON.parse(dataStr);
				// 确保我们能安全地访问嵌套的属性
				const text =
					jsonData?.candidates?.[0]?.content?.parts?.[0]?.text;
				if (text) {
					return text;
				}
			} catch (e) {
				console.warn(
					"[Stream] Gemini JSON parsing error:",
					e,
					"Line:",
					dataStr
				);
			}
		}
		return "";
	}

	/**
	 * 解析Claude流式响应行
	 * @param {string} line - 响应行
	 * @returns {string} - 提取的内容
	 */
	parseClaudeStreamLine(line) {
		if (line.startsWith("data: ")) {
			const dataStr = line.substring(6).trim();
			if (dataStr === "[DONE]") return "";

			try {
				const jsonData = JSON.parse(dataStr);
				if (jsonData.type === "content_block_delta") {
					return jsonData.delta?.text || "";
				}
			} catch (e) {
				console.warn("[Stream] Claude解析JSON失败:", e);
			}
		}
		return "";
	}

	/**
	 * 清理响应文本
	 * @param {string} text - 原始文本
	 * @returns {string} - 清理后的文本
	 */
	cleanResponse(text) {
		if (!text || typeof text !== "string") {
			console.warn(
				"[MultiApiService] cleanResponse: 输入为空或非字符串",
				text
			);
			return "";
		}

		// 如果文本为空或只包含空白字符
		if (text.trim() === "") {
			console.warn("[MultiApiService] cleanResponse: 输入为空白字符串");
			return "";
		}

		// 基本清理：去除首尾空白
		let cleaned = text.trim();

		// 智能清理XML/HTML标签：保留重要的结构化数据标签
		cleaned = this.smartCleanTags(cleaned);

		// 再次清理首尾空白
		cleaned = cleaned.trim();

		console.log("[MultiApiService] cleanResponse: 清理结果", {
			original: text,
			cleaned: cleaned,
			length: cleaned.length,
		});

		return cleaned;
	}

	/**
	 * 智能清理XML/HTML标签
	 * 保留重要的结构化数据标签，只清理无用的格式标签
	 * @param {string} text - 待清理的文本
	 * @returns {string} - 清理后的文本
	 */
	smartCleanTags(text) {
		const re = /<tableEdit>([\s\S]*?)<\/tableEdit>/gi;
		const tableEditTags = [];
		let m;
		while ((m = re.exec(text)) !== null)
			tableEditTags.push(`<tableEdit>${m[1]}</tableEdit>`);

		// 如果有tableEdit标签，只返回这些标签
		if (tableEditTags.length > 0) {
			return tableEditTags.join("\n");
		}

		// 如果没有tableEdit标签，返回原始文本（去除其他HTML标签）
		return text.replace(/<[^>]*>/g, "").trim();
	}

	/**
	 * 测试API连接
	 * @returns {Promise<string>} - 测试响应
	 */
	async testConnection() {
		const testPrompt = "Say hello.";
		const messages = [];

		// 只有在系统提示词不为空时才添加系统消息
		if (this.config.system_prompt && this.config.system_prompt.trim()) {
			messages.push({
				role: "system",
				content: this.config.system_prompt,
			});
		}

		messages.push({ role: "user", content: testPrompt });

		try {
			if (USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address) {
				return await this.callWithProxy(messages, null);
			} else {
				return await this.callDirectly(messages, null);
			}
		} catch (error) {
			console.error(
				`测试${this.config.api_format.toUpperCase()} API连接错误:`,
				error
			);
			throw error;
		}
	}
}

export default MultiApiService;
