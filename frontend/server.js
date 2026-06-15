const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS y JSON parser
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir la carpeta frontend estática
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de archivos
const DB_FILE = path.join(__dirname, 'database.json');
const VALIDOS_DIR = path.join(__dirname, 'validos');
const EVIDENCIAS_DIR = path.join(__dirname, 'evidencias');

// Asegurar que existan las carpetas necesarias
if (!fs.existsSync(VALIDOS_DIR)) {
  fs.mkdirSync(VALIDOS_DIR, { recursive: true });
}
if (!fs.existsSync(EVIDENCIAS_DIR)) {
  fs.mkdirSync(EVIDENCIAS_DIR, { recursive: true });
}

// Configurar almacenamiento de Multer (temporal en memoria antes de validar y mover)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // Límite de 15MB por PDF
});

// Lista de ciudadanos por defecto (Semilla vacía por requerimiento)
const SEED_CITIZENS = [];

// Helper para leer base de datos
function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(SEED_CITIZENS, null, 2), 'utf8');
      return SEED_CITIZENS;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error al leer la base de datos:", error);
    return SEED_CITIZENS;
  }
}

// Helper para escribir base de datos
function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Error al escribir la base de datos:", error);
  }
}

// --- API ENDPOINTS ---

// 1. Obtener lista de ciudadanos
app.get('/api/citizens', (req, res) => {
  const citizens = readDatabase();
  res.json(citizens);
});

// 2. Registrar ciudadano y validar CURP (Flujo Unificado)
app.post('/api/citizens/register', upload.single('document'), (req, res) => {
  const { nombre, primerApellido, segundoApellido, curp, status, reason, details } = req.body;
  const file = req.file;

  if (!nombre || !primerApellido || !curp) {
    return res.status(400).json({ error: "Faltan campos obligatorios (nombre, primerApellido, curp)." });
  }

  if (!status || !['Validado', 'Rechazado'].includes(status)) {
    return res.status(400).json({ error: "Estado de validación inválido." });
  }

  const citizens = readDatabase();
  
  // Si es aprobado, validar si ya existe un registro aprobado con esa CURP
  if (status === 'Validado' && citizens.some(c => c.curp.toUpperCase() === curp.toUpperCase() && c.status === 'Validado')) {
    return res.status(400).json({ error: "Ya existe un ciudadano validado con esta CURP." });
  }

  const id = String(Date.now());
  const timestamp = Date.now();
  const cleanName = `${nombre}_${primerApellido}`.replace(/[^a-zA-Z0-9]/g, "_");

  let parsedDetails = {};
  try {
    parsedDetails = details ? JSON.parse(details) : {};
  } catch (e) {
    parsedDetails = { rawDetails: details };
  }

  let finalFileName = "";

  if (status === 'Validado') {
    if (!file) {
      return res.status(400).json({ error: "Se requiere subir el PDF para registrar como Validado." });
    }
    finalFileName = `${id}_CURP.pdf`;
    const filePath = path.join(VALIDOS_DIR, finalFileName);
    fs.writeFileSync(filePath, file.buffer);

    const newCitizen = {
      id: id,
      nombre: nombre.trim(),
      primerApellido: primerApellido.trim(),
      segundoApellido: (segundoApellido || "").trim(),
      curp: curp.toUpperCase().trim(),
      status: 'Validado',
      details: {
        validatedAt: new Date().toISOString(),
        fileName: finalFileName,
        ...parsedDetails
      }
    };

    citizens.push(newCitizen);
    writeDatabase(citizens);
    return res.status(201).json({ message: "Ciudadano registrado y validado con éxito.", citizen: newCitizen });
  } else {
    // Si es rechazado, guardamos en la carpeta "evidencias" con timestamp para auditoría
    if (file) {
      finalFileName = `${id}_${timestamp}_${cleanName}_RECHAZADO.pdf`;
      const pdfFilePath = path.join(EVIDENCIAS_DIR, finalFileName);
      fs.writeFileSync(pdfFilePath, file.buffer);

      const jsonFileName = `${id}_${timestamp}_${cleanName}_RECHAZADO.json`;
      const jsonFilePath = path.join(EVIDENCIAS_DIR, jsonFileName);
      
      const evidenceMetadata = {
        id: `${id}_${timestamp}`,
        citizenId: id,
        nombre: `${nombre} ${primerApellido} ${segundoApellido || ''}`.trim(),
        curpRegistrada: curp.toUpperCase().trim(),
        fechaIntento: new Date().toISOString(),
        motivoRechazo: reason || "Error de validación desconocido",
        archivoPdf: finalFileName,
        detallesValidacion: parsedDetails
      };

      fs.writeFileSync(jsonFilePath, JSON.stringify(evidenceMetadata, null, 2), 'utf8');
    }

    const newCitizen = {
      id: id,
      nombre: nombre.trim(),
      primerApellido: primerApellido.trim(),
      segundoApellido: (segundoApellido || "").trim(),
      curp: curp.toUpperCase().trim(),
      status: 'Rechazado',
      details: {
        rejectedAt: new Date().toISOString(),
        reason: reason || "Error de validación",
        fileName: finalFileName,
        ...parsedDetails
      }
    };

    citizens.push(newCitizen);
    writeDatabase(citizens);
    return res.status(201).json({ message: "Registro guardado como rechazado por validación fallida.", citizen: newCitizen });
  }
});

