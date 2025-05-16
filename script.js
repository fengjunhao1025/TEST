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

// 清除所有本地库存和历史数据（正式版初始化）
localStorage.removeItem('inventory');
localStorage.removeItem('historyRecords');
inventory = {};
historyRecords = [];

// 清理localStorage中的脏数据（如果有）
try {
    let inv = JSON.parse(localStorage.getItem('inventory'));
    // 如果是数组，清空并提示
    if (Array.isArray(inv)) {
        alert('检测到本地库存数据异常（为数组），已自动清空，请重新录入！');
        localStorage.removeItem('inventory');
        inv = {};
    }
    if (inv && typeof inv === 'object') {
        for (const k in inv) {
            if (!inv[k] || typeof inv[k] !== 'object') {
                delete inv[k];
            }
        }
        localStorage.setItem('inventory', JSON.stringify(inv));
    }
} catch (e) {
    localStorage.removeItem('inventory');
}

// 历史出入库单据记录
let historyRecords = JSON.parse(localStorage.getItem('historyRecords')) || [];

// 记录历史单据
function addHistoryRecord({type, code, name, quantity, remarks}) {
    historyRecords.push({
        time: new Date().toISOString(),
        type,
        code,
        name,
        quantity,
        remarks
    });
    localStorage.setItem('historyRecords', JSON.stringify(historyRecords));
    saveHistoryToCloud(); // 自动同步到云端
}

// 保存库存到云端
function saveToCloud() {
    if (Array.isArray(inventory)) {
        alert('库存数据异常（为数组），请清空本地和云端数据后重新录入！');
        return;
    }
    const Inventory = AV.Object.extend('Inventory2');
    const query = new AV.Query('Inventory2');
    query.first().then(obj => {
        if (obj) {
            obj.set('data', inventory);
            return obj.save();
        } else {
            const inv = new Inventory();
            inv.set('data', inventory);
            const acl = new AV.ACL();
            acl.setPublicReadAccess(true);
            acl.setPublicWriteAccess(true);
            inv.setACL(acl);
            return inv.save();
        }
    }).then(() => {
        alert('库存已保存到云端！');
    }).catch(err => {
        alert('保存失败：' + err.message + '\n请确保云端Inventory2表已清空所有数据和data字段！');
    });
}

// 从云端加载库存
function loadFromCloud() {
    const query = new AV.Query('Inventory2');
    query.first().then(obj => {
        if (obj) {
            let data = obj.get('data') || {};
            if (Array.isArray(data)) {
                const objData = {};
                data.forEach(item => {
                    if (item && item.productCode) {
                        objData[item.productCode] = {
                            name: item.productName || '',
                            quantity: item.quantity || 0,
                            lastUpdate: item.lastUpdate || new Date().toISOString()
                        };
                    }
                });
                data = objData;
            }
            inventory = data;
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
    if (quantity > 999999) {
        alert('数量不能超过999999！');
        return;
    }
    const remarks = document.getElementById('remarks').value;
    const success = processInventoryOperation(operationType, productCode, productName, quantity, remarks);
    if (success) {
        addHistoryRecord({
            type: operationType === 'in' ? '入库' : '出库',
            code: productCode,
            name: productName,
            quantity,
            remarks
        });
        this.reset();
        displayInventory();
        saveToCloud();
        alert('操作成功！');
        displayHistoryRecords();
    }
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
    if (Array.isArray(inventory)) {
        inventory = {};
    }
    const lines = batchData.split('\n');
    let successCount = 0;
    let failCount = 0;
    let firstLineIsHeader = false;
    if (lines[0].includes('货品编码') && lines[0].includes('数量')) {
        firstLineIsHeader = true;
    }
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && firstLineIsHeader) continue;
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
            addHistoryRecord({
                type: operationType === 'in' ? '入库' : '出库',
                code: productCode,
                name: productName,
                quantity: parseInt(quantity),
                remarks
            });
            successCount++;
        } else {
            failCount++;
        }
    }
    displayInventory();
    document.getElementById('batchData').value = '';
    saveToCloud();
    alert(`批量导入完成！\n成功：${successCount}条\n失败：${failCount}条`);
    displayHistoryRecords();
}

