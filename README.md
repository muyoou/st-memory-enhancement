# SillyTavern 酒馆记忆增强插件 - 开发者文档 (dev 分支)

**欢迎来到 SillyTavern 记忆增强插件的开发者页面！**  这份文档专为希望深入了解插件内部结构、参与开发和贡献代码的开发者朋友们准备。  **请注意，您正在阅读的是 `dev` 分支的文档。**

> \[!IMPORTANT]
> **重要提示： `dev` 分支包含最新的开发进展和大量实验性功能，代码可能不稳定。** 
> 
> 本分支仅供开发与测试，并不适合普通用户体验前沿功能。
> 如果您是玩家，请来 [主分支 (master)](https://github.com/muyoou/st-memory-enhancement) 安装相对稳定的版本。

## 分支说明

*   **`main` 分支 (稳定版本):**  此分支的代码库对应用户实际安装和使用的稳定版本。文档也主要面向普通用户，提供安装、配置和使用指南。
*   **`release` 分支 (发布版本):**  此分支是插件的发布版本，包含最新的稳定发布代码。
*   **`dev` 分支 (开发中分支):**  此分支是该插件的主要开发分支，包含最新的功能开发、实验性特性以及可能正在进行中的代码重构。**本开发者文档即针对此分支。**

## 下一步计划

2.0 版本的推进已进入尾声，该分支接下来将专注于维护 2.0 版本的稳定性和修复 bug，2.0 版本的维护与更新计划将会在 `main` 公布。

即将开展的工作计划如下：

*   **使用TS重构内核:**  插件的内核代码将进行 TypeScript 重构，以提高代码的可读性和可维护性。
*   **功能增强:**  插件的功能正在不断增强，正制定计划增加更多的内置功能，以满足大家的需求。

## 本分支开发准备与流程

1.  **Fork 仓库 (强烈建议):**  为了方便您进行代码修改和提交 Pull Request，请先将 [主仓库](https://github.com/muyoou/st-memory-enhancement) Fork 到您自己的 GitHub 账号下。

2.  **选择插件目录:**  请确保在本地的 SillyTavern 环境中，插件仓库被放置在正确的插件目录下。 通常是以下路径之一：
    *   全局插件目录:  `...\SillyTavern\public\scripts\extensions\third-party\`
    *   用户插件目录:  `...\SillyTavern\data\<your_user_name>\extensions\`

3.  **Clone `dev` 分支:**  将 `dev` 分支 (或您 Fork 的仓库) 克隆到本地插件目录。
    ```bash
    # 以克隆 dev 分支为例：
    git clone -b dev https://github.com/muyoou/st-memory-enhancement
    ```
    如果您 Fork 了仓库，请将上述命令中的 URL 替换为您 Fork 的仓库地址。

4.  **安装依赖:**  进入插件根目录 `st-memory-enhancement`，使用 npm 安装开发和运行所需的依赖包。
    ```bash
    cd st-memory-enhancement
    npm install
    ```

5.  **配置:**  为了方便开发调试，建议您开启插件中的调试模式。然后您就可以在 `st-memory-enhancement` 目录下自由的进行代码修改和功能开发了。

## 代码结构概览

插件代码按照模块化原则组织，主要目录和文件结构如下：

*   **`index.js` (插件主入口):** 插件的入口文件，负责初始化和协调各个模块的工作
*   **`manifest.json`:** 插件的元数据文件，包含插件名称、版本、作者等信息
*   **`components/` (组件库):** 可重用的前端界面组件
    *   `dragManager.js`: 拖拽管理器，负责处理拖拽相关的功能
    *   `formManager.js`: 表单管理器，处理表单的创建、验证和提交
    *   `popupConfirm.js`: 确认弹窗组件
    *   `popupMenu.js`: 弹出菜单组件
*   **`core/` (核心逻辑模块):** 插件的核心功能实现代码
    *   `manager.js`: 核心管理器，负责协调各个模块的工作
    *   `tTableManager.js`: 表格核心库
    *   **`table/` (表格功能模块):** 表格相关的核心功能
        *   `actions.js`: 表格操作定义
        *   `base.js`: 表格基础类
        *   `cell.js`: 单元格相关功能
        *   `oldTableActions.js`: 旧版表格操作（即将弃用）
        *   `sheet.js`: 表格数据结构
        *   `template.js`: 表格模板系统
        *   `utils.js`: 表格工具函数
*   **`data/` (数据定义):** 包含插件的默认设置和预设数据
    *   `pluginSetting.js`: 插件默认设置
    *   `pluginSetting_en.js`: 插件英文设置
    *   `profile_prompts.js`: 个人资料提示词
    *   `profile_prompts_en.js`: 英文个人资料提示词
*   **`scripts/` (功能脚本):** 按功能分类的脚本文件
    *   **`editor/` (编辑器模块):** 编辑器相关的功能
        *   `cellHistory.js`: 单元格历史记录
        *   `chatSheetsDataView.js`: 聊天表格数据视图
        *   `customSheetsStyle.js`: 自定义表格样式
        *   `initRefreshTypeSelector.js`: 刷新类型选择器初始化
        *   `sheetStyleEditor.js`: 表格样式编辑器
        *   `tableHistory.js`: 表格历史记录
        *   `tableStatistics.js`: 表格统计功能
        *   `tableTemplateEditView.js`: 表格模板编辑视图
    *   **`renderer/` (渲染器模块):** 负责将数据渲染为UI组件
        *   `appHeaderTableBaseDrawer.js`: 应用头部表格绘制器
        *   `sheetCustomRenderer.js`: 自定义表格渲染器
        *   `tablePushToChat.js`: 表格推送到聊天功能
    *   **`runtime/` (运行时模块):** 运行时数据管理和处理
        *   `absoluteRefresh.js`: 绝对刷新功能
        *   `separateTableUpdate.js`: 独立表格更新机制
    *   **`settings/` (设置模块):** 处理插件配置和设置
        *   `devConsole.js`: 开发者控制台
        *   `standaloneAPI.js`: 独立API接口
        *   `userExtensionSetting.js`: 用户扩展设置
*   **`assets/` (静态资源):** 插件使用的静态资源文件
    *   **`locales/` (本地化):** 多语言支持文件
        *   `en.json`: 英文本地化文件
        *   `zh-cn.json`: 中文本地化文件
    *   **`styles/` (样式表):** CSS样式文件
        *   `style.css`: 主样式表文件
    *   **`templates/` (HTML模板):** HTML模板文件
        *   各种UI组件的HTML模板（如`index.html`、`editor.html`、`setting.html`等）
*   **`services/` (服务层):** 提供各种服务功能
    *   `appFuncManager.js`: 应用功能管理器
    *   `debugs.js`: 调试服务
    *   `llmApi.js`: 大语言模型API接口
    *   `translate.js`: 翻译服务
*   **`utils/` (通用工具库):** 通用的工具函数和第三方库
    *   `codePathProcessing.js`: 代码路径处理
    *   `codeProxy.js`: 代码代理工具
    *   `json5.min.mjs`: JSON5库（最小化版本）
    *   `stringUtil.js`: 字符串处理工具
    *   `utility.js`: 通用工具函数

## 核心模块说明 (重要)

> \[!NOTE]
> **请注意：**  由于 `dev` 分支正处于活跃开发阶段，代码变动较为频繁。  以下模块说明可能与最新的代码存在差异。  **最准确的变量和函数信息，请务必查阅源代码注释和 IDE 的代码提示。**

*   **`core/manager.js`:**  插件的核心管理器，负责协调各个模块的工作和管理插件的整体生命周期
    *   **命名空间/模块:**
        *   **`APP`:** 应用功能管理器的引用，提供对SillyTavern主程序功能的访问
        *   **`USER`:** 用户数据管理器，负责管理用户的设置、上下文和聊天记录等数据
            * `getSettings()`: 获取用户设置
            * `getExtensionSettings()`: 获取扩展设置
            * `saveSettings()`: 保存用户设置
            * `saveChat()`: 保存聊天记录
            * `getContext()`: 获取当前聊天上下文
            * `getChatPiece(deep)`: 获取指定深度的聊天片段
            * `loadUserAllTemplates()`: 加载用户所有表格模板
            * `tableBaseSetting`: 表格基础设置代理对象
            * `tableBaseDefaultSettings`: 表格默认设置对象
        *   **`BASE`:** 数据库基础数据管理器，提供对库的用户数据、模板数据的访问
            * `Sheet`: 表格数据表单类引用
            * `SheetTemplate`: 表格模板类引用
            * `refreshContextView`: 刷新上下文视图函数
            * `refreshTempView`: 刷新模板视图函数
            * `templates`: 获取所有用户模板
            * `sheetsData`: 表格数据访问代理对象
            * `copyHashSheets(hashSheets)`: 复制哈希表格数据
            * `getLastSheetsPiece(deep, cutoff, startAtLastest)`: 获取最近的表格数据片段
            * `hashSheetsToSheets(hashSheets)`: 将哈希表格数据转换为表格实例
            * `initHashSheet()`: 初始化哈希表格
        *   **`EDITOR`:** 编辑器控制器，管理编辑器的状态、事件和设置
            * 组件引用: `Drag`, `PopupMenu`, `Popup`, `POPUP_TYPE`
            * 功能方法: `callGenericPopup`, `generateRaw`, `getSlideToggleOptions`, `slideToggle`, `confirm`
            * 消息通知: `info`, `success`, `warning`, `error`, `clear`
            * `logAll()`: 记录所有相关数据到控制台
        *   **`DERIVED`:** 项目派生数据管理器，管理运行时的派生数据
            * `any`: 获取派生数据代理对象
        *   **`SYSTEM`:** 系统控制器，管理系统级别的数据、事件和设置
            * `getTemplate(name)`: 获取HTML模板
            * `codePathLog(context, deep)`: 记录代码路径
            * 工具函数: `lazy`, `generateRandomString`, `generateRandomNumber`, `calculateStringHash`
            * `f(f, name)`: 将函数推入执行队列
    *   **初始化与配置:** 负责插件的初始化、加载用户配置以及设置运行环境
    *   **模块协调:** 协调各功能模块间的交互，确保功能模块能够正常工作
    *   **生命周期管理:** 管理插件的启动、运行、暂停和卸载等生命周期事件

*   **`core/tTableManager.js`:** 表格核心模块，定义了表格的基本行为和数据结构
    *   **表格数据管理:** 实现表格数据的存储、检索和处理
    *   **核心API:** 提供表格操作的核心API，作为表格功能的基础

*   **`core/table/`:** 表格功能的具体实现
    *   **`base.js`:** 定义表格的基础类和接口，包括表格的创建、销毁等基本操作
    *   **`sheet.js`:** 实现表格数据结构，负责管理行、列及单元格数据
    *   **`cell.js`:** 定义单元格的结构和行为，处理单元格数据的读写和格式化
    *   **`actions.js`:** 定义表格的各种操作，如添加行列、合并单元格、排序等
    *   **`template.js`:** 管理表格模板，实现模板的创建、加载和应用
    *   **`utils.js`:** 提供表格相关的工具函数，辅助表格操作

*   **`services/`:** 服务层，提供各种功能服务
    *   **`appFuncManager.js`:** 应用功能管理器，整合和协调各种应用功能
    *   **`debugs.js`:** 提供调试工具和日志功能，帮助开发者跟踪和解决问题
    *   **`llmApi.js`:** 大语言模型API接口，用于与AI模型进行交互
    *   **`translate.js`:** 翻译服务，处理插件的多语言支持

*   **`utils/`:** 通用工具库，提供各种辅助功能
    *   **`codeProxy.js`:** 实现代码代理功能，可能用于数据绑定或属性监听
    *   **`codePathProcessing.js`:** 处理代码路径，用于追踪代码执行流程
    *   **`stringUtil.js`:** 提供字符串处理工具，如格式化、解析等功能
    *   **`utility.js`:** 包含各种通用工具函数，如数据转换、格式校验等

*   **`components/`:** 组件库，实现UI交互组件
    *   **`dragManager.js`:** 拖拽管理器，处理元素的拖拽功能
    *   **`formManager.js`:** 表单管理器，处理表单的创建、验证和提交
    *   **`popupConfirm.js`:** 确认弹窗组件，用于用户确认操作
    *   **`popupMenu.js`:** 弹出菜单组件，实现上下文菜单功能

*   **`scripts/`:** 按功能分类的脚本文件
    *   **`editor/`:** 编辑器模块，实现表格编辑功能
    *   **`renderer/`:** 渲染器模块，将数据渲染为UI组件
    *   **`runtime/`:** 运行时模块，管理插件运行时的状态和数据
    *   **`settings/`:** 设置模块，处理插件的配置和用户设置

## 👥 贡献者名单

感谢所有为该项目做出贡献的伙伴们！

<a href="https://github.com/muyoou/st-memory-enhancement/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=muyoou/st-memory-enhancement" />
</a>

**##Master 分支代码统计**

![Alt](https://repobeats.axiom.co/api/embed/ece4e039de7cf89ed5ccc9fba2e9b432e44dfaaa.svg "Repobeats analytics image")

**##Dev 分支代码统计**

![Alt](https://repobeats.axiom.co/api/embed/eb3c2af1bcdb84704bb9ff8f61379fe38d634884.svg "Repobeats analytics image")

## 再次感谢您的参与和支持！

如果您在开发过程中遇到任何问题，或者有任何建议和想法，欢迎随时通过 GitHub Issues 或其他渠道与我们联系。
