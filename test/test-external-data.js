/**
 * 外部数据适配器测试脚本 v2.0.0
 * 基于用户成功的测试代码重写
 */

(function() {
    'use strict';

    class ExternalDataTester {
        constructor() {
            this.testResults = [];
        }

        printSeparator(char = '=', length = 80) {
            console.log(char.repeat(length));
        }

        printTitle(title) {
            this.printSeparator();
            console.log('  ' + title);
            this.printSeparator();
        }

        recordResult(testName, success, message, data = null) {
            const result = { testName, success, message, data, timestamp: new Date().toISOString() };
            this.testResults.push(result);
            console.log((success ? '✅ ' : '❌ ') + testName + ': ' + message);
            if (data) console.log('   数据:', data);
        }

        checkAdapter() {
            this.printTitle('检查适配器状态');
            if (typeof window.stMemoryEnhancement !== 'undefined') {
                console.log('插件版本:', window.stMemoryEnhancement.VERSION);
            }
            if (typeof window.externalDataAdapter === 'undefined') {
                this.recordResult('适配器检查', false, '适配器未加载');
                console.log('\n💡 提示：');
                console.log('   1. 确保插件已正确加载');
                console.log('   2. 确保 external-data-adapter.js 已被导入');
                return false;
            }
            const state = window.externalDataAdapter.getState();
            if (!state.initialized) {
                this.recordResult('适配器检查', false, '适配器未初始化', state);
                return false;
            }
            this.recordResult('适配器检查', true, '适配器已就绪', state);
            return true;
        }

        async testFullData() {
            this.printTitle('测试完整数据（用户成功测试数据）');
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
            try {
                console.log('发送完整测试数据...');
                const result = await window.externalDataAdapter.processXmlData(xmlData);
                this.recordResult('完整数据处理', result.success, result.message || '处理成功', result);
                if (result.success) {
                    console.log('\n💡 请检查：');
                    console.log('   1. 前端表格是否已更新');
                    console.log('   2. 刷新页面后数据是否仍存在');
                }
                return result.success;
            } catch (error) {
                this.recordResult('完整数据处理', false, '异常: ' + error.message, error);
                console.error('错误详情:', error);
                return false;
            }
        }

        async testXmlData() {
            this.printTitle('测试 XML 格式数据');
            const xmlData = `<tableEdit><!-- insertRow(0, {"0":"测试角色", "1":"测试描述", "2":"测试属性"}) --></tableEdit>`;
            try {
                console.log('发送 XML 数据...');
                const result = await window.externalDataAdapter.processXmlData(xmlData);
                this.recordResult('XML 数据处理', result.success, result.message || '处理成功', result);
                return result.success;
            } catch (error) {
                this.recordResult('XML 数据处理', false, '异常: ' + error.message, error);
                return false;
            }
        }

        async testJsonData() {
            this.printTitle('测试 JSON 格式数据');
            const jsonData = { type: 'insert', tableIndex: 0, data: {"0": "JSON测试角色", "1": "JSON测试描述", "2": "JSON测试属性"} };
            try {
                console.log('发送 JSON 数据...');
                const result = await window.externalDataAdapter.processJsonData(jsonData);
                this.recordResult('JSON 数据处理', result.success, result.message || '处理成功', result);
                return result.success;
            } catch (error) {
                this.recordResult('JSON 数据处理', false, '异常: ' + error.message, error);
                return false;
            }
        }

        async runAllTests() {
            this.printTitle('外部数据适配器测试开始');
            console.log('测试时间:', new Date().toLocaleString());
            console.log('');
            this.testResults = [];
            if (!this.checkAdapter()) {
                console.log('\n❌ 适配器检查失败，测试中止');
                return;
            }
            console.log('');
            await this.testXmlData();
            console.log('');
            await this.testJsonData();
            console.log('');
            await this.testFullData();
            console.log('');
            this.printTestSummary();
        }

        printTestSummary() {
            this.printTitle('测试总结');
            const total = this.testResults.length;
            const passed = this.testResults.filter(r => r.success).length;
            const failed = total - passed;
            console.log('总测试数: ' + total);
            console.log('✅ 通过: ' + passed);
            console.log('❌ 失败: ' + failed);
            console.log('通过率: ' + ((passed / total) * 100).toFixed(2) + '%');
            if (failed === 0) {
                console.log('\n🎉 所有测试通过！');
            } else {
                console.log('\n⚠️ 部分测试失败，请查看上面的详细信息');
            }
            this.printSeparator();
        }

        getResults() {
            return this.testResults;
        }
    }

    window.externalDataTester = new ExternalDataTester();
    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║              外部数据适配器测试脚本已加载 (v2.0.0)                          ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('使用方法：');
    console.log('  1. 运行所有测试: externalDataTester.runAllTests()');
    console.log('  2. 检查适配器: externalDataTester.checkAdapter()');
    console.log('  3. 测试 XML: externalDataTester.testXmlData()');
    console.log('  4. 测试 JSON: externalDataTester.testJsonData()');
    console.log('  5. 测试完整数据: externalDataTester.testFullData()');
    console.log('  6. 查看结果: externalDataTester.getResults()');
    console.log('');
    console.log('注意：所有测试函数都是异步的，需要使用 await');
})();
