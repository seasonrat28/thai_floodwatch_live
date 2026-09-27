/**
 * Thai FloodWatch Live - Application Logic (app.js)
 * ควบคุมการทำงานของแผนที่ Leaflet, เรดาร์ RainViewer, กราฟ Chart.js,
 * การดึงข้อมูลสภาพอากาศ Open-Meteo, ระบบค้นหา และระบบแจ้งเหตุอุทกภัย
 */

/* ==========================================
   1. State Variables & Global Configurations
   ========================================== */
let weatherChart = null;
let map = null;
let markersGroup = null;
let polygonsGroup = null;
let userLocationMarker = null;
let radarLayer = null;
let radarActive = true;
let polygonsActive = true;
let reportCoords = null;
let activeRegionFilter = 'all';
let activeRoadFilter = 'all';
let activeDamRegion = 'all';
let activeRoadScope = 'local';

// พิกัดจุดโฟกัสปัจจุบัน (เริ่มต้น: ภาพรวมกรุงเทพฯ และลุ่มน้ำเจ้าพระยา)
let currentCoords = {
    lat: 13.7563,
    lon: 100.5018,
    name: 'กรุงเทพมหานครและลุ่มน้ำเจ้าพระยา',
    province: 'กรุงเทพมหานคร',
    region: 'central'
};

// รายการรายงานสดจากภาคประชาชน (ดึงจาก ReportService)
let communityReports = [];

/* ==========================================
   2. ReportService (Firebase-Ready Architecture)
   ========================================== */
const ReportService = {
    STORAGE_KEY: 'thai_floodwatch_user_reports_v1',
    UPVOTES_KEY: 'thai_floodwatch_report_upvotes_v1',

    /**
     * ดึงรายงานทั้งหมด (ผสานข้อมูลตั้งต้นกับข้อมูลที่บันทึกไว้ และอัปเดตคะแนนโหวต)
     * รองรับการสลับไปใช้ Cloud Firestore / Realtime Database ในอนาคต
     */
    async getReports() {
        try {
            // [Firebase Ready Architecture]
            // ในอนาคตสามารถปลดคอมเมนต์เพื่อดึงข้อมูลจาก Cloud Firestore ได้ทันที:
            // const snapshot = await db.collection('flood_reports').orderBy('timestamp', 'desc').limit(50).get();
            // return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const stored = localStorage.getItem(this.STORAGE_KEY);
            const userReports = stored ? JSON.parse(stored) : [];
            const initialReports = (typeof defaultCommunityReports !== 'undefined') 
                ? JSON.parse(JSON.stringify(defaultCommunityReports)) 
                : [];

            const votesStored = localStorage.getItem(this.UPVOTES_KEY);
            const voteMap = votesStored ? JSON.parse(votesStored) : {};

            const merged = [...userReports, ...initialReports];
            merged.forEach(r => {
                if (voteMap[r.id] !== undefined) {
                    r.upvotes = voteMap[r.id];
                }
            });
            return merged;
        } catch (err) {
            console.warn('ReportService: ไม่สามารถโหลดข้อมูลจาก LocalStorage ได้:', err);
            return (typeof defaultCommunityReports !== 'undefined') ? [...defaultCommunityReports] : [];
        }
    },

    /**
     * บันทึกรายงานสถานการณ์น้ำท่วมใหม่
     */
    async saveReport(newReport) {
        try {
            // [Firebase Ready Architecture]
            // ในอนาคตเมื่อเชื่อมต่อ Firebase:
            // const docRef = await db.collection('flood_reports').add({
            //     ...newReport,
            //     createdAt: firebase.firestore.FieldValue.serverTimestamp()
            // });
            // return { success: true, id: docRef.id };

            const stored = localStorage.getItem(this.STORAGE_KEY);
            const userReports = stored ? JSON.parse(stored) : [];
            userReports.unshift(newReport);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userReports));
            return { success: true, id: newReport.id };
        } catch (err) {
            console.error('ReportService: บันทึกรายงานล้มเหลว:', err);
            return { success: false, error: err };
        }
    },

    /**
     * อัปเดตการโหวตยืนยันข้อมูลรายงาน
     */
    async upvoteReport(id, newVoteCount) {
        try {
            // [Firebase Ready Architecture]
            // await db.collection('flood_reports').doc(String(id)).update({
            //     upvotes: firebase.firestore.FieldValue.increment(1)
            // });

            const votesStored = localStorage.getItem(this.UPVOTES_KEY);
            const voteMap = votesStored ? JSON.parse(votesStored) : {};
            voteMap[id] = newVoteCount;
            localStorage.setItem(this.UPVOTES_KEY, JSON.stringify(voteMap));

            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const userReports = JSON.parse(stored);
                const item = userReports.find(r => r.id === id);
                if (item) {
                    item.upvotes = newVoteCount;
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userReports));
                }
            }
            return { success: true };
        } catch (err) {
            console.error('ReportService: อัปเดตโหวตล้มเหลว:', err);
            return { success: false, error: err };
        }
    }
};

/* ==========================================
   3. WeatherService & Geocoding Module
   ========================================== */
