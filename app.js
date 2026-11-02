(function () {
const CATS = ["İş", "Müşteri", "Sağlık", "Resmi", "Kişisel", "Diğer"];
const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const MSHORT = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const DAYS = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const DSHORT = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const FIELDS = "id,title,date,time,who,phone,place,cat,remind,status,note,created_by_email,updated_by_email,created_at,updated_at";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayStr = () => ymd(new Date());
const dayDiff = s => Math.round((parse(s) - parse(todayStr())) / 864e5);
const shortName = email => !email ? "—" : email.includes("@") ? email.split("@")[0] : email;

const cfg = window.RANDEVU_CONFIG || {};
let sb = null, me = null, channel = null;
let items = [];
const state = { q: "", status: "aktif", cat: "", by: "", day: "", quick: "", calY: new Date().getFullYear(), calM: new Date().getMonth() };
let editingId = null;

/* ---------- görünümler ---------- */
function show(view) {
  $("setupView").hidden = view !== "setup";
  $("authView").hidden = view !== "auth";
  $("appView").hidden = view !== "app";
}
function authPane(name) {
  $("loginForm").hidden = name !== "login";
  $("forgotForm").hidden = name !== "forgot";
  $("setPassForm").hidden = name !== "setpass";
}
function errOut(id, msg) { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; }

const AUTH_ERR = {
  "Invalid login credentials": "E-posta veya şifre hatalı.",
  "Email not confirmed": "E-posta adresiniz henüz onaylanmamış. Gelen kutunuzdaki bağlantıya tıklayın.",
  "New password should be different from the old password.": "Yeni şifre eskisinden farklı olmalı.",
};
const authMsg = e => AUTH_ERR[e?.message] || (e?.status === 429 ? "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin." : "İşlem tamamlanamadı: " + (e?.message || "bağlantı hatası"));

/* ---------- başlangıç ---------- */
async function boot() {
  const d = new Date();
  $("todayLabel").textContent = DAYS[d.getDay()] + " · " + d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  $("authDate").textContent = d.getDate() + " " + MSHORT[d.getMonth()] + " " + d.getFullYear();

  if (!cfg.SUPABASE_URL || /PROJE-KODUNUZ/.test(cfg.SUPABASE_URL) || !cfg.SUPABASE_ANON_KEY || /BURAYA/.test(cfg.SUPABASE_ANON_KEY) || !window.supabase) {
    show("setup"); return;
  }
  // Davet ve şifre yenileme bağlantıları adres çubuğunda "type=invite" / "type=recovery" taşır
  const linkType = (new URLSearchParams(location.hash.slice(1)).get("type")) || (new URLSearchParams(location.search).get("type"));
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });

  let needPassword = linkType === "invite" || linkType === "recovery";
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") needPassword = true;
    setTimeout(() => route(session, needPassword), 0);
  });
  const { data } = await sb.auth.getSession();
  route(data.session, needPassword);
}

let routedUser = undefined, routedNeedPw = undefined;
function route(session, needPassword) {
  const uid = session?.user?.id || null;
  if (uid === routedUser && needPassword === routedNeedPw) return;
  routedUser = uid; routedNeedPw = needPassword;
  if (session && needPassword) {
    $("setPassLead").textContent = "Hoş geldiniz, " + session.user.email + ". Devam etmek için bir şifre belirleyin.";
    show("auth"); authPane("setpass"); setTimeout(() => $("n_pass").focus(), 30);
    return;
  }
  if (!session) { stopLive(); me = null; items = []; show("auth"); authPane("login"); return; }
  me = session.user;
  $("meEmail").textContent = me.email;
  show("app");
  render();
  load();
  startLive();
}

