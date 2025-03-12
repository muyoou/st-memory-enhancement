# SillyTavern酒馆记忆增强插件

> 项目全面重构中，最新进展于DEV分支

在长期聊卡时，往往会忘记之前发生的重要事件。尝试过使用摘要，好用但是要消耗很多token，等待时间也很长。使用自带总结的话，得手动操作，也比较麻烦。 

本插件在每个聊天消息中存储了一张信息表（保存在本地），并且在每次ai回复时都可以差量更新这个表格，用来记录一些重要或长期的事情。表格的逻辑性较好，容易被ai理解，而且也方便定向修改，只需要消耗少量的输出token。

用户可以随时查看信息表，也可以自己更改。实测记录在表格中的事情，ai可以持久记忆，并且反应速度很快。

[插件安装教程](https://muyoo.com.cn/2025/01/26/SillyTavern%E9%85%92%E9%A6%86%E8%AE%B0%E5%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%E4%BB%B6%E5%AE%89%E8%A3%85/) | [插件更新教程](https://muyoo.com.cn/2025/01/30/SillyTavern%E9%85%92%E9%A6%86%E8%AE%B0%E5%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%E4%BB%B6%E6%9B%B4%E6%96%B0/) | [更新日志](https://muyoo.com.cn/2025/01/27/SillyTavern%E9%85%92%E9%A6%86%E8%AE%B0%E5%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%E4%BB%B6%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97/) | [问题自查](https://muyoo.com.cn/2025/02/09/SillyTavern%E9%85%92%E9%A6%86%E8%AE%B0%E5%BF%86%E5%A2%9E%E5%BC%BA%E6%8F%92%E4%BB%B6%E9%97%AE%E9%A2%98%E8%87%AA%E6%9F%A5/)


如插件使用出现问题，请先浏览问题自查页面，尝试解决。

如果您觉得本插件对您有帮助，可以考虑[请我喝杯蜜雪冰城~](https://muyoo.com.cn/2025/02/10/%E8%B5%9E%E5%8A%A9%E9%A1%B5%E9%9D%A2/)

插件交流&BUG解决 QQ群1030109849

表格如下图所示：
![image](https://github.com/user-attachments/assets/36997237-2c72-46b5-a8df-f5af3fa42171)

模型可以在每次对话时，选择使用指令修改这些表格。修改后的表格将添加到下轮对话的上下文中。  
**注意：此插件只能在酒馆的聊天补全模式中使用**

## 安装
1. 在酒馆页面中点击 `扩展`>`安装拓展`
   
![image](https://github.com/user-attachments/assets/67904e14-dc8d-4d7c-a188-d24253b72621)

2. 在弹出窗口中输入`https://github.com/muyoou/st-memory-enhancement`后选择`Install for all users`  

![image](https://github.com/user-attachments/assets/9f39015f-63bb-4741-bb7f-740c02f1de17)

如果因为网络问题报错可以使用国内源`https://gitee.com/muyoou/st-memory-enhancement`
