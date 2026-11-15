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
  function loadData() {
    var data = JSON.parse(JSON.stringify(DEF));
    if (!CFG.sheetId) return Promise.resolve(data);
    var keys = ['info', 'banners', 'works', 'regions', 'history', 'notices', 'finance'];
    return Promise.all(keys.map(function (k) {
      return fetchTab(CFG.tabs[k]).catch(function () { return null; }); // 실패한 탭은 기본 내용 유지
    })).then(function (res) {
      keys.forEach(function (k, i) {
        var rows = res[i];
        if (!rows) return;
        if (k === 'info') {
          rows.forEach(function (r) {
            var key = r['항목'], val = r['내용'] != null ? r['내용'] : r['값'];
            if (!key) return;
            if (key in data.features) data.features[key] = val;
            else data.info[key] = val;
          });
        } else data[k] = rows;
      });
      return data;
    });
  }

  /* ---------- 메뉴 ---------- */
  function menus(f) {
    var cms = isOn(f['CMS 정기후원 사용']);
    var donation = isOn(f['기부금 활용실적 공개']);
    var list = [
      { key: 'org', label: '기관', href: 'about.html', cols: [
        { title: '기관소개', href: 'about.html', links: [['피빌네는', 'about.html#about'], ['비전과 가치', 'about.html#values'], ['연혁', 'about.html#history']] },
        { title: '재정보고', href: 'finance.html', links: [['결산서류', 'finance.html#settlement'], donation ? ['기부금 모금액 및 활용실적', 'finance.html#donation'] : null] }
      ] },
      { key: 'work', label: '사업', href: 'business.html', cols: [
        { title: '주요 지원 사업', href: 'business.html', links: [['교육환경 개선', 'business.html#work-1'], ['장학 프로그램', 'business.html#work-2'], ['국제 연대 및 교류', 'business.html#work-3'], ['지구 환경·기후 위기 대응', 'business.html#work-4']] },
        { title: '활동 지역', href: 'region.html', links: [['라오스', 'region.html#region-1'], ['베트남', 'region.html#region-2'], ['동티모르', 'region.html#region-3'], ['태국 · 미얀마', 'region.html#region-4']] }
      ] },
      { key: 'support', label: '후원/참여', href: 'support.html', cols: [
        { title: '후원하기', href: 'support.html', links: [['계좌 후원', 'support.html#account'], cms ? ['CMS 정기후원', 'support.html#regular'] : null, ['기업·단체 후원', 'support.html#corp']] },
        { title: '기부금영수증', href: 'receipt.html', links: [['발급 안내', 'receipt.html']] }
      ] },
      { key: 'news', label: '소식', href: 'news.html', cols: [
        { title: '공지사항', href: 'news.html', links: [['피빌네 소식과 공지', 'news.html']] }
      ] }
    ];
    list.forEach(function (m) { m.cols.forEach(function (c) { c.links = (c.links || []).filter(Boolean); }); });
    return list;
  }

  function renderHeader(data, current) {
    var el = $('#site-header');
    if (!el) return;
    var ms = menus(data.features);
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
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
        '</button>' +
        '<nav id="main-nav" class="main-nav" aria-label="주 메뉴"><ul>' + nav + '</ul></nav>' +
        '<a class="btn btn-yellow head-cta" href="support.html">후원하기</a>' +
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
          '<li><a href="finance.html">재정보고</a></li>' +
          '<li><a href="support.html">후원하기</a></li>' +
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
    $all('[data-feature]').forEach(function (n) { n.hidden = !isOn(data.features[n.getAttribute('data-feature')]); });
    $all('[data-feature-off]').forEach(function (n) { n.hidden = isOn(data.features[n.getAttribute('data-feature-off')]); });
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
    el.className = el.getAttribute('data-style') === 'timeline' ? 'timeline' : 'history-cards';
    el.innerHTML = rows.map(function (h) {
      return '<li><span class="year">' + esc(h['연도']) + '</span>' + bulletList(h['내용']) + '</li>';
    }).join('');
  };

  function noticeRows(data) {
    return visible(data.notices).slice().sort(function (a, b) { return String(b['게시일']).localeCompare(String(a['게시일'])); });
  }
  R.noticesLatest = function (el, data) {
    var rows = noticeRows(data).slice(0, 3);
    var sec = el.closest('section');
    if (!rows.length) { if (sec) sec.hidden = true; return; }
    el.innerHTML = rows.map(function (n) {
      return '<li><a href="news.html#n-' + esc(n['게시일']) + '"><span class="n-title">' + esc(n['제목']) +
        '</span><time>' + esc(n['게시일']) + '</time></a></li>';
    }).join('');
  };
  R.noticeList = function (el, data) {
    var rows = noticeRows(data);
    if (!rows.length) { el.innerHTML = '<p class="empty">등록된 공지가 없습니다.</p>'; return; }
    el.innerHTML = rows.map(function (n) {
      var link = safeUrl(n['첨부링크']);
      return '<details class="notice" id="n-' + esc(n['게시일']) + '"><summary><span class="n-title">' + esc(n['제목']) +
        '</span><time>' + esc(n['게시일']) + '</time></summary><div class="notice-body"><p>' + nl2br(n['내용']) + '</p>' +
        (link ? '<a class="btn btn-line sm" href="' + esc(link) + '" target="_blank" rel="noopener">첨부파일 보기</a>' : '') +
        '</div></details>';
    }).join('');
    if (location.hash) { var d = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (d && d.tagName === 'DETAILS') d.open = true; }
  };

  // 재정보고 — 표시 방식은 자료를 받은 뒤 확정. 지금은 연도별 목록 기본형.
  R.finance = function (el, data) {
    var kind = el.getAttribute('data-kind'); // settlement | donation
    var rows = visible(data.finance).filter(function (r) {
      var isSettle = /결산/.test(r['구분'] || '');
      return kind === 'settlement' ? isSettle : !isSettle;
    });
    if (!rows.length) {
      el.innerHTML = '<div class="placeholder"><strong>공개 자료를 준비하고 있습니다.</strong>' +
        '<p>공개 예정: ' + esc(data.info['재정보고 공개 예정']) + '</p>' +
        '<p class="when">' + (kind === 'settlement' ? '[C1 결산서류 — 국세청 공시 양식]' : '[C2 기부금 모금액 및 활용실적 명세서]') + '</p></div>';
      return;
    }
    // 게시판형: 제목을 누르면 공고문과 첨부파일이 펼쳐짐 (공지사항과 같은 방식)
    rows.sort(function (a, b) { return String(b['게시일']).localeCompare(String(a['게시일'])); });
    el.innerHTML = '<div class="fin-board">' + rows.map(function (r, k) {
      var d = driveLinks(r['파일링크']);
      var name = r['파일명'] || (r['제목'] + '.pdf');
      return '<details class="notice"' + (k === 0 ? ' open' : '') + '><summary><span class="n-title"><span class="fin-kind">' + esc(r['연도']) + '년</span>' + esc(r['제목']) + '</span>' +
        '<time>' + esc(r['게시일']) + '</time></summary><div class="notice-body">' +
        (r['내용'] ? announce(r['내용']) : '') +
        (d.view ? '<div class="attach"><span class="attach-name">첨부 · ' + esc(name) + '</span><span class="fin-btns">' +
          '<a class="btn btn-line sm" href="' + esc(d.view) + '" target="_blank" rel="noopener">보기</a>' +
          '<a class="btn btn-line sm" href="' + esc(d.download) + '"' + (d.local ? ' download' : '') + '>내려받기</a></span></div>' : '') +
        '</div></details>';
    }).join('') + '</div>';
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
    if (!fromHash(false)) select(tabs[0]);
    window.addEventListener('hashchange', function () { fromHash(true); });
    var link = safeUrl(data.info['CMS 신청 링크']);
    var a = $('#regular-apply');
    if (a) { if (link) a.href = link; else a.removeAttribute('href'); a.classList.toggle('is-disabled', !link); }
  };

  R.receiptForm = function (el, data) {
    var link = safeUrl(data.info['영수증 신청 폼 링크']);
    var a = $('a', el);
    if (a) { if (link) a.href = link; else a.removeAttribute('href'); a.classList.toggle('is-disabled', !link); }
  };

  /* ---------- 빈칸·임시 사진 표시 ---------- */
  function markTodos(root) {
    if (!CFG.markTodo) return;
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
    if (!CFG.markTodo) return;
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

  /* ---------- 시작 ---------- */
  window.PVN = {
    init: function (current) {
      if (CFG.markTodo) document.documentElement.classList.add('mark-todo');
      loadData().then(function (data) {
        renderHeader(data, current);
        renderFooter(data);
        fillInfo(data);
        $all('[data-render]').forEach(function (el) {
          var fn = R[el.getAttribute('data-render')];
          if (fn) fn(el, data);
        });
        bindCopy();
        markTodos(document.body);
        todoBadge();
        if (location.hash) { var t = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (t) t.scrollIntoView(); }
        document.documentElement.classList.add('is-ready');
      });
    }
  };
})();
