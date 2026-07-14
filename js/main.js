/* ==========================================================================
   法人スマホLP - main.js
   送信先の変更はこの CONFIG だけ書き換えればOK
   ========================================================================== */
const CONFIG = {
  // 【送信先1】メール（FormSubmit経由。登録不要・無料）
  mailEndpoint: 'https://formsubmit.co/ajax/h_ito@beee-marketing.com',

  // 【送信先2】ChatWork通知（VPSの受付窓口。空ならメールのみ）
  chatworkEndpoint: '',

  // 送信完了後に飛ばすページ
  thanksUrl: './thanks.html'
};

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

/* ---------- IPから都道府県を推定して、初期値として入れておく ----------
   ※IP判定は特にスマホ回線でズレるため、あくまで「下書き」。
     お客様が選び直せるよう、自動入力したことを画面に明示する。         */
const PREFECTURE_BY_ROMAJI = {
  hokkaido: '北海道', aomori: '青森県', iwate: '岩手県', miyagi: '宮城県',
  akita: '秋田県', yamagata: '山形県', fukushima: '福島県', ibaraki: '茨城県',
  tochigi: '栃木県', gunma: '群馬県', saitama: '埼玉県', chiba: '千葉県',
  tokyo: '東京都', kanagawa: '神奈川県', niigata: '新潟県', toyama: '富山県',
  ishikawa: '石川県', fukui: '福井県', yamanashi: '山梨県', nagano: '長野県',
  gifu: '岐阜県', shizuoka: '静岡県', aichi: '愛知県', mie: '三重県',
  shiga: '滋賀県', kyoto: '京都府', osaka: '大阪府', hyogo: '兵庫県',
  nara: '奈良県', wakayama: '和歌山県', tottori: '鳥取県', shimane: '島根県',
  okayama: '岡山県', hiroshima: '広島県', yamaguchi: '山口県', tokushima: '徳島県',
  kagawa: '香川県', ehime: '愛媛県', kochi: '高知県', fukuoka: '福岡県',
  saga: '佐賀県', nagasaki: '長崎県', kumamoto: '熊本県', oita: '大分県',
  miyazaki: '宮崎県', kagoshima: '鹿児島県', okinawa: '沖縄県'
};

(function autofillPrefecture() {
  const select = document.getElementById('prefecture');
  if (!select) return;

  fetch('https://ipwho.is/')
    .then(function (res) { return res.json(); })
    .then(function (geo) {
      if (!geo || geo.success === false || geo.country_code !== 'JP') return;

      // "Kanagawa Prefecture" / "Tokyo" → かながわ / とうきょう のキーに揃える
      const key = String(geo.region || '')
        .toLowerCase()
        .replace(/\s*prefecture\s*/g, '')
        .replace(/[^a-z]/g, '');

      const pref = PREFECTURE_BY_ROMAJI[key];
      // すでにお客様が選んでいる場合は上書きしない
      if (!pref || select.value) return;

      select.value = pref;
    })
    .catch(function () {
      /* 判定できなくても、お客様が手で選べば済むので何もしない */
    });
})();

/* ---------- 会社形態が「個人」なら、会社名・屋号の欄を消す ---------- */
const companyType = document.getElementById('companyType');
const companyNameRow = document.getElementById('companyNameRow');
const companyNameInput = document.getElementById('companyName');

function refreshCompanyName() {
  if (!companyType || !companyNameRow) return;
  const isIndividual = companyType.value === '個人';

  companyNameRow.hidden = isIndividual;

  if (isIndividual) {
    // 隠すだけでなく、必須チェックと送信データからも外す
    companyNameInput.removeAttribute('required');
    companyNameInput.value = '';
    companyNameInput.classList.remove('error');
    const err = document.getElementById('err-companyName');
    if (err) { err.textContent = ''; err.classList.remove('show'); }
  } else {
    companyNameInput.setAttribute('required', '');
  }
}

if (companyType) {
  companyType.addEventListener('change', refreshCompanyName);
  refreshCompanyName();
}

