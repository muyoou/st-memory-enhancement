/**
 * absoluteRefresh.js
 * 负责表格的重建和刷新功能
 */
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from "../../core/manager.js";
import {
	convertOldTablesToNewSheets,
	executeTableEditActions,
	getTableEditTag,
} from "../../index.js";
import JSON5 from "../../utils/json5.min.mjs";
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { TableTwoStepSummary } from "./separateTableUpdate.js";
import {
	estimateTokenCount,
	handleCustomAPIRequest,
	handleMainAPIRequest,
} from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { Form } from "../../components/formManager.js";
import { refreshRebuildTemplate } from "../settings/userExtensionSetting.js";
import { safeParse } from "../../utils/stringUtil.js";

/**
 * 验证操作指令的格式和内容
 * @param {Array} actions - 操作指令数组
 * @returns {boolean} 验证是否通过
 */
function validateActions(actions) {
	if (!Array.isArray(actions)) {
		return false;
	}

	return actions.every((action) => {
		const validActions = ["insert", "update", "delete"];
		if (
			!action.action ||
			!validActions.includes(action.action.toLowerCase())
		) {
			return false;
		}

		if (typeof action.tableIndex !== "number") {
			return false;
		}

		if (action.action !== "insert" && typeof action.rowIndex !== "number") {
			return false;
		}

		if (action.data && typeof action.data === "object") {
			const invalidKeys = Object.keys(action.data).filter(
				(k) => !/^\d+$/.test(k)
			);
			if (invalidKeys.length > 0) {
				return false;
			}
		}

		return true;
	});
}

/**
 * 生成操作确认的HTML内容
 * @param {Array} content - 表格内容数组
 * @returns {string} HTML字符串
 */
function generateOperationConfirmHTML(content) {
	const tableRows = content
		.map(
			(table) => `
		<h3 class="operation-list-title">${table.tableName}</h3>
		<div class="operation-list">
			<table class="tableDom sheet-table">
				<thead>
					<tr>
						${table.columns.map((column) => `<th>${column}</th>`).join("")}
					</tr>
				</thead>
				<tbody>
					${table.content
						.map(
							(row) => `
						<tr>
							${row.map((cell) => `<td>${cell}</td>`).join("")}
						</tr>
					`
						)
						.join("")}
				</tbody>
			</table>
		</div>
		<hr>
	`
		)
		.join("");

	return `
		<div class="wide100p padding5 dataBankAttachments">
			<div class="refresh-title-bar">
				<h2 class="refresh-title">请确认以下操作</h2>
				<div></div>
			</div>
			<div id="tableRefresh" class="refresh-scroll-content">
				<div>
					<div class="operation-list-container">${tableRows}</div>
				</div>
			</div>
		</div>
		<style>
			.operation-list-title {
				text-align: left;
				margin-top: 10px;
			}
			.operation-list-container {
				display: flex;
				flex-wrap: wrap;
			}
			.operation-list {
				width: 100%;
				max-width: 100%;
				overflow: auto;
			}
		</style>
	`;
}

/**
 * 确认执行的操作
 * @param {Array} content - 表格内容
 * @returns {string} HTML内容
 */
function confirmTheOperationPerformed(content) {
	return generateOperationConfirmHTML(content);
}

/**
 * 添加刷新类型选择器选项
 * @param {jQuery} $selector - 选择器jQuery对象
 * @param {string} key - 选项键值
 * @param {Object} value - 选项数据
 */
function addSelectorOption($selector, key, value) {
	const optionText = (() => {
		switch (value.type) {
			case "refresh":
				return "**旧** " + (value.name || key);
			case "third_party":
				return "**第三方作者** " + (value.name || key);
			default:
				return value.name || key;
		}
	})();

	const option = $("<option></option>").attr("value", key).text(optionText);
	$selector.append(option);
}

/**
 * 初始化表格刷新类型选择器
 * 根据profile_prompts对象动态生成下拉选择器的选项
 */
export function initRefreshTypeSelector() {
	const $selector = $("#table_refresh_type_selector");
	if (!$selector.length) return;

	$selector.empty();

	// 遍历profile_prompts对象，添加选项
	Object.entries(profile_prompts).forEach(([key, value]) => {
		addSelectorOption($selector, key, value);
	});

	// 如果没有选项，添加默认选项
	if ($selector.children().length === 0) {
		$selector.append(
			$("<option></option>")
				.attr("value", "rebuild_base")
				.text("~~~看到这个选项说明出问题了~~~~")
		);
	}
}

/**
 * 根据选择的刷新类型获取对应的提示模板并调用rebuildTableActions
 * @param {string} templateName 提示模板名称
 * @param {string} additionalPrompt 附加的提示内容
 * @param {boolean} force 是否强制刷新,不显示确认对话框
 * @param {boolean} isSilentUpdate 是否静默更新,不显示操作确认
 * @param {string} chatToBeUsed 要使用的聊天记录,为空则使用最近的聊天记录
 * @returns {Promise<void>}
 */
