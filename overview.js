document.addEventListener('DOMContentLoaded', () => {

    let TANK_CONFIG = {}; 

    const overviewGrid = document.getElementById('overviewGrid');
    let map;
    const markers = {};
    let svgOverlay; 
    const lines = {};   

    // --- INITIALIZATION ---
    async function init() {
        initMap(); 
        initSvgOverlay();
        
        const statusBanner = document.createElement('div');
        statusBanner.id = 'connectionStatus';
        document.body.prepend(statusBanner);
        window.addEventListener('online', () => { 
            document.getElementById('connectionStatus').style.display = 'none';
            fetchAllTankData(); 
        });
        window.addEventListener('offline', () => showError('ขาดการเชื่อมต่ออินเทอร์เน็ต'));

        map.on('zoomend moveend', updateLines);
        window.addEventListener('resize', updateLines);
        overviewGrid.addEventListener('scroll', updateLines);

        try {
            // 1. Load Config
            const response = await fetch('config.json');
            if (!response.ok) throw new Error('Failed to load config.json');
            TANK_CONFIG = await response.json();

            // 2. Create Cards & Start
            createAllTankCards();
            setupCardInteractions();

            fetchAllTankData();
            setInterval(fetchAllTankData, 300000);

        } catch (e) {
            showError('Error loading configuration: ' + e.message);
        }
    }

    function initMap() {
        map = L.map('map').setView([13.727, 100.776], 17);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
    }

    function initSvgOverlay() {
        svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgOverlay.id = 'line-overlay';
        document.body.appendChild(svgOverlay);
    }

    function createAllTankCards() {
        overviewGrid.innerHTML = ''; 
        for (const tankId in TANK_CONFIG) {
            const config = TANK_CONFIG[tankId];
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
                        <span>คลิกเพื่อดูรายละเอียด →</span>
                    </div>
                </a>`;
            overviewGrid.innerHTML += cardHTML;
            const marker = L.marker([config.latitude, config.longitude]).addTo(map).bindPopup(`<b>${config.name}</b>`);
            markers[tankId] = marker;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            svgOverlay.appendChild(line);
            lines[tankId] = line;
        }
    }
    
    function setupCardInteractions() {
        for (const tankId in markers) {
            markers[tankId].on('click', () => {
                const card = document.getElementById(`card-${tankId}`);
                document.querySelectorAll('.overview-card').forEach(c => c.classList.remove('highlight'));
                card.classList.add('highlight');
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                updateLines();
            });
        }
        overviewGrid.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.overview-card');
            if (card && markers[card.dataset.tankId]) markers[card.dataset.tankId].openPopup();
        });
        overviewGrid.addEventListener('mouseout', (e) => {
             const card = e.target.closest('.overview-card');
             if (card && markers[card.dataset.tankId]) markers[card.dataset.tankId].closePopup();
        });
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
        updateLines();
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
        ['height', 'percent', 'updated'].forEach(key => {
            const el = document.getElementById(`${key}-${tankId}`);
            if(el) el.classList.remove('skeleton', 'skeleton-text');
        });
        const statusEl = document.getElementById(`status-${tankId}`);
        statusEl.className = 'overview-card-status'; 
        statusEl.classList.add(`alert-${status.className}`);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";
        statusEl.innerHTML = `<span>${statusEmoji} ${status.label}</span>`;
        const cardEl = document.getElementById(`card-${tankId}`);
        cardEl.classList.remove('status-high', 'status-normal', 'status-low');
        cardEl.classList.add(`status-${status.className}`);
        document.getElementById(`height-${tankId}`).textContent = `${height.toFixed(2)} m`;
        document.getElementById(`percent-${tankId}`).textContent = `${percentage.toFixed(1)} %`;
        document.getElementById(`updated-${tankId}`).textContent = date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    }
    
    function displayErrorOnCard(tankId) {
        const statusEl = document.getElementById(`status-${tankId}`);
        statusEl.className = 'overview-card-status alert-error';
        statusEl.innerHTML = `<span>⚠️ Error</span>`;
        ['height', 'percent', 'updated'].forEach(key => {
            document.getElementById(`${key}-${tankId}`).classList.remove('skeleton', 'skeleton-text');
        });
        document.getElementById(`height-${tankId}`).textContent = '-';
        document.getElementById(`percent-${tankId}`).textContent = '-';
        document.getElementById(`updated-${tankId}`).textContent = 'N/A';
    }
    
    function showError(message) {
        const banner = document.getElementById('connectionStatus');
        banner.textContent = `⚠️ ${message}`;
        banner.className = 'status-offline';
        banner.style.display = 'block';
    }

    function updateLines() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;
        const mapRect = mapContainer.getBoundingClientRect();
        for (const tankId in TANK_CONFIG) {
            const card = document.getElementById(`card-${tankId}`);
            const marker = markers[tankId];
            const line = lines[tankId];
            if (!card || !marker || !line) continue;
            if (card.classList.contains('highlight')) {
                const cardRect = card.getBoundingClientRect();
                const x1 = cardRect.right;
                const y1 = cardRect.top + (cardRect.height / 2);
                const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
                const x2 = mapRect.left + markerPoint.x;
                const y2 = mapRect.top + markerPoint.y;
                line.setAttribute('x1', x1);
                line.setAttribute('y1', y1);
                line.setAttribute('x2', x2);
                line.setAttribute('y2', y2);
                line.classList.add('visible');
            } else {
                line.classList.remove('visible');
            }
        }
    }

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