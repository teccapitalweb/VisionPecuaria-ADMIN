(() => {
  const API = 'https://visionpecuaria-webhook-production.up.railway.app';
  const BIBLIOTECA = '/admin/gallo/conocimiento';
  const TIPOS = {
    archivo: 'Archivo PDF, DOCX o TXT',
    texto: 'Texto técnico',
    qa: 'Pregunta y respuesta verificadas',
    url: 'Enlace con extracto autorizado',
  };
  const ESPECIALIDADES = {
    avicultura: 'Avicultura', 'pollos-engorda': 'Pollos de engorda', 'gallinas-postura': 'Gallinas de postura',
    'incubacion-sexaje': 'Incubación y sexaje avícola', 'bovinos-leche-carne': 'Bovinos de leche y carne',
    porcicultura: 'Porcicultura', ovinocultura: 'Ovinocultura', caprinocultura: 'Caprinocultura',
    nutricion: 'Nutrición animal', reproduccion: 'Reproducción',
    'bioseguridad-sanidad': 'Bioseguridad y sanidad animal', 'administracion-economia': 'Administración y economía pecuaria',
  };
  const ESTADOS = {
    pendiente: 'Pendiente de revisión', aprobado: 'Aprobada', rechazado: 'Rechazada',
    desactivado: 'Desactivada', eliminado: 'Eliminada',
  };
  const INDICES = {
    pendiente: 'Indexación pendiente', lexico: 'Índice por palabras', semantico: 'Índice semántico',
    desactivado: 'Fuera del índice',
  };
  const ACCIONES = {
    aprobar: { label: 'Aprobar versión', detalle: 'El asistente podrá utilizar esta versión conforme a su visibilidad y permisos.' },
    rechazar: { label: 'Rechazar versión', detalle: 'La revisión se marcará como rechazada y quedará en el historial.' },
    desactivar: { label: 'Desactivar fuente', detalle: 'La fuente dejará de participar en las consultas del asistente.' },
    eliminar: { label: 'Eliminar fuente', detalle: 'La fuente se retirará de la biblioteca activa. Esta acción quedará asentada en la bitácora.' },
  };
  const CURSOS = {
    'gallinas-de-postura': 'Gallinas de Postura',
    'embutidos-artesanales': 'Embutidos Artesanales y Chorizos',
    'sexaje-avicola': 'Sexaje Avícola',
  };
  const FECHA = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23',
  });
  const MAX_ARCHIVO = 2 * 1024 * 1024;
  const esc = escapeHTML;
  let pestaña = 'fuentes';

  async function api(path, { body, signal } = {}) {
    if (!auth.currentUser) throw new Error('Inicia sesión con una cuenta administradora.');
    const token = await auth.currentUser.getIdToken();
    const headers = { Authorization: 'Bearer ' + token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers, signal, cache: 'no-store', body: body === undefined ? undefined : JSON.stringify(body),
    });
    const datos = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new Error('Se requiere una sesión de administrador para continuar.');
    if (!res.ok) throw Object.assign(new Error(datos.error || 'No pudimos completar la solicitud.'), {
      codigo: datos.codigo, fuenteId: datos.fuenteId, status: res.status,
    });
    return datos;
  }

  function fechaHora(valor) {
    const fecha = toDate(valor);
    return fecha ? FECHA.format(fecha) : 'Sin registro';
  }

  const nombreCurso = (slug) => CURSOS[slug] || slug || 'Todos los cursos';
  const actor = (persona) => (typeof persona === 'object' && persona
    ? persona.nombre || persona.email || persona.uid : persona) || 'Sin registro';
  const opciones = (valores) => Object.entries(valores).map(([valor, texto]) =>
    '<option value="' + esc(valor) + '">' + esc(texto) + '</option>'
  ).join('');
  const estado = (fuente) => '<span class="gk-pill" data-estado="' + esc(fuente.estado) + '">' +
    esc(ESTADOS[fuente.estado] || fuente.estado || 'Sin estado') + '</span>';
  const campo = (titulo, valor) => '<div><dt>' + esc(titulo) + '</dt><dd>' + esc(valor || '—') + '</dd></div>';
  const claseError = (mensaje) => '<p class="gk-status" data-error="true" role="alert">' + esc(mensaje) + '</p>';

  function mostrarEstado(nodo, mensaje, error = false) {
    nodo.dataset.error = String(error);
    nodo.textContent = mensaje;
    nodo.setAttribute('role', error ? 'alert' : 'status');
  }

  function modal(raiz, titulo) {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'gk-slide';
    dialogo.setAttribute('aria-label', titulo);
    dialogo.innerHTML = '<header class="gk-slide-head"><h2>' + esc(titulo) +
      '</h2><button type="button" class="gk-btn" data-cerrar>Cerrar</button></header><div class="gk-slide-body"></div>';
    raiz.append(dialogo);
    dialogo.querySelector('[data-cerrar]').onclick = () => dialogo.close();
    dialogo.addEventListener('close', () => dialogo.remove(), { once: true });
    dialogo.showModal();
    return { dialogo, cuerpo: dialogo.querySelector('.gk-slide-body') };
  }

  const rutaFuente = (id) => BIBLIOTECA + '/' + encodeURIComponent(id);

  function estadoFuente(fuente) {
    const activa = Number(fuente.versionActiva) > 0 ? 'Versión activa ' + fuente.versionActiva : 'Sin versión activa';
    const indice = fuente.estado === 'aprobado' && fuente.visibilidad === 'privada' ? 'desactivado' : fuente.indice;
    return '<div class="gk-tags">' + estado(fuente) + '<span class="gk-pill">' +
      esc(INDICES[indice] || indice || 'Sin índice') + '</span>' +
      '<span class="gk-pill">' + esc(activa) + '</span></div>';
  }

  function mostrarFuentes(panel, contexto, mensaje) {
    panel.innerHTML = '<div class="gk-card gk-toolbar">' +
      '<label class="gk-label">Buscar fuente<input type="search" class="gk-control" name="buscar" placeholder="Título, autor u origen" maxlength="150"></label>' +
      '<label class="gk-label">Especialidad<select class="gk-control" name="especialidad"><option value="">Todas</option>' + opciones(ESPECIALIDADES) + '</select></label>' +
      '<label class="gk-label">Estado<select class="gk-control" name="estado"><option value="">Todos</option>' + opciones(ESTADOS) + '</select></label>' +
      '<div class="gk-actions"><button type="button" class="gk-btn gk-btn--primary" data-nueva>Nueva fuente</button>' +
      '<button type="button" class="gk-btn" data-refrescar>Actualizar</button></div></div>' +
      '<section class="gk-card gk-stack" aria-labelledby="gk-fuentes-titulo"><h2 id="gk-fuentes-titulo">Biblioteca</h2>' +
      '<p class="gk-status" data-carga role="status"></p><ul class="gk-list" data-fuentes></ul></section>';
    const estadoCarga = panel.querySelector('[data-carga]');
    const lista = panel.querySelector('[data-fuentes]');
    let fuentes = [];
    let controller;

    function listar() {
      const q = panel.querySelector('[name=buscar]').value.trim().toLocaleLowerCase('es-MX');
      const especialidad = panel.querySelector('[name=especialidad]').value;
      const estadoFiltro = panel.querySelector('[name=estado]').value;
      const visibles = fuentes.filter((fuente) => (!especialidad || fuente.especialidad === especialidad) &&
        (!estadoFiltro || fuente.estado === estadoFiltro) &&
        (!q || [fuente.titulo, fuente.autor, fuente.origen].filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(q)));
      lista.innerHTML = visibles.length ? visibles.map((fuente) => {
        const meta = [ESPECIALIDADES[fuente.especialidad] || fuente.especialidad, TIPOS[fuente.tipo], 'Versión ' + fuente.version].filter(Boolean).join(' · ');
        return '<li class="gk-source"><div><strong>' + esc(fuente.titulo) + '</strong><p class="gk-help">' +
          esc(meta) + '</p></div>' + estadoFuente(fuente) + '<button type="button" class="gk-btn" data-ver="' +
          esc(fuente.id) + '">Revisar</button></li>';
      }).join('') : '<li class="gk-note">No hay fuentes para estos filtros.</li>';
    }

    async function cargar(mensaje = '') {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      mostrarEstado(estadoCarga, 'Cargando fuentes…');
      try {
        const datos = await api(BIBLIOTECA, { signal });
        if (signal.aborted || !lista.isConnected) return;
        fuentes = datos.fuentes || [];
        listar();
        mostrarEstado(estadoCarga, mensaje || (datos.truncado ? 'Se muestran las fuentes actualizadas más recientemente.' : ''));
      } catch (error) {
        if (signal.aborted || !estadoCarga.isConnected) return;
        mostrarEstado(estadoCarga, error.message, true);
      }
    }

    lista.onclick = (event) => {
      const boton = event.target.closest('[data-ver]');
      if (boton) abrirFuente(contexto, boton.dataset.ver);
    };
    panel.querySelector('[name=buscar]').oninput = listar;
    panel.querySelector('[name=especialidad]').onchange = listar;
    panel.querySelector('[name=estado]').onchange = listar;
    panel.querySelector('[data-refrescar]').onclick = () => cargar();
    panel.querySelector('[data-nueva]').onclick = () => editarFuente(contexto);
    contexto.refrescar = cargar;
    cargar(mensaje);
  }

  function urlSegura(valor) {
    try {
      const url = new URL(valor);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  async function abrirFuente(contexto, id) {
    const { dialogo, cuerpo } = modal(contexto.raiz, 'Revisar fuente');
    cuerpo.innerHTML = '<p class="gk-note" role="status">Cargando la revisión…</p>';
    try {
      const { fuente } = await api(rutaFuente(id));
      if (!dialogo.open || !dialogo.isConnected) return;
      mostrarFuente(cuerpo, contexto, dialogo, fuente);
    } catch (error) {
      if (dialogo.open) cuerpo.innerHTML = claseError(error.message);
    }
  }

  function mostrarFuente(cuerpo, contexto, dialogo, fuente) {
    const historial = (fuente.historial || []).map((item) =>
      '<li class="gk-version"><strong>v' + esc(item.version) + ' · ' + esc(ACCIONES[item.accion]?.label ||
        { crear: 'Fuente registrada', editar: 'Revisión preparada' }[item.accion] || ESTADOS[item.estado]) + '</strong>' +
      '<p class="gk-help">' + esc(fechaHora(item.fechaEn)) + ' · ' + esc(actor(item.por)) + '</p>' +
      (item.motivo ? '<p class="gk-note">' + esc(item.motivo) + '</p>' : '') + '</li>').join('');
    const url = urlSegura(fuente.url);
    const acciones = [];
    if (fuente.estado === 'pendiente') acciones.push('aprobar', 'rechazar');
    if (fuente.estado === 'aprobado' || fuente.versionActiva) acciones.push('desactivar');
    if (fuente.estado !== 'eliminado') acciones.push('eliminar');
    cuerpo.innerHTML = '<div class="gk-stack"><div><h3>' + esc(fuente.titulo) + '</h3><p class="gk-note">Versión ' +
      esc(fuente.version) + ' · ' + esc(TIPOS[fuente.tipo] || fuente.tipo) + '</p></div>' + estadoFuente(fuente) +
      '<dl class="gk-meta">' + campo('Autor', fuente.autor) + campo('Fecha de publicación', fuente.fecha) +
      campo('Origen', fuente.origen) + campo('Especialidad', ESPECIALIDADES[fuente.especialidad] || fuente.especialidad) +
      (fuente.archivoNombre ? campo('Archivo', fuente.archivoNombre) : '') +
      campo('Uso', fuente.visibilidad === 'alumnos' ? nombreCurso(fuente.cursoSlug) : 'Solo administración') +
      campo('Modelo externo', fuente.permitirModeloExterno ? 'Extractos autorizados' : 'Sin autorización') +
      campo('Actualizó', actor(fuente.actualizadoPor)) + campo('Última actualización', fechaHora(fuente.actualizadoEn)) +
      campo('Aprobó última publicación', actor(fuente.aprobadoPor)) + '</dl>' +
      (url ? '<p><a class="gk-btn" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Consultar fuente original</a></p>' : '') +
      (fuente.pregunta ? '<div><h3>Pregunta</h3><p class="gk-extract">' + esc(fuente.pregunta) + '</p></div>' : '') +
      ((fuente.respuesta || fuente.texto) ? '<div><h3>' + (fuente.tipo === 'qa' ? 'Respuesta' : 'Contenido de la versión') +
        '</h3><p class="gk-extract">' + esc(fuente.respuesta || fuente.texto) + '</p></div>' : '') +
      '<details><summary>Historial de cambios</summary>' + (historial ? '<ol class="gk-list">' + historial + '</ol>' : '<p class="gk-help">Sin cambios registrados.</p>') +
      '</details><div class="gk-actions">' +
      (fuente.estado !== 'eliminado' ? '<button type="button" class="gk-btn" data-editar>Editar o reemplazar</button>' : '') +
      acciones.map((accion) => '<button type="button" class="gk-btn' +
        (accion === 'aprobar' ? ' gk-btn--primary' : accion === 'eliminar' ? ' gk-btn--danger' : '') + '" data-accion="' +
        accion + '">' + ACCIONES[accion].label + '</button>').join('') + '</div></div>';
    const editar = cuerpo.querySelector('[data-editar]');
    if (editar) editar.onclick = () => { dialogo.close(); editarFuente(contexto, fuente); };
    cuerpo.querySelectorAll('[data-accion]').forEach((boton) => {
      boton.onclick = () => confirmarFuente(cuerpo, contexto, dialogo, fuente, boton.dataset.accion);
    });
  }

  function confirmarFuente(cuerpo, contexto, dialogo, fuente, accion) {
    const operacion = ACCIONES[accion];
    const razon = accion !== 'aprobar';
    const detalle = accion === 'aprobar' && fuente.visibilidad === 'privada'
      ? 'Esta revisión quedará aprobada para consulta administrativa.' : operacion.detalle;
    cuerpo.innerHTML = '<form class="gk-stack"><h3>' + operacion.label + '</h3><p class="gk-note">' +
      esc(fuente.titulo) + ' · Versión ' + esc(fuente.version) + '</p><p class="gk-note">' + detalle + '</p>' +
      '<label class="gk-label">Motivo' + (razon ? '' : ' (opcional)') +
      '<textarea class="gk-control" name="motivo" maxlength="500"' + (razon ? ' required' : '') + '></textarea></label>' +
      '<p class="gk-status" role="status"></p><div class="gk-actions"><button type="submit" class="gk-btn ' +
      (accion === 'eliminar' ? 'gk-btn--danger' : 'gk-btn--primary') + '">' + operacion.label + '</button>' +
      '<button type="button" class="gk-btn" data-cancelar>Volver a la revisión</button></div></form>';
    const form = cuerpo.querySelector('form');
    const aviso = form.querySelector('.gk-status');
    const boton = form.querySelector('[type=submit]');
    const cancelar = form.querySelector('[data-cancelar]');
    cancelar.onclick = () => mostrarFuente(cuerpo, contexto, dialogo, fuente);
    form.onsubmit = async (event) => {
      event.preventDefault();
      const motivo = form.elements.motivo.value.trim();
      if (razon && !motivo) { mostrarEstado(aviso, 'Escribe el motivo de la acción.', true); return; }
      boton.disabled = true;
      cancelar.disabled = true;
      mostrarEstado(aviso, 'Guardando el cambio…');
      try {
        await api(rutaFuente(fuente.id) + '/estado', { body: { accion, versionEsperada: fuente.version, motivo } });
        if (dialogo.open) dialogo.close();
        contexto.refrescar?.('Se actualizó la fuente.');
      } catch (error) {
        if (form.isConnected) mostrarEstado(aviso, error.message, true);
      } finally { boton.disabled = false; cancelar.disabled = false; }
    };
  }

  function editorHTML(esRevision) {
    return '<form class="gk-stack"><div class="gk-fields">' +
      '<label class="gk-label gk-wide">Título<input class="gk-control" name="titulo" maxlength="160" required></label>' +
      '<label class="gk-label">Tipo de fuente<select class="gk-control" name="tipo">' + opciones(TIPOS) + '</select></label>' +
      '<label class="gk-label">Especialidad<select class="gk-control" name="especialidad" required><option value="">Elige una especialidad</option>' + opciones(ESPECIALIDADES) + '</select></label>' +
      '<label class="gk-label">Autor o institución<input class="gk-control" name="autor" maxlength="180"></label>' +
      '<label class="gk-label">Fecha de publicación<input class="gk-control" name="fecha" maxlength="10" pattern="[0-9]{4}(-[0-9]{2}-[0-9]{2})?" placeholder="AAAA o AAAA-MM-DD"></label>' +
      '<label class="gk-label gk-wide">Origen<input class="gk-control" name="origen" maxlength="500" placeholder="Editorial, institución o sitio de publicación" required></label>' +
      '<label class="gk-label">Visibilidad<select class="gk-control" name="visibilidad"><option value="privada">Solo administración</option><option value="alumnos">Alumnos</option></select></label>' +
      '<label class="gk-label" data-curso>Curso<select class="gk-control" name="cursoSlug"><option value="">Todos los cursos</option>' + opciones(CURSOS) + '</select></label>' +
      '<fieldset class="gk-stack gk-wide gk-fields-source" data-tipo="archivo"><label class="gk-label">Archivo <input class="gk-control" name="archivo" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"><span class="gk-help">Hasta 2 MB. El PDF debe tener texto seleccionable.</span></label>' +
      (esRevision ? '<label class="gk-check" data-conservar><input type="checkbox" name="conservarContenido">Conservar el contenido y actualizar los datos de la fuente</label>' : '') +
      '</fieldset><fieldset class="gk-stack gk-wide gk-fields-source" data-tipo="texto"><label class="gk-label">Texto autorizado<textarea class="gk-control" name="texto" minlength="25" maxlength="160000" required></textarea></label></fieldset>' +
      '<fieldset class="gk-stack gk-wide gk-fields-source" data-tipo="qa"><label class="gk-label">Pregunta<textarea class="gk-control" name="pregunta" maxlength="1000" required></textarea></label>' +
      '<label class="gk-label">Respuesta verificada<textarea class="gk-control" name="respuesta" maxlength="159000" required></textarea></label></fieldset>' +
      '<fieldset class="gk-stack gk-wide gk-fields-source" data-tipo="url"><label class="gk-label">Enlace de la fuente<input class="gk-control" type="url" name="url" maxlength="800" placeholder="https://…" required></label>' +
      '<label class="gk-label">Extracto autorizado<textarea class="gk-control" name="extracto" minlength="25" maxlength="160000" required></textarea></label></fieldset>' +
      '<label class="gk-check gk-wide" data-modelo><input type="checkbox" name="permitirModeloExterno">Autorizo el envío de extractos pertinentes al proveedor del modelo de IA.</label>' +
      '<label class="gk-check gk-wide"><input type="checkbox" name="autorizado" required>Confirmo que Visión Pecuaria tiene permiso para incorporar este contenido.</label></div>' +
      '<p class="gk-note">La fuente quedará pendiente hasta que se apruebe esta versión.</p><p class="gk-status" role="status"></p><div class="gk-actions">' +
      '<button type="submit" class="gk-btn gk-btn--primary">Guardar para revisión</button></div></form>';
  }

  function leerBase64(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result).split(',')[1]);
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      lector.readAsDataURL(archivo);
    });
  }

  async function datosEditor(form, fuente) {
    const valores = new FormData(form);
    const valor = (campo) => String(valores.get(campo) || '').trim();
    const tipo = valor('tipo');
    const payload = {
      tipo, titulo: valor('titulo'), especialidad: valor('especialidad'),
      autor: valor('autor'), fecha: valor('fecha'), origen: valor('origen'), visibilidad: valor('visibilidad'),
      autorizado: valores.has('autorizado'), permitirModeloExterno: valores.has('permitirModeloExterno'),
    };
    if (payload.visibilidad === 'alumnos' && valor('cursoSlug')) payload.cursoSlug = valor('cursoSlug');
    if (fuente) payload.versionEsperada = fuente.version;
    if (tipo === 'archivo') {
      if (valores.has('conservarContenido') && fuente?.tipo === 'archivo') payload.conservarContenido = true;
      else {
        const archivo = valores.get('archivo');
        if (!archivo?.size || !/\.(pdf|docx|txt)$/i.test(archivo.name)) throw new Error('Elige un archivo PDF, DOCX o TXT.');
        if (archivo.size > MAX_ARCHIVO) throw new Error('El archivo supera el límite de 2 MB.');
        payload.archivoBase64 = await leerBase64(archivo);
        payload.archivoNombre = archivo.name;
      }
    }
    if (tipo === 'texto') payload.texto = valor('texto');
    if (tipo === 'qa') Object.assign(payload, { pregunta: valor('pregunta'), respuesta: valor('respuesta') });
    if (tipo === 'url') {
      const url = urlSegura(valor('url'));
      if (!url) throw new Error('Usa un enlace HTTPS de una fuente autorizada.');
      Object.assign(payload, { url, texto: valor('extracto') });
    }
    return payload;
  }

  function editarFuente(contexto, fuente = null, borrador = {}) {
    const { dialogo, cuerpo } = modal(contexto.raiz, fuente ? 'Preparar revisión' : 'Nueva fuente');
    cuerpo.innerHTML = editorHTML(Boolean(fuente));
    const form = cuerpo.querySelector('form');
    const campos = form.elements;
    const valores = fuente || { tipo: 'texto', visibilidad: 'privada', ...borrador };
    for (const key of ['titulo', 'tipo', 'especialidad', 'autor', 'fecha', 'origen', 'visibilidad', 'cursoSlug', 'pregunta', 'respuesta', 'url']) {
      if (typeof valores[key] === 'string') campos[key].value = valores[key];
    }
    if (valores.tipo === 'texto') campos.texto.value = valores.texto || '';
    if (valores.tipo === 'url') campos.extracto.value = valores.texto || '';
    campos.permitirModeloExterno.checked = valores.permitirModeloExterno === true;
    if (campos.conservarContenido) campos.conservarContenido.checked = fuente?.tipo === 'archivo';
    const archivo = campos.archivo;

    function sincronizar() {
      const tipo = campos.tipo.value;
      form.querySelectorAll('[data-tipo]').forEach((grupo) => {
        const activa = grupo.dataset.tipo === tipo;
        grupo.hidden = !activa;
        grupo.disabled = !activa;
      });
      const conservar = campos.conservarContenido;
      if (conservar) {
        conservar.closest('[data-conservar]').hidden = fuente?.tipo !== 'archivo';
        conservar.disabled = fuente?.tipo !== 'archivo';
      }
      const conservarArchivo = fuente?.tipo === 'archivo' && conservar?.checked;
      archivo.disabled = Boolean(conservarArchivo);
      archivo.required = tipo === 'archivo' && !conservarArchivo;
      const privada = campos.visibilidad.value === 'privada';
      campos.cursoSlug.closest('[data-curso]').hidden = privada;
      campos.permitirModeloExterno.closest('[data-modelo]').hidden = privada;
      campos.permitirModeloExterno.disabled = privada;
    }
    campos.tipo.onchange = sincronizar;
    campos.visibilidad.onchange = sincronizar;
    if (campos.conservarContenido) campos.conservarContenido.onchange = sincronizar;
    sincronizar();

    const aviso = form.querySelector('.gk-status');
    const enviar = form.querySelector('[type=submit]');
    form.onsubmit = async (event) => {
      event.preventDefault();
      enviar.disabled = true;
      mostrarEstado(aviso, 'Guardando y procesando la fuente…');
      try {
        const body = await datosEditor(form, fuente);
        const ruta = fuente ? rutaFuente(fuente.id) + '/revisiones' : BIBLIOTECA;
        await api(ruta, { body });
        if (dialogo.open) dialogo.close();
        if (contexto.raiz.isConnected) {
          const mensaje = 'Se guardó una versión pendiente de revisión.';
          if (pestaña === 'fuentes') contexto.refrescar?.(mensaje);
          else contexto.seleccionar('fuentes', mensaje);
        }
      } catch (error) {
        if (!form.isConnected) return;
        mostrarEstado(aviso, error.message, true);
        if (error.codigo === 'fuente_duplicada' && error.fuenteId) {
          const revisar = document.createElement('button');
          revisar.className = 'gk-btn';
          revisar.type = 'button';
          revisar.textContent = 'Revisar la fuente existente';
          revisar.onclick = () => { dialogo.close(); abrirFuente(contexto, error.fuenteId); };
          aviso.append(document.createElement('br'), revisar);
        }
      } finally { enviar.disabled = false; }
    };
  }

  PAGES.conocimientoGallo = function () {
    const raiz = document.createElement('section');
    raiz.className = 'gk';
    raiz.innerHTML = '<div class="page-header"><div><h1>Centro de conocimiento — Mi Gallo IA</h1>' +
      '<p>Biblioteca técnica y revisión supervisada de respuestas.</p></div></div>' +
      '<div class="gk-tabs" role="tablist" aria-label="Centro de conocimiento">' +
      '<button type="button" role="tab" id="gk-tab-fuentes" data-gk-tab="fuentes" aria-controls="gk-panel" class="gk-tab">Fuentes</button>' +
      '<button type="button" role="tab" id="gk-tab-calidad" data-gk-tab="calidad" aria-controls="gk-panel" class="gk-tab">Calidad</button>' +
      '</div><div id="gk-panel" class="gk" role="tabpanel"></div>';
    document.getElementById('content').replaceChildren(raiz);
    const tabs = Array.from(raiz.querySelectorAll('[data-gk-tab]'));
    const panel = raiz.querySelector('#gk-panel');
    const contexto = { raiz, seleccionar, refrescar: null };

    function seleccionar(tab, mensaje) {
      pestaña = tab;
      tabs.forEach((boton) => {
        const activa = boton.dataset.gkTab === tab;
        boton.setAttribute('aria-selected', String(activa));
        boton.tabIndex = activa ? 0 : -1;
        if (activa) panel.setAttribute('aria-labelledby', boton.id);
      });
      contexto.refrescar = null;
      panel.replaceChildren();
      if (tab === 'calidad') window.renderCalidadGallo(panel, {
        api, esc, fechaHora, nombreCurso,
        prepararCorreccion: (pregunta) => editarFuente(contexto, null, {
          tipo: 'qa', pregunta, origen: 'Corrección supervisada de Mi Gallo IA',
        }),
      });
      else mostrarFuentes(panel, contexto, mensaje);
    }

    tabs.forEach((boton, i) => {
      boton.onclick = () => { if (boton.dataset.gkTab !== pestaña) seleccionar(boton.dataset.gkTab); };
      boton.onkeydown = (evento) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(evento.key)) return;
        evento.preventDefault();
        const otro = tabs[1 - i];
        seleccionar(otro.dataset.gkTab);
        otro.focus();
      };
    });
    seleccionar(pestaña);
  };
})();