export async function getPromptAndRebuildTable(
	templateName = "",
	additionalPrompt,
	force,
	isSilentUpdate = USER.tableBaseSetting.bool_silent_refresh,
	chatToBeUsed = ""
) {
	try {
		const result = await rebuildTableActions(
			force || true,
			isSilentUpdate,
			chatToBeUsed
		);
		return result;
	} catch (error) {
		EDITOR.error(`总结失败: ${error.message}`);
	}
}

/**
 * 获取并验证表格数据
 * @returns {Object|null} 返回包含表格数据的对象或null
 */
function getValidatedTableData() {
	const { piece } = BASE.getLastSheetsPiece();
	if (!piece) {
		throw new Error("findLastestTableData 未返回有效的表格数据");
	}

	const latestTables = BASE.hashSheetsToSheets(piece.hash_sheets).filter(
		(sheet) => sheet.enable
	);

	DERIVED.any.waitingTable = latestTables;
	DERIVED.any.waitingTableIdMap = latestTables.map((table) => table.uid);

	return { latestTables, piece };
}

/**
 * 准备表格数据和提示词
 * @param {Array} latestTables - 最新表格数组
 * @param {string} chatToBeUsed - 要使用的聊天记录
 * @returns {Object} 包含表格数据和提示词的对象
 */
async function prepareTableDataAndPrompts(latestTables, chatToBeUsed) {
	const tableJson = latestTables.map((table, index) => ({
		...table.getReadableJson(),
		tableIndex: index,
	}));
	const tableJsonText = JSON.stringify(tableJson);

	const tableHeaders = latestTables.map((table) => ({
		tableId: table.uid,
		headers: table.getHeader(),
	}));
	const tableHeadersText = JSON.stringify(tableHeaders);

	const chat = USER.getContext().chat;
	const lastChats =
		chatToBeUsed === ""
			? await getRecentChatHistory(
					chat,
					USER.tableBaseSetting.clear_up_stairs,
					USER.tableBaseSetting.ignore_user_sent,
					USER.tableBaseSetting.rebuild_token_limit_value
			  )
			: chatToBeUsed;

	return { tableJsonText, tableHeadersText, lastChats };
}

/**
 * 获取并解析模板
 * @returns {Object} 模板对象
 */
function getTemplate() {
	const select = USER.tableBaseSetting.lastSelectedTemplate ?? "rebuild_base";

	if (select === "rebuild_base") {
		return {
			name: "rebuild_base",
			system_prompt:
				USER.tableBaseSetting.rebuild_default_system_message_template,
			user_prompt_begin:
				USER.tableBaseSetting.rebuild_default_message_template,
		};
	}

	const template =
		USER.tableBaseSetting.rebuild_message_template_list[select];
	if (!template) {
		throw new Error("未找到对应的提示模板，请检查配置");
	}

	return template;
}

/**
 * 解析系统提示词
 * @param {string} systemPrompt - 原始系统提示词
 * @returns {string|Array} 解析后的系统提示词
 */
function parseSystemPrompt(systemPrompt) {
	try {
		return JSON5.parse(systemPrompt);
	} catch (error) {
		// 尝试清理格式后重新解析
		try {
			const cleanedSystemPrompt = systemPrompt
				.replace(/\n/g, "\\n")
				.replace(/\s+/g, " ")
				.trim();
			return JSON5.parse(cleanedSystemPrompt);
		} catch (secondError) {
			return systemPrompt;
		}
	}
}

/**
 * 替换提示词中的占位符
 * @param {string} input - 输入文本
 * @param {string} tableJsonText - 表格JSON文本
 * @param {string} lastChats - 最近聊天记录
 * @param {string} tableHeadersText - 表格头信息
 * @returns {string} 替换后的文本
 */
function replacePromptPlaceholders(
	input,
	tableJsonText,
	lastChats,
	tableHeadersText
) {
	let output = input;
	output = output.replace(/\$0/g, tableJsonText);
	output = output.replace(/\$1/g, lastChats);
	output = output.replace(/\$2/g, tableHeadersText);
	output = output.replace(/\$3/g, DERIVED.any.additionalPrompt ?? "");
	return output;
}

/**
 * 验证关键数据
 * @param {string} tableJsonText - 表格JSON文本
 * @param {string} lastChats - 最近聊天记录
 * @param {string} tableHeadersText - 表格头信息
 */
function validateKeyData(tableJsonText, lastChats, tableHeadersText) {
	if (!tableJsonText || tableJsonText === "[]") {
		EDITOR.warn("表格数据为空，可能导致重建效果不佳");
	}
	if (!lastChats || lastChats.trim() === "") {
		EDITOR.warn("聊天记录为空，可能导致重建效果不佳");
	}
	if (!tableHeadersText || tableHeadersText.trim() === "") {
		EDITOR.warn("表头信息为空，可能导致重建效果不佳");
	}
}

/**
 * 获取默认用户提示词
 * @returns {string} 默认用户提示词
 */
