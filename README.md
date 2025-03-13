<style>
  :root {
    --theme-color: #3498db;         /* 主题色 (深蓝色) */
    --text-color-light: #333;      /* 浅色文本 */
    --text-color-lighter: #777;    /* 更浅色文本 */
    --separator-color: #95a5a6;    /* 分隔符颜色 */
    --important-color: red;        /* 重要颜色 (红色) */
  }
</style>

<div align="center">
<h1 align="center">✨ SillyTavern 酒馆记忆增强插件 ✨</h1>
<p align="center">
    <b>☄️ 最新版本: <span style="color:var(--theme-color);">v1.3.2</span> ☄️</b>
</p>
<p align="center">
    <a href="https://muyoo.com.cn/2025/01/26/SillyTavern%E9%85%92%E9%86%86%E8%AE%B0%E5%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%A2%E4%BB%B6%E5%AE%89%E8%A3%85/" style="color:var(--theme-color); text-decoration:none;">📖 安装教程</a>
    <span style="color:var(--separator-color);">|</span>
    <a href="https://muyoo.com.cn/2025/01/30/SillyTavern%E9%85%92%E9%86%86%E8%AE%B0%EE%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%A2%A2%E4%BB%B6%E6%9B%B4%E6%96%B0/" style="color:var(--theme-color); text-decoration:none;">🔄 更新教程</a>
    <span style="color:var(--separator-color);">|</span>
    <a href="https://muyoo.com.cn/2025/01/27/SillyTavern%E9%85%92%E9%86%86%E8%AE%B0%EE%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%A2%A2%E4%BB%B6%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97/" style="color:var(--theme-color); text-decoration:none;">📜 更新日志</a>
    <span style="color:var(--separator-color);">|</span>
    <a href="https://muyoo.com.cn/2025/02/09/SillyTavern%E9%85%92%E9%86%92%E9%A6%86%E8%AE%B0%EE%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%A2%A2%E4%BB%B6%E9%97%AE%E9%A2%98%E8%87%AA%E6%9F%A5/" style="color:var(--theme-color); text-decoration:none;">🔍 问题自查</a>
</p>
<br>
<p align="center">
    <b>🎓 记忆增强插件</b> - 专为 <a href="https://github.com/SillyTavern/SillyTavern" style="color:var(--theme-color); text-decoration:none;">SillyTavern酒馆</a> 设计，旨在显著提升角色扮演中 AI 的长期记忆能力！
</p>

<p align="center">
    <a href="https://github.com/muyoou/st-memory-enhancement/stargazers">
        <img src="https://img.shields.io/github/stars/muyoou/st-memory-enhancement?style=flat-square" alt="GitHub Stars">
    </a>
    <a href="https://github.com/muyoou/st-memory-enhancement/graphs/contributors">
        <img src="https://img.shields.io/github/contributors/muyoou/st-memory-enhancement?style=flat-square" alt="Contributors">
    </a>
    <a href="https://github.com/muyoou/st-memory-enhancement/issues">
        <img src="https://img.shields.io/github/issues/muyoou/st-memory-enhancement?style=flat-square" alt="GitHub Issues">
    </a>
    <a href="https://qm.qq.com/q/bBSIrwKty2">
      <img src="https://img.shields.io/badge/Join-QQ_Group-ff69b4">
    </a>
    <a href="https://github.com/SillyTavern/SillyTavern">
      <img src="https://img.shields.io/badge/SillyTavern-%3E=1.10.0-blue">
    </a>
</p>
</div>

<hr style="border-top: 2px dashed;">

> [!IMPORTANT]
> **🚧 项目重构进行中 (DEV 分支) 🚧**
>
> 我们正在对项目进行全面的重构，以带来更强大的功能和更优异的性能！
>
> <div style="color:var(--text-color-lighter); font-size:0.9em;">
> **重构进度：<span style="color:var(--theme-color);">70%</span>**
>
> - ✅ 优化项目架构
> - ✅ 提供主副 API 多种配合模式
> - ✅ 全新插件 UI 和表格显示位置
> - 🕑 完全重构表格核心代码
> - 🕑 以节点编辑器形式编辑表格结构
> - 🕑 代码整合及测试
> </div>

<hr style="border-top: 2px dashed;">

### <span style="color:var(--theme-color);">🌟</span> 插件简介

记忆增强插件为您的角色扮演体验注入强大的 **<span style="color:var(--theme-color);">结构化长期记忆</span>**，支持角色设定、关键事件、重要物品等自定义内容。它能有效帮助 AI 更好地理解和记住对话上下文，从而做出 **<span style="color:var(--theme-color);">更连贯、更贴近情境</span>** 的推演。

**插件优势：**

* <span style="color:var(--theme-color);">✨</span> **用户友好：**  通过直观的表格轻松查看和编辑记忆，掌控角色记忆。
* <span style="color:var(--theme-color);">🛠️</span> **创作者友好：**  便捷导出和分享配置，JSON 文件灵活定制表格结构，满足各种创作需求。

