// ============================================================
// ⚠️ CONFIGURACIÓN: Pega aquí tu URL de ngrok cada vez que lo inicies
// Ejemplo: const API_BASE = 'https://a1b2-189-203-xxx.ngrok-free.app';
// ============================================================
const API_BASE = 'https://divorcee-sturdily-driller.ngrok-free.dev';

// Headers para evitar la pantalla de advertencia de ngrok
const NGROK_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

// Variables de Estado
let citizens = [];
let selectedFile = null;
let validationResult = null;
let cachedPdfText = null;
let cachedPdfType = null;
let revalidationTimeout = null;

// Selectores del DOM
const btnNavCitizens = document.getElementById('btn-nav-citizens');
const btnNavEvidences = document.getElementById('btn-nav-evidences');
const tabCitizens = document.getElementById('tab-citizens');
const tabEvidences = document.getElementById('tab-evidences');
const evidenceCountBadge = document.getElementById('evidence-count-badge');

const searchInput = document.getElementById('search-input');
const btnResetDb = document.getElementById('btn-reset-db');
const btnAddCitizenModal = document.getElementById('btn-add-citizen-modal');
const btnClearEvidences = document.getElementById('btn-clear-evidences');

// Modales
const modalAddCitizen = document.getElementById('modal-add-citizen');

// Formularios
const formAddCitizen = document.getElementById('form-add-citizen');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const btnCloseAddModal = document.getElementById('btn-close-add-modal');

// Elementos de Carga/Validación en el modal unificado
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');

// Etapas de Validación
const stageUpload = document.getElementById('stage-upload');
const stageProcessing = document.getElementById('stage-processing');
const stageResult = document.getElementById('stage-result');
const valPlaceholder = document.getElementById('val-placeholder');
const processingCurrentStatus = document.getElementById('processing-current-status');
const ocrProgressContainer = document.getElementById('ocr-progress-container');
const ocrProgressPercent = document.getElementById('ocr-progress-percent');
const ocrProgressFill = document.getElementById('ocr-progress-fill');
const ocrPreviewContainer = document.getElementById('ocr-preview-container');

// Pasos (Stepper)
const stepRead = document.getElementById('step-read');
const stepType = document.getElementById('step-type');
const stepOcr = document.getElementById('step-ocr');
const stepLogic = document.getElementById('step-logic');

// Resultados
const resultSuccess = document.getElementById('result-success');
const resultError = document.getElementById('result-error');
const resultErrorMsg = document.getElementById('result-error-msg');

// Comparación
const compSysName = document.getElementById('comp-sys-name');
const compSysAp1 = document.getElementById('comp-sys-ap1');
const compSysCurp = document.getElementById('comp-sys-curp');

const compExtName = document.getElementById('comp-ext-name');
const compExtAp1 = document.getElementById('comp-ext-ap1');
const compExtCurp = document.getElementById('comp-ext-curp');

// Detalles técnicos
const docMetaType = document.getElementById('doc-meta-type');
const docMetaAction = document.getElementById('doc-meta-action');
const rawTextPanel = document.getElementById('raw-text-panel');
const rawTextContent = document.getElementById('raw-text-content');
const rawTextToggleIcon = document.getElementById('raw-text-toggle-icon');

// Botones de control de validación
const btnValReset = document.getElementById('btn-val-reset');
const btnValConfirm = document.getElementById('btn-val-confirm');

// Toast
const appToast = document.getElementById('app-toast');
const toastMessage = document.getElementById('toast-message');

