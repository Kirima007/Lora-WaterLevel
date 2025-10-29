document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const TANK_CONFIG = {
        'tank1': {
            name: 'บ่อข้างตึกโทร',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/1eQwqYfsLff8z5hsFMB2_cghDQ60zi8NAokpKibCP6S8/gviz/tq?sheet=Sheet1',
            location: 'หน้าตึกภาควิชาวิศวกรรมโทรคมนาคม',
            latitude: 13.727301,
            longitude: 100.776734,
            maxHeight: 3, 
            floodedThreshold: 2.5,
            droughtThreshold: 0.5,
        },
        'tank2': {
            name: 'บ่อโรงอาหาร A',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/1fKmavCgosbDlrlbrkJjFRjR0GKZnPpTo8DAPlhPI5sk/gviz/tq?sheet=Sheet1',
            location: 'โรงอาหาร A คณะวิศวกรรมศาสตร์',
            latitude: 13.726563,
            longitude: 100.776414,
            maxHeight: 3,
            floodedThreshold: 2.5,
            droughtThreshold: 0.5,
        }
    };

    // --- DOM ELEMENTS ---
    const body = document.body;
    const tankId = body.dataset.tankId;
    if (!tankId) return;

    const config = TANK_CONFIG[tankId];
    const elements = {
        dashboardTitle: document.getElementById('dashboardTitle'),
        googleSheetLink: document.getElementById('googleSheetLink'),
        alertBox: document.getElementById('alertBox'),
        currentHeight: document.getElementById('currentHeight'),
        currentPercent: document.getElementById('currentPercent'),
        tankDetails: document.getElementById('tankDetails'),
        waterChart: document.getElementById('waterChart'),
        dataTableBody: document.getElementById('dataTableBody'),
        openSheetBtn: document.getElementById('openSheetBtn'),
        lastUpdated: document.getElementById('lastUpdated'),
        showInsightsBtn: document.getElementById('showInsightsBtn'),
        insightsModal: document.getElementById('insightsModal'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        avgHeight: document.getElementById('avgHeight'),
        maxHeightInsight: document.getElementById('maxHeightInsight'),
        minHeightInsight: document.getElementById('minHeightInsight'),
        currentTrend: document.getElementById('currentTrend'),
    };

    // --- STATE ---
    let waterChartManager;
    let allData = [];

    // --- INITIALIZATION ---
    async function init() {
        setupPageInfo();
        setupEventListeners();
        await loadData(); // Load data initially
        setInterval(loadData, 300000); // Refresh every 5 minutes
    }

    function setupPageInfo() {
        elements.dashboardTitle.textContent = `Dashboard : ${config.name}`;
        const sheetUrl = config.sheetUrl.replace(/\/gviz\/tq\?.*/, '');
        elements.googleSheetLink.href = sheetUrl;
        updateTankDetails();
    }
    
    function updateTankDetails() {
        const mapUrl = `https://maps.google.com/maps?q=${config.latitude},${config.longitude}&hl=th&z=17&output=embed`;

        elements.tankDetails.innerHTML = `
            <div class="map-container">
                <iframe class="map-iframe" src="${mapUrl}" allowfullscreen="" loading="lazy"></iframe>
            </div>
            <div class="details-list">
                <strong>สถานที่:</strong> ${config.location}<br>
                <strong>ความลึกสูงสุด:</strong> ${config.maxHeight} m<br>
                <strong>ระดับน้ำท่วม:</strong> > ${config.floodedThreshold} m<br>
                <strong>ระดับน้ำแห้ง:</strong> < ${config.droughtThreshold} m
            </div>
        `;
    }
    
    function setupEventListeners() {
        elements.openSheetBtn.addEventListener('click', () => {
            window.open(config.sheetUrl.replace(/\/gviz\/tq\?.*/, ''), '_blank');
        });

        elements.showInsightsBtn.addEventListener('click', showInsightsPopup);
        elements.closeModalBtn.addEventListener('click', hideInsightsPopup);
        window.addEventListener('click', (event) => {
            if (event.target == elements.insightsModal) {
                hideInsightsPopup();
            }
        });
    }

    // --- DATA HANDLING ---
    async function loadData() {
        elements.dataTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">กำลังโหลด...</td></tr>';
        try {
            let query = 'SELECT%20A,B,C';
            if (tankId === 'tank2') {
                query = 'SELECT%20A,B,C,J,K,L';
            }
            const url = config.sheetUrl + '&tq=' + query;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const text = await res.text();
            const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
            if (!match) throw new Error('Google Sheet response format error');

            const json = JSON.parse(match[1]);
            const rows = json.table.rows;

            if (tankId === 'tank2' && rows.length > 0) {
                let lastTankDepth = null;
                let lastFlooded = null;
                let lastDrought = null;

                for (let i = rows.length - 1; i >= 0; i--) {
                    const rowCells = rows[i].c;

                    // --- 💡 ปรับปรุงการตรวจสอบตรงนี้ ---
                    // ตรวจสอบว่า rowCells[3] ไม่ใช่ null ก่อน แล้วค่อยเช็คค่า v ที่อยู่ข้างใน
                    if (lastTankDepth === null && rowCells[3] && rowCells[3].v !== null) {
                        lastTankDepth = parseFloat(rowCells[3].v);
                    }

                    if (lastFlooded === null && rowCells[4] && rowCells[4].v !== null) {
                        lastFlooded = parseFloat(rowCells[4].v);
                    }

                    if (lastDrought === null && rowCells[5] && rowCells[5].v !== null) {
                        lastDrought = parseFloat(rowCells[5].v);
                    }

                    if (lastTankDepth !== null && lastFlooded !== null && lastDrought !== null) {
                        break;
                    }
                }

                if (lastTankDepth !== null && !isNaN(lastTankDepth)) {
                    config.maxHeight = lastTankDepth;
                }
                if (lastFlooded !== null && !isNaN(lastFlooded)) {
                    config.floodedThreshold = lastFlooded;
                }
                if (lastDrought !== null && !isNaN(lastDrought)) {
                    config.droughtThreshold = lastDrought;
                }

                updateTankDetails();
            }

            const newData = rows.map(row => {
                const dateObj = row.c[0]?.v ? parseGoogleDate(row.c[0].v) : null;
                const timeObj = row.c[1]?.v ? parseGoogleDate(row.c[1].v) : null;
                const height = parseFloat(row.c[2]?.v);

                if (!dateObj || !timeObj || isNaN(height)) return null;

                const timestamp = new Date(
                    dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(),
                    timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds()
                ).getTime();

                return { timestamp, height };
            }).filter(d => d && !isNaN(d.height) && d.timestamp);

            if (newData.length === 0) {
                elements.dataTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">ไม่พบข้อมูล</td></tr>`;
                return;
            }

            allData = newData.sort((a, b) => b.timestamp - a.timestamp);
            render();
        } catch (e) {
            elements.dataTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">ผิดพลาด: ${e.message}</td></tr>`;
            console.error('Fetch error:', e);
        }
    }

    function render() {
    if (allData.length === 0) return;
    updateLatestInfo(allData[0]);
    elements.dataTableBody.innerHTML = '';
    const tableData = allData.slice(0, 50);
    tableData.forEach(row => appendTableRow(row));
    
    // --- 💡 ปรับโค้ดตรงนี้ ---
    // ไม่มีการกรองข้อมูลแล้ว แปลงข้อมูลทั้งหมดเพื่อใช้กับกราฟ
    const chartData = allData
        .map(d => ({ x: new Date(d.timestamp), y: d.height }))
        .reverse();
    // --- สิ้นสุดการปรับโค้ด ---
        
    if (!waterChartManager) {
        waterChartManager = new WaterChartManager(elements.waterChart);
        waterChartManager.create(chartData, 'เวลา', config.floodedThreshold, config.droughtThreshold);
    } else {
        waterChartManager.update(chartData, config.floodedThreshold, config.droughtThreshold);
    }
}
    
    function appendTableRow(row) {
        const dateObj = new Date(row.timestamp);
        const status = getStatus(row.height);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
            <td>${dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${row.height.toFixed(2)}</td>
            <td style="color: ${status.color}; font-weight: 500;">${status.label}</td>
        `;
        elements.dataTableBody.appendChild(tr);
    }

    function updateLatestInfo(data) {
        if (!data) return;
        const date = new Date(data.timestamp);
        elements.lastUpdated.textContent = `${date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`;
        
        const height = data.height;
        const percentage = (height / config.maxHeight) * 100;
        
        elements.currentHeight.textContent = `${height.toFixed(2)} m`;
        elements.currentPercent.textContent = `${percentage.toFixed(1)} %`;
        
        const status = getStatus(height);
        elements.alertBox.className = 'status-alert'; // Reset classes
        elements.alertBox.classList.add(`alert-${status.className}`);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";
        elements.alertBox.innerHTML = `${statusEmoji} ${status.label}`;
        
        elements.currentHeight.style.color = status.color;
        elements.currentPercent.style.color = status.color;
    }
    
    function parseGoogleDate(str) {
        const m = str.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
        if (!m) return null;
        return new Date(m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0);
    }

    function getStatus(currentHeight) {
        if (currentHeight > config.floodedThreshold) {
            return { label: "น้ำท่วม", color: "var(--high-color)", className: "high" };
        }
        if (currentHeight < config.droughtThreshold) {
            return { label: "น้ำแห้ง", color: "var(--low-color)", className: "low" };
        }
        return { label: "ปกติ", color: "var(--normal-color)", className: "normal" };
    }

    class WaterChartManager {
        constructor(container) {
            this.container = container;
            this.chart = null;
        }

        create(data, xLabel, floodedThreshold, droughtThreshold) {
            this.destroy();
            const options = {
                chart: { 
                    type: 'area', 
                    height: '100%',
                    background: 'transparent', 
                    toolbar: { show: true, tools: { download: false } }, 
                    zoom: { enabled: true },
                    animations: { enabled: false } // Disable animations
                },
                colors: [ 'var(--accent-color)' ],
                series: [{ name: 'ระดับน้ำ (m)', data: data }],
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 2.5 },
                fill: { type: "gradient", gradient: { shade: 'light', shadeIntensity: 0.5, opacityFrom: 0.7, opacityTo: 0.2, stops: [0, 90, 100] }},
                xaxis: {
    type: 'datetime',
    labels: {
        datetimeUTC: false, // ใช้เวลาท้องถิ่น
        // --- 💡 การตั้งค่าหลักอยู่ตรงนี้ ---
        datetimeFormatter: {
            // รูปแบบเมื่อมองเห็นภาพรวมระดับ "ปี"
            year: 'yyyy',
            // รูปแบบเมื่อซูมเข้ามาเห็นระดับ "เดือน"
            month: 'dd/MM/yyyy',
            // รูปแบบเมื่อซูมเข้ามาเห็นระดับ "วัน"
            day: 'dd/MM/yyyy',
            // รูปแบบเมื่อซูมเข้ามาจนเห็นระดับ "ชั่วโมง"
            hour: 'HH:mm น.'
        },
    },
    title: {
        text: 'วันและเวลา'
    },
    tooltip: {
        enabled: true,
        // กำหนดรูปแบบของ tooltip ที่แกน X โดยเฉพาะ
        formatter: function(val, opts) {
            // สร้าง object Date จาก timestamp
            const date = new Date(val);
            // จัดรูปแบบให้สวยงาม
            return date.toLocaleDateString('th-TH', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) + ' น.';
        }
    }
},
                yaxis: { 
                    min: 0, 
                    max: config.maxHeight, 
                    title: { text: 'ระดับน้ำ (m)', style: { color: 'var(--text-secondary)', fontWeight: 400 } }, 
                    labels: { style: { colors: 'var(--text-secondary)' }, formatter: val => val.toFixed(1) }
                },
                grid: { borderColor: '#e9ecef', strokeDashArray: 4 },
                tooltip: { theme: 'light', x: { format: 'dd MMM HH:mm น.'} },
                annotations: {
                    yaxis: [
                        { y: floodedThreshold, borderColor: 'var(--high-color)', label: { text: `น้ำท่วม`, style: { background: 'var(--high-color)', color: '#fff', padding: { left: 5, right: 5, top: 2, bottom: 2 } } }, borderWidth: 2, strokeDashArray: 2 },
                        { y: droughtThreshold, borderColor: 'var(--low-color)', label: { text: `น้ำแห้ง`, style: { background: 'var(--low-color)', color: 'var(--text-primary)', padding: { left: 5, right: 5, top: 2, bottom: 2 }} }, borderWidth: 2, strokeDashArray: 2 }
                    ]
                }
            };
            this.chart = new ApexCharts(this.container, options);
            this.chart.render();
        }

        update(data, floodedThreshold, droughtThreshold) {
            if (!this.chart) return;
            this.chart.updateSeries([{ data: data }]);
            this.chart.updateOptions({
                yaxis: { max: config.maxHeight },
                annotations: {
                    yaxis: [
                        { y: floodedThreshold, borderColor: 'var(--high-color)', label: { text: `น้ำท่วม`, style: { background: 'var(--high-color)', color: '#fff', padding: { left: 5, right: 5, top: 2, bottom: 2 } } }, borderWidth: 2, strokeDashArray: 2 },
                        { y: droughtThreshold, borderColor: 'var(--low-color)', label: { text: `น้ำแห้ง`, style: { background: 'var(--low-color)', color: 'var(--text-primary)', padding: { left: 5, right: 5, top: 2, bottom: 2 } } }, borderWidth: 2, strokeDashArray: 2 }
                    ]
                }
            });
        }
        
        destroy() { if (this.chart) this.chart.destroy(); }
    }

    // --- INSIGHTS MODAL FUNCTIONS ---
    function showInsightsPopup() {
        if (allData.length === 0) {
            alert('ยังไม่มีข้อมูลเพียงพอสำหรับแสดงผล');
            return;
        }
        const oneHourAgo = allData[0].timestamp - (60 * 60 * 1000);
        const recentData = allData.filter(d => d.timestamp >= oneHourAgo);

        if (recentData.length < 2) {
            alert('มีข้อมูลน้อยกว่า 2 จุดในชั่วโมงล่าสุด ไม่สามารถคำนวณแนวโน้มได้');
            return;
        }
        const heights = recentData.map(d => d.height);
        const maxHeight = Math.max(...heights);
        const minHeight = Math.min(...heights);
        const sum = heights.reduce((a, b) => a + b, 0);
        const avgHeight = sum / heights.length;
        
        const latestHeight = recentData[0].height;
        const olderHeight = recentData[recentData.length - 1].height;
        let trend = { icon: '↔', text: 'คงที่', color: 'var(--text-secondary)' };
        if (latestHeight > olderHeight) {
            trend = { icon: '↑', text: 'เพิ่มขึ้น', color: 'var(--normal-color)' };
        } else if (latestHeight < olderHeight) {
            trend = { icon: '↓', text: 'ลดลง', color: 'var(--high-color)' };
        }

        const toPercent = (value) => ((value / config.maxHeight) * 100).toFixed(1);

        elements.avgHeight.innerHTML = `${avgHeight.toFixed(2)} m <span class="percent">(${toPercent(avgHeight)}%)</span>`;
        elements.maxHeightInsight.innerHTML = `${maxHeight.toFixed(2)} m <span class="percent">(${toPercent(maxHeight)}%)</span>`;
        elements.minHeightInsight.innerHTML = `${minHeight.toFixed(2)} m <span class="percent">(${toPercent(minHeight)}%)</span>`;
        elements.currentTrend.innerHTML = `<span style="color: ${trend.color};">${trend.icon} ${trend.text}</span>`;
        
        elements.insightsModal.style.display = 'block';
    }

    function hideInsightsPopup() {
        elements.insightsModal.style.display = 'none';
    }

    init();
});