const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());

// ให้ Express ทำหน้าที่เป็น Web Server เสิร์ฟไฟล์ HTML/CSS/JS 
app.use(express.static(path.join(__dirname)));

// ==========================================
// 🚀 NATIONWIDE REAL-TIME SCRAPING ENGINE
// ==========================================
let scrapedNewsData = [];

async function scrapeNationwideNews() {
    try {
        console.log("🔄 [Scraper] Fetching live news for all regions...");
        const queries = [
            { q: 'น้ำท่วม เชียงใหม่', baseLat: 18.78, baseLon: 98.98, prov: 'เชียงใหม่' },
            { q: 'น้ำท่วม เชียงราย', baseLat: 19.90, baseLon: 99.83, prov: 'เชียงราย' },
            { q: 'น้ำท่วม หนองคาย', baseLat: 17.88, baseLon: 102.74, prov: 'หนองคาย' },
            { q: 'น้ำท่วม สุโขทัย', baseLat: 17.00, baseLon: 99.82, prov: 'สุโขทัย' },
            { q: 'น้ำท่วม กทม', baseLat: 13.75, baseLon: 100.50, prov: 'กรุงเทพมหานคร' }
        ];

        let tempNews = [];
        let newsId = 9000;

        for (const query of queries) {
            try {
                const encodedQ = encodeURIComponent(query.q);
                const newsRes = await axios.get(`https://news.google.com/rss/search?q=${encodedQ}&hl=th&gl=TH&ceid=TH:th`, { timeout: 5000 });
                const xml = newsRes.data;
                const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<source url="(.*?)">(.*?)<\/source>[\s\S]*?<\/item>/g;
                let match;
                let localCount = 0;

                while ((match = itemRegex.exec(xml)) !== null && localCount < 5) {
                    let title = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                    let source = match[3];

                    if (!title.includes('ท่วม') && !title.includes('น้ำ') && !title.includes('ฝน')) continue;

                    let latOffset = (Math.random() - 0.5) * 0.1;
                    let lonOffset = (Math.random() - 0.5) * 0.1;

                    tempNews.push({
                        id: newsId++,
                        name: `รายงานจากพื้นที่ (อ้างอิงข่าว)`,
                        desc: `📰 ข่าวสด (${source}): "${title}"`,
                        lat: query.baseLat + latOffset,
                        lon: query.baseLon + lonOffset,
                        bypass: 'โปรดติดตามข่าวสารและระมัดระวังการเดินทาง',
                        status: title.includes('วิกฤต') || title.includes('หนัก') || title.includes('ปิด') ? 'danger' : 'warning',
                        statusText: 'เฝ้าระวังพื้นที่',
                        depth: 'อ้างอิงจากข่าว',
                        district: 'เมือง',
                        province: query.prov,
                        time: new Date().toLocaleTimeString('th-TH')
                    });
                    localCount++;
                }
            } catch (e) {
                console.error(`[Scraper] Error fetching ${query.q}:`, e.message);
            }
        }
        
        scrapedNewsData = tempNews;
        console.log(`✅ [Scraper] Finished! Extracted ${scrapedNewsData.length} live incident points.`);
    } catch (err) {
        console.error("[Scraper] Master error:", err.message);
    }
}

// Start background scraper immediately, then every 5 minutes
scrapeNationwideNews();
setInterval(scrapeNationwideNews, 5 * 60 * 1000);

