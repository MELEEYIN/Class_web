/* ==========================================================================
   demo-schedule.js — 示例课表（深圳技术大学 2026-2027-1 · 26 级光源与照明）
   数据来源：教务系统导出的「学生个人课表」（原始 .xls 只放在本机 map/ 目录，不入库）
   这个文件由脚本生成，只是为了让「导入 → 示例数据」在任何环境下都能用
   （包括直接双击 index.html 的 file:// 模式，那种情况下 fetch 是被禁止的）。
   真正的数据结构说明见 README，或者点「数据与设置 → 导出全部数据」看一份实例。

   ⚠️ 隐私提醒：本仓库是公开的，所以这份示例里的姓名/班级/专业/课表都会被人看到。
      不想公开的话，把下面 meta 里的字段改成占位文字（或整份清空），
      再在页面上点「数据与设置 → 清空课程与事务」即可。
   ========================================================================== */
window.CW_DEMO_SCHEDULE ={
 "version": 2,
 "kind": "cw-schedule",
 "label": "示例课表 · 深圳技术大学 2026-2027-1",
 "meta": {
  "school": "深圳技术大学",
  "student": "李奕楠",
  "term": "2026-2027-1",
  "className": "26级光源1班",
  "major": "光源与照明（新型光源与智能显示）",
  "college": "新材料与新能源学院",
  "printedAt": "2026-09-05",
  "source": "教务系统导出 · 学生个人课表"
 },
 "settings": {
  "termStart": "2026-08-31",
  "totalWeeks": 18,
  "remindMinutes": 20,
  "showWeekend": true,
  "firstDayOfWeek": 1
 },
 "periods": [
  {
   "label": "第1 2节",
   "codes": [1, 2],
   "start": "08:30",
   "end": "09:55"
  },
  {
   "label": "第3 4节",
   "codes": [3, 4],
   "start": "10:15",
   "end": "11:40"
  },
  {
   "label": "第5节",
   "codes": [5],
   "start": "11:45",
   "end": "12:25"
  },
  {
   "label": "第6 7节",
   "codes": [6, 7],
   "start": "14:00",
   "end": "15:25"
  },
  {
   "label": "第8 9节",
   "codes": [8, 9],
   "start": "15:45",
   "end": "17:10"
  },
  {
   "label": "第10节",
   "codes": [10],
   "start": "17:15",
   "end": "17:55"
  },
  {
   "label": "第11 12节",
   "codes": [11, 12],
   "start": "19:00",
   "end": "20:20"
  },
  {
   "label": "第13 14节",
   "codes": [13, 14],
   "start": "20:30",
   "end": "21:50"
  },
  {
   "label": "第15节",
   "codes": [15],
   "start": "18:00",
   "end": "18:40"
  }
 ],
 "courses": [
  {
   "name": "计算与人工智能基础A",
   "teacher": "姜婧妍",
   "room": "C-5-102",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [1, 2],
   "weeksText": "2-3,5-6,9-18",
   "day": 1
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-239",
   "weeks": [4],
   "codes": [1, 2],
   "weeksText": "4",
   "day": 1
  },
  {
   "name": "计算与人工智能基础A",
   "teacher": "姜婧妍",
   "room": "C-5-466机房",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [3, 4],
   "weeksText": "2-3,5-6,9-18",
   "day": 1
  },
  {
   "name": "高等数学B1",
   "teacher": "何俊锋",
   "room": "C-5-103",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [3, 4],
   "weeksText": "2-3,5-6,9-18",
   "day": 2
  },
  {
   "name": "工程制图及CAD (理论班1-1)",
   "teacher": "王秋霞",
   "room": "C-5-406",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [3, 4],
   "weeksText": "2-3,5-6,9-18",
   "day": 3
  },
  {
   "name": "高等数学B1",
   "teacher": "何俊锋",
   "room": "C-5-103",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [3, 4],
   "weeksText": "2-3,5-6,9-18",
   "day": 4
  },
  {
   "name": "大学英语A1",
   "teacher": "王曦兮",
   "room": "C-5-554",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [6, 7],
   "weeksText": "2-3,5-6,9-18",
   "day": 1
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-239",
   "weeks": [4],
   "codes": [6, 7],
   "weeksText": "4",
   "day": 2
  },
  {
   "name": "大学英语A1",
   "teacher": "王曦兮",
   "room": "C-5-554",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [6, 7],
   "weeksText": "2-3,5-6,9-18",
   "day": 3
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-237",
   "weeks": [4],
   "codes": [6, 7],
   "weeksText": "4",
   "day": 3
  },
  {
   "name": "大学生心理健康",
   "teacher": "李亚玲",
   "room": "C-5-107",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [6, 7],
   "weeksText": "2-3,5-6,9-18",
   "day": 4
  },
  {
   "name": "工程制图及CAD (理论班1-1)",
   "teacher": "陈加骐,王秋霞",
   "room": "C-5-429机房",
   "weeks": [3, 5, 9, 11, 13, 15, 17],
   "codes": [6, 7],
   "weeksText": "3,5,9,11,13,15,17",
   "day": 5
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-239",
   "weeks": [4],
   "codes": [6, 7],
   "weeksText": "4",
   "day": 7
  },
  {
   "name": "The RSA algorithm for public key cryptography and digital signature",
   "teacher": "Priska Jahnke",
   "room": "C-5-205",
   "weeks": [4],
   "codes": [8, 9],
   "weeksText": "4",
   "day": 1
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-239",
   "weeks": [4],
   "codes": [8, 9],
   "weeksText": "4",
   "day": 2
  },
  {
   "name": "中国近现代史纲要",
   "teacher": "胥苗苗",
   "room": "C-5-448",
   "weeks": [2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
   "codes": [8, 9, 10],
   "weeksText": "2-3,5-6,9-18",
   "day": 3
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-237",
   "weeks": [4],
   "codes": [8, 9],
   "weeksText": "4",
   "day": 3
  },
  {
   "name": "Physics and the Future of Humanity",
   "teacher": "吴海娜",
   "room": "C-5-239",
   "weeks": [4],
   "codes": [8, 9],
   "weeksText": "4",
   "day": 7
  },
  {
   "name": "形势与政策1",
   "teacher": "王宏岳",
   "room": "C-5-109",
   "weeks": [13],
   "codes": [11, 12],
   "weeksText": "13",
   "day": 1
  },
  {
   "name": "形势与政策1",
   "teacher": "赵深澳",
   "room": "C-5-109",
   "weeks": [14],
   "codes": [11, 12],
   "weeksText": "14",
   "day": 1
  },
  {
   "name": "形势与政策1",
   "teacher": "党学哲",
   "room": "C-5-109",
   "weeks": [15],
   "codes": [11, 12],
   "weeksText": "15",
   "day": 1
  },
  {
   "name": "形势与政策1",
   "teacher": "苏娇妮",
   "room": "C-5-109",
   "weeks": [16],
   "codes": [11, 12],
   "weeksText": "16",
   "day": 1
  }
 ],
 "events": [],
 "notes": ["军事训练  1-18周", "行业认知 陈加骐 1-18周"]
}
;
