import {SYSTEM, USER} from "../core/manager.js";

// Use sessionStorage for persistence within a session
export function resetPopupConfirmations() {
    sessionStorage.removeItem('disabledPopups');
    sessionStorage.removeItem('alwaysConfirmPopups');
    console.log('[Memory Enhancement] Popup confirmation states have been reset for this session.');
}

const bgc = '#3736bb'
const bgcg = '#de81f1'
// const bgc = 'var(--SmartThemeBotMesBlurTintColor)'
// const bgcg = 'var(--SmartThemeUserMesBlurTintColor)'
const tc = '#fff'

export async function newPopupConfirm(text, cancelText = 'Cancel', confirmText = 'Confirm', id = '', dontRemindText = null, alwaysConfirmText = null) {
    const disabledPopups = JSON.parse(sessionStorage.getItem('disabledPopups')) || {};
    const alwaysConfirmPopups = JSON.parse(sessionStorage.getItem('alwaysConfirmPopups')) || {};

    if (id && disabledPopups[id]) {
        // 如果“不再提醒”已激活，则返回特殊值，不显示弹窗
        return Promise.resolve('dont_remind_active'); 
    }
    if (id && alwaysConfirmPopups[id]) {
        // 如果“一直选是”已激活，则返回 true，不显示弹窗
        return Promise.resolve(true); 
    }
    // 否则，正常显示弹窗让用户选择
    return await new PopupConfirm().show(text, cancelText, confirmText, id, dontRemindText, alwaysConfirmText);
}

export class PopupConfirm {
    static get disabledPopups() { // Getter for external access if needed, though direct modification is in _handleAction
        return disabledPopups;
    }

    constructor() {
        this.uid = SYSTEM.generateRandomString(10);
        // this.confirm = false; // Less relevant now with specific promise resolutions
        this.toastContainer = null;
        this.toastElement = null;
        this.resolvePromise = null;
        this._text = '';
        this.messageText = null; // 保存文本元素的引用
        this.id = null; // To store the popup ID
    }

    _handleAction(resolutionValue) {
        let actualResolutionValue = resolutionValue;
        if (resolutionValue === 'dont_remind_selected' && this.id) {
            const disabledPopups = JSON.parse(sessionStorage.getItem('disabledPopups')) || {};
            disabledPopups[this.id] = true;
            sessionStorage.setItem('disabledPopups', JSON.stringify(disabledPopups));
            actualResolutionValue = true; // Act as if "Confirm" was pressed
        } else if (resolutionValue === 'always_confirm_selected' && this.id) {
            const alwaysConfirmPopups = JSON.parse(sessionStorage.getItem('alwaysConfirmPopups')) || {};
            alwaysConfirmPopups[this.id] = true;
            sessionStorage.setItem('alwaysConfirmPopups', JSON.stringify(alwaysConfirmPopups));
            actualResolutionValue = true; // Act as if "Confirm" was pressed
        }

        if (this.toastElement) {
            this.toastElement.style.opacity = '0';
            setTimeout(() => {
                if (this.toastContainer && this.toastElement && this.toastElement.parentNode === this.toastContainer) {
                    this.toastContainer.removeChild(this.toastElement);
                }
                if (this.toastContainer && this.toastContainer.children.length === 0 && document.body.contains(this.toastContainer)) {
                    document.body.removeChild(this.toastContainer);
                }
                this.toastElement = null;
            }, 300);
        }
        if (this.resolvePromise) {
            this.resolvePromise(actualResolutionValue);
        }
    }

    // 添加text属性的getter和setter
    get text() {
        return this._text;
    }

    set text(value) {
        this._text = value;
        if (this.messageText) {
            this.messageText.textContent = value;
        }
    }

    async show(message = 'Are you sure?', cancelText = 'Cancel', confirmText = 'Confirm', id = null, dontRemindText = null, alwaysConfirmText = null) {
        this._text = message;
        this.id = id; // Store the ID

        this.toastContainer = document.getElementById('toast-container');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-top-center';

            document.body.appendChild(this.toastContainer);
        }

        // Create toast element
        this.toastElement = document.createElement('div');
        this.toastElement.id = this.uid;
        this.toastElement.className = 'toast toast-confirm';
        this.toastElement.setAttribute('aria-live', 'polite');

