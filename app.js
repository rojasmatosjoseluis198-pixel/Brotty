// ===== Brotty — lógica de la app =====
"use strict";
const CLAVE = "brotty-v1";

// ---------- Utilidades ----------
const $ = (s) => document.querySelector(s);
const fechaISO = (d) => d.toLocaleDateString("en-CA");
const hoyISO = () => fechaISO(new Date());
const parse = (f) => { const [y, m, d] = f.split("-").map(Number); return new Date(y, m - 1, d); };
const addDias = (f, n) => { const d = parse(f); d.setDate(d.getDate() + n); return fechaISO(d); };
const difDias = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const addMeses = (f, n) => {
  const d = parse(f), dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return fechaISO(d);
};
const r2 = (n) => Math.round(n * 100) / 100;
const soles = (n) => "S/ " + r2(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const suma = (arr, f = (x) => x) => r2(arr.reduce((s, x) => s + f(x), 0));
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const horaAhora = () => new Date().toTimeString().slice(0, 5);
const fechaBonita = (f, opt = { weekday: "long", day: "numeric", month: "long" }) => parse(f).toLocaleDateString("es-PE", opt);
const fechaCorta = (f) => parse(f).toLocaleDateString("es-PE", { day: "numeric", month: "short" });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Categorías ----------
const CATS = {
  ingredientes: { e: "🥕", n: "Ingredientes", antojo: false },
  fuera: { e: "🍜", n: "Comida fuera", antojo: false },
  snacks: { e: "🍪", n: "Snacks", antojo: true },
  univ: { e: "📚", n: "Universidad", antojo: false },
  transporte: { e: "🚌", n: "Transporte", antojo: false },
  salidas: { e: "🎉", n: "Salidas", antojo: true },
  invitar: { e: "🎁", n: "Invitar", antojo: true },
  cuidado: { e: "🧴", n: "Cuidado personal", antojo: false },
  otros: { e: "📦", n: "Otros", antojo: false },
  pagos: { e: "🏠", n: "Pagos", antojo: false, oculta: true },
  subvencion: { e: "🎓", n: "Subvención", ingreso: true },
  papas: { e: "👪", n: "Ayuda de mis papás", ingreso: true },
  otros_i: { e: "💰", n: "Otros ingresos", ingreso: true },
  ajuste: { e: "⚖️", n: "Ajuste de saldo", oculta: true }
};
const CATS_GASTO = ["ingredientes", "fuera", "snacks", "univ", "transporte", "salidas", "invitar", "cuidado", "otros"];
const CATS_INGRESO = ["subvencion", "papas", "otros_i"];
const LUGARES = { mercado: "🧺 Mercado", bodega: "🏪 Bodega", univ: "🏫 Universidad", otro: "📍 Otro" };
const DIAS_CORTOS = ["D", "L", "M", "M", "J", "V", "S"];

// ---------- Estado ----------
function estadoNuevo() {
  return {
    v: 1,
    config: {
      setup: false, saldoInicial: 0, fechaInicio: hoyISO(), montoSub: 0, proxSub: "",
      modo: "ciclo", dias: [1, 2, 3, 6], finCiclo: "", pasaje: 0, menuDia: 2, menu: 0,
      comidaSem: 0, comidaSemVac: 0, cumple: "", respaldoPendiente: false, ultimoRespaldo: null
    },
    movs: [], pagos: [], prestamos: [], metas: []
  };
}
let E = cargar();
function cargar() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE));
    if (d && d.config && Array.isArray(d.movs)) return Object.assign(estadoNuevo(), d, { config: Object.assign(estadoNuevo().config, d.config) });
  } catch (e) {}
  return estadoNuevo();
}
function guardar() { localStorage.setItem(CLAVE, JSON.stringify(E)); render(); }

// ---------- Cálculo principal ----------
function costoClase(f) {
  const c = E.config;
  if (c.modo !== "ciclo") return { pasaje: 0, menu: 0 };
  if (c.finCiclo && f > c.finCiclo) return { pasaje: 0, menu: 0 };
  const wd = parse(f).getDay();
  if (!c.dias.includes(wd)) return { pasaje: 0, menu: 0 };
  return { pasaje: +c.pasaje || 0, menu: wd === +c.menuDia ? (+c.menu || 0) : 0 };
}
function inicioPeriodo(T) {
  const subs = E.movs.filter((m) => m.cat === "subvencion" && m.fecha <= T).map((m) => m.fecha).sort();
  return subs.length ? subs[subs.length - 1] : E.config.fechaInicio;
}
const pagadoP = (p, antesDe) => suma(p.pagos.filter((x) => !antesDe || x.fecha < antesDe), (x) => x.monto);
const pendienteP = (p) => r2(p.monto - pagadoP(p));
const ahorradoMeta = (m) => suma(m.movs, (x) => x.monto);

function calc() {
  const c = E.config, T = hoyISO();
  let S = c.proxSub || addDias(T, 30), subVencida = false;
  let D = difDias(T, S);
  if (D <= 0) { D = 1; subVencida = true; }

  let saldo = +c.saldoInicial || 0;
  for (const m of E.movs) saldo += m.tipo === "ingreso" ? m.monto : -m.monto;
  for (const p of E.prestamos) saldo += p.tipo === "debo" ? pendienteP(p) : -pendienteP(p);
  const enMetas = suma(E.metas, ahorradoMeta);
  const libre = r2(saldo - enMetas);

  // Salidas de hoy (se devuelven para calcular cómo empezó el día)
  const gHoy = E.movs.filter((m) => m.tipo === "gasto" && m.fecha === T).sort((a, b) => a.creado - b.creado);
  const prestadoHoy = suma(E.prestamos.filter((p) => p.tipo === "preste" && p.fecha === T), (p) => p.monto);
  const deudaPagHoy = suma(E.prestamos.filter((p) => p.tipo === "debo").flatMap((p) => p.pagos.filter((x) => x.fecha === T)), (x) => x.monto);
  const base = r2(libre + suma(gHoy, (m) => m.monto) + prestadoHoy + deudaPagHoy);

  // Lo que hay que apartar hasta la próxima subvención
  const P = inicioPeriodo(T);
  const comidaDia = (c.modo === "ciclo" ? +c.comidaSem : +c.comidaSemVac) / 7 || 0;
  const presupComida = comidaDia * Math.max(1, difDias(P, S));
  const comidaAntes = suma(E.movs.filter((m) => m.cat === "ingredientes" && m.fecha >= P && m.fecha < T), (m) => m.monto);
  const resComida = Math.max(0, r2(presupComida - comidaAntes));
  let resClase = 0;
  for (let i = 0; i < D; i++) { const k = costoClase(addDias(T, i)); resClase += k.pasaje + k.menu; }
  const pagosRes = E.pagos.filter((p) => (!p.pagadoEl || p.pagadoEl === T) && !(p.recurrente && p.creadoEl === T) && p.fecha < S);
  const resPagos = suma(pagosRes, (p) => p.monto);
  const deudasRes = E.prestamos.filter((p) => p.tipo === "debo" && p.vence && p.vence < S);
  const resDeudas = suma(deudasRes, (p) => Math.max(0, p.monto - pagadoP(p, T)));
  const reservas = r2(resComida + resClase + resPagos + resDeudas);
  const libreReal = r2(base - reservas);
  const diarioBase = Math.max(0, libreReal / D);

  // Gastos de hoy que NO estaban previstos
  const kHoy = costoClase(T);
  let prevComida = resComida, prevPasaje = kHoy.pasaje, prevMenu = kHoy.menu, noPrev = 0;
  for (const m of gHoy) {
    let p = 0;
    if (m.cat === "pagos") p = m.monto;
    else if (m.cat === "ingredientes") { p = Math.min(m.monto, prevComida); prevComida -= p; }
    else if (m.cat === "transporte") { p = Math.min(m.monto, prevPasaje); prevPasaje -= p; }
    else if (m.cat === "fuera") { p = Math.min(m.monto, prevMenu); prevMenu -= p; }
    noPrev += m.monto - p;
  }
  noPrev += prestadoHoy + Math.max(0, deudaPagHoy - resDeudas);
  noPrev = r2(noPrev);
  const hoy = r2(diarioBase - noPrev);
  return { T, S, D, P, subVencida, saldo: r2(saldo), libre, enMetas, base, reservas, resComida, resClase, resPagos, resDeudas, libreReal, diarioBase: r2(diarioBase), noPrev, hoy };
}