/* ---------- 電話番号：ハイフンや全角数字で打たれても弾かず自動で整える ---------- */
const telInput = document.getElementById('tel');
if (telInput) {
  telInput.addEventListener('input', function () {
    const cleaned = telInput.value
      .replace(/[０-９]/g, function (c) {          // 全角数字 → 半角
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[^0-9]/g, '');                     // ハイフン・スペース等を除去
    if (telInput.value !== cleaned) telInput.value = cleaned;
  });
}

/* ---------- 入力チェック ---------- */
const submitBtn = document.getElementById('submitBtn');

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
    { id: 'contactName', message: 'お名前をご入力ください' },
    { id: 'tel', message: '電話番号をご入力ください' },
    { id: 'email', message: 'メールアドレスをご入力ください' },
    { id: 'prefecture', message: '都道府県を選択してください' }
  ];

  rules.forEach(function (rule) {
    const field = document.getElementById(rule.id);
    // 「個人」選択時に隠した欄は、必須チェックの対象外にする
    if (!field.hasAttribute('required')) return;
    if (!field.value.trim()) {
      showError(rule.id, rule.message);
      if (!firstBad) firstBad = field;
    }
  });

  const tel = document.getElementById('tel');
  if (tel.value.trim() && !/^[0-9]{10,11}$/.test(tel.value.trim())) {
    showError('tel', 'ハイフンなしの数字10〜11桁でご入力ください（例：09012345678）');
    if (!firstBad) firstBad = tel;
  }

  // 名前は、インサイドセールスが読めるようひらがなで入れてもらう
  // （カタカナで入力された場合も読めるので通す。漢字だけ弾く）
  const contactName = document.getElementById('contactName');
  const kanaOnly = /^[぀-ゟ゠-ヿー\s　]+$/;
  if (contactName.value.trim() && !kanaOnly.test(contactName.value.trim())) {
    showError('contactName', 'ひらがなでご入力ください（例：やまだ たろう）');
    if (!firstBad) firstBad = contactName;
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

/* 確認画面の制御 */
const confirmModal = document.getElementById('confirmModal');
const confirmList = document.getElementById('confirmList');
const confirmSendBtn = document.getElementById('confirmSendBtn');

function closeConfirm() {
  if (!confirmModal) return;
  confirmModal.hidden = true;
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close-confirm]').forEach(function (el) {
  el.addEventListener('click', closeConfirm);
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeConfirm();
});

// 入力内容を確認画面に並べる
function openConfirm(data) {
  const rows = [
    ['会社形態', data.company_type],
    ['会社名・屋号', data.company_name],
    ['おなまえ', data.name],
    ['電話番号', data.tel],
    ['都道府県', data.prefecture],
    ['メールアドレス', data.email],
    ['ご連絡希望時間', data.contact_time || '指定なし'],
    ['ご相談内容', data.message]
  ];

  confirmList.innerHTML = '';
  rows.forEach(function (row) {
    if (!row[1]) return; // 未入力の任意項目は出さない
    const dt = document.createElement('dt');
    dt.textContent = row[0];
    const dd = document.createElement('dd');
    dd.textContent = row[1];
    confirmList.appendChild(dt);
    confirmList.appendChild(dd);
  });

  confirmModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

/* 実際の送信処理 */
function sendLead(data) {
  confirmSendBtn.disabled = true;
  confirmSendBtn.textContent = '送信中…';
  submitBtn.disabled = true;

  // メール本文で読みやすいように、日本語の項目名に整える
  const mailBody = {
      _subject: '【LP】無料相談：' + (data.company_name || '') + ' 様',
      _template: 'table',
      会社形態: data.company_type || '',
      会社名・屋号: data.company_name || '',
      お名前: data.name || '',
      電話番号: data.tel || '',
      都道府県: data.prefecture || '',
      メールアドレス: data.email || '',
      連絡希望時間: data.contact_time || '指定なし',
      ご相談内容: data.message || '',
      流入元: [data.utm_source, data.utm_campaign, data.utm_content].filter(Boolean).join(' / ') || '直接',
      配信面: data.placement || ''
    };

    const sendMail = fetch(CONFIG.mailEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mailBody)
    }).then(function (res) {
      if (!res.ok) throw new Error('mail failed');
      return 'mail';
    });

    const sendChatwork = CONFIG.chatworkEndpoint
      ? fetch(CONFIG.chatworkEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (res) {
          if (!res.ok) throw new Error('chatwork failed');
          return 'chatwork';
        })
      : Promise.reject(new Error('chatwork未設定'));

    // どちらか1つでも成功すれば、お客様には「送信完了」を出す
    Promise.allSettled([sendMail, sendChatwork]).then(function (results) {
      const ok = results.some(function (r) { return r.status === 'fulfilled'; });
      if (ok) {
        window.location.href = CONFIG.thanksUrl;
      } else {
        closeConfirm();
        confirmSendBtn.disabled = false;
        confirmSendBtn.textContent = 'この内容で送信';
        submitBtn.disabled = false;
        submitBtn.textContent = '無料相談する';
        alert('送信に失敗しました。お手数ですが、時間をおいて再度お試しください。');
      }
    });
}

/* 送信ボタン → まず確認画面を出す */
if (leadForm) {
  leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return;

    // ボット対策1：見えない罠の欄が埋まっている＝自動投稿
    const honeypot = leadForm.querySelector('input[name="website"]');
    if (honeypot && honeypot.value !== '') {
      window.location.href = CONFIG.thanksUrl; // 送ったように見せて、実際は送らない
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

    openConfirm(data);

    // 「この内容で送信」を押したときに、この内容を送る
    confirmSendBtn.onclick = function () {
      sendLead(data);
    };
  });
}
