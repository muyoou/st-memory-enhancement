// 检查插件是否加载
console.log('插件版本:', window.stMemoryEnhancement?.VERSION);

// 检查适配器是否初始化
console.log('适配器状态:', window.externalDataAdapter?.getState());


const xmlData = `<tableEdit>
<!--
insertRow(0, {"0":"夏日","1":"下午 3:46","2":"的房间","3":"/ナナミ"})
insertRow(1, {"0":"", "1":"身高165cm", "2":"内向/自卑/沉溺二次元", "3":"高中生", "4":"galgame/动画/漫画/轻小说", "5":"未知", "6":"未知", "7":"未知"})
insertRow(1, {"0":"ナナミ", "1":"未知", "2":"冷静/专业/无感情波动", "3":"AI助手", "4":"执行协议", "5":"未知", "6":"伊甸园系统", "7":"伊甸园系统的核心AI"})
insertRow(2, {"0":"ナナミ", "1":"AI与主人", "2":"绝对服从/服务", "3":"13"})
insertRow(3, {"0":"ナナミ", "1":"执行'温柔开拓'协议", "2":"的房间", "3":"进行中"})
insertRow(4, {"0":"", "1":"被ナナミ执行'温柔开拓'协议，包皮被完全翻开并清洁", "2":"夏日午后", "3":"的房间", "4":"羞耻/刺激/恐惧/被解放感"})
-->
</tableEdit>`;

const result = window.externalDataAdapter.processXmlData(xmlData);
console.log('测试结果:', result);
