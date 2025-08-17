import { SYSTEM, USER } from "../core/manager.js";

/**
 * 调试打印工具函数
 * 只在配置中的debug模式为true时执行打印操作
 * @param {string} type - 打印类型 (log, debug, info, warn, error)
 * @param {...any} args - 要打印的参数
 */
export function debugPrint(type, ...args) {
	// 检查debug模式是否开启
	if (
		USER &&
		USER.tableBaseSetting &&
		USER.tableBaseSetting.tableDebugModeAble
	) {
		switch (type) {
			case "log":
				console.log(...args);
				break;
			case "debug":
				console.debug(...args);
				break;
			case "info":
				console.info(...args);
				break;
			case "warn":
				console.warn(...args);
				break;
			case "error":
				console.error(...args);
				break;
			default:
				console.log(...args);
		}
	}
}

/**
 * 快捷调试打印函数
 */
export const debugLog = (...args) => debugPrint("log", ...args);
export const debugDebug = (...args) => debugPrint("debug", ...args);
export const debugInfo = (...args) => debugPrint("info", ...args);
export const debugWarn = (...args) => debugPrint("warn", ...args);
export const debugError = (...args) => debugPrint("error", ...args);

// /**______________________请注意不要把填写后的API密钥上传了______________________*/
// /**
//  * 仅用于测试，请注意不要把填写后的API密钥上传了
//  * @type {{model_name: string, api_url: string, api_key: string, max_tokens: number, temperature: number, system_prompt: string}}
//  */
// const testConfig = {
//     api_url: "",
//     api_key: "",
//     model_name: "gemini-2.0-flash",
//     system_prompt: "你是一个专业的翻译助手",
//     temperature: 0.7,
//     max_tokens: 2000,
// };

export async function rollbackVersion() {
	// 弹出确认
	if (
		confirm(
			"初始化2.0表格数据？该操作无法回退！（将销毁当前对话的所有新表数据，清空所有新表格模板，用于模拟回退上一版本，该功能仅用于调试。）"
		)
	) {
		USER.tableBaseSetting.updateIndex = 3;
		delete USER.getSettings().table_database_templates;
		delete USER.getContext().chatMetadata.sheets;

		const context_chat = USER.getContext().chat;
		if (context_chat) {
			for (let piece of context_chat) {
				delete piece.hash_sheets;
				delete piece.two_step_links;
				delete piece.two_step_waiting;
			}
		}

		USER.saveSettings();
		USER.saveChat();
		console.log(
			"已清除表格数据: ",
			USER.getSettings(),
			USER.getContext().chatMetadata,
			USER.getChatPiece()
		);
		return true;
	} else {
		console.log("用户取消了清除操作");
		return false;
	}
}

/**______________________请注意不要把填写后的API密钥上传了______________________*/
export function functionToBeRegistered() {
	SYSTEM.f(rollbackVersion, "回退上一版本");
	// SYSTEM.f(()=>{
	//     let sourceData = {}
	//     const s = BASE.sheetsData.context
	//     console.log(s, s[0])
	//     console.log(s[0].cellHistory[0])
	//     console.log(s[0].cellHistory[0].data.description)
	// }, "打印表格源")
	// SYSTEM.f(()=>{
	//     EDITOR.info("测试信息")
	// }, "测试信息")
	// SYSTEM.f(async ()=>{
	//     EDITOR.confirm(
	//         '执行操作?',
	//         '取消',
	//         '确认'
	//     ).then((r)=>{
	//         console.log(r)
	//     })
	// }, "测试confirm")
	// // 测试非流式API调用
	// SYSTEM.f(async () => {
	//     const llmService = new LLMApiService(testConfig);
	//
	//     try {
	//         console.log("正在测试 API 连接(非流式模式)...");
	//
	//         // 测试连接
	//         const testResponse = await llmService.testConnection();
	//         console.log("API 连接测试成功(非流式模式)!", testResponse);
	//
	//         // 测试翻译
	//         console.log("正在测试翻译功能(非流式模式)...");
	//         const testText = "This is a test sentence to check if the translation service is working properly.";
	//         const translation = await llmService.callLLM(testText);
	//
	//         console.log(`翻译测试成功(非流式模式)! 原文: ${testText}, 译文: ${translation}`);
	//     } catch (error) {
	//         console.log("API 测试失败(非流式模式):", error.message);
	//         console.error(error);
	//     }
	// }, "llmApi非流式");
	//
	// // 测试流式API调用
	// SYSTEM.f(async () => {
	//     const llmService = new LLMApiService(testConfig);
	//
	//     try {
	//         console.log("正在测试 API 连接(流式模式)...");
	//
	//         // 测试连接(流式模式下仍然使用非流式测试)
	//         const testResponse = await llmService.testConnection();
	//         console.log("API 连接测试成功(流式模式)!", testResponse);
	//
	//         // 测试翻译(流式模式)
	//         console.log("正在测试翻译功能(流式模式)...");
	//         const testText = "Abstract. Most 3D Gaussian Splatting (3D-GS) based methods for urban\n" +
	//             "scenes initialize 3D Gaussians directly with 3D LiDAR points, which\n" +
	//             "not only underutilizes LiDAR data capabilities but also overlooks the\n" +
	//             "potential advantages of fusing LiDAR with camera data. In this paper,\n" +
	//             "we design a novel tightly coupled LiDAR-Camera Gaussian Splatting\n" +
	//             "(TCLC-GS) to fully leverage the combined strengths of both LiDAR\n" +
	//             "and camera sensors, enabling rapid, high-quality 3D reconstruction and\n" +
	//             "novel view RGB/depth synthesis. TCLC-GS designs a hybrid explicit\n" +
	//             "(colorized 3D mesh) and implicit (hierarchical octree feature) 3D representation\n" +
	//             "derived from LiDAR-camera data, to enrich the properties of\n" +
	//             "3D Gaussians for splatting. 3D Gaussian’s properties are not only initialized\n" +
	//             "in alignment with the 3D mesh which provides more completed 3D\n" +
	//             "shape and color information, but are also endowed with broader contextual\n" +
	//             "information through retrieved octree implicit features. During the\n" +
	//             "Gaussian Splatting optimization process, the 3D mesh offers dense depth\n" +
	//             "information as supervision, which enhances the training process by learning\n" +
	//             "of a robust geometry. Comprehensive evaluations conducted on the\n" +
	//             "Waymo Open Dataset and nuScenes Dataset validate our method’s stateof-\n" +
	//             "the-art (SOTA) performance. Utilizing a single NVIDIA RTX 3090 Ti,\n" +
	//             "our method demonstrates fast training and achieves real-time RGB and\n" +
	//             "depth rendering at 90 FPS in resolution of 1920×1280 (Waymo), and\n" +
	//             "120 FPS in resolution of 1600×900 (nuScenes) in urban scenarios.";
	//
	//         // 流式回调函数
	//         let fullResponse = "";
	//         const streamCallback = (chunk) => {
	//             fullResponse += chunk;
	//             console.log(fullResponse);
	//         };
	//
	//         console.log("开始流式传输...");
	//         const translation = await llmService.callLLM(testText, streamCallback);
	//
	//         console.log("\n流式传输完成!");
	//         console.log(`完整译文: ${translation}`);
	//     } catch (error) {
	//         console.log("API 测试失败(流式模式):", error.message);
	//         console.error(error);
	//     }
	// }, "llmApi流式");
	//
	// // 测试流式API调用
	// SYSTEM.f(async () => {
	//     console.log(getRequestHeaders())
	// }, "secrets测试");
}