// ---------- Ánimo de Brotty ----------
let animoTemporal = null, animoHasta = 0;
function animo(k) {
  if (Date.now() < animoHasta) return animoTemporal;
  if (k.diarioBase <= 0 || k.hoy < 0) return "triste";
  if (k.hoy < k.diarioBase * 0.35) return "preocupado";
  return "feliz";
}
function celebrar(ms = 5000) { animoTemporal = "celebrando"; animoHasta = Date.now() + ms; render(); setTimeout(render, ms + 50); }
function esCumple() { const c = E.config.cumple; return c && hoyISO().slice(5) === c; }
function frase(a, traje) {
  if (esCumple()) return "¡Feliz cumple! 🎂";
  const F = {
    feliz: ["S/ ✓", "¡Vamos bien! 🌱", "Tú puedes 💪", traje === "halloween" ? "¿Dulce o ahorro? 🎃" : "Hoy brotamos 🌿", traje === "navidad" ? "Jo jo jo 🎄" : "😊"],
    preocupado: ["¿S/?", "Ojo con los antojos 👀", "Despacito nomás"],
    triste: ["💸", "Mañana se ajusta 🌱", "No pasa nada, seguimos"],
    celebrando: ["¡Yupi! ✨", "¡Bien ahí! 🎉", "¡Plata que brota! 🌿"]
  };
  const l = F[a]; return l[Math.floor(Date.now() / 20000) % l.length];
}

