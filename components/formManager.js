// formManager.js
class Form {
    constructor(formConfig, initialData) {
        this.formConfig = formConfig;
        // 创建数据副本
        this.formData = { ...initialData };
        this.eventHandlers = {}; // 用于存储外部传入的事件处理函数
    }

    /**
     * 注册事件处理函数
     * @param {string} eventName - 事件名称，例如按钮的 id 或 action
     * @param {function} handler - 事件处理函数
     */
    on(eventName, handler) {
        this.eventHandlers[eventName] = handler;
    }


    /**
     * 渲染表单 HTML 字符串
     * @returns {string} - 表单 HTML 字符串
     */
    renderForm() {
        const config = this.formConfig;

        if (!config) {
            return `<div>未知的表单配置，无法生成编辑内容。</div>`;
        }

        // 构建表单 HTML 字符串
        let contentHTML = `
            <div class="wide100p padding5 dataBankAttachments">
                <h2 class="marginBot5"><span>${config.formTitle}</span></h2>
                <div>${config.formDescription}</div>
                <div class="dataTable_tablePrompt_list">
        `;

        // 遍历字段配置生成表单项
        for (const field of config.fields) {
            field.id = field.id || field.dataKey; // 如果没有指定 id，则使用 dataKey 作为 id
            if (field.type === 'button') {
                contentHTML += `
                    <div class="form-buttons">
                        <i class="menu_button menu_button_icon ${field.iconClass}" id="${field.id}">
                            <a>${field.text}</a>
                        </i>
                    </div>
                `;
            } else {
                if (field.type === 'checkbox') {
                    contentHTML += `
                        <div class="checkbox-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <input type="checkbox" id="${field.id}" data-key="${field.dataKey}">
                            <label for="${field.id}" style="margin-left: 5px;">${field.label}</label>
                        </div>
                    `;
                } else if (field.type === 'number') {
                    contentHTML += `
                        <div class="number-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <label for="${field.id}" style="margin-right: 5px;">${field.label}</label>
                            <input type="number" id="${field.id}" class="text_pole wideMax100px margin0">
                        </div>
                    `;
                } else if (field.type === 'label') {
                    contentHTML += `
                        <div class="number-container" style="display: flex; align-items: center; margin-bottom: 10px;">
                            <label for="${field.id}" style="margin-right: 5px;">${field.label}</label>
                            <div>${field.text}</div>
                        </div>
                    `;
                } else {
                    contentHTML += `
                    <label>${field.label}</label>
                `;
                    if (field.description) {
                        contentHTML += `<small> ${field.description}</small>`;
                    }
                    if (field.type === 'text') {
                        contentHTML += `<input type="text" id="${field.id}" class="margin0 text_pole" style=" margin-bottom: 20px;"/>`;
                    } else if (field.type === 'textarea') {
                        contentHTML += `<textarea id="${field.id}" class="wide100p" rows="${field.rows || 2}"></textarea>`;
                    } else if (field.type === 'select') {
                        contentHTML += `
                        <select id="${field.id}">`;
                        if (Array.isArray(field.options)) {
                            field.options.forEach(option => {
                                contentHTML += `<option value="${option.value}">${option.text || option.value || option}</option>`;
                            });
                        }
                        contentHTML += `
                        </select>
                    `;
                    }
                }
            }
        }


        contentHTML += `
                </div>
            </div>
        `;

        const self = this; // 缓存 this 上下文，以便在 setTimeout 中使用

        // 添加事件监听器 和 初始化弹窗内容
        setTimeout(() => { // 确保 DOM 元素已渲染
            for (const field of config.fields) {
                const inputElement = document.getElementById(field.id);
                if (!inputElement) continue; // 元素可能不存在

                if (field.type === 'button') {
                    // 为按钮添加点击事件
                    inputElement.addEventListener('click', () => {
                        if (field.event && typeof field.event === 'string' && self.eventHandlers[field.event]) {
                            self.eventHandlers[field.event](self.formData); // 执行外部传入的事件处理函数，并传递 formData
                        } else if (field.event && typeof field.event === 'function') {
                            field.event(self.formData); // 或者直接执行配置中的函数 (如果 event 是函数)
                        }
                    });
                } else {
                    // 初始化值，从 formData 中读取
                    if (self.formData[field.dataKey] !== undefined) {
                        if (field.type === 'checkbox') {
                            inputElement.checked = self.formData[field.dataKey] === true;
                        } else {
                            inputElement.value = self.formData[field.dataKey] || '';
                        }
                    }

                    // 添加事件监听器，修改 formData
                    if (field.type === 'checkbox') {
                        inputElement.addEventListener('change', (e) => { self.formData[field.dataKey] = e.target.checked; });
                    } else {
                        inputElement.addEventListener('input', (e) => { self.formData[field.dataKey] = e.target.value; });
                    }
                }
            }
        }, 0);

        return contentHTML;
    }

    /**
     * 获取表单修改后的数据副本
     * @returns {object} - 修改后的数据副本
     */
    result() {
        return this.formData;
    }
}

export { Form };
