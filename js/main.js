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
  $$('.gallery .moment').forEach(function (el, i) { el.style.setProperty('--d', (i % 2) * 0.12 + 's'); });
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
  $('#navCamera').addEventListener('click', function () {
    $('.moments__title').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  /* =========================================================
     WISHES + GUEST COUNT (from the backend)
     ========================================================= */
  var list = $('#wishList');
  var emptyEl = $('#wishEmpty');
  var guestCount = $('#guestCount');
  var shownWishIds = {};

  function wishNode(w, isNew) {
    var li = document.createElement('li');
    li.className = 'wish' + (isNew ? ' wish--new' : '');
    li.textContent = '"' + w.text + '"';
    li.setAttribute('data-id', w.id);
    return li;
  }
  function renderWishes(wishes) {
    var frag = document.createDocumentFragment();
    shownWishIds = {};
    wishes.forEach(function (w) { shownWishIds[w.id] = true; frag.appendChild(wishNode(w)); });
    $$('.wish:not(.wish--empty)', list).forEach(function (n) { n.remove(); });
    list.appendChild(frag);
    emptyEl.hidden = wishes.length > 0;
  }
  function addWishTop(w) {
    var existing = list.querySelector('[data-id="' + w.id + '"]');
    if (existing) existing.remove();
    shownWishIds[w.id] = true;
    list.insertBefore(wishNode(w, true), emptyEl.nextSibling);
    emptyEl.hidden = true;
    list.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  var shownCount = 0;
  function setGuestCount(n) {
    n = Math.max(0, n | 0);
    if (reduceMotion || !('requestAnimationFrame' in window)) { guestCount.textContent = n; shownCount = n; return; }
    var from = shownCount, t0 = performance.now(), dur = Math.min(1400, 300 + Math.abs(n - from) * 8);
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      guestCount.textContent = Math.round(from + (n - from) * e);
      if (k < 1) requestAnimationFrame(step); else shownCount = n;
    })(t0);
  }

  function loadPublic() {
    return api('/invite').then(function (d) {
      renderWishes(d.wishes || []);
      setGuestCount(d.attending || 0);
    }).catch(function () { /* page still works without the backend */ });
  }
  loadPublic();
  setInterval(function () { if (!document.hidden) loadPublic(); }, 60000);

  function step(dir) {
    var items = $$('.wish:not([hidden])', list);
    var top = list.scrollTop, target = top;
    if (dir > 0) {
      for (var i = 0; i < items.length; i++) { if (items[i].offsetTop - list.offsetTop > top + 2) { target = items[i].offsetTop - list.offsetTop; break; } }
    } else {
      for (var j = items.length - 1; j >= 0; j--) { if (items[j].offsetTop - list.offsetTop < top - 2) { target = items[j].offsetTop - list.offsetTop; break; } }
    }
    list.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  $('#wishUp').addEventListener('click', function () { step(-1); });
  $('#wishDown').addEventListener('click', function () { step(1); });

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
    var wish = form.wish.value.trim().slice(0, 300);
    if (name.length < 2) { err.textContent = 'فضلاً اكتب الاسم'; form.name.focus(); return; }
    err.textContent = '';

    var submitBtn = form.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الإرسال…';

    api('/rsvp', {
      method: 'POST',
      body: { vid: VID, name: name, attend: attend, guests: guests, wish: wish, website: form.website.value }
    }).then(function (res) {
      var s = store.get();
      s.rsvp = { name: name, attend: attend, guests: guests };
      store.set(s);
      if (typeof res.attending === 'number') setGuestCount(res.attending);
      if (res.wish) addWishTop(res.wish);
      $('#rsvpDoneText').textContent = attend === 'yes' ? 'تم تأكيد حضوركم، ننتظركم بكل حب 🤍' : 'شكراً لكم، تم استلام اعتذاركم';
      form.hidden = true; done.hidden = false;
      form.wish.value = '';
    }).catch(function (e2) {
      err.textContent = e2.status === 429 ? 'محاولات كثيرة، حاول بعد قليل' : 'تعذّر الإرسال، تأكد من الاتصال وحاول مرة أخرى';
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال';
    });
  });

  /* =========================================================
     SPARKLES — soft floating light particles
     ========================================================= */
  var cv = $('#sparkles');
  var ctx = cv.getContext && cv.getContext('2d');
  if (ctx && !reduceMotion) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, parts = [];
    var size = function () {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(W, 420) * H / 11000);
      parts = [];
      for (var i = 0; i < n; i++) parts.push(spawn(true));
    };
    var spawn = function (anywhere) {
      var cw = Math.min(W, 368);
      return {
        x: Math.max(0, (W - cw) / 2) + Math.random() * cw,
        y: anywhere ? Math.random() * H : H + 10,
        r: 0.8 + Math.random() * 1.8,
        vy: 6 + Math.random() * 14,
        sway: 6 + Math.random() * 14,
        ph: Math.random() * Math.PI * 2,
        tw: 0.6 + Math.random() * 1.6,
        a: 0.25 + Math.random() * 0.55
      };
    };
    var last = performance.now();
    var frame = function (t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.vy * dt;
        p.ph += dt * p.tw;
        if (p.y < -10) parts[i] = p = spawn(false);
        var x = p.x + Math.sin(p.ph) * p.sway;
        var al = p.a * (0.55 + 0.45 * Math.sin(p.ph * 1.7));
        var g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 3);
        g.addColorStop(0, 'rgba(255,255,255,' + al + ')');
        g.addColorStop(0.4, 'rgba(255,250,252,' + al * 0.5 + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, p.y, p.r * 3, 0, Math.PI * 2); ctx.fill();
      }
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
