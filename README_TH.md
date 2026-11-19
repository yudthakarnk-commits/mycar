# ติดตั้ง MYCAR Cloud QA บน GitHub (ไม่ต้องติดตั้งบนคอมบริษัท)

## ก่อนเริ่ม
- เลือก branch **develop** ห้ามอัปโหลดไป `main`
- อย่าเพิ่มรหัสผ่าน, Supabase service-role key หรือข้อมูลรถจริงลงในไฟล์ทดสอบ
- ต้องได้รับอนุญาตตามนโยบาย IT ของบริษัทสำหรับการใช้บริการ Cloud ภายนอก หากมีข้อกำหนด

## อัปโหลดไฟล์ทั้ง 4 รายการพร้อม path
1. `package.json` อยู่ root
2. `playwright.config.js` อยู่ root
3. `tests/mycar.spec.js` อยู่ในโฟลเดอร์ tests
4. `.github/workflows/mycar-qa.yml` อยู่ในโฟลเดอร์ .github/workflows

สามารถใช้ GitHub เว็บ > Add file > Create new file แล้วใส่ชื่อพาธที่มีเครื่องหมาย `/` เพื่อสร้างโฟลเดอร์พร้อมไฟล์ทีละรายการ หรือ drag-and-drop โครงสร้างไฟล์ที่แตก ZIP แล้ว โดยตรวจให้แน่ใจว่า GitHub แสดง path ตามด้านบนก่อน Commit

## วิธีดูผล
1. หลัง Commit ไป `develop` เลือกแท็บ **Actions**
2. เลือก **MYCAR Cloud UI QA** แล้วเลือก run ล่าสุด
3. เปิด job **UI regression - Chromium and WebKit** ดู Test Results
4. หากล้มเหลว เปิดส่วน Artifacts แล้วดาวน์โหลด `mycar-playwright-report-*` เพื่อดู `playwright-report/index.html`, screenshots, traces

## การอ่านผลครั้งแรก
- `develop` ปัจจุบันอาจยังเป็น v3.4.1 ดังนั้น tests สำหรับ Scroll reset และ Other Expenses ควร FAIL เพื่อแสดงว่าจับข้อบกพร่องได้จริง
- จะ PASS เมื่อแพตช์แก้ปัญหานั้นถูกนำขึ้น `develop` แล้ว และ test ผ่านตามการออกแบบ
- ทดสอบบน GitHub Ubuntu WebKit เป็นเพียงการจำลองเบราว์เซอร์ Safari ไม่แทนการตรวจบน iPhone จริง

## ความปลอดภัย
- Mock records อยู่ในหน่วยความจำ browser บน GitHub runner เท่านั้น
- โค้ดทดสอบ block URL Supabase และไม่ login
- ไม่ได้สั่งแก้ Supabase จริง และไม่แก้ branch `main`
- tests Currency mock rates สำหรับตรวจเลขคณิต ไม่ได้ตรวจอัตราแลกเปลี่ยนจริง

## ข้อจำกัด
- Tests นี้ตรวจตัวอย่างเส้นทางสำคัญ ไม่ใช่การตรวจ Backup / Restore หรือ Sync แบบ Integration ครบทั้งหมด
- ต้องเพิ่ม Integration Test แบบ staging ที่แยกฐานข้อมูล หากต้องการพิสูจน์ sync และ recovery
