# Zenas Technology — เว็บไซต์ (ฉบับสร้างใหม่)

เว็บนี้สร้างขึ้นใหม่จาก zenastechnology.com เดิม โดยหน้าตา เนื้อหา สินค้า บทความ รูป และไฟล์ PDF เหมือนเดิมทุกอย่าง แต่ไม่ต้องพึ่งระบบหลังบ้านของเอเจนซี่ (DNA / Digital Nation Agency) อีกต่อไป

- เป็นเว็บ **static** วางบน **GitHub Pages** ได้ฟรี ไม่ต้องมีเซิร์ฟเวอร์หรือฐานข้อมูล
- ข้อมูลทั้งหมดเก็บเป็นไฟล์ JSON ในโฟลเดอร์ `data/` ส่วนรูปและ PDF เก็บใน `media/`
- มี **ระบบหลังบ้าน** ที่ `/admin/` ใช้แก้สินค้า บทความ แบนเนอร์ และข้อมูลบริษัทได้เองผ่านหน้าเว็บ กดเผยแพร่แล้วระบบจะ commit เข้า GitHub ให้อัตโนมัติ
- **ฟอร์มติดต่อ** ส่งข้อความเข้า Google Sheet และแจ้งเตือนทางอีเมล (เว็บเดิมฟอร์มนี้ไม่ได้บันทึกอะไรเลย)

---

## 1) โครงสร้างไฟล์

```
index.html          หน้าแรก
products.html       รายการสินค้า (+ ตัวกรองหมวด  ?cat=recovery-health)
product.html        หน้ารายละเอียดสินค้า        ?slug=sintesi
blog.html           หน้าบทความ + รีวิวนักกีฬา
post.html           หน้าอ่านบทความ                ?slug=...
contact.html        ติดต่อเรา + ฟอร์ม + แผนที่
terms.html / privacy.html
404.html            พาลิงก์เก่า (/product-detail/xxx, /blog-detail/xxx, /contact-us) ไปหน้าใหม่ให้อัตโนมัติ
admin/              ระบบหลังบ้าน
assets/css, assets/js, assets/img    หน้าตาและโค้ดของเว็บ
data/*.json         ข้อมูลทั้งหมดของเว็บ (ดูข้อ 5)
media/              รูปภาพ (แปลงเป็น .webp แล้ว) และ PDF แคตตาล็อก
backend/contact-form/Code.gs         โค้ด Google Apps Script ของฟอร์มติดต่อ
```

## 2) นำขึ้น GitHub Pages

1. สร้าง repository ใหม่ใน GitHub เช่น `zenas-website` (ตั้งเป็น Public หรือ Private ก็ได้ ถ้าเป็น Private ต้องใช้แพ็กเกจ GitHub ที่รองรับ Pages)
2. อัปโหลดไฟล์ **ทั้งหมดในโฟลเดอร์นี้** ไว้ที่ root ของ repo (ไฟล์ `index.html` ต้องอยู่ชั้นบนสุด)
   - วิธีง่ายสุด: หน้า repo กด **Add file → Upload files** แล้วลากไฟล์และโฟลเดอร์ทั้งหมดลงไป จากนั้นกด Commit
   - หรือใช้คำสั่ง:
     ```bash
     git init && git add . && git commit -m "Zenas website"
     git branch -M main
     git remote add origin https://github.com/<ชื่อผู้ใช้>/zenas-website.git
     git push -u origin main
     ```
3. ไปที่ **Settings → Pages** แล้วตั้งค่า **Source: Deploy from a branch**, **Branch: main / (root)** แล้วกด Save
4. รอ 1–2 นาที เว็บจะขึ้นที่ `https://<ชื่อผู้ใช้>.github.io/zenas-website/`

### ใช้โดเมน zenastechnology.com
1. ใน **Settings → Pages → Custom domain** ใส่ `www.zenastechnology.com` แล้วติ๊ก **Enforce HTTPS**
2. ที่ผู้ดูแล DNS ของโดเมน (เว็บเดิมวิ่งผ่าน Cloudflare — ตรวจสอบว่าบัญชี DNS เป็นของบริษัทหรือของเอเจนซี่) ให้ตั้งค่า
   - `CNAME  www  →  <ชื่อผู้ใช้>.github.io`
   - `A  @  →  185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153`