function getDefaultUserPrompt() {
	return `请你根据<整理规则>和<聊天记录>处理<当前表格>，并严格按照<当前表格>的格式回复我<新的表格>，回复务必使用中文，只回复<新的表格>的内容，不要回复多余的解释和思考：

<聊天记录>
$1
</聊天记录>

<当前表格>
$0
</当前表格>

<整理规则>
请整理和优化表格数据，保持结构完整性和内容准确性。
</整理规则>

<新的表格>
[请在此处回复整理后的表格数据]
</新的表格>`;
}

/**
 * 处理API响应并保存表格
 * @param {string} rawContent - API响应内容
 * @param {boolean} silentUpdate - 是否静默更新
 * @returns {Promise<void>}
 */
async function processAPIResponseAndSaveTable(rawContent, silentUpdate) {
	// 检查模板解析类型
	const temp =
		USER.tableBaseSetting.rebuild_message_template_list[
			USER.tableBaseSetting.lastSelectedTemplate
		];
	if (temp && temp.parseType === "text") {
		showTextPreview(rawContent);
	}

	let cleanContentTable = null;
	try {
		const parsed = safeParse(rawContent);
		cleanContentTable = Array.isArray(parsed)
			? parsed[parsed.length - 1]
			: parsed;
	} catch (error) {
		EDITOR.error(
			"解析响应内容失败，请检查API返回的内容是否符合预期格式。",
			error.message,
			error
		);
		showErrorTextPreview(rawContent);
		return;
	}

	if (!cleanContentTable) {
		EDITOR.error("生成表格保存失败：内容为空");
		return;
	}

	// 验证数据格式
	if (!Array.isArray(cleanContentTable)) {
		throw new Error("生成的新表格数据不是数组");
	}

	// 如果不是静默更新，显示操作确认
	if (!silentUpdate) {
		const confirmContent = confirmTheOperationPerformed(cleanContentTable);
		const tableRefreshPopup = new EDITOR.Popup(
			confirmContent,
			EDITOR.POPUP_TYPE.TEXT,
			"",
			{ okButton: "继续", cancelButton: "取消" }
		);
		EDITOR.clear();
		await tableRefreshPopup.show();
		if (!tableRefreshPopup.result) {
			EDITOR.info("操作已取消");
			return;
		}
	}

	// 更新聊天记录
	await updateChatWithNewTableData(cleanContentTable);

	BASE.refreshContextView();
	updateSystemMessageTableStatus();
	EDITOR.success("生成表格成功！");
}

/**
 * 更新聊天记录中的表格数据
 * @param {Array} cleanContentTable - 清理后的表格内容
 */
async function updateChatWithNewTableData(cleanContentTable) {
	const { piece } = USER.getChatPiece();
	if (!piece) {
		throw new Error("聊天记录为空，请至少有一条聊天记录后再总结");
	}

	for (const index in cleanContentTable) {
		let sheet;
		const table = cleanContentTable[index];

		if (table.tableUid) {
			sheet = BASE.getChatSheet(table.tableUid);
		} else if (table.tableIndex !== undefined) {
			const uid = DERIVED.any.waitingTableIdMap[table.tableIndex];
			sheet = BASE.getChatSheet(uid);
		} else {
			const uid = DERIVED.any.waitingTableIdMap[index];
			sheet = BASE.getChatSheet(uid);
		}

		if (!sheet) {
			continue;
		}

		const valueSheet = [table.columns, ...table.content].map((row) => [
			"",
			...row,
		]);
		sheet.rebuildHashSheetByValueSheet(valueSheet);
		sheet.save(piece, true);
	}

	await USER.getContext().saveChat();
}

/**
 * 重新生成完整表格
 * @param {boolean} force 是否强制刷新
 * @param {boolean} silentUpdate 是否静默更新
 * @param {string} chatToBeUsed 要使用的聊天记录
 * @returns {Promise<string>}
 */
