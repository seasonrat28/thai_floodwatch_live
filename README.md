# 🌊 Thai FloodWatch Live

**แพลตฟอร์มเฝ้าระวังและติดตามสถานการณ์น้ำท่วมประเทศไทยแบบ Real-time**
ผสานข้อมูลดาวเทียมสดจาก GISTDA, ระดับน้ำในเขื่อนจากกรมชลประทาน (RID), เรดาร์ฝนสด และระบบรายงานจุดน้ำท่วมจากภาคประชาชน (Crowdsourcing) เข้าไว้ด้วยกันในหน้าจอเดียว

🔗 **Live Demo:** [https://seasonrat28.github.io/thai_floodwatch_live/](https://seasonrat28.github.io/thai_floodwatch_live/)

---

## 🎯 ฟีเจอร์หลัก (Key Features)

### 🛰️ การเชื่อมต่อข้อมูลสด (Live Data Integrations)
* **GISTDA API:** ดึงข้อมูลพิกัดพื้นที่ลุ่มต่ำที่ดาวเทียมตรวจพบน้ำท่วมขังแบบอัตโนมัติ (Flood Extent)
* **RID (กรมชลประทาน):** อัปเดตปริมาตรน้ำกักเก็บและการระบายน้ำของเขื่อนหลักแบบ Real-time 
* **Open-Meteo & RainViewer:** รายงานพยากรณ์อากาศล่วงหน้า พร้อมเลเยอร์เรดาร์ฝนแบบเคลื่อนไหวบนแผนที่

### 🗺️ แผนที่เชิงโต้ตอบ (Interactive Map)
* ใช้ **Leaflet.js** ในการแสดงผลแผนที่ความเร็วสูง
* **Layer Controls:** สามารถเปิด-ปิดเลเยอร์แสดงผลบนแผนที่ได้อย่างอิสระ (จุดรายงานประชาชน, ข้อมูลดาวเทียม GISTDA, ทางหลวง, เขื่อน)
* การจัดเรียงหมุดสี (Color-coded Pins) เพื่อระบุระดับความรุนแรงของสถานการณ์น้ำท่วม (เขียว, ส้ม, แดง)

### 📣 ระบบรายงานจากภาคประชาชน (Community Crowdsourcing)
* ผู้ใช้สามารถใช้ GPS บนมือถือเพื่อรายงานจุดน้ำท่วมขัง พร้อมระบุระดับความลึกและรายละเอียด
* **Anti-Spam & Rate Limiting:** ป้องกันการสแปมรายงานด้วยระบบหน่วงเวลา (Cooldown) 60 วินาที
* **Emergency URL Sharing:** ระบบสร้างลิงก์สำหรับแชร์พิกัดฉุกเฉิน (URL Parameters) เมื่อส่งรายงานสำเร็จ สามารถนำลิงก์ไปแชร์ต่อใน LINE/Facebook/Discord ได้ทันที เมื่อมีคนกดลิงก์ ระบบจะดึงพิกัดและปักหมุดฉุกเฉินลงบนแผนที่ให้อัตโนมัติ (พร้อมระบบ Auto-clean URL ป้องกันการรีเฟรชซ้ำ)

### 💻 ประสบการณ์ผู้ใช้งาน (UX/UI)
* พัฒนาด้วย **Tailwind CSS** ดีไซน์โมเดิร์นแบบ Glassmorphism (Dark Mode)
* **Hybrid Visitor Widget:** ระบบแสดงผลจำนวนผู้เข้าชมแบบ Real-time ผสมผสาน Animation ให้ดูมีชีวิตชีวา
* **SEO & Open Graph:** รองรับการแชร์บนโซเชียลมีเดีย พร้อมแสดงรูป Preview, Title และ Description อย่างถูกต้อง

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

* **Frontend:** HTML5, JavaScript (Vanilla), Tailwind CSS
* **Map Engine:** Leaflet.js, OpenStreetMap
* **Charts & Icons:** Chart.js, Font Awesome 6
* **APIs:** 
  * GISTDA (Flood Extents)
  * กรมชลประทาน - RID (Dam Storage)
  * Open-Meteo (Weather & Geocoding)
  * RainViewer (Weather Radar)

---

## 🚀 วิธีการติดตั้งและรันโปรเจกต์ (Local Development)

โปรเจกต์นี้เป็นแอปพลิเคชันแบบ **Static Frontend (Client-side Only)** คุณจึงสามารถรันบนเครื่องของคุณได้ทันทีโดยไม่ต้องตั้งค่า Backend Server ให้ยุ่งยาก

1. **Clone Repository:**
   \`\`\`bash
   git clone https://github.com/seasonrat28/thai_floodwatch_live.git
   cd thai_floodwatch_live
   \`\`\`

2. **เปิดด้วย Live Server:**
   หากคุณใช้งาน VS Code แนะนำให้ติดตั้ง Extension **Live Server** 
   * คลิกขวาที่ไฟล์ \`index.html\`
   * เลือก "Open with Live Server"
   * หรือหากมี Python ติดตั้งอยู่ สามารถรัน: \`python -m http.server 8080\`

3. **GISTDA API Key:** 
   ในไฟล์ \`app.js\` มีการระบุตัวแปร \`GISTDA_API_KEY\` ไว้สำหรับการดึงข้อมูล หากคีย์หมดอายุหรือต้องการใช้คีย์ของคุณเอง สามารถนำไปแทนที่ได้ในไฟล์

---

## 🤝 การมีส่วนร่วม (Contributing)

แอปพลิเคชันนี้ถูกสร้างขึ้นเพื่อจุดประสงค์สาธารณะ หากท่านใดต้องการต่อยอดฟีเจอร์ ปรับปรุง UI หรือแก้ไขบั๊ก:
1. Fork โปรเจกต์นี้
2. สร้าง Feature Branch (\`git checkout -b feature/AmazingFeature\`)
3. Commit สิ่งที่แก้ไข (\`git commit -m 'Add some AmazingFeature'\`)
4. Push ไปที่ Branch (\`git push origin feature/AmazingFeature\`)
5. เปิด Pull Request (PR)

---

*สร้างสรรค์และพัฒนาเพื่อเป็นส่วนหนึ่งในการช่วยเหลือสังคมให้ผ่านพ้นวิกฤตน้ำท่วมไปได้อย่างปลอดภัย 🇹🇭*
