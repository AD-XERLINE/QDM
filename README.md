# QDM Negotiator

Web app หน้าเดียวสำหรับวิชา OM ใช้ EOQ และ Quantity Discount Model (QDM) หาข้อเสนอต่อรองราคากับผู้ขาย
ปรับสมมติฐาน (D, S, I และตารางส่วนลด) ได้ทุกตัว แล้วดูทันทีว่าควรขอราคาเท่าไรที่ล็อตขนาดไหน
จึงจะได้ต้นทุนรวมต่อปี (TC) ต่ำกว่าข้อเสนอที่ดีที่สุดของร้าน โดยไม่ต้องสั่งล็อตใหญ่เกินจำเป็น

เว็บ: https://ad-xerline.github.io/QDM/

## สูตร

- TC(Q, P) = D·P + (D/Q)·S + (Q/2)·I·P
- Q*(P) = √(2DS / (I·P))
- ราคาเท่าทุนที่ล็อต Q: P_be(Q) = (TC_best − (D/Q)·S) / (D + Q·I/2)

## เปิดในเครื่อง

ไฟล์ JavaScript เป็น ES modules จึงต้องเปิดผ่าน static server (เปิดไฟล์ตรง ๆ แบบ `file://` ไม่ได้)

```bash
python -m http.server 8765
```

แล้วเปิด http://localhost:8765

## ทดสอบ

ต้องใช้ Node 20 ขึ้นไป ไม่มี dependency

```bash
npm test
```