export async function rebuildTableActions(
	force = false,
	silentUpdate = USER.tableBaseSetting.bool_silent_refresh,
	chatToBeUsed = ""
) {
	if (!SYSTEM.lazy("rebuildTableActions", 1000)) return;

	const isUseMainAPI = USER.tableBaseSetting.use_main_api ?? false;

	try {
		// 获取并验证表格数据
		const { latestTables } = getValidatedTableData();

		// 准备表格数据和提示词
		const { tableJsonText, tableHeadersText, lastChats } =
			await prepareTableDataAndPrompts(latestTables, chatToBeUsed);

		// 获取模板
		const template = getTemplate();
		let systemPrompt = template.system_prompt;
		let userPrompt = template.user_prompt_begin;

		// 解析系统提示词
		let parsedSystemPrompt = parseSystemPrompt(systemPrompt);

		// 处理提示词替换
		if (typeof parsedSystemPrompt === "string") {
			parsedSystemPrompt = replacePromptPlaceholders(
				parsedSystemPrompt,
				tableJsonText,
				lastChats,
				tableHeadersText
			);
		} else {
			parsedSystemPrompt = parsedSystemPrompt.map((mes) => ({
				...mes,
				content: replacePromptPlaceholders(
					mes.content,
					tableJsonText,
					lastChats,
					tableHeadersText
				),
			}));
		}

		userPrompt = replacePromptPlaceholders(
			userPrompt,
			tableJsonText,
			lastChats,
			tableHeadersText
		);

		// 验证关键数据
		validateKeyData(tableJsonText, lastChats, tableHeadersText);

		// 验证最终生成的prompts
		if (
			!parsedSystemPrompt ||
			(Array.isArray(parsedSystemPrompt) &&
				parsedSystemPrompt.length === 0) ||
			(typeof parsedSystemPrompt === "string" &&
				parsedSystemPrompt.trim() === "")
		) {
			EDITOR.error("systemPrompt为空，无法继续重建表格数据");
			return;
		}

		// 如果userPrompt为空，提供默认值
		if (!userPrompt || userPrompt.trim() === "") {
			userPrompt = getDefaultUserPrompt();
		}

		// 生成响应内容
		let rawContent;
		if (isUseMainAPI) {
			try {
				rawContent = await handleMainAPIRequest(
					parsedSystemPrompt,
					userPrompt
				);
				if (rawContent === "suspended") {
					EDITOR.info("操作已取消");
					return;
				}
			} catch (error) {
				EDITOR.clear();
				EDITOR.error("主API请求错误: ", error.message, error);
			}
		} else {
			try {
				rawContent = await handleCustomAPIRequest(
					parsedSystemPrompt,
					userPrompt
				);
				if (rawContent === "suspended") {
					EDITOR.clear();
					EDITOR.info("操作已取消");
					return;
				}
			} catch (error) {
				EDITOR.clear();
				EDITOR.error("自定义API请求错误: ", error.message, error);
			}
		}

		// 检查 rawContent 是否有效
		if (typeof rawContent !== "string") {
			EDITOR.clear();
			EDITOR.error("API响应内容无效，无法继续处理表格。");
			return;
		}

		if (!rawContent.trim()) {
			EDITOR.clear();
			EDITOR.error("API响应内容为空，空回复一般是破限问题");
			return;
		}

		// 处理API响应并保存表格
		await processAPIResponseAndSaveTable(rawContent, silentUpdate);
	} catch (e) {
		return;
	}
}

/**
 * 显示文本预览弹窗
 * @param {string} text - 要显示的文本
 */
async function showTextPreview(text) {
	const previewHtml = `
		<div>
			<span style="margin-right: 10px;">返回的总结结果，请复制后使用</span>
		</div>
		<textarea rows="10" style="width: 100%">${text}</textarea>
	`;

	const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, "", {
		wide: true,
	});
	await popup.show();
}

/**
 * 显示错误文本预览弹窗
 * @param {string} text - 要显示的错误文本
 */
async function showErrorTextPreview(text) {
	const previewHtml = `
		<div>
			<span style="margin-right: 10px;">这是AI返回的信息，无法被脚本解析而停止</span>
		</div>
		<textarea rows="10" style="width: 100%">${text}</textarea>
	`;

	const popup = new EDITOR.Popup(previewHtml, EDITOR.POPUP_TYPE.TEXT, "", {
		wide: true,
	});
	await popup.show();
}

/**
 * 创建重建预览项HTML元素
 * @param {string} label - 标签文本
 * @param {string} value - 显示值
 * @returns {HTMLElement} DOM元素
 */
function createPreviewItem(label, value) {
	const previewDiv = document.createElement("div");
	previewDiv.className = "rebuild-preview-item";
	previewDiv.innerHTML = `<span>${label}：</span>${value}`;
	return previewDiv;
}

/**
 * 初始化模板选择器
 * @param {HTMLElement} selectorContent - 选择器容器
 * @returns {Object} 包含选择器元素的对象
 */
function initializeTemplateSelector(selectorContent) {
	const $selector = $(
		selectorContent.querySelector("#rebuild_template_selector")
	);
	const $templateInfo = $(
		selectorContent.querySelector("#rebuild_template_info")
	);
	const $additionalPrompt = $(
		selectorContent.querySelector("#rebuild_additional_prompt")
	);

	$selector.empty();

	const temps = USER.tableBaseSetting.rebuild_message_template_list;
	Object.entries(temps).forEach(([key, prompt]) => {
		$selector.append(
			$("<option></option>")
				.val(key)
				.text(prompt.name || key)
		);
	});

	// 设置默认选中项
	const defaultTemplate =
		USER.tableBaseSetting?.lastSelectedTemplate || "rebuild_base";
	$selector.val(defaultTemplate);

	// 更新模板信息显示
	updateTemplateInfo($templateInfo, defaultTemplate, temps);

	// 监听选择器变化
	$selector.on("change", function () {
		const selectedTemplate = $(this).val();
		const template = temps[selectedTemplate];
		$templateInfo.text(template.info || "无模板信息");
	});

	return { $selector, $templateInfo, $additionalPrompt };
}

/**
 * 更新模板信息显示
 * @param {jQuery} $templateInfo - 模板信息显示元素
 * @param {string} defaultTemplate - 默认模板名称
 * @param {Object} temps - 模板对象
 */