const WeatherService = {
    FORECAST_API_URL: 'https://api.open-meteo.com/v1/forecast',
    GEOCODING_API_URL: 'https://geocoding-api.open-meteo.com/v1/search',
    RADAR_API_URL: 'https://api.rainviewer.com/public/weather-maps.json',

    /**
     * ดึงข้อมูลพยากรณ์อากาศล่วงหน้าและข้อมูลปัจจุบันจาก Open-Meteo
     */
    async getForecast(lat, lon) {
        const url = `${this.FORECAST_API_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,surface_pressure,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FBangkok&forecast_days=6`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo error: ${res.statusText}`);
        return await res.json();
    },

    /**
     * ดึง Tile Layer ล่าสุดของเรดาร์ฝน RainViewer
     */
    async getLatestRadarTileUrl() {
        try {
            const response = await fetch(this.RADAR_API_URL);
            const data = await response.json();
            if (data?.radar?.past?.length > 0) {
                const latestRadar = data.radar.past[data.radar.past.length - 1];
                return `https://tilecache.rainviewer.com${latestRadar.path}/256/{z}/{x}/{y}/2/1_1.png`;
            }
        } catch (e) {
            console.warn('WeatherService: โหลด RainViewer radar ล้มเหลว:', e);
        }
        return null;
    },

    /**
     * ค้นหาพิกัดสถานที่/อำเภอ/จังหวัดผ่าน Nominatim (OpenStreetMap)
     */
    async searchLocations(keyword) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&accept-language=th&countrycodes=th&addressdetails=1&limit=10`;
            const res = await fetch(url, {
                headers: {
                    'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            if (!res.ok) return [];
            const data = await res.json();
            
            // แปลงรูปแบบข้อมูล Nominatim กลับไปให้ UI ตัวเดิมใช้งานได้
            return data.map(item => {
                const address = item.address || {};
                const province = address.province || address.state || address.city || address.town || 'ประเทศไทย';
                
                // ใช้ display_name ตัดให้สั้นลงถ้ามันยาวเกินไป เพื่อใช้แสดงในผลลัพธ์
                const shortDisplay = item.display_name.split(',').slice(0, 3).join(', ');
                
                return {
                    name: item.name || shortDisplay,
                    latitude: parseFloat(item.lat),
                    longitude: parseFloat(item.lon),
                    admin1: province,
                    country: address.country || 'TH'
                };
            });
        } catch (err) {
            console.warn('WeatherService: Geocoding ล้มเหลว:', err);
            return [];
        }
    },

    /**
     * แปลงรหัส WMO Weather Code เป็นข้อความภาษาไทยและไอคอน FontAwesome
     */
    getWeatherDetails(code) {
        if (code === 0) return { text: 'ท้องฟ้าแจ่มใส', icon: 'fa-sun' };
        if (code <= 3) return { text: 'มีเมฆเป็นส่วนมาก', icon: 'fa-cloud-sun' };
        if (code <= 48) return { text: 'มีหมอกหนา', icon: 'fa-smog' };
        if (code <= 55) return { text: 'ฝนปรอยๆ เล็กน้อย', icon: 'fa-cloud-rain' };
        if (code <= 65) return { text: 'ฝนตกปานกลาง', icon: 'fa-cloud-showers-heavy' };
        if (code <= 82) return { text: 'ฝนตกหนัก มีน้ำท่วมขัง', icon: 'fa-cloud-showers-water' };
        return { text: 'พายุฝนฟ้าคะนอง', icon: 'fa-cloud-bolt' };
    },

    /**
     * ข้อมูลสภาพอากาศจำลองฉุกเฉินกรณีออฟไลน์
     */
    getFallbackData(cityName = '') {
        const dummyTimes = Array.from({ length: 24 }, (_, i) => `2026-09-27T${String(i).padStart(2, '0')}:00`);
        const dummyRain = [0, 0, 1.2, 3.4, 8.2, 14.5, 9.1, 4.2, 1.0, 0, 0, 0, 2.1, 5.0, 7.8, 12.0, 6.2, 1.5, 0, 0, 0, 0, 0, 0];
        const dummyTemps = [27, 26, 26, 25, 25, 26, 28, 30, 31, 32, 32, 31, 30, 29, 28, 28, 27, 27, 27, 27, 26, 26, 26, 26];
        return {
            temp: 29,
            feelsLike: 32,
            rainVol: '12.4 mm',
            humidity: '82%',
            wind: '14 km/h',
            pressure: '1009 hPa',
            conditionText: 'ฝนตกเป็นแห่งๆ เฝ้าระวังน้ำขัง',
            times: dummyTimes,
            rain: dummyRain,
            temps: dummyTemps,
            dailyRainSum: 38.0,
            daily: {
                time: ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'],
                weather_code: [61, 80, 63, 51, 3],
                temperature_2m_max: [32, 31, 30, 31, 33],
                temperature_2m_min: [25, 25, 24, 25, 26],
                precipitation_sum: [38, 45, 60, 20, 5]
            }
        };
    }
};

/* ==========================================
   4. Core Functions & Event Handlers
   ========================================== */

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function filterByRegion(region) {
            activeRegionFilter = region;
            activeDamRegion = region;
            activeRoadScope = (region === 'all') ? 'all' : 'local';

            document.querySelectorAll('.region-chip').forEach(btn => {
                btn.className = 'region-chip px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl border border-slate-700 text-xs shrink-0 transition';
            });
            const activeBtn = document.getElementById('reg-' + region);
            if (activeBtn) {
                activeBtn.className = 'region-chip active px-3 py-1.5 bg-sky-600 text-white rounded-xl border border-sky-400 text-xs shrink-0 font-semibold shadow';
            }

            const target = regionCenters[region] || regionCenters['all'];
            currentCoords = { lat: target.lat, lon: target.lon, name: target.name, province: target.prov, region: region };

            document.getElementById('currentFocusName').textContent = target.name;
            updateRoadScopeUI();
            fetchWeatherData(target.lat, target.lon, target.name);
            renderRoads();
            renderDamCards();
            renderWaterways();
            renderMapPins();
            updateEmergencyTicker(region);

            if (map) {
                map.flyTo([target.lat, target.lon], target.zoom, { animate: true, duration: 1.2 });
            }
        }

        function selectCity(name, lat, lon, province = null, region = null) {
            if (!region) {
                if (lat > 16.5 && lon < 101.5) region = 'north';
                else if (lat < 11.5) region = 'south';
                else if (lon > 101.8 && lat > 14.5) region = 'isan';
                else if (lon > 101.0 && lat < 14.5 && lat > 12.0) region = 'east';
                else region = 'central';
            }

            if (!province) {
                province = name;
            }

            // Bind region and province so road alerts filter to this locality
            activeRegionFilter = region;
            activeDamRegion = region;
            activeRoadScope = 'local';

            currentCoords = { lat, lon, name, province, region };
            document.getElementById('currentFocusName').textContent = name;

            document.querySelectorAll('.region-chip').forEach(btn => {
                btn.className = 'region-chip px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl border border-slate-700 text-xs shrink-0 transition';
            });
            const regBtn = document.getElementById('reg-' + region);
            if (regBtn) {
                regBtn.className = 'region-chip active px-3 py-1.5 bg-sky-600 text-white rounded-xl border border-sky-400 text-xs shrink-0 font-semibold shadow';
            }

            updateRoadScopeUI();
            fetchWeatherData(lat, lon, name);
            renderRoads();
            renderDamCards();
            renderWaterways();
            renderMapPins();
            updateEmergencyTicker(region);

            if (map) {
                map.flyTo([lat, lon], 12, { animate: true, duration: 1.2 });
            }
            clearSearch();
            showToast(`เปลี่ยนจุดโฟกัสไปที่: ${name}`);
        }

        function setRoadScope(scope) {
            activeRoadScope = scope;
            updateRoadScopeUI();
            renderRoads();
        }

        function updateRoadScopeUI() {
            const btnLocal = document.getElementById('btnRoadScopeLocal');
            const btnAll = document.getElementById('btnRoadScopeAll');
            const localText = document.getElementById('roadScopeLocalText');

            const provLabel = currentCoords.province ? `จ.${currentCoords.province}` : (regionNames[currentCoords.region] || 'พื้นที่นี้');
            if (localText) {
                localText.textContent = `เฉพาะ${provLabel}`;
            }

            if (btnLocal && btnAll) {
                if (activeRoadScope === 'local') {
                    btnLocal.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white shadow transition flex items-center gap-1.5 touch-manipulation';
                    btnAll.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5 touch-manipulation';
                } else {
                    btnLocal.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5 touch-manipulation';
                    btnAll.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 text-white shadow transition flex items-center gap-1.5 touch-manipulation';
                }
            }
        }

        function updateEmergencyTicker(region) {
            const ticker = document.getElementById('tickerText');
            if (!ticker) return;

            ticker.innerHTML = tickerMessages[region] || tickerMessages['all'];
        }

        function renderDamCards() {
            const grid = document.getElementById('damCardsGrid');
            if (!grid) return;
            grid.innerHTML = '';

            const filteredDams = damDatabase.filter(d => {
                if (activeDamRegion === 'all') return true;
                return d.region === activeDamRegion;
            });

            const badge = document.getElementById('damTotalBadge');
            if (badge) badge.textContent = `${filteredDams.length} เขื่อน`;

            filteredDams.forEach(d => {
                let barColor = d.percent >= 90 ? 'bg-red-500' : (d.percent >= 80 ? 'bg-amber-500' : 'bg-sky-500');
                let badgeClass = d.status === 'danger' ? 'bg-red-500/20 text-red-400 border-red-500/30' : (d.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30');

                grid.innerHTML += `
                    <div class="glass-card rounded-2xl p-4 space-y-3 border border-slate-700/60 shadow hover:border-sky-500/50 transition">
                        <div class="flex justify-between items-start">
                            <div>
                                <h4 class="font-bold text-white text-sm">${d.name}</h4>
                                <span class="text-xs text-slate-400">จ.${d.province} • สายน้ำ: <strong class="text-sky-300 font-normal">${d.river}</strong></span>
                            </div>
                            <span class="text-[11px] font-semibold px-2 py-0.5 rounded border ${badgeClass}">${d.statusText}</span>
                        </div>
                        <div>
                            <div class="flex justify-between text-xs text-slate-300 mb-1 font-mono">
                                <span>ความจุน้ำกักเก็บ:</span>
                                <span class="font-bold text-white">${d.percent}%</span>
                            </div>
                            <div class="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                <div class="${barColor} h-2.5 rounded-full transition-all duration-1000" style="width: ${d.percent}%"></div>
                            </div>
                        </div>
                        <div class="flex justify-between text-[11px] text-slate-300 border-t border-slate-700/60 pt-2 font-mono">
                            <span>กักเก็บ: ${d.storage} ล้าน ลบ.ม.</span>
                            <span class="text-cyan-400 font-bold">ระบาย: ${d.discharge} ลบ.ม./วิ</span>
                        </div>
                        <div class="p-2 bg-slate-900/70 rounded-lg text-[11px] text-slate-300 border border-slate-800 leading-relaxed">
                            <span class="text-amber-400 font-semibold"><i class="fa-solid fa-water text-xs mr-1"></i> ผลกระทบ:</span> ${d.impact}
                        </div>
                        <div class="flex justify-end pt-1">
                            <button onclick="focusOnMapPin(${d.lat}, ${d.lon})" class="text-xs text-sky-400 hover:text-white flex items-center gap-1 font-medium transition">
                                <i class="fa-solid fa-location-dot"></i> ดูที่ตั้งบนแผนที่
                            </button>
                        </div>
                    </div>
                `;
            });
        }

        function filterDamsByRegion(reg) {
            activeDamRegion = reg;
            document.querySelectorAll('.dam-filter-btn').forEach(b => {
                b.className = 'dam-filter-btn px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium';
            });
            event.target.className = 'dam-filter-btn active px-3 py-1.5 rounded-lg bg-sky-600 text-white font-medium text-xs shadow';
            renderDamCards();
        }

        function renderRoads() {
            const grid = document.getElementById('roadAlertGrid');
            if (!grid) return;
            grid.innerHTML = '';

            const pointsWithDist = allFloodPoints.map(p => {
                const dist = calculateDistanceKm(currentCoords.lat, currentCoords.lon, p.lat, p.lon);
                return { ...p, distanceKm: dist };
            });

            // Sort by proximity to selected location (closest first)
            pointsWithDist.sort((a, b) => a.distanceKm - b.distanceKm);

            const filtered = pointsWithDist.filter(r => {
                // Status filter
                const matchStatus = activeRoadFilter === 'all' || r.status === activeRoadFilter;
                
                // Scope filter: local vs nationwide
                let matchScope = true;
                if (activeRoadScope === 'local') {
                    const isSameProvince = (r.province && currentCoords.province && (r.province.includes(currentCoords.province) || currentCoords.province.includes(r.province)));
                    const isNearby = (r.distanceKm <= 50);
                    matchScope = isSameProvince || isNearby;
                }

                return matchStatus && matchScope;
            });

            const topBadge = document.getElementById('roadCountBadgeTop');
            const mainBadge = document.getElementById('roadCountBadge');
            const subTitle = document.getElementById('roadSubtitle');

            if (topBadge) topBadge.textContent = `${filtered.length} จุด`;
            
            const areaLabel = currentCoords.province ? `จ.${currentCoords.province}` : (regionNames[currentCoords.region] || 'พื้นที่ที่เลือก');
            if (mainBadge) {
                if (activeRoadScope === 'local') {
                    mainBadge.textContent = `แสดง ${filtered.length} จุด (เฉพาะ${areaLabel} และพื้นที่ใกล้เคียง)`;
                } else {
                    mainBadge.textContent = `แสดง ${filtered.length} จุด (ทุกภาคทั่วประเทศ)`;
                }
            }

            if (subTitle) {
                if (activeRoadScope === 'local') {
                    subTitle.textContent = `รายงานจุดน้ำท่วมขังในเขต ${areaLabel} และพื้นที่ใกล้เคียง (รัศมี 50 กม.) เรียงจากจุดที่ใกล้คุณที่สุด`;
                } else {
                    subTitle.textContent = `รายงานจุดน้ำท่วมขังทั่วทุกภาคของประเทศไทย เรียงตามระยะห่างจาก ${areaLabel}`;
                }
            }

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-10 px-6 text-center glass-card rounded-2xl border border-emerald-500/30 bg-emerald-950/20 shadow-xl space-y-3">
                        <div class="inline-flex p-3 bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 mb-1">
                            <i class="fa-solid fa-circle-check text-3xl"></i>
                        </div>
                        <h4 class="text-white font-bold text-base sm:text-lg">ผิวจราจรในพื้นที่ ${areaLabel} สัญจรได้ตามปกติ</h4>
                        <p class="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
                            ยังไม่มีรายงานจุดน้ำท่วมขังวิกฤตหรือดินสไลด์ปิดเส้นทางหลวงสายหลักในพื้นที่นี้
                        </p>
                        <div class="pt-2">
                            <button onclick="setRoadScope('all')"
                                class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition shadow flex items-center gap-2 mx-auto touch-manipulation">
                                <i class="fa-solid fa-earth-asia"></i> ดูจุดวิกฤตทุกภาคทั่วประเทศ (${allFloodPoints.length} จุด)
                            </button>
                        </div>
                    </div>
                `;
                return;
            }

            filtered.forEach(road => {
                let borderClass = road.status === 'danger' ? 'border-l-red-500' : (road.status === 'warning' ? 'border-l-amber-500' : 'border-l-emerald-500');
                let badgeClass = road.status === 'danger' ? 'bg-red-500/20 text-red-400 border-red-500/30' : (road.status === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30');

                const distText = road.distanceKm < 1
                    ? `ห่าง ${(road.distanceKm * 1000).toFixed(0)} ม.`
                    : `ห่าง ${road.distanceKm.toFixed(1)} กม.`;

                const isVeryClose = road.distanceKm <= 50;

                grid.innerHTML += `
                    <div class="glass-card rounded-xl p-4 border-l-4 ${borderClass} flex flex-col justify-between hover:border-slate-500 transition shadow-lg space-y-3">
                        <div>
                            <div class="flex justify-between items-start gap-2 mb-2">
                                <h4 class="font-bold text-slate-100 text-sm leading-tight flex items-start gap-1.5">
                                    ${road.name}
                                </h4>
                                <span class="text-[11px] font-semibold px-2 py-0.5 rounded border ${badgeClass} shrink-0">${road.statusText}</span>
                            </div>
                            <div class="flex items-center justify-between text-xs text-slate-300 mb-2">
                                <div>
                                    <span class="text-slate-400"><i class="fa-solid fa-water text-sky-400 mr-1"></i> ระดับน้ำ:</span>
                                    <span class="font-bold text-white font-mono">${road.depth}</span>
                                </div>
                                <div class="flex items-center gap-1.5">
                                    ${isVeryClose ? `<span class="text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.5 rounded font-medium">ใกล้จุดคุณ</span>` : ''}
                                    <span class="text-[10px] text-sky-400 bg-sky-950/70 border border-sky-800/60 px-2 py-0.5 rounded-full font-mono">${distText}</span>
                                </div>
                            </div>
                            <p class="text-xs text-slate-300 leading-relaxed">${road.desc}</p>
                            
                            ${road.bypass ? `
                            <div class="mt-2.5 p-2 bg-slate-900/80 rounded-lg border border-slate-700/60 text-[11px] text-amber-300 flex items-start gap-1.5">
                                <i class="fa-solid fa-diamond-turn-right text-xs mt-0.5 text-amber-400 shrink-0"></i>
                                <span><strong>ทางเลี่ยง:</strong> ${road.bypass}</span>
                            </div>` : ''}
                        </div>
                        <div class="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-700/60 pt-2.5 mt-2">
                            <span><i class="fa-solid fa-location-dot text-slate-500 mr-1"></i> ${road.district}, ${road.province}</span>
                            <div class="flex items-center gap-1.5">
                                <span><i class="fa-regular fa-clock mr-1"></i> ${road.time}</span>
                                <button onclick="focusOnMapPin(${road.lat}, ${road.lon})" class="px-2 py-0.5 bg-slate-800 hover:bg-sky-600 hover:text-white rounded text-sky-400 transition" title="ดูจุดนี้บนแผนที่">
                                    <i class="fa-solid fa-location-crosshairs mr-1"></i> แผนที่
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        function filterRoads(status) {
            activeRoadFilter = status;
            document.querySelectorAll('.road-filter-btn').forEach(btn => {
                btn.className = 'road-filter-btn text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium border border-slate-700';
            });
            event.target.className = 'road-filter-btn active text-xs px-3 py-1.5 rounded-lg bg-sky-600 text-white font-medium border border-sky-500 shadow';
            renderRoads();
        }

        function renderWaterways() {
            const container = document.getElementById('allWaterwaysContainer');
            if (!container) return;
            container.innerHTML = '';

            const regionsToDisplay = activeRegionFilter === 'all'
                ? ['central', 'east', 'north', 'isan', 'south']
                : [activeRegionFilter];

            regionsToDisplay.forEach(regKey => {
                const list = waterwayDatabase[regKey];
                if (!list || list.length === 0) return;

                let sectionHtml = `
                    <div class="glass-card rounded-2xl p-5 border border-slate-700/70 space-y-3">
                        <div class="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
                            <h4 class="font-bold text-white text-sm flex items-center gap-2">
                                <i class="fa-solid fa-water text-sky-400"></i> ${regionNames[regKey]}
                            </h4>
                            <span class="text-[11px] text-slate-400 font-mono">${list.length} สายน้ำหลัก</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                `;

                list.forEach(c => {
                    let badgeBg = c.status === 'danger' ? 'bg-red-500/20 border-red-500/40 text-red-300' : (c.status === 'warning' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300');
                    sectionHtml += `
                        <div class="p-3 bg-slate-900/80 rounded-xl border border-slate-800 space-y-1.5">
                            <div class="flex justify-between items-center">
                                <span class="font-bold text-slate-100 text-xs">${c.name}</span>
                                <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeBg}">${c.statusText}</span>
                            </div>
                            <p class="text-[11px] text-slate-400 leading-snug">${c.desc}</p>
                        </div>
                    `;
                });

                sectionHtml += `</div></div>`;
                container.innerHTML += sectionHtml;
            });
        }

        function renderCommunityReports() {
            const container = document.getElementById('communityReportsList');
            const badge = document.getElementById('communityReportCount');
            if (badge) badge.textContent = communityReports.length;
            if (!container) return;

            container.innerHTML = '';
            communityReports.forEach(r => {
                let badgeClass = r.level === 'danger' ? 'bg-red-500/20 text-red-400 border-red-500/30' : (r.level === 'warning' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30');

                container.innerHTML += `
                    <div class="glass-card rounded-xl p-4 border border-slate-700/80 flex flex-col justify-between space-y-3 shadow-lg">
                        <div>
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <h4 class="font-bold text-white text-sm">${r.location}</h4>
                                    <span class="text-[11px] text-slate-400">${r.district}, ${r.province}</span>
                                </div>
                                <span class="text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeClass}">${r.levelText}</span>
                            </div>
                            <p class="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                                "${r.details}"
                            </p>
                        </div>
                        <div class="flex items-center justify-between pt-2 border-t border-slate-700/60 text-xs">
                            <span class="text-[11px] text-slate-400"><i class="fa-regular fa-clock mr-1"></i> ${r.time} โดย ${r.user}</span>
                            <div class="flex items-center gap-2">
                                <button onclick="upvoteReport(${r.id})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-slate-700 transition flex items-center gap-1 text-[11px]">
                                    <i class="fa-solid fa-thumbs-up"></i> ยืนยัน (${r.upvotes})
                                </button>
                                <button onclick="focusOnMapPin(${r.lat}, ${r.lon})" class="p-1 text-sky-400 hover:text-white" title="ดูบนแผนที่">
                                    <i class="fa-solid fa-map-pin"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        function initMap() {
            if (map) return;

            map = L.map('alertMap', {
                center: [currentCoords.lat, currentCoords.lon],
                zoom: 7,
                zoomControl: true
            });

            // OpenStreetMap High-Reliability Tile Layer (100% Free, No API key required)
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(map);

            polygonsGroup = L.layerGroup().addTo(map);
            markersGroup = L.layerGroup().addTo(map);

            loadRainViewerRadar();
            renderFloodPolygons();
            renderMapPins();
        }

        function renderFloodPolygons() {
            if (!polygonsGroup) return;
            polygonsGroup.clearLayers();

            floodZonePolygons.forEach(zone => {
                const polygon = L.polygon(zone.coordinates, {
                    color: zone.color,
                    weight: 2,
                    fillColor: zone.fillColor,
                    fillOpacity: zone.fillOpacity,
                    dashArray: zone.level === 'danger' ? null : '4, 4'
                }).addTo(polygonsGroup);

                polygon.bindPopup(`
                    <div class="text-xs space-y-1.5 max-w-xs">
                        <div class="flex items-center gap-1.5 font-bold text-sm text-white" style="color: ${zone.color};">
                            <i class="fa-solid fa-draw-polygon"></i> ${zone.name}
                        </div>
                        <div class="text-slate-300"><strong>ขอบเขตพื้นที่:</strong> ${zone.areaKm2} (จ.${zone.province})</div>
                        <p class="text-slate-200 text-[11px] leading-relaxed bg-slate-900/80 p-2 rounded border border-slate-700">${zone.desc}</p>
                        <div class="text-[10px] text-slate-400 flex justify-between pt-1">
                            <span>สถานะ: ${zone.level === 'danger' ? 'วิกฤตน้ำท่วมขัง' : 'พื้นที่เฝ้าระวัง/ทุ่งรับน้ำ'}</span>
                        </div>
                    </div>
                `);
            });
        }

        function renderMapPins() {
            if (!markersGroup) return;
            markersGroup.clearLayers();

            // 1. Current focus marker
            userLocationMarker = L.circleMarker([currentCoords.lat, currentCoords.lon], {
                radius: 9,
                fillColor: '#0284c7',
                color: '#ffffff',
                weight: 3,
                opacity: 1,
                fillOpacity: 1
            }).addTo(markersGroup);

            userLocationMarker.bindPopup(`
                <div class="text-xs p-1">
                    <strong class="text-sky-400 text-sm">${currentCoords.name}</strong><br>
                    <span class="text-slate-300">ตำแหน่งจุดโฟกัสตรวจวัดปัจจุบัน</span>
                </div>
            `);

            // 2. Strategic Dams Pins
            damDatabase.forEach(dam => {
                const damMarker = L.circleMarker([dam.lat, dam.lon], {
                    radius: 8,
                    fillColor: '#06b6d4',
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.95
                }).addTo(markersGroup);

                damMarker.bindPopup(`
                    <div class="text-xs space-y-1.5 max-w-xs">
                        <div class="font-bold text-sm text-cyan-400 flex items-center gap-1">
                            <i class="fa-solid fa-dam"></i> ${dam.name}
                        </div>
                        <div class="text-slate-200"><strong>กักเก็บ:</strong> ${dam.percent}% (${dam.storage} ล้าน ลบ.ม.)</div>
                        <div class="text-cyan-300 font-bold">ระบายน้ำ: ${dam.discharge} ลบ.ม./วิ</div>
                        <p class="text-slate-300 text-[11px]">${dam.impact}</p>
                    </div>
                `);
            });

            // 3. Road Hotspots Pins
            allFloodPoints.forEach(road => {
                const color = road.status === 'danger' ? '#ef4444' : (road.status === 'warning' ? '#f59e0b' : '#10b981');
                const marker = L.circleMarker([road.lat, road.lon], {
                    radius: road.status === 'danger' ? 8 : 6,
                    fillColor: color,
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                }).addTo(markersGroup);

                marker.bindPopup(`
                    <div class="text-xs space-y-1.5 max-w-xs">
                        <div class="font-bold text-sm text-white" style="color: ${color};">${road.name}</div>
                        <div class="text-slate-200"><strong>ระดับน้ำ:</strong> ${road.depth} (${road.statusText})</div>
                        <p class="text-slate-300 text-[11px] leading-relaxed">${road.desc}</p>
                        ${road.bypass ? `<div class="text-[10px] text-amber-300 bg-slate-900 p-1.5 rounded border border-slate-700"><strong>เลี่ยง:</strong> ${road.bypass}</div>` : ''}
                        <div class="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-700">
                            <span>📍 ${road.district}, ${road.province}</span>
                            <span>🕒 ${road.time}</span>
                        </div>
                    </div>
                `);
            });

            // 4. Community Reports
            communityReports.forEach(r => {
                const pin = L.circleMarker([r.lat, r.lon], {
                    radius: 7,
                    fillColor: '#10b981',
                    color: '#ffffff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.95
                }).addTo(markersGroup);

                pin.bindPopup(`
                    <div class="text-xs space-y-1 max-w-xs">
                        <div class="font-bold text-emerald-400"><i class="fa-solid fa-users mr-1"></i> ประชาชนรายงานสด</div>
                        <div class="font-bold text-white">${r.location}</div>
                        <p class="text-slate-300">${r.details}</p>
                        <div class="text-[10px] text-slate-400 pt-1 border-t border-slate-700 flex justify-between">
                            <span>🕒 ${r.time}</span>
                            <span>👍 ยืนยัน ${r.upvotes} คน</span>
                        </div>
                    </div>
                `);
            });
        }

        async function loadRainViewerRadar() {
            try {
                const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data = await response.json();
                if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
                    const latestRadar = data.radar.past[data.radar.past.length - 1];
                    const radarTileUrl = `https://tilecache.rainviewer.com${latestRadar.path}/256/{z}/{x}/{y}/2/1_1.png`;

                    if (radarLayer && map.hasLayer(radarLayer)) {
                        map.removeLayer(radarLayer);
                    }
                    radarLayer = L.tileLayer(radarTileUrl, {
                        opacity: 0.60,
                        zIndex: 100
                    });
                    if (radarActive) radarLayer.addTo(map);
                }
            } catch (err) {
                console.warn("Could not load RainViewer tile overlay:", err);
            }
        }

        function togglePolygonLayer() {
            polygonsActive = !polygonsActive;
            const statusText = document.getElementById('polyStatusText');
            if (statusText) statusText.textContent = polygonsActive ? 'เปิด' : 'ปิด';

            if (polygonsGroup && map) {
                if (polygonsActive) map.addLayer(polygonsGroup);
                else map.removeLayer(polygonsGroup);
            }
        }

        function toggleRadarLayer() {
            radarActive = !radarActive;
            const statusText = document.getElementById('radarStatusText');
            if (statusText) statusText.textContent = radarActive ? 'เปิด' : 'ปิด';

            if (radarLayer && map) {
                if (radarActive) map.addLayer(radarLayer);
                else map.removeLayer(radarLayer);
            }
        }

        function recenterMap() {
            if (map) {
                map.flyTo([currentCoords.lat, currentCoords.lon], 10, { animate: true, duration: 1 });
            }
        }

        function focusOnMapPin(lat, lon) {
            switchTab('mapTab');
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                    map.flyTo([lat, lon], 13, { animate: true, duration: 1.2 });
                }
            }, 150);
        }

        async function fetchWeatherData(lat, lon, cityName) {
            try {
                document.getElementById('currentLocationName').textContent = cityName;
                document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';

                const now = new Date();
                document.getElementById('currentDate').textContent = now.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                const data = await WeatherService.getForecast(lat, lon);

                const cur = data.current;
                document.getElementById('tempDisplay').textContent = `${Math.round(cur.temperature_2m)}°C`;
                document.getElementById('feelsLikeDisplay').textContent = `รู้สึกเหมือน ${Math.round(cur.apparent_temperature)}°C`;
                document.getElementById('rainVolume').textContent = `${cur.precipitation} mm`;
                document.getElementById('humidityDisplay').textContent = `${cur.relative_humidity_2m}%`;
                document.getElementById('windSpeedDisplay').textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
                document.getElementById('pressureDisplay').textContent = `${Math.round(cur.surface_pressure)} hPa`;

                const weatherInfo = WeatherService.getWeatherDetails(cur.weather_code);
                document.getElementById('weatherConditionText').textContent = weatherInfo.text;
                document.getElementById('weatherIcon').className = `fa-solid ${weatherInfo.icon} text-5xl text-sky-400 drop-shadow-lg mb-2`;

                updateFloodRiskBadge(cur.precipitation, data.daily.precipitation_sum[0], cityName);
                renderHourlyChart(data.hourly.time.slice(0, 24), data.hourly.precipitation.slice(0, 24), data.hourly.temperature_2m.slice(0, 24));
                renderDailyForecast(data.daily);

            } catch (err) {
                console.warn("Using offline fallback data for weather:", err);
                useFallbackWeather(cityName);
            }
        }

        function getWeatherDetails(code) {
            if (code === 0) return { text: 'ท้องฟ้าแจ่มใส', icon: 'fa-sun' };
            if (code <= 3) return { text: 'มีเมฆเป็นส่วนมาก', icon: 'fa-cloud-sun' };
            if (code <= 48) return { text: 'มีหมอกหนา', icon: 'fa-smog' };
            if (code <= 55) return { text: 'ฝนปรอยๆ เล็กน้อย', icon: 'fa-cloud-rain' };
            if (code <= 65) return { text: 'ฝนตกปานกลาง', icon: 'fa-cloud-showers-heavy' };
            if (code <= 82) return { text: 'ฝนตกหนัก มีน้ำท่วมขัง', icon: 'fa-cloud-showers-water' };
            return { text: 'พายุฝนฟ้าคะนอง', icon: 'fa-cloud-bolt' };
        }

        function useFallbackWeather(cityName) {
            document.getElementById('tempDisplay').textContent = '29°C';
            document.getElementById('feelsLikeDisplay').textContent = 'รู้สึกเหมือน 32°C';
            document.getElementById('rainVolume').textContent = '12.4 mm';
            document.getElementById('humidityDisplay').textContent = '82%';
            document.getElementById('windSpeedDisplay').textContent = '14 km/h';
            document.getElementById('pressureDisplay').textContent = '1009 hPa';
            document.getElementById('weatherConditionText').textContent = 'ฝนตกเป็นแห่งๆ เฝ้าระวังน้ำขัง';

            const dummyTimes = Array.from({ length: 24 }, (_, i) => `2026-09-27T${String(i).padStart(2, '0')}:00`);
            const dummyRain = [0, 0, 1.2, 3.4, 8.2, 14.5, 9.1, 4.2, 1.0, 0, 0, 0, 2.1, 5.0, 7.8, 12.0, 6.2, 1.5, 0, 0, 0, 0, 0, 0];
            const dummyTemps = [27, 26, 26, 25, 25, 26, 28, 30, 31, 32, 32, 31, 30, 29, 28, 28, 27, 27, 27, 27, 26, 26, 26, 26];

            renderHourlyChart(dummyTimes, dummyRain, dummyTemps);
            updateFloodRiskBadge(12.4, 38.0, cityName);
        }

        function renderHourlyChart(times, rain, temps) {
            const canvas = document.getElementById('hourlyRainChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const labels = times.map(t => t.substring(11, 16));

            if (weatherChart) weatherChart.destroy();

            weatherChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'ปริมาณฝน (มม.)',
                            data: rain,
                            backgroundColor: 'rgba(56, 189, 248, 0.65)',
                            borderColor: '#38bdf8',
                            borderWidth: 1,
                            borderRadius: 4,
                            yAxisID: 'yRain'
                        },
                        {
                            type: 'line',
                            label: 'อุณหภูมิ (°C)',
                            data: temps,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            borderWidth: 2,
                            tension: 0.35,
                            pointRadius: 2,
                            yAxisID: 'yTemp'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { color: '#94a3b8', font: { family: 'Kanit', size: 10 } },
                            grid: { display: false }
                        },
                        yRain: {
                            type: 'linear',
                            position: 'left',
                            ticks: { color: '#38bdf8', font: { family: 'Kanit', size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.06)' },
                            title: { display: true, text: 'ฝน (mm)', color: '#38bdf8', font: { size: 10 } }
                        },
                        yTemp: {
                            type: 'linear',
                            position: 'right',
                            ticks: { color: '#f59e0b', font: { family: 'Kanit', size: 10 } },
                            grid: { display: false },
                            title: { display: true, text: 'อุณหภูมิ (°C)', color: '#f59e0b', font: { size: 10 } }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: '#cbd5e1', font: { family: 'Kanit', size: 11 } }
                        }
                    }
                }
            });
        }

        function renderDailyForecast(daily) {
            const container = document.getElementById('dailyForecastContainer');
            if (!container || !daily || !daily.time) return;
            container.innerHTML = '';

            for (let i = 1; i <= 5; i++) {
                if (!daily.time[i]) break;
                const date = new Date(daily.time[i]);
                const dayName = date.toLocaleDateString('th-TH', { weekday: 'short' });
                const maxTemp = Math.round(daily.temperature_2m_max[i]);
                const minTemp = Math.round(daily.temperature_2m_min[i]);
                const rainSum = daily.precipitation_sum ? Math.round(daily.precipitation_sum[i]) : 0;

                container.innerHTML += `
                    <div class="glass-card rounded-xl p-1.5 sm:p-2 text-center flex flex-col justify-between min-w-0">
                        <span class="text-[11px] sm:text-xs text-slate-300 font-medium truncate">${dayName}</span>
                        <i class="fa-solid fa-cloud-sun-rain text-sky-400 my-1 sm:my-1.5 text-sm sm:text-base"></i>
                        <span class="text-[10px] sm:text-xs font-bold text-white whitespace-nowrap">${maxTemp}° / <span class="text-slate-400 font-normal">${minTemp}°</span></span>
                        <span class="text-[9px] sm:text-[10px] text-cyan-400 mt-0.5 whitespace-nowrap">${rainSum} mm</span>
                    </div>
                `;
            }
        }

        function updateFloodRiskBadge(currentRain, dailySum, cityName) {
            const card = document.getElementById('riskLevelCard');
            const iconBox = document.getElementById('riskLevelIconBox');
            const title = document.getElementById('riskLevelTitle');
            const sub = document.getElementById('riskLevelSub');

            const nearbyDangers = allFloodPoints.filter(p =>
                p.status === 'danger' &&
                calculateDistanceKm(currentCoords.lat, currentCoords.lon, p.lat, p.lon) <= 30
            );

            if (nearbyDangers.length > 0 || currentRain > 15 || dailySum > 45) {
                card.className = 'bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 flex items-center justify-between';
                iconBox.className = 'p-2.5 bg-red-500/20 text-red-400 rounded-xl shrink-0';
                title.className = 'text-xs text-red-300 font-bold';
                title.textContent = `การประเมินความเสี่ยง: วิกฤตน้ำท่วมขัง (${nearbyDangers.length} จุดใกล้เคียง)`;
                sub.textContent = nearbyDangers.length > 0
                    ? `พบจุดน้ำท่วมสูงในพื้นที่ (${nearbyDangers[0].name.slice(0, 32)}...)`
                    : 'ปริมาณฝนสะสมสูง ดินชุ่มน้ำ เฝ้าระวังน้ำท่วมขังฉับพลัน';
            } else if (currentRain > 3 || dailySum > 15) {
                card.className = 'bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between';
                iconBox.className = 'p-2.5 bg-amber-500/20 text-amber-400 rounded-xl shrink-0';
                title.className = 'text-xs text-amber-300 font-bold';
                title.textContent = 'การประเมินความเสี่ยง: เฝ้าระวังน้ำรอระบาย';
                sub.textContent = 'มีฝนตกต่อเนื่อง อาจมีน้ำขังในจุดลุ่มต่ำและผิวจราจรเลนซ้าย';
            } else {
                card.className = 'bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between';
                iconBox.className = 'p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0';
                title.className = 'text-xs text-emerald-300 font-bold';
                title.textContent = 'การประเมินความเสี่ยง: สัญจรปกติ';
                sub.textContent = 'สภาพผิวจราจรแห้ง การระบายน้ำในลุ่มน้ำยังคล่องตัวดี';
            }
        }

        function switchTab(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.classList.remove('text-sky-400', 'border-sky-400', 'active', 'font-semibold');
                btn.classList.add('text-slate-400', 'border-transparent');
            });

            const activeTab = document.getElementById(tabId);
            const activeBtn = document.getElementById('tab-' + tabId);
            if (activeTab && activeBtn) {
                activeTab.classList.remove('hidden');
                activeBtn.classList.add('text-sky-400', 'border-sky-400', 'active', 'font-semibold');
                activeBtn.classList.remove('text-slate-400', 'border-transparent');
            }

            if (tabId === 'mapTab' && map) {
                setTimeout(() => map.invalidateSize(), 200);
            }
        }

        function refreshData() {
            const icon = document.getElementById('refreshIcon');
            if (icon) icon.classList.add('animate-spin');
            fetchWeatherData(currentCoords.lat, currentCoords.lon, currentCoords.name);
            loadRainViewerRadar();
            showToast("อัปเดตข้อมูลเรดาร์และสถานการณ์น้ำล่าสุดเรียบร้อยแล้ว");
            setTimeout(() => {
                if (icon) icon.classList.remove('animate-spin');
            }, 1000);
        }

        function getUserLocation() {
            if (navigator.geolocation) {
                showToast("กำลังค้นหาพิกัด GPS อุปกรณ์ของคุณ...");
                navigator.geolocation.getCurrentPosition(
                    pos => {
                        const lat = pos.coords.latitude;
                        const lon = pos.coords.longitude;
                        let guessedRegion = 'central';
                        let guessedProv = 'ตำแหน่ง GPS ของคุณ';
                        if (lat > 16.5) guessedRegion = 'north';
                        else if (lat < 11.5) guessedRegion = 'south';
                        else if (lon > 102.0) guessedRegion = 'isan';
                        else if (lon > 101.1 && lat < 14.5 && lat > 13.0) guessedRegion = 'east';

                        selectCity('ตำแหน่ง GPS ของคุณ', lat, lon, guessedProv, guessedRegion);
                        showToast("ระบุพิกัด GPS สำเร็จ และปรับปรุงข้อมูลจุดเสี่ยงรอบตัวคุณแล้ว");
                    },
                    () => {
                        showToast("ไม่สามารถเข้าถึงพิกัด GPS ได้ กรุณาอนุญาตการเข้าถึง", false);
                    }
                );
            } else {
                showToast("อุปกรณ์ไม่รองรับการระบุตำแหน่ง GPS", false);
            }
        }

        function getGPSForReport() {
            const text = document.getElementById('gpsReportText');
            if (navigator.geolocation) {
                text.textContent = "กำลังดึงพิกัด...";
                navigator.geolocation.getCurrentPosition(
                    pos => {
                        reportCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                        text.textContent = `ระบุพิกัดแล้ว (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
                        showToast("ระบุพิกัดจุดแจ้งเหตุสำเร็จ");
                    },
                    () => {
                        text.textContent = "ไม่สามารถดึงพิกัดได้";
                        showToast("ไม่สามารถดึงพิกัด GPS ได้ กรุณาอนุญาตสิทธิ์", false);
                    }
                );
            }
        }

        function openReportModal() {
            document.getElementById('reportModal').classList.remove('hidden');
        }

        function closeReportModal() {
            document.getElementById('reportModal').classList.add('hidden');
        }

                async function handleReportSubmit(e) {
            e.preventDefault();
            
            // --- [ANTI-SPAM SYSTEM] ระบบ Rate Limiting ป้องกันการส่งข้อมูลถี่เกินไป ---
            const LAST_REPORT_TIME_KEY = 'thai_floodwatch_last_submit_time';
            const lastSubmit = localStorage.getItem(LAST_REPORT_TIME_KEY);
            const nowTimestamp = Date.now();
            
            if (lastSubmit) {
                const timePassed = nowTimestamp - parseInt(lastSubmit, 10);
                const cooldownPeriod = 60 * 1000; // ตั้งค่า Cooldown ไว้ที่ 60 วินาที
                
                if (timePassed < cooldownPeriod) {
                    const secondsLeft = Math.ceil((cooldownPeriod - timePassed) / 1000);
                    showToast(`โปรดรออีก ${secondsLeft} วินาทีก่อนส่งรายงานฉบับถัดไป เพื่อป้องกันระบบสแปม`, false);
                    return;
                }
            }

            const location = document.getElementById('reportLocation').value.trim();
            const district = document.getElementById('reportDistrict').value.trim();
            const province = document.getElementById('reportProvince').value.trim();
            const level = document.getElementById('reportLevel').value;
            const details = document.getElementById('reportDetails').value.trim();

            // ระบบป้องกันฟิลด์ว่าง
            if (!location || !district || !province) {
                showToast("กรุณากรอกข้อมูลสถานที่ อำเภอ และจังหวัดให้ครบถ้วน", false);
                return;
            }

            const targetLat = reportCoords ? reportCoords.lat : currentCoords.lat;
            const targetLon = reportCoords ? reportCoords.lon : currentCoords.lon;

            // --- [VALIDATION] ตรวจสอบขอบเขตพิกัดพิกัด GPS ให้อยู่ในขอบเขตประเทศไทยจริง ---
            if (targetLat < 5.5 || targetLat > 20.5 || targetLon < 97.0 || targetLon > 106.0) {
                showToast("พิกัด GPS ไม่ถูกต้องหรืออยู่นอกขอบเขตประเทศไทย", false);
                return;
            }

            const levelTexts = {
                'danger': 'วิกฤต (15-30+ ซม.)',
                'warning': 'เฝ้าระวัง (5-15 ซม.)',
                'normal': 'น้ำลดแล้ว / ปกติ'
            };

            const newReport = {
                id: nowTimestamp,
                user: 'คุณ (ผู้ใช้งานสด)',
                location: location,
                district: district,
                province: province,
                level: level,
                levelText: levelTexts[level],
                details: details || 'ไม่มีรายละเอียดเพิ่มเติม',
                time: 'เมื่อสักครู่',
                lat: targetLat,
                lon: targetLon,
                upvotes: 1
            };

            // บันทึกรายงานเข้าสู่ State
            communityReports.unshift(newReport);
            
            // บันทึกลง LocalStorage ผ่านโครงสร้าง Firebase-Ready Architecture
            if (typeof ReportService !== 'undefined') {
                await ReportService.saveReport(newReport);
            }
            renderCommunityReports();
            renderMapPins();

            closeReportModal();
            document.getElementById('reportForm').reset();
            reportCoords = null;
            document.getElementById('gpsReportText').textContent = "ดึงพิกัดปัจจุบัน";

            // บันทึกเวลาส่งล่าสุดเพื่อเปิดใช้งานการสกัดกั้นในรอบถัดไป
            localStorage.setItem(LAST_REPORT_TIME_KEY, nowTimestamp.toString());

            // --- QUICK LINK GENERATION FEATURE ---
            const shareParams = new URLSearchParams({
                lat: targetLat.toString(),
                lon: targetLon.toString(),
                loc: location,
                lvl: level,
                det: details
            }).toString();
            const shareUrl = `${window.location.origin}${window.location.pathname}?${shareParams}`;
            
            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast("ส่งรายงานสำเร็จ! และคัดลอกลิงก์ปักหมุดฉุกเฉินให้แล้ว ส่งต่อเข้า LINE/Discord ได้เลย!");
            }).catch(() => {
                showToast("ส่งรายงานสดสำเร็จ และปักหมุดลงบนแผนที่แล้ว ขอบคุณที่ร่วมแบ่งปันข้อมูล!");
            });

            switchTab('communityTab');
        }

        function upvoteReport(id) {
            const target = communityReports.find(r => r.id === id);
            if (target) {
                target.upvotes += 1;
                renderCommunityReports();
                showToast("ขอบคุณที่ช่วยยืนยันความถูกต้องของข้อมูล");
            }
        }

        function showToast(msg, isSuccess = true) {
            const toast = document.getElementById('toastMessage');
            const icon = document.getElementById('toastIcon');
            const text = document.getElementById('toastText');
            if (!toast) return;

            text.textContent = msg;
            icon.className = isSuccess ? 'fa-solid fa-circle-check text-emerald-400 text-base' : 'fa-solid fa-circle-exclamation text-red-400 text-base';

            toast.classList.remove('hidden');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 3500);
        }

        function clearSearch() {
            const searchInput = document.getElementById('searchInput');
            const clearSearchBtn = document.getElementById('clearSearchBtn');
            const searchDropdown = document.getElementById('searchDropdown');
            if (searchInput) searchInput.value = '';
            if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
            if (searchDropdown) searchDropdown.classList.add('hidden');
        }

        let geocodeDebounceTimer = null;

        async function queryGeocodingApi(keyword) {
            return await WeatherService.searchLocations(keyword);
        }

        document.addEventListener('DOMContentLoaded', () => {
            const searchInput = document.getElementById('searchInput');
            const searchDropdown = document.getElementById('searchDropdown');
            const clearSearchBtn = document.getElementById('clearSearchBtn');

            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.trim().toLowerCase();
                    if (!query) {
                        clearSearch();
                        return;
                    }

                    if (clearSearchBtn) clearSearchBtn.classList.remove('hidden');

                    // 1. Instant local matching
                    const localMatches = searchCities.filter(c =>
                        c.name.toLowerCase().includes(query) ||
                        c.province.toLowerCase().includes(query)
                    );

                    renderSearchResults(localMatches, query);

                    // 2. Real-time Live Geocoding API (searches any district/subdistrict in Thailand)
                    clearTimeout(geocodeDebounceTimer);
                    geocodeDebounceTimer = setTimeout(async () => {
                        if (query.length >= 2) {
                            const apiResults = await queryGeocodingApi(query);
                            if (apiResults && apiResults.length > 0) {
                                const formattedApi = apiResults.map(item => ({
                                    name: `${item.name} (${item.admin1 || item.country || ''})`,
                                    lat: item.latitude,
                                    lon: item.longitude,
                                    province: item.admin1 || item.name,
                                    region: null,
                                    isApiResult: true
                                }));

                                const combined = [...localMatches];
                                formattedApi.forEach(apiItem => {
                                    if (!combined.some(c => c.name.toLowerCase().includes(apiItem.name.toLowerCase()))) {
                                        combined.push(apiItem);
                                    }
                                });
                                renderSearchResults(combined, query);
                            }
                        }
                    }, 350);
                });

                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const firstItem = searchDropdown.querySelector('.search-result-row');
                        if (firstItem) firstItem.click();
                    }
                });
            }

            function renderSearchResults(items, query) {
                if (!searchDropdown) return;
                searchDropdown.innerHTML = '';

                if (items.length > 0) {
                    items.slice(0, 10).forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'search-result-row px-4 py-2.5 text-xs text-slate-200 hover:bg-sky-600 cursor-pointer flex items-center justify-between border-b border-slate-800 last:border-b-0 transition';
                        row.innerHTML = `
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-location-dot text-sky-400"></i>
                                <span class="font-medium text-slate-100">${item.name}</span>
                            </div>
                            <span class="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">${item.province}</span>
                        `;
                        row.onclick = () => selectCity(item.name, item.lat, item.lon, item.province, item.region);
                        searchDropdown.appendChild(row);
                    });
                    searchDropdown.classList.remove('hidden');
                } else {
                    searchDropdown.innerHTML = `
                        <div class="px-4 py-4 text-xs text-slate-400 text-center">
                            <i class="fa-solid fa-magnifying-glass-location text-sky-400 mb-1 text-base"></i>
                            <div>กำลังค้นหา "${query}" ทั่วประเทศ...</div>
                        </div>
                    `;
                    searchDropdown.classList.remove('hidden');
                }
            }

            document.addEventListener('click', (e) => {
                if (searchInput && searchDropdown && !searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
                    searchDropdown.classList.add('hidden');
                }
            });

            // Window resize & orientation handling for responsive Leaflet map
            window.addEventListener('resize', () => {
                if (map) map.invalidateSize();
            });

            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    if (map) map.invalidateSize();
                }, 250);
            });

            // Modal light dismiss on backdrop click
            const reportModal = document.getElementById('reportModal');
            if (reportModal) {
                reportModal.addEventListener('click', (e) => {
                    if (e.target === reportModal) closeReportModal();
                });
            }

            // Keyboard accessibility (Escape closes modal & search)
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeReportModal();
                    clearSearch();
                }
            });

            // Initialize entire dashboard
            fetchLiveDamData();
            initMap();
            renderDamCards();
            renderRoads();
            renderWaterways();
            renderCommunityReports();
            fetchWeatherData(currentCoords.lat, currentCoords.lon, currentCoords.name);
        });
    

/* ==========================================
   5. Explicit Window Scope Bindings
   ========================================== */
window.calculateDistanceKm = calculateDistanceKm;
window.filterByRegion = filterByRegion;
window.selectCity = selectCity;
window.updateEmergencyTicker = updateEmergencyTicker;
window.renderDamCards = renderDamCards;
window.filterDamsByRegion = filterDamsByRegion;
window.renderRoads = renderRoads;
window.setRoadScope = setRoadScope;
window.updateRoadScopeUI = updateRoadScopeUI;
window.filterRoads = filterRoads;
window.renderWaterways = renderWaterways;
window.renderCommunityReports = renderCommunityReports;
window.initMap = initMap;
window.renderFloodPolygons = renderFloodPolygons;
window.renderMapPins = renderMapPins;
window.togglePolygonLayer = togglePolygonLayer;
window.toggleRadarLayer = toggleRadarLayer;
window.recenterMap = recenterMap;
window.focusOnMapPin = focusOnMapPin;
window.fetchWeatherData = fetchWeatherData;
window.switchTab = switchTab;
window.refreshData = refreshData;
window.getUserLocation = getUserLocation;
window.getGPSForReport = getGPSForReport;
window.openReportModal = openReportModal;
window.closeReportModal = closeReportModal;
window.handleReportSubmit = handleReportSubmit;
window.upvoteReport = upvoteReport;
window.showToast = showToast;
window.clearSearch = clearSearch;
window.ReportService = ReportService;
window.WeatherService = WeatherService;


// --- Live Dam Data Integration ---

const GISTDA_API_KEY = 'CWVhuWdxVNGw0TK54Q7tqAV02jVgxh9xZEHwc0IO440O83VLxISoswFHD2FmL4HC';

async function fetchLiveRoadFloodData() {
    try {
        console.log('Attempting to fetch road flood data from GISTDA API...');
        // ดึงข้อมูลพื้นที่และจุดน้ำท่วมอัปเดตรายวันจาก GISTDA Gateway
        const endpoint = `https://api-gateway.gistda.or.th/api/2.0/resources/gi-service/v1.0/disasters/flood-extent-1day?api_key=${GISTDA_API_KEY}`;
        
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn(`GISTDA API returned ${response.status} - Fallback to local database.`);
            return;
        }

        const jsonResult = await response.json();
        console.log('GISTDA Road Flood API Success:', jsonResult);
        
        // ตรวจสอบโครงสร้างข้อมูลและทำการแมปข้อมูลจริงเข้ากับจุดเสี่ยงในระบบ (Dynamic Data Mapping)
        if (jsonResult && Array.isArray(jsonResult.features)) {
            const livePoints = jsonResult.features.map((feature, index) => {
                const props = feature.properties || {};
                const coords = feature.geometry ? feature.geometry.coordinates : null;
                
                return {
                    id: 500 + index, // รัน ID ต่อจากข้อมูล Static เดิม
                    name: props.location_name || props.road_name || 'พบพื้นที่น้ำท่วมขังตรวจพบโดยดาวเทียม',
                    province: props.province_th || 'ไม่ระบุจังหวัด',
                    district: props.district_th || 'ไม่ระบุอำเภอ',
                    region: props.region || 'central',
                    status: 'danger',
                    statusText: 'ท่วมขังวิกฤต',
                    depth: props.flood_depth ? `${props.flood_depth} ซม.` : '15-30 ซม.',
                    lat: coords && coords[1] ? coords[1] : currentCoords.lat,
                    lon: coords && coords[0] ? coords[0] : currentCoords.lon,
                    desc: props.description || `ดาวเทียม GISTDA ตรวจพบขอบเขตพื้นที่น้ำท่วมขังบริเวณนี้ ข้อมูลอัปเดตล่าสุดรายวัน`,
                    time: 'อัปเดตสดจากดาวเทียม',
                    bypass: props.bypass_route || 'โปรดสัญจรด้วยความระมัดระวังสูงสุดและหลีกเลี่ยงเส้นทางลุ่มต่ำ'
                };
            });

            if (livePoints.length > 0) {
                // ผสานข้อมูลจริงจาก API เข้ากับข้อมูลจำลองในฐานข้อมูลเดิม
                allFloodPoints.push(...livePoints);
                renderRoads();
                if (typeof renderMapPins === 'function') renderMapPins();
                console.log(`Successfully integrated ${livePoints.length} live flood points from GISTDA.`);
            }
        }
        
    } catch (e) {
        console.warn('GISTDA API Fetch Error (CORS, Network or Key expired):', e);
        // ระบบจะทำงานต่อด้วย Local Data อัตโนมัติโดยไม่ทำให้ตัวแอปพลิเคชันหลักล่ม
    }
}

async function fetchLiveDamData() {
    try {
        const response = await fetch('https://app.rid.go.th/reservoir/api/dam/public');
        if (!response.ok) return;
        const data = await response.json();
        
        let updated = false;
        (data.data || []).forEach(regionData => {
            if (regionData.dam && Array.isArray(regionData.dam)) {
                regionData.dam.forEach(damApi => {
                    const searchName = damApi.name.replace('เขื่อน', '').trim();
                    let foundDam = damDatabase.find(d => d.name.includes(searchName));
                    if (foundDam) {
                        foundDam.percent = damApi.percent_storage;
                        foundDam.storage = `ความจุน้ำ ${damApi.volume.toFixed(2)} ล้าน ลบ.ม. (ระบาย ${damApi.outflow !== null ? damApi.outflow : 0} ลบ.ม./วินาที)`;
                        
                        if (foundDam.percent >= 80) {
                            foundDam.status = 'danger';
                            foundDam.statusText = 'วิกฤต/ต้องเฝ้าระวัง';
                        } else if (foundDam.percent >= 60) {
                            foundDam.status = 'warning';
                            foundDam.statusText = 'ระดับน้ำมาก/เฝ้าระวัง';
                        } else {
                            foundDam.status = 'normal';
                            foundDam.statusText = 'ปกติ';
                        }
                        updated = true;
                    }
                });
            }
        });
        
        if (updated) {
            renderDamCards();
            if (typeof renderMapPins === 'function') renderMapPins();
        }
    } catch (e) {
        console.error('Failed to fetch live dam data', e);
    }
}
window.fetchLiveDamData = fetchLiveDamData;


// --- Live Visitor Simulation ---
// ใช้จำลองผู้เข้าชมแบบเรียลไทม์จนกว่าจะเชื่อมต่อกับ Firebase Realtime Database
function simulateLiveVisitors() {
    const liveEl = document.getElementById('visitorOnlineCount') || document.getElementById('live-visitors');
    if (!liveEl) return;
    
    let baseUsers = Math.floor(Math.random() * 15) + 10; // 10-25
    liveEl.textContent = baseUsers;
    
    setInterval(() => {
        const change = Math.random() > 0.5 ? 1 : -1;
        const shouldChange = Math.random() > 0.3;
        
        if (shouldChange) {
            baseUsers += change;
            if (baseUsers < 3) baseUsers = 3;
            if (baseUsers > 45) baseUsers = 45;
            
            // Animation effect
            liveEl.style.opacity = '0.3';
            setTimeout(() => {
                liveEl.textContent = baseUsers;
                liveEl.style.opacity = '1';
            }, 300);
        }
    }, 5000);
}

// Start simulation on load
document.addEventListener('DOMContentLoaded', () => {
    simulateLiveVisitors();
});
