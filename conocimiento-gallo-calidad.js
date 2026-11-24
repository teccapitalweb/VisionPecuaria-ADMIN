(() => {
  const REVISION = '/admin/gallo-ia/calidad';
  const EVALUACIONES = '/admin/gallo-ia/evaluaciones';
  const FILTROS = [
    ['', 'Todas las revisiones'], ['util', 'Útiles'], ['no_util', 'Por corregir'], ['sin_evidencia', 'Sin evidencia'],
  ];
  const entero = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const usd = new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'USD', currencyDisplay: 'code', maximumFractionDigits: 6,
  });

  function consumoDiario(consumo, esc) {
    if (!consumo) return '';
    const cantidad = (valor) => entero.format(Math.max(0, Number(valor) || 0));
    const costo = (micro) => usd.format(Math.max(0, Number(micro) || 0) / 1e6);
    const solicitudes = cantidad(consumo.solicitudes) + (consumo.maxSolicitudes > 0 ? ' de ' + cantidad(consumo.maxSolicitudes) : '');
    const presupuesto = consumo.limiteMicroUSD > 0 ? ' · Límite ' + costo(consumo.limiteMicroUSD) : '';
    const aviso = consumo.avisoLimiteEn ? 'Se alcanzó un límite diario.' : consumo.aviso80En ? 'El consumo se acerca al límite diario.' : '';
    return '<section class="gk-card gk-stack"><h2>Consumo del modelo</h2><p class="gk-help">Periodo ' + esc(consumo.dia) +
      ' · Costo aproximado</p><dl class="gk-meta"><div><dt>Solicitudes</dt><dd>' + esc(solicitudes) +
      '</dd></div><div><dt>Costo estimado</dt><dd>' + esc(costo(consumo.costoEstimadoMicroUSD) + presupuesto) +
      '</dd></div><div><dt>Tokens</dt><dd>' + esc(cantidad(consumo.tokensEntrada)) + ' de entrada · ' +
      esc(cantidad(consumo.tokensSalida)) + ' de salida</dd></div></dl>' +
      (aviso ? '<p class="gk-status">' + aviso + '</p>' : '') + '</section>';
  }

  function categorias(item) {
    const tags = [];
    if (item.voto === 'util') tags.push('<span class="gk-pill" data-estado="aprobado">Útil</span>');
    if (item.voto === 'no_util') tags.push('<span class="gk-pill" data-estado="rechazado">No útil</span>');
    if (item.sinEvidencia) tags.push('<span class="gk-pill" data-estado="pendiente">Sin evidencia suficiente</span>');
    return tags.join('');
  }

  function preguntasRepetidas(items) {
    const porPregunta = new Map();
    for (const item of items) {
      if (!item.pregunta || !(item.sinEvidencia || item.voto === 'no_util')) continue;
      const clave = item.pregunta.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es-MX')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (!clave) continue;
      if (!porPregunta.has(clave)) porPregunta.set(clave, { pregunta: item.pregunta, total: 0 });
      porPregunta.get(clave).total++;
    }
    return Array.from(porPregunta.values()).filter((item) => item.total > 1).sort((a,b) => b.total - a.total).slice(0, 5);
  }

  function pintarRevision(raiz, datos, helpers) {
    const { esc, fechaHora, nombreCurso, prepararCorreccion } = helpers;
    const items = datos.items || [];
    raiz.innerHTML = consumoDiario(datos.consumo, esc) + '<div class="gk-overview">' + [
      ['Respuestas útiles', datos.conteos?.util], ['Respuestas no útiles', datos.conteos?.no_util],
      ['Sin evidencia', datos.conteos?.sinEvidencia],
    ].map(([titulo, conteo]) => '<article class="gk-card"><strong>' + esc(Number(conteo) || '0') +
      '</strong><p class="gk-help">' + titulo + '</p></article>').join('') + '</div>' +
      '<section class="gk-card gk-stack"><div class="gk-toolbar"><div><h2>Respuestas para revisión</h2>' +
      '<p class="gk-help">Últimos ' + esc(Number(datos.retencionDias) || 30) +
      ' días. Solo se muestra el contenido que el alumno compartió para revisión.</p></div>' +
      '<label class="gk-label">Filtrar<select class="gk-control" name="revision">' +
      FILTROS.map(([valor, etiqueta]) => '<option value="' + esc(valor) + '">' + etiqueta + '</option>').join('') + '</select></label></div>' +
      '<section class="gk-stack" data-repetidas hidden><h3>Preguntas que requieren atención</h3><ul class="gk-list"></ul></section>' +
      '<div class="gk-details-scroll" data-revisiones></div></section>';

    const repetidas = preguntasRepetidas(items);
    if (repetidas.length) {
      const recurrentes = raiz.querySelector('[data-repetidas]');
      recurrentes.querySelector('ul').innerHTML = repetidas.map((item) =>
        '<li class="gk-result gk-note">' + esc(item.pregunta) + ' <strong>· ' + esc(item.total) + ' registros</strong></li>'
      ).join('');
      recurrentes.hidden = false;
    }
    const filtro = raiz.querySelector('select');
    const lista = raiz.querySelector('[data-revisiones]');
    function filtrar() {
      const valor = filtro.value;
      const visibles = items.map((item, index) => ({ item, index })).filter(({ item }) =>
        !valor || (valor === 'sin_evidencia' ? item.sinEvidencia : item.voto === valor)
      );
      lista.innerHTML = visibles.length ? visibles.map(({ item, index }) => {
        const compartir = Boolean(item.pregunta || item.respuesta);
        const encabezado = item.pregunta || (compartir ? 'Respuesta compartida' : 'Actividad sin contenido compartido');
        const meta = [nombreCurso(item.cursoSlug), fechaHora(item.creadoEn), item.modo, item.version ? 'Versión ' + item.version : null]
          .filter(Boolean).map(esc).join(' · ');
        return '<details class="gk-review"><summary><strong>' + esc(encabezado) + '</strong>' +
          '<span class="gk-tags">' + categorias(item) + '</span></summary><div class="gk-stack">' +
          '<p class="gk-help">' + meta + '</p>' +
          (item.respuesta ? '<p class="gk-extract">' + esc(item.respuesta) + '</p>' : '') +
          (item.pregunta ? '<p><button type="button" class="gk-btn" data-corregir="' + index + '">Preparar corrección</button></p>' : '') +
          '</div></details>';
      }).join('') : '<p class="gk-note">No hay registros para este filtro.</p>';
    }
    lista.onclick = (event) => {
      const boton = event.target.closest('[data-corregir]');
      const pregunta = boton ? items[Number(boton.dataset.corregir)]?.pregunta : null;
      if (pregunta) prepararCorreccion(pregunta);
    };
    filtro.onchange = filtrar;
    filtrar();
  }

  function pintarEvaluaciones(raiz, datos, helpers) {
    const { api, esc } = helpers;
    raiz.innerHTML = '<section class="gk-card gk-stack"><h2>Evaluaciones de referencia</h2>' +
      '<p class="gk-note">Comprueba el comportamiento de la guía de Mi Gallo IA con preguntas de referencia.</p>' +
      '<p class="gk-help">Versión ' + esc(datos.suiteVersion || 'sin registro') + ' · ' + esc(datos.casos?.length || '0') + ' casos</p>' +
      '<div class="gk-actions"><button type="button" class="gk-btn gk-btn--primary" data-ejecutar>Ejecutar evaluación</button></div>' +
      '<p class="gk-status" role="status" data-evaluacion-estado></p><div data-resultados></div>' +
      '<details><summary>Preguntas de referencia</summary><ol class="gk-list">' +
      (datos.casos || []).map((caso) => '<li class="gk-review"><strong>' + esc(caso.pregunta) +
        '</strong><p class="gk-note">' + esc(caso.objetivo) + '</p></li>').join('') +
      '</ol></details></section>';
    const boton = raiz.querySelector('[data-ejecutar]');
    const aviso = raiz.querySelector('[data-evaluacion-estado]');
    const resultados = raiz.querySelector('[data-resultados]');
    boton.onclick = async () => {
      boton.disabled = true;
      aviso.dataset.error = 'false';
      aviso.setAttribute('role', 'status');
      aviso.textContent = 'Ejecutando la evaluación…';
      resultados.replaceChildren();
      try {
        const respuesta = await api(EVALUACIONES, { body: {} });
        if (!resultados.isConnected) return;
        aviso.textContent = respuesta.aprobadas + ' de ' + respuesta.total +
          ' comprobaciones satisfactorias · Versión ' + respuesta.suiteVersion;
        resultados.innerHTML = '<ol class="gk-list">' + (respuesta.resultados || []).map((item) =>
          '<li class="gk-result"><details><summary><span class="gk-pill" data-estado="' +
          (item.satisfactorio ? 'aprobado">Cumple' : 'pendiente">Por revisar') + '</span> ' +
          esc(datos.casos?.find((caso) => caso.id === item.id)?.pregunta || item.id) + '</summary>' +
          '<p class="gk-note">' + esc(item.objetivo) + '</p>' +
          (item.respuesta ? '<p class="gk-extract">' + esc(item.respuesta) + '</p>' : '') + '</details></li>'
        ).join('') + '</ol>';
      } catch (error) {
        if (aviso.isConnected) {
          aviso.dataset.error = 'true';
          aviso.setAttribute('role', 'alert');
          aviso.textContent = error.message;
        }
      } finally { boton.disabled = false; }
    };
  }

  window.renderCalidadGallo = function (panel, helpers) {
    panel.innerHTML = '<section class="gk-card gk-stack"><div class="gk-toolbar"><div><h2>Calidad de respuestas</h2>' +
      '<p class="gk-note">Revisa valoraciones y prepara correcciones como fuentes pendientes.</p></div>' +
      '<button type="button" class="gk-btn" data-actualizar>Actualizar</button></div></section>' +
      '<div class="gk" data-revision><p class="gk-note" role="status">Cargando revisiones…</p></div>' +
      '<div class="gk" data-evaluaciones><p class="gk-note" role="status">Cargando evaluaciones…</p></div>';
    const revision = panel.querySelector('[data-revision]');
    const evaluaciones = panel.querySelector('[data-evaluaciones]');
    let controller;

    function cargar() {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      const cargarBloque = (root, ruta, render) => helpers.api(ruta, { signal }).then((datos) => {
        if (!signal.aborted && root.isConnected) render(root, datos, helpers);
      }).catch((error) => {
        if (signal.aborted || !root.isConnected) return;
        const mensaje = document.createElement('p');
        mensaje.className = 'gk-status';
        mensaje.dataset.error = 'true';
        mensaje.setAttribute('role', 'alert');
        mensaje.textContent = error.message;
        root.replaceChildren(mensaje);
      });
      cargarBloque(revision, REVISION, pintarRevision);
      cargarBloque(evaluaciones, EVALUACIONES, pintarEvaluaciones);
    }

    panel.querySelector('[data-actualizar]').onclick = cargar;
    cargar();
  };
})();
