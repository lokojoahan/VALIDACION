// Configurar el worker de PDF.js para que use el CDN
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Remueve acentos y caracteres especiales, convirtiendo a mayúsculas.
 */
function cleanText(str) {
  if (!str) return "";
  // Reemplazar Ñ por X antes de normalizar para coincidir con la regla de la CURP
  const upper = str.toUpperCase().replace(/Ñ/g, 'X');
  return upper
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remueve diacríticos (acentos)
    .trim();
}

/**
 * Normaliza caracteres numéricos que el OCR suele confundir con letras en textos alfabéticos.
 */
function normalizeOcrText(str) {
  if (!str) return "";
  return str
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/2/g, 'Z')
    .replace(/3/g, 'E')
    .replace(/4/g, 'A')
    .replace(/5/g, 'S')
    .replace(/8/g, 'B');
}

/**
 * Calcula la distancia de Levenshtein entre dos cadenas de caracteres.
 */
function getLevenshteinDistance(a, b) {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // eliminación
        tmp[i][j - 1] + 1, // inserción
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // sustitución
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * Realiza una búsqueda difusa de una subcadena en un texto ruidoso.
 */
function fuzzyContains(text, target, maxDistance = 2) {
  if (!target) return true;
  const cleanTarget = cleanText(target);
  const cleanTextStr = cleanText(text);

  if (cleanTextStr.includes(cleanTarget)) return true;

  const tolerance = Math.min(maxDistance, Math.floor(cleanTarget.length / 2));
  const len = cleanTarget.length;

  for (let i = 0; i <= cleanTextStr.length - len; i++) {
    const windowStr = cleanTextStr.substring(i, i + len);
    const dist = getLevenshteinDistance(windowStr, cleanTarget);
    if (dist <= tolerance) return true;
  }

  const textNoSpaces = cleanTextStr.replace(/\s+/g, '');
  for (let i = 0; i <= textNoSpaces.length - len; i++) {
    const windowStr = textNoSpaces.substring(i, i + len);
    const dist = getLevenshteinDistance(windowStr, cleanTarget);
    if (dist <= tolerance) return true;
  }

  return false;
}

/**
 * Busca en el texto crudo un fragmento que coincida de forma difusa con una cadena objetivo,
 * y expande la coincidencia con palabras adyacentes que pertenezcan legítimamente a ese campo.
 */
function findFuzzyMatchInText(text, target, fieldType = "nombre", citizen = null) {
  if (!target || !text) return "";
  const cleanTarget = cleanText(target);
  const cleanTextStr = cleanText(text);

  const wordsTarget = cleanTarget.split(/\s+/);
  const wordsTargetCount = wordsTarget.length;

  const textWords = cleanTextStr.split(/\s+/);
  if (textWords.length < wordsTargetCount) return "";

  let bestMatchIdx = -1;
  let minDistance = 999;

  let totalTolerance = 0;
  for (const word of wordsTarget) {
    totalTolerance += (word.length <= 4 ? 1 : 2);
  }

  for (let i = 0; i <= textWords.length - wordsTargetCount; i++) {
    const candidateWords = textWords.slice(i, i + wordsTargetCount);

    let accumDistance = 0;
    let validWordMatches = true;

    for (let j = 0; j < wordsTargetCount; j++) {
      const wTarget = wordsTarget[j];
      const wCandidate = candidateWords[j];

      const wordDist = getLevenshteinDistance(wTarget, wCandidate);
      const maxWordTolerance = wTarget.length <= 4 ? 1 : 2;

      if (wordDist > maxWordTolerance) {
        validWordMatches = false;
        break;
      }
      accumDistance += wordDist;
    }

    if (validWordMatches && accumDistance < minDistance) {
      minDistance = accumDistance;
      bestMatchIdx = i;
    }
  }

  if (bestMatchIdx !== -1 && minDistance <= totalTolerance) {
    const resultWords = textWords.slice(bestMatchIdx, bestMatchIdx + wordsTargetCount);

    const stopWords = [
      'SEXO', 'FECHA', 'CURP', 'NACIONALIDAD', 'ENTIDAD', 'REGISTRO',
      'INSCRIPCION', 'PRIMER', 'APELLIDO', 'SEGUNDO', 'NOMBRE', 'NOMBRE(S)',
      'ESTADO', 'CLAVE', 'FOJA', 'LIBRO', 'TOMO', 'CRIP'
    ];

    const contextualStopWords = [];
    if (citizen) {
      if (fieldType === "nombre") {
        if (citizen.primerApellido) contextualStopWords.push(cleanText(citizen.primerApellido));
        if (citizen.segundoApellido) contextualStopWords.push(cleanText(citizen.segundoApellido));
      } else if (fieldType === "primerApellido") {
        if (citizen.nombre) {
          const firstWord = cleanText(citizen.nombre).split(' ')[0];
          contextualStopWords.push(firstWord);
        }
        if (citizen.segundoApellido) contextualStopWords.push(cleanText(citizen.segundoApellido));
      }
    }

    const validPrepositions = ['DE', 'Y', 'EL', 'LA', 'DA', 'LO', 'DEL'];

    let prevIdx = bestMatchIdx - 1;
    const prependedWords = [];
    while (prevIdx >= 0) {
      const prevWord = textWords[prevIdx];
      if (stopWords.includes(prevWord)) break;
      
      let isContextualStop = false;
      for (const stopW of contextualStopWords) {
        if (prevWord === stopW || getLevenshteinDistance(prevWord, stopW) <= 1) {
          isContextualStop = true;
          break;
        }
      }
      if (isContextualStop) break;
      if (/^[0-9]+$/.test(prevWord) || prevWord.includes(':')) break;

      if (prevWord.length <= 2 && !validPrepositions.includes(prevWord)) {
        break;
      }
      
      prependedWords.unshift(prevWord);
      prevIdx--;
    }
    
    resultWords.unshift(...prependedWords);

    let nextIdx = bestMatchIdx + wordsTargetCount;
    while (nextIdx < textWords.length) {
      const nextWord = textWords[nextIdx];

      if (stopWords.includes(nextWord)) {
        break;
      }

      let isContextualStop = false;
      for (const stopW of contextualStopWords) {
        if (nextWord === stopW || getLevenshteinDistance(nextWord, stopW) <= 1) {
          isContextualStop = true;
          break;
        }
      }
      if (isContextualStop) {
        break;
      }

      if (/^[0-9]+$/.test(nextWord) || nextWord.includes(':')) {
        break;
      }

      if (nextWord.length <= 2) {
        const isValidPrep = validPrepositions.includes(nextWord);
        const followingWord = textWords[nextIdx + 1];
        const isFollowingLong = followingWord && followingWord.length >= 3 && !stopWords.includes(followingWord);

        if (!isValidPrep || !isFollowingLong) {
          break;
        }
      }

      resultWords.push(nextWord);
      nextIdx++;
    }

    return resultWords.join(' ');
  }

  return "";
}

/**
 * Compara dos cadenas de nombres o apellidos palabra por palabra.
 * Garantiza que coincida la cantidad de palabras y su orden, previniendo omisiones.
 * @param {string} a Nombre esperado (de la base de datos o formulario).
 * @param {string} b Nombre extraído (del PDF/OCR).
 * @param {boolean} isOcr Si se debe permitir coincidencia difusa por OCR.
 * @returns {boolean} True si coinciden.
 */
function compareNamesStrictly(a, b, isOcr = false) {
  const sanitize = (str) => {
    return cleanText(str)
      .replace(/[^A-Z\s]/g, '') // Solo letras y espacios
      .replace(/\s+/g, ' ')
      .trim();
  };

  const cleanA = sanitize(a);
  const cleanB = sanitize(b);

  if (!cleanA && !cleanB) return true;
  if (!cleanA || !cleanB) return false;

  const wordsA = cleanA.split(' ');
  const wordsB = cleanB.split(' ');

  if (wordsA.length !== wordsB.length) return false;

  for (let i = 0; i < wordsA.length; i++) {
    const wordA = wordsA[i];
    const wordB = wordsB[i];

    if (!isOcr) {
      if (wordA !== wordB) return false;
    } else {
      const dist = getLevenshteinDistance(wordA, wordB);
      const maxTol = wordA.length <= 4 ? 1 : 2;
      if (dist > maxTol) return false;
    }
  }

  return true;
}


/**
 * Busca de forma difusa una CURP esperada en el texto OCR sin espacios.
 */
function fuzzyFindCurp(text, targetCurp, maxDistance = 3) {
  if (!targetCurp) return null;
  const cleanTarget = targetCurp.toUpperCase().trim();
  const textNoSpaces = text.toUpperCase().replace(/[^A-Z0-9]/g, '');

  let bestMatch = null;
  let minDistance = 999;
  const len = cleanTarget.length;

  for (let i = 0; i <= textNoSpaces.length - len; i++) {
    const candidate = textNoSpaces.substring(i, i + len);

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

    // Regla de seguridad estricta para subcampos de identidad de la CURP:
    // La Fecha de nacimiento (índices 4-9), Sexo (10), Entidad federativa (11-12) y Homoclave/Verificador (16-17)
    // DEBEN coincidir exactamente entre el candidato del documento y lo registrado en el formulario.
    // El OCR solo tiene tolerancia a variaciones en iniciales y consonantes internas.
    const criticalIndices = [4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17];
    let criticalMismatch = false;
    for (const idx of criticalIndices) {
      if (normalized[idx] !== cleanTarget[idx]) {
        criticalMismatch = true;
        break;
      }
    }

    if (criticalMismatch) {
      continue;
    }

    const dist = getLevenshteinDistance(normalized, cleanTarget);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = normalized;
    }
  }

  if (bestMatch && minDistance <= maxDistance) {
    return { match: true, extracted: bestMatch, distance: minDistance };
  }
  return { match: false, extracted: bestMatch || "No detectada", distance: minDistance };
}