function updateTemplateInfo($templateInfo, defaultTemplate, temps) {
	if (defaultTemplate === "rebuild_base") {
		$templateInfo.text(
			"默认模板，适用于Gemini，Grok，DeepSeek，使用聊天记录和表格信息重建表格，应用于初次填表、表格优化等场景。破限来源于TT老师。"
		);
	} else {
		const templateInfo = temps[defaultTemplate]?.info || "无模板信息";
		$templateInfo.text(templateInfo);
	}
}

/**
 * 重建表格界面
 */
export async function rebuildSheets() {
	const container = document.createElement("div");

	const style = document.createElement("style");
	style.innerHTML = `
		.rebuild-preview-item {
			display: flex;
			justify-content: space-between;
			align-items: center;
		}
		.rebuild-preview-text {
			display: flex;
			justify-content: left
		}
	`;
	container.appendChild(style);

	const h3Element = document.createElement("h3");
	h3Element.textContent = "重建表格数据";
	container.appendChild(h3Element);

	container.appendChild(
		createPreviewItem(
			"执行完毕后确认",
			USER.tableBaseSetting.bool_silent_refresh ? "否" : "是"
		)
	);

	container.appendChild(
		createPreviewItem(
			"API",
			USER.tableBaseSetting.use_main_api ? "使用主API" : "使用备用API"
		)
	);

	const hr = document.createElement("hr");
	container.appendChild(hr);

	// 创建选择器容器
	const selectorContainer = document.createElement("div");
	container.appendChild(selectorContainer);

	// 添加提示模板选择器
	const selectorContent = document.createElement("div");
	selectorContent.innerHTML = `
		<span class="rebuild-preview-text" style="margin-top: 10px">提示模板：</span>
		<select id="rebuild_template_selector" class="rebuild-preview-text text_pole" style="width: 100%">
			<option value="">加载中...</option>
		</select>
		<span class="rebuild-preview-text" style="margin-top: 10px">模板信息：</span>
		<div id="rebuild_template_info" class="rebuild-preview-text" style="margin-top: 10px"></div>
		<span class="rebuild-preview-text" style="margin-top: 10px">其他要求：</span>
		<textarea id="rebuild_additional_prompt" class="rebuild-preview-text text_pole" style="width: 100%; height: 80px;"></textarea>
	`;
	selectorContainer.appendChild(selectorContent);

	// 初始化选择器选项
	const { $selector, $additionalPrompt } =
		initializeTemplateSelector(selectorContent);

	const confirmation = new EDITOR.Popup(
		container,
		EDITOR.POPUP_TYPE.CONFIRM,
		"",
		{
			okButton: "继续",
			cancelButton: "取消",
		}
	);

	await confirmation.show();
	if (confirmation.result) {
		const selectedTemplate = $selector.val();
		const additionalPrompt = $additionalPrompt.val();
		USER.tableBaseSetting.lastSelectedTemplate = selectedTemplate;
		DERIVED.any.additionalPrompt = additionalPrompt;
		getPromptAndRebuildTable();
	}
}

/**
 * 将表格数据解析为Table数组
 * @param {Array} tablesData - 表格数据数组
 * @returns {Array} Table数组
 */
function tableDataToTables(tablesData) {
	return tablesData.map((item) => {
		// 强制确保 columns 是数组，且元素为字符串
		const columns = Array.isArray(item.columns)
			? item.columns.map((col) => String(col))
			: inferColumnsFromContent(item.content);
		return {
			tableName: item.tableName || "未命名表格",
			columns,
			content: item.content || [],
			insertedRows: item.insertedRows || [],
			updatedRows: item.updatedRows || [],
		};
	});
}

/**
 * 从内容推断列名
 * @param {Array} content - 表格内容
 * @returns {Array} 列名数组
 */
function inferColumnsFromContent(content) {
	if (!content || content.length === 0) return [];
	const firstRow = content[0];
	return firstRow.map((_, index) => `列${index + 1}`);
}

/**
 * 提取最近的聊天记录
 * @param {Array} chat - 聊天记录数组
 * @param {number} chatStairs - 要提取的聊天记录数量
 * @param {boolean} ignoreUserSent - 是否忽略用户发送的消息
 * @param {number|null} tokenLimit - 最大token限制，null表示无限制，优先级高于chatStairs
 * @returns {string} 提取的聊天记录字符串
 */