// Inicialización de la Aplicación al Cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Configurar Navegación
  btnNavCitizens.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('citizens');
  });
  btnNavEvidences.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('evidences');
  });

  // Escuchar Búsqueda
  searchInput.addEventListener('input', filterCitizens);

  // Escuchar Botones Administrativos (Muestra y Limpieza de Evidencias)
  btnResetDb.addEventListener('click', handleResetDatabase);
  btnClearEvidences.addEventListener('click', handleClearEvidences);

  // Control de Modales
  btnAddCitizenModal.addEventListener('click', () => openModal(modalAddCitizen));
  btnCancelAdd.addEventListener('click', () => closeModal(modalAddCitizen));
  btnCloseAddModal.addEventListener('click', () => closeModal(modalAddCitizen));

  // Prevenir envío por defecto del formulario de agregar ciudadano
  formAddCitizen.addEventListener('submit', (e) => e.preventDefault());

  // Ayudante de iniciales CURP en formulario y re-validación en caliente
  const inputs = ['reg-nombre', 'reg-primer-apellido', 'reg-segundo-apellido', 'reg-curp'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      ['input', 'change', 'paste'].forEach(evtType => {
        el.addEventListener(evtType, () => {
          handleCurpInputHelper();
          
          if (selectedFile && cachedPdfText) {
            if (revalidationTimeout) {
              clearTimeout(revalidationTimeout);
            }
            revalidationTimeout = setTimeout(() => {
              // Ocultar resultados previos para indicar procesamiento
              stageResult.classList.add('hide');
              stageProcessing.classList.remove('hide');
              processingCurrentStatus.textContent = "Re-evaluando validación en caliente...";
              runValidationPipeline();
            }, 300);
          }
        });
      });
    }
  });

  // Inicializar Zona de Arrastrar y Soltar (Dropzone)
  initDropzone();

  // Botón Limpiar y Reintentar dentro del modal
  btnValReset.addEventListener('click', resetValidationPanel);

  // Botón Confirmar Registro (Envío a base de datos final)
  btnValConfirm.addEventListener('click', handleConfirmRegistration);

  // Cargar datos del servidor al arrancar
  loadAllData();
}

// Cambiar de Pestaña (SPA Navigation)
function switchTab(tabName) {
  if (tabName === 'citizens') {
    btnNavCitizens.classList.add('active');
    btnNavEvidences.classList.remove('active');
    tabCitizens.classList.add('active');
    tabEvidences.classList.remove('active');
  } else {
    btnNavCitizens.classList.remove('active');
    btnNavEvidences.classList.add('active');
    tabCitizens.classList.remove('active');
    tabEvidences.classList.add('active');
  }
}

// Cargar Datos del Servidor
async function loadAllData() {
  await fetchCitizens();
  await fetchEvidences();
}

// Obtener Ciudadanos
async function fetchCitizens() {
  const tbody = document.getElementById('citizens-list');
  try {
    const res = await fetch(`${API_BASE}/api/citizens`, { headers: NGROK_HEADERS });
    if (!res.ok) throw new Error("Error al consultar ciudadanos.");

    citizens = await res.json();
    renderCitizensTable(citizens);
    updateStats();
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color: var(--status-error);"><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar ciudadanos de la API.</td></tr>`;
  }
}