/**
 * Obtiene las iniciales esperadas para los primeros 4 caracteres de la CURP en México.
 * Regla: 
 * 1. Primera letra del primer apellido.
 * 2. Primera vocal interna del primer apellido (ignorando la primera letra).
 * 3. Primera letra del segundo apellido (si no hay, se usa 'X').
 * 4. Primera letra del primer nombre (con reglas especiales para nombres comunes José/María).
 */
function calculateCurpInitials(nombre, primerApellido, segundoApellido) {
  const nameCleaned = cleanText(nombre);
  const ap1 = cleanText(primerApellido);
  const ap2 = cleanText(segundoApellido);

  if (!nameCleaned || !ap1) return "";

  // 1. Primera letra del primer apellido
  let pos0 = ap1[0] || 'X';

  // 2. Primera vocal interna del primer apellido
  let pos1 = 'X';
  const vowels = ['A', 'E', 'I', 'O', 'U'];
  for (let i = 1; i < ap1.length; i++) {
    if (vowels.includes(ap1[i])) {
      pos1 = ap1[i];
      break;
    }
  }

  // 3. Primera letra del segundo apellido
  let pos2 = ap2 ? (ap2[0] || 'X') : 'X';

  // 4. Primera letra del primer nombre (evitar JOSE y MARIA si hay segundo nombre)
  let nameWord = nameCleaned;
  const nameParts = nameCleaned.split(/\s+/);
  if (nameParts.length > 1) {
    const firstPart = nameParts[0];
    if ((firstPart === 'JOSE' || firstPart === 'MARIA' || firstPart === 'MA' || firstPart === 'J') && nameParts[1]) {
      nameWord = nameParts[1];
    }
  }
  let pos3 = nameWord[0] || 'X';

  return `${pos0}${pos1}${pos2}${pos3}`;
}