async function getRecentChatHistory(
	chat,
	chatStairs,
	ignoreUserSent = false,
	tokenLimit = 0
) {
	let filteredChat = chat;

	// 处理忽略用户发送消息的情况
	if (ignoreUserSent && chat.length > 0) {
		filteredChat = chat.filter((c) => c.is_user === false);
	}

	// 有效记录提示
	if (filteredChat.length < chatStairs && tokenLimit === 0) {
		EDITOR.success(
			`当前有效记录${filteredChat.length}条，小于设置的${chatStairs}条`
		);
	}

	const collected = [];
	let totalTokens = 0;

	// 从最新记录开始逆序遍历
	for (let i = filteredChat.length - 1; i >= 0; i--) {
		// 格式化消息并清理标签
		const currentStr =
			`${filteredChat[i].name}: ${filteredChat[i].mes}`.replace(
				/<tableEdit>[\s\S]*?<\/tableEdit>/g,
				""
			);

		// 计算Token
		const tokens = await estimateTokenCount(currentStr);

		// 如果是第一条消息且token数超过限制，直接添加该消息
		if (
			i === filteredChat.length - 1 &&
			tokenLimit !== 0 &&
			tokens > tokenLimit
		) {
			totalTokens = tokens;
			EDITOR.success(
				`最近的聊天记录Token数为${tokens}，超过设置的${tokenLimit}限制，将直接使用该聊天记录`
			);
			collected.push(currentStr);
			break;
		}

		// Token限制检查
		if (tokenLimit !== 0 && totalTokens + tokens > tokenLimit) {
			EDITOR.success(
				`本次发送的聊天记录Token数约为${totalTokens}，共计${collected.length}条`
			);
			break;
		}

		// 更新计数
		totalTokens += tokens;
		collected.push(currentStr);

		// 当 tokenLimit 为 0 时，进行聊天记录数量限制检查
		if (tokenLimit === 0 && collected.length >= chatStairs) {
			break;
		}
	}

	// 按时间顺序排列并拼接
	const chatHistory = collected.reverse().join("\n");
	return chatHistory;
}

/**
 * 修复表格格式
 * @param {string} inputText - 输入的文本
 * @returns {string} 修复后的文本
 */
function fixTableFormat(inputText) {
	try {
		return safeParse(inputText);
	} catch (error) {
		const popup = new EDITOR.Popup(
			`脚本无法解析返回的数据，可能是破限力度问题，也可能是输出掉格式。这里是返回的数据：<div>${inputText}</div>`,
			EDITOR.POPUP_TYPE.CONFIRM,
			"",
			{ okButton: "确定" }
		);
		popup.show();
		throw new Error("无法解析表格数据");
	}
}

// 暴露给全局
window.fixTableFormat = fixTableFormat;

/**
 * 创建表单配置对象
 * @param {string} title - 表单标题
 * @param {string} description - 表单描述
 * @param {string} selectedTemplate - 选中的模板名称
 * @returns {Object} 表单配置对象
 */
function createTemplateFormConfig(title, description, selectedTemplate) {
	const baseFields = [
		{
			label: "系统提示词",
			type: "textarea",
			rows: 6,
			dataKey: "system_prompt",
			description:
				"(填写破限，或者直接填写提示词整体json结构，填写结构的话，整理规则将被架空)",
		},
		{
			label: "总结规则",
			type: "textarea",
			rows: 6,
			dataKey: "user_prompt_begin",
			description: "(用于给AI说明怎么重新整理）",
		},
	];

	const fields = selectedTemplate
		? [
				{ label: "模板名字：", type: "label", text: selectedTemplate },
				...baseFields,
		  ]
		: [{ label: "模板名字", type: "text", dataKey: "name" }, ...baseFields];

	return {
		formTitle: title,
		formDescription: description,
		fields,
	};
}

/**
 * 修改重整理模板
 */
export async function modifyRebuildTemplate() {
	const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;

	if (selectedTemplate === "rebuild_base") {
		return EDITOR.warning("默认模板不能修改，请新建模板");
	}

	const sheetConfig = createTemplateFormConfig(
		"编辑表格总结模板",
		"设置总结时的提示词结构，$0为当前表格数据，$1为上下文聊天记录，$2为表格模板[表头]数据，$3为用户输入的附加提示",
		selectedTemplate
	);

	const initialData =
		USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
	const formInstance = new Form(sheetConfig, initialData);
	const popup = new EDITOR.Popup(
		formInstance.renderForm(),
		EDITOR.POPUP_TYPE.CONFIRM,
		"",
		{ okButton: "保存", allowVerticalScrolling: true, cancelButton: "取消" }
	);

	await popup.show();
	if (popup.result) {
		const result = formInstance.result();
		USER.tableBaseSetting.rebuild_message_template_list = {
			...USER.tableBaseSetting.rebuild_message_template_list,
			[selectedTemplate]: {
				...result,
				name: selectedTemplate,
			},
		};
		EDITOR.success(`修改模板 "${selectedTemplate}" 成功`);
	}
}

/**
 * 创建不重复的名称
 * @param {string} baseName - 基础名称
 * @returns {string} 唯一名称
 */
function createUniqueName(baseName) {
	let name = baseName;
	let counter = 1;
	while (USER.tableBaseSetting.rebuild_message_template_list[name]) {
		name = `${baseName} (${counter})`;
		counter++;
	}
	return name;
}

/**
 * 新建重整理模板
 */
