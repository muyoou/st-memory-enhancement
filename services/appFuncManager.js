import {
	saveSettingsDebounced,
	saveSettings,
	getSlideToggleOptions,
	generateRaw,
	saveChat,
	eventSource,
	event_types,
	getRequestHeaders,
} from "/script.js";
import { DOMPurify, Bowser, slideToggle } from "/lib.js";
import {
	extension_settings,
	getContext,
	renderExtensionTemplateAsync,
} from "/scripts/extensions.js";
import { POPUP_TYPE, Popup, callGenericPopup } from "/scripts/popup.js";
import {
	power_user,
	applyPowerUserSettings,
	getContextSettings,
	loadPowerUserSettings,
} from "/scripts/power-user.js";
import {
	LoadLocal,
	SaveLocal,
	LoadLocalBool,
} from "/scripts/f-localStorage.js";
import { getCurrentLocale } from "/scripts/i18n.js";
import { debugWarn } from "./debugs.js";

/**
 * appManager 对象，用于集中管理和暴露常用的应用程序功能和库。
 * 方便在应用程序的不同模块中统一访问和使用这些功能。
 */
const applicationFunctionManager = {
	// script.js 模块
	saveSettingsDebounced,
	saveSettings,
	getSlideToggleOptions,
	generateRaw,
	saveChat,
	eventSource,
	event_types,
	getRequestHeaders,

	// lib.js 模块
	DOMPurify,
	Bowser,
	slideToggle,

	// scripts/extensions.js 模块
	extension_settings,
	getContext,
	renderExtensionTemplateAsync,

	// scripts/popup.js 模块
	POPUP_TYPE,
	Popup,
	callGenericPopup,

	// scripts/power-user.js 模块
	power_user,
	applyPowerUserSettings,
	getContextSettings,
	loadPowerUserSettings,

	// scripts/f-localStorage.js 模块
	LoadLocal,
	SaveLocal,
	LoadLocalBool,

	// scripts/i18n.js 模块
	getCurrentLocale,

	// 初始化时为 null
	doNavbarIconClick: null,

	// 初始化方法
	async init() {
		try {
			const { doNavbarIconClick } = await import("/script.js");
			this.doNavbarIconClick = doNavbarIconClick || null;
		} catch (error) {
			debugWarn("无法导入 doNavbarIconClick:", error);
			this.doNavbarIconClick = () => {
				debugWarn("doNavbarIconClick 不可用");
			};
		}
	},
};

// 导出前初始化
applicationFunctionManager.init();

export default applicationFunctionManager;
