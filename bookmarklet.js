// =========================================================================
// JADWAL - أداة سحب المقررات التلقائية من بوابة الجامعة
// =========================================================================
// وظيفة السكريبت:
// 1. يعمل كزر في شريط المفضلة بالمتصفح.
// 2. عندما يضغط الطالب عليه داخل صفحة المقررات المطروحة، يسحب جميع الشعب آلياً.
// 3. يقلب الصفحات عبر نظام البوابة تلقائياً.
// 4. يفتح موقع الجداول مع البيانات المجهزة فوراً!
// =========================================================================

(async function() {
  const JADWAL_APP_URL = "https://ji2v111.github.io/Jadwal/";

  // التحقق من وجود جدول المقررات في الصفحة
  const hasTable = document.querySelector('[id*=":offeredCoursesTable"]') || document.querySelector('[id*="offeredCourses"]');
  if (!hasTable && !document.querySelector('.ui-datatable')) {
    alert("تنبيه: يرجى فتح صفحة 'المقررات المطروحة وفق الخطة' في بوابة الجامعة أولاً، ثم الضغط على هذا الزر.");
    return;
  }

  // إنشاء إشعار عائم لطيف يوضح تقدم العملية للطالب
  const toast = document.createElement('div');
  toast.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#0f172a;color:#ffffff;padding:12px 24px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.4);z-index:999999;font-family:sans-serif;font-size:14px;font-weight:bold;direction:rtl;border:1px solid #3b82f6;";
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

  function scrapeCurrentPage() {
    const results = [];
    const sectionInputs = document.querySelectorAll('[id*=":offeredCoursesTable:"][id$=":section"]');
    
    if (sectionInputs.length > 0) {
      sectionInputs.forEach(input => {
        const index = input.id.split(':')[2];
        const instructorEl = document.getElementById(`myForm:offeredCoursesTable:${index}:instructor`);
        const examEl = document.getElementById(`myForm:offeredCoursesTable:${index}:examPeriod`);
        const row = input.closest('tr');
        const cells = row ? Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim()) : [];

        results.push({
          course_code: cells[0] || '',
          course_name: cells[1] || '',
          section_number: cells[2] || '',
          type: cells[3] || 'نظري',
          sub_sections_count: cells[4] || '1',
          status: cells[5] || 'مفتوحة',
          instructor: instructorEl ? instructorEl.innerText.trim() : (cells[6] || ''),
          exam_period: examEl ? examEl.innerText.trim() : (cells[7] || ''),
          slots: parseSectionTime(input.value)
        });
      });
    } else {
      // بديل عام للجداول الأخرى
      const rows = document.querySelectorAll('table tbody tr');
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
        if (cells.length >= 6) {
          results.push({
            course_code: cells[0] || '',
            course_name: cells[1] || '',
            section_number: cells[2] || '',
            type: cells[3] || 'نظري',
            sub_sections_count: '3',
            status: cells[5] || 'مفتوحة',
            instructor: cells[6] || '',
            slots: []
          });
        }
      });
    }
    return results;
  }

  function waitForTableReload() {
    return new Promise(resolve => {
      const table = document.querySelector('[id*=":offeredCoursesTable"]') || document.body;
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

  // إزالة التكرارات
  const seen = new Set();
  const uniqueSections = allSections.filter(s => {
    const key = `${s.course_code}_${s.section_number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  toast.innerHTML = `تم استخراج ${uniqueSections.length} شعبة بنجاح! جاري فتح الجدول... 🚀`;

  setTimeout(() => {
    const payload = encodeURIComponent(JSON.stringify(uniqueSections));
    // فتح الرابط مع البيانات المرفقة
    window.open(`${JADWAL_APP_URL}#data=${payload}`, '_blank');
    toast.remove();
  }, 800);

})();