/* ---------- giriş işlemleri ---------- */
$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); errOut("loginErr");
  const email = $("l_email").value.trim(), password = $("l_pass").value;
  if (!email || !password) { errOut("loginErr", "E-posta ve şifre gerekli."); return; }
  $("loginBtn").disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  $("loginBtn").disabled = false;
  if (error) errOut("loginErr", authMsg(error)); else $("l_pass").value = "";
});
$("forgotBtn").onclick = () => { $("r_email").value = $("l_email").value; errOut("forgotErr"); $("forgotOk").hidden = true; authPane("forgot"); };
$("backToLogin").onclick = () => authPane("login");
$("forgotForm").addEventListener("submit", async e => {
  e.preventDefault(); errOut("forgotErr"); $("forgotOk").hidden = true;
  const email = $("r_email").value.trim(); if (!email) { errOut("forgotErr", "E-posta adresinizi yazın."); return; }
  $("forgotSend").disabled = true;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $("forgotSend").disabled = false;
  if (error) errOut("forgotErr", authMsg(error));
  else { $("forgotOk").textContent = "Bu adres kayıtlıysa yenileme bağlantısı gönderildi. Gelen kutunuzu kontrol edin."; $("forgotOk").hidden = false; }
});
$("setPassForm").addEventListener("submit", async e => {
  e.preventDefault(); errOut("setPassErr");
  const a = $("n_pass").value, b = $("n_pass2").value;
  if (a.length < 8) { errOut("setPassErr", "Şifre en az 8 karakter olmalı."); return; }
  if (a !== b) { errOut("setPassErr", "İki şifre aynı değil."); return; }
  $("setPassBtn").disabled = true;
  const { error } = await sb.auth.updateUser({ password: a });
  $("setPassBtn").disabled = false;
  if (error) { errOut("setPassErr", authMsg(error)); return; }
  history.replaceState(null, "", location.pathname);
  const { data } = await sb.auth.getSession();
  route(data.session, false);
  toast("Şifreniz kaydedildi");
});
$("logoutBtn").onclick = async () => { await sb.auth.signOut(); };

/* ---------- veri ---------- */
function setLine(text, live) { $("storeLine").textContent = text; $("liveDot").classList.toggle("live", !!live); }

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  const { data, error } = await sb.from("randevular").select(FIELDS).order("date").order("time", { nullsFirst: false });
  if (seq !== loadSeq) return;
  if (error) {
    if (error.code === "PGRST301" || /JWT/i.test(error.message)) { await sb.auth.signOut(); return; }
    setLine("Randevular alınamadı. Bağlantınızı kontrol edip sayfayı yenileyin.", false);
    return;
  }
  items = data.map(r => ({ ...r, time: r.time || "", who: r.who || "", phone: r.phone || "", place: r.place || "", note: r.note || "" }));
  render();
}
function startLive() {
  stopLive();
  channel = sb.channel("randevular-canli")
    .on("postgres_changes", { event: "*", schema: "public", table: "randevular" }, () => { clearTimeout(startLive.t); startLive.t = setTimeout(load, 250); })
    .subscribe(status => {
      if (status === "SUBSCRIBED") setLine("Canlı · ekipteki değişiklikler anında görünür", true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setLine("Canlı bağlantı kurulamadı; değişiklikleri görmek için sayfayı yenileyin.", false);
    });
}
function stopLive() { if (channel) { sb.removeChannel(channel); channel = null; } }
document.addEventListener("visibilitychange", () => { if (!document.hidden && me) load(); });

async function save(it) {
  const row = { title: it.title, date: it.date, time: it.time || null, who: it.who || null, phone: it.phone || null, place: it.place || null,
    cat: it.cat, remind: it.remind, status: it.status, note: it.note || null };
  const q = it.id ? sb.from("randevular").update(row).eq("id", it.id) : sb.from("randevular").insert(row);
  const { error } = await q;
  if (error) throw error;
  await load();
}
async function remove(id) {
  const { error } = await sb.from("randevular").delete().eq("id", id);
  if (error) throw error;
  await load();
}

/* ---------- yardımcılar ---------- */
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 5 5 9-10"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'
};
function telLinks(phone) {
  return phone.split(/\s*[\/,;]\s*/).filter(Boolean).map(p => `<a href="tel:${esc(p.replace(/[^\d+]/g, ""))}">${esc(p)}</a>`).join(" / ");
}
function countLabel(it) {
  if (it.status === "tamam") return { t: "Tamamlandı", c: "ok" };
  if (it.status === "iptal") return { t: "İptal", c: "late" };
  const n = dayDiff(it.date);
  if (n < 0) return { t: Math.abs(n) + " gün geçti", c: "late" };
  if (n === 0) return { t: "Bugün", c: "soon" };
  if (n === 1) return { t: "Yarın", c: "soon" };
  if (n <= 7) return { t: n + " gün kaldı", c: "soon" };
  return { t: n + " gün kaldı", c: "" };
}
const isLate = it => it.status === "bekliyor" && dayDiff(it.date) < 0;
const sortKey = it => it.date + " " + (it.time || "99:99");

