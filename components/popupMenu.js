
const MenuItemType = {
    normal: 'normal',
    warning: 'warning',
}

/**
 * @description Popup menu class - Used to create and manage popup menus
 */
export class PopupMenu {
    ItemType = MenuItemType
    /**
     * Static property, used to store the current active PopupMenu instance to make it global singleton
     * @type {null}
     */
    static instance = null;

    /**
     * Constructor
     * @param {object} [options] - Optional configuration
     * @param {boolean} [options.lasting=false] - Whether to persist. If true, does not destroy instance on click outside or menu item click, only hides
     */
    constructor(options = {}) {
        if (PopupMenu.instance) {
            PopupMenu.instance.destroy();
        }

        this.menuItems = [];
        this.lasting = false;
        this.popupContainer = null;
        this._closePromise = null;
        this._closeResolver = null;
        this._frameUpdateId = null;

        this.#init(options);
        PopupMenu.instance = this;
    }

    add(html, event, type = MenuItemType.normal) {
        const index = this.menuItems.length;
        this.menuItems.push({ html, event, type });
        this.menuItemIndexMap.set(html, index); // Map HTML content to index
    }

    renderMenu() {
        this.menuContainer.innerHTML = '';

        this.menuItems.forEach((item, index, type) => {
            const menuItem = document.createElement('div');
            menuItem.innerHTML = item.html;
            menuItem.style.padding = '5px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.userSelect = 'none';
            menuItem.style.justifyContent = 'flex-start';
            menuItem.style.alignItems = 'center';
            menuItem.classList.add('dynamic-popup-menu-item', 'list-group-item');

            if (item.type === MenuItemType.warning) {
                menuItem.classList.add('redWarningText');
            }

            this.menuContainer.appendChild(menuItem);

            // Map menu item elements to index
            this.menuItemIndexMap.set(menuItem, index);
        });

        return this.popupContainer;
    }

    /**
     * Show menu
     * @param {number} x - Menu X coordinate (relative to parent)
     * @param {number} y - Menu Y coordinate (relative to parent)
     * @returns {Promise} Returns a Promise, resolved when menu is closed
     */
    async show(x = 0, y = 0) {
        // Clear previous close Promise
        if (this._closePromise) {
            this._closeResolver?.();
            this._closePromise = null;
            this._closeResolver = null;
        }

        this.popupContainer.style.left = `${x}px`;
        this.popupContainer.style.top = `${y}px`;
        this.popupContainer.style.display = 'block';
        this.popupContainer.style.zIndex = '9999';

        // Create new Promise to track close event
        this._closePromise = new Promise((resolve) => {
            this._closeResolver = resolve;
        });

        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutside.bind(this));
        }, 0);

        return this._closePromise;
    }

    /**
     * Hide menu
     */
    hide() {
        this.cancelFrameUpdate();
        this.popupContainer.style.display = 'none';
        document.removeEventListener('click', this.handleClickOutside.bind(this));

        // Trigger resolve of close Promise
        this._closeResolver?.();
        this._closePromise = null;
        this._closeResolver = null;
    }

    /**
     * Destroy menu
     */
    destroy() {
        this.cancelFrameUpdate();
        document.removeEventListener('click', this.handleClickOutside.bind(this));
        if (this.popupContainer.parentNode) {
            this.popupContainer.parentNode.removeChild(this.popupContainer);
        }

        // Trigger resolve of close Promise
        this._closeResolver?.();
        this._closePromise = null;
        this._closeResolver = null;
    }

    #init(options) {
        this.menuItems = [];
        this.lasting = options.lasting === true;
        this.menuItemIndexMap = new Map();      // Use Map to store mapping between menu items and their indices

        this.popupContainer = document.createElement('div');
        this.popupContainer.style.position = 'absolute';
        this.popupContainer.style.display = 'none';
        this.popupContainer.style.zIndex = '1000';
        this.popupContainer.style.width = '180px';
        this.popupContainer.style.height = 'auto';
        this.popupContainer.style.background = 'none';
        this.popupContainer.style.border = 'none';
        this.popupContainer.style.borderRadius = '6px';
        this.popupContainer.style.boxShadow = '0 0 20px rgba(0,0,0,0.2)';
        this.popupContainer.style.backgroundColor = 'var(--SmartThemeBlurTintColor)';

        this.menuContainer = $('<div class="dynamic-popup-menu" id="dynamic_popup_menu"></div>')[0];
        this.menuContainer.style.position = 'relative';
        this.menuContainer.style.padding = '2px 0';
        this.menuContainer.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        this.menuContainer.style.backdropFilter = 'blur(calc(var(--SmartThemeBlurStrength)*2))';
        this.menuContainer.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';
        this.menuContainer.style.border = '1px solid var(--SmartThemeBorderColor)';
        this.menuContainer.style.borderRadius = '6px';

        this.popupContainer.appendChild(this.menuContainer);

        this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);
        this.popupContainer.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleMenuItemClick(event);
        });
    }

    handleMenuItemClick(event) {
        const menuItemElement = event.target.closest('.dynamic-popup-menu-item');
        if (menuItemElement) {
            // Get index directly from Map
            const index = this.menuItemIndexMap.get(menuItemElement);
            if (index !== undefined && this.menuItems[index].event) {
                this.menuItems[index].event(event);
                if (this.lasting) {
                    this.hide();
                } else {
                    this.destroy();
                }
            }
        }
    }

    /**
     * Handle click outside menu area, used to close menu
     * @param {MouseEvent} event
     */
    handleClickOutside(event) {
        if (!this.popupContainer.contains(event.target)) {
            if (this.lasting) {
                this.hide();
            } else {
                this.destroy();
            }
        }
    }

    frameUpdate(callback) {
        // Clear existing animation loop
        this.cancelFrameUpdate();

        // Start animation loop only when menu is displayed
        if (this.popupContainer.style.display !== 'none') {
            const updateLoop = (timestamp) => {
                // If menu is hidden, stop loop
                if (this.popupContainer.style.display === 'none') {
                    this.cancelFrameUpdate();
                    return;
                }

                callback(this, timestamp); // Add timestamp parameter for more precise animation control
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