export async function newRebuildTemplate() {
	const sheetConfig = createTemplateFormConfig(
		"新建表格总结模板",
		"设置表格总结时的提示词结构，$0为当前表格数据，$1为上下文聊天记录，$2为表格模板[表头]数据，$3为用户输入的附加提示"
	);

	const initialData = {
		name: "新表格总结模板",
		system_prompt:
			USER.tableBaseSetting.rebuild_default_system_message_template,
		user_prompt_begin:
			USER.tableBaseSetting.rebuild_default_message_template,
	};

	const formInstance = new Form(sheetConfig, initialData);
	const popup = new EDITOR.Popup(
		formInstance.renderForm(),
		EDITOR.POPUP_TYPE.CONFIRM,
		"",
		{ okButton: "保存", allowVerticalScrolling: true, cancelButton: "取消" }
	);

	await popup.show();
	if (popup.result) {
		const result = formInstance.result();
		const name = createUniqueName(result.name);
		result.name = name;
		USER.tableBaseSetting.rebuild_message_template_list = {
			...USER.tableBaseSetting.rebuild_message_template_list,
			[name]: result,
		};
		USER.tableBaseSetting.lastSelectedTemplate = name;
		refreshRebuildTemplate();
		EDITOR.success(`新建模板 "${name}" 成功`);
	}
}

/**
 * 删除重整理模板
 */
export async function deleteRebuildTemplate() {
	const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
	if (selectedTemplate === "rebuild_base") {
		return EDITOR.warning("默认模板不能删除");
	}

	const confirmation = await EDITOR.callGenericPopup(
		"是否删除此模板？",
		EDITOR.POPUP_TYPE.CONFIRM,
		"",
		{ okButton: "继续", cancelButton: "取消" }
	);

	if (confirmation) {
		const newTemplates = {};
		Object.values(
			USER.tableBaseSetting.rebuild_message_template_list
		).forEach((template) => {
			if (template.name !== selectedTemplate) {
				newTemplates[template.name] = template;
			}
		});

		USER.tableBaseSetting.rebuild_message_template_list = newTemplates;
		USER.tableBaseSetting.lastSelectedTemplate = "rebuild_base";
		refreshRebuildTemplate();
		EDITOR.success(`删除模板 "${selectedTemplate}" 成功`);
	}
}

/**
 * 导出重整理模板
 */