// ---------- Fondos de los cuartos ----------
const FONDOS = {
  bosque: `<svg viewBox="0 0 400 300" preserveAspectRatio="none"><path d="M0 300 L0 170 L25 120 L50 170 L70 100 L95 170 L115 130 L140 180 L165 110 L190 185 L400 185 L400 300Z" fill="#0f2419"/><path d="M400 300 L400 150 L375 105 L350 160 L330 95 L305 165 L280 125 L260 190 L0 195 L0 300Z" fill="#0b1c14"/>${[[60, 60], [300, 40], [220, 90], [140, 35], [350, 80], [30, 110]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#d9ff5a"><animate attributeName="opacity" values=".2;1;.2" dur="${2 + i * .6}s" repeatCount="indefinite"/></circle>`).join("")}</svg>`,
  rio: `<svg viewBox="0 0 400 300" preserveAspectRatio="none"><path d="M0 300 L0 200 Q100 180 200 205 T400 195 L400 300Z" fill="#0c2230"/><path d="M0 300 L0 235 Q100 215 200 240 T400 230 L400 300Z" fill="#0e2c3d"/><path d="M40 255 q20 -8 40 0 M220 270 q20 -8 40 0 M300 248 q15 -6 30 0" stroke="#2f6f8a" stroke-width="3" fill="none"/></svg>`,
  selva: `<svg viewBox="0 0 400 300" preserveAspectRatio="none"><path d="M0 300 C 20 200,60 180,40 120 C 90 160,90 230,70 300Z" fill="#0f2a18"/><path d="M400 300 C 380 210,340 190,360 110 C 310 160,310 230,330 300Z" fill="#0f2a18"/><path d="M120 300 C 140 230,190 220,170 170 C 220 210,210 260,200 300Z" fill="#0b1f12"/><path d="M0 300 L0 260 Q200 230 400 260 L400 300Z" fill="#0b1c14"/></svg>`,
  montania: `<svg viewBox="0 0 400 300" preserveAspectRatio="none"><circle cx="300" cy="150" r="40" fill="#ffd23f" opacity=".25"/><path d="M0 300 L0 220 L90 130 L160 200 L240 110 L330 190 L400 150 L400 300Z" fill="#14271d"/><path d="M0 300 L0 250 L120 190 L220 240 L320 200 L400 230 L400 300Z" fill="#0d1c15"/><path d="M240 110 L222 128 L240 124 L256 130Z" fill="#c7e6d4" opacity=".5"/></svg>`,
  fogata: `<svg viewBox="0 0 400 300" preserveAspectRatio="none"><path d="M0 300 L0 250 Q200 225 400 250 L400 300Z" fill="#14140f"/><g transform="translate(200 238)"><path d="M-30 10 L30 -2 M-30 -2 L30 10" stroke="#5a3a1a" stroke-width="9" stroke-linecap="round"/><path d="M0 -50 C 18 -26,22 -12,0 4 C -22 -12,-18 -26,0 -50Z" fill="#ff7a59" opacity=".8"><animate attributeName="opacity" values=".6;.95;.6" dur="1.2s" repeatCount="indefinite"/></path><path d="M0 -30 C 10 -16,10 -8,0 2 C -10 -8,-10 -16,0 -30Z" fill="#ffd23f"/></g><circle cx="200" cy="215" r="90" fill="#ff7a59" opacity=".06"/></svg>`
};
document.querySelectorAll("[data-fondo]").forEach((el) => (el.innerHTML = FONDOS[el.dataset.fondo]));

// ---------- Navegación entre cuartos ----------
const rooms = $("#rooms"), roomEls = [...document.querySelectorAll(".room")];
let roomIdx = 1;
function irA(i, suave = true) { rooms.scrollTo({ left: i * rooms.clientWidth, behavior: suave ? "smooth" : "auto" }); }
function pintarPuntos() {
  $("#puntos").innerHTML = `<div class="dots">${roomEls.map((_, i) => `<span class="${i === roomIdx ? "on" : ""}"></span>`).join("")}</div><div class="nombre">${roomEls[roomIdx].dataset.room}</div>`;
}
rooms.addEventListener("scroll", () => {
  const i = Math.round(rooms.scrollLeft / rooms.clientWidth);
  if (i !== roomIdx) { roomIdx = i; pintarPuntos(); }
}, { passive: true });
window.addEventListener("resize", () => irA(roomIdx, false));

// ---------- Render ----------
function render() {
  const k = calc();
  renderInicio(k); renderMovs(); renderStats(); renderMetas(k); renderPagos(k); pintarPuntos();
}

function renderInicio(k) {
  const traje = Brotty.trajeDeHoy(), a = animo(k);
  const extra = esCumple() ? Brotty.torta : "";
  $("#brotty").innerHTML = Brotty.svg({ animo: esCumple() ? "celebrando" : a, traje, extra });
  $("#globo").textContent = frase(esCumple() ? "celebrando" : a, traje);
  const num = $("#hoyNum");
  num.textContent = soles(Math.max(0, k.hoy));
  num.classList.toggle("neg", k.hoy <= 0);
  const total = k.diarioBase;
  $("#hoyBarra").style.width = (total > 0 ? Math.min(100, (k.noPrev / total) * 100) : (k.noPrev > 0 ? 100 : 0)) + "%";
  $("#hoySub").innerHTML = k.hoy < 0
    ? `Hoy te pasaste ${soles(-k.hoy)} · los próximos días se ajustan`
    : `Gastaste hoy ${soles(k.noPrev)} de ${soles(total)}`;
  $("#subLine").textContent = E.config.proxSub
    ? (k.subVencida ? "Próxima subvención: ¿ya llegó?" : `Próxima subvención: ~${k.D} día${k.D === 1 ? "" : "s"} (aprox.)`)
    : "";
  const np = E.prestamos.filter((p) => pendienteP(p) > 0).length;
  $("#nPrest").textContent = np;

  // Avisos
  const av = [];
  if (k.subVencida) av.push(`<div class="card aviso"><b>🎓 ¿Ya llegó tu subvención?</b><div class="suave">La fecha aproximada ya pasó.</div>
    <div class="acciones"><button class="btn chico oro" data-act="llegoSub">Sí, llegó</button><button class="btn chico sec" data-act="cambiarFechaSub">Cambiar fecha</button></div></div>`);
  if (k.libreReal < 0) av.push(`<div class="card aviso rojo"><b>⚠️ Tus pagos no alcanzan</b><div class="suave">Hasta tu próxima subvención te faltan <b class="coral">${soles(-k.libreReal)}</b> para cubrir lo apartado (pagos, pasajes y comida). Revisa tus pagos o habla con tiempo.</div></div>`);
  const T = k.T;
  const vencidos = E.prestamos.filter((p) => pendienteP(p) > 0 && p.vence && p.vence <= T);
  for (const p of vencidos.slice(0, 2)) {
    const dias = difDias(p.vence, T);
    const txt = p.tipo === "preste" ? `${esc(p.persona)} te debe ${soles(pendienteP(p))}` : `Le debes ${soles(pendienteP(p))} a ${esc(p.persona)}`;
    av.push(`<div class="chip aviso" data-act="irPrestamos"><div class="ico">🤝</div><div class="t"><b>${txt}</b><span>${dias === 0 ? "Vence hoy" : `Venció hace ${dias} día${dias === 1 ? "" : "s"}`}</span></div></div>`);
  }
  if (E.config.respaldoPendiente) av.push(`<div class="card aviso"><b>💾 Brotty: ¿hacemos respaldo?</b><div class="suave">Llegó tu subvención, buen momento para guardar una copia.</div>
    <div class="acciones"><button class="btn chico" data-act="respaldo">Hacer respaldo</button><button class="btn chico sec" data-act="omitirRespaldo">Ahora no</button></div></div>`);
  $("#avisos").innerHTML = av.join("");

  // Chips
  const ch = [];
  const meta = E.metas[0];
  if (meta) {
    const ah = ahorradoMeta(meta), pct = meta.objetivo ? Math.min(100, (ah / meta.objetivo) * 100) : 0;
    ch.push(`<div class="chip" data-act="irMetas"><div class="ico">🏆</div><div class="t"><b>${esc(meta.nombre)}</b><span><span class="gold">${soles(ah)}</span> de ${soles(meta.objetivo)}</span><div class="mini-barra"><i style="width:${pct}%"></i></div></div></div>`);
  }
  const prox = E.pagos.filter((p) => !p.pagadoEl).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (prox) {
    const d = difDias(T, prox.fecha);
    ch.push(`<div class="chip" data-act="irPagos"><div class="ico">📌</div><div class="t"><b>${esc(prox.nombre)} · ${soles(prox.monto)}</b><span>${d < 0 ? "Venció hace " + -d + " días" : d === 0 ? "Vence hoy" : "Vence el " + fechaCorta(prox.fecha)}</span></div></div>`);
  }
  if (!E.movs.length) ch.push(`<div class="card suave" style="text-align:center">Toca <b class="verde">+</b> para registrar tu primer gasto. Desliza para ver los otros cuartos ↔</div>`);
  $("#chips").innerHTML = ch.join("");
}

// ---- Movimientos ----
let movMes = hoyISO().slice(0, 7);
function renderMovs() {
  const [y, m] = movMes.split("-").map(Number);
  $("#movMesLabel").textContent = capital(new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" }));
  const lista = E.movs.filter((x) => x.fecha.startsWith(movMes)).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora || "").localeCompare(a.hora || "") || b.creado - a.creado);
  const ing = suma(lista.filter((x) => x.tipo === "ingreso"), (x) => x.monto), gas = suma(lista.filter((x) => x.tipo === "gasto"), (x) => x.monto);
  let html = `<div class="resumen"><div class="card"><small>Ingresos</small><b class="verde">${soles(ing)}</b></div><div class="card"><small>Gastos</small><b class="coral">${soles(gas)}</b></div></div>`;
  if (!lista.length) html += `<div class="vacio">No hay movimientos este mes.</div>`;
  let dia = "";
  for (const x of lista) {
    if (x.fecha !== dia) { dia = x.fecha; html += `<div class="dia">${x.fecha === hoyISO() ? "Hoy" : fechaBonita(x.fecha)}</div>`; }
    const c = CATS[x.cat] || CATS.otros;
    const sub = [x.lugar ? LUGARES[x.lugar].slice(3) : "", x.hora].filter(Boolean).join(" · ");
    html += `<div class="mov" data-act="editarMov" data-id="${x.id}"><div class="ico">${c.e}</div>
      <div class="t"><b>${esc(x.nota || c.n)}</b><span>${x.nota ? esc(c.n) + (sub ? " · " : "") : ""}${esc(sub)}</span></div>
      <div class="m ${x.tipo === "ingreso" ? "verde" : "coral"}">${x.tipo === "ingreso" ? "+" : "−"} ${soles(x.monto)}</div></div>`;
  }
  $("#listaMovs").innerHTML = html;
}

// ---- Estadísticas ----
let statsModo = "semana", statsOff = 0;
function rangoStats(off) {
  const T = hoyISO();
  if (statsModo === "semana") {
    const wd = (parse(T).getDay() + 6) % 7;
    const ini = addDias(T, -wd + off * 7);
    return { ini, fin: addDias(ini, 7), label: off === 0 ? "Esta semana" : `${fechaCorta(ini)} – ${fechaCorta(addDias(ini, 6))}` };
  }
  const d = parse(T); d.setDate(1); d.setMonth(d.getMonth() + off);
  const ini = fechaISO(d); const fin = addMeses(ini, 1);
  return { ini, fin, label: capital(d.toLocaleDateString("es-PE", { month: "long", year: "numeric" })) };
}
function renderStats() {
  const R = rangoStats(statsOff), Rp = rangoStats(statsOff - 1);
  $("#statsLabel").textContent = R.label;
  document.querySelectorAll("#segStats button").forEach((b) => b.classList.toggle("on", b.dataset.m === statsModo));
  const en = (r) => E.movs.filter((m) => m.fecha >= r.ini && m.fecha < r.fin);
  const L = en(R), Lp = en(Rp);
  const G = L.filter((m) => m.tipo === "gasto"), Gp = Lp.filter((m) => m.tipo === "gasto");
  const ing = suma(L.filter((m) => m.tipo === "ingreso"), (m) => m.monto), gas = suma(G, (m) => m.monto);
  let h = `<div class="resumen"><div class="card"><small>Ingresos</small><b class="verde">${soles(ing)}</b></div><div class="card"><small>Gastos</small><b class="coral">${soles(gas)}</b></div></div>`;

  // Barras por día (semana) o por semana (mes)
  const cols = [];
  if (statsModo === "semana") {
    for (let i = 0; i < 7; i++) { const f = addDias(R.ini, i); cols.push({ l: ["L", "M", "M", "J", "V", "S", "D"][i], v: suma(G.filter((m) => m.fecha === f), (m) => m.monto), hoy: f === hoyISO() }); }
  } else {
    let f = R.ini, n = 1;
    while (f < R.fin) { const f2 = addDias(f, 7) < R.fin ? addDias(f, 7) : R.fin; const ff = f; cols.push({ l: "S" + n++, v: suma(G.filter((m) => m.fecha >= ff && m.fecha < f2), (m) => m.monto) }); f = f2; }
  }
  const mx = Math.max(1, ...cols.map((c) => c.v));
  h += `<div class="card"><h3>Gastos ${statsModo === "semana" ? "por día" : "por semana"}</h3><div class="barras">${cols.map((c) => `<div class="col ${c.hoy ? "hoyc" : ""}"><em>${c.v ? Math.round(c.v) : ""}</em><i style="height:${(c.v / mx) * 100}%"></i><small>${c.l}</small></div>`).join("")}</div></div>`;

  // Por categoría con comparación
  const porCat = {}, porCatP = {};
  G.forEach((m) => (porCat[m.cat] = (porCat[m.cat] || 0) + m.monto));
  Gp.forEach((m) => (porCatP[m.cat] = (porCatP[m.cat] || 0) + m.monto));
  const filas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const mxc = Math.max(1, ...filas.map((f) => f[1]));
  h += `<div class="card"><h3>¿En qué se fue?</h3>${filas.length ? filas.map(([c, v]) => {
    const d = r2(v - (porCatP[c] || 0));
    const dif = Gp.length ? (d > 0 ? `<span class="dif coral">↑ ${soles(d)}</span>` : d < 0 ? `<span class="dif verde">↓ ${soles(-d)}</span>` : `<span class="dif suave">=</span>`) : "";
    return `<div class="cat"><div class="f"><span>${(CATS[c] || CATS.otros).e} ${(CATS[c] || CATS.otros).n}</span><span><b>${soles(v)}</b> ${dif}</span></div><div class="b"><i style="width:${(v / mxc) * 100}%;background:${CATS[c]?.antojo ? "var(--coral)" : "var(--morado)"}"></i></div></div>`;
  }).join("") + `<div class="suave" style="font-size:12px;margin-top:6px">Flechas: comparado con ${statsModo === "semana" ? "la semana" : "el mes"} anterior.</div>` : `<div class="vacio">Sin gastos en este período.</div>`}</div>`;

  // Hábitos de comida
  const coc = porCat.ingredientes || 0, fue = porCat.fuera || 0, sna = porCat.snacks || 0, tc = coc + fue + sna;
  if (tc > 0) {
    const pc = (v) => (v / tc) * 100;
    const lug = {}; G.filter((m) => ["ingredientes", "fuera", "snacks"].includes(m.cat) && m.lugar).forEach((m) => (lug[m.lugar] = (lug[m.lugar] || 0) + m.monto));
    const topL = Object.entries(lug).sort((a, b) => b[1] - a[1]).slice(0, 3);
    h += `<div class="card"><h3>Tu comida</h3><div class="apilada"><i style="width:${pc(coc)}%;background:var(--verde)"></i><i style="width:${pc(fue)}%;background:var(--dorado)"></i><i style="width:${pc(sna)}%;background:var(--coral)"></i></div>
      <div class="leyenda"><span style="--c:var(--verde)">Cocinaste ${soles(coc)}</span><span style="--c:var(--dorado)">Comiste fuera ${soles(fue)}</span><span style="--c:var(--coral)">Snacks ${soles(sna)}</span></div>
      ${topL.length ? `<div class="suave" style="font-size:13px;margin-top:8px">Dónde: ${topL.map(([l, v]) => `${LUGARES[l]} ${soles(v)}`).join(" · ")}</div>` : ""}</div>`;
  }

  // Necesario vs antojo
  const ant = suma(G.filter((m) => CATS[m.cat]?.antojo), (m) => m.monto);
  if (gas > 0) {
    const menu = +E.config.menu || 13;
    h += `<div class="card"><h3>Necesario vs antojo</h3><div class="apilada"><i style="width:${((gas - ant) / gas) * 100}%;background:var(--morado)"></i><i style="width:${(ant / gas) * 100}%;background:var(--coral)"></i></div>
      <div class="leyenda"><span style="--c:var(--morado)">Necesario ${soles(gas - ant)}</span><span style="--c:var(--coral)">Antojos ${soles(ant)}</span></div>
      ${ant > 0 ? `<div style="margin-top:10px">🌱 Tus antojos equivalen a <b class="gold">${(ant / menu).toFixed(1)} menús</b> o <b class="gold">${(ant / ((+E.config.comidaSem || 70) / 7)).toFixed(1)} días de comida</b> cocinando.</div>` : ""}</div>`;
  }
  $("#stats").innerHTML = h;
}

// ---- Metas ----
function copaSVG(pct) {
  const h = 110 * Math.min(1, Math.max(0, pct / 100));
  return `<svg viewBox="0 0 180 200"><defs><clipPath id="vaso"><path d="M30 20 L150 20 C 150 90,120 130,90 130 C 60 130,30 90,30 20 Z"/></clipPath>
    <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#e0a800"/></linearGradient></defs>
    <path d="M30 34 C 0 34,0 80,40 86 M150 34 C 180 34,180 80,140 86" stroke="#c99400" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M30 20 L150 20 C 150 90,120 130,90 130 C 60 130,30 90,30 20 Z" fill="#1a2c24"/>
    <g clip-path="url(#vaso)"><rect x="20" y="${130 - h}" width="140" height="${h}" fill="url(#liq)"><animate attributeName="y" values="${130 - h + 2};${130 - h - 2};${130 - h + 2}" dur="3s" repeatCount="indefinite"/></rect>
    ${h > 8 ? `<circle cx="70" cy="${136 - h / 2}" r="4" fill="#fff" opacity=".5"/><circle cx="104" cy="${140 - h / 3}" r="3" fill="#fff" opacity=".4"/>` : ""}</g>
    <path d="M30 20 L150 20 C 150 90,120 130,90 130 C 60 130,30 90,30 20 Z" fill="none" stroke="#ffd23f" stroke-width="6"/>
    <rect x="80" y="130" width="20" height="30" fill="#ffd23f" stroke="#7a5200" stroke-width="3"/>
    <rect x="52" y="160" width="76" height="20" rx="6" fill="#ffd23f" stroke="#7a5200" stroke-width="4"/>
    <text x="90" y="${pct >= 50 ? 80 : 60}" text-anchor="middle" font-size="22" font-weight="900" fill="${pct >= 50 ? "#4a3300" : "#ffd23f"}" font-family="Nunito,Arial">${Math.round(pct)}%</text></svg>`;
}
function mesesSinPedir() {
  const pap = E.movs.filter((m) => m.cat === "papas").map((m) => m.fecha).sort();
  const desde = pap.length ? pap[pap.length - 1] : E.config.fechaInicio;
  const a = parse(desde), b = new Date();
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0));
}
function renderMetas(k) {
  let h = "";
  const m0 = E.metas[0];
  if (m0) {
    const ah = ahorradoMeta(m0), pct = m0.objetivo ? (ah / m0.objetivo) * 100 : 0;
    h += `<div class="copa-wrap">${copaSVG(pct)}<div style="font-weight:900;font-size:18px">${esc(m0.nombre)}</div><div><span class="gold">${soles(ah)}</span> de ${soles(m0.objetivo)}</div></div>`;
  } else {
    h += `<div class="copa-wrap">${copaSVG(0)}</div><div class="vacio">Crea tu primera meta. Brotty te sugerirá cuánto apartar según tus números, sin tocar lo que necesitas.</div>`;
  }
  for (const m of E.metas) {
    const ah = ahorradoMeta(m), pct = m.objetivo ? Math.min(100, (ah / m.objetivo) * 100) : 0;
    h += `<div class="card"><div class="fila" style="justify-content:space-between"><b style="flex:none">🏆 ${esc(m.nombre)}</b><span style="flex:none"><span class="gold">${soles(ah)}</span> / ${soles(m.objetivo)}</span></div>
      <div class="mini-barra"><i style="width:${pct}%"></i></div>
      <div class="fila" style="margin-top:10px"><button class="btn chico oro" data-act="aportar" data-id="${m.id}">+ Apartar</button><button class="btn chico sec" data-act="retirar" data-id="${m.id}">Sacar</button><button class="btn chico sec" data-act="borrarMeta" data-id="${m.id}">Borrar</button></div></div>`;
  }
  h += `<button class="btn full" style="margin-top:12px" data-act="nuevaMeta">+ Nueva meta</button>`;
  const n = mesesSinPedir();
  h += `<div class="card" style="text-align:center"><div style="font-size:30px">👪</div><b>${n} ${n === 1 ? "mes" : "meses"} sin pedir dinero extra</b><div class="suave" style="font-size:13px">Se cuenta desde la última vez que registraste "Ayuda de mis papás".</div></div>`;
  h += `<div class="card suave" style="font-size:13px">Tienes <b class="verde">${soles(k.libre)}</b> libres y <b class="gold">${soles(k.enMetas)}</b> apartados en metas (no cuentan en tu "hoy puedes gastar").</div>`;
  $("#metas").innerHTML = h;
}