// Obtener Evidencias
async function fetchEvidences() {
  const tbody = document.getElementById('evidences-list');
  try {
    const res = await fetch(`${API_BASE}/api/evidencias`, { headers: NGROK_HEADERS });
    if (!res.ok) throw new Error("Error al consultar evidencias.");

    const evidences = await res.json();
    evidenceCountBadge.textContent = evidences.length;

    if (evidences.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty">
            No hay registros de documentos rechazados en el repositorio de evidencias físicas.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = evidences.map(ev => {
      const date = new Date(ev.fechaIntento).toLocaleString('es-MX');
      return `
        <tr>
          <td><strong style="color: var(--text-main);">${date}</strong></td>
          <td>
            <div style="font-weight: 600; color: #fff;">${ev.nombre}</div>
            <div style="font-size: 11px; color: var(--text-muted);">ID Ciudadano: ${ev.citizenId}</div>
          </td>
          <td><code style="font-family: monospace; font-size: 13px; color: var(--accent-primary);">${ev.curpRegistrada}</code></td>
          <td>
            <div style="color: var(--status-error); font-weight: 500;">
              <i class="fa-solid fa-triangle-exclamation"></i> ${ev.motivoRechazo}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 3px;">
              PDF: ${ev.detallesValidacion.pdfType || 'Desconocido'}
            </div>
          </td>
          <td>
            <a href="${API_BASE}/api/evidencias/download/${ev.dbId}" class="btn btn-secondary btn-sm" download title="Descargar PDF de evidencia">
              <i class="fa-solid fa-download"></i> Descargar PDF
            </a>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty" style="color: var(--status-error);"><i class="fa-solid fa-triangle-exclamation"></i> Error al cargar repositorio de evidencias.</td></tr>`;
  }
}

// Pintar Tabla de Ciudadanos
function renderCitizensTable(data) {
  const tbody = document.getElementById('citizens-list');

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">
          No hay ciudadanos registrados en el sistema. Registra uno nuevo haciendo clic en "Nuevo Ciudadano".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map(c => {
    let statusClass = c.status.toLowerCase();
    let statusIcon = 'clock';
    if (c.status === 'Validado') statusIcon = 'circle-check';
    if (c.status === 'Rechazado') statusIcon = 'circle-xmark';

    let actionButton = '';
    if (c.status === 'Validado') {
      actionButton = `
        <a href="${API_BASE}/api/validos/download/${c.id}" class="btn btn-secondary btn-sm" download title="Descargar CURP aprobada">
          <i class="fa-solid fa-download"></i> Descargar CURP
        </a>
      `;
    } else {
      actionButton = `
        <span style="color: var(--status-error); font-size: 12px; font-weight: 500;"><i class="fa-solid fa-ban"></i> Registro Rechazado</span>
      `;
    }

    let obs = '';
    if (c.status === 'Validado') {
      obs = `<span style="color: var(--status-success); font-size: 12px;"><i class="fa-solid fa-check"></i> Registro aprobado el ${new Date(c.details.validatedAt).toLocaleDateString('es-MX')}</span>`;
    } else if (c.status === 'Rechazado') {
      obs = `
        <div style="color: var(--status-error); font-size: 12px; max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.details.reason}">
          <i class="fa-solid fa-xmark"></i> ${c.details.reason}
        </div>
      `;
    }

    return `
      <tr class="citizen-row">
        <td>
          <div style="font-weight: 600; color: #fff;">${c.nombre} ${c.primerApellido} ${c.segundoApellido || ''}</div>
          <div style="font-size: 11px; color: var(--text-muted);">ID Ciudadano: ${c.id}</div>
        </td>
        <td><code style="font-family: monospace; font-size: 14px; font-weight: 700; color: var(--text-main);">${c.curp}</code></td>
        <td>
          <span class="status-pill ${statusClass}">
            <i class="fa-solid fa-${statusIcon}"></i> ${c.status}
          </span>
        </td>
        <td>${obs}</td>
        <td class="actions-col">${actionButton}</td>
      </tr>
    `;
  }).join('');
}

// Filtrar Ciudadanos
function filterCitizens() {
  const val = searchInput.value.toLowerCase().trim();
  const filtered = citizens.filter(c => {
    const fullName = `${c.nombre} ${c.primerApellido} ${c.segundoApellido}`.toLowerCase();
    return fullName.includes(val) || c.curp.toLowerCase().includes(val);
  });
  renderCitizensTable(filtered);
}

// Actualizar Indicadores del Dashboard
function updateStats() {
  const total = citizens.length;
  const validated = citizens.filter(c => c.status === 'Validado').length;
  const rejected = citizens.filter(c => c.status === 'Rechazado').length;
  const pending = citizens.filter(c => c.status === 'Pendiente').length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-validated').textContent = validated;
  document.getElementById('stat-rejected').textContent = rejected;
  document.getElementById('stat-pending').textContent = pending;
}

// Control de Modales
function openModal(modal) {
  modal.classList.add('open');
  resetValidationPanel();
}

function closeModal(modal) {
  modal.classList.remove('open');
}

// Ayuda dinámica de CURP al capturar en formulario
function handleCurpInputHelper() {
  const nombre = document.getElementById('reg-nombre').value.trim();
  const ap1 = document.getElementById('reg-primer-apellido').value.trim();
  const ap2 = document.getElementById('reg-segundo-apellido').value.trim();
  const curp = document.getElementById('reg-curp').value.toUpperCase().trim();
  const hintDiv = document.getElementById('curp-match-hint');
  const hintText = document.getElementById('curp-hint-text');

  if (nombre && ap1 && curp.length >= 4) {
    const expected = calculateCurpInitials(nombre, ap1, ap2);
    const actual = curp.substring(0, 4);

    if (expected !== actual) {
      hintDiv.classList.remove('hide');
      hintText.innerHTML = `Atención: Para el nombre registrado, se esperan las iniciales de CURP <strong>${expected}</strong>, pero has escrito <strong>${actual}</strong>. Verifica el nombre o el orden de los apellidos.`;
      hintDiv.className = "alert alert-info";
    } else {
      hintDiv.classList.add('hide');
    }
  } else {
    hintDiv.classList.add('hide');
  }
}

// Restablecer base de datos limpia (cero usuarios)
async function handleResetDatabase() {
  if (!confirm("¿Deseas restablecer y vaciar la base de datos por completo? Se eliminarán todos los ciudadanos registrados y todos los archivos físicos de CURPs de tu equipo local para ahorrar almacenamiento.")) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/citizens/reset`, { method: 'POST', headers: NGROK_HEADERS });
    if (!res.ok) throw new Error("Error al restablecer la base de datos.");

    showToast("Base de datos y archivos vaciados correctamente.");
    loadAllData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Vaciar repositorio de evidencias para liberar espacio en disco
async function handleClearEvidences() {
  if (!confirm("¿Deseas vaciar el repositorio de evidencias físicamente? Se eliminarán permanentemente todos los archivos PDFs cargados por registros fallidos de tu almacenamiento local.")) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/evidencias/clear`, { method: 'POST', headers: NGROK_HEADERS });
    if (!res.ok) throw new Error("Error al vaciar evidencias.");

    showToast("Repositorio de evidencias de rechazo vaciado.");
    loadAllData();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// --- ZONA DE VALIDACIÓN Y OCR (MODAL UNIFICADO) ---

// Limpiar paneles del modal y restaurar estados
function resetValidationPanel() {
  selectedFile = null;
  validationResult = null;
  cachedPdfText = null;
  cachedPdfType = null;
  if (revalidationTimeout) {
    clearTimeout(revalidationTimeout);
    revalidationTimeout = null;
  }

  // Restaurar visuales de la columna derecha
  valPlaceholder.classList.remove('hide');
  stageProcessing.classList.add('hide');
  stageResult.classList.add('hide');

  // Limpiar inputs del formulario
  formAddCitizen.reset();
  document.getElementById('curp-match-hint').classList.add('hide');

  // Limpiar estados de progreso
  fileInput.value = '';
  ocrProgressContainer.classList.add('hide');
  ocrProgressPercent.textContent = '0%';
  ocrProgressFill.style.width = '0%';
  ocrPreviewContainer.classList.add('hide');
  rawTextPanel.classList.add('hide');
  rawTextContent.classList.add('hide');
  rawTextContent.textContent = '';
  rawTextToggleIcon.className = "fa-solid fa-chevron-down";

  // Limpiar Canvas
  const canvas = document.getElementById('pdf-render-canvas');
  if (canvas) {
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Limpiar Stepper
  const steps = [stepRead, stepType, stepOcr, stepLogic];
  steps.forEach(st => {
    if (st) st.className = 'step-track-item';
  });

  // Limpiar banners de resultado y botones
  resultSuccess.classList.add('hide');
  resultError.classList.add('hide');
  btnValReset.classList.add('hide');
  btnValConfirm.disabled = true;
  btnValConfirm.textContent = "Confirmar Registro";
}

// Drag & Drop Handlers
function initDropzone() {
  dropzone.addEventListener('click', () => fileInput.click());

  // Evitar propagación del click al padre dropzone y prevenir bucle infinito
  fileInput.addEventListener('click', (e) => e.stopPropagation());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processFileSelection(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(evt => {
    dropzone.addEventListener(evt, () => {
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      processFileSelection(e.dataTransfer.files[0]);
    }
  });
}

// Procesar el archivo seleccionado
function processFileSelection(file) {
  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
    alert("Error: Solo se permiten documentos en formato PDF (.pdf)");
    return;
  }

  selectedFile = file;

  // Ocultar placeholder de validación e iniciar el procesamiento
  valPlaceholder.classList.add('hide');
  stageProcessing.classList.remove('hide');
  stageResult.classList.add('hide');

  runValidationPipeline();
}

// Extraer campos clave (autocompletado) desde el texto crudo del PDF
function extractFieldsFromText(text) {
  // Pre-procesamiento de etiquetas OCR comunes
  let clean = text.toUpperCase().replace(/\s+/g, ' ');
  clean = clean
    .replace(/APELL1D[O0]/g, 'APELLIDO')
    .replace(/APELLID[O0]/g, 'APELLIDO')
    .replace(/PR[I1]MER/g, 'PRIMER')
    .replace(/S[E3]GUNDO/g, 'SEGUNDO')
    .replace(/N[O0]MBRE/g, 'NOMBRE')
    .replace(/NOMBRES/g, 'NOMBRE(S)')
    .replace(/NOMBRE\s*\(S\)?/g, 'NOMBRE(S)')
    .replace(/S[E3]X[O0]/g, 'SEXO')
    .replace(/FECH[A4]/g, 'FECHA')
    .replace(/NAC[I1][O0]NAL[I1]DAD/g, 'NACIONALIDAD')
    .replace(/ENT[I1]DAD/g, 'ENTIDAD')
    .replace(/REG[I1]STR[O0]/g, 'REGISTRO')
    .replace(/INSCR[I1]PC[I1][O0]N/g, 'INSCRIPCION')
    .replace(/C[U0]RP/g, 'CURP');

  let curp = null;
  let nombre = "";
  let primerApellido = "";
  let segundoApellido = "";

  // 1. Extraer CURP buscando candidatos de 18 caracteres alfanuméricos en el texto sin espacios
  const textNoSpaces = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Nos deslizamos por el texto sin espacios buscando cualquier ventana de 18 caracteres
  for (let i = 0; i <= textNoSpaces.length - 18; i++) {
    const candidate = textNoSpaces.substring(i, i + 18);
    
    // Normalizar la subcadena candidata
    let normalized = '';
    for (let j = 0; j < candidate.length; j++) {
      let char = candidate[j];
      if ((j >= 4 && j <= 9) || j === 17) {
        if (char === 'O' || char === 'Q') char = '0';
        else if (char === 'I' || char === 'L') char = '1';
        else if (char === 'Z') char = '2';
        else if (char === 'S') char = '5';
        else if (char === 'B') char = '8';
      }
      if (j === 16) {
        if (char === 'O' || char === 'Q') char = '0';
        else if (char === 'I' || char === 'L') char = '1';
      }
      normalized += char;
    }

    // Probar si el candidato normalizado coincide con una CURP
    let testCurps = [normalized];
    if (normalized[10] !== 'H' && normalized[10] !== 'M') {
      const prefix = normalized.substring(0, 10);
      const suffix = normalized.substring(11);
      testCurps.push(`${prefix}H${suffix}`);
      testCurps.push(`${prefix}M${suffix}`);
    }

    const officialCurpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/;
    for (const tc of testCurps) {
      if (officialCurpRegex.test(tc)) {
        curp = tc;
        break;
      }
    }

    if (curp) break;
  }

  // 2. Extraer Nombres y Apellidos basados en los identificadores de campos del formato mexicano
  const ap1Match = clean.match(/PRIMER APELLIDO\s*:?\s*([A-ZÑÁÉÍÓÚÜ\s]+?)(?=\s*(SEGUNDO|NOMBRE|SEXO|FECHA|NACIONALIDAD|ENTIDAD|CURP|ESTADO|CLAVE|REGISTRO|INSCRIPCION|$))/i);
  const ap2Match = clean.match(/SEGUNDO APELLIDO\s*:?\s*([A-ZÑÁÉÍÓÚÜ\s]+?)(?=\s*(NOMBRE|SEXO|FECHA|NACIONALIDAD|ENTIDAD|CURP|ESTADO|CLAVE|REGISTRO|INSCRIPCION|$))/i);
  const nomMatch = clean.match(/NOMBRE(?:S|\(S\))?\s*:?\s*([A-ZÑÁÉÍÓÚÜ\s]+?)(?=\s*(SEXO|FECHA|NACIONALIDAD|ENTIDAD|CURP|ESTADO|CLAVE|REGISTRO|INSCRIPCION|$))/i);

  if (ap1Match) primerApellido = ap1Match[1].trim();
  if (ap2Match) segundoApellido = ap2Match[1].trim();
  if (nomMatch) nombre = nomMatch[1].trim();

  return { curp, nombre, primerApellido, segundoApellido };
}

// Correr el pipeline de validación
async function runValidationPipeline() {
  const steps = {
    read: stepRead,
    type: stepType,
    ocr: stepOcr,
    logic: stepLogic
  };

  const progressCallback = (p) => {
    processingCurrentStatus.textContent = p.message;

    // Actualizar stepper
    const targetStep = steps[p.step];
    if (targetStep) {
      if (p.status === 'active') {
        targetStep.className = 'step-track-item active';
      } else if (p.status === 'success') {
        targetStep.className = 'step-track-item success';
      } else if (p.status === 'error') {
        targetStep.className = 'step-track-item error';
      }
    }

    // Actualizar barra del OCR
    if (p.step === 'ocr' && p.progress !== undefined) {
      const pct = Math.round(p.progress * 100);
      ocrProgressPercent.textContent = `${pct}%`;
      ocrProgressFill.style.width = `${pct}%`;
    }
  };

  try {
    // 1. Obtener valores capturados en el formulario
    let nombre = document.getElementById('reg-nombre').value.trim();
    let primerApellido = document.getElementById('reg-primer-apellido').value.trim();
    let segundoApellido = document.getElementById('reg-segundo-apellido').value.trim();
    let curp = document.getElementById('reg-curp').value.toUpperCase().trim();

    // Bandera para saber si el formulario está totalmente vacío para activar el AUTOCOMPLETADO
    const isAutocomplete = !nombre && !primerApellido && !curp;

    // Si está vacío, necesitamos extraer primero el texto para autocompletar
    let citizenMock = { nombre, primerApellido, segundoApellido, curp };

    if (isAutocomplete) {
      progressCallback({ step: 'read', status: 'active', message: 'Leyendo estructura del PDF para autocompletado...' });

      // Creamos un ciudadano temporal con campos genéricos sólo para que pase la validación de archivos de validator.js
      // y posteriormente extraemos las cadenas para autocompletar la vista.
      citizenMock.nombre = "MOCK";
      citizenMock.primerApellido = "MOCK";
      citizenMock.curp = "MOCK000000XXXXXX00";
      citizenMock.isAutocomplete = true;
    }

    // Ejecutar el motor genérico
    // IMPORTANTE: Guardamos si ya había caché ANTES de que se actualice, para saber si es re-validación
    const hadCacheBefore = !!cachedPdfText;
    const result = await validateCURPFile(selectedFile, citizenMock, progressCallback, cachedPdfText, cachedPdfType);

    // Guardar en caché el texto crudo y tipo del PDF si no se tenía guardado previamente
    if (!cachedPdfText && result.rawText) {
      cachedPdfText = result.rawText;
      cachedPdfType = result.pdfType;
    }

    if (isAutocomplete) {
      // Intentar extraer campos reales del texto obtenido
      const fields = extractFieldsFromText(result.rawText);

      if (fields.curp && fields.nombre && fields.primerApellido) {
        // Rellenar formulario
        const inputNombre = document.getElementById('reg-nombre');
        const inputAp1 = document.getElementById('reg-primer-apellido');
        const inputAp2 = document.getElementById('reg-segundo-apellido');
        const inputCurp = document.getElementById('reg-curp');

        inputNombre.value = fields.nombre;
        inputAp1.value = fields.primerApellido;
        inputAp2.value = fields.segundoApellido;
        inputCurp.value = fields.curp;

        // Disparar evento input para actualizar hints visuales en el formulario
        inputNombre.dispatchEvent(new Event('input'));
        inputAp1.dispatchEvent(new Event('input'));
        inputAp2.dispatchEvent(new Event('input'));
        inputCurp.dispatchEvent(new Event('input'));

        // Actualizar variables locales para la comparación en pantalla
        nombre = fields.nombre;
        primerApellido = fields.primerApellido;
        segundoApellido = fields.segundoApellido;
        curp = fields.curp;

        // Volver a evaluar la validación con los campos autocompletados reales
        citizenMock = { nombre, primerApellido, segundoApellido, curp };

        // Ejecutar segunda validación rápida localmente
        const finalResult = await validateCURPFile(selectedFile, citizenMock, progressCallback, cachedPdfText, cachedPdfType);
        validationResult = finalResult;
      } else {
        // Falló autocompletado
        result.isValid = false;
        result.reason = "No se pudieron extraer los datos automáticamente de la CURP. Por favor, captura tus datos manualmente en el formulario y sube de nuevo tu archivo.";
        validationResult = result;
      }
    } else {
      validationResult = result;
    }

    // Mostrar resultados finales en la columna derecha
    // isRevalidation = true SOLO si ya había caché antes (es decir, el usuario cambió un campo y se re-validó)
    const isRevalidation = hadCacheBefore && !isAutocomplete;
    setTimeout(() => {
      renderValidationResult(validationResult, nombre, primerApellido, segundoApellido, curp, isRevalidation);
    }, 800);

  } catch (err) {
    console.error("Error en pipeline de registro/validación:", err);
    progressCallback({ step: 'logic', status: 'error', message: 'Error en el procesamiento.' });

    setTimeout(() => {
      renderValidationResult({
        isValid: false,
        reason: "Ocurrió un error inesperado al procesar tu documento PDF: " + err.message,
        pdfType: 'Desconocido',
        rawText: ''
      }, "", "", "", "");
    }, 800);
  }
}

// Pintar los resultados del análisis en la pantalla derecha
async function renderValidationResult(res, nombre, primerApellido, segundoApellido, curp, isRevalidation = false) {
  stageProcessing.classList.add('hide');
  stageResult.classList.remove('hide');

  // Llenar panel comparativo
  compSysName.textContent = nombre || '(Vacío)';
  compSysAp1.textContent = `${primerApellido} ${segundoApellido}`.trim() || '(Vacío)';
  compSysCurp.textContent = curp || '(Vacío)';

  compExtName.textContent = res.extractedName || '-';
  compExtAp1.textContent = `${res.extractedAp1 || ''} ${res.extractedAp2 || ''}`.trim() || '-';
  compExtCurp.textContent = res.extractedCurp || 'No encontrada';

  // Resaltar clases CSS de coincidencia
  highlightMatch(compExtName, res.details ? res.details.nameMatch : false);
  highlightMatch(compExtAp1, res.details ? (res.details.ap1Match && (res.details.ap2Match !== false)) : false);
  highlightMatch(compExtCurp, res.details ? res.details.curpMatch : false);

  // Metadatos técnicos
  docMetaType.textContent = res.pdfType;

  // Llenar consola de texto crudo
  if (res.rawText) {
    rawTextPanel.classList.remove('hide');
    rawTextContent.textContent = res.rawText;
  }

  btnValReset.classList.remove('hide');

  if (res.isValid) {
    // Éxito: Habilitar botón de confirmación de registro
    resultSuccess.classList.remove('hide');
    resultError.classList.add('hide');

    docMetaAction.innerHTML = `<span style="color: var(--status-success); font-weight:600;"><i class="fa-solid fa-cloud-arrow-up"></i> Listo para Registrar</span>`;

    btnValConfirm.disabled = false;
  } else {
    // Fallo: Deshabilitar confirmación y archivar en evidencias de inmediato
    resultSuccess.classList.add('hide');
    resultError.classList.remove('hide');
    resultErrorMsg.textContent = res.reason;

    docMetaAction.innerHTML = `<span style="color: var(--status-error); font-weight:600;"><i class="fa-solid fa-box-archive"></i> Archivado en Evidencias</span>`;

    btnValConfirm.disabled = true;

    // Solo subir la evidencia de rechazo la PRIMERA vez, no en re-validaciones en caliente
    if (!isRevalidation) {
      await uploadRejectedEvidence(res, nombre, primerApellido, segundoApellido, curp);
    }
  }
}

// Resaltar colores
function highlightMatch(element, isMatch) {
  if (isMatch === true) {
    element.className = "field-val match-success";
  } else if (isMatch === false) {
    element.className = "field-val match-error";
  } else {
    element.className = "field-val";
  }
}

// Toggle visualización texto crudo
function toggleRawText() {
  rawTextContent.classList.toggle('hide');
  if (rawTextContent.classList.contains('hide')) {
    rawTextToggleIcon.className = "fa-solid fa-chevron-down";
  } else {
    rawTextToggleIcon.className = "fa-solid fa-chevron-up";
  }
}

// Subir registro rechazado al servidor en segundo plano
async function uploadRejectedEvidence(res, nombre, primerApellido, segundoApellido, curp) {
  // Asegurar que haya datos mínimos para registrar el intento
  const regNombre = nombre || "REGISTRO_ANONIMO";
  const regAp1 = primerApellido || "SIN_APELLIDO";
  const regCurp = curp || "SINCURP000000000A";

  const formData = new FormData();
  if (selectedFile) {
    formData.append('document', selectedFile);
  }
  formData.append('nombre', regNombre);
  formData.append('primerApellido', regAp1);
  formData.append('segundoApellido', segundoApellido || "");
  formData.append('curp', regCurp);
  formData.append('status', 'Rechazado');
  formData.append('reason', res.reason || "Validación documental fallida");

  const detailsMetadata = {
    pdfType: res.pdfType,
    extractedCurp: res.extractedCurp,
    extractedName: res.extractedName,
    extractedAp1: res.extractedAp1,
    extractedAp2: res.extractedAp2,
    rawText: res.rawText ? res.rawText.substring(0, 1500) : ""
  };
  formData.append('details', JSON.stringify(detailsMetadata));

  try {
    const response = await fetch(`${API_BASE}/api/citizens/register`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error("Error en la subida del intento de registro.");

    showToast("Intento fallido registrado en evidencias.", "warning");
    loadAllData(); // Recargar listados del dashboard para mostrar el usuario rechazado
  } catch (error) {
    console.error("Error al registrar evidencia:", error);
    showToast("Error al archivar evidencia de rechazo en el servidor.", "error");
  }
}

// Confirmar e interactuar con la subida del registro exitoso (Validado)
async function handleConfirmRegistration() {
  if (!selectedFile || !validationResult || !validationResult.isValid) return;

  const nombre = document.getElementById('reg-nombre').value.trim();
  const primerApellido = document.getElementById('reg-primer-apellido').value.trim();
  const segundoApellido = document.getElementById('reg-segundo-apellido').value.trim();
  const curp = document.getElementById('reg-curp').value.toUpperCase().trim();

  btnValConfirm.disabled = true;
  btnValConfirm.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Registrando...`;

  const formData = new FormData();
  formData.append('document', selectedFile);
  formData.append('nombre', nombre);
  formData.append('primerApellido', primerApellido);
  formData.append('segundoApellido', segundoApellido);
  formData.append('curp', curp);
  formData.append('status', 'Validado');
  formData.append('reason', 'Validación documental exitosa');

  const detailsMetadata = {
    pdfType: validationResult.pdfType,
    extractedCurp: validationResult.extractedCurp,
    extractedName: validationResult.extractedName,
    extractedAp1: validationResult.extractedAp1,
    extractedAp2: validationResult.extractedAp2
  };
  formData.append('details', JSON.stringify(detailsMetadata));

  try {
    const res = await fetch(`${API_BASE}/api/citizens/register`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error al completar el registro.");

    showToast("Ciudadano registrado y validado con éxito.");
    closeModal(modalAddCitizen);
    loadAllData();
  } catch (error) {
    alert(error.message);
    btnValConfirm.disabled = false;
    btnValConfirm.textContent = "Confirmar Registro";
  }
}

// Toast Notifications System
function showToast(msg, type = "success") {
  toastMessage.textContent = msg;

  if (type === "success") {
    appToast.style.borderLeftColor = "var(--status-success)";
    document.querySelector('.toast-icon').className = "fa-solid fa-circle-check toast-icon";
    document.querySelector('.toast-icon').style.color = "var(--status-success)";
  } else if (type === "warning") {
    appToast.style.borderLeftColor = "var(--status-pending)";
    document.querySelector('.toast-icon').className = "fa-solid fa-triangle-exclamation toast-icon";
    document.querySelector('.toast-icon').style.color = "var(--status-pending)";
  } else {
    appToast.style.borderLeftColor = "var(--status-error)";
    document.querySelector('.toast-icon').className = "fa-solid fa-circle-xmark toast-icon";
    document.querySelector('.toast-icon').style.color = "var(--status-error)";
  }

  appToast.classList.add('show');

  setTimeout(() => {
    appToast.classList.remove('show');
  }, 4000);
}
