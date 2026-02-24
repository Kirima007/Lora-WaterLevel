document.addEventListener('DOMContentLoaded', () => {

    let TANK_CONFIG = {};
    let config = {};

    // --- DOM ELEMENTS ---
    const body = document.body;
    const tankId = body.dataset.tankId;

    const statusBanner = document.createElement('div');
    statusBanner.id = 'connectionStatus';
    document.body.prepend(statusBanner);

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
        connectionStatus: document.getElementById('connectionStatus')
    };

    let waterChartManager;
    let allData = [];
    let isFirstLoad = true;

    // --- INITIALIZATION ---
    async function init() {
        try {
            // 1. Load Config from JSON
            const response = await fetch('config.json');
            if (!response.ok) throw new Error('โหลด config.json ไม่ได้');
            TANK_CONFIG = await response.json();

            if (!tankId || !TANK_CONFIG[tankId]) {
                showError('ไม่พบการตั้งค่าสำหรับ Tank ID นี้');
                return;
            }
            config = TANK_CONFIG[tankId];

            // 2. Setup System
            setupPageInfo();
            setupEventListeners();

            window.addEventListener('online', updateOnlineStatus);
            window.addEventListener('offline', updateOnlineStatus);

            await loadData();
            setInterval(loadData, 300000);

        } catch (e) {
            showError('Critical Error: ' + e.message);
        }
    }

    function setupPageInfo() {
        elements.dashboardTitle.textContent = `Dashboard : ${config.name}`;
        elements.googleSheetLink.href = config.sheetUrl.replace('/gviz/tq?', '');
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
                <strong>ความลึกสูงสุด:</strong> <span id="detailMax">${config.maxHeight}</span> m<br>
                <strong>ระดับน้ำท่วม:</strong> > <span id="detailFlood">${config.floodedThreshold}</span> m<br>
                <strong>ระดับน้ำแห้ง:</strong> < <span id="detailDrought">${config.droughtThreshold}</span> m
            </div>
        `;
    }

    function updateOnlineStatus() {
        if (navigator.onLine) {
            elements.connectionStatus.style.display = 'none';
            loadData();
        } else {
            showError('ขาดการเชื่อมต่ออินเทอร์เน็ต');
        }
    }

    function toggleSkeleton(isLoading) {
        const targets = [
            elements.currentHeight, elements.currentPercent,
            elements.alertBox, elements.lastUpdated
        ];
        if (isLoading) {
            targets.forEach(el => el.classList.add('skeleton', 'skeleton-text'));
            elements.waterChart.style.opacity = '0.5';
        } else {
            targets.forEach(el => el.classList.remove('skeleton', 'skeleton-text'));
            elements.waterChart.style.opacity = '1';
        }
    }

    function showError(message) {
        elements.connectionStatus.textContent = `⚠️ ${message}`;
        elements.connectionStatus.className = 'status-offline';
        elements.connectionStatus.style.display = 'block';
        if (allData.length === 0) {
            elements.dataTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">${message}</td></tr>`;
            toggleSkeleton(false);
        }
    }

    function setupEventListeners() {
        elements.openSheetBtn.addEventListener('click', () => {
            window.open(config.sheetUrl.replace('/gviz/tq?', ''), '_blank');
        });
        elements.showInsightsBtn.addEventListener('click', showInsightsPopup);
        elements.closeModalBtn.addEventListener('click', hideInsightsPopup);
        window.addEventListener('click', (event) => {
            if (event.target == elements.insightsModal) hideInsightsPopup();
        });

        // --- ส่วนที่ 1: จัดการเปิด/ปิด ข้อมูลบ่อและแผนที่ ---
        const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
        const tankDetailsContainer = document.getElementById('tankDetailsContainer');
        const detailsIcon = document.getElementById('detailsIcon');

        if (toggleDetailsBtn && tankDetailsContainer) {
            toggleDetailsBtn.addEventListener('click', () => {
                tankDetailsContainer.classList.toggle('show');
                if (tankDetailsContainer.classList.contains('show')) {
                    detailsIcon.style.transform = 'rotate(180deg)';
                } else {
                    detailsIcon.style.transform = 'rotate(0deg)';
                }
            });
        }

        // --- ส่วนที่ 2: จัดการขยายรูประบบ (Lightbox) ---
        const deviceImg = document.getElementById('deviceImg');
        const lightbox = document.getElementById('imageLightbox');
        const expandedImg = document.getElementById('expandedImg');
        const closeLightboxBtn = document.getElementById('closeLightbox');

        if (deviceImg && lightbox && expandedImg && closeLightboxBtn) {
            // กดรูปเพื่อขยาย
            deviceImg.addEventListener('click', () => {
                expandedImg.src = deviceImg.src;
                lightbox.classList.add('show');
            });

            // กด X เพื่อปิด
            closeLightboxBtn.addEventListener('click', () => {
                lightbox.classList.remove('show');
            });

            // กดพื้นหลังดำเพื่อปิด
            lightbox.addEventListener('click', (e) => {
                if (e.target === lightbox) {
                    lightbox.classList.remove('show');
                }
            });
        }
        // --- ส่วนที่ 3: จัดการปุ่มกรองเวลากราฟ (Time Filter) ---
        const timeBtns = document.querySelectorAll('.time-filter-btn');
        timeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // ลบสีปุ่มเก่า แล้วไฮไลต์ปุ่มที่ถูกกด
                timeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (!waterChartManager || !waterChartManager.chart) return;

                const range = btn.dataset.range;
                const latestTime = allData.length > 0 ? allData[0].timestamp : Date.now();
                let startTime = null;

                // คำนวณเวลาย้อนหลัง
                switch (range) {
                    case '6h': startTime = latestTime - (6 * 60 * 60 * 1000); break;
                    case '24h': startTime = latestTime - (24 * 60 * 60 * 1000); break;
                    case '7d': startTime = latestTime - (7 * 24 * 60 * 60 * 1000); break;
                    case '1m': startTime = latestTime - (30 * 24 * 60 * 60 * 1000); break;
                    case '6m': startTime = latestTime - (180 * 24 * 60 * 60 * 1000); break;
                    case '1y': startTime = latestTime - (365 * 24 * 60 * 60 * 1000); break;
                    case 'all': startTime = null; break;
                }

                // สั่งกราฟซูม (Dispatch Action ไปที่ ECharts)
                if (startTime) {
                    waterChartManager.chart.dispatchAction({
                        type: 'dataZoom',
                        startValue: startTime,
                        endValue: latestTime
                    });
                } else {
                    waterChartManager.chart.dispatchAction({
                        type: 'dataZoom',
                        start: 0,
                        end: 100 // คืนค่าเริ่มต้น (ซูมดูทั้งหมด)
                    });
                }
            });
        });
    }

    async function fetchSheetData(baseUrl, sheetName, query) {
        const url = `${baseUrl}sheet=${sheetName}&tq=${query}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
        if (!match) throw new Error('Google Sheet response format error');
        return JSON.parse(match[1]).table.rows;
    }

    async function loadData() {
        if (isFirstLoad) toggleSkeleton(true);
        try {
            if (config.useDynamicConfig) {
                try {
                    const configRows = await fetchSheetData(config.sheetUrl, config.settingSheetName, 'SELECT%20A,B,C');
                    if (configRows.length > 0) {
                        const lastRow = configRows[configRows.length - 1];
                        const newMax = parseFloat(lastRow.c[0]?.v);
                        const newFlood = parseFloat(lastRow.c[1]?.v);
                        const newDrought = parseFloat(lastRow.c[2]?.v);
                        if (!isNaN(newMax)) config.maxHeight = newMax;
                        if (!isNaN(newFlood)) config.floodedThreshold = newFlood;
                        if (!isNaN(newDrought)) config.droughtThreshold = newDrought;
                        updateTankDetails();
                    }
                } catch (e) { console.warn('โหลด Config ไม่สำเร็จ ใช้ค่าเดิม:', e); }
            }
            const dataRows = await fetchSheetData(config.sheetUrl, config.dataSheetName, 'SELECT%20A,B,C%20ORDER%20BY%20A%20DESC,%20B%20DESC');
            const newData = dataRows.map(row => {
                const dateObj = row.c[0]?.v ? parseGoogleDate(row.c[0].v) : null;
                const timeObj = row.c[1]?.v ? parseGoogleDate(row.c[1].v) : null;
                const height = parseFloat(row.c[2]?.v);
                if (!dateObj || !timeObj || isNaN(height)) return null;
                const timestamp = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds()).getTime();
                return { timestamp, height };
            }).filter(d => d);
            if (newData.length === 0) throw new Error('ไม่พบข้อมูลใน Sheet');
            allData = newData;
            render();
            elements.connectionStatus.style.display = 'none';
        } catch (e) {
            console.error('Load Data Error:', e);
            showError('ไม่สามารถโหลดข้อมูลได้: ' + e.message);
        } finally {
            toggleSkeleton(false);
            isFirstLoad = false;
        }
    }

    // --- แทนที่ฟังก์ชัน render() เดิม ---
    function render() {
        if (allData.length === 0) return;
        updateLatestInfo(allData[0]);
        elements.dataTableBody.innerHTML = '';

        // ส่ง index และ array เต็มไปให้ appendTableRow เพื่อคำนวณ Trend
        allData.slice(0, 50).forEach((row, index) => appendTableRow(row, index, allData));

        // 👉 [แก้ไขตรงนี้] ใช้ d.timestamp ที่เป็นตัวเลขตรงๆ กราฟจะเสถียรกว่าและไม่ขยับคลาดเคลื่อน
        const chartData = [...allData].reverse().map(d => ({ x: d.timestamp, y: d.height }));

        if (!waterChartManager) {
            waterChartManager = new WaterChartManager(elements.waterChart);
            waterChartManager.create(chartData, config.floodedThreshold, config.droughtThreshold);
        } else {
            waterChartManager.update(chartData, config.floodedThreshold, config.droughtThreshold);
        }
    }

    // --- แทนที่ฟังก์ชัน appendTableRow() เดิม ---
    // --- ฟังก์ชันสร้างแถวในตาราง (อัปเกรด) ---
    function appendTableRow(row, index, fullData) {
        const dateObj = new Date(row.timestamp);
        const status = getStatus(row.height, config);

        // คำนวณแนวโน้ม (Trend) พร้อมตัวเลขส่วนต่าง (+/-)
        let trendHTML = '<span style="font-size: 0.8em; color: #ccc; margin-left: 5px;">(-)</span>';

        if (index < fullData.length - 1) {
            const prevRow = fullData[index + 1];
            const diff = row.height - prevRow.height;

            if (diff > 0.005) {
                trendHTML = `<span style="font-size: 0.8em; color: var(--high-color); margin-left: 5px;" title="กำลังเพิ่มขึ้น">(+${diff.toFixed(2)}) ↗</span>`;
            } else if (diff < -0.005) {
                trendHTML = `<span style="font-size: 0.8em; color: var(--normal-color); margin-left: 5px;" title="กำลังลดลง">(${diff.toFixed(2)}) ↘</span>`;
            }
        }

        // รวมวันที่และเวลาไว้ในช่องเดียวกัน
        const dateStr = dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
        const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num-cell" style="color: #666; font-size: 0.85em; text-align: left; padding-left: 15px;">
                ${dateStr} <span style="color: #ddd; margin: 0 4px;">|</span> <strong style="color: var(--text-primary);">${timeStr}</strong>
            </td>
            <td class="num-cell" style="font-size: 1.05em; font-weight: 600;">
                ${row.height.toFixed(2)} ${trendHTML}
            </td>
            <td>
                <span class="status-badge ${status.className}">
                    ${status.label}
                </span>
            </td>`;
        elements.dataTableBody.appendChild(tr);
    }

    // --- อัปเดตข้อมูลสถานะปัจจุบัน (กราฟิกถังน้ำ) ---
    function updateLatestInfo(data) {
        if (!data) return;

        const height = data.height;
        let percentage = (height / config.maxHeight) * 100;
        percentage = Math.max(0, Math.min(100, percentage)); // ล็อกให้อยู่แค่ 0-100%

        const status = getStatus(height, config);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";

        // 1. อัปเดตตัวเลข
        elements.currentHeight.textContent = `${height.toFixed(2)} m`;
        elements.currentPercent.textContent = `${percentage.toFixed(1)}%`;
        elements.currentHeight.style.color = status.color;

        // 2. อัปเดตแอนิเมชันคลื่นน้ำ (Liquid Gauge)
        const waveElement = document.getElementById('waveElement');
        if (waveElement) {
            // คำนวณความสูงคลื่น (0% คือ top: 100%, 100% คือ top: 0%)
            // -10 เพื่อชดเชยให้คลื่นกระเพื่อมไม่ทะลุขอบล่างจนหายไป
            const topPos = 100 - percentage - 10;
            waveElement.style.top = `${topPos}%`;

            waveElement.className = 'liquid-wave';
            waveElement.classList.add(`status-${status.className}`);
        }

        // 3. อัปเดตป้าย Alert มุมขวาบน
        elements.alertBox.className = `status-badge ${status.className}`;
        elements.alertBox.innerHTML = `${statusEmoji} ${status.label}`;

        // 4. คำนวณแนวโน้ม (Trend) เทียบกับข้อมูลก่อนหน้า
        const topTrendIcon = document.getElementById('topTrendIcon');
        if (topTrendIcon && allData.length > 1) {
            const prevHeight = allData[1].height;
            const diff = height - prevHeight;

            if (diff > 0.005) {
                topTrendIcon.innerHTML = `<span style="color: var(--high-color);">↗ (+${diff.toFixed(2)})</span>`;
            } else if (diff < -0.005) {
                topTrendIcon.innerHTML = `<span style="color: var(--normal-color);">↘ (${diff.toFixed(2)})</span>`;
            } else {
                topTrendIcon.innerHTML = `<span style="color: #ccc; font-weight: normal;">- (ทรงตัว)</span>`;
            }
        }

        // 5. อัปเดตเวลา "อัปเดตเมื่อกี่นาทีที่แล้ว"
        const now = Date.now();
        const diffMs = now - data.timestamp;
        const diffMins = Math.floor(diffMs / 60000);
        const timeAgoEl = document.getElementById('timeAgoText');

        if (timeAgoEl) {
            if (diffMins <= 1) {
                timeAgoEl.textContent = "เพิ่งอัปเดตเมื่อสักครู่";
                timeAgoEl.style.color = "var(--normal-color)";
            } else {
                timeAgoEl.textContent = `เมื่อ ${diffMins} นาทีที่แล้ว`;
                timeAgoEl.style.color = "var(--text-secondary)";
            }
        }

        // อัปเดตเวลาแบบเต็มด้วย
        elements.lastUpdated.textContent = new Date(data.timestamp).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function parseGoogleDate(str) {
        const m = str.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
        if (!m) return null;
        return new Date(m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0);
    }

    function getStatus(currentHeight) {
        if (currentHeight > config.floodedThreshold) return { label: "น้ำท่วม", color: "var(--high-color)", className: "high" };
        if (currentHeight < config.droughtThreshold) return { label: "น้ำแห้ง", color: "var(--low-color)", className: "low" };
        return { label: "ปกติ", color: "var(--normal-color)", className: "normal" };
    }

    // =========================================
    // คลาสจัดการกราฟน้ำ (Apache ECharts) - ล็อกแกน Y และแถบสีเต็ม
    // =========================================
    class WaterChartManager {
        constructor(container) {
            this.container = container;
            this.chart = null;
            this.resizeHandler = () => { if (this.chart) this.chart.resize(); };
            window.addEventListener('resize', this.resizeHandler);
        }

        create(data, floodedThreshold, droughtThreshold) {
            this.chart = echarts.init(this.container);

            const style = getComputedStyle(document.documentElement);
            const cAccent = style.getPropertyValue('--accent-color').trim() || '#F58220';
            const cHigh = style.getPropertyValue('--high-color').trim() || '#dc3545';
            const cNormal = style.getPropertyValue('--normal-color').trim() || '#28a745';
            const cLow = style.getPropertyValue('--low-color').trim() || '#ffc107';

            const option = {
                grid: { top: 40, right: 40, bottom: 65, left: 45 },
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderColor: '#ddd',
                    textStyle: { fontFamily: 'Prompt, sans-serif' },
                    formatter: function (params) {
                        const date = new Date(params[0].value[0]);
                        const height = params[0].value[1].toFixed(2);

                        let status = 'ปกติ';
                        let color = cNormal;
                        if (height > floodedThreshold) { status = 'น้ำท่วม'; color = cHigh; }
                        else if (height < droughtThreshold) { status = 'น้ำแห้ง'; color = cLow; }

                        return `
                            <div style="font-family: 'Prompt', sans-serif;">
                                <strong style="color: #666; font-size: 0.9em;">${date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</strong><br/>
                                ระดับน้ำ: <span style="color: ${cAccent}; font-weight: bold; font-size: 1.1em;">${height} ม.</span><br/>
                                สถานะ: <span style="color: ${color}; font-weight: bold;">${status}</span>
                            </div>
                        `;
                    }
                },
                dataZoom: [
                    { type: 'inside' },
                    {
                        type: 'slider', bottom: 10, height: 25,
                        borderColor: 'transparent', backgroundColor: '#f4f4f4',
                        fillerColor: 'rgba(245, 130, 32, 0.2)', handleStyle: { color: cAccent },
                        textStyle: { fontFamily: 'Prompt, sans-serif', color: '#666' }
                    }
                ],
                xAxis: {
                    type: 'time',
                    axisLabel: { fontFamily: 'Prompt, sans-serif', color: '#999', formatter: { year: '{yyyy}', month: '{MMM}', day: '{d} {MMM}', hour: '{HH}:{mm}' } },
                    splitLine: { show: false }, axisLine: { lineStyle: { color: '#ddd' } }
                },
                yAxis: {
                    type: 'value',
                    min: 0,
                    max: config.maxHeight, // 👉 ล็อกแกน Y ให้คงที่เหมือนเดิม
                    axisLabel: { fontFamily: 'Prompt, sans-serif', color: '#999' },
                    splitLine: { lineStyle: { type: 'dashed', color: '#eee' } }
                },
                series: [{
                    name: 'ระดับน้ำ', type: 'line', data: [],
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2.5 },
                    itemStyle: { color: cAccent },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(245, 130, 32, 0.4)' },
                            { offset: 1, color: 'rgba(245, 130, 32, 0.05)' }
                        ])
                    }
                }]
            };

            this.chart.setOption(option);
            this.update(data, floodedThreshold, droughtThreshold);
        }

        update(data, floodedThreshold, droughtThreshold) {
            if (!this.chart) return;

            const style = getComputedStyle(document.documentElement);
            const cHigh = style.getPropertyValue('--high-color').trim() || '#dc3545';
            const cLow = style.getPropertyValue('--low-color').trim() || '#ffc107';

            const chartData = data.map(d => [d.x, d.y]);

            const option = {
                yAxis: { min: 0, max: config.maxHeight }, // 👉 บังคับล็อกแกน Y อีกรอบตอนอัปเดตข้อมูล
                series: [{
                    data: chartData,
                    markLine: {
                        silent: true,
                        symbol: ['none', 'none'],
                        data: [
                            {
                                yAxis: floodedThreshold,
                                lineStyle: { color: cHigh, type: 'dashed', width: 1.5 },
                                label: { formatter: ' น้ำท่วม ', position: 'insideEndTop', backgroundColor: cHigh, color: '#fff', padding: [3, 6], borderRadius: 4, fontFamily: 'Prompt, sans-serif', fontSize: 11 }
                            },
                            {
                                yAxis: droughtThreshold,
                                lineStyle: { color: cLow, type: 'dashed', width: 1.5 },
                                label: { formatter: ' น้ำแห้ง ', position: 'insideEndBottom', backgroundColor: cLow, color: '#333', padding: [3, 6], borderRadius: 4, fontFamily: 'Prompt, sans-serif', fontSize: 11 }
                            }
                        ]
                    },
                    markArea: {
                        silent: true,
                        data: [
                            // 👉 ใช้ config.maxHeight แทน 'max' ทำให้แถบสีแดงเต็มกรอบ 100% แน่นอน
                            [
                                { yAxis: floodedThreshold, itemStyle: { color: cHigh, opacity: 0.1 } },
                                { yAxis: config.maxHeight }
                            ],
                            // แถบสีเหลือง
                            [
                                { yAxis: 0, itemStyle: { color: cLow, opacity: 0.15 } },
                                { yAxis: droughtThreshold }
                            ]
                        ]
                    }
                }]
            };

            this.chart.setOption(option);
        }

        destroy() {
            if (this.chart) {
                window.removeEventListener('resize', this.resizeHandler);
                this.chart.dispose();
                this.chart = null;
            }
        }
    }

    // --- INSIGHTS MODAL FUNCTIONS (4 Rows Layout) ---
    function showInsightsPopup() {
        if (allData.length === 0) { alert('ยังไม่มีข้อมูล'); return; }

        // 1. กรองข้อมูล 1 ชั่วโมงย้อนหลัง
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000);
        const data1h = allData.filter(d => d.timestamp >= oneHourAgo);

        if (data1h.length < 2) {
            alert('ข้อมูลใน 1 ชั่วโมงที่ผ่านมามีน้อยเกินไปสำหรับการวิเคราะห์');
            return;
        }

        // --- คำนวณ Rate & Trend ---
        const latestPoint = data1h[0];
        const oldestPoint = data1h[data1h.length - 1];
        const timeDiffHours = (latestPoint.timestamp - oldestPoint.timestamp) / (1000 * 60 * 60);
        let rateOfRise = 0;

        if (timeDiffHours > 0) {
            rateOfRise = (latestPoint.height - oldestPoint.height) / timeDiffHours;
        }

        let trendIcon = '↔';
        let trendText = 'ทรงตัว';
        let trendColor = 'var(--text-secondary)';

        if (rateOfRise > 0.01) {
            trendIcon = '↑'; trendText = 'กำลังเพิ่มขึ้น'; trendColor = 'var(--high-color)';
        } else if (rateOfRise < -0.01) {
            trendIcon = '↓'; trendText = 'กำลังลดลง'; trendColor = 'var(--normal-color)';
        }

        // --- คำนวณ Duration (ท่วม/แล้ง) ---
        const sortedData = [...data1h].sort((a, b) => a.timestamp - b.timestamp);
        let floodMs = 0;
        let droughtMs = 0;

        for (let i = 0; i < sortedData.length - 1; i++) {
            const p1 = sortedData[i];
            const p2 = sortedData[i + 1];
            const diff = p2.timestamp - p1.timestamp;

            if (p1.height > config.floodedThreshold) floodMs += diff;
            if (p1.height < config.droughtThreshold) droughtMs += diff;
        }

        const formatDuration = (ms) => {
            if (ms <= 0) return "-";
            const min = Math.floor(ms / 60000);
            return `${min} นาที`;
        };

        // --- คำนวณ Max / Min ---
        const heights = data1h.map(d => d.height);
        const maxHeight = Math.max(...heights);
        const minHeight = Math.min(...heights);
        const toPercent = (value) => ((value / config.maxHeight) * 100).toFixed(1);

        // --- แสดงผล ---
        // 1. แนวโน้ม
        document.getElementById('insightTrend').innerHTML =
            `<span style="color: ${trendColor}; font-size: 1.1em;">${trendIcon} ${trendText}</span>`;

        // 2. อัตรา
        const sign = rateOfRise > 0 ? '+' : '';
        document.getElementById('insightRate').innerHTML =
            `${sign}${rateOfRise.toFixed(2)} <span style="font-size:0.8em; color:#666;">m/ชม.</span>`;

        // 3. ระยะเวลา
        const floodColor = floodMs > 0 ? 'var(--high-color)' : 'var(--text-primary)';
        document.getElementById('insightFlood').innerHTML = `<span style="color: ${floodColor}">${formatDuration(floodMs)}</span>`;

        const droughtColor = droughtMs > 0 ? 'var(--low-color)' : 'var(--text-primary)';
        document.getElementById('insightDrought').innerHTML = `<span style="color: ${droughtColor}">${formatDuration(droughtMs)}</span>`;

        // 4. Max/Min
        document.getElementById('insightMax').innerHTML = `${maxHeight.toFixed(2)} m <span class="percent" style="font-size:0.7em; color:#999;">(${toPercent(maxHeight)}%)</span>`;
        document.getElementById('insightMin').innerHTML = `${minHeight.toFixed(2)} m <span class="percent" style="font-size:0.7em; color:#999;">(${toPercent(minHeight)}%)</span>`;

        elements.insightsModal.classList.add('show');
    }

    function hideInsightsPopup() {
        elements.insightsModal.classList.remove('show');
    }

    init();
});