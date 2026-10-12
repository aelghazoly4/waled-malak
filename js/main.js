/* =========================================================
   وليد & ملاك — invitation behaviour
   ========================================================= */
(function () {
  'use strict';

  /* ---------- editable settings ---------- */
  var CONFIG = {
    // 17 Oct 2026, 7:00 PM in Birmingham, Alabama (CDT = UTC-5).
    // The countdown is exact for guests in any country.
    eventStart: new Date('2026-10-17T19:00:00-05:00'),
    eventEnd:   new Date('2026-10-17T23:59:00-05:00'),
    title: 'زفاف وليد & ملاك',
    venue: 'Marriott Birmingham, 3590 Grandview Pkwy, Birmingham, AL 35243',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Marriott+Birmingham+3590+Grandview+Pkwy+Birmingham+AL+35243',
    phone: '',                 // «تواصل» button, e.g. '+12055550123' (empty → opens the RSVP form)
    autoScroll: 34,            // page glides down by itself after opening, px per second (0 = off)
    api: '/api',               // backend base URL (same Vercel project)
    storageKey: 'walid-malak-invite'
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var body = document.body;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- safe storage ---------- */
  var store = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || {}; } catch (e) { return {}; }
    },
    set: function (data) {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(data)); } catch (e) { /* private mode */ }
    }
  };

  /* ---------- anonymous device id (for view stats + one RSVP per device) ---------- */
  function deviceId() {
    var s = store.get();
    if (s.vid && /^[A-Za-z0-9_-]{8,64}$/.test(s.vid)) return s.vid;
    var id;
    try { id = crypto.randomUUID(); }
    catch (e) { id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
    s.vid = id; store.set(s);
    return id;
  }
  var VID = deviceId();

  /* ---------- API ---------- */
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (opts.body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    if (opts.keepalive) init.keepalive = true;
    return fetch(CONFIG.api + path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok || data.ok === false) {
          var err = new Error(data.message || ('HTTP ' + r.status));
          err.status = r.status; err.code = data.error;
          throw err;
        }
        return data;
      });
    });
  }
  function track(event) {
    api('/view', { method: 'POST', body: { vid: VID, event: event, ref: document.referrer || '' }, keepalive: true })
      .catch(function () { /* stats are best-effort */ });
  }

  /* ---------- toast ---------- */
  var toastEl = $('#toast'), toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* =========================================================
     MUSIC
     ========================================================= */
  var audio = $('#music');
  var musicBtn = $('#navMusic');
  audio.volume = 0.85;
  function setMusicState(on) { musicBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function playMusic() {
    var p = audio.play();
    if (p && p.then) p.then(function () { setMusicState(true); }).catch(function () { setMusicState(false); });
    else setMusicState(true);
  }
  musicBtn.addEventListener('click', function () {
    if (audio.paused) playMusic(); else { audio.pause(); setMusicState(false); }
  });
  audio.addEventListener('pause', function () { setMusicState(false); });
  audio.addEventListener('play', function () { setMusicState(true); });

  /* =========================================================
     HERO VIDEO
     ========================================================= */
  var video = $('#heroVideo');
  function kickVideo() { if (video && video.paused) { var p = video.play(); if (p && p.catch) p.catch(function () {}); } }
  kickVideo();

  /* =========================================================
     INTRO — doors open
     ========================================================= */
  var intro = $('#intro');
  var opened = false;
  function openInvite() {
    if (opened) return;
    opened = true;
    playMusic();
    kickVideo();
    track('open');
    intro.classList.add('is-open');
    window.scrollTo(0, 0);
    setTimeout(function () {
      body.classList.remove('is-locked');
      onScroll();
    }, 650);
    setTimeout(function () { intro.classList.add('is-gone'); }, 1900);
    autoScroll.later(2800);
  }
  $('#openBtn').addEventListener('click', openInvite);
  intro.addEventListener('click', function (e) { if (e.target.classList.contains('intro__door')) openInvite(); });

  // one "view" per browser session
  try {
    if (!sessionStorage.getItem('inv-viewed')) { sessionStorage.setItem('inv-viewed', '1'); track('view'); }
  } catch (e) { track('view'); }

  /* =========================================================
     REVEAL ON SCROLL
     ========================================================= */
  var revealEls = $$('.reveal, .reveal-x');
  $$('.notes .note').forEach(function (el, i) { el.style.setProperty('--d', i * 0.12 + 's'); });

  var io = null;
  if ('IntersectionObserver' in window && !reduceMotion) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !body.classList.contains('is-locked')) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
    window.addEventListener('invite:unlocked', function () {
      revealEls.forEach(function (el) {
        if (el.classList.contains('is-in')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92 && r.bottom > 0) el.classList.add('is-in');
      });
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* =========================================================
     TIMELINE — layout from the number of items, ring follows scroll
     ========================================================= */
  var tl = $('#timeline');
  var ring = $('#tlRing');
  var tlItems = $$('.timeline__item');
  var STEP = 63.5, FIRST = 50, RING_START = 24;
  tlItems.forEach(function (it, i) { it.style.top = (FIRST + i * STEP) + 'px'; });
  var lastTop = FIRST + (tlItems.length - 1) * STEP;
  tl.style.height = (lastTop + 44.5) + 'px';
  var RING_END = lastTop + 21.5;

  function updateTimeline() {
    var r = tl.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = (vh * 0.7 - r.top) / (r.height + vh * 0.42);
    p = Math.max(0, Math.min(1, p));
    var y = RING_START + p * (RING_END - RING_START);
    ring.style.transform = 'translate3d(0,' + (y - RING_START).toFixed(1) + 'px,0)';
    tlItems.forEach(function (it) {
      var iy = it.offsetTop + it.offsetHeight / 2;
      it.classList.toggle('is-on', y >= iy - 4);
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { updateTimeline(); ticking = false; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateTimeline();

  new MutationObserver(function () {
    if (!body.classList.contains('is-locked')) window.dispatchEvent(new Event('invite:unlocked'));
  }).observe(body, { attributes: true, attributeFilter: ['class'] });

  /* =========================================================
     COUNTDOWN
     ========================================================= */
  var cd = { d: $('[data-cd="d"]'), h: $('[data-cd="h"]'), m: $('[data-cd="m"]'), s: $('[data-cd="s"]') };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function tick() {
    var diff = Math.max(0, CONFIG.eventStart.getTime() - Date.now());
    var s = Math.floor(diff / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    cd.d.textContent = pad(d); cd.h.textContent = pad(h); cd.m.textContent = pad(m); cd.s.textContent = pad(s);
  }
  tick();
  setInterval(tick, 1000);

  /* =========================================================
     SAVE THE DATE (.ics)
     ========================================================= */
  function icsDate(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z';
  }
  function icsEscape(t) { return String(t).replace(/([,;\\])/g, '\\$1'); }
  $('#saveDate').addEventListener('click', function () {
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wedding Invite//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:walid-malak-20261017@invite',
      'DTSTAMP:' + icsDate(new Date()),
      'DTSTART:' + icsDate(CONFIG.eventStart),
      'DTEND:' + icsDate(CONFIG.eventEnd),
      'SUMMARY:' + icsEscape(CONFIG.title),
      'LOCATION:' + icsEscape(CONFIG.venue),
      'URL:' + CONFIG.mapsUrl,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(CONFIG.title), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'walid-malak-wedding.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('تمت إضافة الموعد إلى التقويم 🤍');
  });

  /* =========================================================
     DOCK LINKS
     ========================================================= */
  $('#venueLink').setAttribute('href', CONFIG.mapsUrl);
  $('#navMap').addEventListener('click', function (e) {
    e.preventDefault();
    $('#location').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
  var contact = $('#navContact');
  if (CONFIG.phone) {
    contact.setAttribute('href', 'tel:' + CONFIG.phone);
  } else {
    contact.addEventListener('click', function (e) { e.preventDefault(); openRsvp(); });
  }

  /* =========================================================
     MODALS
     ========================================================= */
  var lastFocus = null;
  function openModal(m) {
    lastFocus = document.activeElement;
    m.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    var f = m.querySelector('input:not([type=radio]):not([name=website]), button');
    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60);
  }
  function closeModal(m) {
    m.hidden = true;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $$('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $$('.modal').forEach(function (m) { if (!m.hidden) closeModal(m); });
  });

  /* ---------- RSVP ---------- */
  var rsvpModal = $('#rsvpModal'), form = $('#rsvpForm'), done = $('#rsvpDone'), err = $('#rsvpError');
  var guestsField = $('#guestsField');

  function syncGuestsField() { guestsField.style.display = form.attend.value === 'yes' ? '' : 'none'; }
  form.addEventListener('change', syncGuestsField);

  function openRsvp() {
    form.hidden = false; done.hidden = true; err.textContent = '';
    var prev = store.get().rsvp;
    if (prev) {
      form.name.value = prev.name || '';
      form.guests.value = prev.guests || 1;
      var radio = form.querySelector('input[name=attend][value="' + (prev.attend === 'no' ? 'no' : 'yes') + '"]');
      if (radio) radio.checked = true;
    }
    syncGuestsField();
    openModal(rsvpModal);
  }
  $('#navRsvp').addEventListener('click', openRsvp);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.name.value.trim();
    var attend = form.attend.value === 'no' ? 'no' : 'yes';
    var guests = Math.max(1, Math.min(10, parseInt(form.guests.value, 10) || 1));
    if (name.length < 2) { err.textContent = 'فضلاً اكتب الاسم'; form.name.focus(); return; }
    err.textContent = '';

    var submitBtn = form.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإرسال…';

    api('/rsvp', {
      method: 'POST',
      body: { vid: VID, name: name, attend: attend, guests: guests, website: form.website.value }
    }).then(function () {
      var s = store.get();
      s.rsvp = { name: name, attend: attend, guests: guests };
      store.set(s);
      $('#rsvpDoneText').textContent = attend === 'yes' ? 'تم تأكيد حضوركم، ننتظركم بكل حب 🤍' : 'شكراً لكم، تم استلام اعتذاركم';
      form.hidden = true; done.hidden = false;
    }).catch(function (e2) {
      err.textContent = e2.status === 429 ? 'محاولات كثيرة، حاول بعد قليل' : 'تعذّر الإرسال، تأكد من الاتصال وحاول مرة أخرى';
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال';
    });
  });

  /* =========================================================
     AUTO-SCROLL — after opening, the invitation glides down by itself.
     Any touch / wheel / key hands control to the guest; it carries on
     after a few quiet seconds and stops for good at the bottom.
     ========================================================= */
  var autoScroll = (function () {
    var SPEED = CONFIG.autoScroll;
    var IDLE = 5000;   // ms without touching before it carries on
    var running = false, finished = false, pos = 0, last = 0, timer = 0;
    var root = document.scrollingElement || document.documentElement;

    function maxY() { return root.scrollHeight - window.innerHeight; }
    function modalOpen() { return $$('.modal').some(function (m) { return !m.hidden; }); }
    function later(ms) {
      running = false;
      clearTimeout(timer);
      if (!finished && SPEED > 0 && !reduceMotion) timer = setTimeout(start, ms);
    }
    function start() {
      if (running || finished) return;
      if (modalOpen()) return later(IDLE);
      running = true;
      pos = window.pageYOffset;
      last = performance.now();
      requestAnimationFrame(frame);
    }
    function frame(t) {
      if (!running) return;
      // the page moved some other way (e.g. a drag on the map) → let the guest lead
      if (Math.abs(window.pageYOffset - pos) > 30) return later(IDLE);
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      var end = maxY();
      pos = Math.min(end, pos + SPEED * dt);
      window.scrollTo(0, pos);
      if (pos >= end - 1) { running = false; finished = true; return; }
      requestAnimationFrame(frame);
    }
    ['touchstart', 'touchmove', 'wheel', 'mousedown', 'keydown', 'blur'].forEach(function (ev) {
      window.addEventListener(ev, function () { if (opened && !finished) later(IDLE); }, { passive: true });
    });
    return { later: later };
  })();

  /* =========================================================
     SPARKLES — soft light bubbles & glints drifting down the screen
     ========================================================= */
  var cv = $('#sparkles');
  var ctx = cv.getContext && cv.getContext('2d');
  if (ctx && !reduceMotion) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, parts = [];
    var TAU = Math.PI * 2;
    var rnd = function (a, b) { return a + Math.random() * (b - a); };

    // each look is drawn once, then stamped every frame
    var sprite = function (px, draw) {
      var c = document.createElement('canvas');
      c.width = c.height = px;
      draw(c.getContext('2d'), px / 2);
      return c;
    };
    var GLOW = sprite(64, function (g, m) {
      var gr = g.createRadialGradient(m, m, 0, m, m, m);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.22, 'rgba(255,247,250,.6)');
      gr.addColorStop(1, 'rgba(255,240,246,0)');
      g.fillStyle = gr; g.fillRect(0, 0, m * 2, m * 2);
    });
    var BUBBLE = sprite(96, function (g, m) {
      var r = m - 2;
      var fill = g.createRadialGradient(m, m, r * 0.5, m, m, r);
      fill.addColorStop(0, 'rgba(255,255,255,.05)');
      fill.addColorStop(0.8, 'rgba(255,238,246,.22)');
      fill.addColorStop(1, 'rgba(255,255,255,.7)');
      g.fillStyle = fill;
      g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill();
      var hx = m - r * 0.38, hy = m - r * 0.42, hr = r * 0.36;
      var shine = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
      shine.addColorStop(0, 'rgba(255,255,255,.95)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = shine;
      g.beginPath(); g.arc(hx, hy, hr, 0, TAU); g.fill();
    });
    var STAR = sprite(64, function (g, m) {
      g.drawImage(GLOW, m * 0.45, m * 0.45, m * 1.1, m * 1.1);
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath();
      g.moveTo(m, 0);
      g.quadraticCurveTo(m, m, m * 2, m);
      g.quadraticCurveTo(m, m, m, m * 2);
      g.quadraticCurveTo(m, m, 0, m);
      g.quadraticCurveTo(m, m, m, 0);
      g.fill();
    });

    var spawn = function (fromTop) {
      var k = Math.random(), p;
      if (k < 0.4) p = { img: BUBBLE, s: rnd(7, 18), vy: rnd(14, 26), a: rnd(0.45, 0.8), tw: 0 };
      else if (k < 0.86) p = { img: GLOW, s: rnd(6, 15), vy: rnd(16, 34), a: rnd(0.5, 0.95), tw: rnd(1, 2.2) };
      else p = { img: STAR, s: rnd(9, 16), vy: rnd(10, 18), a: rnd(0.6, 1), tw: rnd(1.2, 2.4), star: true };
      p.x = Math.random() * W;
      p.y = fromTop ? -p.s - Math.random() * 60 : Math.random() * H;
      p.sway = rnd(6, 20);
      p.sp = rnd(0.4, 1.1);
      p.ph = Math.random() * TAU;
      return p;
    };
    var size = function () {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // keep the particles already on screen (mobile toolbars resize the view while scrolling)
      var n = Math.max(18, Math.min(48, Math.round(W * H / 9500)));
      while (parts.length < n) parts.push(spawn(false));
      parts.length = n;
    };
    var last = performance.now();
    var frame = function (t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y += p.vy * dt;
        p.ph += dt * p.sp;
        if (p.y > H + p.s) parts[i] = p = spawn(true);
        var x = p.x + Math.sin(p.ph) * p.sway;
        var al = p.a;
        if (p.star) al *= Math.max(0, Math.sin(p.ph * p.tw * 2));      // glints flash in and out
        else if (p.tw) al *= 0.55 + 0.45 * Math.sin(p.ph * p.tw * 2);  // light dots shimmer
        ctx.globalAlpha = al;
        if (p.star) {
          ctx.save();
          ctx.translate(x, p.y); ctx.rotate(p.ph * 0.5);
          ctx.drawImage(p.img, -p.s / 2, -p.s / 2, p.s, p.s);
          ctx.restore();
        } else {
          ctx.drawImage(p.img, x - p.s / 2, p.y - p.s / 2, p.s, p.s);
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    };
    size();
    window.addEventListener('resize', size);
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (video) video.pause(); }
    else { kickVideo(); }
  });
})();
