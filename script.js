// 使用localStorage存储库存数据
let inventory = JSON.parse(localStorage.getItem('inventory')) || {};

// LeanCloud中国区初始化
const LEANCLOUD_APP_ID = '93RdX2hZAohYgqCfKcFPjIW4-gzGzoHsz';
const LEANCLOUD_APP_KEY = 'Bb5xto5y0DLFsq3cbVZNgDU0';
const LEANCLOUD_SERVER_URL = 'https://93rdx2hzaohygqcfkcfpjiw4.lc-cn-n1-shared.com';

AV.init({
  appId: LEANCLOUD_APP_ID,
  appKey: LEANCLOUD_APP_KEY,
  serverURL: LEANCLOUD_SERVER_URL
});

// 保存库存到云端
function saveToCloud() {
    const Inventory = AV.Object.extend('Inventory');
    const query = new AV.Query('Inventory');
    query.first().then(obj => {
        if (obj) {
            obj.set('data', inventory);
            return obj.save();
        } else {
            const inv = new Inventory();
            inv.set('data', inventory);
            // 设置ACL为所有人可读写
            const acl = new AV.ACL();
            acl.setPublicReadAccess(true);
            acl.setPublicWriteAccess(true);
            inv.setACL(acl);
            return inv.save();
        }
    }).then(() => {
        alert('库存已保存到云端！');
    }).catch(err => {
        alert('保存失败：' + err.message);
    });
}

// 从云端加载库存
function loadFromCloud() {
    const query = new AV.Query('Inventory');
    query.first().then(obj => {
        if (obj) {
            inventory = obj.get('data') || {};
            localStorage.setItem('inventory', JSON.stringify(inventory));
            displayInventory();
            alert('库存已从云端加载！');
        } else {
            alert('云端暂无库存数据！');
        }
    }).catch(err => {
        alert('加载失败：' + err.message);
    });
}

// 切换标签页
function switchTab(tab) {
    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`).classList.add('active');
    
    // 更新内容显示
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    if (tab === 'single') {
        document.getElementById('inventoryForm').classList.add('active');
    } else {
        document.getElementById('batchForm').classList.add('active');
    }
}

// 表单提交处理
document.getElementById('inventoryForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const operationType = document.getElementById('operationType').value;
    const productCode = document.getElementById('productCode').value;
    const productName = document.getElementById('productName').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const remarks = document.getElementById('remarks').value;
    
    processInventoryOperation(operationType, productCode, productName, quantity, remarks);
    
    // 清空表单
    this.reset();
    
    // 刷新显示
    displayInventory();
    
    alert('操作成功！');
});

// 处理库存操作
function processInventoryOperation(operationType, productCode, productName, quantity, remarks) {
    // 更新库存
    if (!inventory[productCode]) {
        inventory[productCode] = {
            name: productName,
            quantity: 0,
            lastUpdate: new Date().toISOString()
        };
    }
    
    // 根据操作类型更新数量
    if (operationType === 'in') {
        inventory[productCode].quantity += quantity;
    } else {
        if (inventory[productCode].quantity < quantity) {
            alert(`货品 ${productCode} 库存不足！`);
            return false;
        }
        inventory[productCode].quantity -= quantity;
    }
    
    // 更新其他信息
    inventory[productCode].name = productName || inventory[productCode].name;
    inventory[productCode].lastUpdate = new Date().toISOString();
    
    // 保存到localStorage
    localStorage.setItem('inventory', JSON.stringify(inventory));
    return true;
}

// 处理批量数据
function processBatchData() {
    const operationType = document.getElementById('batchOperationType').value;
    const batchData = document.getElementById('batchData').value.trim();
    
    if (!batchData) {
        alert('请输入要导入的数据！');
        return;
    }
    
    const lines = batchData.split('\n');
    let successCount = 0;
    let failCount = 0;
    let firstLineIsHeader = false;
    
    // 检查首行是否为表头
    if (lines[0].includes('货品编码') && lines[0].includes('数量')) {
        firstLineIsHeader = true;
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue; // 跳过空行
        if (i === 0 && firstLineIsHeader) continue; // 跳过表头
        // 支持制表符或逗号分隔
        let parts = line.split(/\t|,/).map(item => item.trim());
        const [productCode, quantity, productName = '', remarks = ''] = parts;
        if (!productCode || !quantity || isNaN(Number(quantity))) {
            failCount++;
            continue;
        }
        const success = processInventoryOperation(
            operationType,
            productCode,
            productName,
            parseInt(quantity),
            remarks
        );
        if (success) {
            successCount++;
        } else {
            failCount++;
        }
    }
    // 刷新显示
    displayInventory();
    // 清空输入框
    document.getElementById('batchData').value = '';
    alert(`批量导入完成！\n成功：${successCount}条\n失败：${failCount}条`);
}

// 搜索库存
function searchInventory() {
    const searchCode = document.getElementById('searchCode').value.trim();
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    
    if (searchCode) {
        // 搜索特定编码
        if (inventory[searchCode]) {
            addRowToTable(searchCode, inventory[searchCode]);
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">未找到该货品</td></tr>';
        }
    } else {
        // 显示所有库存
        displayInventory();
    }
}

// 显示所有库存
function displayInventory() {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    
    if (Object.keys(inventory).length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">暂无库存数据</td></tr>';
        return;
    }
    
    for (const code in inventory) {
        addRowToTable(code, inventory[code]);
    }
}

// 添加行到表格
function addRowToTable(code, item) {
    const tbody = document.getElementById('inventoryTableBody');
    const row = document.createElement('tr');
    
    row.innerHTML = `
        <td>${code}</td>
        <td>${item.name || '-'}</td>
        <td>${item.quantity}</td>
        <td>${new Date(item.lastUpdate).toLocaleString()}</td>
    `;
    
    tbody.appendChild(row);
}

// 页面加载时显示所有库存
document.addEventListener('DOMContentLoaded', displayInventory); 