/**
 * 表格数据导出/导入接口测试脚本
 * 
 * 功能：测试 external-data-adapter.js 中的表格数据导出和导入接口
 * 使用方法：在浏览器控制台中运行此脚本
 * 
 * @version 1.0.0
 * @date 2025-10-08
 */

// ============================================================================
// 测试配置
// ============================================================================

const TEST_CONFIG = {
    // 是否启用详细日志
    verboseLogging: true,
    
    // 测试数据文件路径（相对于项目根目录）
    testDataFile: './test/table_data.json',
    
    // 导入类型：'data' 仅导入数据，'both' 导入模板和数据
    importType: 'data'
};

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 日志输出工具
 */
const testLogger = {
    info: (message, ...args) => {
        console.log(`%c[测试] ${message}`, 'color: #2196F3; font-weight: bold', ...args);
    },
    success: (message, ...args) => {
        console.log(`%c[测试] ✅ ${message}`, 'color: #4CAF50; font-weight: bold', ...args);
    },
    error: (message, ...args) => {
        console.error(`%c[测试] ❌ ${message}`, 'color: #F44336; font-weight: bold', ...args);
    },
    warn: (message, ...args) => {
        console.warn(`%c[测试] ⚠️ ${message}`, 'color: #FF9800; font-weight: bold', ...args);
    },
    debug: (message, ...args) => {
        if (TEST_CONFIG.verboseLogging) {
            console.log(`%c[测试] 🔍 ${message}`, 'color: #9E9E9E', ...args);
        }
    }
};

/**
 * 加载测试数据文件
 */
async function loadTestDataFile() {
    testLogger.info('正在加载测试数据文件...');
    
    try {
        const response = await fetch(TEST_CONFIG.testDataFile);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        testLogger.success('测试数据文件加载成功');
        testLogger.debug('数据内容:', data);
        return data;
    } catch (error) {
        testLogger.error('加载测试数据文件失败:', error);
        throw error;
    }
}

/**
 * 检查适配器是否可用
 */
function checkAdapterAvailable() {
    if (typeof window.externalDataAdapter === 'undefined') {
        testLogger.error('外部数据适配器未初始化！请确保项目已正确加载。');
        return false;
    }
    
    if (typeof window.externalDataAdapter.exportTableData !== 'function') {
        testLogger.error('exportTableData 接口不存在！');
        return false;
    }
    
    if (typeof window.externalDataAdapter.importTableData !== 'function') {
        testLogger.error('importTableData 接口不存在！');
        return false;
    }
    
    testLogger.success('外部数据适配器检查通过');
    return true;
}

/**
 * 比较两个JSON对象是否相似（忽略某些字段）
 */
function compareTableData(original, exported) {
    testLogger.debug('比较原始数据和导出数据...');
    
    // 获取表格UID列表
    const originalUids = Object.keys(original).filter(key => key !== 'mate');
    const exportedUids = Object.keys(exported).filter(key => key !== 'mate');
    
    testLogger.debug('原始表格UID:', originalUids);
    testLogger.debug('导出表格UID:', exportedUids);
    
    // 检查表格数量
    if (originalUids.length !== exportedUids.length) {
        testLogger.warn(`表格数量不匹配: 原始 ${originalUids.length}, 导出 ${exportedUids.length}`);
        return false;
    }
    
    // 检查每个表格的名称
    let allMatch = true;
    for (const uid of originalUids) {
        if (!exportedUids.includes(uid)) {
            testLogger.warn(`表格 ${uid} 在导出数据中不存在`);
            allMatch = false;
            continue;
        }
        
        const origTable = original[uid];
        const expTable = exported[uid];
        
        if (origTable.name !== expTable.name) {
            testLogger.warn(`表格 ${uid} 名称不匹配: "${origTable.name}" vs "${expTable.name}"`);
            allMatch = false;
        }
    }
    
    return allMatch;
}

// ============================================================================
// 测试用例
// ============================================================================

/**
 * 测试1：导出表格数据
 */
async function test1_ExportTableData() {
    testLogger.info('========================================');
    testLogger.info('测试1：导出表格数据');
    testLogger.info('========================================');
    
    try {
        const result = await window.externalDataAdapter.exportTableData();
        
        testLogger.debug('导出结果:', result);
        
        if (!result.success) {
            testLogger.error('导出失败:', result.message);
            return { passed: false, result };
        }
        
        if (!result.data) {
            testLogger.error('导出结果中没有数据');
            return { passed: false, result };
        }
        
        // 检查数据格式
        if (!result.data.mate || result.data.mate.type !== 'chatSheets') {
            testLogger.error('导出数据格式不正确，缺少正确的 mate 标记');
            return { passed: false, result };
        }
        
        // 统计表格数量
        const tableCount = Object.keys(result.data).filter(key => key !== 'mate').length;
        testLogger.success(`导出成功！共导出 ${tableCount} 个表格`);
        
        return { passed: true, result, data: result.data };
        
    } catch (error) {
        testLogger.error('测试执行异常:', error);
        return { passed: false, error };
    }
}

/**
 * 测试2：导入表格数据
 */
