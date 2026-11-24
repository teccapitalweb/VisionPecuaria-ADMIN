(() => {
  const API = 'https://visionpecuaria-webhook-production.up.railway.app';
  const METRICAS = [
    { tipo: 'enlace_abierto', titulo: 'Enlaces abiertos', corto: 'Enlaces', estilo: 'promo-link' },
    { tipo: 'video_reproducido', titulo: 'Reproducciones del video', corto: 'Videos', estilo: 'promo-video' },
    { tipo: 'checkout_creado', titulo: 'Sesiones de Stripe creadas', corto: 'Sesiones Stripe', estilo: 'promo-stripe' },
    { tipo: 'checkout_montado', titulo: 'Formularios iniciados', corto: 'Formularios', estilo: 'promo-mounted' },
  ];
  const CURSOS = {
    'gallinas-de-postura': 'Gallinas de Postura',
    'embutidos-artesanales': 'Embutidos Artesanales y Chorizos',
  };
  const formatoFechaHora = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23',
  });
  const formatoDia = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const numero = new Intl.NumberFormat('es-MX');
  let filtros = { oferta: '', dias: '30' };
  let ofertas = [];

  const contar = (valor) => Math.max(0, Math.floor(Number(valor) || 0));
  const formatoConteo = (valor) => numero.format(contar(valor));
  const curso = (slug) => CURSOS[slug] ?? slug;
  const ruta = (oferta) => escapeHTML(curso(oferta.origenSlug)) + ' → ' + escapeHTML(curso(oferta.destinoSlug));
  const clave = (oferta) => oferta.origenSlug + '|' + oferta.destinoSlug;

  function fechaHora(valor) {
    const fecha = new Date(valor || '');
    if (!Number.isFinite(fecha.getTime())) return 'Sin fecha';
    const iso = fecha.toISOString();
    return '<time datetime="' + iso + '">' + formatoFechaHora.format(fecha) + '</time>';
  }

  function identidad(persona, ultimaActividad = '') {
    const nombre = persona.nombre || persona.email || 'Cuenta sin nombre';
    const detalle = persona.email && persona.email !== nombre ? '<small>' + escapeHTML(persona.email) + '</small>' : '';
    return '<div class="promo-person"><strong>' + escapeHTML(nombre) + '</strong>' + detalle + ultimaActividad + '</div>';
  }

  function pintarLista(root, items, fila, etiqueta, sinDatos) {
    if (!items.length) {
      root.innerHTML = '<p class="promo-note">' + sinDatos + '</p>';
      return;
    }
    const tamano = 20;
    let pagina = 0;
    const paginas = Math.ceil(items.length / tamano);
    const lista = document.createElement('ul');
    lista.className = 'promo-list';
    const controles = document.createElement('div');
    controles.className = 'promo-page-controls';
    controles.innerHTML = '<span class="promo-note" role="status"></span><div><button type="button" class="action-btn action-btn--ghost">Anterior</button> <button type="button" class="action-btn action-btn--ghost">Siguiente</button></div>';
    root.replaceChildren(lista);
    if (paginas > 1) root.append(controles);
    const [anterior, siguiente] = controles.querySelectorAll('button');
    const estado = controles.querySelector('[role=status]');
    function pintarPagina() {
      const inicio = pagina * tamano;
      lista.innerHTML = items.slice(inicio, inicio + tamano).map(fila).join('');
      estado.textContent = (inicio + 1) + '–' + Math.min(inicio + tamano, items.length) + ' de ' + items.length + ' ' + etiqueta;
      anterior.disabled = pagina === 0;
      siguiente.disabled = pagina === paginas - 1;
    }
    anterior.onclick = () => { pagina--; pintarPagina(); };
    siguiente.onclick = () => { pagina++; pintarPagina(); };
    pintarPagina();
  }

  function pintarGrafica(root, datosSerie) {
    const serie = datosSerie.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) && Number.isFinite(Date.parse(x.fecha)));
    const escala = Math.max(1, ...serie.map((d) => METRICAS.reduce((suma, m) => suma + contar(d[m.tipo]), 0)));
    if (escala === 1 && serie.every((d) => METRICAS.every((m) => !contar(d[m.tipo])))) {
      root.innerHTML = '<p class="promo-note">La gráfica aparecerá cuando se registre actividad.</p>';
      return;
    }
    const resumen = (d) => METRICAS.map((m) => m.corto + ' ' + formatoConteo(d[m.tipo])).join(' · ');
    const dia = (d) => formatoDia.format(new Date(d.fecha + 'T00:00:00Z'));
    root.innerHTML = '<ul class="promo-legend">' + METRICAS.map((m) =>
      '<li><i class="promo-dot ' + m.estilo + '" aria-hidden="true"></i>' + m.corto + '</li>'
    ).join('') + '</ul><div class="promo-chart"><div class="promo-chart-grid">' + serie.map((d, i) => {
      const barras = METRICAS.map((m) => {
        const valor = contar(d[m.tipo]);
        return valor ? '<span class="' + m.estilo + '" style="height:' + (valor * 88 / escala).toFixed(2) + 'px"></span>' : '';
      }).join('');
      const etiqueta = escapeHTML(dia(d));
      return '<button type="button" data-dia="' + i + '" class="promo-day" aria-label="' + etiqueta + ' · ' + resumen(d) +
        '" aria-pressed="false"><span class="promo-plot" aria-hidden="true">' + barras + '</span><span class="promo-day-label">' +
        etiqueta + '</span></button>';
    }).join('') + '</div></div><p class="promo-day-detail" aria-live="polite"></p>';
    const botones = root.querySelectorAll('[data-dia]');
    const detalle = root.querySelector('.promo-day-detail');
    function seleccionar(indice) {
      botones.forEach((b, i) => b.setAttribute('aria-pressed', String(i === indice)));
      const d = serie[indice];
      detalle.innerHTML = '<strong>' + escapeHTML(dia(d)) + '</strong> · ' + resumen(d);
    }
    botones.forEach((b, i) => b.addEventListener('click', () => seleccionar(i)));
    const indice = serie.findLastIndex((d) => METRICAS.some((m) => contar(d[m.tipo]) > 0));
    seleccionar(indice);
    const grafica = root.querySelector('.promo-chart');
    grafica.scrollLeft = grafica.scrollWidth;
  }

  function pintarDatos(root, data) {
    root.innerHTML = (data.truncado
      ? '<p class="promo-note promo-warning">El periodo supera el límite de registros. Acorta el rango para ver el total de un periodo más pequeño.</p>'
      : '') +
      '<div class="promo-kpis" aria-label="Totales del periodo">' + METRICAS.map((m) => {
        const total = data.totales?.[m.tipo] || {};
        const personas = contar(total.personas);
        return '<article class="kpi"><div class="kpi-head"><span class="promo-dot ' + m.estilo + '" aria-hidden="true"></span>' +
          '<h2 class="kpi-label">' + m.titulo + '</h2></div><p class="kpi-value">' + formatoConteo(total.eventos) + '</p>' +
          '<p class="kpi-detail">' + formatoConteo(personas) + ' ' + (personas === 1 ? 'persona' : 'personas') + '</p></article>';
      }).join('') + '</div>' +
      '<p class="promo-note">Los formularios iniciados se registran cuando el panel monta Stripe. La carga final y el pago se verifican aparte.</p>' +
      '<section class="block"><div class="promo-block-head"><h2>Actividad por día</h2><span class="promo-note">Hora de Ciudad de México</span></div><div data-grafica></div></section>' +
      '<section class="block"><div class="promo-block-head"><h2>Actividad por persona</h2>' +
      (data.personasTruncadas ? '<span class="promo-note">Se muestran hasta 200 cuentas</span>' : '') +
      '</div><div data-personas></div></section>' +
      '<section class="block"><div class="promo-block-head"><h2>Eventos recientes</h2><span class="promo-note">' +
      (data.detalleTruncado ? 'Últimos 200 eventos · ' : '') + 'Hora de Ciudad de México</span></div><div data-eventos></div></section>';
    pintarGrafica(root.querySelector('[data-grafica]'), data.serie || []);
    pintarLista(root.querySelector('[data-personas]'), data.personas || [], (p) =>
      '<li>' + identidad(p, p.ultimoEn ? '<small>Última actividad ' + fechaHora(p.ultimoEn) + '</small>' : '') +
      '<dl class="promo-totals">' + METRICAS.map((m) =>
        '<div><dt>' + m.corto + '</dt><dd>' + formatoConteo(p.totales?.[m.tipo]) + '</dd></div>'
      ).join('') + '</dl></li>',
    'cuentas', 'Aún no se registra actividad de alumnos en este periodo.');
    pintarLista(root.querySelector('[data-eventos]'), data.eventos || [], (e) => {
      const metrica = METRICAS.find((m) => m.tipo === e.tipo);
      const etiqueta = metrica ? metrica.titulo : 'Actividad';
      const estilo = metrica ? metrica.estilo : '';
      return '<li>' + identidad(e) + '<div><div class="promo-type"><span class="promo-dot ' + estilo + '" aria-hidden="true"></span>' +
        etiqueta + '</div><span class="promo-route">' + ruta(e) + '</span></div>' + fechaHora(e.fechaEn) + '</li>';
    }, 'eventos', 'Aún no hay eventos para esta búsqueda.');
  }

  PAGES.promociones = function () {
    const reporte = document.createElement('section');
    reporte.className = 'promo-report';
    reporte.innerHTML = '<div class="page-header"><div><h1>Promociones de cursos</h1><p>Seguimiento de ofertas para alumnos de Visión Pecuaria</p></div></div>' +
      '<form class="block promo-filters"><label>Promoción<select name="oferta"></select></label>' +
      '<label>Periodo<select name="dias">' + [7, 14, 30, 60, 90].map((d) => '<option value="' + d + '">Últimos ' + d + ' días</option>').join('') +
      '</select></label><button class="action-btn action-btn--ghost" type="submit">Actualizar</button></form>' +
      '<div class="promo-report" data-resultado></div>';
    document.getElementById('content').replaceChildren(reporte);
    const form = reporte.querySelector('form');
    const resultado = reporte.querySelector('[data-resultado]');
    const oferta = form.elements.oferta;
    const dias = form.elements.dias;
    let controller;

    function pintarOpciones() {
      oferta.innerHTML = '<option value="">Todas las promociones</option>' + ofertas.map((item) =>
        '<option value="' + escapeHTML(clave(item)) + '">' + ruta(item) + '</option>'
      ).join('');
      oferta.value = filtros.oferta;
      dias.value = filtros.dias;
    }

    async function cargar() {
      filtros = { oferta: oferta.value, dias: dias.value };
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const params = new URLSearchParams({ dias: filtros.dias });
      const seleccion = ofertas.find((item) => clave(item) === filtros.oferta);
      if (seleccion) {
        params.set('origenSlug', seleccion.origenSlug);
        params.set('destinoSlug', seleccion.destinoSlug);
      }
      resultado.innerHTML = '<p class="block promo-note" role="status">Cargando actividad…</p>';
      try {
        const user = auth.currentUser;
        if (!user) throw new Error('sesion');
        const token = await user.getIdToken();
        const res = await fetch(API + '/admin/cursos/promociones/metricas?' + params, {
          headers: { Authorization: 'Bearer ' + token }, signal, cache: 'no-store',
        });
        if (res.status === 401 || res.status === 403) throw new Error('sesion');
        if (!res.ok) throw new Error('red');
        const data = await res.json();
        if (signal.aborted || !reporte.isConnected) return;
        ofertas = (data.ofertas || []).filter((x) => x.origenSlug && x.destinoSlug);
        if (filtros.oferta && !ofertas.some((x) => clave(x) === filtros.oferta)) filtros.oferta = '';
        pintarOpciones();
        pintarDatos(resultado, data);
      } catch (error) {
        if (signal.aborted || !reporte.isConnected) return;
        const mensaje = error.message === 'sesion'
          ? 'Se requiere una sesión de administrador para ver este informe.'
          : 'No pudimos cargar la actividad. Pulsa Actualizar para volver a intentar.';
        resultado.innerHTML = '<p class="block promo-note" role="alert">' + mensaje + '</p>';
      }
    }

    form.addEventListener('submit', (event) => { event.preventDefault(); cargar(); });
    form.addEventListener('change', cargar);
    pintarOpciones();
    cargar();
  };
})();