// ---- Pagos y préstamos ----
function renderPagos(k) {
  const T = hoyISO();
  const pend = E.pagos.filter((p) => !p.pagadoEl).sort((a, b) => a.fecha.localeCompare(b.fecha));
  let h = `<div class="card"><h3>📌 Pagos programados</h3><div class="suave" style="font-size:13px">Se apartan solos antes de calcular tu diario.</div>`;
  h += pend.length ? pend.map((p) => {
    const d = difDias(T, p.fecha), antes = p.fecha < k.S;
    return `<div class="mov" style="margin-top:8px;cursor:default"><div class="ico">🏠</div><div class="t"><b>${esc(p.nombre)}</b><span>${d < 0 ? `<span class="coral">Venció hace ${-d} días</span>` : d === 0 ? "Vence hoy" : "Vence el " + fechaCorta(p.fecha)}${p.mensual ? " · cada mes" : ""}${antes ? " · apartado" : ""}</span></div>
      <div style="text-align:right"><div class="m">${soles(p.monto)}</div><div class="fila" style="gap:4px;margin-top:4px"><button class="btn chico" data-act="pagar" data-id="${p.id}">Pagar</button><button class="btn chico sec" data-act="editarPago" data-id="${p.id}">✎</button></div></div></div>`;
  }).join("") : `<div class="vacio">Sin pagos programados.</div>`;
  h += `<button class="btn sec full" style="margin-top:10px" data-act="nuevoPago">+ Agregar pago</button></div>`;

  const ps = E.prestamos.slice().sort((a, b) => (a.vence || "9").localeCompare(b.vence || "9"));
  const act = ps.filter((p) => pendienteP(p) > 0), fin = ps.filter((p) => pendienteP(p) <= 0);
  const tarj = (p) => {
    const pe = pendienteP(p), venc = p.vence && p.vence <= T && pe > 0;
    return `<div class="mov" style="cursor:default;margin-top:8px"><div class="ico">${p.tipo === "preste" ? "🫴" : "🙏"}</div><div class="t"><b>${p.tipo === "preste" ? esc(p.persona) + " me debe" : "Le debo a " + esc(p.persona)}</b>
      <span>${soles(p.monto)} · ${fechaCorta(p.fecha)}${p.vence ? ` · ${venc ? '<span class="coral">vence ' + fechaCorta(p.vence) + "</span>" : "vence " + fechaCorta(p.vence)}` : ""}${p.pagos.length ? " · pagado " + soles(pagadoP(p)) : ""}${p.nota ? " · " + esc(p.nota) : ""}</span></div>
      <div style="text-align:right"><div class="m ${p.tipo === "preste" ? "verde" : "coral"}">${pe > 0 ? soles(pe) : "✓"}</div><div class="fila" style="gap:4px;margin-top:4px">${pe > 0 ? `<button class="btn chico" data-act="pagoPrestamo" data-id="${p.id}">Pago</button>` : ""}<button class="btn chico sec" data-act="borrarPrestamo" data-id="${p.id}">✕</button></div></div></div>`;
  };
  const meDeben = suma(act.filter((p) => p.tipo === "preste"), pendienteP), debo = suma(act.filter((p) => p.tipo === "debo"), pendienteP);
  h += `<div class="card"><h3>🤝 Préstamos</h3><div class="resumen" style="margin:6px 0"><div class="card" style="padding:8px 10px"><small>Me deben</small><b class="verde">${soles(meDeben)}</b></div><div class="card" style="padding:8px 10px"><small>Yo debo</small><b class="coral">${soles(debo)}</b></div></div>
    ${act.length ? act.map(tarj).join("") : `<div class="vacio">Nada pendiente 🎉</div>`}
    <button class="btn sec full" style="margin-top:10px" data-act="nuevoPrestamo">+ Registrar préstamo</button>
    ${fin.length ? `<div class="dia">Ya pagados</div>${fin.slice(0, 10).map(tarj).join("")}` : ""}</div>`;
  $("#pagos").innerHTML = h;
}

