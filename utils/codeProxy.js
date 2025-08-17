import { BASE, DERIVED, EDITOR, SYSTEM, USER } from "../core/manager.js";
import { debugLog, debugError } from "../services/debugs.js";

/**
 * @description 辅助函数，递归创建 Proxy
 * @param {Object} obj - 要代理的对象
 * @returns {Object} - 创建的 Proxy 对象
 */
export const createProxy = (obj) => {
	return new Proxy(obj, {
		get(target, prop) {
			return target[prop];
		},
		set(target, prop, newValue) {
			target[prop] = newValue; // 直接修改原始的 props 对象
			return true;
		},
	});
};

export const createProxyWithUserSetting = (target, allowEmpty = false) => {
	return new Proxy(
		{},
		{
			get: (_, property) => {
				// 最优先从用户设置数据中获取
				if (
					USER.getSettings()[target] &&
					property in USER.getSettings()[target]
				) {
					if (typeof DEBUG_MODE !== "undefined" && DEBUG_MODE) {
						debugLog(`变量 ${property} 已从用户设置中获取`);
					}
					return USER.getSettings()[target][property];
				}
				// 尝试从老版本的数据位置 USER.getExtensionSettings().muyoo_dataTable 中获取
				if (
					USER.getExtensionSettings()[target] &&
					property in USER.getExtensionSettings()[target]
				) {
					if (typeof DEBUG_MODE !== "undefined" && DEBUG_MODE) {
						debugLog(`变量 ${property} 未找到, 已从默认设置中获取`);
					}
					const value = USER.getExtensionSettings()[target][property];
					if (!USER.getSettings()[target]) {
						USER.getSettings()[target] = {}; // 初始化，如果不存在
					}
					USER.getSettings()[target][property] = value;
					return value;
				}
				// 如果 USER.getExtensionSettings().muyoo_dataTable 中也不存在，则从 defaultSettings 中获取
				if (
					USER.tableBaseDefaultSettings &&
					property in USER.tableBaseDefaultSettings
				) {
					// 只在开发模式下输出调试信息，避免日志过多
					if (typeof DEBUG_MODE !== "undefined" && DEBUG_MODE) {
						debugLog(`变量 ${property} 未找到, 已从默认设置中获取`);
					}
					return USER.tableBaseDefaultSettings[property];
				}
				// 如果 defaultSettings 中也不存在，则检查是否允许为空
				if (allowEmpty) {
					return undefined;
				}
				// 如果 defaultSettings 中也不存在，则报错
				EDITOR.error(`变量 ${property} 未在默认设置中找到, 请检查代码`);
				return undefined;
			},
			set: (_, property, value) => {
				debugLog(`设置变量 ${property} 为 ${value}`);
				if (!USER.getSettings()[target]) {
					USER.getSettings()[target] = {}; // 初始化，如果不存在
				}
				USER.getSettings()[target][property] = value;
				USER.saveSettings();
				return true;
			},
		}
	);
};