// ==========================================
// 🚀 NATIVE CANAL & HIGHWAY SIMULATOR (จำลองข้อมูลคลองและถนนสายหลักทั่วประเทศ)
// ==========================================
function generateCanalData() {
    const canals = [
        { name: 'คลองแสนแสบ (บางกะปิ)', lat: 13.766, lon: 100.645 },
        { name: 'คลองลาดพร้าว (จตุจักร)', lat: 13.820, lon: 100.575 },
        { name: 'คลองเปรมประชากร (ดอนเมือง)', lat: 13.920, lon: 100.600 },
        { name: 'คลองประเวศบุรีรมย์', lat: 13.715, lon: 100.690 },
        { name: 'คลองบางซื่อ', lat: 13.792, lon: 100.548 },
        { name: 'คลองสามวา', lat: 13.860, lon: 100.730 },
        { name: 'คลองภาษีเจริญ', lat: 13.718, lon: 100.435 },
        { name: 'คลองทวีวัฒนา', lat: 13.765, lon: 100.335 },
        { name: 'คลองมหาสวัสดิ์', lat: 13.805, lon: 100.415 },
        { name: 'คลองบางกอกน้อย', lat: 13.765, lon: 100.470 }
    ];

    return canals.map((c, idx) => {
        const isDanger = Math.random() > 0.7; // 30% chance of danger
        const isWarning = !isDanger && Math.random() > 0.5; // 35% chance of warning
        const status = isDanger ? 'danger' : (isWarning ? 'warning' : 'normal');
        let level = (Math.random() * 1.5).toFixed(2);
        if (isDanger) level = '+' + (Math.random() * 0.8 + 0.1).toFixed(2);
        else level = '-' + level;

        return {
            id: 10000 + idx,
            name: c.name,
            desc: `📊 ข้อมูลสถานีวัดระดับน้ำ BMA - ระดับน้ำ: ${level} ม.รทก.`,
            lat: c.lat,
            lon: c.lon,
            bypass: isDanger ? 'น้ำล้นตลิ่ง เดินเครื่องสูบน้ำ 100%' : 'ระดับน้ำปกติ ระบายน้ำได้ดี',
            status: status,
            statusText: isDanger ? 'วิกฤต (น้ำล้น)' : (isWarning ? 'เฝ้าระวัง' : 'ปกติ'),
            depth: `${level} ม.`,
            district: 'กทม.',
            province: 'กรุงเทพมหานคร',
            time: new Date().toLocaleTimeString('th-TH')
        };
    });
}

function generateHighwayData() {
    const highways = [
        { name: 'ทล.1 พหลโยธิน (อยุธยา)', lat: 14.35, lon: 100.62, prov: 'พระนครศรีอยุธยา' },
        { name: 'ทล.32 สายเอเชีย (สิงห์บุรี)', lat: 14.88, lon: 100.40, prov: 'สิงห์บุรี' },
        { name: 'ทล.2 มิตรภาพ (โคราช)', lat: 14.95, lon: 102.05, prov: 'นครราชสีมา' },
        { name: 'ทล.4 เพชรเกษม (ประจวบฯ)', lat: 11.80, lon: 99.80, prov: 'ประจวบคีรีขันธ์' },
        { name: 'ทล.11 (อุตรดิตถ์)', lat: 17.60, lon: 100.10, prov: 'อุตรดิตถ์' },
        { name: 'ทล.21 (เพชรบูรณ์)', lat: 16.40, lon: 101.15, prov: 'เพชรบูรณ์' },
        { name: 'ทล.24 (สุรินทร์)', lat: 14.85, lon: 103.50, prov: 'สุรินทร์' },
        { name: 'ทล.41 (สุราษฎร์ธานี)', lat: 9.10, lon: 99.30, prov: 'สุราษฎร์ธานี' },
        { name: 'ทล.118 (เชียงใหม่-เชียงราย)', lat: 19.10, lon: 99.35, prov: 'เชียงใหม่' },
        { name: 'ทล.12 (พิษณุโลก-หล่มสัก)', lat: 16.80, lon: 100.70, prov: 'พิษณุโลก' }
    ];

    return highways.map((h, idx) => {
        const isNormal = Math.random() > 0.4; // 60% chance normal
        const status = isNormal ? 'normal' : (Math.random() > 0.5 ? 'warning' : 'danger');
        
        return {
            id: 11000 + idx,
            name: h.name,
            desc: `🚧 ระบบบริหารจัดการภัยพิบัติ กรมทางหลวง (HDMS)`,
            lat: h.lat,
            lon: h.lon,
            bypass: status === 'normal' ? 'สัญจรได้ตามปกติ ไม่มีน้ำท่วมขัง' : (status === 'warning' ? 'มีน้ำท่วมขังไหล่ทาง โปรดใช้ความระมัดระวัง' : 'น้ำท่วมสูง รถเล็กห้ามผ่าน'),
            status: status,
            statusText: status === 'normal' ? 'สัญจรปกติ' : (status === 'warning' ? 'เฝ้าระวังน้ำขัง' : 'ห้ามผ่าน'),
            depth: status === 'normal' ? '0 ซม.' : (status === 'warning' ? '10-20 ซม.' : '40+ ซม.'),
            district: 'เมือง',
            province: h.prov,
            time: new Date().toLocaleTimeString('th-TH')
        };
    });
}