<hr style="border-top: 2px dashed;">

### <span style="color:var(--theme-color);">✨</span> 核心功能亮点

* <span style="color:var(--theme-color);">📅</span> **结构化记忆储存：** 基于表格的强大记忆系统，未来更将支持节点编辑器，自由定义表格类型和结构。
* <span style="color:var(--theme-color);">📝</span> **灵活内容编辑：** 表格内容完全可编辑，随时浏览和修改，打造专属角色记忆库。
* <span style="color:var(--theme-color);">📊</span> **智能提示词生成与注入：** 自动生成精准提示词，深度注入或全局宏，无缝集成世界书或预设，提升 AI 表现。
* <span style="color:var(--theme-color);">🖼️</span> **自定义数据推送展示：**  表格内容推送至聊天界面 DOM，自定义样式，重要信息醒目可见。
* <span style="color:var(--theme-color);">🚢</span> **便捷配置导出与分享：**  提供丰富的自定义选项（提示词、注入方式等），预设轻松导出和分享表格结构和设置。
* <span style="color:var(--theme-color);">🚀</span> **分步操作 (开发中)：**  未来结合主副 API，实现任务智能分配（生成、整理、重建等），支持自定义触发时机，高效管理记忆。

<p align="center">
    <img src="https://github.com/user-attachments/assets/36997237-2c72-46b5-a8df-f5af3fa42171" alt="插件界面示例" style="max-width:80%; border-radius: 5px;">
</p>

<hr style="border-top: 3px solid;">

### <span style="color:var(--theme-color);">🚀</span> 快速上手指南

**<span style="color:var(--important-color);">重要提示：</span>** 本插件仅在 SillyTavern 的 **<span style="color:var(--theme-color);">聊天补全模式</span>** 下工作。

1. **<span style="color:var(--theme-color);">安装插件：</span>** 在 SillyTavern 页面，点击 `扩展` > `安装拓展`。

   <p align="center">
       <img src="https://github.com/user-attachments/assets/67904e14-dc8d-4d7c-a1a8-d24253b72621" alt="安装插件步骤 1" style="max-width:70%; border-radius: 5px;">
   </p>

2. **<span style="color:var(--theme-color);">输入插件地址：</span>** 在弹出的窗口中，输入插件的 GitHub 地址 `https://github.com/muyoou/st-memory-enhancement` ，然后选择 `Install for all users`。

   <p align="center">
       <img src="https://github.com/user-attachments/assets/9f39015f-63bb-4741-bb7f-740c02f1de17" alt="安装插件步骤 2" style="max-width:70%; border-radius: 5px;">
   </p>

   **国内用户加速：**  如遇网络问题，可尝试国内 Gitee 源地址：`https://gitee.com/muyoou/st-memory-enhancement`

<hr style="border-top: 2px dashed;">

### <span style="color:var(--theme-color);">👥</span> 贡献者

感谢所有为本项目做出贡献的朋友们！

<p align="center">
    <a href="https://github.com/muyoou/st-memory-enhancement/graphs/contributors">
      <img src="https://contrib.rocks/image?repo=muyoou/st-memory-enhancement" style="max-width: 400px;" />
    </a>
</p>

**Master 分支贡献统计：**
<p align="center">
    <img src="https://repobeats.axiom.co/api/embed/ece4e039de7cf89ed5ccc9fba2e9b432e44dfaaa.svg" alt="Master 分支代码分析" style="max-width: 80%; border-radius: 5px;">
</p>

<hr style="border-top: 2px dashed;">

### <span style="color:var(--theme-color);">💖</span> 支持与交流

**<span style="color:var(--theme-color);">🤝 参与贡献：</span>**  欢迎参与插件开发！请查阅 <a href="https://github.com/muyoou/st-memory-enhancement/blob/dev/README.md" style="color:var(--theme-color); text-decoration:none;">贡献指南</a>，了解如何贡献代码和想法。

**<span style="color:var(--theme-color);">💬 社群交流：</span>**  加入插件交流 & BUG 反馈 QQ 群：<a href="#" style="color:var(--theme-color); text-decoration:none;">**1030109849**</a>，与更多用户交流心得，解决问题。

**<span style="color:var(--theme-color);">☕ 捐赠支持：</span>**  如果您认为插件有所帮助，欢迎 <a href="https://muyoo.com.cn/2025/02/10/%E8%B5%9E%E5%8A%A9%E9%A1%B5%E9%9D%A2/" style="color:var(--theme-color); text-decoration:none;">请作者喝杯蜜雪冰城~ 🍹</a>，您的支持是我们前进的最大动力！

<hr style="border-top: 3px solid;">

### <span style="color:var(--theme-color);">🤗</span> 感谢您的使用！祝您使用愉快！
