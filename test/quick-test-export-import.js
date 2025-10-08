/**
 * 快速测试脚本 - 表格数据导出/导入接口
 * 
 * 使用方法：
 * 1. 在浏览器中打开项目
 * 2. 打开浏览器控制台（F12）
 * 3. 复制并粘贴此脚本到控制台
 * 4. 按回车执行
 * 
 * @version 1.0.0
 * @date 2025-10-08
 */

(async function quickTest() {
    console.log('%c========================================', 'color: #2196F3; font-weight: bold');
    console.log('%c  表格数据导出/导入接口 - 快速测试', 'color: #2196F3; font-weight: bold');
    console.log('%c========================================', 'color: #2196F3; font-weight: bold');
    console.log('');
    
    // 检查适配器是否存在
    if (typeof window.externalDataAdapter === 'undefined') {
        console.error('❌ 错误：外部数据适配器未初始化！');
        console.log('请确保项目已正确加载，并且 external-data-adapter.js 已被引入。');
        return;
    }
    
    console.log('✅ 外部数据适配器已加载');
    console.log('');
    
    // ========================================
    // 测试1：导出表格数据
    // ========================================
    console.log('%c[测试1] 导出表格数据', 'color: #FF9800; font-weight: bold');
    console.log('调用: window.externalDataAdapter.exportTableData()');
    
    try {
        const exportResult = await window.externalDataAdapter.exportTableData();
        
        console.log('导出结果:', exportResult);
        
        if (exportResult.success) {
            console.log('%c✅ 导出成功！', 'color: #4CAF50; font-weight: bold');
            console.log('导出的数据:', exportResult.data);
            
            // 统计表格数量
            const tableCount = Object.keys(exportResult.data).filter(key => key !== 'mate').length;
            console.log(`共导出 ${tableCount} 个表格`);
            
            // 显示表格名称
            console.log('表格列表:');
            Object.entries(exportResult.data).forEach(([uid, table]) => {
                if (uid !== 'mate') {
                    console.log(`  - ${table.name} (UID: ${uid})`);
                }
            });
            
            // 保存导出数据到全局变量，方便后续测试
            window._exportedTableData = exportResult.data;
            console.log('');
            console.log('💡 提示：导出的数据已保存到 window._exportedTableData');
            
        } else {
            console.log('%c❌ 导出失败', 'color: #F44336; font-weight: bold');
            console.log('错误信息:', exportResult.message);
        }
        
    } catch (error) {
        console.error('❌ 测试1执行异常:', error);
    }
    
    console.log('');
    
    // ========================================
    // 测试2：导入表格数据
    // ========================================
    console.log('%c[测试2] 导入表格数据', 'color: #FF9800; font-weight: bold');
    console.log('说明：此测试需要先准备测试数据');
    console.log('');
    
    // 检查是否有导出的数据可用
    if (window._exportedTableData) {
        console.log('使用刚才导出的数据进行导入测试...');
        console.log('调用: window.externalDataAdapter.importTableData(data, "data")');
        
        try {
            const importResult = await window.externalDataAdapter.importTableData(
                window._exportedTableData,
                'data'
            );
            
            console.log('导入结果:', importResult);
            
            if (importResult.success) {
                console.log('%c✅ 导入成功！', 'color: #4CAF50; font-weight: bold');
            } else {
                console.log('%c❌ 导入失败', 'color: #F44336; font-weight: bold');
                console.log('错误信息:', importResult.message);
            }
            
        } catch (error) {
            console.error('❌ 测试2执行异常:', error);
        }
    } else {
        console.log('⚠️ 跳过导入测试（没有可用的测试数据）');
        console.log('');
        console.log('如需测试导入功能，请执行以下步骤：');
        console.log('1. 准备测试数据（JSON格式）');
        console.log('2. 运行以下命令：');
        console.log('   const testData = { /* 你的测试数据 */ };');
        console.log('   await window.externalDataAdapter.importTableData(testData, "data");');
    }
    
    console.log('');
    console.log('%c========================================', 'color: #2196F3; font-weight: bold');
    console.log('%c  测试完成', 'color: #2196F3; font-weight: bold');
    console.log('%c========================================', 'color: #2196F3; font-weight: bold');
    console.log('');
    console.log('💡 可用的接口：');
    console.log('  - window.externalDataAdapter.exportTableData()');
    console.log('  - window.externalDataAdapter.importTableData(jsonData, importType)');
    console.log('');
    console.log('💡 参数说明：');
    console.log('  - jsonData: 表格JSON数据对象');
    console.log('  - importType: "data" (仅导入数据) 或 "both" (导入模板和数据)');
    console.log('');
    
})();