function matches(it) {
  if (state.status === "aktif" && it.status !== "bekliyor") return false;
  if (state.status === "tamam" && it.status !== "tamam") return false;
  if (state.status === "iptal" && it.status !== "iptal") return false;
  if (state.cat && it.cat !== state.cat) return false;
  if (state.by && (it.created_by_email || "") !== state.by) return false;
  if (state.day && it.date !== state.day) return false;
  if (state.quick) {
    const n = dayDiff(it.date);
    if (state.quick === "today" && n !== 0) return false;
    if (state.quick === "week" && !(n >= 0 && n <= 7)) return false;
    if (state.quick === "late" && !isLate(it)) return false;
  }
  if (state.q) {
    const hay = [it.title, it.who, it.place, it.note, it.phone, it.cat, it.created_by_email].join(" ").toLocaleLowerCase("tr");
    if (!hay.includes(state.q.toLocaleLowerCase("tr"))) return false;
  }
  return true;
}

/* ---------- çizim ---------- */
function render() { renderStats(); renderCal(); renderChips(); renderList(); }

function renderStats() {
  const act = items.filter(i => i.status === "bekliyor");
  const s = [
    { k: "today", n: act.filter(i => dayDiff(i.date) === 0).length, l: "Bugün" },
    { k: "week", n: act.filter(i => { const d = dayDiff(i.date); return d >= 0 && d <= 7; }).length, l: "7 gün içinde" },
    { k: "", n: act.filter(i => dayDiff(i.date) >= 0).length, l: "Yaklaşan toplam" },
    { k: "late", n: act.filter(i => dayDiff(i.date) < 0).length, l: "Geciken / kapatılmamış", cls: "late" }
  ];
  $("stats").innerHTML = s.map(x => `<button type="button" class="stat ${x.cls || ""}" data-q="${x.k}" aria-pressed="${state.quick === x.k && (x.k !== "" || state.status === "aktif") && !state.day ? "true" : "false"}"><b>${x.n}</b><span>${x.l}</span></button>`).join("");
  $("stats").querySelectorAll(".stat").forEach(b => b.onclick = () => { state.quick = b.dataset.q; state.day = ""; state.status = "aktif"; render(); });
}

function renderCal() {
  const y = state.calY, m = state.calM;
  $("calTitle").textContent = MONTHS[m] + " " + y;
  const first = new Date(y, m, 1); const offset = (first.getDay() + 6) % 7; // Pazartesi başlangıç
  const start = new Date(y, m, 1 - offset);
  const marked = new Set(items.filter(i => i.status === "bekliyor").map(i => i.date));
  const t = todayStr();
  let h = ["Pt","Sa","Ça","Pe","Cu","Ct","Pz"].map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); const s = ymd(d);
    const cls = [d.getMonth() !== m ? "out" : "", s === t ? "today" : "", s === state.day ? "sel" : ""].join(" ");
    h += `<button type="button" class="${cls}" data-d="${s}" aria-label="${d.getDate()} ${MONTHS[d.getMonth()]}${marked.has(s) ? ", randevu var" : ""}">${d.getDate()}${marked.has(s) ? "<i></i>" : ""}</button>`;
  }
  $("cal").innerHTML = h;
  $("cal").querySelectorAll("button[data-d]").forEach(b => b.onclick = () => {
    state.day = state.day === b.dataset.d ? "" : b.dataset.d; state.quick = ""; if (state.day) state.status = "hepsi"; render();
  });
  $("clearDay").hidden = !state.day;
}