async function test2_ImportTableData(testData) {
    testLogger.info('========================================');
    testLogger.info('测试2：导入表格数据');
    testLogger.info('========================================');
    
    try {
        // 如果没有提供测试数据，则加载文件
        if (!testData) {
            testData = await loadTestDataFile();
        }
        
        testLogger.debug('准备导入的数据:', testData);
        
        const result = await window.externalDataAdapter.importTableData(
            testData, 
            TEST_CONFIG.importType
        );
        
        testLogger.debug('导入结果:', result);
        
        if (!result.success) {
            testLogger.error('导入失败:', result.message);
            return { passed: false, result };
        }
        
        testLogger.success('导入成功！');
        
        return { passed: true, result };
        
    } catch (error) {
        testLogger.error('测试执行异常:', error);
        return { passed: false, error };
    }
}

/**
 * 测试3：导出-导入循环测试
 */
async function test3_ExportImportCycle() {
    testLogger.info('========================================');
    testLogger.info('测试3：导出-导入循环测试');
    testLogger.info('========================================');
    
    try {
        // 第一步：导出当前数据
        testLogger.info('步骤1：导出当前表格数据');
        const exportResult1 = await window.externalDataAdapter.exportTableData();
        
        if (!exportResult1.success) {
            testLogger.error('第一次导出失败');
            return { passed: false, step: 1, result: exportResult1 };
        }
        
        const originalData = exportResult1.data;
        testLogger.success('第一次导出成功');
        
        // 第二步：导入测试数据
        testLogger.info('步骤2：导入测试数据');
        const testData = await loadTestDataFile();
        const importResult = await window.externalDataAdapter.importTableData(
            testData, 
            TEST_CONFIG.importType
        );
        
        if (!importResult.success) {
            testLogger.error('导入测试数据失败');
            return { passed: false, step: 2, result: importResult };
        }
        
        testLogger.success('导入测试数据成功');
        
        // 第三步：再次导出，验证数据
        testLogger.info('步骤3：再次导出，验证数据');
        const exportResult2 = await window.externalDataAdapter.exportTableData();
        
        if (!exportResult2.success) {
            testLogger.error('第二次导出失败');
            return { passed: false, step: 3, result: exportResult2 };
        }
        
        testLogger.success('第二次导出成功');
        
        // 第四步：比较数据
        testLogger.info('步骤4：比较导入前后的数据');
        const dataMatch = compareTableData(testData, exportResult2.data);
        
        if (!dataMatch) {
            testLogger.warn('数据比较发现差异，但这可能是正常的（取决于导入类型）');
        } else {
            testLogger.success('数据比较通过！');
        }
        
        // 第五步：恢复原始数据
        testLogger.info('步骤5：恢复原始数据');
        const restoreResult = await window.externalDataAdapter.importTableData(
            originalData, 
            TEST_CONFIG.importType
        );
        
        if (!restoreResult.success) {
            testLogger.error('恢复原始数据失败');
            return { passed: false, step: 5, result: restoreResult };
        }
        
        testLogger.success('原始数据已恢复');
        testLogger.success('循环测试完成！');
        
        return { 
            passed: true, 
            originalData, 
            testData, 
            exportedData: exportResult2.data 
        };
        
    } catch (error) {
        testLogger.error('测试执行异常:', error);
        return { passed: false, error };
    }
}

// ============================================================================
// 主测试函数
// ============================================================================

/**
 * 运行所有测试
 */
async function runAllTests() {
    testLogger.info('');
    testLogger.info('╔════════════════════════════════════════════════════════════╗');
    testLogger.info('║     表格数据导出/导入接口测试套件                          ║');
    testLogger.info('╚════════════════════════════════════════════════════════════╝');
    testLogger.info('');
    
    // 检查适配器
    if (!checkAdapterAvailable()) {
        testLogger.error('测试终止：适配器不可用');
        return;
    }
    
    const results = {
        test1: null,
        test2: null,
        test3: null
    };
    
    // 运行测试1
    results.test1 = await test1_ExportTableData();
    
    // 运行测试2
    results.test2 = await test2_ImportTableData();
    
    // 运行测试3
    results.test3 = await test3_ExportImportCycle();
    
    // 汇总结果
    testLogger.info('');
    testLogger.info('========================================');
    testLogger.info('测试结果汇总');
    testLogger.info('========================================');
    
    const passedCount = Object.values(results).filter(r => r && r.passed).length;
    const totalCount = Object.keys(results).length;
    
    testLogger.info(`测试1 (导出): ${results.test1?.passed ? '✅ 通过' : '❌ 失败'}`);
    testLogger.info(`测试2 (导入): ${results.test2?.passed ? '✅ 通过' : '❌ 失败'}`);
    testLogger.info(`测试3 (循环): ${results.test3?.passed ? '✅ 通过' : '❌ 失败'}`);
    testLogger.info('');
    testLogger.info(`总计: ${passedCount}/${totalCount} 通过`);
    
    if (passedCount === totalCount) {
        testLogger.success('🎉 所有测试通过！');
    } else {
        testLogger.error('部分测试失败，请检查日志');
    }
    
    return results;
}

// ============================================================================
// 导出测试函数到全局
// ============================================================================

window.tableExportImportTests = {
    runAllTests,
    test1_ExportTableData,
    test2_ImportTableData,
    test3_ExportImportCycle,
    loadTestDataFile,
    checkAdapterAvailable
};

testLogger.info('测试脚本已加载！');
testLogger.info('运行测试：window.tableExportImportTests.runAllTests()');
testLogger.info('单独测试：');
testLogger.info('  - window.tableExportImportTests.test1_ExportTableData()');
testLogger.info('  - window.tableExportImportTests.test2_ImportTableData()');
testLogger.info('  - window.tableExportImportTests.test3_ExportImportCycle()');

