/* ==========================================================================
   parse.js — 把各种来源「翻译」成课程 / 事务
   输入可能是：
     · 教务系统导出的 .xls / .xlsx / .csv 二维表格
     · 从课表页面复制来的 HTML 表格（含 rowspan / colspan）
     · 从课表页面复制来的纯文本
     · .ics 日历
     · 本页自己导出的 .json 备份
   输出统一为：
     { kind, meta, periods, courses, events, notes, warnings }
   ========================================================================== */
(function () {
  'use strict';

  var CW = window.CW = window.CW || {};
  var U = CW.util;

  /* ======================================================================
     0. 默认节次（深圳技术大学，取自教务系统导出的课表）
     ====================================================================== */
  function defaultPeriods() {
    return [
      { label: '第1 2节', codes: [1, 2], start: '08:30', end: '09:55' },
      { label: '第3 4节', codes: [3, 4], start: '10:15', end: '11:40' },
      { label: '第5节', codes: [5], start: '11:45', end: '12:25' },
      { label: '第6 7节', codes: [6, 7], start: '14:00', end: '15:25' },
      { label: '第8 9节', codes: [8, 9], start: '15:45', end: '17:10' },
      { label: '第10节', codes: [10], start: '17:15', end: '17:55' },
      { label: '第11 12节', codes: [11, 12], start: '19:00', end: '20:20' },
      { label: '第13 14节', codes: [13, 14], start: '20:30', end: '21:50' },
      { label: '第15节', codes: [15], start: '18:00', end: '18:40' }
    ];
  }

  /* ======================================================================
     1. 正则与常量
     ====================================================================== */
  var DAY_RE = /(?:星期|周)([一二三四五六日天])/;
  var DAY_MAP = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

  /* 「2-3,5-6,9-18([周])[01-02节]」这种教务系统标准写法 */
  var WP_RE = /^([\d,\-\s]+)\s*\(\s*\[\s*周\s*\]\s*\)\s*\[\s*([\d\-]+)\s*节\s*\]$/;

  /* 宽松版：一行里同时出现周次和节次，顺序不限 */
  var WEEK_TOKEN = /(\d{1,2}(?:\s*-\s*\d{1,2})?(?:\s*,\s*\d{1,2}(?:\s*-\s*\d{1,2})?)*)\s*周/;
  var PERIOD_TOKEN = /\[?\s*(\d{1,2}(?:\s*-\s*\d{1,2})*)\s*节\s*\]?/;

  /* 只有周次的一行，例如「1-16周」「1,3,5周」「第1-8周」 */
  var WEEK_ONLY_RE = /^第?\s*[\d,\-\s]+\s*周$/;

  /* 看起来像教室：C-5-102 / A-1-201 / 教学楼201 / 3号机房 */
  var ROOM_RE = /^(?:[A-Za-z]{1,4}\s*[-－]\s*\d|[^,，]{0,18}(?:楼|室|机房|教室|实验室|馆|场|厅|中心|苑|栋|座)\s*[-\d]?[^,，]{0,10}$)/;

  /* 列名识别（表头是「课程 / 教师 / 教室 …」的手工表） */
  var COL_PATTERNS = [
    { key: 'name', re: /^(课程|课程名称|科目|名称|课名|教学班|内容)$/ },
    { key: 'teacher', re: /^(教师|老师|任课教师|授课教师|讲师)$/ },
    { key: 'room', re: /^(教室|地点|上课地点|场地|位置|教室号)$/ },
    { key: 'day', re: /^(星期|周几|星期几|周次?日|上课日|day)$/ },
    { key: 'codes', re: /^(节次|节|时间|上课时间|period|时段)$/ },
    { key: 'weeks', re: /^(周次|周数|上课周|周|weeks)$/ },
    { key: 'title', re: /^(事务|事项|标题|事件|名称|内容)$/ },
    { key: 'date', re: /^(日期|开始日期|date)$/ },
    { key: 'start', re: /^(开始|开始时间|起|start)$/ },
    { key: 'end', re: /^(结束|结束时间|止|end)$/ },
    { key: 'note', re: /^(备注|说明|备注信息|详情)$/ }
  ];

  /* ======================================================================
     2. 周次 / 节次展开
     ====================================================================== */
  function expandWeeks(str, maxWeek) {
    maxWeek = maxWeek || 30;
    var out = [];
    String(str || '').replace(/第/g, '').split(/[,，、;；\s]+/).forEach(function (part) {
      if (!part) return;
      var m = /^(\d{1,2})\s*[-－~至]\s*(\d{1,2})$/.exec(part);
      if (m) {
        var a = Number(m[1]), b = Number(m[2]);
        if (a > b) { var t = a; a = b; b = t; }
        for (var i = a; i <= b && i <= maxWeek; i++) out.push(i);
        return;
      }
      var single = /^(\d{1,2})$/.exec(part);
      if (single) {
        var n = Number(single[1]);
        if (n >= 1 && n <= maxWeek) out.push(n);
      }
    });
    return uniqSorted(out);
  }

  /** 节次：'01-02' -> [1,2]；'08-09-10' -> [8,9,10]；'06,07' -> [6,7] */
  function expandCodes(str) {
    var out = [];
    String(str || '').split(/[,，、;；\s]+/).forEach(function (part) {
      if (!part) return;
      var m = /^(\d{1,2})\s*[-－~至]\s*(\d{1,2})(?:\s*[-－~至]\s*(\d{1,2}))?$/.exec(part);
      if (m) {
        out.push(Number(m[1]));
        if (m[3] !== undefined) {
          // 「08-09-10」这种，说明是三个独立小节
          out.push(Number(m[2]), Number(m[3]));
        } else {
          // 「01-02」是「第 1、2 节」的连写；只有当两端都在 1..15 且跨度很小时才展开
          var a = Number(m[1]), b = Number(m[2]);
          if (b > a && b - a <= 3) { for (var i = a + 1; i <= b; i++) out.push(i); }
          else { out.push(b); }
        }
        return;
      }
      var single = /^(\d{1,2})$/.exec(part);
      if (single) out.push(Number(single[1]));
    });
    return uniqSorted(out.filter(function (n) { return n >= 1 && n <= 20; }));
  }

  function uniqSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } });
    return out.sort(function (a, b) { return a - b; });
  }

  /** [1,2,3,5] -> '1-3,5' */
  function compressRanges(nums) {
    nums = uniqSorted(nums);
    if (!nums.length) return '';
    var parts = [], start = nums[0], prev = nums[0];
    for (var i = 1; i <= nums.length; i++) {
      var cur = nums[i];
      if (cur !== prev + 1) {
        parts.push(start === prev ? String(start) : start + '-' + prev);
        start = cur;
      }
      prev = cur;
    }
    return parts.join(',');
  }

  /* ======================================================================
     3. 单元格文本规范化
     ====================================================================== */
  function normalizeCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    return String(v)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 把一个单元格拆成若干「课程块」：块之间用空行分隔 */
  function splitBlocks(text) {
    text = normalizeCell(text);
    if (!text) return [];
    return text.split(/\n\s*\n+/)
      .map(function (b) {
        return b.split('\n').map(function (l) { return l.trim(); })
          .filter(function (l) { return l !== ''; });
      })
      .filter(function (lines) { return lines.length > 0; });
  }

  /* ======================================================================
     4. 单个课程块的解析  ← 核心
     期望形态（教务系统）：
        课程名
        （教学班，可选）
        教师
        2-3,5-6,9-18([周])[01-02节]
        教室
     但会尽量兼容「周次和节次分两行」「没有教师」「没有教室」等情况。
     ====================================================================== */
  function parseBlock(lines, day, fallbackCodes) {
    if (!lines || !lines.length) return null;

    var wpIdx = -1, weeks = [], codes = [], weeksText = '';

    // ① 先找「周次 + 节次」写在同一行的情况
    for (var i = 0; i < lines.length; i++) {
      var m = WP_RE.exec(lines[i]);
      if (m) {
        wpIdx = i;
        weeksText = m[1].replace(/\s/g, '');
        weeks = expandWeeks(weeksText);
        codes = expandCodes(m[2]);
        break;
      }
    }

    // ② 退一步：分别找「周次行」和「节次行」
    var weekIdx = -1, periodIdx = -1;
    if (wpIdx < 0) {
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (weekIdx < 0 && WEEK_ONLY_RE.test(line)) {
          weekIdx = j;
          weeksText = line.replace(/第|周|\s/g, '');
          weeks = expandWeeks(weeksText);
          continue;
        }
        if (periodIdx < 0 && /节/.test(line)) {
          var pm = PERIOD_TOKEN.exec(line);
          if (pm) { periodIdx = j; codes = expandCodes(pm[1]); }
        }
      }
      // 一行里只有周次（没有「周」字结尾，如「2-3,5-6,9-18」）
      if (weekIdx < 0) {
        for (var k = lines.length - 1; k >= 0; k--) {
          if (/^[\d,\-\s]+$/.test(lines[k]) && /\d/.test(lines[k])) {
            var cand = expandWeeks(lines[k]);
            if (cand.length) { weekIdx = k; weeks = cand; weeksText = lines[k].replace(/\s/g, ''); break; }
          }
        }
      }
    }

    var metaIdx = wpIdx >= 0 ? wpIdx : Math.max(weekIdx, periodIdx);

    // ③ 教师 = 周次/节次行的上一行；课程名 = 再往前的所有行
    var teacher = '';
    var nameLines = [];
    if (metaIdx > 0) {
      teacher = lines[metaIdx - 1];
      nameLines = lines.slice(0, metaIdx - 1);
    }
    if (!nameLines.length) {
      nameLines = [lines[0]];
      if (metaIdx <= 0 && lines.length > 1 && !teacher) teacher = lines[1] || '';
    }

    var name = nameLines.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (!name) name = lines[0];
    if (!name) return null;

    // 一个「名字」如果本身就是周次/节次表达式，说明这一块没有课程名，丢弃
    if (WP_RE.test(name) || WEEK_ONLY_RE.test(name)) return null;

    // ④ 教室：优先取元信息行之后的第一个像教室的行，否则取最后一行
    var room = '';
    if (metaIdx >= 0) {
      for (var r = metaIdx + 1; r < lines.length; r++) {
        if (ROOM_RE.test(lines[r])) { room = lines[r]; break; }
      }
      if (!room && metaIdx + 1 < lines.length && !/^\d/.test(lines[metaIdx + 1])) {
        room = lines[metaIdx + 1];
      }
    } else {
      for (var q = lines.length - 1; q >= 1; q--) {
        if (ROOM_RE.test(lines[q])) { room = lines[q]; break; }
      }
    }

    // ⑤ 教师行有时候其实是教室（没有教师的情况）
    if (teacher && ROOM_RE.test(teacher) && !room) { room = teacher; teacher = ''; }
    if (teacher && (WP_RE.test(teacher) || WEEK_ONLY_RE.test(teacher))) teacher = '';

    // ⑥ 没解析出节次时，沿用当前行对应的节次
    if (!codes.length && fallbackCodes && fallbackCodes.length) codes = fallbackCodes.slice();

    // ⑦ 既没有周次也没有节次线索，又带着分号，多半是「军事训练 1-18周;行业认知 1-18周」
    //    这类附注，不要当成课程收进来
    if (!weeks.length && !codes.length && /[;；]/.test(lines.join(''))) return null;

    return {
      name: name,
      teacher: teacher,
      room: room,
      day: day || 0,
      codes: codes,
      weeks: weeks,
      weeksText: weeksText || compressRanges(weeks)
    };
  }

  /* ======================================================================
     5. 从「二维表格」解析
     ====================================================================== */
  function findDayHeaderRow(rows) {
    for (var r = 0; r < Math.min(rows.length, 8); r++) {
      var hits = 0;
      for (var c = 0; c < rows[r].length; c++) {
        if (DAY_RE.test(normalizeCell(rows[r][c]))) hits++;
      }
      if (hits >= 5) return r;
    }
    return -1;
  }

  function findColumnHeaderRow(rows) {
    var best = { row: -1, map: null, hits: 0 };
    for (var r = 0; r < Math.min(rows.length, 6); r++) {
      var map = {}, hits = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var txt = normalizeCell(rows[r][c]).replace(/\s/g, '');
        if (!txt || txt.length > 8) continue;
        for (var p = 0; p < COL_PATTERNS.length; p++) {
          if (COL_PATTERNS[p].re.test(txt) && map[COL_PATTERNS[p].key] === undefined) {
            map[COL_PATTERNS[p].key] = c;
            hits++;
            break;
          }
        }
      }
      if (hits > best.hits) best = { row: r, map: map, hits: hits };
    }
    return best.hits >= 3 ? best : null;
  }

  /** 解析「课程名 / 教师 / 教室 / 星期 / 节次 / 周次」这种手工表格 */
  function fromColumns(rows, header) {
    var courses = [], events = [], warnings = [];
    var map = header.map;

    for (var r = header.row + 1; r < rows.length; r++) {
      var row = rows[r];
      function cell(key) {
        var idx = map[key];
        return idx === undefined ? '' : normalizeCell(row[idx]);
      }
      var name = cell('name') || cell('title');
      if (!name) continue;

      var dateVal = cell('date');
      var startVal = cell('start');
      var isEvent = (map.name === undefined && map.title !== undefined) || (!!dateVal && !cell('day'));

      if (isEvent && dateVal) {
        var d = U.parseDate(dateVal.replace(/[年月]/g, '-').replace(/日/g, ''));
        if (!d) {
          var alt = parseDateTimeLoose(dateVal);
          d = alt ? alt.date : null;
          if (alt && !startVal) startVal = alt.time;
        }
        if (d) {
          events.push({
            title: name,
            date: U.fmtDate(d),
            start: normalizeTime(startVal) || '',
            end: normalizeTime(cell('end')) || '',
            location: cell('room'),
            note: cell('note'),
            allDay: !startVal
          });
          continue;
        }
      }

      var day = 0;
      var dayM = DAY_RE.exec(cell('day')) || DAY_RE.exec(cell('weeks'));
      if (dayM) day = DAY_MAP[dayM[1]] || 0;
      if (!day) {
        var dnum = /^([1-7])$/.exec(cell('day'));
        if (dnum) day = Number(dnum[1]);
      }
      if (!day) { warnings.push('第 ' + (r + 1) + ' 行「' + U.truncate(name, 12) + '」没有可识别的星期，已跳过。'); continue; }

      var codes = expandCodes(cell('codes'));
      var weeks = expandWeeks(cell('weeks'));

      courses.push({
        name: name,
        teacher: cell('teacher'),
        room: cell('room'),
        day: day,
        codes: codes,
        weeks: weeks,
        weeksText: compressRanges(weeks)
      });
    }
    return { courses: courses, events: events, warnings: warnings };
  }

  /** 解析教务系统那种「节次行 × 星期列」的网格 */
  function fromWeekdayGrid(rows, headerRow, periods) {
    var courses = [], notes = [], warnings = [];

    var dayOfCol = {};
    rows[headerRow].forEach(function (v, c) {
      var m = DAY_RE.exec(normalizeCell(v));
      if (m) dayOfCol[c] = DAY_MAP[m[1]];
    });

    var periodByRow = {};      // row -> {label, codes, start, end}
    var detected = [];

    // 先扫一遍：这张表有没有「节次列」（第一列形如「第1 2节 / (01,02) / 08:30-09:55」）？
    // 有的话，非节次行（比如最后那行「军事训练 1-18周」的附注）就只当备注，
    // 绝不能当成课程，否则会凭空多出一条没有星期、没有教室的假课。
    var periodRows = {};
    for (var pr = headerRow + 1; pr < rows.length; pr++) {
      var pf = normalizeCell(rows[pr][0]);
      if (/节/.test(pf) && /\d/.test(pf) && !WEEK_ONLY_RE.test(pf)) periodRows[pr] = true;
    }
    var hasPeriodColumn = Object.keys(periodRows).length >= 2;

    for (var r = headerRow + 1; r < rows.length; r++) {
      var first = normalizeCell(rows[r][0]);
      var isPeriodRow = !!periodRows[r];
      var fallbackCodes = null;

      if (isPeriodRow) {
        var codes = [];
        var cm = /\(([\d,，]+)\)/.exec(first);
        if (cm) codes = expandCodes(cm[1].replace(/，/g, ','));
        if (!codes.length) {
          var pm = PERIOD_TOKEN.exec(first);
          if (pm) codes = expandCodes(pm[1]);
        }
        var tm = /(\d{1,2}:\d{2})\s*[-－~至]\s*(\d{1,2}:\d{2})/.exec(first);
        var label = first.split('\n')[0].trim();
        var p = { label: label, codes: codes, start: tm ? tm[1] : '', end: tm ? tm[2] : '' };
        periodByRow[r] = p;
        detected.push(p);
        fallbackCodes = codes;
      } else if (hasPeriodColumn) {
        // 有节次列，但这一行不是节次行 → 是说明 / 附注行
        collectNoteCells(rows[r], notes);
        continue;
      } else {
        // 整张表都没有节次列：用它所在「块」的节次（往前找最近的一个节次行）
        for (var back = r - 1; back > headerRow; back--) {
          if (periodByRow[back]) { fallbackCodes = periodByRow[back].codes; break; }
        }
      }

      Object.keys(dayOfCol).forEach(function (colKey) {
        var c = Number(colKey);
        var text = normalizeCell(rows[r][c]);
        if (!text) return;
        var blocks = splitBlocks(text);
        blocks.forEach(function (lines) {
          var item = parseBlock(lines, dayOfCol[c], fallbackCodes);
          if (item) courses.push(item);
        });
      });
    }

    var mergedPeriods = detected.length ? mergePeriods(periods, detected) : periods;
    return { courses: courses, notes: notes, periods: mergedPeriods, warnings: warnings };
  }

  /** 把一行里的说明文字收进备注（跳过第一列和空单元格） */
  function collectNoteCells(row, notes) {
    for (var c = 1; c < row.length; c++) {
      var t = normalizeCell(row[c]);
      if (!t || WEEK_ONLY_RE.test(t)) continue;
      t.split(/[;；]/).forEach(function (piece) {
        piece = piece.replace(/^[：:\s]+/, '').trim();
        if (piece) notes.push(piece);
      });
    }
  }

  /** 把检测到的节次信息合并进默认节次表（按 codes 对齐） */
  function mergePeriods(base, detected) {
    if (!detected.length) return base;
    var out = detected.map(function (p) {
      return { label: p.label || periodLabel(p.codes), codes: p.codes.slice(), start: p.start, end: p.end };
    });
    // 如果检测结果里有的节次缺时间，从默认表补
    out.forEach(function (p) {
      if (p.start && p.end) return;
      for (var i = 0; i < base.length; i++) {
        if (sameCodes(base[i].codes, p.codes)) {
          p.start = p.start || base[i].start;
          p.end = p.end || base[i].end;
          break;
        }
      }
    });
    return out;
  }

  function sameCodes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function periodLabel(codes) {
    if (!codes || !codes.length) return '第 ? 节';
    if (codes.length === 1) return '第' + codes[0] + '节';
    return '第' + codes[0] + ' ' + codes[codes.length - 1] + '节';
  }

  /**
   * 主入口：二维表格 -> 课程 / 事务
   * 依次尝试：手工列式表 -> 教务系统网格 -> 任意非空单元格兜底
   */
  function fromGrid(rows, options) {
    options = options || {};
    var periods = (options.periods && options.periods.length) ? options.periods : defaultPeriods();
    var warnings = [], notes = [], courses = [], events = [];
    var meta = options.meta || {};
    var usedPeriods = periods;

    if (!rows || !rows.length) {
      return { kind: 'schedule', meta: meta, periods: periods, courses: [], events: [], notes: [], warnings: ['没有读到任何表格内容。'] };
    }

    // 清理：去掉完全空白的行
    rows = rows.filter(function (r) {
      return r.some(function (c) { return normalizeCell(c) !== ''; });
    });
    if (!rows.length) {
      return { kind: 'schedule', meta: meta, periods: periods, courses: [], events: [], notes: [], warnings: ['表格是空的。'] };
    }

    // 从表头里抓学期 / 姓名等信息
    for (var i = 0; i < Math.min(rows.length, 3); i++) {
      var joined = rows[i].map(normalizeCell).join(' ');
      if (/学年学期|学期：|班级：|专业：|院系：|学号/.test(joined)) {
        meta = Object.assign({}, parseMetaLine(joined), meta);
      }
      var tm = /(\d{4})\s*[-－]\s*(\d{4})\s*[-－]\s*([12])/.exec(joined);
      if (tm && !meta.term) meta.term = tm[1] + '-' + tm[2] + '-' + tm[3];
      if (!meta.student) {
        var sm = /^(.{2,10}?(?:大学|学院))\s+([\u4e00-\u9fa5]{2,4})\s+学生个人课表/.exec(joined.trim());
        if (sm) { meta.school = sm[1]; meta.student = sm[2]; }
      }
    }

    var colHeader = findColumnHeaderRow(rows);
    var dayHeaderRow = findDayHeaderRow(rows);

    // 优先用「手工列式表」，但它必须真的认出足够多的列
    if (colHeader && (!dayHeaderRow || colHeader.hits >= 4)) {
      var colRes = fromColumns(rows, colHeader);
      if (colRes.courses.length || colRes.events.length) {
        courses = colRes.courses;
        events = colRes.events;
        warnings = warnings.concat(colRes.warnings);
        if (!notes.length) notes = collectNoteRows(rows, colHeader.row);
        return finish();
      }
    }

    if (dayHeaderRow >= 0) {
      var gridRes = fromWeekdayGrid(rows, dayHeaderRow, periods);
      courses = gridRes.courses;
      notes = notes.concat(gridRes.notes);
      warnings = warnings.concat(gridRes.warnings);
      usedPeriods = gridRes.periods;
      if (!courses.length) warnings.push('找到了星期表头，但没在课表格子里认出课程。可能是课表页面还没加载完，或者格式比较特殊。');
      return finish();
    }

    // 兜底：把每个非空单元格都当成一个课程块
    var anyCodes = null;
    for (var r2 = 0; r2 < rows.length; r2++) {
      for (var c2 = 0; c2 < rows[r2].length; c2++) {
        if (rows[r2][c2] !== null && String(rows[r2][c2]).trim() === '') continue;
        var parsed = parseBlock(splitBlocks(rows[r2][c2])[0] || [], 0, anyCodes);
        if (parsed) courses.push(parsed);
      }
    }
    if (courses.length) {
      warnings.push('没有识别到「星期」表头，已按通用格式尽力解析，请核对星期和节次是否正确。');
    } else {
      warnings.push('没能从这份内容里认出课程。可以试试直接上传教务系统导出的 .xls 文件，识别率最高。');
    }
    return finish();

    function finish() {
      courses = dedupeCourses(courses);
      return {
        kind: 'schedule',
        meta: meta,
        periods: usedPeriods,
        courses: courses,
        events: events,
        notes: uniqStrings(notes),
        warnings: warnings
      };
    }
  }

  function collectNoteRows(rows, headerRow) {
    var notes = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
      var row = rows[r];
      // 只有第一格有内容、其它都空 → 当作备注
      var nonEmpty = row.filter(function (c) { return normalizeCell(c) !== ''; });
      if (nonEmpty.length === 1 && normalizeCell(row[0]) !== '') {
        normalizeCell(row[0]).split(/[;；]/).forEach(function (p) {
          p = p.replace(/^[：:]\s*/, '').trim();
          if (p && p.length < 80) notes.push(p);
        });
      }
    }
    return notes;
  }

  /** 去重：同课程 + 同星期 + 同节次 + 同周次 视为重复 */
  function dedupeCourses(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      var key = [c.name, c.teacher || '', c.room || '', c.day,
        (c.codes || []).join('-'), (c.weeks || []).join('-')].join('|');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(c);
    });
    return out;
  }

  function uniqStrings(arr) {
    var seen = {}, out = [];
    arr.forEach(function (s) {
      s = String(s || '').trim();
      if (!s || seen[s]) return;
      seen[s] = 1;
      out.push(s);
    });
    return out;
  }

  /* ======================================================================
     6. 元信息行解析
     ====================================================================== */
  function parseMetaLine(line) {
    var meta = {};
    function grab(re, key, trimTail) {
      var m = re.exec(line);
      if (!m) return;
      var v = m[1].trim();
      if (trimTail) v = v.replace(/\s{2,}.*$/, '').trim();
      if (v) meta[key] = v;
    }
    grab(/学年学期[：:]\s*([0-9]{4}\s*[-－]\s*[0-9]{4}\s*[-－]\s*[12])/, 'term');
    grab(/班级[：:]\s*([^\s]+)/, 'className');
    grab(/专业[：:]\s*(.+?)(?=\s{2,}|院系|$)/, 'major');
    grab(/院系[：:]\s*(.+?)(?=\s{2,}|打印|$)/, 'college');
    grab(/学号[：:]\s*([0-9A-Za-z]+)/, 'studentId');
    grab(/打印日期[：:]\s*([\d\-－/]+)/, 'printedAt');
    if (meta.term) meta.term = meta.term.replace(/\s/g, '');
    return meta;
  }

  /* ======================================================================
     7. HTML 表格 -> 二维数组（正确处理 rowspan / colspan）
     ====================================================================== */
  function tableToGrid(table) {
    var rows = [];
    var pending = {};   // col -> { text, left }

    var trs = table.querySelectorAll('tr');
    for (var r = 0; r < trs.length; r++) {
      var cells = trs[r].children;
      var row = [];
      var col = 0;

      // 先把上一行 rowspan 遗留下来的格子填进去
      function fillPending(c) {
        while (pending[c] && pending[c].left > 0) {
          row[c] = pending[c].text;
          pending[c].left--;
          if (pending[c].left === 0) delete pending[c];
          c++;
        }
        return c;
      }

      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
        col = fillPending(col);

        var text = cellText(cell);
        var cs = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
        var rs = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1);

        for (var k = 0; k < cs; k++) {
          row[col + k] = text;
          if (rs > 1) pending[col + k] = { text: text, left: rs - 1 };
        }
        col += cs;
      }

      // 补齐尾部遗留
      col = fillPending(col);
      for (var c2 = 0; c2 < row.length; c2++) if (row[c2] === undefined) row[c2] = '';
      rows.push(row);
    }

    // 变成矩形
    var width = 0;
    rows.forEach(function (r) { width = Math.max(width, r.length); });
    rows = rows.map(function (r) {
      var copy = r.slice();
      while (copy.length < width) copy.push('');
      for (var i = 0; i < copy.length; i++) if (copy[i] === undefined) copy[i] = '';
      return copy;
    });
    return rows;
  }

  /**
   * 取单元格文本：把 <br> 换成换行，块级元素之间也补换行，
   * 这样就能得到和 .xls 单元格一致的「多行 + 空行分块」结构。
   */
  function cellText(node) {
    var BLOCK = { DIV: 1, P: 1, LI: 1, TR: 1, TABLE: 1, SECTION: 1, UL: 1, OL: 1, H1: 1, H2: 1, H3: 1, H4: 1, BR: 1 };
    var out = '';

    function walk(n) {
      for (var i = 0; i < n.childNodes.length; i++) {
        var child = n.childNodes[i];
        if (child.nodeType === 3) {
          out += child.nodeValue;
          continue;
        }
        if (child.nodeType !== 1) continue;
        var tag = child.tagName;
        if (tag === 'BR') { out += '\n'; continue; }
        if (tag === 'SCRIPT' || tag === 'STYLE') continue;
        if (BLOCK[tag]) {
          out += '\n';
          walk(child);
          out += '\n';
        } else {
          walk(child);
        }
      }
    }
    walk(node);

    return out
      .replace(/\r/g, '')
      .replace(/[ \t\u00a0]+/g, ' ')
      .split('\n').map(function (l) { return l.trim(); }).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 从一整段 HTML 里抽取所有表格，逐个解析，取识别到课程最多的那个结果 */
  function fromHtml(html) {
    var doc;
    try {
      doc = new DOMParser().parseFromString(html, 'text/html');
    } catch (e) {
      return fromText(html.replace(/<[^>]+>/g, ' '));
    }

    var best = null;
    var tables = doc.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var grid;
      try { grid = tableToGrid(tables[i]); } catch (e) { continue; }
      if (!grid.length) continue;
      var res = fromGrid(grid);
      if (!best || res.courses.length > best.courses.length) best = res;
    }

    if (best && (best.courses.length || best.events.length)) {
      best.sourceFormat = 'html';
      return best;
    }

    // 没有表格，退化成纯文本
    var text = doc.body ? doc.body.innerText || doc.body.textContent || '' : '';
    var fallback = fromText(text);
    if (best && best.warnings.length) fallback.warnings = fallback.warnings.concat(best.warnings);
    return fallback;
  }

  /* ======================================================================
     8. 纯文本 / CSV
     ====================================================================== */
  /** 从纯文本里按「空行分块」找出课程 */
  function fromPlainText(text) {
    var lines = normalizeCell(text).split('\n');
    var courses = [], notes = [], warnings = [], meta = {};

    // 先尝试整体元信息
    var head = lines.slice(0, 4).join(' ');
    if (/学年学期|班级：|学期：/.test(head)) meta = parseMetaLine(head);

    // 按空行切块，同时记录块前最近的「星期X」
    var currentDay = 0;
    var blocks = [];
    var buf = [];
    lines.forEach(function (line) {
      var dayM = DAY_RE.exec(line);
      if (line.trim() === '') {
        if (buf.length) { blocks.push({ lines: buf, day: currentDay }); buf = []; }
        return;
      }
      if (dayM && line.trim().length <= 6) { currentDay = DAY_MAP[dayM[1]] || 0; return; }
      if (WEEK_ONLY_RE.test(line.trim()) && line.trim().length <= 12 && !buf.length) return;
      buf.push(line.trim());
    });
    if (buf.length) blocks.push({ lines: buf, day: currentDay });

    blocks.forEach(function (b) {
      var item = parseBlock(b.lines, b.day);
      if (item && item.codes.length) courses.push(item);
      else if (item && item.day) courses.push(item);
      else if (b.lines.length === 1 && /周/.test(b.lines[0]) && b.lines[0].length < 60) notes.push(b.lines[0]);
    });

    if (!courses.length) warnings.push('这段文字里没有认出课程。');
    return {
      kind: 'schedule', meta: meta, periods: defaultPeriods(),
      courses: dedupeCourses(courses), events: [],
      notes: uniqStrings(notes), warnings: warnings
    };
  }

  /** 自动判断一段文本是什么格式 */
  function fromText(text, fileName) {
    text = String(text || '');
    var trimmed = text.trim();

    // JSON 备份
    if (trimmed.charAt(0) === '{') {
      var jsonRes = fromJsonText(trimmed);
      if (jsonRes) return jsonRes;
    }
    // HTML 表格
    if (/<table[\s>]/i.test(trimmed) || /<tr[\s>]/i.test(trimmed)) {
      return fromHtml(trimmed);
    }
    // ICS
    if (/BEGIN:VCALENDAR/i.test(trimmed)) {
      var ev = fromIcs(trimmed);
      ev.sourceFormat = 'ics';
      return ev;
    }
    // CSV / TSV
    var ext = U.fileExt(fileName || '');
    if (ext === 'csv' || ext === 'tsv' || /\t/.test(trimmed) || /,/.test(trimmed.split('\n')[0])) {
      var gridRes = tryCsv(trimmed);
      if (gridRes && (gridRes.courses.length || gridRes.events.length)) return gridRes;
    }
    return fromPlainText(trimmed);
  }

  function tryCsv(text) {
    try {
      var sheet = CW.readCsv(text);
      if (sheet && sheet.sheets && sheet.sheets.length) {
        return fromGrid(sheet.sheets[0].rows);
      }
    } catch (e) { /* 落到纯文本 */ }
    return null;
  }

  /* ======================================================================
     9. JSON
     ====================================================================== */
  function fromJsonText(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return null; }
    if (!obj || typeof obj !== 'object') return null;

    // 本页导出的完整备份
    if (obj.kind === 'cw-backup' || obj.schedule || obj.todo) {
      return { kind: 'backup', backup: obj, warnings: [], courses: [], events: [] };
    }
    // 本页导出的日程文档
    if (obj.kind === 'cw-schedule' || (obj.courses && Array.isArray(obj.courses))) {
      return {
        kind: 'schedule',
        meta: obj.meta || {},
        periods: (obj.periods && obj.periods.length) ? obj.periods : defaultPeriods(),
        courses: dedupeCourses(obj.courses || []),
        events: Array.isArray(obj.events) ? obj.events : [],
        notes: obj.notes || [],
        settings: obj.settings || null,
        warnings: [],
        sourceFormat: 'json'
      };
    }
    return null;
  }

  /* ======================================================================
     10. ICS 日历
     ====================================================================== */
  function unfoldIcs(text) {
    return String(text)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n[ \t]/g, '');     // RFC 5545 折行
  }

  function unescapeIcs(s) {
    return String(s || '')
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /** 20260920T090000 / 20260920T090000Z / 20260920 / 2026-09-20 */
  function parseIcsDate(value, params) {
    if (!value) return null;
    var v = String(value).trim();
    var isDate = /VALUE=DATE(?!-TIME)/i.test(params || '');
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (m) {
      var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
      var date = new Date(y, mo, d);
      if (m[4] !== undefined) {
        var hh = Number(m[4]), mi = Number(m[5]), ss = m[6] ? Number(m[6]) : 0;
        if (m[7] === 'Z') {
          // UTC -> 本地
          var utc = Date.UTC(y, mo, d, hh, mi, ss);
          var local = new Date(utc);
          return { date: new Date(local.getFullYear(), local.getMonth(), local.getDate()), time: pad2(local.getHours()) + ':' + pad2(local.getMinutes()) };
        }
        return { date: date, time: pad2(hh) + ':' + pad2(mi) };
      }
      return { date: date, time: '', allDay: true || isDate };
    }
    var loose = parseDateTimeLoose(v);
    return loose ? { date: loose.date, time: loose.time } : null;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** 尽量宽松地解析「2026年9月20日 09:00」「2026/9/20 9:00」「9月20日」 */
  function parseDateTimeLoose(str) {
    var s = String(str || '').trim();
    if (!s) return null;
    var y, mo, d, hh = -1, mi = 0;
    var m = /(\d{4})\s*[年\-\/.]\s*(\d{1,2})\s*[月\-\/.]\s*(\d{1,2})/.exec(s);
    if (m) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
    else {
      var m2 = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(s);
      if (m2) { y = new Date().getFullYear(); mo = Number(m2[1]); d = Number(m2[2]); }
      else {
        var m3 = /^(\d{1,2})\s*[\/\-]\s*(\d{1,2})$/.exec(s);
        if (m3) { y = new Date().getFullYear(); mo = Number(m3[1]); d = Number(m3[2]); }
      }
    }
    if (y === undefined) return null;
    var tm = /(\d{1,2})\s*[：:]\s*(\d{2})/.exec(s);
    if (tm) { hh = Number(tm[1]); mi = Number(tm[2]); }
    var date = new Date(y, mo - 1, d);
    if (isNaN(date.getTime())) return null;
    return { date: date, time: hh >= 0 ? pad2(hh) + ':' + pad2(mi) : '' };
  }

  function normalizeTime(t) {
    var m = /^(\d{1,2})\s*[：:]\s*(\d{1,2})/.exec(String(t || ''));
    if (!m) return '';
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return '';
    return pad2(h) + ':' + pad2(mi);
  }

  function fromIcs(text) {
    var lines = unfoldIcs(text).split('\n');
    var events = [], warnings = [];
    var cur = null;
    var MAX_INSTANCES = 400;

    lines.forEach(function (raw) {
      var line = raw;
      if (!line) return;
      var colon = line.indexOf(':');
      if (colon < 0) return;
      var keyPart = line.slice(0, colon);
      var value = line.slice(colon + 1);
      var semi = keyPart.indexOf(';');
      var key = (semi < 0 ? keyPart : keyPart.slice(0, semi)).toUpperCase();
      var params = semi < 0 ? '' : keyPart.slice(semi + 1);

      if (key === 'BEGIN' && value.toUpperCase() === 'VEVENT') { cur = { params: {}, rrule: '' }; return; }
      if (key === 'END' && value.toUpperCase() === 'VEVENT') {
        if (cur) pushEvent(cur);
        cur = null;
        return;
      }
      if (!cur) return;

      if (key === 'SUMMARY') cur.title = unescapeIcs(value);
      else if (key === 'LOCATION') cur.location = unescapeIcs(value);
      else if (key === 'DESCRIPTION') cur.note = unescapeIcs(value);
      else if (key === 'UID') cur.uid = value.trim();
      else if (key === 'DTSTART') cur.startRaw = parseIcsDate(value, params);
      else if (key === 'DTEND') cur.endRaw = parseIcsDate(value, params);
      else if (key === 'RRULE') cur.rrule = value.trim();
    });

    function pushEvent(ev) {
      if (!ev.title && !ev.startRaw) return;
      var title = ev.title || '(无标题事件)';
      var start = ev.startRaw;
      if (!start) { warnings.push('「' + U.truncate(title, 14) + '」没有开始时间，已跳过。'); return; }

      var endTime = ev.endRaw ? ev.endRaw.time : '';
      var allDay = !start.time;
      var base = {
        title: title,
        location: ev.location || '',
        note: ev.note || '',
        allDay: allDay,
        start: start.time || '',
        end: endTime || '',
        repeat: 'none',
        color: U.hashIndex(title, 8)
      };

      var dates = expandRrule(start.date, ev.rrule, MAX_INSTANCES);
      dates.forEach(function (d) {
        var item = Object.assign({}, base, { date: U.fmtDate(d), uid: (ev.uid || '') + '@' + U.fmtDate(d) });
        events.push(item);
      });
    }

    if (!events.length && !warnings.length) warnings.push('这份 .ics 里没有找到事件。');
    return {
      kind: 'ics', meta: {}, periods: defaultPeriods(),
      courses: [], events: events, notes: [], warnings: warnings
    };
  }

  /** 只支持最常用的几种重复规则：WEEKLY / DAILY，COUNT 或 UNTIL */
  function expandRrule(startDate, rrule, max) {
    if (!rrule) return [startDate];
    var parts = {};
    rrule.split(';').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) parts[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1);
    });
    var freq = (parts.FREQ || '').toUpperCase();
    if (freq !== 'WEEKLY' && freq !== 'DAILY' && freq !== 'MONTHLY') return [startDate];

    var count = parts.COUNT ? Math.min(Number(parts.COUNT) || 1, max) : 120;
    var until = parts.UNTIL ? (parseIcsDate(parts.UNTIL, '') || {}).date : null;
    var step = freq === 'WEEKLY' ? 7 : (freq === 'MONTHLY' ? 0 : (Number(parts.INTERVAL) || 1));

    var out = [], d = new Date(startDate.getTime());
    for (var n = 0; n < count && out.length < max; n++) {
      if (until && d > until) break;
      out.push(new Date(d.getTime()));
      if (freq === 'MONTHLY') d = new Date(d.getFullYear(), d.getMonth() + (Number(parts.INTERVAL) || 1), d.getDate());
      else d = U.addDays(d, step * (freq === 'WEEKLY' ? (Number(parts.INTERVAL) || 1) : 1));
    }
    return out;
  }

  /* ======================================================================
     11. 导出
     ====================================================================== */
  CW.parse = {
    defaultPeriods: defaultPeriods,
    expandWeeks: expandWeeks,
    expandCodes: expandCodes,
    compressRanges: compressRanges,
    periodLabel: periodLabel,
    splitBlocks: splitBlocks,
    parseBlock: parseBlock,
    parseMetaLine: parseMetaLine,
    normalizeTime: normalizeTime,
    parseDateTimeLoose: parseDateTimeLoose,
    parseIcsDate: parseIcsDate,
    tableToGrid: tableToGrid,
    cellText: cellText,

    fromGrid: fromGrid,
    fromHtml: fromHtml,
    fromText: fromText,
    fromPlainText: fromPlainText,
    fromIcs: fromIcs,
    fromJsonText: fromJsonText,
    dedupeCourses: dedupeCourses,
    defaultColor: function (name) { return U.hashIndex(String(name || '').replace(/\s*\(.*$/, '').trim(), 8); }
  };
})();