// ---------- Hoja inferior ----------
const wrap = $("#sheetWrap"), sheet = $("#sheet");
let sheetFijo = false, sheetRender = null;
function abrir(fn, fijo = false) {
  sheetRender = fn; sheetFijo = fijo; fn();
  if (!wrap.classList.contains("abierto")) { wrap.classList.add("abierto"); history.pushState({ hoja: 1 }, ""); }
}
function cerrar(desdeHistorial) {
  if (!wrap.classList.contains("abierto")) return;
  wrap.classList.remove("abierto"); sheetRender = null;
  if (!desdeHistorial && history.state && history.state.hoja) history.back();
}
wrap.addEventListener("click", (e) => { if (e.target === wrap && !sheetFijo) cerrar(); });
window.addEventListener("popstate", () => { if (wrap.classList.contains("abierto")) { if (sheetFijo) history.pushState({ hoja: 1 }, ""); else cerrar(true); } });
const btnCerrar = () => (sheetFijo ? "" : `<button class="cerrar" data-act="cerrar">✕</button>`);

let toastT;
function toast(msg, deshacer) {
  const t = $("#toast");
  t.innerHTML = `<span>${msg}</span>${deshacer ? `<button id="tUndo">Deshacer</button>` : ""}`;
  t.classList.add("ver");
  if (deshacer) $("#tUndo").onclick = () => { deshacer(); t.classList.remove("ver"); };
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("ver"), 3500);
}

// ---------- Registro (gasto / ingreso / préstamo) ----------
let R = null;
function nuevoRegistro(tab = "gasto", extra = {}) {
  R = Object.assign({ tab, cat: null, monto: "", lugar: null, nota: "", fecha: hoyISO(), editId: null, tipoP: "preste", persona: "", vence: "" }, extra);
  abrir(pintarRegistro);
}
function atajos() {
  const cuenta = {};
  E.movs.filter((m) => m.tipo === "gasto" && m.cat !== "pagos").slice(-80).forEach((m) => {
    const k = `${m.cat}|${m.monto}|${m.lugar || ""}`; cuenta[k] = (cuenta[k] || 0) + 1;
  });
  const top = Object.entries(cuenta).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  const c = E.config;
  if (c.pasaje && !top.some((k) => k.startsWith("transporte|"))) top.push(`transporte|${+c.pasaje}|`);
  if (c.menu && !top.some((k) => k.startsWith("fuera|"))) top.push(`fuera|${+c.menu}|univ`);
  return top.slice(0, 6);
}
function pintarRegistro() {
  const tabs = `<div class="tabs">${[["gasto", "Gasto"], ["ingreso", "Ingreso"], ["prestamo", "Préstamo"]].map(([t, n]) => `<button class="${R.tab === t ? "on" : ""}" data-act="regTab" data-t="${t}" ${R.editId && t !== R.tab ? "disabled" : ""}>${n}</button>`).join("")}</div>`;
  let h = `${btnCerrar()}<h2>${R.editId ? "Editar" : "Registrar"}</h2>${R.editId ? "" : tabs}`;
  if (R.tab === "prestamo") {
    h += `<div class="chips-sel" style="margin-bottom:6px"><button class="${R.tipoP === "preste" ? "on" : ""}" data-act="regTipoP" data-t="preste">🫴 Yo presté</button><button class="${R.tipoP === "debo" ? "on" : ""}" data-act="regTipoP" data-t="debo">🙏 Me prestaron</button></div>
      <label>Persona</label><input type="text" id="rPersona" maxlength="40" placeholder="Ej: Carlos" value="${esc(R.persona)}">
      <div class="monto">${R.monto ? "S/ " + R.monto : "S/ 0"}</div>${teclado()}
      <label>¿Para cuándo debe devolverse? (opcional)</label><input type="date" id="rVence" value="${R.vence}">
      <label>Nota (opcional)</label><input type="text" id="rNota" maxlength="60" value="${esc(R.nota)}">
      <button class="btn full" style="margin-top:14px" data-act="guardarReg">Guardar préstamo</button>`;
  } else if (!R.cat) {
    const lista = R.tab === "gasto" ? CATS_GASTO : CATS_INGRESO;
    if (R.tab === "gasto") {
      const at = atajos();
      if (at.length) h += `<div class="suave" style="font-size:13px;margin-bottom:6px">Atajos (un toque y listo)</div><div class="atajos">${at.map((k) => { const [c, m, l] = k.split("|"); return `<button class="atajo" data-act="atajo" data-k="${k}">${CATS[c].e} ${l ? LUGARES[l].slice(3) + " " : ""}S/ ${(+m).toFixed(2)}</button>`; }).join("")}</div>`;
    }
    h += `<div class="suave" style="font-size:13px;margin-bottom:6px">${R.tab === "gasto" ? "¿Qué compraste?" : "¿De dónde vino?"}</div>
      <div class="grid-cats">${lista.map((c) => `<button class="cat-btn" data-act="regCat" data-c="${c}"><span class="e">${CATS[c].e}</span>${CATS[c].n}</button>`).join("")}</div>`;
  } else {
    const c = CATS[R.cat];
    h += `<div class="cat-elegida"><div class="cat-btn on" style="flex:1;flex-direction:row;justify-content:flex-start;padding:8px 12px"><span class="e" style="font-size:24px">${c.e}</span>${c.n}</div><button class="btn chico sec" data-act="regCambiarCat">Cambiar</button></div>
      <div class="monto">${R.monto ? "S/ " + R.monto : "S/ 0"}</div>`;
    if (R.tab === "gasto") h += `<div class="chips-sel">${Object.entries(LUGARES).map(([k, n]) => `<button class="${R.lugar === k ? "on" : ""}" data-act="regLugar" data-l="${k}">${n}</button>`).join("")}</div>`;
    h += teclado();
    h += `<div class="fila"><div><label>Nota (opcional)</label><input type="text" id="rNota" maxlength="60" placeholder="Ej: pan con palta" value="${esc(R.nota)}"></div>
      <div style="flex:0 0 42%"><label>Fecha</label><input type="date" id="rFecha" value="${R.fecha}"></div></div>
      <button class="btn full" style="margin-top:14px" data-act="guardarReg">${R.editId ? "Guardar cambios" : "Guardar"}</button>
      ${R.editId ? `<button class="btn rojo full" style="margin-top:8px" data-act="borrarMov">Borrar</button>` : ""}`;
  }
  sheet.innerHTML = h;
}
const teclado = () => `<div class="teclado">${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((t) => `<button data-act="tecla" data-t="${t}">${t}</button>`).join("")}</div>`;
function leerCamposReg() {
  const n = $("#rNota"), f = $("#rFecha"), p = $("#rPersona"), v = $("#rVence");
  if (n) R.nota = n.value; if (f) R.fecha = f.value || hoyISO(); if (p) R.persona = p.value; if (v) R.vence = v.value;
}

