import applicationFunctionManager from "./appFuncManager.js";

let _lang = undefined;
let _translations = undefined;

/**
 * Normalize locale code to match available translation files
 * @param {string} locale - Raw locale from SillyTavern (e.g., 'en', 'en-US', 'zh-CN')
 * @returns {string} - Normalized locale code matching file names
 */
function normalizeLocale(locale) {
    if (!locale) return 'en';
    
    const lowerLocale = locale.toLowerCase();
    
    // Map English variants to 'en'
    if (lowerLocale.startsWith('en')) {
        return 'en';
    }
    
    // Map Chinese variants
    if (lowerLocale === 'zh-tw' || lowerLocale === 'zh-hant' || lowerLocale === 'zh_tw') {
        return 'zh-tw';
    }
    if (lowerLocale.startsWith('zh')) {
        return 'zh-cn';
    }
    
    // Return normalized locale (replace underscores with hyphens)
    return lowerLocale.replace('_', '-');
}

/**
 * 异步获取翻译文件
 * @param {string} locale - 语言标识符 (e.g., 'en', 'zh-cn')
 * @returns {Promise<Object>} - 翻译对象
 */
async function fetchTranslations(locale) {
    try {
        const normalizedLocale = normalizeLocale(locale);
        console.log(`Loading translations for locale: ${locale} -> ${normalizedLocale}`);
        
        const response = await fetch(`/scripts/extensions/third-party/st-memory-enhancement/assets/locales/${normalizedLocale}.json`);
        if (!response.ok) {
            console.warn(`Could not load translations for ${normalizedLocale}, falling back to en`);
            // Fallback to English if requested locale is not available
            if (normalizedLocale !== 'en') {
                return await fetchTranslations('en');
            }
            return {};
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        return {};
    }
}

async function getTranslationsConfig() {
    if (_lang === undefined) {
        const rawLocale = applicationFunctionManager.getCurrentLocale();
        _lang = normalizeLocale(rawLocale);
        console.log(`Detected locale: ${rawLocale} -> normalized: ${_lang}`);
    }
    if (_lang === undefined || _lang === 'en') {
        _lang = 'en';
        return { translations: {}, lang: _lang };
    }
    if (_translations === undefined) {
        _translations = await fetchTranslations(_lang)
    }
    return { translations: _translations, lang: _lang };
}

/**
 * 将翻译应用到 DOM 元素
 * @param {Object} translations - 翻译对象
 */
function applyTranslations(translations) {
    console.log("Applying translations", translations);
    // 遍历所有具有 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            // 如果元素有 title 属性，则翻译 title 属性
            if (element.hasAttribute('title')) {
                element.setAttribute('title', translations[key]);
            } else {
                // 否则翻译元素的文本内容
                element.textContent = translations[key];
            }
        }
    });

    // 通过 CSS 选择器翻译其他元素
    translateElementsBySelector(translations, '#table_clear_up a', "Reorganize tables now");
    translateElementsBySelector(translations, '#dataTable_to_chat_button a', "Edit style of tables rendered in conversation");
}

/**
 * 使用 CSS 选择器翻译元素
 * @param {Object} translations - 翻译对象
 * @param {string} selector - CSS 选择器
 * @param {string} key - 翻译键
 */
function translateElementsBySelector(translations, selector, key) {
    if (translations[key]) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.textContent = translations[key];
        });
    }
}

/**
 * 对指定范围的对象进行翻译
 * @param targetScope
 * @param source
 * @returns {Promise<*|Object|Array|string>}
 */
export async function translating(targetScope, source) {
    let { translations, lang } = await getTranslationsConfig();
    if (lang === 'en') {
        return source;
    }

    translations = translations[targetScope];
    /**
     * 递归翻译对象中的所有字符串
     * @param {Object|Array|string} obj - 需要翻译的对象或值
     * @returns {Object|Array|string} - 翻译后的对象或值
     */
    function translateRecursively(obj) {
        // 如果是字符串，尝试翻译
        if (typeof obj === 'string') {
            return translations[obj] || obj;
        }

        // 如果是数组，遍历数组元素并递归翻译
        if (Array.isArray(obj)) {
            return obj.map(item => translateRecursively(item));
        }

        // 如果是对象，遍历对象属性并递归翻译
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    result[key] = translateRecursively(obj[key]);
                }
            }
            return result;
        }

        // 其他类型的值保持不变
        return obj;
    }

    // 如果翻译字典为空，直接返回原对象
    if (!translations || Object.keys(translations).length === 0) {
        console.warn("No translations available for locale:", lang);
        return source;
    }

    // 对目标对象进行递归翻译
    if (source !== null && typeof source === 'object') {
        return translateRecursively(source);
    }

    return source;
}

/**
 * 对变量切换语言
 * @param targetScope
 * @param source
 */
export async function switchLanguage(targetScope, source) {
    const { translations, lang } = await getTranslationsConfig()
    if (lang === 'en') {
        return source;
    }

    return {...source, ...translations[targetScope] || {}};
}

/**
 * 对初始化加载的html应用翻译和本地化的主函数
 */
export async function executeTranslation() {
    const { translations, lang } = await getTranslationsConfig();
    if (lang === 'en') {
        return;
    }

    console.log("Current Locale: ", lang);
    // 获取翻译的 JSON 文件
    if (Object.keys(translations).length === 0) {
        console.warn("No translations found for locale:", lang);
        return;
    }

    // 应用翻译
    applyTranslations(translations);

    console.log("Translation completed for locale:", lang);
}