3. ⚠️ **ควรย้ายโดเมนหลังจากเว็บใหม่ทำงานดีแล้วเท่านั้น** และต้องมีสิทธิ์เข้า DNS ของโดเมน ถ้าโดเมนยังจดไว้ในชื่อเอเจนซี่ ให้ขอโอนสิทธิ์มาเป็นของบริษัทก่อน

## 3) ระบบหลังบ้าน (`/admin/`)

ระบบหลังบ้านแก้ไขได้: สินค้า (รวมรุ่นย่อย แกลเลอรี ส่วนเนื้อหา แคตตาล็อก PDF และวิดีโอ YouTube) บทความและรีวิว หมวดสินค้า แบนเนอร์หน้าแรกและโลโก้พาร์ทเนอร์ ข้อมูลบริษัท โซเชียล SEO หน้า Terms/Privacy และข้อความบนแต่ละหน้า

### สร้าง token (ทำครั้งเดียว)
1. GitHub → รูปโปรไฟล์ → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. **Repository access:** Only select repositories → เลือก repo ของเว็บนี้เท่านั้น
3. **Permissions → Repository permissions → Contents: Read and write** (สิทธิ์อื่นไม่ต้องให้)
4. ตั้งวันหมดอายุตามต้องการ แล้วคัดลอก token ที่ขึ้นต้นด้วย `github_pat_...`

### ใช้งาน
1. เปิด `https://<เว็บ>/admin/` แล้วกรอก owner, repo, branch (`main`) และ token
2. แก้ข้อมูล → กด **บันทึก** ในฟอร์ม (ข้อมูลจะยังไม่ขึ้นเว็บ)
3. กด **เผยแพร่การเปลี่ยนแปลง** มุมขวาบน ระบบจะรวมการแก้ไขทั้งหมดและรูปที่อัปโหลดเป็น commit เดียว เว็บจะอัปเดตภายใน 1–2 นาที

หมายเหตุ
- รูปที่อัปโหลดจะถูกย่อให้ด้านยาวไม่เกิน 1600px และแปลงเป็น .webp อัตโนมัติ
- อย่าใช้ token บนเครื่องสาธารณะ ถ้า token หลุดให้ไปกด Revoke ในหน้า token ได้ทันที
- หน้าหลังบ้านเปิดได้ทุกคน แต่ถ้าไม่มี token จะแก้ข้อมูลไม่ได้ และหน้านี้ตั้งค่าไม่ให้ Google index ไว้แล้ว
- ปุ่ม "เปิดแบบดูอย่างเดียว" ใช้ทดลองแก้โดยไม่บันทึก แล้วกด "ดาวน์โหลด JSON" เพื่อนำไฟล์ไปวางเองได้

## 4) ฟอร์มติดต่อ → Google Sheet

1. สร้าง Google Sheet ใหม่ (เช่น "Zenas Website Inquiries") ด้วยบัญชีของบริษัท
2. เมนู **Extensions → Apps Script** แล้วลบโค้ดเดิม จากนั้นวางโค้ดจาก `backend/contact-form/Code.gs`
   - แก้ `NOTIFY_EMAIL` เป็นอีเมลที่ต้องการรับแจ้งเตือน
3. เลือกฟังก์ชัน `setup` แล้วกด **Run** 1 ครั้ง และกดอนุญาตสิทธิ์ (ระบบจะสร้างแท็บ Inquiries ให้)
4. กด **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)
6. นำ URL ไปวางที่หลังบ้าน **ข้อมูลบริษัท → URL ของ Google Apps Script** แล้วเผยแพร่
   (หรือแก้ `contact_form_endpoint` ใน `data/settings.json` เอง)

ถ้ายังไม่ได้ตั้งค่า ปุ่ม Send จะเปิดแอปอีเมลของผู้ส่ง พร้อมข้อความที่กรอกไว้ให้ส่งไปที่ info@ แทน ข้อความจึงไม่หาย
มีระบบกันสแปมด้วย honeypot, การจับเวลา และจำกัดไม่เกิน 5 ข้อความต่ออีเมลต่อชั่วโมง

## 5) โครงสร้างข้อมูล (data/*.json)