// ---------- Acciones ----------
const ACT = {
  cerrar: () => cerrar(),
  irPrestamos: () => irA(4), irPagos: () => irA(4), irMetas: () => irA(3),
  nuevo: () => nuevoRegistro(roomIdx === 4 ? "prestamo" : "gasto"),
  regTab: (d) => { leerCamposReg(); R.tab = d.t; R.cat = null; pintarRegistro(); },
  regTipoP: (d) => { leerCamposReg(); R.tipoP = d.t; pintarRegistro(); },
  regCat: (d) => { R.cat = d.c; pintarRegistro(); },
  regCambiarCat: () => { leerCamposReg(); R.cat = null; pintarRegistro(); },
  regLugar: (d) => { leerCamposReg(); R.lugar = R.lugar === d.l ? null : d.l; pintarRegistro(); },
  tecla: (d) => {
    leerCamposReg();
    let m = R.monto;
    if (d.t === "⌫") m = m.slice(0, -1);
    else if (d.t === ".") { if (!m.includes(".")) m = (m || "0") + "."; }
    else if (!(m.includes(".") && m.split(".")[1].length >= 2) && m.length < 8) m = m === "0" ? d.t : m + d.t;
    R.monto = m; pintarRegistro();
  },
  atajo: (d) => {
    const [cat, monto, lugar] = d.k.split("|");
    const mov = { id: uid(), tipo: "gasto", cat, monto: +monto, lugar: lugar || null, fecha: hoyISO(), hora: horaAhora(), nota: "", creado: Date.now() };
    E.movs.push(mov); guardar(); cerrar(); saltar();
    toast(`${CATS[cat].e} ${soles(+monto)} guardado`, () => { E.movs = E.movs.filter((x) => x.id !== mov.id); guardar(); });
  },
  guardarReg: () => {
    leerCamposReg();
    const monto = r2(parseFloat(R.monto));
    if (!(monto > 0)) return toast("Escribe un monto");
    if (R.tab === "prestamo") {
      if (!R.persona.trim()) return toast("¿Quién? Escribe un nombre");
      E.prestamos.push({ id: uid(), tipo: R.tipoP, persona: R.persona.trim(), monto, fecha: hoyISO(), vence: R.vence || "", nota: R.nota.trim(), pagos: [] });
      guardar(); cerrar(); toast("Préstamo guardado 🤝"); return;
    }
    if (R.editId) {
      const m = E.movs.find((x) => x.id === R.editId);
      Object.assign(m, { cat: R.cat, monto, lugar: R.tab === "gasto" ? R.lugar : null, nota: R.nota.trim(), fecha: R.fecha });
      guardar(); cerrar(); toast("Cambios guardados"); return;
    }
    const mov = { id: uid(), tipo: R.tab, cat: R.cat, monto, lugar: R.tab === "gasto" ? R.lugar : null, fecha: R.fecha, hora: horaAhora(), nota: R.nota.trim(), creado: Date.now() };
    E.movs.push(mov);
    if (mov.cat === "subvencion") { despuesDeSubvencion(); }
    guardar(); cerrar(); saltar();
    if (mov.tipo === "ingreso") celebrar(3500);
    toast(`${CATS[mov.cat].e} ${soles(monto)} guardado`, () => { E.movs = E.movs.filter((x) => x.id !== mov.id); guardar(); });
  },
  editarMov: (d) => {
    const m = E.movs.find((x) => x.id === d.id); if (!m) return;
    if (m.cat === "pagos" || m.cat === "ajuste") {
      return abrir(() => { sheet.innerHTML = `${btnCerrar()}<h2>${esc(m.nota || CATS[m.cat].n)}</h2><p class="suave">${soles(m.monto)} · ${fechaBonita(m.fecha)}</p><button class="btn rojo full" data-act="borrarMovId" data-id="${m.id}">Borrar</button>`; });
    }
    R = { tab: m.tipo, cat: m.cat, monto: String(m.monto), lugar: m.lugar, nota: m.nota || "", fecha: m.fecha, editId: m.id };
    abrir(pintarRegistro);
  },
  borrarMov: () => { if (confirm("¿Borrar este movimiento?")) { E.movs = E.movs.filter((x) => x.id !== R.editId); guardar(); cerrar(); } },
  borrarMovId: (d) => {
    if (!confirm("¿Borrar este movimiento?")) return;
    const m = E.movs.find((x) => x.id === d.id);
    if (m && m.pagoId) { const p = E.pagos.find((x) => x.id === m.pagoId); if (p) p.pagadoEl = null; }
    E.movs = E.movs.filter((x) => x.id !== d.id); guardar(); cerrar();
  },
  movMes: (d) => { const [y, m] = movMes.split("-").map(Number); movMes = fechaISO(new Date(y, m - 1 + +d, 1)).slice(0, 7); renderMovs(); },
  statsModo: (d) => { statsModo = d.m; statsOff = 0; renderStats(); },
  statsNav: (d) => { statsOff = Math.min(0, statsOff + +d); renderStats(); },
  tocarBrotty: () => {
    const k = calc(), b = $("#brotty");
    b.classList.remove("salto"); void b.offsetWidth; b.classList.add("salto");
    const el = document.createElement("div");
    if (k.hoy > 0) { el.className = "moneda"; el.textContent = "S/"; } else { el.className = "aire"; el.textContent = "💨 aire..."; }
    b.parentElement.appendChild(el); setTimeout(() => el.remove(), 1200);
    if (navigator.vibrate) navigator.vibrate(15);
  },

  // Subvención
  llegoSub: () => abrir(() => {
    const c = E.config;
    sheet.innerHTML = `${btnCerrar()}<h2>🎓 ¡Llegó la subvención!</h2>
      <label>Monto recibido (S/)</label><input type="number" id="sMonto" inputmode="decimal" value="${c.montoSub || ""}">
      <label>¿Cuándo esperas la siguiente? (aproximado)</label><input type="date" id="sProx" value="${addMeses(hoyISO(), 1)}">
      <button class="btn oro full" style="margin-top:14px" data-act="guardarSub">Registrar</button>`;
  }),
  guardarSub: () => {
    const monto = r2(parseFloat($("#sMonto").value)), prox = $("#sProx").value;
    if (!(monto > 0) || !prox) return toast("Completa monto y fecha");
    E.movs.push({ id: uid(), tipo: "ingreso", cat: "subvencion", monto, lugar: null, fecha: hoyISO(), hora: horaAhora(), nota: "", creado: Date.now() });
    E.config.proxSub = prox; despuesDeSubvencion(); guardar(); cerrar(); celebrar(); sugerirMeta();
  },
  cambiarFechaSub: () => abrir(() => {
    sheet.innerHTML = `${btnCerrar()}<h2>Próxima subvención</h2><p class="nota">Pon la fecha aproximada; la puedes cambiar cuando quieras.</p>
      <input type="date" id="sProx" value="${addDias(hoyISO(), 3)}"><button class="btn full" style="margin-top:14px" data-act="guardarFechaSub">Guardar</button>`;
  }),
  guardarFechaSub: () => { const v = $("#sProx").value; if (!v) return; E.config.proxSub = v; guardar(); cerrar(); },

  // Pagos programados
  nuevoPago: () => formPago(),
  editarPago: (d) => formPago(E.pagos.find((p) => p.id === d.id)),
  guardarPago: (d) => {
    const nombre = $("#pNombre").value.trim(), monto = r2(parseFloat($("#pMonto").value)), fecha = $("#pFecha").value, mensual = $("#pMensual").checked;
    if (!nombre || !(monto > 0) || !fecha) return toast("Completa nombre, monto y fecha");
    if (d.id) Object.assign(E.pagos.find((p) => p.id === d.id), { nombre, monto, fecha, mensual });
    else E.pagos.push({ id: uid(), nombre, monto, fecha, mensual, pagadoEl: null, creadoEl: hoyISO() });
    guardar(); cerrar();
  },
  borrarPago: (d) => { if (confirm("¿Borrar este pago programado?")) { E.pagos = E.pagos.filter((p) => p.id !== d.id); guardar(); cerrar(); } },
  pagar: (d) => {
    const p = E.pagos.find((x) => x.id === d.id);
    abrir(() => {
      sheet.innerHTML = `${btnCerrar()}<h2>Pagar ${esc(p.nombre)}</h2><label>Monto pagado (S/)</label><input type="number" id="pgMonto" inputmode="decimal" value="${p.monto}">
        <p class="nota">${p.mensual ? "Al pagar, Brotty programa el del próximo mes." : ""}</p><button class="btn full" data-act="confirmarPago" data-id="${p.id}">Confirmar pago</button>`;
    });
  },
  confirmarPago: (d) => {
    const p = E.pagos.find((x) => x.id === d.id), monto = r2(parseFloat($("#pgMonto").value));
    if (!(monto > 0)) return toast("Monto inválido");
    const T = hoyISO();
    E.movs.push({ id: uid(), tipo: "gasto", cat: "pagos", monto, lugar: null, fecha: T, hora: horaAhora(), nota: p.nombre, creado: Date.now(), pagoId: p.id });
    p.pagadoEl = T;
    if (p.mensual) E.pagos.push({ id: uid(), nombre: p.nombre, monto: p.monto, fecha: addMeses(p.fecha, 1), mensual: true, pagadoEl: null, creadoEl: T, recurrente: true });
    guardar(); cerrar(); toast(`${esc(p.nombre)} pagado ✓`);
  },

  // Préstamos
  nuevoPrestamo: () => nuevoRegistro("prestamo"),
  pagoPrestamo: (d) => {
    const p = E.prestamos.find((x) => x.id === d.id);
    abrir(() => {
      sheet.innerHTML = `${btnCerrar()}<h2>${p.tipo === "preste" ? esc(p.persona) + " me pagó" : "Le pagué a " + esc(p.persona)}</h2>
        <p class="nota">Falta ${soles(pendienteP(p))}.</p><label>Monto (S/)</label><input type="number" id="ppMonto" inputmode="decimal" value="${pendienteP(p)}">
        <button class="btn full" style="margin-top:14px" data-act="guardarPagoPrestamo" data-id="${p.id}">Guardar</button>`;
    });
  },
  guardarPagoPrestamo: (d) => {
    const p = E.prestamos.find((x) => x.id === d.id), monto = Math.min(r2(parseFloat($("#ppMonto").value)), pendienteP(p));
    if (!(monto > 0)) return toast("Monto inválido");
    p.pagos.push({ id: uid(), monto, fecha: hoyISO() }); guardar(); cerrar();
    if (pendienteP(p) <= 0) { toast("¡Préstamo saldado! 🎉"); celebrar(3000); }
  },
  borrarPrestamo: (d) => { if (confirm("¿Borrar este préstamo y sus pagos?")) { E.prestamos = E.prestamos.filter((x) => x.id !== d.id); guardar(); } },

  // Metas
  nuevaMeta: () => abrir(() => {
    sheet.innerHTML = `${btnCerrar()}<h2>🏆 Nueva meta</h2><label>Nombre</label><input type="text" id="mNombre" maxlength="30" placeholder="Ej: Cuarto de enero">
      <label>¿Cuánto necesitas? (S/)</label><input type="number" id="mObj" inputmode="decimal">
      <button class="btn oro full" style="margin-top:14px" data-act="guardarMeta">Crear meta</button>`;
  }),
  guardarMeta: () => {
    const nombre = $("#mNombre").value.trim(), obj = r2(parseFloat($("#mObj").value));
    if (!nombre || !(obj > 0)) return toast("Completa nombre y monto");
    E.metas.push({ id: uid(), nombre, objetivo: obj, movs: [] }); guardar(); cerrar();
  },
  aportar: (d) => formMeta(d.id, 1),
  retirar: (d) => formMeta(d.id, -1),
  guardarAporte: (d) => {
    const m = E.metas.find((x) => x.id === d.id), signo = +d.s, monto = r2(parseFloat($("#aMonto").value));
    if (!(monto > 0)) return toast("Monto inválido");
    const k = calc();
    if (signo > 0 && monto > k.libre) return toast("No tienes tanto libre");
    if (signo < 0 && monto > ahorradoMeta(m)) return toast("No hay tanto en la meta");
    m.movs.push({ fecha: hoyISO(), monto: signo * monto }); guardar(); cerrar();
    if (signo > 0) { celebrar(3500); toast("¡A la copa! 🏆"); }
  },
  borrarMeta: (d) => { if (confirm("¿Borrar la meta? Lo apartado vuelve a tu dinero libre.")) { E.metas = E.metas.filter((x) => x.id !== d.id); guardar(); } },

  // Respaldo y ajustes
  respaldo: () => hacerRespaldo(),
  omitirRespaldo: () => { E.config.respaldoPendiente = false; guardar(); },
  ajustes: () => abrir(pintarAjustes),
  diaClase: (d, el) => el.classList.toggle("on"),
  guardarAjustes: () => {
    const c = E.config, v = (id) => $(id).value;
    Object.assign(c, {
      montoSub: +v("#aSub") || 0, proxSub: v("#aProx"), modo: $("#aModo").value,
      dias: [...document.querySelectorAll("#aDias button.on")].map((b) => +b.dataset.d),
      finCiclo: v("#aFin"), pasaje: +v("#aPasaje") || 0, menuDia: +v("#aMenuDia"), menu: +v("#aMenu") || 0,
      comidaSem: +v("#aComida") || 0, comidaSemVac: +v("#aComidaVac") || 0, cumple: v("#aCumple") ? v("#aCumple").slice(5) : ""
    });
    if (!c.setup) { c.setup = true; c.saldoInicial = r2(+v("#aSaldo") || 0); c.fechaInicio = hoyISO(); }
    guardar(); cerrar(); toast("Ajustes guardados");
    if (!E.pagos.length && c.setup && !localStorage.getItem("brotty-pagos-sugeridos")) { localStorage.setItem("brotty-pagos-sugeridos", "1"); setTimeout(() => { irA(4); toast("Agrega tus pagos fijos (cuarto, etc.) aquí 📌"); }, 400); }
  },
  ajustarSaldo: () => {
    const real = parseFloat(prompt("¿Cuánto dinero tienes realmente ahora (sin contar metas)? S/"));
    if (isNaN(real)) return;
    const k = calc(), dif = r2(real - k.libre);
    if (!dif) return toast("Ya está cuadrado ✓");
    E.movs.push({ id: uid(), tipo: dif > 0 ? "ingreso" : "gasto", cat: "ajuste", monto: Math.abs(dif), lugar: null, fecha: hoyISO(), hora: horaAhora(), nota: "Ajuste de saldo", creado: Date.now() });
    guardar(); cerrar(); toast("Saldo ajustado ✓");
  },
  restaurar: () => $("#archivoRestaurar").click(),
  importarViejo: () => {
    try {
      const v = JSON.parse(localStorage.getItem("mis-finanzas-v1"));
      const mapa = { Comida: "fuera", Transporte: "transporte", Universidad: "univ", "Casa y servicios": "pagos", "Celular e internet": "pagos", Salud: "cuidado", Ropa: "otros", Entretenimiento: "salidas", Otros: "otros", Trabajo: "otros_i", Cachuelos: "otros_i", Familia: "papas", Beca: "subvencion" };
      let n = 0;
      for (const m of v.movs || []) {
        const cat = mapa[m.cat] || (m.tipo === "ingreso" ? "otros_i" : "otros");
        E.movs.push({ id: uid(), tipo: m.tipo, cat, monto: m.monto, lugar: null, fecha: m.fecha, hora: "", nota: m.nota || "", creado: m.creado || Date.now() }); n++;
      }
      guardar(); cerrar(); toast(`${n} movimientos importados`);
    } catch { toast("No se pudo importar"); }
  },
  borrarTodo: () => {
    if (confirm("¿Borrar TODO? Se perderán movimientos, pagos, préstamos y metas.") && confirm("Última confirmación: no se puede deshacer.")) {
      E = estadoNuevo(); localStorage.removeItem("brotty-pagos-sugeridos"); guardar(); cerrar(); setTimeout(bienvenida, 300);
    }
  }
};