export async function exportRebuildTemplate() {
	const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
	if (selectedTemplate === "rebuild_base") {
		return EDITOR.warning("默认模板不能导出");
	}

	const template =
		USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
	if (!template) {
		return EDITOR.error(`未找到模板 "${selectedTemplate}"`);
	}

	const blob = new Blob([JSON.stringify(template, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${selectedTemplate}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
	EDITOR.success(`导出模板 "${selectedTemplate}" 成功`);
}

/**
 * 导入重整理模板
 */
export async function importRebuildTemplate() {
	const input = document.createElement("input");
	input.type = "file";
	input.accept = ".json";
	input.style.display = "none";
	document.body.appendChild(input);

	input.addEventListener("change", async (event) => {
		const file = event.target.files[0];
		if (!file) {
			EDITOR.error("未选择文件");
			return;
		}

		try {
			const text = await file.text();
			const template = JSON.parse(text);

			if (
				!template.name ||
				!template.system_prompt ||
				!template.user_prompt_begin
			) {
				throw new Error("无效的模板格式");
			}

			const name = createUniqueName(template.name);
			template.name = name;
			USER.tableBaseSetting.rebuild_message_template_list = {
				...USER.tableBaseSetting.rebuild_message_template_list,
				[name]: template,
			};
			USER.tableBaseSetting.lastSelectedTemplate = name;
			refreshRebuildTemplate();
			EDITOR.success(`导入模板 "${name}" 成功`);
		} catch (error) {
			EDITOR.error(`导入失败`, error.message, error);
		} finally {
			document.body.removeChild(input);
		}
	});

	input.click();
}

/**
 * 手动触发一次分步填表
 */
export async function triggerStepByStepNow() {
	TableTwoStepSummary("manual");
}

/**
 * 处理占位符替换
 * @param {string} text - 原始文本
 * @param {string} originTableText - 原始表格文本
 * @param {string} contextChats - 上下文聊天记录
 * @param {string} summaryChats - 总结聊天记录
 * @param {string} finalPrompt - 最终提示
 * @param {string} lorebookContent - 世界书内容
 * @returns {string} 处理后的文本
 */
function processPlaceholders(
	text,
	originTableText,
	contextChats,
	summaryChats,
	finalPrompt,
	lorebookContent
) {
	if (typeof text !== "string") return "";
	text = text.replace(/(?<!\\)\$0/g, () => originTableText);
	text = text.replace(/(?<!\\)\$1/g, () => contextChats);
	text = text.replace(/(?<!\\)\$2/g, () => summaryChats);
	text = text.replace(/(?<!\\)\$3/g, () => finalPrompt);
	text = text.replace(/(?<!\\)\$4/g, () => lorebookContent);
	return text;
}

/**
 * 获取世界书内容
 * @returns {Promise<string>} 世界书内容
 */
async function getLorebookContent() {
	let lorebookContent = "";
	if (USER.tableBaseSetting.separateReadLorebook && window.TavernHelper) {
		try {
			const charLorebooks = await window.TavernHelper.getCharLorebooks({
				type: "all",
			});
			const bookNames = [];

			if (charLorebooks.primary) {
				bookNames.push(charLorebooks.primary);
			}
			if (
				charLorebooks.additional &&
				charLorebooks.additional.length > 0
			) {
				bookNames.push(...charLorebooks.additional);
			}

			for (const bookName of bookNames) {
				if (bookName) {
					const entries =
						await window.TavernHelper.getLorebookEntries(bookName);
					if (entries && entries.length > 0) {
						lorebookContent += entries
							.map((entry) => entry.content)
							.join("\n");
					}
				}
			}
		} catch (e) {
			// 忽略世界书获取错误
		}
	}
	return lorebookContent;
}

/**
 * 解析步骤式提示词
 * @param {string} stepByStepPromptString - 步骤式提示词字符串
 * @returns {Array} 解析后的消息数组
 */
function parseStepByStepPrompt(stepByStepPromptString) {
	try {
		const promptMessages = JSON5.parse(stepByStepPromptString);
		if (!Array.isArray(promptMessages) || promptMessages.length === 0) {
			throw new Error("Parsed prompt is not a valid non-empty array.");
		}
		return promptMessages;
	} catch (e) {
		EDITOR.error(
			"独立填表提示词格式错误，无法解析。请检查插件设置。",
			e.message,
			e
		);
		throw e;
	}
}

/**
 * 执行增量更新（可用于普通刷新和分步总结）
 * @param {string} chatToBeUsed - 要使用的聊天记录, 为空则使用最近的聊天记录
 * @param {string} originTableText - 当前表格的文本表示
 * @param {string} finalPrompt - 最终提示
 * @param {Array} referencePiece - 参考用的piece
 * @param {boolean} useMainAPI - 是否使用主API
 * @param {boolean} silentUpdate - 是否静默更新,不显示操作确认
 * @param {boolean} [isSilentMode=false] - 是否以静默模式运行API调用（不显示加载提示）
 * @returns {Promise<string>} 'success', 'suspended', 'error', or empty
 */
export async function executeIncrementalUpdateFromSummary(
	chatToBeUsed = "",
	originTableText,
	finalPrompt,
	referencePiece,
	useMainAPI,
	silentUpdate = USER.tableBaseSetting.bool_silent_refresh,
	isSilentMode = false
) {
	if (!SYSTEM.lazy("executeIncrementalUpdate", 1000)) return "";

	try {
		DERIVED.any.waitingPiece = referencePiece;
		const separateReadContextLayers = Number(
			$("#separateReadContextLayers").val()
		);
		const contextChats = await getRecentChatHistory(
			USER.getContext().chat,
			separateReadContextLayers,
			true
		);
		const summaryChats = chatToBeUsed;

		// 获取角色世界书内容
		const lorebookContent = await getLorebookContent();

		// 解析步骤式提示词
		const stepByStepPromptString =
			USER.tableBaseSetting.step_by_step_user_prompt;
		const promptMessages = parseStepByStepPrompt(stepByStepPromptString);

		// 完整处理消息数组，替换每个消息中的占位符
		const processedMessages = promptMessages.map((msg) => ({
			...msg,
			content: processPlaceholders(
				msg.content,
				originTableText,
				contextChats,
				summaryChats,
				finalPrompt,
				lorebookContent
			),
		}));

		// 将处理后的完整消息数组传递给API请求处理函数
		const systemPromptForApi = processedMessages;
		const userPromptForApi = null;

		let rawContent;
		if (useMainAPI) {
			try {
				rawContent = await handleMainAPIRequest(
					systemPromptForApi,
					null,
					isSilentMode
				);
				if (rawContent === "suspended") {
					EDITOR.info("操作已取消 (主API)");
					return "suspended";
				}
			} catch (error) {
				EDITOR.error("主API请求错误: ", error.message, error);
				return "error";
			}
		} else {
			try {
				rawContent = await handleCustomAPIRequest(
					systemPromptForApi,
					userPromptForApi,
					false,
					isSilentMode
				);
				if (rawContent === "suspended") {
					EDITOR.info("操作已取消 (自定义API)");
					return "suspended";
				}
			} catch (error) {
				EDITOR.error("自定义API请求错误: ", error.message, error);
				return "error";
			}
		}

		if (typeof rawContent !== "string" || !rawContent.trim()) {
			EDITOR.error("API响应内容无效或为空。");
			return "error";
		}

		// 使用与常规填表完全一致的 getTableEditTag 函数来提取指令
		const { matches } = getTableEditTag(rawContent);

		if (!matches || matches.length === 0) {
			EDITOR.info(
				"AI未返回任何有效的<tableEdit>操作指令，表格内容未发生变化。"
			);
			return "success";
		}

		try {
			// 将提取到的、未经修改的原始指令数组传递给执行器
			executeTableEditActions(matches, referencePiece);
		} catch (e) {
			EDITOR.error("执行表格操作指令时出错: ", e.message, e);
		}

		USER.saveChat();
		BASE.refreshContextView();
		updateSystemMessageTableStatus();
		EDITOR.success("独立填表完成！");
		return "success";
	} catch (error) {
		EDITOR.error(`执行增量更新失败`, error.message, error);
		return "error";
	}
}
