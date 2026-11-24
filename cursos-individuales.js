(() => {
  const API = 'https://visionpecuaria-webhook-production.up.railway.app';
  const CURSOS = {
    'gallinas-de-postura': 'Gallinas de Postura',
    'embutidos-artesanales': 'Embutidos Artesanales y Chorizos',
    'sexaje-avicola': 'Sexaje Avícola',
  };
  const FECHA_MEXICO = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23',
  });
  let vista = 'compras';

  function fechaHora(valor) {
    const fecha = toDate(valor);
    if (!fecha) return 'Sin fecha';
    return '<time datetime="' + fecha.toISOString() + '">' + FECHA_MEXICO.format(fecha) + '</time>';
  }

  async function api(path, params, signal) {
    const unauthorised = () => Object.assign(new Error('Se requiere una sesión de administrador.'), { faltaSesion: true });
    if (!auth.currentUser) throw unauthorised();
    const token = await auth.currentUser.getIdToken();
    const query = params.toString();
    const res = await fetch(API + '/admin/cursos/' + path + (query ? '?' + query : ''), {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal,
    });
    if (res.status === 401 || res.status === 403) throw unauthorised();
    if (!res.ok) throw new Error('No pudimos cargar los datos.');
    return res.json();
  }

  const curso = (slug) => CURSOS[slug] ?? slug ?? 'Curso sin identificar';
  window.AdminCursos = { api, curso, fechaHora };

  function montoCompra(centavos, moneda) {
    if (centavos === null || centavos === undefined || !Number.isFinite(Number(centavos))) return '—';
    const divisa = /^[a-z]{3}$/i.test(moneda || '') ? moneda.toUpperCase() : 'MXN';
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: divisa }).format(Number(centavos) / 100) + ' ' + divisa;
  }

  function estadoCompra(estado) {
    const estados = { confirmado: 'Confirmada', pendiente: 'Pendiente', fallido: 'Fallida', reembolsado: 'Reembolsada' };
    return estados[estado] || estado || 'Sin estado';
  }

  function estadoAcceso(acceso) {
    if (!acceso) return 'Sin acceso registrado';
    if (acceso.revocado || acceso.estado === 'revocado') return 'Revocado';
    if (acceso.activo || acceso.estado === 'activo') return 'Activo';
    return 'Inactivo';
  }

  function tablaCompras(titulo, compras, { truncado = false, mostrarAcceso } = {}) {
    return '<section class="block"><div class="promo-block-head"><h2>' + titulo +
      '</h2><span class="promo-note">' + (truncado ? 'Últimas 100 compras · ' : '') + 'Hora de Ciudad de México</span></div>' +
      (compras.length ? '<ul class="individual-compras">' + compras.map((compra) => {
        const nombre = compra.nombre || compra.email || 'Comprador sin identificar';
        const correo = compra.email && compra.email !== nombre ? '<small>' + escapeHTML(compra.email) + '</small>' : '';
        return '<li><div><strong>' + escapeHTML(nombre) + '</strong>' + correo +
          '<small>' + escapeHTML(curso(compra.slug)) + '</small></div>' +
          '<div><strong>' + escapeHTML(montoCompra(compra.montoPagadoCentavos, compra.moneda)) + '</strong>' +
          '<small>Compra · ' + escapeHTML(estadoCompra(compra.estado)) + '</small>' +
          (mostrarAcceso ? '<small>Acceso · ' + estadoAcceso(compra.acceso) + '</small>' : '') + '</div>' +
          '<div>' + fechaHora(compra.fechaCompra) + '<small class="individual-session">' + escapeHTML(compra.sessionId || compra.id) + '</small></div></li>';
      }).join('') + '</ul>' : '<p class="promo-note">No se encontraron compras de cursos con estos datos.</p>') + '</section>';
  }

  function tablaAccesos(cuentas) {
    const accesos = cuentas.flatMap((cuenta) => (cuenta.accesos || []).map((a) => ({ cuenta, acceso: a })));
    return '<section class="block"><div class="promo-block-head"><h2>Accesos encontrados</h2></div>' +
      (accesos.length ? '<ul class="individual-compras">' + accesos.map(({ cuenta, acceso }) =>
        '<li><div><strong>' + escapeHTML(curso(acceso.slug)) + '</strong><small>' + escapeHTML(cuenta.email) + '</small></div>' +
        '<div><strong>' + estadoAcceso(acceso) + '</strong><small>' +
        (acceso.origen === 'regalo' ? 'Curso de regalo' : cuenta.sintetico ? 'Compra pendiente de vincular' : 'Cuenta del aula') +
        '</small></div><div>' + fechaHora(acceso.fechaCompra) + '</div></li>'
      ).join('') + '</ul>' : '<p class="promo-note">No hay accesos registrados para esta búsqueda.</p>') + '</section>';
  }

  function mostrarCompras(contenedor) {
    contenedor.innerHTML = '<form class="block promo-filters individual-form">' +
      '<label>Buscar por correo o sesión de Stripe<input type="search" name="buscar" placeholder="alumno@ejemplo.com o cs_…" maxlength="254"></label>' +
      '<label>Curso<select name="curso"><option value="">Todos los cursos</option>' +
      Object.entries(CURSOS).map(([slug, nombre]) => '<option value="' + slug + '">' + nombre + '</option>').join('') +
      '</select></label><div class="individual-botones"><button class="action-btn action-btn--gold" type="submit">Consultar</button>' +
      '<button class="action-btn action-btn--ghost" type="button" data-recientes>Ver recientes</button></div>' +
      '</form><div class="promo-report" data-compras-resultados></div>';
    const form = contenedor.querySelector('form');
    const resultados = contenedor.querySelector('[data-compras-resultados]');
    const buscar = form.elements.buscar;
    const filtroCurso = form.elements.curso;
    let controller;

    async function cargar() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const texto = buscar.value.trim();
      const slug = filtroCurso.value;
      const params = new URLSearchParams();
      if (texto) {
        if (/^cs_[a-zA-Z0-9_]{1,150}$/.test(texto)) params.set('sessionId', texto);
        else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(texto)) params.set('email', texto.toLowerCase());
        else {
          resultados.innerHTML = '<p class="block promo-note" role="alert">Ingresa un correo completo o el identificador de la sesión de Stripe.</p>';
          return;
        }
      } else if (slug) params.set('slug', slug);
      resultados.innerHTML = '<p class="block promo-note" role="status">Cargando compras…</p>';
      try {
        const data = await api(texto ? 'buscar' : 'compras', params, signal);
        if (signal.aborted || !resultados.isConnected) return;
        const compras = (data.compras || []).filter((compra) => !slug || compra.slug === slug);
        const cuentas = (data.cuentas || []).map((cuenta) => {
          if (!slug) return cuenta;
          return { ...cuenta, accesos: (cuenta.accesos || []).filter((a) => a.slug === slug) };
        });
        resultados.innerHTML = tablaCompras(texto ? 'Compras encontradas' : 'Compras recientes', compras, {
          truncado: data.truncado, mostrarAcceso: !texto,
        }) + (texto ? tablaAccesos(cuentas) : '');
      } catch (error) {
        if (signal.aborted || !resultados.isConnected) return;
        resultados.textContent = '';
        const p = document.createElement('p');
        p.className = 'block promo-note';
        p.setAttribute('role', 'alert');
        p.textContent = error.faltaSesion ? error.message : 'No pudimos cargar las compras. Pulsa Consultar para reintentar.';
        resultados.append(p);
      }
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); cargar(); });
    filtroCurso.addEventListener('change', cargar);
    form.querySelector('[data-recientes]').onclick = () => { buscar.value = ''; cargar(); };
    cargar();
  }

  window.abrirCursosIndividuales = function (tab) {
    vista = tab === 'actividad' ? 'actividad' : 'compras';
    navigateTo('cursosIndividuales');
  };

  PAGES.cursosIndividuales = function () {
    const contenedor = document.getElementById('content');
    contenedor.innerHTML = '<section class="promo-report"><div class="page-header"><h1>Cursos individuales</h1></div>' +
      '<div class="individual-tabs" role="tablist" aria-label="Cursos individuales">' +
      '<button type="button" id="individual-tab-compras" role="tab" data-tab="compras" aria-controls="individual-panel">Compras y accesos</button>' +
      '<button type="button" id="individual-tab-actividad" role="tab" data-tab="actividad" aria-controls="individual-panel">Actividad</button></div>' +
      '<div id="individual-panel" class="promo-report" role="tabpanel"></div></section>';
    const tabs = Array.from(contenedor.querySelectorAll('[role=tab]'));
    const panel = contenedor.querySelector('#individual-panel');

    function seleccionar(tab) {
      vista = tab;
      tabs.forEach((boton) => {
        const activa = boton.dataset.tab === tab;
        boton.setAttribute('aria-selected', String(activa));
        boton.tabIndex = activa ? 0 : -1;
        if (activa) panel.setAttribute('aria-labelledby', boton.id);
      });
      panel.replaceChildren();
      if (tab === 'actividad') window.renderActividadCursos(panel);
      else mostrarCompras(panel);
    }

    tabs.forEach((boton, i) => {
      boton.onclick = () => { if (boton.dataset.tab !== vista) seleccionar(boton.dataset.tab); };
      boton.onkeydown = (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const otro = tabs[1 - i];
        seleccionar(otro.dataset.tab);
        otro.focus();
      };
    });
    seleccionar(vista);
  };
})();