        this.toastElement.style.padding = '6px 12px';
        this.toastElement.style.pointerEvents = 'auto';
        this.toastElement.style.cursor = 'normal';
        this.toastElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 1)';
        this.toastElement.style.transform = 'translateY(-30px)';
        this.toastElement.style.opacity = '0';
        this.toastElement.style.transition = 'all 0.3s ease';

        this.toastElement.style.background = `linear-gradient(to bottom right, ${bgc} 20%, ${bgcg})`;
        this.toastElement.style.backdropFilter = 'blur(calc(var(--SmartThemeBlurStrength)*2))';
        this.toastElement.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';

        // Create message container
        const messageEl = $('<div class="toast-message"></div>')[0];
        const messageIcon = $('<i class="fa-solid fa-code-branch""></i>')[0];
        this.messageText = $('<span id="toast_message_text"></span>')[0]; // 保存为类属性
        messageEl.style.display = 'flex';
        messageEl.style.flexDirection = 'row';
        messageEl.style.alignItems = 'center';
        messageEl.style.marginTop = '5px';
        messageEl.style.marginBottom = '10px';
        messageEl.style.color = tc;
        messageEl.style.fontWeight = 'bold';
        messageEl.style.gap = '10px';

        messageIcon.style.fontSize = '1.3rem';
        messageIcon.style.padding = '0'
        messageIcon.style.margin = '0'

        this.messageText.textContent = this._text; // 使用存储的text值
        messageEl.appendChild(messageIcon);
        messageEl.appendChild(this.messageText);

        // Create buttons container
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.gap = '10px';

        // Create confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.style.width = '100%'
        confirmBtn.style.padding = '3px 12px';
        confirmBtn.style.backgroundColor = bgc;
        confirmBtn.style.color = tc;
        confirmBtn.style.border = 'none';
        confirmBtn.style.borderRadius = '6px';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.fontSize = '0.85rem';
        confirmBtn.style.fontWeight = 'bold';
        confirmBtn.classList.add('popup-button-ok', 'menu_button', 'result-control', 'interactable');
        confirmBtn.onclick = () => this._handleAction(true);

        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.style.width = '100%';
        cancelBtn.style.padding = '3px 12px';
        cancelBtn.style.background = 'none';
        // cancelBtn.style.backgroundColor = bgcg;
        cancelBtn.style.color = tc;
        cancelBtn.style.border = `1px solid ${bgc}`;
        cancelBtn.style.borderRadius = '6px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '0.85rem';
        cancelBtn.classList.add('popup-button-cancel', 'menu_button', 'result-control', 'interactable');
        cancelBtn.onclick = () => this._handleAction(false);

        // Build the DOM structure
        buttons.appendChild(cancelBtn); // "否" button
        buttons.appendChild(confirmBtn); // "是" button

        // Create "Don't Remind" button if text and id are provided
        // Create "Don't Remind" button if text and id are provided
        if (dontRemindText && this.id) {
            const dontRemindBtn = document.createElement('button');
            dontRemindBtn.textContent = dontRemindText; // e.g., "不再提示"
            dontRemindBtn.style.width = '100%';
            dontRemindBtn.style.padding = '3px 12px';
            dontRemindBtn.style.background = 'none';
            dontRemindBtn.style.color = tc;
            dontRemindBtn.style.border = `1px solid ${bgcg}`;
            dontRemindBtn.style.borderRadius = '6px';
            dontRemindBtn.style.cursor = 'pointer';
            dontRemindBtn.style.fontSize = '0.85rem';
            dontRemindBtn.classList.add('popup-button-dont-remind', 'menu_button', 'result-control', 'interactable');
            dontRemindBtn.onclick = () => this._handleAction('dont_remind_selected');
            buttons.appendChild(dontRemindBtn);
        }
        
        // Create "Always Confirm" button if text and id are provided
        if (alwaysConfirmText && this.id) {
            const alwaysConfirmBtn = document.createElement('button');
            alwaysConfirmBtn.textContent = alwaysConfirmText; // e.g., "一直选是"
            alwaysConfirmBtn.style.width = '100%';
            alwaysConfirmBtn.style.padding = '3px 12px';
            alwaysConfirmBtn.style.background = 'none';
            alwaysConfirmBtn.style.color = tc;
            alwaysConfirmBtn.style.border = `1px solid ${bgc}`; // Same as cancel button for visual distinction
            alwaysConfirmBtn.style.borderRadius = '6px';
            alwaysConfirmBtn.style.cursor = 'pointer';
            alwaysConfirmBtn.style.fontSize = '0.85rem';
            alwaysConfirmBtn.classList.add('popup-button-always-confirm', 'menu_button', 'result-control', 'interactable');
            alwaysConfirmBtn.onclick = () => this._handleAction('always_confirm_selected');
            buttons.appendChild(alwaysConfirmBtn);
        }

        this.toastElement.appendChild(messageEl);
        this.toastElement.appendChild(buttons);
        // this.toastContainer.appendChild(this.toastElement);
        // 插入到容器的顶部而不是底部
        this.toastContainer.insertBefore(this.toastElement, this.toastContainer.firstChild);

        // Trigger animation
        setTimeout(() => {
            this.toastElement.style.transform = 'translateY(0)';
            this.toastElement.style.opacity = '1';
        }, 10);

        // Return a promise that resolves when user clicks a button
        return new Promise((resolve) => {
            this.resolvePromise = resolve; // _handleAction will use this
            // Button onclick handlers are now set directly to call _handleAction.
        });
    }

    // 关闭弹窗 - this.close() can be called if an external force closes the popup.
    // _handleAction now manages the standard cleanup path.
    close() {
        this.cancelFrameUpdate();
        // If resolvePromise exists, it means the popup was shown and might not have been resolved yet.
        // Resolve with a default value (e.g., false or a specific 'closed_manually' value) if needed.
        // For now, just visually close it. If _handleAction wasn't called, the promise won't resolve.
        // This behavior might need adjustment based on how .close() is used externally.
        // Typically, user interaction (handled by _handleAction) resolves the promise.
        if (this.toastElement) {
            this.toastElement.style.opacity = '0';
            setTimeout(() => {
                if (this.toastContainer && this.toastElement && this.toastElement.parentNode === this.toastContainer) {
                    this.toastContainer.removeChild(this.toastElement);
                }
                if (this.toastContainer && this.toastContainer.children.length === 0 && document.body.contains(this.toastContainer)) {
                    document.body.removeChild(this.toastContainer);
                }
                this.toastElement = null;
            }, 300);
        }
        // If the promise needs to be resolved when close() is called externally:
        // if (this.resolvePromise) {
        //     this.resolvePromise('closed_externally'); // Or false, or null
        //     this.resolvePromise = null; // Prevent multiple resolutions
        // }
    }

    frameUpdate(callback) {
        // 清理现有的动画循环
        this.cancelFrameUpdate();

        // 只在菜单显示时启动动画循环
        if (this.toastElement.style.display !== 'none') {
            const updateLoop = (timestamp) => {
                // 如果菜单被隐藏，停止循环
                if (this.toastElement.style.display === 'none') {
                    this.cancelFrameUpdate();
                    return;
                }

                callback(this, timestamp); // 添加 timestamp 参数以便更精确的动画控制
                this._frameUpdateId = requestAnimationFrame(updateLoop);
            };

            this._frameUpdateId = requestAnimationFrame(updateLoop);
        }
    }

    cancelFrameUpdate() {
        if (this._frameUpdateId) {
            cancelAnimationFrame(this._frameUpdateId);
            this._frameUpdateId = null;
        }
    }
}

// 获取计算后的颜色值并确保完全不透明
// function getSolidColor (target) {
//     const colorValue = getComputedStyle(document.documentElement)
//         .getPropertyValue(target).trim();
//
//     // 创建临时元素来解析颜色
//     const tempEl = document.createElement('div');
//     tempEl.style.color = colorValue;
//     document.body.appendChild(tempEl);
//
//     // 获取计算后的 RGB 值
//     const rgb = getComputedStyle(tempEl).color;
//     document.body.removeChild(tempEl);
//
//     // 确保返回的是 rgb() 格式（不带 alpha）
//     return rgb.startsWith('rgba') ? rgb.replace(/,[^)]+\)/, ')') : rgb;
// }
