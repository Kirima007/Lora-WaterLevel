document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const TANK_CONFIG = {
        'tank1': {
            name: 'บ่อข้างตึกโทร',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/1eQwqYfsLff8z5hsFMB2_cghDQ60zi8NAokpKibCP6S8/gviz/tq?sheet=Sheet1',
            maxHeight: 2,
            floodedThreshold: 1.5,
            droughtThreshold: 0.5,
            page: 'tank1.html',
            latitude: 13.727301,
            longitude: 100.776734,
        },
        'tank2': {
            name: 'บ่อโรงอาหาร A',
            sheetUrl: 'https://docs.google.com/spreadsheets/d/1fKmavCgosbDlrlbrkJjFRjR0GKZnPpTo8DAPlhPI5sk/gviz/tq?sheet=Sheet1',
            maxHeight: 3, // Will be updated dynamically if possible
            floodedThreshold: 2.5,
            droughtThreshold: 0.5,
            page: 'tank2.html',
            latitude: 13.726563,
            longitude: 100.776414,
        }
    };

    const overviewGrid = document.getElementById('overviewGrid');
    let map;
    const markers = {};
    let svgOverlay; // 💡 ADDED: For drawing lines
    const lines = {};   // 💡 ADDED: To store line elements

    // --- INITIALIZATION ---
    function init() {
        initMap();
        initSvgOverlay(); // 💡 ADDED: Initialize the SVG layer
        createAllTankCards();
        setupCardInteractions();
        fetchAllTankData();
        setInterval(fetchAllTankData, 300000); // Refresh every 5 minutes

        // 💡 ADDED: Event listeners to update lines on map/view changes
        map.on('zoomend moveend', updateLines);
        window.addEventListener('resize', updateLines);
        overviewGrid.addEventListener('scroll', updateLines);
    }

    // --- MAP INITIALIZATION ---
    function initMap() {
        map = L.map('map').setView([13.727, 100.776], 17); // Set initial view to KMITL
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }

    // 💡 ADDED: Function to create SVG layer for lines
    function initSvgOverlay() {
        svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgOverlay.id = 'line-overlay';
        document.body.appendChild(svgOverlay);
    }


    // --- DYNAMIC CARD & MARKER CREATION ---
    function createAllTankCards() {
        overviewGrid.innerHTML = ''; 
        for (const tankId in TANK_CONFIG) {
            const config = TANK_CONFIG[tankId];
            const cardHTML = `
                <a href="${config.page}" class="overview-card" id="card-${tankId}" data-tank-id="${tankId}">
                    <div class="overview-card-header">
                        <h2>${config.name}</h2>
                        <div class="overview-card-status" id="status-${tankId}">
                            <div class="loader"></div>
                        </div>
                    </div>
                    <div class="overview-card-metrics">
                        <div class="metric-item">
                            <span class="metric-label">ระดับน้ำปัจจุบัน</span>
                            <div class="metric-value" id="height-${tankId}">-</div>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">ปริมาณในบ่อ</span>
                            <div class="metric-value" id="percent-${tankId}">-</div>
                        </div>
                    </div>
                    <div class="overview-card-footer">
                        <p>อัปเดตล่าสุด: <span id="updated-${tankId}">-</span></p>
                        <span>คลิกเพื่อดูรายละเอียด →</span>
                    </div>
                </a>
            `;
            overviewGrid.innerHTML += cardHTML;

            // Create map marker
            const marker = L.marker([config.latitude, config.longitude]).addTo(map)
                .bindPopup(`<b>${config.name}</b>`);
            markers[tankId] = marker;

            // 💡 ADDED: Create line element for each card
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            svgOverlay.appendChild(line);
            lines[tankId] = line;
        }
    }
    
    // --- INTERACTIVITY SETUP ---
    function setupCardInteractions() {
        // Marker -> Card Interaction
        for (const tankId in markers) {
            markers[tankId].on('click', () => {
                const card = document.getElementById(`card-${tankId}`);
                // Remove highlight from other cards and add to the clicked one
                document.querySelectorAll('.overview-card').forEach(c => c.classList.remove('highlight'));
                card.classList.add('highlight');
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                updateLines(); // 💡 ADDED: Update lines to show the connection
            });
        }

        // Card -> Marker Interaction
        overviewGrid.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.overview-card');
            if (card) {
                const tankId = card.dataset.tankId;
                if (markers[tankId]) {
                    markers[tankId].openPopup();
                }
            }
        });
        overviewGrid.addEventListener('mouseout', (e) => {
             const card = e.target.closest('.overview-card');
             if (card) {
                const tankId = card.dataset.tankId;
                if (markers[tankId]) {
                    markers[tankId].closePopup();
                }
            }
        });
    }

    // --- DATA FETCHING AND RENDERING ---
    async function fetchAllTankData() {
        for (const tankId in TANK_CONFIG) {
            await fetchAndDisplayTankData(tankId, TANK_CONFIG[tankId]);
        }
        updateLines(); // 💡 ADDED: Initial line drawing after data fetch
    }

    async function fetchAndDisplayTankData(tankId, config) {
        try {
            // 💡 --- START MODIFICATION ---
            let query;
            if (tankId === 'tank2') {
                // สำหรับ tank2, ดึงคอลัมน์ config (J,K,L) และเรียงลำดับข้อมูลเพื่อหาแถวล่าสุด
                // เราไม่สามารถใช้ LIMIT 1 ได้ เพราะค่า config อาจอยู่ในแถวที่เก่ากว่า
                query = 'SELECT%20A,B,C,J,K,L%20ORDER%20BY%20A%20DESC,%20B%20DESC';
            } else {
                // สำหรับ tank อื่นๆ ใช้ query เดิมที่ optimize แล้ว
                query = 'SELECT%20A,B,C%20ORDER%20BY%20A%20DESC,%20B%20DESC%20LIMIT%201';
            }
            const url = config.sheetUrl + '&tq=' + query;
            // 💡 --- END MODIFICATION ---

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const text = await res.text();
            const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\)/);
            if (!match) throw new Error('Invalid response format');

            const json = JSON.parse(match[1]);
            const rows = json.table.rows;

            // 💡 --- START MODIFICATION ---
            // ตรวจสอบและอัปเดต config แบบไดนามิกสำหรับ tank2
            if (tankId === 'tank2' && rows.length > 0) {
                let lastTankDepth = null;
                let lastFlooded = null;
                let lastDrought = null;

                // วนค้นหาจากแถวล่างสุด (ข้อมูลเก่าสุด) ขึ้นมา หรือจากบนสุด (ใหม่สุด) ลงไปก็ได้
                // แต่วิธีที่แน่นอนที่สุดคือการวนจากท้ายตาราง (เหมือน app.js)
                for (let i = rows.length - 1; i >= 0; i--) {
                    const rowCells = rows[i].c;

                    // หมายเหตุ: index 3, 4, 5 คือ J, K, L จาก query
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
                        break; // เจอ config ครบแล้ว
                    }
                }

                // อัปเดตค่า config ใน TANK_CONFIG (ตัวแปร config คือ reference ไปยัง object นั้น)
                if (lastTankDepth !== null && !isNaN(lastTankDepth)) {
                    config.maxHeight = lastTankDepth;
                }
                if (lastFlooded !== null && !isNaN(lastFlooded)) {
                    config.floodedThreshold = lastFlooded;
                }
                if (lastDrought !== null && !isNaN(lastDrought)) {
                    config.droughtThreshold = lastDrought;
                }
            }
            // 💡 --- END MODIFICATION ---

            if (rows.length === 0) throw new Error('No data found');

            // ใช้แถวแรกสุด (rows[0]) เพราะเรา ORDER BY DESC มาแล้ว
            const latestRow = rows[0]; 
            const dateObj = latestRow.c[0]?.v ? parseGoogleDate(latestRow.c[0].v) : null;
            const timeObj = latestRow.c[1]?.v ? parseGoogleDate(latestRow.c[1].v) : null;
            const height = parseFloat(latestRow.c[2]?.v);

            if (!dateObj || !timeObj || isNaN(height)) throw new Error('Invalid data types in row');

            const timestamp = new Date(
                dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(),
                timeObj.getHours(), timeObj.getMinutes(), timeObj.getSeconds()
            ).getTime();

            // ส่ง config ที่ "อาจจะ" ถูกอัปเดตแล้ว ไปให้ updateCardUI
            updateCardUI(tankId, config, { timestamp, height }); 

        } catch (e) {
            console.error(`Error fetching data for ${tankId}:`, e);
            displayErrorOnCard(tankId, e.message);
        }
    }

    function updateCardUI(tankId, config, data) {
        const { timestamp, height } = data;
        const percentage = (height / config.maxHeight) * 100;
        const status = getStatus(height, config);
        const date = new Date(timestamp);

        const statusEl = document.getElementById(`status-${tankId}`);
        statusEl.className = 'overview-card-status'; // Reset classes
        statusEl.classList.add(`alert-${status.className}`);
        const statusEmoji = status.label === "น้ำท่วม" ? "🌊" : status.label === "น้ำแห้ง" ? "☀️" : "💧";
        statusEl.innerHTML = `<span>${statusEmoji} ${status.label}</span>`;
        
        // 💡 ADDED: Add status class to the card itself for border styling
        const cardEl = document.getElementById(`card-${tankId}`);
        cardEl.classList.remove('status-high', 'status-normal', 'status-low');
        cardEl.classList.add(`status-${status.className}`);

        document.getElementById(`height-${tankId}`).textContent = `${height.toFixed(2)} m`;
        document.getElementById(`percent-${tankId}`).textContent = `${percentage.toFixed(1)} %`;
        
        // --- 💡 ปรับบรรทัดนี้ ---
        // เพิ่ม dateStyle: 'medium' เพื่อแสดงวันที่ (เช่น 9 พ.ย. 2568, 15:08)
        document.getElementById(`updated-${tankId}`).textContent = date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    }
    
    function displayErrorOnCard(tankId, message) {
        const statusEl = document.getElementById(`status-${tankId}`);
        statusEl.className = 'overview-card-status alert-error';
        statusEl.innerHTML = `<span>⚠️ เกิดข้อผิดพลาด</span>`;
        document.getElementById(`height-${tankId}`).textContent = '-';
        document.getElementById(`percent-${tankId}`).textContent = '-';
        document.getElementById(`updated-${tankId}`).textContent = 'N/A';
    }

    // 💡 ADDED: Core function to draw/update all connecting lines
    function updateLines() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;
        const mapRect = mapContainer.getBoundingClientRect();

        for (const tankId in TANK_CONFIG) {
            const card = document.getElementById(`card-${tankId}`);
            const marker = markers[tankId];
            const line = lines[tankId];

            if (!card || !marker || !line) continue;

            // Show line only if the card is highlighted
            if (card.classList.contains('highlight')) {
                // Calculate card position (middle of its right edge)
                const cardRect = card.getBoundingClientRect();
                const x1 = cardRect.right;
                const y1 = cardRect.top + (cardRect.height / 2);

                // Calculate marker position on the screen
                const markerPoint = map.latLngToContainerPoint(marker.getLatLng());
                const x2 = mapRect.left + markerPoint.x;
                const y2 = mapRect.top + markerPoint.y;

                // Set line attributes
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


    // --- UTILITY FUNCTIONS ---
    function parseGoogleDate(str) {
        const m = str.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
        if (!m) return null;
        return new Date(m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0);
    }

    function getStatus(currentHeight, config) {
        if (currentHeight > config.floodedThreshold) {
            return { label: "น้ำท่วม", className: "high" };
        }
        if (currentHeight < config.droughtThreshold) {
            return { label: "น้ำแห้ง", className: "low" };
        }
        return { label: "ปกติ", className: "normal" };
    }

    init();
});