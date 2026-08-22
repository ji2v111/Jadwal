// =========================================================================
// JADWAL - أداة سحب المقررات التلقائية الشاملة من بوابات الجامعات
// v3.0 - تنظيف وتجميع البيانات تلقائياً (نفس clean_sections.py)
// =========================================================================

(async function() {
  const JADWAL_APP_URL = "https://ji2v111.github.io/Jadwal/";

  // ===== خريطة أيام الأسبوع =====
  const DAY_NAMES = {
    "1": "الأحد", "2": "الاثنين", "3": "الثلاثاء",
    "4": "الأربعاء", "5": "الخميس", "6": "الجمعة", "7": "السبت"
  };

  // ===== تحويل 12 ساعة إلى 24 ساعة =====
  function to24h(s) {
    s = s.trim();
    const m = s.match(/(\d{1,2}):(\d{2})\s*(ص|م)/);
    if (!m) return s;
    let h = parseInt(m[1]), mi = m[2], p = m[3];
    if (p === 'م' && h !== 12) h += 12;
    if (p === 'ص' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + mi;
  }

  // ===== تنظيف الفترات الزمنية =====
  function cleanSlots(rawSlots) {
    if (!rawSlots || !Array.isArray(rawSlots)) return [];
    const out = [];
    for (const sl of rawSlots) {
      if (sl.note) continue;
      const df = (sl.day || '').trim();
      if (!df) continue;
      let st, en;
      if (sl.start && sl.end) {
        st = sl.start; en = sl.end;
      } else if (sl.time && sl.time.includes('-')) {
        const pp = sl.time.split('-');
        st = to24h(pp[0]); en = to24h(pp[1]);
      } else continue;
      for (const dn of df.split(/\s+/)) {
        out.push({ day: DAY_NAMES[dn] || dn, start: st, end: en, room: (sl.room || '').trim() });
      }
    }
    return out;
  }

  // ===== تجميع الشعب تحت المقررات (نفس clean_sections.py) =====
  function groupCourses(flatSections) {
    const map = {};
    for (const r of flatSections) {
      const code = (r.course_code || '').trim();
      if (!code) continue;
      if (!map[code]) {
        map[code] = {
          course_code: code,
          course_name: (r.course_name || '').trim(),
          credit_hours: r.credit_hours || '',
          sections: []
        };
      }
      // حفظ الساعات لو موجودة
      if (r.credit_hours && !map[code].credit_hours) {
        map[code].credit_hours = r.credit_hours;
      }
      map[code].sections.push({
        section_number: (r.section_number || '').trim(),
        type: (r.type || 'نظري').trim(),
        status: (r.status || 'مفتوحة').trim(),
        instructor: (r.instructor || '').trim(),
        slots: cleanSlots(r.slots || [])
      });
    }
    return Object.values(map);
  }

  // التحقق من وجود جدول المقررات في الصفحة
  const hasTable = document.querySelector('[id*="offeredCoursesTable"]') || document.querySelector('[id*="offeredCourses"]') || document.querySelector('table');
  if (!hasTable && !document.querySelector('.ui-datatable')) {
    alert("تنبيه: يرجى فتح صفحة 'المقررات المطروحة وفق الخطة' في بوابة الجامعة أولاً، ثم الضغط على هذا الزر.");
    return;
  }

  // إنشاء إشعار عائم
  const toast = document.createElement('div');
  toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.5);z-index:999999;font-family:sans-serif;font-size:14px;font-weight:bold;direction:rtl;border:1px solid #3b82f6;";
  toast.innerHTML = "جاري استخراج المقررات والشُعب تلقائياً... يرجى الانتظار ⏳";
  document.body.appendChild(toast);

  function parseSectionTime(raw) {
    if (!raw) return [{ note: 'بالإتفاق' }];
    return raw.split("@n").filter(Boolean).map(slot => {
      const [dayTime, room] = slot.split("@r");
      const [day, time] = dayTime.split("@t");
      return { day: day ? day.trim() : '', time: time ? time.trim() : '', room: room ? room.trim() : '' };
    });
  }

  function extractInstructorFromRow(row, cells, colInst) {
    if (!row && !cells) return '';
    
    // 1. Direct ID / Class match inside the row
    if (row) {
      const el = row.querySelector('[id*="instructor"], [id*="faculty"], [id*="teacher"], [id*="staff"], [id*="emp"], [class*="instructor"], [class*="faculty"], [class*="teacher"]');
      if (el && el.innerText.trim()) return el.innerText.trim();
    }

    // 2. Column header match
    if (colInst !== -1 && cells && cells[colInst] && cells[colInst].trim()) {
      return cells[colInst].trim();
    }

    // 3. Scan all cells for title or name prefixes
    if (row) {
      const allElements = row.querySelectorAll('td, span, a, div');
      for (const el of allElements) {
        const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
        if (title.includes('د.') || title.includes('أ.') || title.includes('دكتور') || title.includes('أستاذ')) {
          return title.trim();
        }
      }
    }

    // 4. Scan cell text for Arabic names / prefixes
    if (cells && cells.length > 0) {
      const nonNameWords = ['نظري', 'عملي', 'مفتوحة', 'مغلقة', 'إناث', 'طلاب', 'طالبات', 'قاعة', 'معمل', 'مبنى', 'صباحي', 'مسائي', 'متاح', 'غير متاح', 'ساعات', 'ساعة', 'الفصل', 'المستوى'];
      for (let i = 2; i < cells.length; i++) {
        const text = cells[i].trim();
        if (!text || text.match(/^[0-9:\-\s]+$/)) continue;
        if (text.includes('د.') || text.includes('أ.') || text.includes('دكتور') || text.includes('أستاذ') || text.includes('د/') || text.includes('أ/')) {
          return text;
        }
        const words = text.split(/\s+/);
        if (words.length >= 2 && words.length <= 5 && !nonNameWords.some(w => text.includes(w))) {
          if (!text.match(/[0-9]/)) return text;
        }
      }
    }

    // 5. Fallback position (cell index 6)
    if (cells && cells[6] && !cells[6].match(/^[0-9]+$/)) {
      return cells[6].trim();
    }

    return '';
  }

  function scrapeCurrentPage() {
    const results = [];
    const table = document.querySelector('[id*="offeredCoursesTable"]') || document.querySelector('table');
    const headers = table ? Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(th => th.innerText.trim().toLowerCase()) : [];
    let colCode = -1, colName = -1, colSec = -1, colType = -1, colHours = -1, colStatus = -1, colInst = -1;

    headers.forEach((h, i) => {
      if (h.includes('رمز') || h.includes('كود') || h.includes('code')) colCode = i;
      else if (h.includes('اسم') || h.includes('مقرر') || h.includes('title') || h.includes('name')) colName = i;
      else if (h.includes('شعبة') || h.includes('رقم') || h.includes('sec') || h.includes('crn')) colSec = i;
      else if (h.includes('نوع') || h.includes('نشاط') || h.includes('type')) colType = i;
      else if (h.includes('ساعات') || h.includes('معتمدة') || h.includes('hour') || h.includes('cr')) colHours = i;
      else if (h.includes('حالة') || h.includes('status')) colStatus = i;
      else if (h.includes('محاضر') || h.includes('استاذ') || h.includes('أستاذ') || h.includes('مدرس') || h.includes('تدريس') || h.includes('دكتور') || h.includes('instructor') || h.includes('faculty') || h.includes('teacher')) colInst = i;
    });

    const sectionInputs = document.querySelectorAll('[id*="offeredCoursesTable:"][id$=":section"]');
    if (sectionInputs.length > 0) {
      sectionInputs.forEach(input => {
        const row = input.closest('tr');
        const cells = row ? Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim()) : [];
        const instName = extractInstructorFromRow(row, cells, colInst);
        const rawHours = colHours !== -1 ? cells[colHours] : '';
        const parsedHours = parseInt(rawHours) || '';

        results.push({
          course_code: (colCode !== -1 ? cells[colCode] : cells[0]) || '',
          course_name: (colName !== -1 ? cells[colName] : cells[1]) || '',
          section_number: (colSec !== -1 ? cells[colSec] : cells[2]) || '',
          type: (colType !== -1 ? cells[colType] : cells[3]) || 'نظري',
          credit_hours: (parsedHours >= 1 && parsedHours <= 8) ? parsedHours : '',
          status: (colStatus !== -1 ? cells[colStatus] : cells[5]) || 'مفتوحة',
          instructor: instName,
          slots: parseSectionTime(input.value)
        });
      });
    } else {
      const rows = document.querySelectorAll('table tbody tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
        if (cells.length >= 4) {
          const rawHours = colHours !== -1 ? cells[colHours] : '';
          const parsedHours = parseInt(rawHours) || '';
          const instName = extractInstructorFromRow(row, cells, colInst);

          results.push({
            course_code: (colCode !== -1 ? cells[colCode] : cells[0]) || '',
            course_name: (colName !== -1 ? cells[colName] : cells[1]) || '',
            section_number: (colSec !== -1 ? cells[colSec] : cells[2]) || '',
            type: (colType !== -1 ? cells[colType] : cells[3]) || 'نظري',
            credit_hours: (parsedHours >= 1 && parsedHours <= 8) ? parsedHours : '',
            status: (colStatus !== -1 ? cells[colStatus] : cells[5]) || 'مفتوحة',
            instructor: instName,
            slots: []
          });
        }
      });
    }
    return results;
  }

  function waitForTableReload() {
    return new Promise(resolve => {
      const table = document.querySelector('[id*="offeredCoursesTable"]') || document.body;
      const observer = new MutationObserver((mutations, obs) => {
        obs.disconnect();
        setTimeout(resolve, 600);
      });
      observer.observe(table, { childList: true, subtree: true });
    });
  }

  let allSections = [];
  const pages = Array.from(document.querySelectorAll('.ui-paginator-page'));

  if (pages.length === 0) {
    allSections = scrapeCurrentPage();
  } else {
    for (let i = 0; i < pages.length; i++) {
      toast.innerHTML = `جاري قراءة الصفحة (${i + 1} من ${pages.length})... ⏳`;
      const currentPages = Array.from(document.querySelectorAll('.ui-paginator-page'));
      if (currentPages[i]) {
        currentPages[i].click();
        await waitForTableReload();
        allSections.push(...scrapeCurrentPage());
      }
    }
  }

  // فلترة الشعب المكررة
  const seenKeys = new Set();
  const uniqueSections = allSections.filter(sec => {
    const key = `${sec.course_code}_${sec.section_number}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // ===== تنظيف وتجميع البيانات (نفس clean_sections.py) =====
  const cleaned = groupCourses(uniqueSections);
  const totalSec = cleaned.reduce((s, c) => s + c.sections.length, 0);

  toast.innerHTML = `تم استخراج ${totalSec} شعبة في ${cleaned.length} مقرر بنجاح! 🚀`;

  setTimeout(() => {
    const payload = encodeURIComponent(JSON.stringify(cleaned));
    window.open(`${JADWAL_APP_URL}#data=${payload}`, '_blank');
    toast.remove();
  }, 800);
})();
