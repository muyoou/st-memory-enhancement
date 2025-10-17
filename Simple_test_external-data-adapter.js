// 检查插件是否加载
console.log('插件版本:', window.stMemoryEnhancement?.VERSION);

// 检查适配器是否初始化
console.log('适配器状态:', window.externalDataAdapter?.getState());


const xmlData = `<tableEdit> 
<!-- 
insertRow(0, {"0":"十月","1":"冬天/下雪","2":"学校","3":"<user>/悠悠"}) 
deleteRow(1, 2) 
insertRow(1, {"0":"悠悠", "1":"体重60kg/黑色长发", "2":"开朗活泼", "3":"学生", "4":"羽毛球", "5":"鬼灭之刃", "6":"宿舍", "7":"运动部部长"}) 
insertRow(1, {"0":"<user>", "1":"制服/短发", "2":"忧郁", "3":"学生", "4":"唱歌", "5":"咒术回战", "6":"自己家", "7":"学生会长"}) 
insertRow(2, {"0":"悠悠", "1":"同学", "2":"依赖/喜欢", "3":"高"}) 
updateRow(4, 1, {"0": "小花", "1": "破坏表白失败", "2": "10月", "3": "学校","4":"愤怒"}) 
insertRow(4, {"0": "<user>/悠悠", "1": "悠悠向<user>表白", "2": "2021-10-05", "3": "教室","4":"感动"}) 
insertRow(5, {"0":"<user>","1":"社团赛奖品","2":"奖杯","3":"比赛第一名"}) 
--> 
</tableEdit>`;

const result = window.externalDataAdapter.processXmlData(xmlData);
console.log('测试结果:', result);
