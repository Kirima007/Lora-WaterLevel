document.addEventListener('DOMContentLoaded', () => {

    let TANK_CONFIG = {}; 

    const overviewGrid = document.getElementById('overviewGrid');
    let map;
    const markers = {};

    // --- INITIALIZATION ---
    async function init() {
        initMap(); 
        setupSidebarToggle(); 
        
        const statusBanner = document.createElement('div');
        statusBanner.id = 'connectionStatus';
        document.body.prepend(statusBanner);
        window.addEventListener('online', () => { 
            document.getElementById('connectionStatus').style.display = 'none';
            fetchAllTankData(); 
        });
        window.addEventListener('offline', () => showError('ขาดการเชื่อมต่ออินเทอร์เน็ต'));

        try {
            const response = await fetch('config.json');
            if (!response.ok) throw new Error('Failed to load config.json');
            TANK_CONFIG = await response.json();

            createAllTankCards(); // สร้างการ์ดและหมุด
            setupCardInteractions();

            fetchAllTankData();
            setInterval(fetchAllTankData, 300000);

        } catch (e) {
            showError('Error loading configuration: ' + e.message);
        }
    }

    function initMap() {
        // ปรับ Zoom ให้เห็นภาพรวมชัดขึ้น
        map = L.map('map', { zoomControl: false }).setView([13.727, 100.776], 17);
        
        // ย้าย Zoom Control ไปขวาล่าง เพื่อไม่ให้บัง Sidebar
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // ใช้แผนที่โทนสีสว่าง หรือ Dark Mode ก็ได้ (ในที่นี้ใช้แบบเดิม)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    // ลบฟังก์ชัน initSvgOverlay() ออก

    function setupSidebarToggle() {
        const toggleBtn = document.getElementById('sidebarToggle');
        const container = document.querySelector('.overview-page-container');
        
        // สำหรับ Desktop (ปุ่มลูกศร)
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                container.classList.toggle('collapsed');
            });
        }

        // --- [แก้ตรงนี้] สำหรับ Mobile/iPad (กดที่หัวถาด) ---
        const sidebarHeader = document.querySelector('.sidebar .header');
        if (sidebarHeader) {
            sidebarHeader.addEventListener('click', () => {
                // ขยายเงื่อนไขให้ครอบคลุม iPad (เปลี่ยนจาก 768 เป็น 1180)
                if (window.innerWidth <= 1180) {
                    container.classList.toggle('collapsed');
                }
            });
        }
    }

    function createAllTankCards() {
        overviewGrid.innerHTML = ''; 
        for (const tankId in TANK_CONFIG) {
            const config = TANK_CONFIG[tankId];
            
            // 1. สร้าง Card ใน Sidebar (เหมือนเดิม)
            const cardHTML = `
                <a href="${config.page}" class="overview-card" id="card-${tankId}" data-tank-id="${tankId}">
                    <div class="overview-card-header">
                        <h2>${config.name}</h2>
                        <div class="overview-card-status" id="status-${tankId}"><div class="loader"></div></div>
                    </div>
                    <div class="overview-card-metrics">
                        <div class="metric-item"><span class="metric-label">ระดับน้ำปัจจุบัน</span><div class="metric-value skeleton skeleton-text" id="height-${tankId}">-</div></div>
                        <div class="metric-item"><span class="metric-label">ปริมาณในบ่อ</span><div class="metric-value skeleton skeleton-text" id="percent-${tankId}">-</div></div>
                    </div>
                    <div class="overview-card-footer">
                        <p>อัปเดตล่าสุด: <span id="updated-${tankId}" class="skeleton skeleton-text">-</span></p>
                    </div>
                </a>`;
            overviewGrid.innerHTML += cardHTML;

            // 2. [แก้] สร้าง Marker เป็น Pulsing Dot (DivIcon)
            // เริ่มต้นเป็นสีเทา (Loading) หรือสีปกติไปก่อน
            const pulsingIcon = createPulsingIcon('normal'); 

            const marker = L.marker([config.latitude, config.longitude], { icon: pulsingIcon }).addTo(map);
            
            // Popup (เหมือนเดิม)
            marker.bindPopup(createPopupHTML(config, null), {
                className: 'custom-popup',
                minWidth: 280,
                offset: [0, -10] // ขยับ Popup ขึ้นนิดหน่อยให้พ้นจุด
            });

            markers[tankId] = marker;
        }
    }

    function createPulsingIcon(statusClass) {
        return L.divIcon({
            className: 'custom-div-icon', // คลาสเปล่าๆ เพื่อลบ style default ของ Leaflet
            html: `
                <div class="pulsing-marker marker-${statusClass}">
                    <div class="ring"></div>
                    <div class="dot"></div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20] // จุดยึดอยู่ตรงกลางเป๊ะ
        });
    }
    
    function createPopupHTML(config, data) {
        if (!data) {
            return `
            <div class="popup-card">
                <div class="popup-header" style="background-color: #999;"><h3>${config.name}</h3></div>
                <div class="popup-body" style="text-align: center; padding: 20px;">
                    <div class="loader" style="border-color: #eee; border-top-color: #666;"></div>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 10px;">กำลังโหลดข้อมูล...</p>
                </div>
            </div>`;
        }
        const { height, percentage, status, statusEmoji } = data;
        return `
        <div class="popup-card">
            <div class="popup-header status-${status.className}">
                <h3>${config.name}</h3>
                <span class="popup-status-badge">${statusEmoji} ${status.label}</span>
            </div>
            <div class="popup-body">
                <div class="popup-metrics">
                    <div class="popup-metric-item">
                        <span class="popup-metric-value">${height.toFixed(2)} m</span>
                        <span class="popup-metric-label">ระดับน้ำ</span>
                    </div>
                    <div class="popup-metric-item" style="border-left: 1px solid #eee;">
                        <span class="popup-metric-value">${percentage.toFixed(1)} %</span>
                        <span class="popup-metric-label">ความจุ</span>
                    </div>
                </div>
                <div class="popup-footer">
                    <a href="${config.page}" class="popup-btn">ดูรายละเอียดทั้งหมด →</a>
                </div>
            </div>
        </div>`;
    }

    function setupCardInteractions() {
        for (const tankId in markers) {
            markers[tankId].on('click', () => {
                highlightSidebarCard(tankId);
            });
        }
        overviewGrid.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.overview-card');
            if (card && markers[card.dataset.tankId]) {
                markers[card.dataset.tankId].openPopup();
            }
        });
    }

    function highlightSidebarCard(tankId) {
        const card = document.getElementById(`card-${tankId}`);
        if(card) {
            document.querySelectorAll('.overview-card').forEach(c => c.classList.remove('highlight'));
            card.classList.add('highlight');
            
            const container = document.querySelector('.overview-page-container');
            if (!container.classList.contains('collapsed')) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            // ลบ updateLines() ออก
        }
    }

    async function fetchSheetData(baseUrl, sheetName, query) {
        const url = `${baseUrl}sheet=${sheetName}&tq=${query}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();
        const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
        if (!match) throw new Error('Invalid response format');
        return JSON.parse(match[1]).table.rows;
    }

    async function fetchAllTankData() {
        if (!navigator.onLine) { showError('รอการเชื่อมต่อ...'); return; }
        for (const tankId in TANK_CONFIG) {
            await fetchAndDisplayTankData(tankId, TANK_CONFIG[tankId]);
        }
        // ลบ updateLines() ออก
    }

    async function fetchAndDisplayTankData(tankId, config) {
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
                    }
                } catch (e) { console.warn(`[${tankId}] Failed to load config, using defaults.`); }
            }
            const query = 'SELECT%20A,B,C%20ORDER%20BY%20A%20DESC,%20B%20DESC%20LIMIT%201';
            const rows = await fetchSheetData(config.sheetUrl, config.dataSheetName, query);
            if (rows.length === 0) throw new Error('No data found');
            const latestRow = rows[0]; 
            const dateObj = latestRow.c[0]?.v ? parseGoogleDate(latestRow.c[0].v) : null;
            const timeObj = latestRow.c[1]?.v ? parseGoogleDate(latestRow.c[1].v) : null;
            const height = parseFloat(latestRow.c[2]?.v);
            if (!dateObj || !timeObj || isNaN(height)) throw new Error('Invalid data types');
            const timestamp = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds()).getTime();
            updateCardUI(tankId, config, { timestamp, height }); 
        } catch (e) {
            console.error(`Error fetching for ${tankId}:`, e);
            displayErrorOnCard(tankId);
        }
    }

    function updateCardUI(tankId, config, data) {
        const { timestamp, height } = data;
        const percentage = (height / config.maxHeight) * 100;
        const status = getStatus(height, config);
        const date = new Date(timestamp);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";

        ['height', 'percent', 'updated'].forEach(key => {
            const el = document.getElementById(`${key}-${tankId}`);
            if(el) el.classList.remove('skeleton', 'skeleton-text');
        });
        const statusEl = document.getElementById(`status-${tankId}`);
        statusEl.className = 'overview-card-status'; 
        statusEl.classList.add(`alert-${status.className}`);
        statusEl.innerHTML = `<span>${statusEmoji} ${status.label}</span>`;
        const cardEl = document.getElementById(`card-${tankId}`);
        cardEl.classList.remove('status-high', 'status-normal', 'status-low');
        cardEl.classList.add(`status-${status.className}`);
        document.getElementById(`height-${tankId}`).textContent = `${height.toFixed(2)} m`;
        document.getElementById(`percent-${tankId}`).textContent = `${percentage.toFixed(1)} %`;
        document.getElementById(`updated-${tankId}`).textContent = date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

        if (markers[tankId]) {
            const newIcon = createPulsingIcon(status.className); // ส่ง class: high, low, normal
            markers[tankId].setIcon(newIcon);
            
            // อัปเดต Popup content
            const popupContent = createPopupHTML(config, { height, percentage, status, statusEmoji });
            markers[tankId].setPopupContent(popupContent);
        }
    }
    
    function displayErrorOnCard(tankId) {
        const statusEl = document.getElementById(`status-${tankId}`);
        if (statusEl) {
            statusEl.className = 'overview-card-status alert-error';
            statusEl.innerHTML = `<span>⚠️ Error</span>`;
        }
        ['height', 'percent', 'updated'].forEach(key => {
            const el = document.getElementById(`${key}-${tankId}`);
            if(el) el.classList.remove('skeleton', 'skeleton-text');
        });
        const h = document.getElementById(`height-${tankId}`); if(h) h.textContent = '-';
        const p = document.getElementById(`percent-${tankId}`); if(p) p.textContent = '-';
        const u = document.getElementById(`updated-${tankId}`); if(u) u.textContent = 'N/A';
    }
    
    function showError(message) {
        const banner = document.getElementById('connectionStatus');
        banner.textContent = `⚠️ ${message}`;
        banner.className = 'status-offline';
        banner.style.display = 'block';
    }

    // ลบฟังก์ชัน updateLines() ออก

    function parseGoogleDate(str) {
        const m = str.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
        if (!m) return null;
        return new Date(m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0);
    }

    function getStatus(currentHeight, config) {
        if (currentHeight > config.floodedThreshold) return { label: "น้ำท่วม", className: "high" };
        if (currentHeight < config.droughtThreshold) return { label: "น้ำแห้ง", className: "low" };
        return { label: "ปกติ", className: "normal" };
    }

    init();
});