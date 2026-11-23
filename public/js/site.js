/* Coastal Grounds Solutions: header, drawer, reveals, process steps, reviews rail, estimate form.
   Native scroll only. No libraries. */
(function () {
  var d = document, w = window, root = d.documentElement;
  root.classList.add('js');
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* header: solid after the hero, tucks away on scroll down, returns on scroll up */
  var hdr = d.querySelector('.hdr'), mbar = d.querySelector('.mbar'), lastY = w.scrollY, ticking = false;
  function onScroll() {
    var y = w.scrollY;
    if (hdr) {
      hdr.classList.toggle('solid', y > 40);
      hdr.classList.toggle('tuck', y > 480 && y > lastY + 4 && !d.body.classList.contains('lock'));
      if (y < lastY - 4) hdr.classList.remove('tuck');
    }
    if (mbar) mbar.classList.toggle('show', y > 520);
    lastY = y; ticking = false;
  }
  w.addEventListener('scroll', function () { if (!ticking) { ticking = true; w.requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* drawer */
  var burger = d.querySelector('.burger'), drawer = d.getElementById('drawer');
  function setDrawer(open) {
    if (!drawer || !burger) return;
    drawer.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) drawer.removeAttribute('inert'); else drawer.setAttribute('inert', '');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    d.body.classList.toggle('lock', open);
    if (open && hdr) hdr.classList.remove('tuck');
    if (open) { var f = drawer.querySelector('a'); if (f) f.focus(); } else { burger.focus(); }
  }
  if (burger && drawer) {
    burger.addEventListener('click', function () { setDrawer(!drawer.classList.contains('open')); });
    var closeBtn = drawer.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', function () { setDrawer(false); });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setDrawer(false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false); });
  }

  /* reveals + the mowing pass: one observer; anything already on screen shows at once */
  var targets = [].slice.call(d.querySelectorAll('.rv, .mow-list'));
  function show(el) { el.classList.add(el.classList.contains('mow-list') ? 'go' : 'in'); }
  if (reduce || !('IntersectionObserver' in w)) { targets.forEach(show); }
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    targets.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < w.innerHeight * 0.92 && r.bottom > 0) show(el); else io.observe(el);
    });
    /* safety net: nothing stays hidden if an observer callback never fires */
    w.addEventListener('load', function () {
      setTimeout(function () {
        targets.forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < w.innerHeight && r.bottom > 0) show(el); });
      }, 1200);
    });
  }

  /* hero video: never block, pause when off screen, skip for reduced motion */
  var vid = d.querySelector('.vhero-media video'), userPaused = false;
  var pauseBtn = d.querySelector('.vhero-pause');
  if (vid && pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      userPaused = !userPaused;
      if (userPaused) vid.pause(); else { var pp = vid.play(); if (pp && pp.catch) pp.catch(function () {}); }
      pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      pauseBtn.setAttribute('aria-label', userPaused ? 'Play background video' : 'Pause background video');
    });
  }
  if (vid) {
    if (reduce) { vid.removeAttribute('autoplay'); vid.pause(); }
    else if ('IntersectionObserver' in w) {
      new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting && !userPaused) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } else vid.pause(); });
      }).observe(vid);
    }
  }

  /* reviews rail buttons */
  d.querySelectorAll('[data-rail]').forEach(function (nav) {
    var rail = d.getElementById(nav.getAttribute('data-rail'));
    if (!rail) return;
    nav.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = rail.querySelector('.rev');
        var step = card ? card.getBoundingClientRect().width + 16 : rail.clientWidth * 0.8;
        rail.scrollBy({ left: b.getAttribute('data-dir') === 'prev' ? -step : step, behavior: reduce ? 'auto' : 'smooth' });
      });
    });
  });

  /* estimate form: validate, then open a pre-filled text to Kevin right away */
  var PHONE = '+12398878922';
  d.querySelectorAll('form.lead-form').forEach(function (form) {
    var started = Date.now();
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');
    function say(msg, cls) { if (status) { status.textContent = msg; status.className = 'form-status ' + (cls || ''); } }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      var bad = null;
      ['name', 'phone'].forEach(function (k) {
        var el = form.elements[k];
        var ok = !!data[k] && (k !== 'phone' || data[k].replace(/\D/g, '').length >= 10);
        if (el) el.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !bad) bad = el;
      });
      if (bad) { say(bad.name === 'phone' ? 'Please enter a phone number, area code included.' : 'Please enter your name.', 'err'); bad.focus(); return; }
      data.page = location.pathname;
      data.elapsed = String(Date.now() - started);
      var body = 'Hi Kevin, it\u2019s ' + data.name + '. I\u2019m looking for a free estimate' + (data.service ? ' for ' + data.service : '') +
        (data.town ? ' in ' + data.town : '') + '.' + (data.message ? ' ' + data.message : '') + ' You can reach me at ' + data.phone + '.';
      var sms = 'sms:' + PHONE + (/iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(body);
      /* open Messages right away, inside the tap, so the phone allows it */
      w.location.href = sms;
      if (typeof w.gtag === 'function') w.gtag('event', 'generate_lead');
      status.innerHTML = '';
      status.className = 'form-status ok';
      status.appendChild(d.createTextNode('Your message to Kevin is ready in Messages. Just hit send. Didn’t open? '));
      var a = d.createElement('a'); a.href = sms; a.textContent = 'Tap here to text (239) 887-8922'; a.style.color = 'inherit'; a.style.fontWeight = '700';
      status.appendChild(a);
      status.appendChild(d.createTextNode('.'));
    });
  });
})();
