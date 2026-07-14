/* ==========================================================================
   法人携帯LP - main.js
   ここだけ書き換えれば、電話番号・送信先・営業時間を変更できます
   ========================================================================== */
const CONFIG = {
  // 表示用の電話番号
  telDisplay: '050-0000-0000',
  // 発信用（ハイフンなし）
  telRaw: '05000000000',
  // 電話受付時間（24時間表記・平日のみ）
  hours: { start: 9, end: 19 },
  // 送信先。空のままだと送信内容をコンソールに出すだけの「デモモード」
  // 例: 'https://example.com/api/lead' や Googleフォーム/Zapier等のWebhook URL
  endpoint: '',
  // 送信完了後に飛ばすページ
  thanksUrl: './thanks.html'
};

/* ---------- 電話番号を全箇所に反映 ---------- */
document.querySelectorAll('[data-tel-display]').forEach(function (el) {
  el.textContent = CONFIG.telDisplay;
});
document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
  a.setAttribute('href', 'tel:' + CONFIG.telRaw);
});

/* ---------- 営業時間内かどうか ---------- */
function isBusinessHours() {
  const now = new Date();
  const day = now.getDay();          // 0=日, 6=土
  const hour = now.getHours();
  if (day === 0 || day === 6) return false;
  return hour >= CONFIG.hours.start && hour < CONFIG.hours.end;
}

/* ---------- モーダル制御 ---------- */
const telModal = document.getElementById('telModal');
const afterHoursModal = document.getElementById('afterHoursModal');

function openModal(modal) {
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

// ヘッダーの電話ボタン：営業時間内→電話モーダル、時間外→フォーム誘導モーダル
const headerTelBtn = document.getElementById('headerTelBtn');
if (headerTelBtn) {
  headerTelBtn.addEventListener('click', function () {
    openModal(isBusinessHours() ? telModal : afterHoursModal);
  });
}

// FVの電話ボタン：時間外はタップしても発信させず、フォームへ誘導
const fvTelCta = document.getElementById('fvTelCta');
if (fvTelCta) {
  fvTelCta.addEventListener('click', function (e) {
    if (!isBusinessHours()) {
      e.preventDefault();
      openModal(afterHoursModal);
    }
  });
}

document.querySelectorAll('[data-close-tel]').forEach(function (el) {
  el.addEventListener('click', function () { closeModal(telModal); });
});
document.querySelectorAll('[data-close-afterhours]').forEach(function (el) {
  el.addEventListener('click', function () { closeModal(afterHoursModal); });
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeModal(telModal);
    closeModal(afterHoursModal);
  }
});

// 時間外モーダル内の「フォームで無料見積もり」→閉じてスクロール
const afterHoursFormBtn = document.getElementById('afterHoursFormBtn');
if (afterHoursFormBtn) {
  afterHoursFormBtn.addEventListener('click', function (e) {
    e.preventDefault();
    closeModal(afterHoursModal);
    scrollToForm();
  });
}

/* ---------- スムーススクロール ---------- */
function scrollToForm() {
  const target = document.getElementById('contact-form');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('.js-scroll').forEach(function (el) {
  el.addEventListener('click', function (e) {
    e.preventDefault();
    scrollToForm();
  });
});

/* ---------- 広告パラメータをフォームに自動格納 ---------- */
(function captureParams() {
  const params = new URLSearchParams(window.location.search);
  const keys = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'utm_id', 'placement', 'gclid', 'fbclid'
  ];
  keys.forEach(function (key) {
    const field = document.getElementById('trk-' + key);
    if (field) field.value = params.get(key) || '';
  });
  const lpPath = document.getElementById('trk-lp_path');
  if (lpPath) lpPath.value = window.location.pathname;
})();

/* ---------- 会社形態による書類確認の出し分け ---------- */
const companyType = document.getElementById('companyType');
const soleNotice = document.getElementById('soleNotice');
const corpNotice = document.getElementById('corpNotice');
const submitBtn = document.getElementById('submitBtn');

function currentNotice() {
  if (!companyType) return null;
  if (companyType.value === '個人事業主') return { box: soleNotice, name: 'doc_check_sole', key: 'sole' };
  if (companyType.value !== '') return { box: corpNotice, name: 'doc_check_corp', key: 'corp' };
  return null;
}