function formPago(p) {
  abrir(() => {
    sheet.innerHTML = `${btnCerrar()}<h2>${p ? "Editar pago" : "Nuevo pago programado"}</h2>
      <label>Nombre</label><input type="text" id="pNombre" maxlength="30" placeholder="Ej: Cuarto" value="${esc(p?.nombre || "")}">
      <label>Monto (S/)</label><input type="number" id="pMonto" inputmode="decimal" value="${p?.monto || ""}">
      <label>Fecha en que vence</label><input type="date" id="pFecha" value="${p?.fecha || ""}">
      <label class="check"><input type="checkbox" id="pMensual" ${p ? (p.mensual ? "checked" : "") : "checked"}> Se repite cada mes</label>
      <button class="btn full" style="margin-top:14px" data-act="guardarPago" data-id="${p?.id || ""}">Guardar</button>
      ${p ? `<button class="btn rojo full" style="margin-top:8px" data-act="borrarPago" data-id="${p.id}">Borrar</button>` : ""}`;
  });
}
function formMeta(id, signo) {
  const m = E.metas.find((x) => x.id === id), k = calc();
  const sug = signo > 0 ? Math.max(0, Math.floor(((k.libreReal - k.D * 8) * 0.3) / 5) * 5) : 0;
  abrir(() => {
    sheet.innerHTML = `${btnCerrar()}<h2>${signo > 0 ? "Apartar para" : "Sacar de"} ${esc(m.nombre)}</h2>
      ${signo > 0 ? `<p class="nota">${sug > 0 ? `Brotty sugiere <b class="gold">${soles(sug)}</b>: es lo que puedes apartar sin tocar tus pagos ni dejar tu diario muy bajo.` : "Ahora mismo Brotty no recomienda apartar: tu margen está justo. Puedes hacerlo igual si quieres."}</p>` : `<p class="nota">Hay ${soles(ahorradoMeta(m))} en esta meta. Lo que saques vuelve a tu dinero libre.</p>`}
      <label>Monto (S/)</label><input type="number" id="aMonto" inputmode="decimal" value="${sug || ""}">
      <button class="btn ${signo > 0 ? "oro" : "sec"} full" style="margin-top:14px" data-act="guardarAporte" data-id="${id}" data-s="${signo}">${signo > 0 ? "Apartar" : "Sacar"}</button>`;
  });
}
function despuesDeSubvencion() { E.config.respaldoPendiente = true; }
function sugerirMeta() {
  if (!E.metas.length) return;
  const k = calc(), sug = Math.max(0, Math.floor(((k.libreReal - k.D * 8) * 0.3) / 5) * 5);
  if (sug > 0) setTimeout(() => toast(`Brotty: podrías apartar ${soles(sug)} para "${esc(E.metas[0].nombre)}" 🏆`), 1800);
}
function saltar() { const b = $("#brotty"); b.classList.remove("salto"); void b.offsetWidth; b.classList.add("salto"); }

