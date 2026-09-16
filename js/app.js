/* ============================================================
   田 · 档案之野 — The Field Archive
   无限缩放画布 · 四系档案 · 八展厅 · 导览 · 详情
   ============================================================ */
(function () {
  'use strict';

  var META = window.FIELD_META, DATA = window.FIELD_DATA;

  /* ---------------- helpers ---------------- */
  function $(s) { return document.querySelector(s); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function trunc(s, n) { s = s || ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  var ARCH = {};
  META.archives.forEach(function (a) { ARCH[a.key] = a; });
  var HALL = {};
  META.halls.forEach(function (h) { HALL[h.id] = h; });

  function yearLabel(y) {
    if (y == null) return '年代不详';
    return y < 0 ? ('公元前 ' + (-y) + ' 年') : (y + ' 年');
  }
  function yearsAgo(y) {
    if (y == null) return null;
    return 2026 - y - (y < 0 ? 1 : 0);
  }

  /* ---------------- canvas & camera ---------------- */
  var canvas = $('#field'), ctx = canvas.getContext('2d');
  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  window.addEventListener('resize', resize); resize();

  function computeBounds() {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    DATA.forEach(function (e) {
      x0 = Math.min(x0, e.x); x1 = Math.max(x1, e.x);
      y0 = Math.min(y0, e.y); y1 = Math.max(y1, e.y);
    });
    return { x0: x0 - 380, y0: y0 - 300, x1: x1 + 380, y1: y1 + 300 };
  }
  var BOUNDS = computeBounds();

  var cam = { k: 0.08, tx: 0, ty: 0 };
  function fitCam() {
    var k = clamp(Math.min(W / (BOUNDS.x1 - BOUNDS.x0), H / (BOUNDS.y1 - BOUNDS.y0)), 0.04, 1.5) * 0.94;
    var cx = (BOUNDS.x0 + BOUNDS.x1) / 2, cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
    return { k: k, tx: W / 2 - cx * k, ty: H / 2 - cy * k };
  }
  function worldToScreen(wx, wy) { return { x: wx * cam.k + cam.tx, y: wy * cam.k + cam.ty }; }
  function screenToWorld(sx, sy) { return { x: (sx - cam.tx) / cam.k, y: (sy - cam.ty) / cam.k }; }

  var tw = { active: false, t0: 0, dur: 750, from: null, to: null, cb: null };
  function flyTo(k, tx, ty, dur, cb) {
    tw.active = true; tw.t0 = performance.now();
    tw.dur = dur || 750; tw.from = { k: cam.k, tx: cam.tx, ty: cam.ty };
    tw.to = { k: k, tx: tx, ty: ty }; tw.cb = cb || null;
  }
  function flyToWorld(wx, wy, k, dur, cb) {
    flyTo(k, W / 2 - wx * k, H / 2 - wy * k, dur, cb);
  }
  function stepTween(now) {
    if (!tw.active) return;
    var t = clamp((now - tw.t0) / tw.dur, 0, 1); t = easeInOut(t);
    cam.k = lerp(tw.from.k, tw.to.k, t);
    cam.tx = lerp(tw.from.tx, tw.to.tx, t);
    cam.ty = lerp(tw.from.ty, tw.to.ty, t);
    if (t >= 1) { tw.active = false; if (tw.cb) tw.cb(); }
  }

  /* ---------------- filter state ---------------- */
  var state = {
    view: 'field',          // field | detail
    q: '',
    halls: {},              // id -> true
    archives: {},
    hubOnly: false,
    hover: null,
    spotlight: null
  };
  function matchEntry(e) {
    var ks = Object.keys(state.halls);
    if (ks.length && !state.halls[e.hall]) return false;
    var ka = Object.keys(state.archives);
    if (ka.length && !state.archives[e.archive]) return false;
    if (state.hubOnly && !e.hub) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = (e.title + ' ' + e.source + ' ' + e.desc + ' ' + e.note + ' ' +
        (e.tags || []).join(' ') + ' ' + (e.text || '') + ' ' + (e.quote || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }
  function activeFilterCount() {
    return DATA.filter(matchEntry).length;
  }

  /* ---------------- image cache ---------------- */
  var thumbCache = {};
  function getThumb(e) {
    if (!e.img) return null;
    var key = e.img.replace('.jpg', '_s.jpg');
    if (!thumbCache[key]) {
      var im = new Image();
      im.src = 'assets/img/' + key;
      thumbCache[key] = im;
    }
    return thumbCache[key];
  }

  /* ---------------- background: 田字格 grid ---------------- */
  function drawGrid() {
    var tl = screenToWorld(0, 0), br = screenToWorld(W, H);
    var vx0 = tl.x, vy0 = tl.y, vx1 = br.x, vy1 = br.y;
    ctx.lineWidth = 1 / cam.k;

    // vertical minor every 250, era boundary every 1000
    ctx.strokeStyle = 'rgba(70,62,40,0.055)';
    ctx.beginPath();
    for (var x = Math.floor(vx0 / 250) * 250; x <= vx1; x += 250) {
      if (x % 1000 === 0) continue;
      ctx.moveTo(x, vy0); ctx.lineTo(x, vy1);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,62,40,0.13)';
    ctx.beginPath();
    for (var x2 = Math.floor(vx0 / 1000) * 1000; x2 <= vx1; x2 += 1000) {
      ctx.moveTo(x2, vy0); ctx.lineTo(x2, vy1);
    }
    // horizontal row bands every 560
    for (var y = Math.floor(vy0 / 560) * 560; y <= vy1; y += 560) {
      ctx.moveTo(vx0, y); ctx.lineTo(vx1, y);
    }
    ctx.stroke();

    // row band tints (four plots)
    META.archives.forEach(function (a) {
      var y0 = a.row * 560;
      ctx.fillStyle = a.color + '0d';
      ctx.fillRect(vx0, y0, vx1 - vx0, 560);
    });

    // era labels (screen-fixed y)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    var labelY = (W < 860) ? 102 : 64;
    META.eras.forEach(function (name, i) {
      var p = worldToScreen(i * 1000 + 500, 0);
      if (p.x < -80 || p.x > W + 80) return;
      ctx.fillStyle = 'rgba(38,36,28,0.72)';
      ctx.font = '600 ' + (12) + 'px Georgia, "Noto Serif SC", serif';
      ctx.fillText(name, p.x, labelY);
      ctx.strokeStyle = 'rgba(38,36,28,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, labelY + 20); ctx.lineTo(p.x, labelY + 28); ctx.stroke();
    });
  }

  /* ---------------- aggregate bubbles (far zoom) ---------------- */
  var cells = {};
  DATA.forEach(function (e) {
    var key = e.eraIdx + '|' + e.archive;
    (cells[key] = cells[key] || { x: 0, y: 0, n: 0, era: e.eraIdx, archive: e.archive }).x += e.x;
    cells[key].y += e.y; cells[key].n++;
  });
  Object.keys(cells).forEach(function (k) {
    var c = cells[k]; c.x /= c.n; c.y /= c.n;
  });
  function drawBubbles() {
    Object.keys(cells).forEach(function (k) {
      var c = cells[k];
      var p = worldToScreen(c.x, c.y);
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) return;
      var matched = 0, total = 0;
      DATA.forEach(function (e) {   // count matched in this cell
        if (e.eraIdx === c.era && e.archive === c.archive) { total++; if (matchEntry(e)) matched++; }
      });
      var a = ARCH[c.archive];
      var r = 17 + 6 * Math.sqrt(c.n);
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = a.color; ctx.globalAlpha = total ? (0.28 + 0.62 * matched / total) : 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2 / cam.k; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '700 ' + (13 / cam.k) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(matched), c.x, c.y + 0.5 / cam.k);
    });
  }

  /* ---------------- entry cards ---------------- */
  function drawCard(e, now) {
    var m = matchEntry(e);
    var dimmed = state.spotlight && state.spotlight !== e.id;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.rot * Math.PI) / 180);
    var boost = (state.hover === e.id) ? 1.045 : 1;
    ctx.scale(boost, boost);
    ctx.globalAlpha = m ? (dimmed ? 0.16 : 1) : 0.055;

    var w = e.w, mini = cam.k < 1.35, h;
    var a = ARCH[e.archive];

    if (mini) {
      h = 46;
      // paper
      roundRect(-w / 2, -h / 2, w, h, 3);
      ctx.fillStyle = '#fbf8ee'; ctx.fill();
      ctx.lineWidth = 1.2 / cam.k; ctx.strokeStyle = '#d5cdb6'; ctx.stroke();
      // tab
      ctx.fillStyle = a.color;
      ctx.fillRect(-w / 2, -h / 2, 5, h);
      // title
      ctx.fillStyle = '#26241c';
      ctx.font = '600 12.5px Georgia, "Noto Serif SC", serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(trunc(e.title, 13), -w / 2 + 12, -7);
      ctx.fillStyle = 'rgba(38,36,28,0.5)';
      ctx.font = '10px Arial';
      ctx.fillText(e.era + ' · ' + HALL[e.hall].name, -w / 2 + 12, 10);
    } else {
      var im = e.img ? getThumb(e) : null;
      h = e.img ? 172 : 132;
      if (im && im.complete && im.naturalWidth) h = 178;
      ctx.shadowColor = 'rgba(60,50,20,0.18)';
      ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
      roundRect(-w / 2, -h / 2, w, h, 4);
      ctx.fillStyle = '#fcf9ef'; ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1.2 / cam.k; ctx.strokeStyle = '#d5cdb6'; ctx.stroke();
      ctx.fillStyle = a.color;
      ctx.fillRect(-w / 2, -h / 2, 5, h);

      var top = -h / 2 + 9;
      if (im && im.complete && im.naturalWidth) {
        var iw = w - 18, ih = 92;
        drawImageCover(im, -w / 2 + 9, top, iw, ih);
        ctx.strokeStyle = 'rgba(70,62,40,0.25)';
        ctx.lineWidth = 1 / cam.k;
        ctx.strokeRect(-w / 2 + 9, top, iw, ih);
        top += ih + 8;
      } else if (!e.img && e.quote) {
        ctx.fillStyle = 'rgba(38,36,28,0.78)';
        ctx.font = '12px Georgia, "Noto Serif SC", serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        var q = e.quote.split('\n').join('');
        wrapText('「' + trunc(q, 42) + '」', -w / 2 + 12, top, w - 24, 17, 3);
        top += 3 * 17 + 6;
      }
      ctx.fillStyle = '#26241c';
      ctx.font = '700 13.5px Georgia, "Noto Serif SC", serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      wrapText(e.title, -w / 2 + 12, top, w - 22, 18, 2);
      ctx.fillStyle = 'rgba(38,36,28,0.52)';
      ctx.font = '10px Arial';
      ctx.textBaseline = 'bottom';
      ctx.fillText(e.era + ' · ' + HALL[e.hall].name + (e.hub ? ' · 枢纽' : ''), -w / 2 + 12, h / 2 - 7);
    }

    // hover ring
    if (state.hover === e.id && m) {
      ctx.globalAlpha = 1;
      roundRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10, 6);
      ctx.lineWidth = 2.4 / cam.k; ctx.strokeStyle = '#3c5a34'; ctx.stroke();
    }
    // spotlight ring
    if (state.spotlight === e.id) {
      ctx.globalAlpha = 0.9;
      var pulse = 8 + 4 * Math.sin(now / 320);
      roundRect(-w / 2 - pulse, -h / 2 - pulse, w + pulse * 2, h + pulse * 2, 8);
      ctx.lineWidth = 3 / cam.k; ctx.strokeStyle = '#b08a3e'; ctx.stroke();
    }
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawImageCover(im, x, y, w, h) {
    var s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    var sw = w / s, sh = h / s;
    var sx = (im.naturalWidth - sw) / 2, sy = (im.naturalHeight - sh) / 2;
    ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  }
  function wrapText(text, x, y, maxW, lh, maxLines) {
    var line = '', lines = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ctx.measureText(line + ch).width > maxW && line) {
        ctx.fillText(line, x, y + lines * lh); lines++; line = ch;
        if (lines >= maxLines) { ctx.fillText('…', x, y + (lines - 1) * lh); return; }
      } else line += ch;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lh);
  }

  /* ---------------- render loop ---------------- */
  function render(now) {
    stepTween(now);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#f5f4ee';
    ctx.fillRect(0, 0, W, H);

    drawGrid();

    var tl = screenToWorld(0, 0), br = screenToWorld(W, H);
    var margin = 260 / cam.k;
    var vx0 = tl.x - margin, vy0 = tl.y - margin, vx1 = br.x + margin, vy1 = br.y + margin;

    ctx.setTransform(DPR * cam.k, 0, 0, DPR * cam.k, DPR * cam.tx, DPR * cam.ty);
    if (cam.k < 0.3) {
      drawBubbles();
    } else {
      // far → near ordering by y for slight depth
      for (var i = 0; i < DATA.length; i++) {
        var e = DATA[i];
        if (e.x < vx0 || e.x > vx1 || e.y < vy0 || e.y > vy1) continue;
        drawCard(e, now);
      }
    }
    requestAnimationFrame(render);
  }

  /* ---------------- input: pan / zoom / pick ---------------- */
  var pointers = {}, dragging = false, moved = 0, pinch0 = null, cam0 = null;
  var hintHidden = false;

  function hideHint() {
    if (hintHidden) return; hintHidden = true;
    $('#hint').style.opacity = '0';
  }
  function zoomAt(px, py, factor) {
    var k2 = clamp(cam.k * factor, 0.05, 6);
    var wx = (px - cam.tx) / cam.k, wy = (py - cam.ty) / cam.k;
    cam.tx = px - wx * k2; cam.ty = py - wy * k2; cam.k = k2;
    hideHint();
  }
  canvas.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    if (state.view !== 'field') return;
    var f = Math.exp(-ev.deltaY * 0.0016);
    zoomAt(ev.clientX, ev.clientY, f);
  }, { passive: false });

  canvas.addEventListener('pointerdown', function (ev) {
    canvas.setPointerCapture(ev.pointerId);
    pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
    var n = Object.keys(pointers).length;
    if (n === 2) {
      var ks = Object.keys(pointers);
      var a = pointers[ks[0]], b = pointers[ks[1]];
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      cam0 = { k: cam.k, tx: cam.tx, ty: cam.ty };
    }
    moved = 0; dragging = true;
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (pointers[ev.pointerId]) {
      var prev = pointers[ev.pointerId];
      var dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      moved += Math.abs(dx) + Math.abs(dy);
      var n = Object.keys(pointers).length;
      if (n === 1) {
        if (state.view === 'field') { cam.tx += dx; cam.ty += dy; if (moved > 4) hideHint(); }
      } else if (n === 2 && pinch0) {
        var ks = Object.keys(pointers);
        var a = pointers[ks[0]], b = pointers[ks[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        var k2 = clamp(cam0.k * d / pinch0.d, 0.05, 6);
        var wx = (pinch0.cx - cam0.tx) / cam0.k, wy = (pinch0.cy - cam0.ty) / cam0.k;
        cam.k = k2; cam.tx = cx - wx * k2; cam.ty = cy - wy * k2;
      }
    } else if (state.view === 'field') {
      updateHover(ev.clientX, ev.clientY);
    }
  });
  function endPointer(ev) {
    if (pointers[ev.pointerId] && moved < 6 && state.view === 'field') {
      handleTap(ev.clientX, ev.clientY);
    }
    delete pointers[ev.pointerId];
    if (Object.keys(pointers).length < 2) pinch0 = null;
    if (Object.keys(pointers).length === 0) { dragging = false; canvas.classList.remove('dragging'); }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', function () { state.hover = null; });

  function updateHover(sx, sy) {
    var w = screenToWorld(sx, sy);
    var best = null, bestD = 1e9;
    for (var i = 0; i < DATA.length; i++) {
      var e = DATA[i];
      var half = (e.w * 1.15) / 2;
      if (Math.abs(w.x - e.x) > half || Math.abs(w.y - e.y) > half + 20) continue;
      var d = Math.hypot(w.x - e.x, w.y - e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    state.hover = best ? best.id : null;
    canvas.style.cursor = best ? 'pointer' : 'grab';
  }
  function handleTap(sx, sy) {
    if (cam.k < 0.3) {
      // tap a bubble → dive into that cell
      var w = screenToWorld(sx, sy);
      var best = null, bd = 1e9;
      Object.keys(cells).forEach(function (k) {
        var c = cells[k];
        var d = Math.hypot(w.x - c.x, w.y - c.y);
        if (d < bd) { bd = d; best = c; }
      });
      if (best && bd < 200) flyToWorld(best.x, best.y, 0.62, 700);
      return;
    }
    if (state.hover) {
      var e = DATA.find(function (x) { return x.id === state.hover; });
      if (e && matchEntry(e)) openDetail(e);
    }
  }

  /* keyboard + buttons */
  function panBy(dx, dy) { cam.tx += dx; cam.ty += dy; }
  function zoomCenter(f) { zoomAt(W / 2, H / 2, f); }
  window.addEventListener('keydown', function (ev) {
    if (state.view === 'detail') {
      if (ev.key === 'Escape') closeDetail();
      return;
    }
    switch (ev.key) {
      case 'ArrowUp': panBy(0, 130); break;
      case 'ArrowDown': panBy(0, -130); break;
      case 'ArrowLeft': panBy(130, 0); break;
      case 'ArrowRight': panBy(-130, 0); break;
      case '+': case '=': zoomCenter(1.35); break;
      case '-': case '_': zoomCenter(0.74); break;
      case '0': case 'Home': { var f = fitCam(); flyTo(f.k, f.tx, f.ty, 700); break; }
      case 'Escape': clearFilters(); break;
    }
    hideHint();
  });
  $('#zoomCtl').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    var act = b.dataset.act;
    if (act === 'up') panBy(0, 140);
    if (act === 'down') panBy(0, -140);
    if (act === 'left') panBy(140, 0);
    if (act === 'right') panBy(-140, 0);
    if (act === 'in') zoomCenter(1.4);
    if (act === 'out') zoomCenter(0.72);
    if (act === 'fit') { var f = fitCam(); flyTo(f.k, f.tx, f.ty, 750); }
  });

  /* ---------------- panel UI ---------------- */
  function buildChips() {
    var hc = $('#hallChips');
    META.halls.forEach(function (h) {
      var b = document.createElement('button');
      b.className = 'chip'; b.textContent = h.name;
      b.title = h.id + ' · ' + h.sub;
      b.onclick = function () {
        state.halls[h.id] = !state.halls[h.id];
        if (!state.halls[h.id]) delete state.halls[h.id];
        b.classList.toggle('on'); refreshCounts();
      };
      hc.appendChild(b);
    });
    var ac = $('#archiveChips');
    META.archives.forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = '<span class="dot" style="background:' + a.color + '"></span>' + a.name;
      b.onclick = function () {
        state.archives[a.key] = !state.archives[a.key];
        if (!state.archives[a.key]) delete state.archives[a.key];
        b.classList.toggle('on'); refreshCounts();
      };
      ac.appendChild(b);
    });
    var tc = $('#themeChips');
    var hub = document.createElement('button');
    hub.className = 'chip'; hub.textContent = '枢纽互见';
    hub.title = '只显示跨档案互见的枢纽条目';
    hub.onclick = function () {
      state.hubOnly = !state.hubOnly;
      hub.classList.toggle('on'); refreshCounts();
    };
    tc.appendChild(hub);
  }
  var searchTimer = null;
  $('#search').addEventListener('input', function (ev) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = ev.target.value.trim();
      refreshCounts();
    }, 160);
  });
  function refreshCounts() {
    var n = activeFilterCount();
    $('#resultCount').textContent = n === DATA.length
      ? '全部 ' + n + ' 条档案正在展出'
      : '命中 ' + n + ' / ' + DATA.length + ' 条档案';
    var af = $('#activeFilter');
    af.innerHTML = '';
    var parts = [];
    if (state.q) parts.push('「' + state.q + '」');
    Object.keys(state.halls).forEach(function (id) { parts.push(HALL[id].name); });
    Object.keys(state.archives).forEach(function (k) { parts.push(ARCH[k].name); });
    if (state.hubOnly) parts.push('枢纽互见');
    if (parts.length) {
      var b = document.createElement('button');
      b.className = 'af';
      b.textContent = parts.join(' · ') + ' ✕';
      b.title = '清除全部筛选';
      b.onclick = clearFilters;
      af.appendChild(b);
    }
    if (n > 0 && n <= 4) {
      // 极少命中时自动飞过去
      var xs = 0, ys = 0;
      DATA.forEach(function (e) { if (matchEntry(e)) { xs += e.x; ys += e.y; } });
      flyToWorld(xs / n, ys / n, Math.max(cam.k, 0.85), 650);
    }
  }
  function clearFilters() {
    state.q = ''; $('#search').value = '';
    state.halls = {}; state.archives = {}; state.hubOnly = false;
    document.querySelectorAll('.chip.on').forEach(function (c) { c.classList.remove('on'); });
    refreshCounts();
  }
  $('#panelToggle').addEventListener('click', function () {
    $('#panel').classList.toggle('collapsed');
  });

  /* ---------------- detail view ---------------- */
  var current = null;
  var prevCam = null;
  var stage = { k: 1, tx: 0, ty: 0 };

  function openDetail(e, instant) {
    current = e;
    state.view = 'detail';
    state.hover = null;
    if (!instant) prevCam = { k: cam.k, tx: cam.tx, ty: cam.ty };
    flyToWorld(e.x, e.y, Math.max(cam.k, 1.9), instant ? 0 : 520, function () {
      fillDetail(e);
      $('#detail').classList.remove('hidden');
    });
  }
  function fillDetail(e) {
    var eraLabel = (e.eraText && e.eraText.length <= 20) ? e.eraText : e.era;
    $('#dEra').textContent = eraLabel.length > 12 ? eraLabel : (eraLabel + ' · ' + e.era);
    $('#dTitle').textContent = e.title;
    $('#dSource').textContent = e.source || ARCH[e.archive].name + '档案';
    var ya = yearsAgo(e.year);
    $('#dBanner').textContent = ya != null
      ? (yearLabel(e.year) + ' ── 距今约 ' + ya.toLocaleString() + ' 年')
      : '年代不详';
    $('#dNote').textContent = e.note || e.desc || '暂无释义。';
    var tg = $('#dTags'); tg.innerHTML = '';
    (e.tags || []).slice(0, 8).forEach(function (t) {
      var i = document.createElement('i'); i.textContent = '#' + t; tg.appendChild(i);
    });
    var hall = document.createElement('i');
    hall.textContent = HALL[e.hall].id + ' ' + HALL[e.hall].name;
    hall.style.borderColor = '#3c5a34'; hall.style.color = '#2c4426';
    tg.appendChild(hall);
    $('#dExt').href = 'https://www.bing.com/search?q=' + encodeURIComponent(e.title + ' ' + (e.author || ''));

    // stage: image or quote
    var img = $('#dImg'), q = $('#dQuote'), frame = $('#stageFrame');
    stage = { k: 1, tx: 0, ty: 0 };
    if (e.img) {
      frame.classList.remove('noimg');
      img.style.display = 'block'; q.classList.remove('show');
      img.src = 'assets/img/' + e.img;
      img.alt = e.title;
      applyStage();
      img.onload = function () { applyStage(); };
    } else {
      frame.classList.add('noimg');
      img.style.display = 'none'; img.src = '';
      q.classList.add('show');
      var content = '';
      if (e.quote) content += e.quote + '\n\n';
      if (e.text) content += e.text;
      if (!content) content = e.desc || e.note;
      q.textContent = content;
    }
  }
  function applyStage() {
    var img = $('#dImg');
    img.style.transform = 'translate(' + stage.tx + 'px,' + stage.ty + 'px) scale(' + stage.k + ')';
  }
  function closeDetail() {
    $('#detail').classList.add('hidden');
    state.view = 'field';
    if (prevCam) flyTo(prevCam.k, prevCam.tx, prevCam.ty, 600);
    prevCam = null;
  }
  $('#detailBack').addEventListener('click', closeDetail);

  // stage pan / zoom
  (function () {
    var frame = $('#stageFrame'), img = $('#dImg');
    var down = false, sx = 0, sy = 0, stx = 0, sty = 0, moved2 = 0;
    img.addEventListener('pointerdown', function (ev) {
      down = true; moved2 = 0; sx = ev.clientX; sy = ev.clientY;
      stx = stage.tx; sty = stage.ty;
      img.classList.add('grabbing');
      img.setPointerCapture(ev.pointerId);
    });
    img.addEventListener('pointermove', function (ev) {
      if (!down) return;
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      moved2 += Math.abs(dx) + Math.abs(dy);
      stage.tx = stx + dx; stage.ty = sty + dy;
      applyStage();
    });
    img.addEventListener('pointerup', function () { down = false; img.classList.remove('grabbing'); });
    frame.addEventListener('wheel', function (ev) {
      if (img.style.display === 'none') return;
      ev.preventDefault();
      var f = Math.exp(-ev.deltaY * 0.0018);
      var r = frame.getBoundingClientRect();
      var px = ev.clientX - (r.left + r.width / 2), py = ev.clientY - (r.top + r.height / 2);
      var k2 = clamp(stage.k * f, 1, 8);
      var wx = (px - stage.tx) / stage.k, wy = (py - stage.ty) / stage.k;
      stage.tx = px - wx * k2; stage.ty = py - wy * k2; stage.k = k2;
      applyStage();
    }, { passive: false });
    document.querySelector('.stage-zoom').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.z === 'in') stage.k = clamp(stage.k * 1.45, 1, 8);
      if (b.dataset.z === 'out') stage.k = clamp(stage.k * 0.7, 1, 8);
      if (b.dataset.z === 'fit') stage = { k: 1, tx: 0, ty: 0 };
      applyStage();
    });
  })();

  $('#another').addEventListener('click', function () {
    var pool = DATA.filter(function (e) { return !current || e.id !== current.id; });
    var next = pool[Math.floor(Math.random() * pool.length)];
    $('#detail').classList.add('hidden');
    flyToWorld(next.x, next.y, Math.max(cam.k, 1.9), 620, function () {
      fillDetail(next);
      $('#detail').classList.remove('hidden');
    });
    current = next;
  });

  /* ---------------- guide ---------------- */
  var GUIDE = [
    {
      find: '甲骨文', title: '第一站 · 最早的田是一张网',
      body: '三千多年前的龟甲刻辞里，「田」就是方框加十字：四口之形，阡陌之界。汉字中极少数「图形即意义」的字例——格线即世界，一切由此开端。'
    },
    {
      find: '井田制', title: '第二站 · 格子成为制度',
      body: '「方里而井，井九百亩，其中为公田。」八家私田环抱着中央的公田——田字格第一次从字形变成制度，阡陌从此也是权力的形状。'
    },
    {
      find: '御制耕织图', title: '第三站 · 画出来的农事',
      body: '康熙三十五年（1696），焦秉贞奉敕绘成《御制耕织图》：耕织全流程定格为四十六幅同尺幅的画，一格一事，一图一诗。做出来的田与画出来的田，互为表里。'
    },
    {
      find: '归园田居', title: '第四站 · 田从财产变成情感',
      body: '「方宅十余亩，草屋八九间。榆柳荫后檐，桃李罗堂前。」陶渊明把井田缩小成十亩方宅——田自此从公田私田的财产，变成中国人心灵的去处。'
    },
    {
      find: '麦田群鸦', title: '第五站 · 燃烧的形式',
      body: '从勃鲁盖尔到米勒，田里的农民被画成纪念碑；到梵高笔下，金黄的麦浪只剩燃烧的色彩与笔触。塞尚、蒙德里安接力——田终于只剩下了形式。'
    },
    {
      find: '越后妻有', title: '第六站 · 田的下一季',
      body: '2000 年起，废弃的梯田在新潟越后妻有变身艺术现场：稻田画、装置、艺术乡建。田从被描绘的对象，成为作品本身——这是田的下一季。'
    }
  ];
  var guideIdx = -1;
  function guideEntry(i) {
    var g = GUIDE[i];
    return DATA.find(function (e) { return e.title.indexOf(g.find) !== -1; });
  }
  function startGuide() {
    guideIdx = 0;
    $('#guideBtn').classList.add('hidden');
    $('#guideCard').classList.remove('hidden');
    var dots = $('#guideDots'); dots.innerHTML = '';
    GUIDE.forEach(function (_, i) {
      var d = document.createElement('i'); if (i === 0) d.className = 'on';
      dots.appendChild(d);
    });
    goGuide(0);
  }
  function goGuide(i) {
    guideIdx = i;
    var g = GUIDE[i], e = guideEntry(i);
    Array.prototype.forEach.call($('#guideDots').children, function (d, j) {
      d.classList.toggle('on', j <= i);
    });
    $('#guideTitle').textContent = g.title;
    $('#guideBody').textContent = g.body;
    $('#guidePrev').style.visibility = i === 0 ? 'hidden' : 'visible';
    var last = i === GUIDE.length - 1;
    $('#guideNext').classList.toggle('hidden', last);
    $('#guideDone').classList.toggle('hidden', !last);
    if (e) {
      state.spotlight = e.id;
      flyToWorld(e.x, e.y, 2.1, 1100);
    }
  }
  function endGuide() {
    guideIdx = -1;
    state.spotlight = null;
    $('#guideCard').classList.add('hidden');
    $('#guideBtn').classList.remove('hidden');
    var f = fitCam(); flyTo(f.k, f.tx, f.ty, 850);
  }
  $('#guideBtn').addEventListener('click', startGuide);
  $('#guideNext').addEventListener('click', function () { if (guideIdx < GUIDE.length - 1) goGuide(guideIdx + 1); });
  $('#guidePrev').addEventListener('click', function () { if (guideIdx > 0) goGuide(guideIdx - 1); });
  $('#guideDone').addEventListener('click', endGuide);
  $('#guideClose').addEventListener('click', endGuide);

  /* ---------------- loader sequence ---------------- */
  function buildLoaderCards() {
    var box = $('#loaderCards');
    var cfgs = [
      { r: '-9deg', y: '14px', d: '0s', glyph: '田' },
      { r: '2deg', y: '-8px', d: '.35s', glyph: '畾' },
      { r: '11deg', y: '18px', d: '.7s', glyph: '畴' }
    ];
    cfgs.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'lc'; d.style.setProperty('--r', c.r);
      d.style.setProperty('--y', c.y); d.style.animationDelay = c.d;
      d.innerHTML = '<div class="im">' + c.glyph + '</div><div class="ln"></div><div class="ln s"></div>';
      box.appendChild(d);
    });
  }
  function buildLegend() {
    var d = document.createElement('div');
    d.id = 'legend';
    META.archives.forEach(function (a) {
      var s = document.createElement('span');
      s.innerHTML = '<i style="background:' + a.color + '"></i>' + a.name;
      d.appendChild(s);
    });
    $('.panel-inner').insertBefore(d, $('#guideLink'));
  }
  function boot() {
    buildLoaderCards();
    buildChips();
    buildLegend();
    refreshCounts();
    requestAnimationFrame(render);
    if (W < 860) $('#panel').classList.add('collapsed');

    // preload a handful of thumbs so first paint of near-zoom is instant
    DATA.slice(0, 12).forEach(getThumb);

    var t0 = performance.now();
    var f = fitCam();
    cam.k = f.k * 0.35; cam.tx = f.tx; cam.ty = f.ty;
    function finish() {
      var wait = Math.max(0, 1100 - (performance.now() - t0));
      setTimeout(function () {
        $('#loader').classList.add('gone');
        setTimeout(function () { $('#loader').remove(); }, 1000);
        flyTo(f.k, f.tx, f.ty, 1600);
      }, wait);
    }
    if (document.readyState === 'complete') finish();
    else window.addEventListener('load', finish);
    // 兜底：4 秒后无论如何关闭加载页
    setTimeout(function () {
      var l = $('#loader');
      if (l && !l.classList.contains('gone')) { l.classList.add('gone'); setTimeout(function () { l.remove(); }, 1000); }
    }, 4000);
  }
  /* ---------------- 对外小 API（调试/自动化验证用） ---------------- */
  window.FIELD_APP = {
    cam: cam,
    state: state,
    data: DATA,
    fit: function () { var f = fitCam(); flyTo(f.k, f.tx, f.ty, 700); },
    flyToWorld: flyToWorld,
    openDetailByTitle: function (sub) {
      var e = DATA.find(function (x) { return x.title.indexOf(sub) !== -1; });
      if (e) openDetail(e, true);
      return e ? e.id : null;
    },
    closeDetail: closeDetail,
    startGuide: startGuide,
    endGuide: endGuide,
    clearFilters: clearFilters
  };

  boot();
})();