// 書類「いいえ」を選んだら送信をブロックする
function refreshSubmitState() {
  const notice = currentNotice();
  if (!notice) {
    submitBtn.disabled = false;
    return;
  }
  const checked = notice.box.querySelector('input[name="' + notice.name + '"]:checked');
  const deny = notice.box.querySelector('[data-deny-for="' + notice.key + '"]');
  const isNo = checked && checked.dataset.allowSubmit === 'false';
  if (deny) deny.hidden = !isNo;
  submitBtn.disabled = !!isNo;
}

if (companyType) {
  companyType.addEventListener('change', function () {
    const notice = currentNotice();

    // 会社形態を選び直したら、前の回答と警告をリセットする
    [soleNotice, corpNotice].forEach(function (box) {
      box.querySelectorAll('input[type="radio"]').forEach(function (radio) {
        radio.checked = false;
      });
      box.querySelectorAll('[data-deny-for]').forEach(function (deny) {
        deny.hidden = true;
      });
    });

    soleNotice.hidden = !(notice && notice.key === 'sole');
    corpNotice.hidden = !(notice && notice.key === 'corp');
    refreshSubmitState();

    // 追加質問が出たことに気づけるよう、その位置まで送る
    if (notice) {
      notice.box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

document.querySelectorAll('input[name="doc_check_sole"], input[name="doc_check_corp"]').forEach(function (radio) {
  radio.addEventListener('change', refreshSubmitState);
});

/* ---------- 入力チェック ---------- */
function showError(id, message) {
  const field = document.getElementById(id);
  const errorBox = document.getElementById('err-' + id);
  if (field) field.classList.add('error');
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.add('show');
  }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(function (el) {
    el.textContent = '';
    el.classList.remove('show');
  });
  document.querySelectorAll('.error').forEach(function (el) {
    el.classList.remove('error');
  });
}

function validate() {
  clearErrors();
  let firstBad = null;

  const rules = [
    { id: 'companyType', message: '会社形態を選択してください' },
    { id: 'companyName', message: '会社名・屋号をご入力ください' },
    { id: 'contactName', message: 'ご担当者名をご入力ください' },
    { id: 'tel', message: '電話番号をご入力ください' },
    { id: 'email', message: 'メールアドレスをご入力ください' }
  ];

  rules.forEach(function (rule) {
    const field = document.getElementById(rule.id);
    if (!field.value.trim()) {
      showError(rule.id, rule.message);
      if (!firstBad) firstBad = field;
    }
  });

  const tel = document.getElementById('tel');
  if (tel.value.trim() && !/^[0-9-]{10,14}$/.test(tel.value.trim())) {
    showError('tel', '電話番号は数字とハイフンでご入力ください');
    if (!firstBad) firstBad = tel;
  }

  const email = document.getElementById('email');
  if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    showError('email', 'メールアドレスの形式が正しくありません');
    if (!firstBad) firstBad = email;
  }

  if (firstBad) {
    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstBad.focus({ preventScroll: true });
    return false;
  }
  return true;
}

/* ---------- 送信 ---------- */
const leadForm = document.getElementById('leadForm');
const pageOpenedAt = Date.now();

if (leadForm) {
  leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    // ボット対策1：見えない罠の欄が埋まっている＝自動投稿
    const honeypot = leadForm.querySelector('input[name="website"]');
    if (honeypot && honeypot.value !== '') {
      window.location.href = CONFIG.thanksUrl; // 送信したように見せて、実際は送らない
      return;
    }

    // ボット対策2：開いて3秒未満での送信は人間の入力速度ではない
    if (Date.now() - pageOpenedAt < 3000) {
      window.location.href = CONFIG.thanksUrl;
      return;
    }

    if (!validate()) return;

    const data = Object.fromEntries(new FormData(leadForm).entries());
    delete data.website; // 罠の欄は送信データに含めない

    if (!CONFIG.endpoint) {
      // デモモード：送信先が未設定なので中身をコンソールに出すだけ
      console.log('[デモ送信] 送信先が未設定です。CONFIG.endpoint を設定してください。', data);
      window.location.href = CONFIG.thanksUrl;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '送信中…';

    fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('送信に失敗しました');
        window.location.href = CONFIG.thanksUrl;
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'この内容で送信する';
        alert('送信に失敗しました。時間をおいて再度お試しください。');
      });
  });
}
