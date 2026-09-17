/*!
 * xls.js - dependency-free spreadsheet reader for the browser.
 *
 * Reads, into one common shape { sheets: [ { name, rows } ] } where `rows` is a
 * rectangular 2-D array of strings/numbers/booleans:
 *
 *   - legacy BIFF8 .xls  (OLE2 / Compound File Binary container, the format the
 *     教务系统 exports), including shared strings split across CONTINUE records
 *   - .xlsx / .xlsm      (ZIP + DecompressionStream('deflate-raw'), no zip library)
 *   - .csv / .tsv / .txt (RFC-4180-ish, delimiter auto-detected)
 *
 * Classic script, no ES modules, no build step: it works from file:// too.
 */
(function (global) {
  'use strict';

  var CW = global.CW = global.CW || {};

  /* ==================================================================== *
   *  small shared helpers
   * ==================================================================== */

  /** Latin-1 ("compressed" BIFF string) -> JS string.
   *  Byte-for-byte: NO UTF-8 decoding is attempted. BIFF only tells us the
   *  text is UTF-16LE through the fHighByte flag; when that flag is 0 the
   *  bytes really are single-byte characters (code page 1252 / Latin-1). */
  function latin1(bytes, start, end) {
    var s = '';
    var i;
    for (i = start; i < end; i++) s += String.fromCharCode(bytes[i] & 0xff);
    return s;
  }

  /** UTF-16LE bytes -> JS string (surrogate pairs fall out naturally). */
  function utf16le(bytes, start, end) {
    var s = '';
    var i;
    for (i = start; i + 1 < end; i += 2) {
      s += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    }
    return s;
  }

  function trimText(s) {
    // trim() would also eat interior-looking \u00a0 runs. We only strip the
    // usual whitespace at both ends; interior \n (stacked course entries) and
    // interior spaces are preserved exactly.
    if (typeof s !== 'string') return s;
    return s.replace(/^[\s\uFEFF\xA0]+/, '').replace(/[\s\uFEFF\xA0]+$/, '');
  }

  function isBlank(v) {
    return v === '' || v === undefined || v === null;
  }

  /** Compute the max content column of a sparse/dense grid. */
  function contentColCount(grid, rowCount) {
    var max = 0;
    var r, row, c;
    for (r = 0; r < rowCount; r++) {
      row = grid[r];
      if (!row) continue;
      for (c = row.length - 1; c >= 0; c--) {
        if (!isBlank(row[c])) {
          if (c + 1 > max) max = c + 1;
          break;
        }
      }
    }
    return max;
  }

  function isEmptyGridRow(row, cols) {
    var c;
    if (!row) return true;
    for (c = 0; c < cols; c++) if (!isBlank(row[c])) return false;
    return true;
  }

  /**
   * Turn a sparse grid into the promised rectangle:
   * every row has the same length (the sheet's maximum used column count),
   * short rows are padded with "", fully-empty trailing rows are dropped,
   * empty cells are "" (never undefined / null).
   */
  function finalizeRows(grid, rowCount) {
    var cols = contentColCount(grid, rowCount);
    var last = -1;
    var r, c, row, out;

    for (r = 0; r < rowCount; r++) {
      if (!isEmptyGridRow(grid[r], cols)) last = r;
    }

    out = [];
    for (r = 0; r <= last; r++) {
      row = grid[r] || [];
      var padded = new Array(cols);
      for (c = 0; c < cols; c++) {
        var v = row[c];
        padded[c] = (v === undefined || v === null) ? '' : v;
      }
      out.push(padded);
    }
    return out;
  }

  /** Sparse grid with automatic growing; cell indices are 0-based. */
  function Grid() {
    this.rows = [];
    this.usedRows = 0;
  }
  Grid.prototype.set = function (r, c, value) {
    if (r < 0 || c < 0) return;
    var row = this.rows[r];
    if (!row) { row = this.rows[r] = []; }
    row[c] = value;
    if (r + 1 > this.usedRows) this.usedRows = r + 1;
  };
  Grid.prototype.finalize = function () {
    return finalizeRows(this.rows, this.usedRows);
  };

  /* ==================================================================== *
   *  OLE2 / Compound File Binary reader
   * ==================================================================== */

  var CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  var FREESECT = 0xffffffff;
  var ENDOFCHAIN = 0xfffffffe;
  var FATSECT = 0xfffffffd;
  var DIFSECT = 0xfffffffc;

  function hasCfbSignature(u8) {
    var i;
    if (u8.length < 8) return false;
    for (i = 0; i < 8; i++) if (u8[i] !== CFB_SIG[i]) return false;
    return true;
  }

  /**
   * Minimal but real CFB reader.
   * Returns { entryName: Uint8Array, ... }.
   *
   * `tolerant` (used by readXls) swallows structural damage from a truncated or
   * half-downloaded file and returns whatever streams could be recovered, so a
   * bad upload degrades into "no data" instead of an exception. When tolerant is
   * false the reader throws, which is what readSheet's sniffing path wants when
   * it has to decide whether a file really is an OLE2 container.
   */
  function readCfb(u8, tolerant) {
    if (!hasCfbSignature(u8)) {
      throw new Error('不是有效的 .xls 文件（缺少 OLE2 复合文档签名）。');
    }
    if (u8.length < 512) {
      if (tolerant) return {};
      throw new Error('这个 .xls 文件不完整（连 512 字节的文件头都没有）。');
    }
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

    var sectorSize = 1 << dv.getUint16(30, true);      // normally 1<<9  = 512
    var miniSize = 1 << dv.getUint16(32, true);        // normally 1<<6  = 64
    var numFatSectors = dv.getUint32(44, true);
    var dirStart = dv.getInt32(48, true);
    var miniCutoff = dv.getUint32(56, true);           // normally 4096
    var miniFatStart = dv.getInt32(60, true);
    var numMiniFatSectors = dv.getUint32(64, true);
    var difatStart = dv.getInt32(68, true);
    var numDifatSectors = dv.getUint32(72, true);

    if (sectorSize < 128 || sectorSize > 65536 || miniSize < 8 || miniSize > 4096) {
      if (tolerant) return {};
      throw new Error('这个 .xls 的扇区大小不正常，文件可能已损坏。');
    }

    var endOfChain = function (s) { return s === ENDOFCHAIN || s === FREESECT || s < 0; };
    var sectorOffset = function (s) { return 512 + s * sectorSize; };
    var maxSectors = Math.ceil(u8.length / sectorSize) + 2;
    var totalSectorsInFile = Math.floor((u8.length - 512) / sectorSize);
    var perFatSector = sectorSize >> 2;

    /* --- DIFAT: FAT sector numbers live in the header, then in DIFAT sectors --- */
    var fatSectorNumbers = [];
    var i, s, off, j;
    for (i = 0; i < 109; i++) {
      s = dv.getInt32(76 + i * 4, true);
      if (endOfChain(s) || s === FATSECT || s === DIFSECT) break;
      fatSectorNumbers.push(s);
    }
    var difatSeen = 0;
    s = difatStart;
    while (!endOfChain(s) && difatSeen++ <= numDifatSectors + 4 && fatSectorNumbers.length < maxSectors) {
      off = sectorOffset(s);
      if (off < 0 || off + sectorSize > u8.length) break;
      for (j = 0; j < perFatSector - 1; j++) {
        var v = dv.getInt32(off + j * 4, true);
        if (endOfChain(v)) continue;
        if (v === FATSECT || v === DIFSECT || v === FREESECT) continue;
        fatSectorNumbers.push(v);
      }
      s = dv.getInt32(off + (perFatSector - 1) * 4, true);
    }
    if (!fatSectorNumbers.length) {
      if (tolerant) return {};
      throw new Error('这个 .xls 里没有找到 FAT，文件已损坏。');
    }

    /* --- FAT --- */
    var fat = [];
    for (i = 0; i < fatSectorNumbers.length; i++) {
      off = sectorOffset(fatSectorNumbers[i]);
      if (off < 0 || off + sectorSize > u8.length) continue;
      for (j = 0; j < perFatSector; j++) fat.push(dv.getInt32(off + j * 4, true));
    }
    if (!fat.length) {
      if (tolerant) return {};
      throw new Error('这个 .xls 的 FAT 是空的，文件已损坏。');
    }

    var chain = function (start) {
      var out = [];
      var cur = start;
      var guard = 0;
      var seen = {};
      while (!endOfChain(cur) && guard++ <= maxSectors) {
        if (cur < 0 || cur >= fat.length) break;
        if (seen[cur]) break;             // cyclic chain -> corrupt, stop quietly
        seen[cur] = 1;
        out.push(cur);
        cur = fat[cur];
      }
      return out;
    };

    /* --- directory --- */
    var dirChain = chain(dirStart);
    var entries = [];
    var e, base;
    for (i = 0; i < dirChain.length * (sectorSize / 128); i++) {
      base = sectorOffset(dirChain[Math.floor(i / (sectorSize / 128))]) + (i % (sectorSize / 128)) * 128;
      if (base + 128 > u8.length) break;
      var nameLen = dv.getUint16(base + 64, true);
      var name = '';
      if (nameLen >= 2 && nameLen <= 64) name = utf16le(u8, base, base + nameLen - 2);
      entries.push({
        name: name,
        type: u8[base + 66],
        start: dv.getInt32(base + 116, true),
        size: dv.getUint32(base + 120, true)   // low 32 bits: fine below 4 GiB
      });
    }

    /* --- mini FAT + mini stream (streams < miniCutoff live there) --- */
    var miniFat = [];
    var mfChain = chain(miniFatStart);
    for (i = 0; i < mfChain.length; i++) {
      off = sectorOffset(mfChain[i]);
      if (off < 0 || off + sectorSize > u8.length) continue;
      for (j = 0; j < perFatSector; j++) miniFat.push(dv.getInt32(off + j * 4, true));
    }
    var miniFatChain = function (start) {
      var out = [];
      var cur = start;
      var guard = 0;
      var seen = {};
      while (!endOfChain(cur) && guard++ <= maxSectors) {
        if (cur < 0 || cur >= miniFat.length) break;
        if (seen[cur]) break;
        seen[cur] = 1;
        out.push(cur);
        cur = miniFat[cur];
      }
      return out;
    };

    var root = null;
    for (i = 0; i < entries.length; i++) if (entries[i].type === 5) { root = entries[i]; break; }
    var miniStreamChain = root ? chain(root.start) : [];
    var miniStreamOffsets = [];
    for (i = 0; i < miniStreamChain.length; i++) {
      miniStreamOffsets.push(sectorOffset(miniStreamChain[i]));
    }

    var readRegular = function (ent) {
      var out = new Uint8Array(ent.size);
      var pos = 0;
      var secs = chain(ent.start);
      for (i = 0; i < secs.length && pos < ent.size; i++) {
        off = sectorOffset(secs[i]);
        if (off < 0 || off >= u8.length) break;
        var n = Math.min(sectorSize, ent.size - pos, u8.length - off);
        if (n <= 0) break;
        out.set(u8.subarray(off, off + n), pos);
        pos += n;
      }
      return pos === ent.size ? out : out.subarray(0, pos);
    };

    var readMini = function (ent) {
      var out = new Uint8Array(ent.size);
      var pos = 0;
      var secs = miniFatChain(ent.start);
      for (i = 0; i < secs.length && pos < ent.size; i++) {
        // mini sector index -> byte offset inside the mini stream
        var mOff = secs[i] * miniSize;
        var secIdx = Math.floor(mOff / sectorSize);
        if (secIdx >= miniStreamOffsets.length) break;
        off = miniStreamOffsets[secIdx] + (mOff % sectorSize);
        if (off < 0 || off >= u8.length) break;
        var n = Math.min(miniSize, ent.size - pos, u8.length - off);
        if (n <= 0) break;
        out.set(u8.subarray(off, off + n), pos);
        pos += n;
      }
      return pos === ent.size ? out : out.subarray(0, pos);
    };

    var streams = {};
    var fatOk = function (start, f) {
      // The whole sector chain must lie inside the file; otherwise the file is
      // truncated, and a stream read would silently return half a document.
      var cur = start;
      var guard = 0;
      var seen = {};
      while (!endOfChain(cur) && guard++ <= maxSectors) {
        if (cur < 0 || cur >= totalSectorsInFile) return false;
        if (seen[cur]) break;
        seen[cur] = 1;
        if (cur >= f.length) return false;
        cur = f[cur];
      }
      return true;
    };

    for (i = 0; i < entries.length; i++) {
      e = entries[i];
      if (e.type !== 2 || e.size === 0 || !e.name) continue;
      try {
        if (e.size < miniCutoff && miniStreamOffsets.length) {
          if (!fatOk(e.start, miniFat)) throw new Error('mini chain outside file');
          streams[e.name] = readMini(e);
        } else {
          if (!fatOk(e.start, fat)) throw new Error('fat chain outside file');
          streams[e.name] = readRegular(e);
        }
      } catch (err) {
        // Unreadable/truncated stream: report the damage so readSheet can fall
        // back to treating the upload as text instead of showing garbage.
        if (!tolerant) throw new Error('这个 .xls 文件不完整或已损坏（流数据被截断）。');
      }
    }
    return streams;
  }

  /* ==================================================================== *
   *  BIFF (record stream) reader
   * ==================================================================== */

  /** Sequential reader over one or more blocks; `nextBlock` makes CONTINUE
   *  records transparent, which is exactly what BIFF string parsing needs. */
  function ByteCursor(blocks) {
    this.blocks = blocks || [];
    this.b = 0;
    this.o = 0;
  }
  ByteCursor.prototype.atEnd = function () {
    return this.b >= this.blocks.length;
  };
  ByteCursor.prototype.left = function () {
    if (this.b >= this.blocks.length) return 0;
    return this.blocks[this.b].length - this.o;
  };
  /** Move to the next block. Returns false when there is none left. */
  ByteCursor.prototype.nextBlock = function (charCount) {
    var expected = (charCount || 0) * 2;
    var i = this.b + 1;
    // A CONTINUE record can carry a trailing grbit byte for the string that
    // continues in it. Any other leading byte-length means it does not (or the
    // writer padded it); we simply advance and let the caller re-read grbit.
    if (i < this.blocks.length) {
      this.b = i;
      this.o = 0;
      return true;
    }
    return false;
  };
  ByteCursor.prototype.byte = function () {
    while (this.b < this.blocks.length && this.o >= this.blocks[this.b].length) {
      if (!this.nextBlock()) return 0;
    }
    if (this.b >= this.blocks.length) return 0;
    return this.blocks[this.b][this.o++];
  };
  ByteCursor.prototype.uint16 = function () {
    var lo = this.byte();
    var hi = this.byte();
    return (lo | (hi << 8)) >>> 0;
  };
  ByteCursor.prototype.uint32 = function () {
    var a = this.byte(), b = this.byte(), c = this.byte(), d = this.byte();
    return ((a | (b << 8) | (c << 16) | (d << 24)) >>> 0);
  };

  /** Read `count` characters using the 1-or-2-byte-per-char encoding that
   *  `high` selects, hopping to the next block when the current one runs dry.
   *  THE tricky bit of BIFF8: when the data of one string runs off the end of
   *  a continuation block, the remainder is prefixed by ONE fresh grbit byte
   *  inside the next block, which may switch the encoding mid-string. */
  function readChars(cur, count, high) {
    var s = '';
    var need = count;
    var width = high ? 2 : 1;
    while (need > 0) {
      if (cur.left() < width) {
        if (!cur.nextBlock(count)) break;
        // fresh option flags byte for the remainder of this very string
        var flags = cur.byte();
        width = (flags & 0x01) ? 2 : 1;
        continue;
      }
      if (width === 2) {
        s += String.fromCharCode(cur.uint16());
      } else {
        s += String.fromCharCode(cur.byte() & 0xff);
      }
      need--;
    }
    return s;
  }

  /** One BIFF8 unicode string: cch (2 bytes), grbit (1), [rich runs (2)],
   *  [ext data size (4)], characters, rich-run data, ext data. */
  function readBiffString(cur, hasCharCount) {
    var cch = hasCharCount ? cur.uint16() : 0;
    var flags = cur.byte();
    var high = (flags & 0x01) !== 0;
    var richRuns = 0;
    var extSize = 0;
    if (flags & 0x08) richRuns = cur.uint16();
    if (flags & 0x04) extSize = cur.uint32();
    var str = readChars(cur, cch, high);
    if (richRuns) skipChars(cur, richRuns * 4);
    if (extSize) skipChars(cur, extSize);
    return str;
  }

  /** Skip n bytes of trailing data, hopping blocks without eating grbit bytes. */
  function skipChars(cur, n) {
    var left = n;
    while (left > 0) {
      if (cur.left() <= 0) {
        if (!cur.nextBlock(0)) return;
        continue;
      }
      var take = Math.min(left, cur.left());
      cur.o += take;
      left -= take;
    }
  }

  /** Short string used by BOUNDSHEET: uint8 char count, uint8 grbit, chars. */
  function readShortString(cur) {
    var cch = cur.byte() & 0xff;
    var flags = cur.byte();
    return readChars(cur, cch, (flags & 0x01) !== 0);
  }

  /** Decode a 4-byte RK value.
   *
   *  Bit 0 set -> the value must be divided by 100 (fixed point).
   *  Bit 1 set -> the top 30 bits are an INTEGER, so the word must be shifted
   *               right by 2 WITH sign extension: the value lives in bits 2..31
   *               and bit 31 is the sign, so a plain logical shift would turn
   *               every negative RK into a huge positive number.
   *  Neither    -> those same top 30 bits are the high 30 bits of an IEEE 754
   *               double whose low 34 bits are zero, so they form the high word
   *               of the little-endian double and the low word is 0. */
  function decodeRk(rk) {
    var word = rk >>> 0;                     // normalise to an unsigned 32-bit word
    var isInt = (word & 0x02) !== 0;
    var value;
    if (isInt) {
      // signed() turns the unsigned word into a signed 32-bit int first, so the
      // arithmetic right shift keeps the sign.
      value = signed32(word) >> 2;
    } else {
      var dv = new DataView(new ArrayBuffer(8));
      dv.setUint32(0, word & 0xfffffffc, true);   // clear the two flag bits
      // Bytes 0..3 are the LOW half of the little-endian double and 4..7 the
      // HIGH half, so the 30 RK bits must land in the HIGH half -- writing them
      // at offset 0 would produce a denormal near 5e-315 instead of the value.
      dv.setUint32(4, word & 0xfffffffc, true);
      dv.setUint32(0, 0, true);
      value = dv.getFloat64(0, true);
    }
    return (word & 0x01) ? value / 100 : value;
  }

  /** Unsigned 32-bit word -> signed 32-bit integer. */
  function signed32(word) {
    return (word & 0x80000000) ? (word - 0x100000000) : (word >>> 0);
  }

  function decodeError(value) { return ''; }

  function u16(u8, o) { return (u8[o] | (u8[o + 1] << 8)) >>> 0; }
  function u32(u8, o) { return ((u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0); }

  /**
   * Read one BIFF record stream (the Workbook/Book stream) into
   * { sheets: [ { name, rows } ] }.
   */
  function parseBiffStream(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var total = u8.length;

    /* ---- pass 1: split into records ---- */
    var recs = [];
    var p = 0;
    while (p + 4 <= total) {
      var id = u16(u8, p);
      var len = u16(u8, p + 2);
      if (p + 4 + len > total) break;            // truncated: stop, keep what we have
      recs.push({ id: id, at: p, off: p + 4, len: len });
      p += 4 + len;
    }

    /* ---- collect SST blocks (SST + directly following CONTINUEs) ---- */
    var sstStrings = [];
    var claimedContinue = {};
    var i;
    for (i = 0; i < recs.length; i++) {
      if (recs[i].id !== 0x00fc) continue;
      var blocks = [u8.subarray(recs[i].off, recs[i].off + recs[i].len)];
      var j = i + 1;
      while (j < recs.length && recs[j].id === 0x003c) {
        blocks.push(u8.subarray(recs[j].off, recs[j].off + recs[j].len));
        claimedContinue[j] = true;
        j++;
      }
      try {
        sstStrings = parseSst(blocks);
      } catch (err) {
        sstStrings = sstStrings || [];           // corrupt SST: keep going, just no strings
      }
      break;                                     // one SST per workbook stream
    }

    /* ---- pass 2: walk substreams ---- */
    var boundsheets = [];    // BOUNDSHEET order (= sheet tab order)
    var sheets = [];
    var curGrid = null;
    var curSheet = null;
    var pendingFormula = null;   // { grid, row, col } waiting for its STRING record

    for (i = 0; i < recs.length; i++) {
      var rec = recs[i];
      var d = rec.off;
      var L = rec.len;
      var rid = rec.id;

      if (rid === 0x0809) {                       // BOF
        if (L >= 4) {
          var subType = u16(u8, d + 2);
          if (subType === 0x0010) {               // worksheet substream
            var name = null;
            for (var b = 0; b < boundsheets.length; b++) {
              // BOUNDSHEET stores the absolute stream position of this BOF record
              if (boundsheets[b].pos === rec.at && !boundsheets[b].used) {
                name = boundsheets[b].name;
                boundsheets[b].used = true;
                break;
              }
            }
            if (name === null) name = 'Sheet' + (sheets.length + 1);
            curGrid = new Grid();
            curSheet = { name: name, grid: curGrid };
            sheets.push(curSheet);
          } else {
            curGrid = null;
            curSheet = null;
          }
        }
        continue;
      }
      if (rid === 0x000a) {                       // EOF - end of this substream
        pendingFormula = null;
        curGrid = null;
        curSheet = null;
        continue;
      }
      if (rid === 0x0085) {                       // BOUNDSHEET
        if (L >= 8) {
          var pos = u32(u8, d) >>> 0;
          var flags = u16(u8, d + 4);
          var sheetType = (flags >> 8) & 0xff;
          var cur = new ByteCursor([u8.subarray(d + 6, d + L)]);
          var bsName = '';
          try { bsName = readShortString(cur); } catch (err2) { bsName = ''; }
          if (sheetType === 0x00) {               // 0 = worksheet, skip charts/macros
            boundsheets.push({ pos: pos, name: bsName, used: false });
          }
        }
        continue;
      }
      if (claimedContinue[i]) continue;           // already consumed by an SST
      if (rid === 0x003c) continue;               // orphan CONTINUE: skip silently

      if (!curGrid) continue;

      var row, col, cval;
      switch (rid) {
        case 0x0200:                              // DIMENSIONS (sizing hint only)
          var dims = readDimensions(u8, d, L);
          if (dims && dims.lastRow > 0) {
            // Remember the declared width: the grid still grows from the cell
            // records themselves, so a wrong DIMENSIONS can never clip data.
            curSheet.minCols = dims.lastCol;
          }
          break;

        case 0x00fd:                              // LABELSST
          if (L >= 10) {
            row = u16(u8, d); col = u16(u8, d + 2);
            var sstIdx = u32(u8, d + 6);
            var sstVal = sstStrings[sstIdx];
            curGrid.set(row, col, trimText(typeof sstVal === 'string' ? sstVal : ''));
          }
          break;

        case 0x0204:                              // LABEL (inline string, may CONTINUE)
          if (L >= 8) {
            row = u16(u8, d); col = u16(u8, d + 2);
            var lblBlocks = [u8.subarray(d + 6, d + L)];
            var k = i + 1;
            while (k < recs.length && recs[k].id === 0x003c) {
              lblBlocks.push(u8.subarray(recs[k].off, recs[k].off + recs[k].len));
              claimedContinue[k] = true;
              k++;
            }
            var lblCur = new ByteCursor(lblBlocks);
            try {
              curGrid.set(row, col, trimText(readBiffString(lblCur, true)));
            } catch (err3) { curGrid.set(row, col, ''); }
          }
          break;

        case 0x0203:                              // NUMBER
          if (L >= 14) {
            row = u16(u8, d); col = u16(u8, d + 2);
            curGrid.set(row, col, dv.getFloat64(d + 6, true));
          }
          break;

        case 0x027e:                              // RK
          if (L >= 10) {
            row = u16(u8, d); col = u16(u8, d + 2);
            numSet(curGrid, row, col, decodeRk(u32(u8, d + 6)));
          }
          break;

        case 0x00bd:                              // MULRK
          if (L >= 6) {
            row = u16(u8, d); col = u16(u8, d + 2);
            var end = d + L - 2;
            var q = d + 4;
            var cc = col;
            while (q + 6 <= end) {
              var rk = u32(u8, q + 2);
              numSet(curGrid, row, cc, decodeRk(rk));
              q += 6; cc++;
            }
          }
          break;

        case 0x0006:                              // FORMULA
          if (L >= 14) {
            row = u16(u8, d); col = u16(u8, d + 2);
            var b6 = u8[d + 12], b7 = u8[d + 13];
            if (b6 === 0xff && b7 === 0xff) {
              var kind = u8[d + 6];
              if (kind === 0) {
                pendingFormula = { grid: curGrid, row: row, col: col };
                curGrid.set(row, col, '');        // replaced by the STRING record
              } else if (kind === 1) {
                curGrid.set(row, col, u8[d + 8] !== 0);
              } else if (kind === 2) {
                curGrid.set(row, col, decodeError(u8[d + 8]));
              } else {
                curGrid.set(row, col, '');
              }
            } else {
              numSet(curGrid, row, col, dv.getFloat64(d + 6, true));
            }
          }
          break;

        case 0x0207:                              // STRING (cached formula result)
          if (L >= 3) {
            var strBlocks = [u8.subarray(d, d + L)];
            var m = i + 1;
            while (m < recs.length && recs[m].id === 0x003c) {
              strBlocks.push(u8.subarray(recs[m].off, recs[m].off + recs[m].len));
              claimedContinue[m] = true;
              m++;
            }
            var strCur = new ByteCursor(strBlocks);
            var sv = '';
            try { sv = readBiffString(strCur, true); } catch (err4) { sv = ''; }
            if (pendingFormula) {
              pendingFormula.grid.set(pendingFormula.row, pendingFormula.col, trimText(sv));
              pendingFormula = null;
            }
          }
          break;

        default:
          break;                                  // BLANK/MULBLANK/everything else: ignore
      }
    }

    // Note on sizing: DIMENSIONS is parsed per worksheet (see readDimensions)
    // but deliberately NOT used to shrink or truncate anything. The grid is
    // sparse and grows from the cell records, so a wrong, missing or truncated
    // DIMENSIONS can never clip real data.
    return {
      sheets: sheets.map(function (sh) {
        return { name: sh.name, rows: sh.grid.finalize() };
      })
    };
  }

  /** Numbers coming from RK are often integral; keep them as JS numbers. */
  function numSet(grid, row, col, value) {
    grid.set(row, col, value);
  }

  /** DIMENSIONS: BIFF8 (14 bytes) or BIFF5/7 (10 bytes). Sizing hint only --
   *  the grid always grows from the cell records themselves. */
  function readDimensions(u8, d, L) {
    if (L >= 14) {
      return {
        firstRow: u32(u8, d), lastRow: u32(u8, d + 4),
        firstCol: u16(u8, d + 8), lastCol: u16(u8, d + 10)
      };
    }
    if (L >= 10) {
      return {
        firstRow: u32(u8, d), lastRow: u32(u8, d + 4),
        firstCol: u16(u8, d + 8), lastCol: u16(u8, d + 8)
      };
    }
    return null;
  }

  /** SST: block list = the SST record followed by its CONTINUE records. */
  function parseSst(blocks) {
    var cur = new ByteCursor(blocks);
    var totalCount = cur.uint32();
    var uniqueCount = cur.uint32();
    var out = [];
    var n;
    for (n = 0; n < uniqueCount; n++) {
      if (cur.atEnd() || cur.left() <= 0) break;
      try {
        out.push(readBiffString(cur, true));
      } catch (err) {
        break;                                    // truncated SST: return what we have
      }
    }
    out.totalCount = totalCount;
    return out;
  }

  /* ==================================================================== *
   *  .xls entry point
   * ==================================================================== */

  function readXls(arrayBuffer) {
    var u8 = toUint8(arrayBuffer);
    var streams = readCfb(u8, true);
    var wb = null;
    var keys = Object.keys(streams);
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k.charCodeAt(0) === 0x05) continue;                 // \x05SummaryInformation
      if (/^(workbook|book)$/i.test(k)) { wb = streams[k]; break; }
    }
    if (!wb) {
      for (i = 0; i < keys.length; i++) {
        if (streams[keys[i]].length > 8 && streams[keys[i]][0] === 0x09 && streams[keys[i]][1] === 0x08) {
          wb = streams[keys[i]];
          break;
        }
      }
    }
    // Corrupt or truncated container: report an empty result rather than
    // throwing, so a half-downloaded upload never breaks the page.
    if (!wb) return { sheets: [] };
    return parseBiffStream(wb);
  }

  /**
   * 统一成 Uint8Array。
   * 这里的判断故意写得宽松一点：跨窗口 / iframe / Worker 拿到的 ArrayBuffer，
   * 在某些环境里 `instanceof ArrayBuffer` 会是 false（realm 不同），
   * 所以再用 Object.prototype.toString 兜一层，免得把好数据判成「无法识别」。
   */
  function isArrayBufferLike(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer) return true;
    return Object.prototype.toString.call(v) === '[object ArrayBuffer]';
  }

  function toUint8(arrayBuffer) {
    if (!arrayBuffer) throw new Error('没有拿到文件内容。');
    if (arrayBuffer instanceof Uint8Array) return arrayBuffer;
    if (isArrayBufferLike(arrayBuffer)) {
      return new Uint8Array(arrayBuffer);
    }
    if (arrayBuffer.buffer) return new Uint8Array(arrayBuffer.buffer, arrayBuffer.byteOffset, arrayBuffer.byteLength);
    throw new Error('无法识别的文件内容类型。');
  }

  /* ==================================================================== *
   *  XML helpers (for .xlsx)
   * ==================================================================== */

  function decodeXmlEntities(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, function (m, body) {
      if (body.charAt(0) === '#') {
        var code = body.charAt(1) === 'x' || body.charAt(1) === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        if (isNaN(code)) return m;
        if (code > 0xffff) {                       // surrogate pair
          code -= 0x10000;
          return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        }
        return String.fromCharCode(code);
      }
      switch (body) {
        case 'amp': return '&';
        case 'lt': return '<';
        case 'gt': return '>';
        case 'quot': return '"';
        case 'apos': return "'";
        case 'nbsp': return '\u00a0';
        default: return m;
      }
    });
  }

  function xmlUnescape(text) {
    return decodeXmlEntities(text);
  }

  /**
   * Read one attribute out of a tag's attribute text. Namespaced names such as
   * "r:id" are supported; match "r:id" explicitly rather than falling back to
   * a looser pattern that would happily match "sheetId" when asked for "id".
   */
  function xmlAttr(tag, name) {
    var re = new RegExp('(?:^|\\s)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')');
    var m = re.exec(tag);
    if (!m) return null;
    return xmlUnescape(m[2] !== undefined ? m[2] : m[3]);
  }

  /** "A" -> 0, "B" -> 1, "AA" -> 26 ... */
  function colLettersToIndex(letters) {
    var n = 0;
    var i;
    for (i = 0; i < letters.length; i++) {
      var ch = letters.charCodeAt(i);
      var v;
      if (ch >= 65 && ch <= 90) v = ch - 64;             // A-Z
      else if (ch >= 97 && ch <= 122) v = ch - 96;       // a-z
      else return -1;
      n = n * 26 + v;
    }
    return n - 1;
  }

  /** "B3" -> { col: 1, row: 2 } */
  function parseCellRef(ref) {
    if (!ref) return null;
    var m = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(ref);
    if (!m) return null;
    var col = colLettersToIndex(m[1]);
    if (col < 0) return null;
    return { col: col, row: parseInt(m[2], 10) - 1 };
  }

  /** The concatenated text of every <t> inside a fragment (handles rPh/rich runs). */
  function textOfTags(fragment, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'g');
    var out = '';
    var m;
    while ((m = re.exec(fragment)) !== null) {
      out += decodeXmlEntities(m[1].replace(/<[^>]*>/g, ''));
    }
    return out;
  }

  function parseSharedStrings(xml) {
    var out = [];
    if (!xml) return out;
    var siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    var m;
    while ((m = siRe.exec(xml)) !== null) {
      out.push(textOfTags(m[1], 't'));
    }
    return out;
  }

  /* ==================================================================== *
   *  ZIP (only what .xlsx needs) + DecompressionStream inflate
   * ==================================================================== */

  function readU32(u8, o) { return ((u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0); }
  function readU16(u8, o) { return (u8[o] | (u8[o + 1] << 8)) >>> 0; }

  function decodeName(u8, o, len, utf8Flag) {
    if (utf8Flag) {
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(u8.subarray(o, o + len));
      }
      return latin1(u8, o, o + len);
    }
    return latin1(u8, o, o + len);
  }

  /** Zip central directory -> { "xl/worksheets/sheet1.xml": {method,offset,size,...} } */
  function readZipEntries(u8) {
    var entries = {};
    var i;
    // Find End Of Central Directory (search backwards, signature PK\x05\x06)
    var eocd = -1;
    for (i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd >= 0) {
      var count = readU16(u8, eocd + 10);
      var cdSize = readU32(u8, eocd + 12);
      var cdOff = readU32(u8, eocd + 16);
      var p = cdOff;
      for (i = 0; i < count && p + 46 <= u8.length; i++) {
        if (!(u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 0x01 && u8[p + 3] === 0x02)) break;
        var flags = readU16(u8, p + 8);
        var method = readU16(u8, p + 10);
        var csize = readU32(u8, p + 20);
        var usize = readU32(u8, p + 24);
        var nameLen = readU16(u8, p + 28);
        var extraLen = readU16(u8, p + 30);
        var commentLen = readU16(u8, p + 32);
        var localOff = readU32(u8, p + 42);
        var nm = decodeName(u8, p + 46, nameLen, (flags & 0x0800) !== 0);
        entries[nm] = { method: method, csize: csize, usize: usize, offset: localOff };
        p += 46 + nameLen + extraLen + commentLen;
      }
      if (Object.keys(entries).length) return entries;
    }
    // Fallback: scan local file headers
    p = 0;
    while (p + 30 <= u8.length) {
      if (u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 0x03 && u8[p + 3] === 0x04) {
        var f2 = readU16(u8, p + 6);
        var m2 = readU16(u8, p + 8);
        var cs2 = readU32(u8, p + 18);
        var us2 = readU32(u8, p + 22);
        var nl2 = readU16(u8, p + 26);
        var el2 = readU16(u8, p + 28);
        var nm2 = decodeName(u8, p + 30, nl2, (f2 & 0x0800) !== 0);
        entries[nm2] = { method: m2, csize: cs2, usize: us2, offset: p };
        if (cs2 === 0 && us2 === 0) break;
        p += 30 + nl2 + el2 + cs2;
      } else {
        p++;
      }
    }
    return entries;
  }

  /** Raw bytes of one zip entry (local header offset stored in the index). */
  function zipEntryBytes(u8, entry) {
    var p = entry.offset;
    if (!(u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 0x03 && u8[p + 3] === 0x04)) {
      // some writers put the offset at the central-directory entry start; bail out
      return null;
    }
    var nameLen = readU16(u8, p + 26);
    var extraLen = readU16(u8, p + 28);
    var start = p + 30 + nameLen + extraLen;
    var csize = entry.csize;
    if (csize === 0 && entry.usize === 0) csize = u8.length - start;
    return { method: entry.method, data: u8.subarray(start, start + csize) };
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error(
        '这个浏览器太旧，无法读取 .xlsx（缺少 DecompressionStream）。' +
        '请把文件另存为 .xls 或 .csv 后再上传。'
      ));
    }
    try {
      var ds = new DecompressionStream('deflate-raw');
      var writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      return new Response(ds.readable).arrayBuffer().then(function (ab) {
        return new Uint8Array(ab);
      });
    } catch (err) {
      return Promise.reject(new Error(
        '这个浏览器太旧，无法读取 .xlsx（deflate-raw 解压不可用）。' +
        '请把文件另存为 .xls 或 .csv 后再上传。'
      ));
    }
  }

  function unzipText(u8, entries, name) {
    var key = normalizePartName(name);
    var entry = entries[key];
    if (!entry) return Promise.resolve(null);
    var raw = zipEntryBytes(u8, entry);
    if (!raw) return Promise.resolve(null);
    if (raw.method === 0) {
      return Promise.resolve(new TextDecoder('utf-8').decode(raw.data));
    }
    return inflateRaw(raw.data).then(function (out) {
      return new TextDecoder('utf-8').decode(out);
    });
  }

  function normalizePartName(name) {
    var n = String(name).replace(/\\/g, '/');
    while (n.charAt(0) === '/') n = n.slice(1);
    return n;
  }

  /** Resolve a relationship target against the part that declared it.
   *  The base is the DIRECTORY of the declaring part: relationships in
   *  xl/_rels/workbook.xml.rels use targets relative to xl/, so resolving
   *  "worksheets/sheet1.xml" against "xl/workbook.xml" must give
   *  "xl/worksheets/sheet1.xml" and not "xl/workbook.xml/worksheets/...". */
  function resolvePart(basePart, target) {
    var t = normalizePartName(target);
    if (t.charAt(0) === '/') return t.slice(1);          // already package-absolute
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return t;   // external URL: unusable
    var baseSegs = normalizePartName(basePart).split('/');
    baseSegs.pop();                                      // drop the file name
    var parts = baseSegs;
    var segs = t.split('/');
    var i;
    for (i = 0; i < segs.length; i++) {
      if (segs[i] === '' || segs[i] === '.') continue;
      if (segs[i] === '..') { parts.pop(); continue; }
      parts.push(segs[i]);
    }
    return parts.join('/');
  }

  /* ==================================================================== *
   *  .xlsx entry point
   * ==================================================================== */

  function readXlsx(arrayBuffer) {
    return new Promise(function (resolve, reject) {
      var u8;
      try {
        u8 = toUint8(arrayBuffer);
      } catch (err) { reject(err); return; }

      if (u8.length >= 8 && u8[0] === 0xd0 && u8[1] === 0xcf) {
        // It is really an old BIFF file that was renamed: just read it as .xls.
        try { resolve(readXls(u8)); } catch (e) { reject(e); }
        return;
      }
      if (typeof DecompressionStream === 'undefined') {
        reject(new Error(
          '这个浏览器太旧，无法读取 .xlsx（缺少 DecompressionStream）。' +
          '请把文件另存为 .xls 或 .csv 后再上传。'
        ));
        return;
      }

      var entries;
      try { entries = readZipEntries(u8); } catch (err2) { entries = {}; }
      if (!entries || !Object.keys(entries).length) {
        reject(new Error('这不是有效的 .xlsx 文件（没有找到 zip 目录）。'));
        return;
      }

      unzipText(u8, entries, 'xl/workbook.xml').then(function (wbXml) {
        if (!wbXml) throw new Error('这个 .xlsx 里没有 xl/workbook.xml，文件可能已损坏。');
        return unzipText(u8, entries, 'xl/_rels/workbook.xml.rels').then(function (relXml) {
          return unzipText(u8, entries, 'xl/sharedStrings.xml').then(function (ssXml) {
            var sharedStrings = parseSharedStrings(ssXml);
            var rels = {};
            if (relXml) {
              var rRe = /<Relationship\b[^>]*>/g;
              var rm;
              while ((rm = rRe.exec(relXml)) !== null) {
                var rid = xmlAttr(rm[0], 'Id');
                var tgt = xmlAttr(rm[0], 'Target');
                var mode = xmlAttr(rm[0], 'TargetMode');
                if (rid && tgt && mode !== 'External') rels[rid] = tgt;
              }
            }
            // sheet order + names from workbook.xml
            var sheetDefs = [];
            var sRe = /<sheet\b[^>]*\/?>/g;
            var sm;
            while ((sm = sRe.exec(wbXml)) !== null) {
              var nm = xmlAttr(sm[0], 'name');
              // NOTE: the relationship attribute is r:id; it must be matched
              // before the plain id, otherwise "sheetId" wins and every sheet
              // silently falls back to its guessed position.
              var rid2 = xmlAttr(sm[0], 'r:id');
              if (!rid2) rid2 = xmlAttr(sm[0], 'id');
              if (nm === null) continue;
              sheetDefs.push({ name: nm, rid: rid2, sheetId: xmlAttr(sm[0], 'sheetId') });
            }
            // Build the ordered list of parts to read.
            var jobs = [];
            var k;
            for (k = 0; k < sheetDefs.length; k++) {
              var sd = sheetDefs[k];
              var part = null;
              if (sd.rid && rels[sd.rid]) part = resolvePart('xl/workbook.xml', rels[sd.rid]);
              if (!part) {
                var guess = 'xl/worksheets/sheet' + (k + 1) + '.xml';
                if (entries[guess]) part = guess;
              }
              if (part && !entries[part]) part = null;
              if (!part) continue;
              jobs.push({ name: sd.name, part: part, index: k });
            }
            if (!jobs.length) {
              // No rels: fall back to every worksheet part in the archive.
              Object.keys(entries).forEach(function (en) {
                if (/^xl\/worksheets\/[^/]+\.xml$/.test(en) && !/_rels/.test(en)) {
                  jobs.push({ name: 'Sheet' + (jobs.length + 1), part: en, index: jobs.length });
                }
              });
              jobs.sort(function (a, b) { return a.part < b.part ? -1 : a.part > b.part ? 1 : 0; });
            }
            if (!jobs.length) throw new Error('这个 .xlsx 里没有找到任何工作表。');

            return Promise.all(jobs.map(function (job) {
              return unzipText(u8, entries, job.part).then(function (xml) {
                return { name: job.name, rows: parseSheetXml(xml, sharedStrings) };
              });
            })).then(function (sheets) {
              return { sheets: sheets };
            });
          });
        });
      }).then(resolve, reject);
    });
  }

  /** One xl/worksheets/sheetN.xml -> rectangular rows. */
  function parseSheetXml(xml, sharedStrings) {
    var grid = new Grid();
    if (!xml) return grid.finalize();
    var cellRe = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c\s*>)/g;
    var m;
    var lastRow = -1;
    while ((m = cellRe.exec(xml)) !== null) {
      var attrs = m[1] || '';
      var inner = m[3] || '';
      var ref = xmlAttr(attrs, 'r');
      var pos = parseCellRef(ref);
      var row = pos ? pos.row : (lastRow < 0 ? 0 : lastRow);
      var col = pos ? pos.col : 0;
      if (pos) lastRow = pos.row;

      var t = xmlAttr(attrs, 't');
      var value;

      if (t === 'inlineStr') {
        value = trimText(textOfTags(inner, 't'));
      } else {
        var vMatch = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        var raw = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (t === 's') {
          var idx = parseInt(raw, 10);
          var sv = (!isNaN(idx) && sharedStrings && sharedStrings[idx] !== undefined) ? sharedStrings[idx] : '';
          value = trimText(sv);
        } else if (t === 'str') {
          value = trimText(raw);                     // cached formula string
        } else if (t === 'b') {
          value = (raw === '1' || raw === 'true' || raw === 'TRUE');
        } else if (t === 'e') {
          value = '';                                // error cells read as empty
        } else {
          if (raw === '') {
            value = '';
          } else {
            var num = Number(raw);
            value = isNaN(num) ? trimText(raw) : num;
          }
        }
      }
      grid.set(row, col, value);
    }
    return grid.finalize();
  }

  /* ==================================================================== *
   *  CSV / TSV
   * ==================================================================== */

  /** RFC-4180-ish parser: quoted fields may contain the delimiter, newlines
   *  and escaped "" quotes. Handles CRLF, LF and lone CR. */
  function csvRecords(text, delim) {
    var recs = [];
    var field = '';
    var row = [];
    var i = 0;
    var n = text.length;
    var inQuotes = false;

    while (i < n) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') {
        if (field === '') { inQuotes = true; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === delim) { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') {
        row.push(field); field = ''; recs.push(row); row = [];
        if (text.charAt(i + 1) === '\n') i += 2; else i++;
        continue;
      }
      if (ch === '\n') {
        row.push(field); field = ''; recs.push(row); row = [];
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    row.push(field);
    recs.push(row);
    return recs;
  }

  function detectDelimiter(text) {
    var first = text.split(/\r\n|\n|\r/)[0] || '';
    if (first.indexOf('\t') !== -1) return '\t';
    var commas = (first.match(/,/g) || []).length;
    var semis = (first.match(/;/g) || []).length;
    if (semis > commas) return ';';
    return ',';
  }

  function readCsv(text) {
    var s = String(text === undefined || text === null ? '' : text);
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);       // strip UTF-8 BOM
    var delim = detectDelimiter(s);
    var recs = csvRecords(s, delim);

    var grid = [];
    var r, c, row;
    for (r = 0; r < recs.length; r++) {
      row = recs[r];
      var outRow = [];
      for (c = 0; c < row.length; c++) outRow.push(trimText(row[c]));
      grid.push(outRow);
    }
    return { sheets: [{ name: 'Sheet1', rows: finalizeRows(grid, grid.length) }] };
  }

  /* ==================================================================== *
   *  dispatcher
   * ==================================================================== */

  function decodeUtf8(u8) {
    if (typeof TextDecoder !== 'undefined') {
      try { return new TextDecoder('utf-8').decode(u8); } catch (err) { /* fall through */ }
    }
    return latin1(u8, 0, u8.length);
  }

  function extensionOf(fileName) {
    var n = String(fileName || '');
    var m = /\.([A-Za-z0-9]+)\s*$/.exec(n);
    return m ? m[1].toLowerCase() : '';
  }

  function looksLikeOle(u8) {
    return u8.length > 8 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;
  }

  function looksLikeZip(u8) {
    return u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b;
  }

  /**
   * 有些教务系统的「导出 / 打印」其实是把一个 HTML 表格直接存成 .xls
   * （Excel 能打开，所以学校就这么用了）。这种文件的头几个字节是 HTML，
   * 不是 OLE2，按二进制表格解析必然报「不是有效的 .xls 文件」。
   * 这里认一下，交给 HTML 解析器。
   */
  function looksLikeHtmlMarkup(u8) {
    var n = Math.min(u8.length, 4096);
    if (n < 8) return false;
    var s = '';
    for (var i = 0; i < n; i++) s += String.fromCharCode(u8[i]);
    s = s.replace(/^\uFEFF/, '').replace(/^[\s\u0000]+/, '').toLowerCase();
    if (s.charAt(0) !== '<') return false;
    return s.indexOf('<!doctype html') === 0 ||
      s.indexOf('<html') === 0 ||
      s.indexOf('<table') >= 0 ||
      s.indexOf('<meta') >= 0 ||
      s.indexOf('<?xml') === 0 && s.indexOf('spreadsheet') >= 0;
  }

  /** 把 Uint8Array 解成文本（尽量认编码，认不出就按 UTF-8 硬解） */
  function decodeText(u8) {
    var head = Math.min(u8.length, 4096);
    var ascii = '';
    for (var i = 0; i < head; i++) ascii += String.fromCharCode(u8[i]);
    var charset = null;
    var m = /charset\s*=\s*["']?([\w-]+)/i.exec(ascii) ||
      /encoding\s*=\s*["']([\w-]+)["']/i.exec(ascii);
    if (m) charset = m[1].toLowerCase();
    try {
      if (charset && charset !== 'utf-8' && charset !== 'utf8' && typeof TextDecoder !== 'undefined') {
        return new TextDecoder(charset).decode(u8);
      }
    } catch (e) { /* 浏览器不认这个编码名，退回 UTF-8 */ }
    return decodeUtf8(u8);
  }

  function readSheet(arrayBuffer, fileName) {
    return new Promise(function (resolve, reject) {
      var u8;
      try { u8 = toUint8(arrayBuffer); } catch (err) { reject(err); return; }
      var ext = extensionOf(fileName);

      // Content sniffs beat a wrong extension (教务系统 files are sometimes renamed).
      var kind = ext;
      if (looksLikeOle(u8)) kind = 'xls';
      else if (looksLikeZip(u8)) kind = (ext === 'xlsm' || ext === 'xlsx' || ext === 'zip') ? ext : 'xlsx';
      else if (looksLikeHtmlMarkup(u8)) kind = 'html';
      else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') kind = ext;

      if (kind === 'xls') {
        try { resolve(readXls(u8)); } catch (err2) { reject(err2); }
        return;
      }
      if (kind === 'xlsx' || kind === 'xlsm') {
        readXlsx(u8).then(resolve, reject);
        return;
      }
      if (kind === 'html') {
        // HTML 伪装的表格：交给调用方按 HTML 解析（parse.fromHtml）
        resolve({ sheets: [], html: decodeText(u8), kind: 'html' });
        return;
      }
      if (kind === 'csv' || kind === 'tsv' || kind === 'txt') {
        try { resolve(readCsv(decodeUtf8(u8))); } catch (err3) { reject(err3); }
        return;
      }
      // Unknown extension: try the container signatures, then plain text.
      if (looksLikeOle(u8)) {
        try { resolve(readXls(u8)); } catch (err4) { reject(err4); }
        return;
      }
      if (looksLikeZip(u8)) { readXlsx(u8).then(resolve, reject); return; }
      if (looksLikeHtmlMarkup(u8)) { resolve({ sheets: [], html: decodeText(u8), kind: 'html' }); return; }
      resolve(readCsv(decodeUtf8(u8)));
    });
  }

  /* ==================================================================== *
   *  public surface
   * ==================================================================== */

  CW.readXls = readXls;
  CW.readXlsx = readXlsx;
  CW.readCsv = readCsv;
  CW.readSheet = readSheet;
  CW.looksLikeHtmlMarkup = looksLikeHtmlMarkup;
  CW.decodeText = decodeText;

  // Internals for self-testing / debugging only.
  CW.__biffDebug = {
    readCfb: readCfb,
    parseBiffStream: parseBiffStream,
    decodeRk: decodeRk,
    colLettersToIndex: colLettersToIndex,
    parseCellRef: parseCellRef,
    decodeXmlEntities: decodeXmlEntities,
    parseSharedStrings: parseSharedStrings,
    parseSheetXml: parseSheetXml,
    readZipEntries: readZipEntries,
    csvRecords: csvRecords,
    detectDelimiter: detectDelimiter,
    finalizeRows: finalizeRows,
    trimText: trimText,
    version: '1.0.0'
  };

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
