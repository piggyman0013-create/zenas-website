/**
 * Zenas Technology — contact form backend (Google Apps Script)
 *
 * Saves every message from the website's Contact Us form into a Google Sheet
 * and emails a notification. See README.md (section "ฟอร์มติดต่อ") for setup.
 */

// ===== settings =====
const SHEET_NAME = 'Inquiries';
const NOTIFY_EMAIL = 'info@zenastechnology.com'; // where new-message alerts go ('' to disable)
const MAX_PER_EMAIL_PER_HOUR = 5;                // simple anti-spam

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // honeypot field / filled too fast => silently accept but ignore (bots)
    if (data.website || (Number(data.elapsed) > 0 && Number(data.elapsed) < 3)) return json_({ ok: true });

    const name = clean_(data.name, 120);
    const email = clean_(data.email, 160);
    const phone = clean_(data.phone, 40);
    const message = clean_(data.message, 4000);
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json_({ ok: false, error: 'Missing name, email or message' });
    }

    const cache = CacheService.getScriptCache();
    const key = 'rate_' + email.toLowerCase();
    const count = Number(cache.get(key) || 0);
    if (count >= MAX_PER_EMAIL_PER_HOUR) return json_({ ok: false, error: 'Too many messages, please try again later' });
    cache.put(key, String(count + 1), 3600);

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet_();
      sheet.appendRow([new Date(), name, email, phone, message, clean_(data.page, 300), 'New', '']);
    } finally {
      lock.releaseLock();
    }

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        replyTo: email,
        subject: 'ข้อความใหม่จากเว็บไซต์ Zenas: ' + name,
        body: 'ชื่อ: ' + name + '\nอีเมล: ' + email + '\nโทร: ' + (phone || '-') + '\n\n' + message +
          '\n\n— ส่งจาก ' + (data.page || 'website') + '\nดูทั้งหมดใน Google Sheet: ' + SpreadsheetApp.getActive().getUrl(),
      });
    }
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Server error' });
  }
}

function doGet() {
  return json_({ ok: true, service: 'zenas-contact-form' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Received', 'Name', 'Email', 'Phone', 'Message', 'Page', 'Status', 'Note']);
    sh.setFrozenRows(1);
    sh.getRange('A1:H1').setFontWeight('bold').setBackground('#1c41b0').setFontColor('#ffffff');
    sh.setColumnWidth(5, 420);
    sh.getRange('G2:G').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['New', 'Replied', 'Closed'], true).build());
  }
  return sh;
}

function clean_(v, max) {
  // strip control chars and leading formula characters so a message can't run as a sheet formula
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s.slice(0, max);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the sheet and grant permissions. */
function setup() {
  getSheet_();
  if (NOTIFY_EMAIL) MailApp.getRemainingDailyQuota();
}