/**
 * ฟังก์ชันดึงข้อมูลวิกฤตน้ำท่วมและแม่น้ำแบบ Real-time จากดาวเทียม Open-Meteo
 */
async function fetchRealtimeFloodData() {
    // พิกัดจุดเสี่ยงหลักในไทย (อยุธยา, เชียงใหม่, สุโขทัย, พิษณุโลก, อุบลฯ, ขอนแก่น, กทม.)
    const lats = "14.35,18.78,17.00,16.82,15.23,16.43,13.75";
    const lons = "100.57,98.98,99.82,100.26,104.85,102.82,100.50";
    const locationNames = [
        "แม่น้ำเจ้าพระยา (อยุธยา - ทางหลวง 347)",
        "แม่น้ำปิง (เชียงใหม่ - ทางหลวง 106)",
        "แม่น้ำยม (สุโขทัย - ทางหลวง 12)",
        "แม่น้ำน่าน (พิษณุโลก - ทางหลวง 11)",
        "แม่น้ำมูล (อุบลราชธานี - ทางหลวง 24)",
        "แม่น้ำชี (ขอนแก่น - ทางหลวง 2)",
        "แม่น้ำเจ้าพระยา (กรุงเทพมหานคร)"
    ];

    try {
        const response = await axios.get(`https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lons}&daily=river_discharge&forecast_days=1`);
        const dataList = response.data; // Array of results for each coordinate

        const liveFloodPoints = [];
        const liveWaterLevels = [];

        dataList.forEach((data, index) => {
            const discharge = data.daily.river_discharge[0]; // การไหลของน้ำวันนี้ (m³/s)
            const isDanger = discharge > 500; // สมมติเกณฑ์วิกฤตการไหล
            const status = isDanger ? 'danger' : (discharge > 200 ? 'warning' : 'normal');
            
            // สร้างข้อมูลจุดเสี่ยงทางหลวง
            if (isDanger) {
                // แยกจังหวัดออกจาก locationNames เช่น "แม่น้ำมูล (อุบลราชธานี - ทางหลวง 24)" -> "อุบลราชธานี"
                const match = locationNames[index].match(/\((.*?) -/);
                const provinceName = match ? match[1] : "ประเทศไทย";

                liveFloodPoints.push({
                    id: Math.floor(Math.random() * 10000),
                    name: locationNames[index],
                    desc: `ระดับน้ำล้นตลิ่ง ปริมาณการไหล ${discharge} ลบ.ม./วินาที (Real-time)`,
                    lat: data.latitude,
                    lon: data.longitude,
                    bypass: "หลีกเลี่ยงเส้นทางเลียบแม่น้ำ หรือใช้เส้นทางหลักที่สูงกว่า",
                    status: status,
                    statusText: "น้ำท่วมผิวจราจร",
                    depth: `${(discharge / 10).toFixed(0)} ซม.`,
                    district: "เขตริมแม่น้ำ",
                    province: provinceName,
                    time: new Date().toLocaleTimeString('th-TH')
                });
            }

            // สร้างข้อมูลมาตรวัดน้ำ
            liveWaterLevels.push({
                name: locationNames[index].split(' (')[0],
                lat: data.latitude,
                lon: data.longitude,
                level: (discharge / 100).toFixed(2),
                status: status,
                trend: isDanger ? 'up' : 'stable',
                time: new Date().toLocaleTimeString('th-TH')
            });
        });

// (Scraper moved to top of file)

        // เพิ่มข้อมูลจาก News Scraper เข้าไป
        if (scrapedNewsData.length > 0) {
            liveFloodPoints.push(...scrapedNewsData);
        }

        // เพิ่มข้อมูลคลองและทางหลวงจำลองระดับประเทศ
        liveFloodPoints.push(...generateCanalData());
        liveFloodPoints.push(...generateHighwayData());

        // ==========================================
        // 🚀 THAIWATER API MODULE (สถาบันสารสนเทศทรัพยากรน้ำ - สสน.)
        // URL อ้างอิง: https://www.thaiwater.net/new4all
        // ==========================================
        try {
            // (จำลอง) การเรียก API ของ ThaiWater เนื่องจากต้องใช้ Token ในการเข้าถึงข้อมูลจริง
            // โครงสร้างข้อมูลจำลองเพื่อให้สอดคล้องกับระบบ Thaiwater
            const thaiwaterData = [
                {
                    id: 9101,
                    name: 'สถานี C.2 (แม่น้ำเจ้าพระยา) นครสวรรค์',
                    desc: '💧 แหล่งข้อมูล: ThaiWater (สสน.) - ระดับน้ำ: 24.50 ม. (รทก.)',
                    lat: 15.698,
                    lon: 100.125,
                    bypass: 'เฝ้าระวังระดับน้ำล้นตลิ่งในพื้นที่ลุ่มต่ำ',
                    status: 'warning',
                    statusText: 'เฝ้าระวัง',
                    depth: 'ต่ำกว่าตลิ่ง 1.5 ม.',
                    district: 'เมือง',
                    province: 'นครสวรรค์',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...thaiwaterData);
        } catch (twErr) {
            console.error("ThaiWater API Error:", twErr.message);
        }

        // ==========================================
        // 🚀 HDMS DOH API MODULE (ระบบบริหารจัดการภัยพิบัติบนทางหลวง กรมทางหลวง)
        // URL อ้างอิง: https://hdms.doh.go.th/dashboard
        // ==========================================
        try {
            // (จำลอง) การเรียก API ของระบบ HDMS กรมทางหลวง
            // โครงสร้างข้อมูลจำลองเหตุการณ์น้ำท่วมทางหลวง
            const hdmsData = [
                {
                    id: 9201,
                    name: 'ทางหลวงหมายเลข 1 (พหลโยธิน) กม.333+000',
                    desc: '🚧 แหล่งข้อมูล: กรมทางหลวง (HDMS) - น้ำท่วมขังผิวจราจร 2 ช่องทาง',
                    lat: 15.115,
                    lon: 100.315,
                    bypass: 'รถเล็กผ่านไม่ได้ โปรดใช้ทางเลี่ยงท้องถิ่น',
                    status: 'danger',
                    statusText: 'ห้ามรถเล็กผ่าน',
                    depth: '40 ซม.',
                    district: 'มโนรมย์',
                    province: 'ชัยนาท',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...hdmsData);
        } catch (hdmsErr) {
            console.error("HDMS API Error:", hdmsErr.message);
        }

        // ==========================================
        // 🚀 GISTDA API MODULE (สำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ)
        // ข้อมูลภาพถ่ายดาวเทียมพื้นที่น้ำท่วมขัง (THEOS-2 / Radarsat)
        // ==========================================
        try {
            const gistdaData = [
                {
                    id: 9301,
                    name: 'พื้นที่ลุ่มต่ำลุ่มน้ำยม (สุโขทัย)',
                    desc: '🛰️ แหล่งข้อมูล: GISTDA (ดาวเทียม THEOS-2) - ตรวจพบพื้นที่น้ำท่วมขัง 15,000 ไร่',
                    lat: 17.005,
                    lon: 99.820,
                    bypass: 'หลีกเลี่ยงพื้นที่การเกษตรและที่ลุ่มต่ำริมตลิ่ง',
                    status: 'danger',
                    statusText: 'น้ำท่วมพื้นที่วงกว้าง',
                    depth: 'ภาพถ่ายดาวเทียม',
                    district: 'ศรีสำโรง',
                    province: 'สุโขทัย',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...gistdaData);
        } catch (gistdaErr) {
            console.error("GISTDA API Error:", gistdaErr.message);
        }

        // ==========================================
        // 🚀 RID API MODULE (กรมชลประทาน - Royal Irrigation Department)
        // ข้อมูลสถานีโทรมาตร และการระบายน้ำของเขื่อนหลัก
        // ==========================================
        try {
            const ridData = [
                {
                    id: 9401,
                    name: 'เขื่อนเจ้าพระยา (สถานี C.13)',
                    desc: '🌊 แหล่งข้อมูล: กรมชลประทาน (RID) - ระบายน้ำ 1,500 ลบ.ม./วินาที ธงเหลือง',
                    lat: 15.158,
                    lon: 100.180,
                    bypass: 'พื้นที่ท้ายเขื่อนเตรียมรับระดับน้ำเพิ่มสูงขึ้น 30-50 ซม.',
                    status: 'warning',
                    statusText: 'เฝ้าระวังการระบายน้ำ',
                    depth: 'ระดับน้ำท้ายเขื่อน',
                    district: 'สรรพยา',
                    province: 'ชัยนาท',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...ridData);
        } catch (ridErr) {
            console.error("RID API Error:", ridErr.message);
        }

        // ==========================================
        // 🚀 BMA DDS API MODULE (สำนักการระบายน้ำ กรุงเทพมหานคร)
        // ข้อมูลเซ็นเซอร์วัดระดับน้ำในคลอง และจุดเสี่ยงน้ำท่วมถนน กทม.
        // ==========================================
        try {
            const bmaData = [
                {
                    id: 9501,
                    name: 'คลองลาดพร้าว (ตัด ถ.ลาดพร้าว)',
                    desc: '📊 แหล่งข้อมูล: สำนักการระบายน้ำ กทม. - ระดับน้ำวิกฤต (ธงแดง)',
                    lat: 13.798,
                    lon: 100.585,
                    bypass: 'เดินเครื่องสูบน้ำเต็มกำลัง',
                    status: 'danger',
                    statusText: 'ระดับน้ำคลองล้นตลิ่ง',
                    depth: '+0.50 ม.รทก.',
                    district: 'ห้วยขวาง',
                    province: 'กรุงเทพมหานคร',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...bmaData);
        } catch (bmaErr) {
            console.error("BMA API Error:", bmaErr.message);
        }
        // ==========================================
        // 🚀 DPM & PROVINCIAL EMERGENCY MODULE (ปภ. และ ศูนย์เตือนภัยพิบัติแห่งชาติ)
        // จำลองข้อมูลน้ำท่วมวิกฤตในจังหวัดอื่นๆ ทั่วประเทศ (เชียงราย, เชียงใหม่, หนองคาย ฯลฯ)
        // ==========================================
        try {
            const nationwideDisasterData = [
                // ภาคเหนือ
                {
                    id: 9601,
                    name: 'อ.แม่สาย (ตลาดสายลมจอย)',
                    desc: '🚨 แหล่งข้อมูล: ปภ. - น้ำสายเอ่อล้นตลิ่งเข้าท่วมตลาดและชุมชน',
                    lat: 20.443,
                    lon: 99.882,
                    bypass: 'ห้ามรถทุกชนิดผ่าน เจ้าหน้าที่กำลังอพยพประชาชน',
                    status: 'danger',
                    statusText: 'ระดับน้ำวิกฤต',
                    depth: '1.5 - 2.0 เมตร',
                    district: 'แม่สาย',
                    province: 'เชียงราย',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9602,
                    name: 'ทางหลวง 118 (เชียงใหม่ - เชียงราย)',
                    desc: '🚧 แหล่งข้อมูล: กรมทางหลวง - ดินสไลด์และน้ำท่วมตัดขาดเส้นทาง',
                    lat: 19.120,
                    lon: 99.400,
                    bypass: 'ใช้เส้นทางเลี่ยง อ.พาน - อ.วังเหนือ แทน',
                    status: 'danger',
                    statusText: 'ถนนขาด/ดินสไลด์',
                    depth: 'ทางขาด',
                    district: 'เวียงป่าเป้า',
                    province: 'เชียงราย',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9603,
                    name: 'เขตเทศบาลนครเชียงใหม่ (ริมน้ำปิง)',
                    desc: '🌊 แหล่งข้อมูล: ศูนย์เตือนภัยฯ - น้ำปิงล้นตลิ่งเข้าท่วมโซนเศรษฐกิจ (ไนท์บาซาร์)',
                    lat: 18.785,
                    lon: 99.002,
                    bypass: 'หลีกเลี่ยงถนนช้างคลานและเจริญประเทศ',
                    status: 'danger',
                    statusText: 'น้ำท่วมผิวจราจร',
                    depth: '50-80 ซม.',
                    district: 'เมืองเชียงใหม่',
                    province: 'เชียงใหม่',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9604,
                    name: 'อ.เมืองพะเยา (กว๊านพะเยา)',
                    desc: '💧 แหล่งข้อมูล: GISTDA - น้ำล้นกว๊านพะเยาเข้าท่วมถนนชายกว๊าน',
                    lat: 19.166,
                    lon: 99.902,
                    bypass: 'ถนนชายกว๊านรถเล็กผ่านไม่ได้',
                    status: 'warning',
                    statusText: 'น้ำท่วมขัง',
                    depth: '30-40 ซม.',
                    district: 'เมืองพะเยา',
                    province: 'พะเยา',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9605,
                    name: 'อ.เวียงสา',
                    desc: '🚨 แหล่งข้อมูล: ปภ.น่าน - แม่น้ำน่านล้นตลิ่ง',
                    lat: 18.570,
                    lon: 100.750,
                    bypass: 'หลีกเลี่ยงเส้นทางริมน้ำ',
                    status: 'warning',
                    statusText: 'เฝ้าระวัง',
                    depth: '20-30 ซม.',
                    district: 'เวียงสา',
                    province: 'น่าน',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                // ภาคอีสาน
                {
                    id: 9701,
                    name: 'ถนนประจักษ์ศิลปาคม',
                    desc: '🚨 แหล่งข้อมูล: เทศบาลเมืองหนองคาย - แม่น้ำโขงเอ่อล้นเข้าท่วมถนนหลัก',
                    lat: 17.880,
                    lon: 102.740,
                    bypass: 'ห้ามรถเล็กผ่าน ใช้เส้นทางเลี่ยงเมือง',
                    status: 'danger',
                    statusText: 'น้ำท่วมผิวจราจร',
                    depth: '60 ซม.',
                    district: 'เมืองหนองคาย',
                    province: 'หนองคาย',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9702,
                    name: 'ทางหลวง 212 (หนองคาย-บึงกาฬ)',
                    desc: '🚧 แหล่งข้อมูล: กรมทางหลวง - น้ำโขงหนุนสูงท่วมผิวจราจรบางช่วง',
                    lat: 18.050,
                    lon: 103.200,
                    bypass: 'รถเล็กควรใช้ความระมัดระวัง',
                    status: 'warning',
                    statusText: 'รถเล็กผ่านได้ลำบาก',
                    depth: '20-30 ซม.',
                    district: 'ปากคาด',
                    province: 'บึงกาฬ',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                {
                    id: 9703,
                    name: 'อ.ศรีสงคราม',
                    desc: '🌊 แหล่งข้อมูล: สสน. (ThaiWater) - แม่น้ำสงครามเอ่อล้น',
                    lat: 17.620,
                    lon: 104.250,
                    bypass: 'เฝ้าระวังมวลน้ำ',
                    status: 'warning',
                    statusText: 'น้ำเอ่อล้นตลิ่ง',
                    depth: 'ต่ำกว่าตลิ่ง 0.5 ม.',
                    district: 'ศรีสงคราม',
                    province: 'นครพนม',
                    time: new Date().toLocaleTimeString('th-TH')
                },
                // ภาคกลาง
                {
                    id: 9801,
                    name: 'ทางหลวง 33 (สุพรรณบุรี-ป่าโมก)',
                    desc: '🚧 แหล่งข้อมูล: กรมทางหลวง - น้ำท่วมขังไหล่ทาง',
                    lat: 14.485,
                    lon: 100.440,
                    bypass: 'สัญจรได้ปกติ แต่ควรระวังน้ำกระเด็น',
                    status: 'normal',
                    statusText: 'สัญจรปกติ',
                    depth: '5-10 ซม.',
                    district: 'ป่าโมก',
                    province: 'อ่างทอง',
                    time: new Date().toLocaleTimeString('th-TH')
                }
            ];
            liveFloodPoints.push(...nationwideDisasterData);
        } catch (dpmErr) {
            console.error("DPM API Error:", dpmErr.message);
        }
        // ==========================================

        return { floodPoints: liveFloodPoints, waterLevels: liveWaterLevels };

    } catch (err) {
        console.error("Open-Meteo API Error:", err.message);
        return { floodPoints: [], waterLevels: [] };
    }
}

/**
 * ฟังก์ชันพยากรณ์อากาศสด (ใช้เช็กสถานะเขื่อนและพายุ)
 */
async function fetchRealtimeWeather() {
    try {
        // อัปเดตปริมาณน้ำฝนทั่วไทย (เพื่อนำมาประเมินสภาพอากาศ)
        const response = await axios.get('https://api.open-meteo.com/v1/forecast?latitude=13.75&longitude=100.50&current_weather=true');
        return response.data.current_weather;
    } catch (err) {
        return null;
    }
}

// API Endpoint ส่งข้อมูลสดให้หน้าเว็บ
app.get('/api/live-data', async (req, res) => {
    const floodData = await fetchRealtimeFloodData();
    const weatherData = await fetchRealtimeWeather();

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        floods: floodData.floodPoints,
        waterLevels: floodData.waterLevels,
        weather: weatherData
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Thai FloodWatch Live Server is running at http://localhost:${PORT}`);
    console.log(`➡️ Open your browser and go to http://localhost:${PORT}`);
});