/**
 * Valida si los primeros 4 caracteres de la CURP corresponden con el nombre y apellidos.
 */
function validateCurpStructure(curp, nombre, primerApellido, segundoApellido) {
  if (curp.length < 4) return false;
  const expectedInitials = calculateCurpInitials(nombre, primerApellido, segundoApellido);
  const actualInitials = curp.substring(0, 4).toUpperCase();

  // A veces hay discrepancias con nombres compuestos o letras especiales (como la Ñ que se cambia a X).
  // Hacemos una validación flexible pero estricta.
  return expectedInitials === actualInitials;
}

/**
 * Analiza un archivo PDF (digital o escaneado con OCR) y lo valida contra el ciudadano.
 * 
 * @param {File} file Archivo PDF de entrada.
 * @param {Object} citizen Datos del ciudadano registrado en el sistema.
 * @param {Function} onProgress Callback para actualizar el estado del progreso en la interfaz.
 * @returns {Promise<Object>} Resultado de la validación.
 */
async function validateCURPFile(file, citizen, onProgress, cachedText = null, cachedType = null) {
  const result = {
    isValid: false,
    reason: null,
    extractedCurp: null,
    extractedName: null,
    extractedAp1: null,
    extractedAp2: null,
    pdfType: 'Desconocido',
    rawText: '',
    details: {}
  };

  try {
    if (cachedText) {
      result.rawText = cachedText;
      result.pdfType = cachedType || 'Digital (Seleccionable)';
      onProgress({ step: 'read', status: 'success', message: 'Usando archivo PDF (Caché)' });
      onProgress({ step: 'type', status: 'success', message: `Tipo: ${result.pdfType} (Caché)` });
      onProgress({ step: 'ocr', status: 'success', message: 'Lectura completada (Caché)' });
    } else {
      // --- PASO 1: LEER ARCHIVO PDF ---
      onProgress({ step: 'read', status: 'active', message: 'Leyendo archivo PDF...' });
      const arrayBuffer = await file.arrayBuffer();

      let pdfDoc;
      try {
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      } catch (e) {
        result.reason = "El archivo no es un PDF válido o está corrupto.";
        return result;
      }

      if (pdfDoc.numPages === 0) {
        result.reason = "El archivo PDF no tiene páginas.";
        return result;
      }

      // --- PASO 2: EXTRAER TEXTO DIGITAL (SELECCIONABLE) ---
      onProgress({ step: 'type', status: 'active', message: 'Analizando capa de texto digital...' });

      // Leemos la primera página (las CURP oficiales son de 1 página)
      const page = await pdfDoc.getPage(1);
      const textContent = await page.getTextContent();
      let digitalText = textContent.items.map(item => item.str).join(' ');

      // Si tiene texto digital con cierta longitud, es un PDF seleccionable
      const isDigital = digitalText.trim().replace(/\s+/g, '').length > 50;

      if (isDigital) {
        result.pdfType = 'Digital (Seleccionable)';
        result.rawText = digitalText;
        onProgress({ step: 'type', status: 'success', message: 'PDF Digital detectado.' });
      } else {
        // --- PASO 3: PDF ESCANEADO - RENDERIZAR A CANVAS Y EJECUTAR OCR ---
        result.pdfType = 'Escaneado (Imagen)';
        onProgress({ step: 'type', status: 'success', message: 'PDF Escaneado (Imagen) detectado. Iniciando OCR...' });
        onProgress({ step: 'ocr', status: 'active', message: 'Preparando imagen para OCR...' });

        // Renderizar página del PDF a un Canvas con alta resolución (scale 2.0 para OCR preciso)
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.getElementById('pdf-render-canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Mostrar el contenedor de previsualización en el modal
        document.getElementById('ocr-preview-container').classList.remove('hide');

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Iniciar OCR con Tesseract.js
        onProgress({ step: 'ocr', status: 'active', message: 'Inicializando motor Tesseract.js...' });
        document.getElementById('ocr-progress-container').classList.remove('hide');

        const worker = await Tesseract.createWorker('spa', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              const percent = Math.round(m.progress * 100);
              onProgress({
                step: 'ocr',
                status: 'active',
                message: `Reconociendo texto en imagen... (${percent}%)`,
                progress: m.progress
              });
            }
          }
        });

        const ret = await worker.recognize(canvas);
        let ocrText = ret.data.text;
        await worker.terminate();

        result.rawText = ocrText;
        onProgress({ step: 'ocr', status: 'success', message: 'OCR completado exitosamente.' });
      }
    }

    // --- PASO 4: EJECUTAR REGLAS DE VALIDACIÓN CRUZADA ---
    if (citizen && citizen.isAutocomplete) {
      result.isValid = true;
      onProgress({ step: 'logic', status: 'success', message: 'Texto extraído para autocompletado.' });
      return result;
    }

    onProgress({ step: 'logic', status: 'active', message: 'Ejecutando reglas de validación cruzada...' });

    const textUpper = result.rawText.toUpperCase();
    const textCleaned = cleanText(result.rawText);

    // A. VALIDACIÓN: Detección de Acta de Nacimiento (Rechazo inmediato)
    const birthCertificateKeywords = [
      'ACTA DE NACIMIENTO',
      'DATOS DEL REGISTRADO',
      'REGISTRO CIVIL',
      'DATOS DE LOS PADRES',
      'ESTADO DE REGISTRO',
      'FOJA',
      'LIBRO',
      'CRIP'
    ];

    let matchCount = 0;
    for (const kw of birthCertificateKeywords) {
      if (textUpper.includes(kw)) {
        matchCount++;
      }
    }

    // Si coincide con 3 o más palabras clave de actas de nacimiento, se rechaza inmediatamente
    if (matchCount >= 2 && textUpper.includes('ACTA DE NACIMIENTO')) {
      result.reason = "El archivo cargado corresponde a un Acta de Nacimiento. Solo se permite subir la CURP oficial.";
      onProgress({ step: 'logic', status: 'error', message: 'Documento incorrecto (Acta de Nacimiento).' });
      return result;
    }

    // B. VALIDACIÓN CRUZADA E INTELIGENTE:
    // Extraer todos los campos del documento utilizando nuestro motor de extracción
    const docFields = extractFieldsFromText(result.rawText);

    // Fallback de extracción difusa en todo el texto del documento si falla la extracción estructurada por etiquetas
    if (citizen && !citizen.isAutocomplete) {
      if (!docFields.nombre && citizen.nombre) {
        docFields.nombre = findFuzzyMatchInText(result.rawText, citizen.nombre, "nombre", citizen);
      }
      if (!docFields.primerApellido && citizen.primerApellido) {
        docFields.primerApellido = findFuzzyMatchInText(result.rawText, citizen.primerApellido, "primerApellido", citizen);
      }
      if (!docFields.segundoApellido && citizen.segundoApellido) {
        docFields.segundoApellido = findFuzzyMatchInText(result.rawText, citizen.segundoApellido, "segundoApellido", citizen);
      }
    }

    // 1. Validar CURP
    let curpMatch = false;
    let detectedCurpVal = docFields.curp || "No encontrada";

    if (result.pdfType === 'Digital (Seleccionable)') {
      // Exigimos coincidencia exacta en digital
      curpMatch = docFields.curp === citizen.curp;
    } else {
      // Para OCR (Imagen) usamos búsqueda difusa Levenshtein con tolerancia de hasta 3 discrepancias
      const fuzzyResult = fuzzyFindCurp(result.rawText, citizen.curp);
      if (fuzzyResult && fuzzyResult.match) {
        curpMatch = true;
        detectedCurpVal = fuzzyResult.extracted;
      } else {
        curpMatch = false;
        if (fuzzyResult && fuzzyResult.extracted) {
          detectedCurpVal = fuzzyResult.extracted;
        }
      }
    }

    if (!curpMatch) {
      result.extractedCurp = detectedCurpVal;
      result.reason = `La CURP registrada (${citizen.curp}) no coincide con el documento PDF (se detectó: ${detectedCurpVal}).`;
      onProgress({ step: 'logic', status: 'error', message: 'CURP no coincide.' });
      return result;
    }
    result.extractedCurp = detectedCurpVal;

    // 2. Validar Nombres y Apellidos
    const isOcr = result.pdfType !== 'Digital (Seleccionable)';

    const nameMatch = compareNamesStrictly(citizen.nombre, docFields.nombre, isOcr);
    const ap1Match = compareNamesStrictly(citizen.primerApellido, docFields.primerApellido, isOcr);
    const ap2Match = compareNamesStrictly(citizen.segundoApellido || "", docFields.segundoApellido || "", isOcr);

    // Guardamos qué datos se detectaron en la comparación
    result.extractedName = docFields.nombre || "(No detectado)";
    result.extractedAp1 = docFields.primerApellido || "(No detectado)";
    result.extractedAp2 = docFields.segundoApellido || "(No detectado)";

    const sysAp2 = cleanText(citizen.segundoApellido);

    if (!nameMatch || !ap1Match || !ap2Match) {
      let faltantes = [];
      if (!nameMatch) faltantes.push(`Nombre (esperado: "${citizen.nombre}", extraído: "${docFields.nombre || 'Vacío'}")`);
      if (!ap1Match) faltantes.push(`Primer Apellido (esperado: "${citizen.primerApellido}", extraído: "${docFields.primerApellido || 'Vacío'}")`);
      if (!ap2Match) {
        const expectedAp2 = citizen.segundoApellido || 'Vacío';
        const foundAp2 = docFields.segundoApellido || 'Vacío';
        faltantes.push(`Segundo Apellido (esperado: "${expectedAp2}", extraído: "${foundAp2}")`);
      }

      result.reason = `Los datos del ciudadano no coinciden con el documento. Discrepancias detectadas: ${faltantes.join(' | ')}.`;
      onProgress({ step: 'logic', status: 'error', message: 'Datos no coinciden.' });
      return result;
    }

    // D. VALIDACIÓN: Orden de Apellidos (Factor Humano)
    // En las CURP modernas de México el orden es estricto: Primer Apellido, Segundo Apellido, Nombre(s)
    // Buscaremos si aparecen en el orden correcto en el texto del PDF.
    // Una forma simple es verificar las posiciones de las subcadenas en el texto.
    const posAp1 = textCleaned.indexOf(cleanText(citizen.primerApellido));
    const posAp2 = sysAp2 ? textCleaned.indexOf(sysAp2) : -1;
    const posNombre = textCleaned.indexOf(cleanText(citizen.nombre));

    if (sysAp2 && posAp1 !== -1 && posAp2 !== -1) {
      // Si el segundo apellido aparece ANTES que el primer apellido, están invertidos
      if (posAp2 < posAp1) {
        result.reason = `El orden de los apellidos en el documento no coincide. Se detectó el segundo apellido ('${citizen.segundoApellido}') antes que el primero ('${citizen.primerApellido}').`;
        onProgress({ step: 'logic', status: 'error', message: 'Orden de apellidos invertido.' });
        return result;
      }
    }

    // E. VALIDACIÓN: Coherencia de Iniciales de CURP (Detección de errores de dedo en registro manual)
    const isCurpStructureCorrect = validateCurpStructure(citizen.curp, citizen.nombre, citizen.primerApellido, citizen.segundoApellido);
    if (!isCurpStructureCorrect) {
      // Advertir sobre posible error del factor humano en la captura del sistema
      // Si el documento CURP es el correcto físicamente, pero la CURP guardada no cuadra con el nombre guardado.
      // Pero si la CURP física extraída coincide con la registrada, significa que cargó el archivo solicitado.
      // Sin embargo, notificamos que hay un error de iniciales.
      console.warn("Advertencia: Las iniciales de la CURP no corresponden con la estructura del nombre registrado.");
    }

    // Si pasó todos los filtros
    result.isValid = true;
    result.details = {
      curpMatch: true,
      nameMatch: true,
      ap1Match: true,
      ap2Match: sysAp2 ? true : null,
      birthCertificateCheck: 'Pass',
      structureCheck: isCurpStructureCorrect ? 'Pass' : 'Warning: Initials Mismatch'
    };

    onProgress({ step: 'logic', status: 'success', message: 'Validación completada con éxito.' });

  } catch (error) {
    console.error("Error en el motor de validación:", error);
    result.reason = "Ocurrió un error inesperado al procesar el documento: " + error.message;
    onProgress({ step: 'logic', status: 'error', message: 'Error de procesamiento.' });
  }

  return result;
}
