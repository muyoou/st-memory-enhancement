import {DERIVED, EDITOR, SYSTEM, USER} from "../../core/manager.js";
import {getChatSheetsView} from "../editor/chatSheetsDataView.js";
import {getEditView, updateTableContainerPosition} from "../editor/tableTemplateEditView.js";

// 全局变量定义 (保持不变)
let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let databaseButton = null;
let editorButton = null;
let settingButton = null;
let inlineDrawerHeaderContent = null;
let tableDrawerContentHeader = null;

let tableViewDom = null;
let tableEditDom = null;
let settingContainer = null;

// 新增：缓存内容容器的 jQuery 对象
let databaseContentDiv = null;
let editorContentDiv = null;
let settingContentDiv = null;

const timeOut = 200;
const easing = 'easeInOutCubic';

let isEventListenersBound = false;
let currentActiveButton = null; // Track currently active button

/**
 * 更新按钮选中状态 (保持不变)
 * @param {jQuery} selectedButton 当前选中的按钮
 */
function updateButtonStates(selectedButton) {
    if (currentActiveButton && currentActiveButton.is(selectedButton)) {
        return false;
    }
    databaseButton.css('opacity', '0.5');
    editorButton.css('opacity', '0.5');
    settingButton.css('opacity', '0.5');
    selectedButton.css('opacity', '1');
    currentActiveButton = selectedButton;
    return true;
}

/**
 * 初始化应用头部表格抽屉 (只调用一次)
 */
export async function initAppHeaderTableDrawer() {
    if (isEventListenersBound) {
        return;
    }

    // DOM 元素选择 (只执行一次)
    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    databaseButton = $('#database_button');
    editorButton = $('#editor_button');
    settingButton = $('#setting_button');
    inlineDrawerHeaderContent = $('#inline_drawer_header_content');
    tableDrawerContentHeader = $('#table_drawer_content_header');

    // DOM 修改 (只执行一次)
    $('.fa-panorama').removeClass('fa-panorama').addClass('fa-image');
    $('.fa-user-cog').removeClass('fa-user-cog').addClass('fa-user');

    // 异步获取内容 (只执行一次)
    if (tableViewDom === null) {
        tableViewDom = await getChatSheetsView(-1);
    }
    if (tableEditDom === null) {
        tableEditDom = $(`<div style=""></div>`);
        tableEditDom.append(await getEditView(-1));
    }
    if (settingContainer === null) {
        const header = $(`<div></div>`).append($(`<div style="margin: 10px 0;"></div>`).append(inlineDrawerHeaderContent));
        settingContainer = header.append($('.memory_enhancement_container').find('#memory_enhancement_settings_inline_drawer_content'));
    }

    // 创建容器 div 并将内容包裹起来 (只执行一次)
    // **** 修改点：创建时就缓存 jQuery 对象 ****
    databaseContentDiv = $(`<div id="database-content" style="width: 100%; height: 100%; overflow: hidden;"></div>`).append(tableViewDom);
    editorContentDiv = $(`<div id="editor-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(tableEditDom);
    settingContentDiv = $(`<div id="setting-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(settingContainer);

    // 将所有内容容器添加到 appHeaderTableContainer 中 (只执行一次)
    appHeaderTableContainer.append(databaseContentDiv);
    appHeaderTableContainer.append(editorContentDiv);
    appHeaderTableContainer.append(settingContentDiv);

    // 初始化按钮状态 (只执行一次)
    updateButtonStates(databaseButton);

    $('#tableUpdateTag').click(function() {
        $('#extensions_details').trigger('click');
    });

    // **** 修改点：按钮点击事件调用新的 switchContent 函数 ****
    databaseButton.on('click', function() {
        if (updateButtonStates(databaseButton)) {
            switchContent(databaseContentDiv); // 传入缓存的 jQuery 对象
        }
    });

    editorButton.on('click', function() {
        if (updateButtonStates(editorButton)) {
            switchContent(editorContentDiv); // 传入缓存的 jQuery 对象
            // updateTableContainerPosition();
        }
    });

    settingButton.on('click', function() {
        if (updateButtonStates(settingButton)) {
            switchContent(settingContentDiv); // 传入缓存的 jQuery 对象
        }
    });

    isEventListenersBound = true;

    // 移除旧版本元素 (只执行一次)
    $('.memory_enhancement_container').remove();
}

/**
 * 打开/关闭应用头部表格抽屉 (保持不变)
 */
export async function openAppHeaderTableDrawer(target = undefined) {
    if (!isEventListenersBound) {
        await initAppHeaderTableDrawer();
    }

    // 如果目标是设置按钮，则直接打开设置抽屉
    if (tableDrawerIcon.hasClass('closedIcon')) {
        // 关闭其他抽屉
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
        $('.openIcon').not('#table_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        // 打开当前抽屉
        tableDrawerIcon.toggleClass('closedIcon openIcon');
        tableDrawerContent.toggleClass('closedDrawer openDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });

        if (target) {
            // 如果目标是设置按钮，则直接打开设置抽屉
            if (target === 'database') {
                databaseButton.trigger('click');
            } else if (target === 'setting') {
                settingButton.trigger('click');
            } else if (target === 'editor') {
                editorButton.trigger('click');
            }
        }
    } else {
        // 关闭当前抽屉
        tableDrawerIcon.toggleClass('openIcon closedIcon');
        tableDrawerContent.toggleClass('openDrawer closedDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    }
}

/**
 * **** 新增：通用的内容切换函数 ****
 * @param {jQuery} targetContent 要显示的目标内容的 jQuery 对象
 */
async function switchContent(targetContent) {
    // **** 修改点：直接使用 :visible 伪类，或者维护一个变量记录当前显示的元素 ****
    // 使用 :visible 仍然需要查询，但比查找所有子元素再过滤要好一点
    // 或者，可以引入一个变量来跟踪当前显示的div，避免DOM查询
    const currentContent = appHeaderTableContainer.children(':visible');

    // 如果目标内容就是当前内容，则不执行操作 (理论上 updateButtonStates 已经处理了，但加一层保险)
    if (currentContent.is(targetContent)) {
        return;
    }

    // 停止当前正在进行的动画 (以防用户快速点击)
    currentContent.stop(true, false); // 清除动画队列，不跳转到动画末尾
    targetContent.stop(true, false);  // 清除动画队列，不跳转到动画末尾

    if (currentContent.length > 0) {
        // **** 修改点：简化动画链，移除 .delay().hide(0) ****
        // slideUp 会在动画结束后自动设置 display: none
        currentContent.slideUp({
            duration: timeOut,
            easing: easing,
            // queue: false // 如果希望动画不排队，可以考虑，但可能导致视觉效果重叠
        });
    }

    // 使用 slideDown 显示目标内容
    targetContent.slideDown({
        duration: timeOut,
        easing: easing,
        // queue: false
    });
}
