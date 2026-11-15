/* =========================================================
 * 피스빌리지네트워크 홈페이지 공통 스크립트
 * - 내용 불러오기 (구글 시트 → 실패하면 기본 내용)
 * - 헤더·메뉴·푸터 그리기, 기능 켜기/끄기
 * - 페이지별 영역 채우기, 빈칸·임시사진 표시
 * 관리자는 이 파일을 고칠 필요가 없습니다.
 * ========================================================= */
(function () {
  'use strict';

  var CFG = window.PVN_CONFIG || { sheetId: '', tabs: {} };
  var DEF = window.PVN_DEFAULT;
  var TODO_RE = /\[[^\[\]]{1,80}\]/g;

  /* ---------- 작은 도구들 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function lines(s) { return String(s || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function nl2br(s) { return lines(s).map(esc).join('<br>'); }
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // javascript: 등 차단
    return u; // 상대경로
  }
  function isOn(v) { return /^(y|yes|on|true|1|사용|켜기|o)$/i.test(String(v || '').trim()); }
  function featOn(f, spec) {
    return String(spec || '').split('|').every(function (k) {
      k = k.trim();
      if (!k) return true;
      return f[k] === undefined ? true : isOn(f[k]);
    });
  }
  function isTodo(v) { return /^\s*\[[^\]]*\]\s*$/.test(String(v || '')); }
  function visible(rows) { return (rows || []).filter(function (r) { return String(r['공개여부'] || 'Y').trim().toUpperCase() !== 'N'; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function driveLinks(url) {
    var u = safeUrl(url);
    var m = u.match(/\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/);
    if (!m) return { view: u, download: u, local: !/^https?:/i.test(u) };
    return {
      view: 'https://drive.google.com/file/d/' + m[1] + '/view',
      download: 'https://drive.google.com/uc?export=download&id=' + m[1]
    };
  }
  function driveImage(u) {
    var m = String(u || '').match(/drive\.google\.com\/.*(?:\/d\/|[?&]id=)([\w-]{10,})/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w1600' : u;
  }

  /* ---------- CSV 읽기 ---------- */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    if (!rows.length) return [];
    var head = rows[0].map(function (h) { return h.trim(); });
    return rows.slice(1).filter(function (r) { return r.some(function (v) { return v.trim() !== ''; }); })
      .map(function (r) { var o = {}; head.forEach(function (h, k) { if (h) o[h] = (r[k] || '').trim(); }); return o; });
  }
  function fetchTab(name) {
    var url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(CFG.sheetId) +
      '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(name);
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('sheet ' + r.status);
      return r.text();
    }).then(parseCSV);
  }

  /* ---------- 내용 불러오기 ---------- */
  var TAB_KEYS = ['features', 'texts', 'images', 'summary', 'info', 'banners', 'works', 'regions', 'history', 'notices', 'finance'];
  function applyTab(data, k, rows) {
    if (k === 'features') {
      rows.forEach(function (r) { if (r['항목']) data.features[r['항목']] = r['사용']; });
    } else if (k === 'texts') {
      rows.forEach(function (r) { if (r['키'] && String(r['내용'] || '').trim()) data.texts[r['키']] = r['내용']; });
    } else if (k === 'images') {
      rows.forEach(function (r) { if (r['키'] && String(r['사진'] || '').trim()) data.images[r['키']] = { src: r['사진'], alt: r['설명'] }; });
    } else if (k === 'info') {
      rows.forEach(function (r) {
        var key = r['항목'], val = r['내용'] != null ? r['내용'] : r['값'];
        if (!key) return;
        if (key in data.features) data.features[key] = val;
        else data.info[key] = val;
      });
    } else data[k] = rows;
  }
  function loadData() {
    var data = JSON.parse(JSON.stringify(DEF));
    if (!CFG.sheetId) return Promise.resolve(data);
    return Promise.all(TAB_KEYS.map(function (k) {
      return fetchTab(CFG.tabs[k]).catch(function () { return null; }); // 실패한 탭은 기본 내용 유지
    })).then(function (res) {
      TAB_KEYS.forEach(function (k, i) { if (res[i]) applyTab(data, k, res[i]); });
      return data;
    });
  }
  // 관리자 미리보기: 관리 화면이 보내준 시트 내용(저장 전 포함)으로 그리기
  function fromTabs(tabs) {
    var data = JSON.parse(JSON.stringify(DEF));
    TAB_KEYS.forEach(function (k) {
      var t = tabs[CFG.tabs[k]];
      if (t && t.rows) applyTab(data, k, t.rows.map(function (r) {
        var o = {}; Object.keys(r).forEach(function (h) { o[h] = r[h] == null ? '' : String(r[h]).trim(); }); return o;
      }));
    });
    return data;
  }

  /* ---------- 메뉴 ---------- */
  function menus(data) {
    var f = data.features;
    function on(k) { return featOn(f, k); }
    var works = visible(data.works).map(function (w, k) { return [w['사업명'], 'business.html#work-' + (w['번호'] || k + 1)]; });
    var regions = visible(data.regions).map(function (r, k) { return [r['국가'], 'region.html#region-' + (k + 1)]; });
    var list = [
      { key: 'org', label: '기관', cols: [
        on('기관소개 페이지') && { title: '기관소개', href: 'about.html', links: [['피빌네는', 'about.html#about'], on('기관소개: 비전과 가치') && ['비전과 가치', 'about.html#values'], on('기관소개: 연혁') && ['연혁', 'about.html#history']] },
        on('재정보고 페이지') && { title: '재정보고', href: 'finance.html', links: [on('재정보고: 요약 그래프') && ['한눈에 보는 재정', 'finance.html#summary'], on('재정보고: 공시서류') && ['공시서류', 'finance.html#settlement'], on('기부금 활용실적 공개') && ['기부금 모금액 및 활용실적', 'finance.html#donation']] }
      ] },
      { key: 'work', label: '사업', cols: [
        on('주요 지원 사업 페이지') && { title: '주요 지원 사업', href: 'business.html', links: works },
        on('활동 지역 페이지') && { title: '활동 지역', href: 'region.html', links: regions }
      ] },
      { key: 'support', label: '후원/참여', cols: [
        on('후원하기 페이지') && { title: '후원하기', href: 'support.html', links: [on('후원하기: 계좌 후원') && ['계좌 후원', 'support.html#account'], on('CMS 정기후원 사용') && ['CMS 정기후원', 'support.html#regular'], on('후원하기: 기업·단체 후원') && ['기업·단체 후원', 'support.html#corp']] },
        on('기부금영수증 페이지') && { title: '기부금영수증', href: 'receipt.html', links: [['발급 안내', 'receipt.html']] }
      ] },
      { key: 'news', label: '소식', cols: [
        on('공지사항 페이지') && { title: '공지사항', href: 'news.html', links: [['피빌네 소식과 공지', 'news.html']] }
      ] }
    ];
    return list.map(function (m) {
      m.cols = m.cols.filter(Boolean);
      m.cols.forEach(function (c) { c.links = (c.links || []).filter(Boolean); });
      m.href = m.cols.length ? m.cols[0].href : '';
      return m;
    }).filter(function (m) { return m.cols.length; });
  }

  function renderHeader(data, current) {
    var el = $('#site-header');
    if (!el) return;
    var ms = menus(data);
    var nav = ms.map(function (m) {
      var subs = [];
      m.cols.forEach(function (c) {
        if (c.links.length) c.links.forEach(function (l) { subs.push('<a href="' + esc(l[1]) + '">' + esc(l[0]) + '</a>'); });
        else subs.push('<a href="' + esc(c.href) + '">' + esc(c.title) + '</a>');
      });
      return '<li class="nav-item">' +
        '<a class="nav-top' + (m.key === current ? ' is-current' : '') + '" href="' + m.href + '" data-menu="' + m.key + '"' +
        (m.key === current ? ' aria-current="page"' : '') + '>' + esc(m.label) + '</a>' +
        '<div class="mobile-sub">' + subs.join('') + '</div></li>';
    }).join('');


    el.innerHTML =
      '<div class="wrap head-row">' +
        '<a class="brand" href="index.html" aria-label="피스빌리지네트워크 홈">' +
          '<img src="assets/img/logo-bird.png" alt="" width="46" height="43">' +
          '<span class="brand-text"><span class="brand-ko"><span class="g">피스빌리지</span><span class="b">네트워크</span></span>' +
          '<span class="brand-en">Peace Village Network</span></span>' +
        '</a>' +
        '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="main-nav" aria-label="메뉴 열기">' +
          '<svg class="ic-open" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
          '<svg class="ic-close" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
        '<nav id="main-nav" class="main-nav" aria-label="주 메뉴"><ul>' + nav + '</ul></nav>' +
        (featOn(data.features, '후원하기 페이지') ? '<a class="btn btn-yellow head-cta" href="support.html">후원하기</a>' : '') +
      '</div>' +
      '<div class="mega" hidden><div class="wrap mega-inner"></div></div>';

    var mega = $('.mega', el), inner = $('.mega-inner', el), timer;
    function openMega(key) {
      var m = ms.filter(function (x) { return x.key === key; })[0];
      if (!m) return;
      inner.innerHTML = m.cols.map(function (c) {
        return '<div class="mega-col"><a class="mega-title" href="' + esc(c.href) + '">' + esc(c.title) + '</a>' +
          (c.desc ? '<p class="mega-desc">' + esc(c.desc) + '</p>' : '') +
          c.links.map(function (l) { return '<a href="' + esc(l[1]) + '">' + esc(l[0]) + '</a>'; }).join('') + '</div>';
      }).join('');
      $all('.nav-top', el).forEach(function (a) { a.classList.toggle('is-open', a.dataset.menu === key); });
      mega.hidden = false;
    }
    function closeMega() {
      mega.hidden = true;
      $all('.nav-top', el).forEach(function (a) { a.classList.remove('is-open'); });
    }
    $all('.nav-top', el).forEach(function (a) {
      a.addEventListener('mouseenter', function () { if (isDesktop()) { clearTimeout(timer); openMega(a.dataset.menu); } });
      a.addEventListener('focus', function () { if (isDesktop()) openMega(a.dataset.menu); });
    });
    el.addEventListener('mouseleave', function () { timer = setTimeout(closeMega, 120); });
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('click', function (e) { if (e.target.closest('.mega a')) closeMega(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMega(); });
    document.addEventListener('focusin', function (e) { if (!el.contains(e.target)) closeMega(); });

    var toggle = $('.nav-toggle', el);
    toggle.addEventListener('click', function () {
      var open = el.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
  }
  function isDesktop() { return window.matchMedia('(min-width: 961px)').matches; }

  function telHref(v) { var d = String(v || '').replace(/[^\d+]/g, ''); return d.length >= 8 ? 'tel:' + d : ''; }

  function renderFooter(data) {
    var el = $('#site-footer');
    if (!el) return;
    var i = data.info;
    var tel = telHref(i['전화']);
    el.innerHTML =
      '<div class="wrap foot-row">' +
        '<div class="foot-info">' +
          '<strong class="foot-name">' + esc(i['기관명']) + '</strong>' +
          '<dl class="foot-dl">' +
            '<div><dt>대표자</dt><dd>' + esc(i['대표자']) + '</dd></div>' +
            '<div><dt>사업자등록번호</dt><dd>' + esc(i['사업자등록번호']) + '</dd></div>' +
            '<div class="wide"><dt>주소</dt><dd>' + esc(i['주소']) + '</dd></div>' +
            '<div><dt>대표전화</dt><dd>' + (tel ? '<a href="' + tel + '">' + esc(i['전화']) + '</a>' : esc(i['전화'])) + '</dd></div>' +
            (i['문의 전화'] ? '<div><dt>후원·문의</dt><dd>' + (telHref(i['문의 전화']) ? '<a href="' + telHref(i['문의 전화']) + '">' + esc(i['문의 전화']) + '</a>' : esc(i['문의 전화'])) +
              (i['문의 담당'] ? ' (' + esc(i['문의 담당']) + ')' : '') + '</dd></div>' : '') +
            '<div><dt>이메일</dt><dd>' + esc(i['이메일']) + '</dd></div>' +
          '</dl>' +
          '<p class="copy">© ' + new Date().getFullYear() + ' ' + esc(i['영문명']) + '. All rights reserved.</p>' +
        '</div>' +
        '<ul class="foot-links">' +
          '<li><a href="privacy.html">개인정보처리방침</a></li>' +
          (featOn(data.features, '재정보고 페이지') ? '<li><a href="finance.html">재정보고</a></li>' : '') +
          (featOn(data.features, '후원하기 페이지') ? '<li><a href="support.html">후원하기</a></li>' : '') +
          '<li><a href="https://www.hometax.go.kr" target="_blank" rel="noopener">국세청 홈택스</a></li>' +
        '</ul>' +
      '</div>';
  }

  /* ---------- 공통 채우기 ---------- */
  function fillInfo(data) {
    $all('[data-info]').forEach(function (n) {
      var v = data.info[n.getAttribute('data-info')];
      if (v != null && v !== '') n.textContent = v;
    });
    $all('[data-tel]').forEach(function (n) {
      var v = data.info[n.getAttribute('data-tel')], t = telHref(v);
      n.textContent = v || '';
      if (t) n.setAttribute('href', t); else n.removeAttribute('href');
    });
    $all('[data-mail]').forEach(function (n) {
      var v = data.info[n.getAttribute('data-mail')];
      n.textContent = v || '';
      if (v && v.indexOf('@') > 0) n.setAttribute('href', 'mailto:' + v);
    });
    $all('[data-feature]').forEach(function (n) {
      var spec = n.getAttribute('data-feature');
      if (featOn(data.features, spec)) return;
      if (EDIT) { n.classList.add('pvn-off'); n.setAttribute('data-off-label', '꺼짐 · 홈페이지에 안 보임'); }
      else n.hidden = true;
    });
    $all('[data-feature-off]').forEach(function (n) { if (featOn(data.features, n.getAttribute('data-feature-off'))) n.hidden = true; });
    $all('.sub-tabs').forEach(function (nav) { if ($all('a', nav).filter(function (x) { return !x.hidden; }).length < 2) nav.hidden = true; });
  }

  function applyTexts(data) {
    $all('[data-text]').forEach(function (n) {
      var v = data.texts[n.getAttribute('data-text')];
      if (v != null && String(v).trim() !== '') n.innerHTML = String(v).trim().split(/\r?\n/).map(esc).join('<br>');
    });
    $all('[data-img]').forEach(function (n) {
      var v = data.images[n.getAttribute('data-img')];
      if (!v) return;
      var u = safeUrl(driveImage(v.src));
      if (u) n.src = u;
      if (v.alt) n.alt = v.alt;
    });
  }
  function pageGate(data) {
    var main = $('main[data-page-feature]');
    if (!main || featOn(data.features, main.getAttribute('data-page-feature'))) return;
    if (EDIT) {
      var bar = document.createElement('div');
      bar.className = 'pvn-pageoff';
      bar.textContent = '이 페이지는 꺼져 있어요 — 홈페이지 메뉴에 없고, 주소로 들어오면 \'준비 중\'으로 보입니다.';
      main.insertBefore(bar, main.firstChild);
      main.classList.add('pvn-page-dim');
      return;
    }
    main.innerHTML = '<section class="coming"><h1>준비 중인 페이지입니다</h1><p>더 나은 모습으로 곧 찾아뵙겠습니다.</p>' +
      '<a class="btn btn-green" href="index.html">홈으로</a></section>';
    main.removeAttribute('data-page-feature');
  }

  // 계좌번호 복사
  function bindCopy() {
    $all('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = document.getElementById(btn.getAttribute('data-copy'));
        var text = src ? src.textContent.replace(/\s+/g, ' ').trim() : '';
        var label = btn.textContent;
        function done(ok) {
          btn.textContent = ok ? '복사됨' : '길게 눌러 복사하세요';
          setTimeout(function () { btn.textContent = label; }, 1800);
        }
        function fallback() {
          try {
            var r = document.createRange(); r.selectNodeContents(src);
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
            done(document.execCommand('copy'));
          } catch (e) { done(false); }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
        } else fallback();
      });
    });
  }

  /* ---------- 영역별 그리기 ---------- */
  var R = {};

  R.hero = function (el, data) {
    var slides = visible(data.banners);
    if (!slides.length) { el.hidden = true; return; }
    var i = 0;
    el.innerHTML =
      '<div class="wrap hero-row">' +
        '<div class="hero-text">' +
          '<span class="tag" data-h="tag"></span>' +
          '<h1 class="hero-title" data-h="title"></h1>' +
          '<p class="hero-desc" data-h="desc"></p>' +
          '<div class="hero-actions">' +
            '<a class="btn btn-green" data-h="btn" href="#"></a>' +
            (slides.length > 1
              ? '<div class="hero-nav"><button type="button" class="round" data-h="prev" aria-label="이전 배너"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
                '<span class="hero-count" data-h="count" aria-live="polite"></span>' +
                '<button type="button" class="round" data-h="next" aria-label="다음 배너"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>'
              : '') +
          '</div>' +
        '</div>' +
        '<div class="hero-media ph" data-h="media"><img data-h="img" alt=""></div>' +
      '</div>';
    function h(k) { return $('[data-h="' + k + '"]', el); }
    function show() {
      var s = slides[i];
      h('tag').textContent = s['꼬리표'] || '';
      h('tag').hidden = !s['꼬리표'];
      h('title').innerHTML = nl2br(s['제목']);
      h('desc').innerHTML = nl2br(s['부제']);
      h('desc').hidden = !s['부제'];
      var b = h('btn');
      b.textContent = s['버튼문구'] || '자세히 보기';
      b.href = safeUrl(s['버튼링크']) || '#';
      b.hidden = !s['버튼링크'];
      var img = h('img');
      img.src = safeUrl(driveImage(s['이미지'])) || 'assets/img/p1-kmcc-2026.jpg';
      img.alt = s['이미지 설명'] || '';
      if (s['사진 요청']) h('media').setAttribute('data-todo', s['사진 요청']); else h('media').removeAttribute('data-todo');
      if (h('count')) h('count').textContent = (i + 1) + ' / ' + slides.length;
      markTodos(el);
    }
    if (h('prev')) {
      h('prev').addEventListener('click', function () { i = (i + slides.length - 1) % slides.length; show(); });
      h('next').addEventListener('click', function () { i = (i + 1) % slides.length; show(); });
    }
    show();
    el.__go = function (k) { if (k >= 0 && k < slides.length) { i = k; show(); } };
  };

  function bulletList(text) {
    return '<ul class="dots">' + lines(text).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
  }

  R.works = function (el, data) {
    el.innerHTML = visible(data.works).map(function (w, k) {
      var n = w['번호'] || k + 1;
      return '<article class="work" id="work-' + esc(n) + '">' +
        '<span class="num" aria-hidden="true">' + esc(n) + '</span>' +
        '<div class="work-body"><h3>' + esc(w['사업명']) + '</h3>' + bulletList(w['설명']) + '</div></article>';
    }).join('');
  };

  R.regions = function (el, data) {
    el.innerHTML = visible(data.regions).map(function (r, k) {
      var items = lines(r['활동']).map(function (l) {
        var m = l.match(/^(\d{4}(?:\.\s?\d{1,2})?)\s+(.*)$/);
        return m ? '<li><span class="y">' + esc(m[1]) + '</span><span>' + esc(m[2]) + '</span></li>' : '<li><span></span><span>' + esc(l) + '</span></li>';
      }).join('');
      return '<article class="region" id="region-' + (k + 1) + '"><h3>' + esc(r['국가']) + '</h3><ul class="year-list">' + items + '</ul></article>';
    }).join('');
  };

  R.history = function (el, data) {
    var rows = visible(data.history);
    var limit = parseInt(el.getAttribute('data-limit'), 10);
    if (limit) rows = rows.slice(-limit);
    el.className = el.getAttribute('data-style') === 'timeline' ? 'timeline' : 'history-cards';
    el.innerHTML = rows.map(function (h) {
      return '<li><span class="year">' + esc(h['연도']) + '</span>' + bulletList(h['내용']) + '</li>';
    }).join('');
  };

  /* 게시판: 목록을 누르면 상세 화면 (주소 끝 #doc-… 로 구분, 뒤로가기 가능) */
  function docId(r) {
    var str = (r['게시일'] || '') + '|' + (r['제목'] || ''), h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return 'doc-' + (h >>> 0).toString(36);
  }
  function byDate(rows) {
    return rows.map(function (r, i) { return [r, i]; })
      .sort(function (a, b) { return String(b[0]['게시일']).localeCompare(String(a[0]['게시일'])) || a[1] - b[1]; })
      .map(function (x) { return x[0]; });
  }
  function attachBox(url, name) {
    var d = driveLinks(url);
    if (!d.view) return '';
    var isFile = !d.local || /\.(pdf|hwp|hwpx|docx?|xlsx?|zip|jpe?g|png)$/i.test(d.view);
    if (d.local && !isFile) return '<div class="post-attach"><a class="btn btn-line sm" href="' + esc(d.view) + '">자세히 보기</a></div>';
    return '<div class="attach"><span class="attach-name">첨부 · ' + esc(name || '첨부파일') + '</span><span class="fin-btns">' +
      '<a class="btn btn-line sm" href="' + esc(d.view) + '" target="_blank" rel="noopener">보기</a>' +
      '<a class="btn btn-line sm" href="' + esc(d.download) + '"' + (d.local ? ' download' : '') + '>내려받기</a></span></div>';
  }
  // opt: { rows, back(목록 주소), tag(r), body(r), attach(r) }
  function board(el, opt) {
    var want = decodeURIComponent(location.hash.slice(1));
    var idx = -1;
    opt.rows.forEach(function (r, i) { if (docId(r) === want) idx = i; });
    if (idx < 0) {
      el.innerHTML = '<ul class="board">' + opt.rows.map(function (r) {
        var hasFile = !!driveLinks(opt.attachUrl(r)).view;
        return '<li><a href="#' + docId(r) + '">' +
          (opt.tag(r) ? '<span class="b-tag">' + esc(opt.tag(r)) + '</span>' : '') +
          '<span class="b-title">' + esc(r['제목']) + '</span>' +
          '<span class="b-meta">' + (hasFile ? '<span class="b-file">첨부</span>' : '') + '<time>' + esc(r['게시일']) + '</time></span></a></li>';
      }).join('') + '</ul>';
      return false;
    }
    var r = opt.rows[idx], prev = opt.rows[idx - 1], next = opt.rows[idx + 1];
    el.innerHTML = '<article class="post">' +
      '<a class="post-back" href="' + opt.back + '">← 목록으로</a>' +
      '<header class="post-head">' + (opt.tag(r) ? '<span class="b-tag">' + esc(opt.tag(r)) + '</span>' : '') +
        '<h2>' + esc(r['제목']) + '</h2><p class="post-meta">게시일 <time>' + esc(r['게시일']) + '</time></p></header>' +
      '<div class="post-body">' + opt.body(r) + '</div>' + opt.attach(r) +
      '<nav class="post-nav" aria-label="다른 글">' +
        (prev ? '<a href="#' + docId(prev) + '"><span>이전 글</span>' + esc(prev['제목']) + '</a>' : '') +
        (next ? '<a href="#' + docId(next) + '"><span>다음 글</span>' + esc(next['제목']) + '</a>' : '') + '</nav>' +
      '<div class="post-foot"><a class="btn btn-line" href="' + opt.back + '">목록으로</a></div></article>';
    var host = el.closest('.fin-sec') || el.closest('section');
    if (host) host.classList.add('detail-host');
    document.body.setAttribute('data-detail', '1');
    return true;
  }

  function noticeRows(data) { return byDate(visible(data.notices)); }
  R.noticesLatest = function (el, data) {
    var rows = noticeRows(data).slice(0, 3);
    var sec = el.closest('section');
    if (!rows.length) { if (sec && !EDIT) sec.hidden = true; el.innerHTML = '<li class="empty">등록된 공지가 없습니다.</li>'; return; }
    el.innerHTML = rows.map(function (n) {
      return '<li><a href="news.html#' + docId(n) + '"><span class="n-title">' + esc(n['제목']) +
        '</span><time>' + esc(n['게시일']) + '</time></a></li>';
    }).join('');
  };
  R.noticeList = function (el, data) {
    var rows = noticeRows(data);
    if (!rows.length) { el.innerHTML = '<p class="empty">등록된 공지가 없습니다.</p>'; return; }
    board(el, {
      rows: rows, back: '#list',
      tag: function () { return ''; },
      attachUrl: function (r) { return r['첨부링크']; },
      body: function (r) { return lines(r['내용']).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join(''); },
      attach: function (r) { return attachBox(r['첨부링크'], '첨부파일'); }
    });
  };

  R.finance = function (el, data) {
    var kind = el.getAttribute('data-kind'); // settlement | donation
    var rows = visible(data.finance).filter(function (r) {
      var isSettle = !/기부금/.test(r['구분'] || '');
      return kind === 'settlement' ? isSettle : !isSettle;
    });
    if (!rows.length) {
      var when = data.info['재정보고 공개 예정'];
      el.innerHTML = '<div class="placeholder"><strong>공개 자료를 준비하고 있습니다.</strong>' +
        (when && !isTodo(when) ? '<p>공개 예정: ' + esc(when) + '</p>' : '') + '</div>';
      return;
    }
    board(el, {
      rows: byDate(rows), back: '#' + kind,
      tag: function (r) { var y = String(r['연도'] || '').replace(/\s*년\s*$/, ''); return [y ? y + '년' : '', r['구분']].filter(Boolean).join(' · '); },
      attachUrl: function (r) { return r['파일링크']; },
      body: function (r) { return r['내용'] ? announce(r['내용']) : ''; },
      attach: function (r) { return attachBox(r['파일링크'], r['파일명'] || (r['제목'] + '.pdf')); }
    });
  };

  // 공고문: 첫 줄은 제목처럼 크게, 빈 줄은 간격으로 유지
  function announce(text) {
    var ls = String(text).split(/\r?\n/);
    var head = ls.shift();
    return '<div class="announce"><strong class="ann-title">' + esc(head) + '</strong>' +
      ls.map(function (l) { return l.trim() ? '<p>' + esc(l) + '</p>' : '<span class="gap"></span>'; }).join('') + '</div>';
  }

  R.greeting = function (el, data) {
    var text = data.info['인사말'];
    if (!text) { el.hidden = true; return; }
    $('.greeting-text', el).innerHTML = nl2br(text);
    $('.greeting-sign', el).textContent = data.info['인사말 서명'] || '';
  };

  R.supportTabs = function (el, data) {
    var tabs = $all('[role="tab"]', el).filter(function (t) { return !t.closest('[hidden]'); });
    function select(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    }
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          var n = tabs[(k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
          n.focus(); select(n);
        }
      });
    });
    function fromHash(scroll) {
      var want = tabs.filter(function (t) { return '#' + t.getAttribute('data-anchor') === location.hash; })[0];
      if (want) { select(want); if (scroll) el.scrollIntoView({ behavior: 'smooth' }); return true; }
      return false;
    }
    if (!tabs.length) { el.hidden = true; return; }
    if (!fromHash(false)) select(tabs[0]);
    if (window.__pvnTabHash) window.removeEventListener('hashchange', window.__pvnTabHash);
    window.__pvnTabHash = function () { fromHash(true); };
    window.addEventListener('hashchange', window.__pvnTabHash);
    var link = safeUrl(data.info['CMS 신청 링크']);
    var a = $('#regular-apply');
    if (a) { if (link) a.href = link; else a.removeAttribute('href'); a.classList.toggle('is-disabled', !link); }
  };

  // 재정 요약(A형): 연도별 수입·지출 막대
  R.finSummary = function (el, data) {
    var rows = visible(data.summary).filter(function (r) { return r['연도'] && r['항목']; });
    function num(v) { return Number(String(v || '').replace(/[^\d.-]/g, '')) || 0; }
    function won(v) { return v.toLocaleString('ko-KR') + '원'; }
    var years = rows.map(function (r) { return String(r['연도']); }).filter(function (y, i, a) { return a.indexOf(y) === i; }).sort().reverse();
    if (!years.length) { el.innerHTML = '<div class="placeholder"><strong>요약 자료를 준비하고 있습니다.</strong></div>'; return; }
    function draw(y) {
      var yr = rows.filter(function (r) { return String(r['연도']) === y; });
      function group(kind) {
        var g = yr.filter(function (r) { return /수입/.test(r['구분']) === (kind === '수입'); });
        var total = g.reduce(function (s, r) { return s + num(r['금액']); }, 0);
        var max = g.reduce(function (m, r) { return Math.max(m, num(r['금액'])); }, 0) || 1;
        return '<div class="fs-group"><div class="fs-head"><h3>' + kind + '</h3><strong>' + won(total) + '</strong></div><ul class="fs-bars">' +
          g.map(function (r) {
            var v = num(r['금액']), pct = total ? Math.round(v / total * 1000) / 10 : 0;
            return '<li><span class="fs-label">' + esc(r['항목']) + '</span><span class="fs-track"><span class="fs-bar fs-' + (kind === '수입' ? 'in' : 'out') +
              '" style="width:' + Math.max(2, v / max * 100) + '%"></span></span><span class="fs-val">' + won(v) + ' <small>(' + pct + '%)</small></span></li>';
          }).join('') + '</ul></div>';
      }
      return '<p class="fs-year">' + esc(y) + '년 결산 기준</p><div class="fs-grid">' + group('수입') + group('지출') + '</div>';
    }
    var tabs = years.length > 1 ? '<div class="fs-years" role="group" aria-label="연도 선택">' + years.map(function (y, k) {
      return '<button type="button" class="chip' + (k === 0 ? ' is-on' : '') + '" data-y="' + esc(y) + '">' + esc(y) + '</button>'; }).join('') + '</div>' : '';
    el.innerHTML = tabs + '<div class="fs-body">' + draw(years[0]) + '</div>';
    $all('[data-y]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        $all('[data-y]', el).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        $('.fs-body', el).innerHTML = draw(b.getAttribute('data-y'));
      });
    });
  };

  R.receiptForm = function (el, data) {
    var link = safeUrl(data.info['영수증 신청 폼 링크']);
    var a = $('a', el);
    if (a) { if (link) a.href = link; else a.removeAttribute('href'); a.classList.toggle('is-disabled', !link); }
  };

  /* ---------- 빈칸·임시 사진 표시 ---------- */
  function markTodos(root) {
    if (!CFG.markTodo || !EDIT) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|TITLE)$/.test(p.nodeName) || p.closest('.todo')) return NodeFilter.FILTER_REJECT;
        TODO_RE.lastIndex = 0;
        return TODO_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var frag = document.createDocumentFragment(), s = n.nodeValue, last = 0, m;
      TODO_RE.lastIndex = 0;
      while ((m = TODO_RE.exec(s))) {
        if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
        var span = document.createElement('mark');
        span.className = 'todo';
        span.textContent = m[0];
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function todoBadge() {
    if (!CFG.markTodo || !EDIT) return;
    var codes = {};
    $all('mark.todo').forEach(function (m) { if (m.offsetParent !== null) codes[m.textContent] = 1; });
    $all('[data-todo]').forEach(function (m) { codes['사진 ' + m.getAttribute('data-todo')] = 1; });
    var n = Object.keys(codes).length;
    if (!n) return;
    var b = document.createElement('div');
    b.className = 'todo-badge';
    b.setAttribute('role', 'status');
    b.textContent = '이 페이지 자료 필요 ' + n + '곳';
    document.body.appendChild(b);
  }

  /* ---------- 그리기 ---------- */
  var DATA = null;
  function routeBoards() {
    document.body.removeAttribute('data-detail');
    $all('.detail-host').forEach(function (n) { n.classList.remove('detail-host'); });
    $all('[data-render="finance"], [data-render="noticeList"]').forEach(function (el) { R[el.getAttribute('data-render')](el, DATA); });
  }
  function renderAll(data, current) {
    DATA = data;
    renderHeader(data, current);
    renderFooter(data);
    pageGate(data);
    applyTexts(data);
    fillInfo(data);
    $all('[data-render]').forEach(function (el) {
      var fn = R[el.getAttribute('data-render')];
      if (fn) fn(el, data);
    });
    bindCopy();
    markTodos(document.body);
    todoBadge();
  }
  window.addEventListener('hashchange', function () {
    if (!DATA) return;
    var h = location.hash.slice(1);
    if (/^doc-/.test(h) || document.body.hasAttribute('data-detail') || h === 'list') {
      routeBoards();
      var t = /^doc-/.test(h) ? $('.post') : document.getElementById(h === 'list' ? 'main' : h);
      if (t) t.scrollIntoView();
    }
  });

  /* ---------- 관리자 미리보기 모드 (?edit=1, 관리 화면 안에서만) ---------- */
  var EDIT = /[?&]edit=1(&|$)/.test(location.search) && window.parent !== window;
  function startEdit(current) {
    document.documentElement.classList.add('pvn-edit');
    var snapshot = document.body.innerHTML, drawn = false;
    function post(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) {} }
    function draw(data) {
      var y = window.scrollY;
      if (drawn) document.body.innerHTML = snapshot;
      renderAll(data, current);
      drawn = true;
      document.documentElement.classList.add('is-ready');
      window.scrollTo(0, y);
    }
    window.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'pvn-data' && m.tabs) draw(fromTabs(m.tabs));
      else if (m.type === 'pvn-focus') {
        var sel = m.kind === 'img' ? '[data-img="' + m.key + '"]' : m.kind === 'info' ? '[data-info="' + m.key + '"],[data-tel="' + m.key + '"],[data-mail="' + m.key + '"]'
          : m.kind === 'sel' ? m.key
          : m.kind === 'render' ? '[data-render="' + m.key + '"]' : m.kind === 'feature' ? '[data-feature="' + m.key + '"]' : '[data-text="' + m.key + '"]';
        var n = null; try { n = $(sel); } catch (x) {}
        if (n) {
          n.scrollIntoView({ block: 'center', behavior: 'smooth' });
          n.classList.remove('pvn-flash'); void n.offsetWidth; n.classList.add('pvn-flash');
        }
      } else if (m.type === 'pvn-hash') {
        setHash(m.hash);
        setTimeout(function () { var t = /^#doc-/.test(m.hash) ? $('.post') : document.getElementById(m.hash.slice(1)); if (t) t.scrollIntoView(); }, 60);
      } else if (m.type === 'pvn-hero') {
        var h = $('[data-render="hero"]'); if (h && h.__go) h.__go(m.index);
      }
    });
    // 미리보기 안의 이동은 방문 기록에 남기지 않음 (관리 화면 뒤로가기가 꼬이지 않게)
    function setHash(h) {
      if (location.hash === h) { if (DATA) routeBoards(); return; }
      history.replaceState(null, '', location.pathname + location.search + h);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    // 링크는 이동하지 않고, 누른 곳을 관리 화면에 알려줌
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (a) { e.preventDefault(); var hr = a.getAttribute('href'); if (hr.charAt(0) === '#') setHash(hr); }
      var t = e.target.closest('[data-text],[data-img],[data-info],[data-tel],[data-mail],[data-render],[data-feature]');
      if (!t) return;
      post({ type: 'pvn-pick',
        text: t.getAttribute('data-text'), img: t.getAttribute('data-img'),
        info: t.getAttribute('data-info') || t.getAttribute('data-tel') || t.getAttribute('data-mail'),
        render: (t.closest('[data-render]') || {}).getAttribute ? t.closest('[data-render]').getAttribute('data-render') : null,
        feature: (t.closest('[data-feature]') || {}).getAttribute ? t.closest('[data-feature]').getAttribute('data-feature') : null });
    }, true);
    post({ type: 'pvn-ready', page: current });
    // 관리 화면이 응답하지 않으면 저장된 내용으로라도 보여줌
    setTimeout(function () { if (!drawn) loadData().then(function (d) { if (!drawn) draw(d); }); }, 2500);
  }

  /* ---------- 시작 ---------- */
  window.PVN = {
    init: function (current) {
      if (CFG.markTodo && EDIT) document.documentElement.classList.add('mark-todo');
      if (EDIT) return startEdit(current);
      loadData().then(function (data) {
        renderAll(data, current);
        if (location.hash) {
          var t = /^#doc-/.test(location.hash) ? $('.post') : document.getElementById(decodeURIComponent(location.hash.slice(1)));
          if (t) t.scrollIntoView();
        }
        document.documentElement.classList.add('is-ready');
      });
    }
  };
})();