| ไฟล์ | เก็บอะไร |
|---|---|
| `settings.json` | ชื่อบริษัท ที่อยู่ โทร แฟกซ์ อีเมล เลขภาษี เวลาทำการ แผนที่ โซเชียล SEO เมนู ข้อความแต่ละหน้า (`pages`) หน้า Terms/Privacy (`legal`) URL ฟอร์มติดต่อ |
| `banners.json` | `hero` สไลด์หน้าแรก, `hero_mobile` สไลด์สำหรับมือถือ, `partners` โลโก้พาร์ทเนอร์ |
| `categories.json` | หมวดสินค้า: `slug`, `title`, `description`, `image`, `order`, `active` |
| `products.json` | สินค้า (ดูด้านล่าง) |
| `blogs.json` | บทความ (`type: "blog"`) และรีวิวนักกีฬา (`type: "review"`): `slug`, `title`, `subtitle` (วันที่ \| ผู้เขียน), `cover`, `featured`, `blocks` |

ฟิลด์สำคัญของสินค้า
- `parent`: 0 = สินค้าหลัก ถ้าใส่ id ของสินค้าอื่น จะกลายเป็น "รุ่นย่อย" เช่น SOLACE 210 อยู่ใต้ Oxyhealth Series และแสดงเป็นปุ่มในหน้าสินค้าหลัก
- `categories`: รายการ slug ของหมวด
- `featured`: แสดงในส่วน Featured Products หน้าแรก
- `cover` รูปการ์ด, `gallery` รูปสไลด์ด้านบน, `catalog` PDF, `youtube` รหัสวิดีโอ
- `about_html`: ข้อความ About Product
- `blocks`: ส่วนเนื้อหาเพิ่มเติม `{layout, title, image, html}` โดย layout มีความหมายดังนี้
  `4` = รูปกึ่งกลาง ข้อความด้านล่าง · `2` = รูปซ้าย ข้อความขวา · `3` = ข้อความซ้าย รูปขวา · `1` = แถบสีกรมท่า รูปซ้าย
- `related_blogs`: slug ของบทความที่จะแสดงท้ายหน้าสินค้า
- `active: false` = ซ่อนจากเว็บโดยยังไม่ลบข้อมูล

## 6) ระบบเดิมเก็บข้อมูลอย่างไร (สรุปจากการตรวจสอบ)

- หน้าเว็บเดิมสร้างด้วย **Nuxt.js (Vue)** และดึงข้อมูลจาก **headless CMS ของ DNA (Digital Nation Agency)** ผ่าน `https://zenastechnology.com/api/<module>/v1/...` โดยใช้ Bearer token แบบตายตัว
- module ที่ใช้มี `settings`, `navigations`, `socials`, `languages`, `banner/v1/image`, `products` (`getall`, `detail/:slug`, `category/getall`, `contents/getall`), `blogs`, `services` และ `pages/v1/detail` ซึ่งเป็น page builder ที่ประกอบหน้าจาก component
- รูปและ PDF ฝากไว้ที่ `files.dna.co.th` ของเอเจนซี่ (เว็บใหม่ย้ายมาเก็บใน `media/` ครบแล้ว 349 ไฟล์)
- ฟอร์ม Contact เดิมมีแค่หน้าตา **ปุ่ม Send ไม่ได้บันทึกหรือส่งข้อมูลไปที่ใดเลย**
- ⚠️ **ปัญหาความปลอดภัย:** API `settings/v1/getall` ของเว็บเดิมเปิดให้คนทั่วไปอ่าน **username และ password ของ SMTP อีเมล** (`mail.digitalnationagency.net`) ได้ ควรแจ้ง DNA ให้เปลี่ยนรหัสผ่านทันที และปิดเว็บเดิมหลังจากย้ายโดเมนเสร็จแล้ว (เว็บใหม่ไม่ได้เก็บรหัสนี้ไว้)

## 7) ทดสอบบนเครื่อง

หน้าเว็บโหลดข้อมูลจาก `data/*.json` จึงต้องเปิดผ่าน web server ไม่สามารถดับเบิลคลิกไฟล์ html เปิดตรงๆ ได้
```bash
python -m http.server 8000
# แล้วเปิด http://localhost:8000
```
