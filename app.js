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
    function appendTableRow(row, index, fullData) {
        const dateObj = new Date(row.timestamp);
        const status = getStatus(row.height);

        // คำนวณแนวโน้ม (Trend) เทียบกับข้อมูลก่อนหน้า (index + 1)
        let trendIcon = '<span class="trend-arrow trend-steady" title="ทรงตัว">-</span>';

        if (index < fullData.length - 1) {
            const prevRow = fullData[index + 1];
            const diff = row.height - prevRow.height;

            // ถ้าต่างกันมากกว่า 0.005 เมตร ให้แสดงลูกศร
            if (diff > 0.005) {
                trendIcon = '<span class="trend-arrow trend-up" title="กำลังเพิ่มขึ้น">↗</span>';
            } else if (diff < -0.005) {
                trendIcon = '<span class="trend-arrow trend-down" title="กำลังลดลง">↘</span>';
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="num-cell" style="color: #666;">
                ${dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
            </td>
            <td class="num-cell">
                ${dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
            </td>
            <td class="num-cell" style="font-size: 1.05em; font-weight: 600;">
                ${row.height.toFixed(2)} ${trendIcon}
            </td>
            <td>
                <span class="status-badge ${status.className}">
                    ${status.label}
                </span>
            </td>`;
        elements.dataTableBody.appendChild(tr);
    }

    function updateLatestInfo(data) {
        if (!data) return;
        const date = new Date(data.timestamp);
        elements.lastUpdated.textContent = `${date.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}`;

        const height = data.height;
        // คำนวณเปอร์เซ็นต์ (Limit ไว้ไม่ให้เกิน 0-100)
        let percentage = (height / config.maxHeight) * 100;
        percentage = Math.max(0, Math.min(100, percentage));

        elements.currentHeight.textContent = `${height.toFixed(2)} m`;
        elements.currentPercent.textContent = `${percentage.toFixed(1)} %`;

        const status = getStatus(height);

        // --- ส่วนที่เพิ่ม: อัปเดต Liquid Gauge ---
        const waveElement = document.getElementById('waveElement');
        if (waveElement) {
            // คำนวณตำแหน่ง Top: 100% คือน้ำแห้ง, 0% คือน้ำเต็ม
            // ต้องชดเชยค่าเล็กน้อยเพราะคลื่นมันหมุน
            const topPos = 100 - percentage;
            waveElement.style.top = `${topPos}%`;

            // เปลี่ยนสีน้ำตามสถานะ
            waveElement.className = 'liquid-wave'; // รีเซ็ตคลาสเดิม
            waveElement.classList.add(`status-${status.className}`); // ใส่สีตามสถานะ (high/normal/low)
        }
        // ------------------------------------

        elements.alertBox.className = 'status-alert';
        elements.alertBox.classList.add(`alert-${status.className}`);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";
        elements.alertBox.innerHTML = `${statusEmoji} ${status.label}`;

        elements.currentHeight.style.color = status.color;
        // ตัวเลข % ในวงกลม ไม่ต้องเปลี่ยนสีตาม status แล้ว เพราะสีน้ำเปลี่ยนแทน
        // elements.currentPercent.style.color = status.color; 
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

    class WaterChartManager {
        constructor(container) {
            this.container = container;
            this.chart = null;
        }

        create(data, floodedThreshold, droughtThreshold) {
            this.destroy();
            const style = getComputedStyle(document.documentElement);
            const cHigh = style.getPropertyValue('--high-color').trim() || '#dc3545';
            const cLow = style.getPropertyValue('--low-color').trim() || '#ffc107';
            const cAccent = style.getPropertyValue('--accent-color').trim() || '#F58220';

            // เช็คว่าเป็นหน้าจอมือถือหรือไม่
            const isMobile = window.innerWidth <= 768;

            const options = {
                chart: {
                    type: 'area',
                    height: '100%',
                    fontFamily: 'Prompt, sans-serif',
                    background: 'transparent',
                    toolbar: {
                        show: !isMobile, // ซ่อน Toolbar บนมือถือเพื่อความสะอาดตา
                        tools: { download: false }
                    },
                    zoom: {
                        enabled: !isMobile // *** สำคัญ: ปิด Zoom บนมือถือเพื่อให้ Scroll หน้าเว็บได้ไม่ติดขัด
                    },
                    animations: { enabled: false }, // ปิด Animation บนมือถือเพื่อ Performance
                    dropShadow: { enabled: true, top: 4, left: 0, blur: 4, opacity: 0.15 }
                },
                colors: [cAccent],
                series: [{ name: 'ระดับน้ำ', data: data }],
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 2.5, lineCap: 'round' },

                fill: {
                    type: "gradient",
                    gradient: { shade: 'light', shadeIntensity: 0.5, opacityFrom: 0.7, opacityTo: 0.2, stops: [0, 90, 100] }
                },

                // ลดขนาดจุด (Marker) บนมือถือ
                markers: {
                    size: 0,
                    strokeColors: '#fff',
                    strokeWidth: 2,
                    hover: { size: isMobile ? 0 : 6, sizeOffset: 3 }
                },

                tooltip: {
                    theme: 'light',
                    // บนมือถือ Tooltip จะติดตามนิ้วได้ดีขึ้นถ้า fixed
                    fixed: {
                        enabled: false,
                        position: 'topRight'
                    },
                    x: {
                        formatter: function (val) {
                            return new Date(val).toLocaleString('th-TH', {
                                day: 'numeric', month: 'short',
                                hour: '2-digit', minute: '2-digit'
                            });
                        }
                    },
                    y: { formatter: val => val.toFixed(2) + " ม." }
                },

                xaxis: {
                    type: 'datetime',
                    tooltip: { enabled: false },
                    axisBorder: { show: false },
                    axisTicks: { show: false },
                    crosshairs: { show: true, stroke: { color: '#b6b6b6', dashArray: 3 } },
                    tickAmount: isMobile ? 3 : 6, // ลดจำนวนขีดวันที่บนแกน X สำหรับมือถือ
                    labels: {
                        datetimeUTC: false,
                        style: { colors: '#999', fontFamily: 'Prompt, sans-serif' },
                        datetimeFormatter: {
                            year: 'yyyy',
                            month: 'MM/yyyy',
                            day: 'dd/MM',     // ย่อรูปแบบวันที่บนมือถือ
                            hour: 'HH:mm'
                        }
                    }
                },

                yaxis: {
                    min: 0, max: config.maxHeight,
                    tickAmount: 5,
                    labels: {
                        style: { colors: '#999', fontFamily: 'Prompt, sans-serif' },
                        formatter: val => val.toFixed(1)
                    }
                },
                grid: {
                    borderColor: 'rgba(0,0,0,0.06)',
                    strokeDashArray: 4,
                    padding: { right: isMobile ? 0 : 20, left: 10 } // ปรับ Padding
                },

                annotations: {
                    // ... (ใช้ Code Annotation เดิมของคุณได้เลยครับ ไม่ต้องแก้) ...
                    yaxis: [
                        { y: floodedThreshold, y2: config.maxHeight, fillColor: cHigh, opacity: 0.08 },
                        {
                            y: floodedThreshold, borderColor: cHigh,
                            label: {
                                text: 'น้ำท่วม',
                                position: 'right', textAnchor: 'end', offsetX: 0, offsetY: -10, borderRadius: 4, borderColor: cHigh,
                                style: { color: '#fff', background: cHigh, fontSize: '12px', fontWeight: 600, fontFamily: 'Prompt, sans-serif', padding: { left: 8, right: 8, top: 2, bottom: 2 } }
                            }
                        },
                        { y: 0, y2: droughtThreshold, fillColor: cLow, opacity: 0.12 },
                        {
                            y: droughtThreshold, borderColor: cLow,
                            label: {
                                text: 'น้ำแห้ง',
                                position: 'right', textAnchor: 'end', offsetX: 0, offsetY: 10, borderRadius: 4, borderColor: cLow,
                                style: { color: '#333', background: cLow, fontSize: '12px', fontWeight: 600, fontFamily: 'Prompt, sans-serif', padding: { left: 8, right: 8, top: 2, bottom: 2 } }
                            }
                        }
                    ]
                }
            };
            this.chart = new ApexCharts(this.container, options);
            this.chart.render();
        }

        update(data, floodedThreshold, droughtThreshold) {
        if (!this.chart) return;
        const style = getComputedStyle(document.documentElement);
        const cHigh = style.getPropertyValue('--high-color').trim() || '#dc3545';
        const cLow = style.getPropertyValue('--low-color').trim() || '#ffc107';

        this.chart.updateOptions({
            series: [{ data: data }],
            yaxis: { 
                min: 0, // 👉 [เพิ่มตรงนี้!] ล็อกแกน Y ให้เริ่มที่ 0 เสมอ
                max: config.maxHeight 
            },
            annotations: {
                yaxis: [
                    { y: floodedThreshold, y2: config.maxHeight, fillColor: cHigh, opacity: 0.08 },
                    {
                        y: floodedThreshold, borderColor: cHigh,
                        label: {
                            text: 'น้ำท่วม',
                            position: 'right', textAnchor: 'end', offsetX: 0, offsetY: -10, borderRadius: 4, borderColor: cHigh,
                            style: { color: '#fff', background: cHigh, fontSize: '12px', fontWeight: 600, fontFamily: 'Prompt, sans-serif', padding: { left: 8, right: 8, top: 2, bottom: 2 } }
                        }
                    },
                    { y: 0, y2: droughtThreshold, fillColor: cLow, opacity: 0.12 },
                    {
                        y: droughtThreshold, borderColor: cLow,
                        label: {
                            text: 'น้ำแห้ง',
                            position: 'right', textAnchor: 'end', offsetX: 0, offsetY: 10, borderRadius: 4, borderColor: cLow,
                            style: { color: '#333', background: cLow, fontSize: '12px', fontWeight: 600, fontFamily: 'Prompt, sans-serif', padding: { left: 8, right: 8, top: 2, bottom: 2 } }
                        }
                    }
                ]
            }
        });
    }

        destroy() { if (this.chart) this.chart.destroy(); }
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