function pintarAjustes() {
  const c = E.config;
  const cumple = c.cumple ? `2000-${c.cumple}` : "";
  sheet.innerHTML = `${btnCerrar()}<h2>${c.setup ? "⚙️ Ajustes" : "¡Hola! Soy Brotty 🌱"}</h2>
    ${c.setup ? "" : `<p class="nota">Cuéntame un poco de tus finanzas para calcular cuánto puedes gastar cada día. Todo se guarda solo en tu celular, y lo puedes cambiar después.</p>
    <label>¿Cuánto dinero tienes ahora mismo? (S/)</label><input type="number" id="aSaldo" inputmode="decimal" placeholder="Ej: 235">`}
    <hr><b>🎓 Subvención</b>
    <label>Monto mensual (S/)</label><input type="number" id="aSub" inputmode="decimal" value="${c.montoSub || ""}" placeholder="Ej: 1260">
    <label>¿Cuándo llega la próxima? (aproximado)</label><input type="date" id="aProx" value="${c.proxSub}">
    <hr><b>📚 Clases</b>
    <label>Modo</label><select id="aModo"><option value="ciclo" ${c.modo === "ciclo" ? "selected" : ""}>Ciclo (en Lima, con clases)</option><option value="vacaciones" ${c.modo === "vacaciones" ? "selected" : ""}>Vacaciones (en mi pueblo)</option></select>
    <label>Días de clase</label><div class="dias-sel" id="aDias">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="${c.dias.includes(d) ? "on" : ""}" data-act="diaClase" data-d="${d}">${DIAS_CORTOS[d]}</button>`).join("")}</div>
    <label>Último día de clases del ciclo</label><input type="date" id="aFin" value="${c.finCiclo}">
    <div class="fila"><div><label>Pasaje por día de clase (S/)</label><input type="number" id="aPasaje" inputmode="decimal" value="${c.pasaje || ""}" placeholder="Ej: 5"></div></div>
    <div class="fila"><div><label>Día que comes en la U</label><select id="aMenuDia">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${+c.menuDia === d ? "selected" : ""}>${["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d]}</option>`).join("")}</select></div>
      <div><label>Menú (S/)</label><input type="number" id="aMenu" inputmode="decimal" value="${c.menu || ""}" placeholder="Ej: 13"></div></div>
    <hr><b>🥕 Comida para cocinar (por semana)</b>
    <div class="fila"><div><label>En ciclo (S/)</label><input type="number" id="aComida" inputmode="decimal" value="${c.comidaSem || ""}" placeholder="Ej: 70"></div>
      <div><label>En vacaciones (S/)</label><input type="number" id="aComidaVac" inputmode="decimal" value="${c.comidaSemVac || ""}" placeholder="Ej: 0"></div></div>
    <hr><b>🎂 Tu cumpleaños</b><label>Brotty celebrará contigo</label><input type="date" id="aCumple" value="${cumple}">
    <button class="btn full" style="margin-top:16px" data-act="guardarAjustes">${c.setup ? "Guardar ajustes" : "¡Listo, empecemos!"}</button>
    ${c.setup ? `<hr><b>💾 Tus datos</b><p class="nota">Tus datos viven solo en este celular. Haz respaldo para no perderlos si borras la app o cambias de celular.</p>
      <div class="fila"><button class="btn sec" data-act="respaldo">Hacer respaldo</button><button class="btn sec" data-act="restaurar">Restaurar</button></div>
      <input type="file" id="archivoRestaurar" accept=".json,application/json" hidden>
      <button class="btn sec full" style="margin-top:8px" data-act="ajustarSaldo">⚖️ Corregir mi saldo</button>
      ${localStorage.getItem("mis-finanzas-v1") ? `<button class="btn sec full" style="margin-top:8px" data-act="importarViejo">Importar datos de la versión de prueba</button>` : ""}
      <button class="btn rojo full" style="margin-top:16px" data-act="borrarTodo">Borrar todos los datos</button>
      <p class="nota" style="text-align:center;margin-top:12px">Brotty v1 · ${c.ultimoRespaldo ? "Último respaldo: " + fechaCorta(c.ultimoRespaldo) : "Sin respaldos aún"}</p>` : ""}`;
  const inp = $("#archivoRestaurar");
  if (inp) inp.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text()), data = d.datos || d;
      if (!data.config || !Array.isArray(data.movs)) throw 0;
      if (confirm(`El respaldo tiene ${data.movs.length} movimientos. Esto REEMPLAZA tus datos actuales. ¿Continuar?`)) { E = Object.assign(estadoNuevo(), data); guardar(); cerrar(); toast("Respaldo restaurado ✓"); }
    } catch { toast("Ese archivo no es un respaldo de Brotty"); }
  };
}

async function hacerRespaldo() {
  const nombre = `brotty-respaldo-${hoyISO()}.json`;
  const blob = new Blob([JSON.stringify({ app: "brotty", version: 1, fecha: hoyISO(), datos: E }, null, 1)], { type: "application/json" });
  const marcar = () => { E.config.respaldoPendiente = false; E.config.ultimoRespaldo = hoyISO(); guardar(); toast("Respaldo listo 💾"); };
  try {
    const file = new File([blob], nombre, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Respaldo de Brotty" }); marcar(); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); URL.revokeObjectURL(a.href); marcar();
}

function bienvenida() { abrir(pintarAjustes, true); }

// Clics
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.disabled) return;
  const f = ACT[t.dataset.act];
  if (f) f(t.dataset, t);
});

// ---------- Arranque ----------
irA(1, false);
render();
if (!E.config.setup) setTimeout(bienvenida, 300);
setInterval(render, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").then((r) => r.update()).catch(() => {}));
}