// 3. Resetear base de datos y limpiar archivos para ahorrar almacenamiento
app.post('/api/citizens/reset', (req, res) => {
  // Escribir semilla en base de datos
  writeDatabase(SEED_CITIZENS);

  // Limpiar carpeta de válidos
  try {
    const validFiles = fs.readdirSync(VALIDOS_DIR);
    for (const file of validFiles) {
      fs.unlinkSync(path.join(VALIDOS_DIR, file));
    }
  } catch (err) {
    console.error("Error al limpiar carpeta de válidos:", err);
  }

  // Limpiar carpeta de evidencias
  try {
    const evidenceFiles = fs.readdirSync(EVIDENCIAS_DIR);
    for (const file of evidenceFiles) {
      fs.unlinkSync(path.join(EVIDENCIAS_DIR, file));
    }
  } catch (err) {
    console.error("Error al limpiar carpeta de evidencias:", err);
  }

  res.json({ message: "Base de datos y archivos restablecidos de fábrica con éxito." });
});

// (La validación se realiza en la ruta /api/citizens/register de manera unificada)

// 5. Obtener lista de evidencias rechazadas
app.get('/api/evidencias', (req, res) => {
  try {
    const files = fs.readdirSync(EVIDENCIAS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const evidences = jsonFiles.map(file => {
      const filePath = path.join(EVIDENCIAS_DIR, file);
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    });

    // Ordenar de más reciente a más antiguo
    evidences.sort((a, b) => new Date(b.fechaIntento) - new Date(a.fechaIntento));
    
    res.json(evidences);
  } catch (error) {
    console.error("Error al leer evidencias:", error);
    res.status(500).json({ error: "Error al obtener las evidencias." });
  }
});

// 6. Descargar archivo PDF de evidencias
app.get('/api/evidencias/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(EVIDENCIAS_DIR, filename);

  // Evitar ataques de trayectoria de directorios
  if (path.dirname(filePath) !== EVIDENCIAS_DIR) {
    return res.status(403).json({ error: "Acceso no autorizado." });
  }

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "Archivo de evidencia no encontrado." });
  }
});

// 7. Descargar archivo PDF de CURPs válidos
app.get('/api/validos/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(VALIDOS_DIR, filename);

  if (path.dirname(filePath) !== VALIDOS_DIR) {
    return res.status(403).json({ error: "Acceso no autorizado." });
  }

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: "Archivo validado no encontrado." });
  }
});

// 8. Vaciar evidencias manualmente para ahorrar espacio en disco
app.post('/api/evidencias/clear', (req, res) => {
  try {
    const files = fs.readdirSync(EVIDENCIAS_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(EVIDENCIAS_DIR, file));
    }
    res.json({ message: "Repositorio de evidencias de rechazo vaciado exitosamente." });
  } catch (error) {
    console.error("Error al vaciar evidencias:", error);
    res.status(500).json({ error: "Error al vaciar el repositorio de evidencias." });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`Servidor PlanValida ejecutándose en http://localhost:${PORT}`);
  console.log(`Repositorio de evidencias físicas: ${EVIDENCIAS_DIR}`);
  console.log(`========================================================`);
});