function renderChips() {
  const st = [["aktif","Bekleyen"],["tamam","Tamamlanan"],["iptal","İptal"],["hepsi","Hepsi"]];
  $("statusChips").innerHTML = st.map(([k, l]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${state.status === k}">${l}</button>`).join("");
  $("statusChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { state.status = b.dataset.k; state.quick = ""; render(); });
  $("catChips").innerHTML = [["", "Tümü"], ...CATS.map(c => [c, c])].map(([k, l]) => `<button type="button" class="chip" data-k="${esc(k)}" aria-pressed="${state.cat === k}">${esc(l)}</button>`).join("");
  $("catChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { state.cat = b.dataset.k; render(); });
  const people = [...new Set(items.map(i => i.created_by_email).filter(Boolean))].sort();
  $("byChips").innerHTML = [["", "Herkes"], ...people.map(p => [p, p === me?.email ? "Ben" : shortName(p)])]
    .map(([k, l]) => `<button type="button" class="chip" data-k="${esc(k)}" aria-pressed="${state.by === k}" title="${esc(k)}">${esc(l)}</button>`).join("");
  $("byChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { state.by = b.dataset.k; render(); });
}

function groupOf(it) {
  if (it.status !== "bekliyor") return dayDiff(it.date) < 0 ? "z-past" : "y-closed";
  const n = dayDiff(it.date); const td = parse(todayStr()); const d = parse(it.date);
  if (n < 0) return "a-late";
  if (n === 0) return "b-today";
  if (n === 1) return "c-tom";
  if (n <= 7) return "d-week";
  if (d.getFullYear() === td.getFullYear() && d.getMonth() === td.getMonth()) return "e-month";
  return "f-" + d.getFullYear() + "-" + pad(d.getMonth() + 1);
}
function groupName(g) {
  return { "a-late": "Geciken", "b-today": "Bugün", "c-tom": "Yarın", "d-week": "Bu hafta", "e-month": "Bu ay", "y-closed": "Kapatılanlar", "z-past": "Geçmiş" }[g]
    || (() => { const [, y, m] = g.split("-"); return MONTHS[+m - 1] + " " + y; })();
}

function card(it) {
  const d = parse(it.date); const c = countLabel(it); const late = isLate(it);
  const meta = [
    it.time ? `<span class="t">${ICON.clock}${esc(it.time)}</span>` : "",
    it.who ? `<span>${ICON.user}${esc(it.who)}</span>` : "",
    it.place ? `<span>${ICON.pin}${esc(it.place)}</span>` : "",
    it.phone ? `<span>${ICON.phone}${telLinks(it.phone)}</span>` : ""
  ].join("");
  const by = it.created_by_email === me?.email ? "sen" : shortName(it.created_by_email);
  return `<article class="appt ${it.status !== "bekliyor" ? "done" : ""} ${late ? "late" : ""}">
    <div class="leaf" aria-hidden="true"><div class="m">${MSHORT[d.getMonth()]}</div><div class="d">${d.getDate()}</div><div class="w">${DSHORT[d.getDay()]}</div></div>
    <div class="body">
      <h3 class="ttl">${esc(it.title)}</h3>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${it.note ? `<p class="note">${esc(it.note)}</p>` : ""}
      <div class="tags"><span class="pill count ${c.c}">${c.t}</span>${it.cat ? `<span class="pill">${esc(it.cat)}</span>` : ""}<span class="pill">${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}</span></div>
      <span class="by">Ekleyen: ${esc(by)}</span>
    </div>
    <div class="row-act">
      <button type="button" class="icon-btn check" data-act="done" data-id="${esc(it.id)}" aria-pressed="${it.status === "tamam"}" title="${it.status === "tamam" ? "Bekliyor olarak işaretle" : "Tamamlandı olarak işaretle"}" aria-label="Tamamlandı">${ICON.check}</button>
      <button type="button" class="icon-btn" data-act="edit" data-id="${esc(it.id)}" title="Düzenle" aria-label="Düzenle">${ICON.edit}</button>
      <button type="button" class="icon-btn" data-act="ics" data-id="${esc(it.id)}" title="Takvime aktar (.ics)" aria-label="Takvime aktar">${ICON.dl}</button>
    </div>
  </article>`;
}

function renderList() {
  const list = $("list");
  const notes = [];
  if (state.day) { const d = parse(state.day); notes.push(`${d.getDate()} ${MONTHS[d.getMonth()]} ${DAYS[d.getDay()]} günü`); }
  if (state.quick) notes.push({ today: "Bugün", week: "7 gün içinde", late: "Geciken" }[state.quick]);
  if (state.cat) notes.push(esc(state.cat));
  if (state.by) notes.push("Ekleyen: " + esc(state.by === me?.email ? "ben" : shortName(state.by)));
  if (state.q) notes.push(`“${esc(state.q)}” araması`);
  const fn = $("filterNote");
  if (notes.length) {
    fn.hidden = false;
    fn.innerHTML = `Gösterilen: ${notes.join(" · ")} <button class="linkbtn" type="button" id="resetF">Filtreleri temizle</button>`;
    $("resetF").onclick = () => { Object.assign(state, { q: "", status: "aktif", cat: "", by: "", day: "", quick: "" }); $("q").value = ""; render(); };
  } else fn.hidden = true;

  if (!items.length) {
    list.innerHTML = `<div class="empty"><h2>Henüz randevu yok</h2><p>İlk randevuyu ekleyin: tarih, saat, kişi ve not girin. Liste kaç gün kaldığını sayar, tarihi geçip kapatılmayanları “Geciken” olarak öne çıkarır.</p>
      <button class="btn primary" type="button" id="emptyAdd">Yeni randevu</button></div>`;
    $("emptyAdd").onclick = () => openForm();
    return;
  }
  const shown = items.filter(matches).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
  if (!shown.length) {
    list.innerHTML = `<div class="empty"><h2>Bu filtreye uyan randevu yok</h2><p>Filtreyi değiştirin ya da bu tarih için yeni randevu ekleyin.</p><button class="btn primary" type="button" id="emptyAdd">Yeni randevu</button></div>`;
    $("emptyAdd").onclick = () => openForm(state.day || "");
    return;
  }
  const groups = {};
  shown.forEach(it => { const g = groupOf(it); (groups[g] = groups[g] || []).push(it); });
  const keys = Object.keys(groups).sort();
  list.innerHTML = keys.map(k => {
    const arr = k === "z-past" ? groups[k].slice().reverse() : groups[k];
    return `<section class="group ${k === "a-late" ? "late" : ""}"><div class="group-h"><h2>${groupName(k)}</h2><small>${arr.length} randevu</small></div>${arr.map(card).join("")}</section>`;
  }).join("");
  list.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
    const it = items.find(x => x.id === b.dataset.id); if (!it) return;
    if (b.dataset.act === "edit") openForm(null, it);
    else if (b.dataset.act === "done") toggleDone(it);
    else if (b.dataset.act === "ics") exportIcs([it], slug(it.title + " " + it.who) + ".ics");
  });
}

/* ---------- işlemler ---------- */
function writeMsg(e) {
  if (e?.code === "42501" || /row-level security/i.test(e?.message || "")) return "Bu işlem için yetkiniz yok. Yeniden giriş yapmayı deneyin.";
  return "Kaydedilemedi, bağlantınızı kontrol edip tekrar deneyin.";
}
async function safe(fn, okMsg) { try { await fn(); if (okMsg) toast(okMsg); return true; } catch (e) { toast(writeMsg(e)); return false; } }
function toggleDone(it) {
  const n = { ...it, status: it.status === "tamam" ? "bekliyor" : "tamam" };
  safe(() => save(n), n.status === "tamam" ? "Tamamlandı olarak işaretlendi" : "Tekrar bekleyenlere alındı");
}

/* ---------- form ---------- */
$("f_cat").innerHTML = CATS.map(c => `<option>${c}</option>`).join("");
let delArmed = false;
function openForm(date, it) {
  editingId = it ? it.id : null; delArmed = false;
  $("formTitle").textContent = it ? "Randevuyu düzenle" : "Yeni randevu";
  $("f_title").value = it?.title || ""; $("f_date").value = it?.date || date || todayStr(); $("f_time").value = it?.time || "";
  $("f_who").value = it?.who || ""; $("f_phone").value = it?.phone || ""; $("f_place").value = it?.place || "";
  $("f_cat").value = it?.cat || "Müşteri"; $("f_remind").value = String(it?.remind ?? 1440); $("f_status").value = it?.status || "bekliyor";
  $("f_note").value = it?.note || ""; errOut("formErr");
  if (it) {
    const fmt = s => s ? new Date(s).toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    $("formAudit").textContent = `Ekleyen: ${it.created_by_email || "—"} · ${fmt(it.created_at)}` +
      (it.updated_at && it.updated_at !== it.created_at ? ` — Son değişiklik: ${it.updated_by_email || "—"} · ${fmt(it.updated_at)}` : "");
    $("formAudit").hidden = false;
  } else $("formAudit").hidden = true;
  $("delBtn").hidden = !it; $("delBtn").textContent = "Sil";
  $("overlay").hidden = false; setTimeout(() => $("f_title").focus(), 30);
}
function closeForm() { $("overlay").hidden = true; editingId = null; }
$("addBtn").onclick = () => openForm(state.day || "");
$("cancelBtn").onclick = closeForm;
$("overlay").addEventListener("mousedown", e => { if (e.target === $("overlay")) closeForm(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("overlay").hidden) closeForm(); });
$("form").addEventListener("submit", async e => {
  e.preventDefault();
  const title = $("f_title").value.trim(), date = $("f_date").value;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errOut("formErr", "Konu ve tarih gerekli."); return; }
  const it = { id: editingId, title, date, time: $("f_time").value, who: $("f_who").value.trim(), phone: $("f_phone").value.trim(),
    place: $("f_place").value.trim(), cat: $("f_cat").value, remind: +$("f_remind").value, status: $("f_status").value, note: $("f_note").value.trim() };
  $("saveBtn").disabled = true;
  try { await save(it); }
  catch (err) { errOut("formErr", writeMsg(err)); $("saveBtn").disabled = false; return; }
  $("saveBtn").disabled = false;
  const wasEdit = !!editingId; closeForm();
  const d = parse(date); state.calY = d.getFullYear(); state.calM = d.getMonth(); renderCal();
  toast(wasEdit ? "Randevu güncellendi" : "Randevu eklendi");
});
$("delBtn").onclick = () => {
  if (!delArmed) { delArmed = true; $("delBtn").textContent = "Silmeyi onayla"; return; }
  const id = editingId; closeForm(); safe(() => remove(id), "Randevu silindi");
};

/* ---------- takvim dosyası (.ics) ---------- */
function slug(s) { return (s || "randevu").toLocaleLowerCase("tr").replace(/[çğıöşü]/g, c => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" }[c])).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "randevu"; }
const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function icsFor(list) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Randevu Defteri//TR", "CALSCALE:GREGORIAN"];
  list.forEach(it => {
    const d = it.date.replace(/-/g, "");
    L.push("BEGIN:VEVENT", "UID:" + it.id + "@randevu-defteri", "DTSTAMP:" + stamp);
    if (it.time) {
      const [h, m] = it.time.split(":").map(Number); const start = parse(it.date); start.setHours(h, m);
      const end = new Date(start.getTime() + 36e5);
      L.push("DTSTART:" + d + "T" + pad(h) + pad(m) + "00", "DTEND:" + ymd(end).replace(/-/g, "") + "T" + pad(end.getHours()) + pad(end.getMinutes()) + "00");
    } else {
      const p = parse(it.date); const nx = ymd(new Date(p.getFullYear(), p.getMonth(), p.getDate() + 1)).replace(/-/g, "");
      L.push("DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + nx);
    }
    L.push("SUMMARY:" + icsEsc(it.title + (it.who ? " – " + it.who : "")));
    if (it.place) L.push("LOCATION:" + icsEsc(it.place));
    const desc = [it.note, it.phone ? "Tel: " + it.phone : "", it.cat ? "Tür: " + it.cat : ""].filter(Boolean).join("\n");
    if (desc) L.push("DESCRIPTION:" + icsEsc(desc));
    if (it.remind > 0) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(it.title), "TRIGGER:-PT" + it.remind + "M", "END:VALARM");
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR"); return L.join("\r\n");
}
function exportIcs(list, name) {
  if (!list.length) { toast("Aktarılacak bekleyen randevu yok"); return; }
  const url = URL.createObjectURL(new Blob([icsFor(list)], { type: "text/calendar" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$("icsAll").onclick = () => exportIcs(items.filter(i => i.status === "bekliyor" && dayDiff(i.date) >= 0).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1), "randevular.ics");

/* ---------- diğer ---------- */
let tt; function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
$("q").addEventListener("input", e => { state.q = e.target.value.trim(); renderList(); });
$("prevM").onclick = () => { state.calM--; if (state.calM < 0) { state.calM = 11; state.calY--; } renderCal(); };
$("nextM").onclick = () => { state.calM++; if (state.calM > 11) { state.calM = 0; state.calY++; } renderCal(); };
$("goToday").onclick = () => { const d = new Date(); state.calY = d.getFullYear(); state.calM = d.getMonth(); state.day = ""; render(); };
$("clearDay").onclick = () => { state.day = ""; state.status = "aktif"; render(); };
// gün değişince sayaçlar güncellensin
let lastDay = todayStr(); setInterval(() => { if (me && todayStr() !== lastDay) { lastDay = todayStr(); render(); } }, 60000);

boot();
})();