// 支持模糊查询的库存查询
function searchInventory() {
    const keyword = document.getElementById('searchKeyword').value.trim().toLowerCase();
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    if (keyword) {
        let found = false;
        for (const code in inventory) {
            const item = inventory[code];
            if (!item) continue;
            // 编码或名称包含关键字
            if (code.toLowerCase().includes(keyword) || (item.name && item.name.toLowerCase().includes(keyword))) {
                addRowToTable(code, item);
                found = true;
            }
        }
        if (!found) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">未找到相关货品</td></tr>';
        }
    } else {
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
    if (!item) return; // 防止item为null时报错
    const tbody = document.getElementById('inventoryTableBody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${code}</td>
        <td>${item.name || '-'}</td>
        <td>${item.quantity}</td>
        <td>${item.lastUpdate ? new Date(item.lastUpdate).toLocaleString() : '-'}</td>
    `;
    tbody.appendChild(row);
}

// 历史单据渲染
function displayHistoryRecords(records) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';
    const data = records || historyRecords;
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">暂无历史记录</td></tr>';
        return;
    }
    data.slice().reverse().forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.time ? new Date(item.time).toLocaleString() : '-'}</td>
            <td>${item.type}</td>
            <td>${item.code}</td>
            <td>${item.name || '-'}</td>
            <td>${item.quantity}</td>
            <td>${item.remarks || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

// 历史单据模糊查询
function searchHistoryRecords() {
    const keyword = document.getElementById('historyKeyword').value.trim().toLowerCase();
    if (!keyword) {
        displayHistoryRecords();
        return;
    }
    const filtered = historyRecords.filter(item =>
        (item.code && item.code.toLowerCase().includes(keyword)) ||
        (item.name && item.name.toLowerCase().includes(keyword)) ||
        (item.type && item.type.toLowerCase().includes(keyword)) ||
        (item.remarks && item.remarks.toLowerCase().includes(keyword))
    );
    displayHistoryRecords(filtered);
}

// 页面加载时显示所有库存
document.addEventListener('DOMContentLoaded', displayInventory);

// 页面加载时渲染历史记录
document.addEventListener('DOMContentLoaded', () => {
    displayInventory();
    displayHistoryRecords();
});

// 保存历史记录到云端
function saveHistoryToCloud() {
    const History = AV.Object.extend('HistoryRecords');
    const query = new AV.Query('HistoryRecords');
    query.first().then(obj => {
        if (obj) {
            obj.set('data', historyRecords);
            return obj.save();
        } else {
            const his = new History();
            his.set('data', historyRecords);
            const acl = new AV.ACL();
            acl.setPublicReadAccess(true);
            acl.setPublicWriteAccess(true);
            his.setACL(acl);
            return his.save();
        }
    }).then(() => {
        alert('历史记录已保存到云端！');
    }).catch(err => {
        alert('保存失败：' + err.message + '\n请确保云端HistoryRecords表已清空所有数据和data字段！');
    });
}

// 从云端加载历史记录
function loadHistoryFromCloud() {
    const query = new AV.Query('HistoryRecords');
    query.first().then(obj => {
        if (obj) {
            let data = obj.get('data') || [];
            if (!Array.isArray(data)) data = [];
            historyRecords = data;
            localStorage.setItem('historyRecords', JSON.stringify(historyRecords));
            displayHistoryRecords();
            alert('历史记录已从云端加载！');
        } else {
            alert('云端暂无历史记录数据！');
        }
    }).catch(err => {
        alert('加载失败：' + err.message);
    });
}

// 主模块切换逻辑
function switchMainTab(tab) {
    // 按钮高亮
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.main-tab-btn[onclick="switchMainTab('${tab}')"]`).classList.add('active');
    // 模块显示
    document.getElementById('inoutModule').style.display = (tab === 'inout') ? '' : 'none';
    document.getElementById('inventoryModule').style.display = (tab === 'inventory') ? '' : 'none';
    document.getElementById('historyModule').style.display = (tab === 'history') ? '' : 'none';
}

// 页面加载默认显示出入库操作模块
document.addEventListener('DOMContentLoaded', function() {
    switchMainTab('inout');
}); 