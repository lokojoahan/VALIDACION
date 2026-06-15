# 🛡️ Sistema de Validación de CURP con OCR

> **Plan Valida México** — Sistema inteligente de validación cruzada de documentos CURP con reconocimiento óptico de caracteres (OCR), extracción de datos y registro ciudadano.

![Estado](https://img.shields.io/badge/Estado-Producción-brightgreen)
![Frontend](https://img.shields.io/badge/Frontend-HTML%2FCSS%2FJS-blue)
![Backend](https://img.shields.io/badge/Backend-Python%20Flask-yellow)
![Base%20de%20Datos](https://img.shields.io/badge/BD-MySQL%20(Neubox)-orange)

---

## 📋 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Pipeline de Validación](#-pipeline-de-validación)
- [API REST (Backend)](#-api-rest-backend)
- [Despliegue en Producción](#-despliegue-en-producción)
- [Funcionalidades Principales](#-funcionalidades-principales)

---

## 📖 Descripción General

Este sistema permite **registrar ciudadanos mexicanos** validando su identidad de forma automática mediante la carga de su documento CURP oficial (PDF). El sistema:

1. **Extrae texto** del documento PDF (digital o escaneado vía OCR).
2. **Compara los datos** ingresados manualmente (nombre, apellidos, CURP) contra los extraídos del documento.
3. **Valida la estructura** de la CURP según las reglas oficiales de RENAPO.
4. **Registra al ciudadano** como "Validado" o "Rechazado" en una base de datos MySQL.
5. **Almacena evidencias** de los rechazos con motivos detallados para auditoría.

---

## 🏗️ Arquitectura del Sistema

El proyecto se compone de dos módulos independientes que trabajan juntos:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (cPanel/Neubox)                  │
│                                                             │
│  index.html ─── css/styles.css                              │
│       │                                                     │
│       ├── js/app.js        (Orquestador principal)          │
│       └── js/validator.js  (Motor de validación + OCR)      │
│                                                             │
│  Librerías externas (CDN):                                  │
│    • PDF.js (lectura de PDFs)                               │
│    • Tesseract.js (OCR en el navegador)                     │
│    • Font Awesome (iconos)                                  │
│    • Google Fonts (tipografía Inter)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │  HTTP/REST (JSON + FormData)
                        │  via ngrok tunnel
┌───────────────────────▼─────────────────────────────────────┐
│                   BACKEND (Python Flask)                     │
│                                                             │
│  app.py                                                     │
│    ├── /api/citizens          (CRUD de ciudadanos)           │
│    ├── /api/citizens/register (Registro + PDF)               │
│    ├── /api/evidencias        (Repositorio de rechazos)      │
│    ├── /api/evidencias/download/:id (Descarga de PDFs)       │
│    └── /api/citizens/reset    (Reset de fábrica)             │
│                                                             │
│  Base de Datos: MySQL en Neubox (cegcontabilidad.com.mx)    │
│    ├── ciudadanos             (registros validados/rechazados)│
│    └── registro_rechazos      (evidencias de rechazo)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tecnologías Utilizadas

### Frontend
| Tecnología | Uso |
|---|---|
| **HTML5** | Estructura semántica de la interfaz |
| **CSS3** | Diseño oscuro premium con glassmorphism, animaciones y responsive design |
| **JavaScript (ES6+)** | Lógica de validación, OCR, y orquestación del pipeline |
| **PDF.js** | Extracción de texto de PDFs digitales (seleccionables) |
| **Tesseract.js** | Reconocimiento óptico de caracteres (OCR) para PDFs escaneados |

### Backend
| Tecnología | Uso |
|---|---|
| **Python 3.13** | Lenguaje del servidor |
| **Flask** | Framework web para la API REST |
| **PyMySQL** | Conector a MySQL |
| **PyMuPDF (fitz)** | Procesamiento de PDFs en el backend |
| **Pillow (PIL)** | Procesamiento de imágenes |
| **Pytesseract** | OCR del lado del servidor (fallback) |
| **ngrok** | Túnel HTTPS para exponer el backend local |

### Base de Datos
| Tecnología | Uso |
|---|---|
| **MySQL** | Almacenamiento persistente de ciudadanos y evidencias |
| **Neubox (cPanel)** | Hosting de la BD y archivos estáticos del frontend |

---

## 📁 Estructura del Proyecto

```
VALIDACION/
│
├── 📄 README.md                    # Este archivo
│
├── 📂 frontend/                    # Código del frontend (se despliega en cPanel)
│   ├── 📂 public/
│   │   ├── 📄 index.html           # Página principal (SPA)
│   │   ├── 📂 css/
│   │   │   └── 📄 styles.css       # Estilos globales (tema oscuro, glassmorphism)
│   │   └── 📂 js/
│   │       ├── 📄 app.js           # Orquestador: DOM, eventos, API calls, extracción
│   │       └── 📄 validator.js     # Motor de validación: OCR, fuzzy matching, CURP
│   │
│   ├── 📄 server.js                # Servidor Express local (desarrollo)
│   ├── 📄 package.json             # Dependencias de Node.js
│   └── 📄 database.json            # BD local en JSON (solo desarrollo)
│
└── 📂 backend/                     # API REST en Flask (se ejecuta localmente + ngrok)
    └── 📄 app.py                   # Servidor Flask: endpoints, BD MySQL, manejo de PDFs
```

---

## ⚙️ Instalación y Configuración

### Requisitos Previos

- **Node.js** v18+ (para el servidor de desarrollo del frontend)
- **Python** 3.10+ (para el backend)
- **ngrok** (para exponer el backend Flask a internet)
- **MySQL** (la BD remota ya está configurada en Neubox)

### 1. Clonar el repositorio

```bash
git clone git@github.com:lokojoahan/VALIDACION.git
cd VALIDACION
```

### 2. Configurar el Frontend (Desarrollo Local)

```bash
cd frontend
npm install
npm start
```
Esto levanta un servidor Express en `http://localhost:3000` que sirve los archivos estáticos y ofrece un API local con `database.json`.

### 3. Configurar el Backend (Flask)

```bash
cd backend

# Crear entorno virtual (recomendado)
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # Linux/Mac

# Instalar dependencias
pip install flask flask-cors pymysql pytesseract pymupdf pillow

# Ejecutar el servidor
python app.py
```
El backend correrá en `http://localhost:5000`.

### 4. Exponer el Backend con ngrok

```bash
ngrok http 5000
```

Copia la URL HTTPS que genera ngrok (ej: `https://xxxx-xxxx.ngrok-free.app`) y pégala en la constante `API_BASE` al inicio de `frontend/public/js/app.js`:

```javascript
const API_BASE = 'https://tu-url-ngrok.ngrok-free.app';
```

---

## 🔍 Pipeline de Validación

El sistema ejecuta un pipeline de 4 pasos para cada documento cargado:

### Paso 1: Lectura del PDF
- Se carga el archivo PDF en memoria usando `FileReader`.

### Paso 2: Detección de Tipo de PDF
- **PDF Digital (Seleccionable):** Se extrae el texto directamente con `PDF.js`.
- **PDF Escaneado (Imagen):** Se renderiza la página a un Canvas HD y se ejecuta OCR con `Tesseract.js`.

### Paso 3: Extracción de Datos
Se utilizan expresiones regulares para identificar los campos del documento oficial CURP:

| Campo | Patrón de Búsqueda |
|---|---|
| **CURP** | Regex oficial: `[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d` |
| **Nombre(s)** | `NOMBRE(S): <valor>` hasta la siguiente etiqueta |
| **Primer Apellido** | `PRIMER APELLIDO: <valor>` |
| **Segundo Apellido** | `SEGUNDO APELLIDO: <valor>` |

### Paso 4: Validación Cruzada Inteligente

1. **Validación de CURP:**
   - PDFs digitales: coincidencia **exacta** (18 caracteres).
   - PDFs escaneados: coincidencia **difusa** (Levenshtein ≤ 3) para tolerar errores del OCR.

2. **Validación de Nombres y Apellidos:**
   - Función `compareNamesStrictly()`: compara **palabra por palabra**.
   - Si la cantidad de palabras no coincide, **rechaza automáticamente** (ej: "JOSUE" vs "JOAHAN JOSUE").
   - Para OCR, tolera errores de Levenshtein por palabra (≤1 para palabras cortas, ≤2 para largas).

3. **Validación Estructural de CURP:**
   - Verifica que las iniciales de la CURP correspondan al nombre y apellidos ingresados.

4. **Detección de Documento Incorrecto:**
   - Rechaza automáticamente si se sube un Acta de Nacimiento en lugar de la CURP.

### Flujo de Resultados

```
   ¿CURP coincide?
        │
   NO ──┤──── ❌ Rechazado: "CURP no coincide"
        │
       SÍ
        │
   ¿Nombres coinciden?
        │
   NO ──┤──── ❌ Rechazado: "Datos no coinciden" + detalle de discrepancias
        │
       SÍ
        │
   ¿Estructura CURP válida?
        │
   NO ──┤──── ⚠️ Advertencia (no bloquea)
        │
       SÍ
        │
   ✅ Validación Exitosa → "Listo para Registrar"
```

---

## 🌐 API REST (Backend)

### Endpoints Principales

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/citizens` | Lista todos los ciudadanos registrados |
| `POST` | `/api/citizens/register` | Registra un ciudadano (con PDF adjunto) |
| `DELETE` | `/api/citizens/<id>` | Elimina un ciudadano por ID |
| `POST` | `/api/citizens/reset` | Resetea toda la base de datos |
| `GET` | `/api/evidencias` | Lista todas las evidencias de rechazo |
| `GET` | `/api/evidencias/download/<id>` | Descarga el PDF de una evidencia |
| `DELETE` | `/api/evidencias/clear` | Limpia la tabla de evidencias |

### Ejemplo: Registrar un Ciudadano

```bash
curl -X POST https://tu-ngrok.app/api/citizens/register \
  -F "nombre=JOAHAN JOSUE" \
  -F "primerApellido=CRUZ" \
  -F "segundoApellido=MANCILLA" \
  -F "curp=CUMJ040221HMNRNHA6" \
  -F "status=Validado" \
  -F "pdfFile=@./CURP.pdf"
```

### Estructura de la Base de Datos

#### Tabla `ciudadanos`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT (PK) | Identificador único |
| `nombre` | VARCHAR(100) | Nombre(s) del ciudadano |
| `primer_apellido` | VARCHAR(100) | Primer apellido |
| `segundo_apellido` | VARCHAR(100) | Segundo apellido |
| `curp` | VARCHAR(18) | Clave CURP de 18 caracteres |
| `status` | ENUM | `Validado` o `Rechazado` |
| `reason` | TEXT | Motivo del resultado |
| `details_json` | TEXT | Detalles de la validación en JSON |
| `archivo_pdf` | MEDIUMBLOB | PDF subido almacenado en binario |
| `nombre_archivo` | VARCHAR(255) | Nombre original del archivo |
| `created_at` | DATETIME | Fecha de registro |

#### Tabla `registro_rechazos`
| Columna | Tipo | Descripción |
|---|---|---|
| `id` | INT (PK) | Identificador único |
| `citizen_id` | INT | ID del ciudadano rechazado |
| `fecha` | DATETIME | Fecha del rechazo |
| `nombre_completo` | VARCHAR(255) | Nombre completo que se intentó registrar |
| `curp_ingresada` | VARCHAR(18) | CURP ingresada |
| `motivo_rechazo` | TEXT | Motivo del rechazo |
| `detalles_json` | TEXT | Detalles de validación en JSON |
| `archivo_pdf` | MEDIUMBLOB | PDF subido como evidencia |
| `nombre_archivo` | VARCHAR(255) | Nombre del archivo PDF |

---

## 🚀 Despliegue en Producción

### Frontend → cPanel (Neubox)

1. Acceder al **Administrador de Archivos** en cPanel.
2. Navegar a `public_html/planvalida/`.
3. Subir los archivos:
   - `index.html` → raíz
   - `css/styles.css` → carpeta `css/`
   - `js/app.js` y `js/validator.js` → carpeta `js/`
4. Asegurarse de que `API_BASE` en `app.js` apunte a la URL de ngrok activa.

### Backend → Local + ngrok

1. Ejecutar `python app.py` en la máquina local.
2. Ejecutar `ngrok http 5000` para obtener la URL pública.
3. Actualizar `API_BASE` en el frontend si cambió la URL de ngrok.

### URL de Producción

```
https://proyecto2.cegcontabilidad.com.mx/planvalida/
```

---

## ✨ Funcionalidades Principales

### 🔄 Autocompletado Inteligente
Si el usuario sube un PDF **sin llenar el formulario**, el sistema extrae automáticamente los datos del documento y autocompleta los campos.

### 🔁 Revalidación en Tiempo Real
Si el usuario modifica un campo después de una validación exitosa, el sistema detecta el cambio y re-ejecuta la validación automáticamente.

### 📊 Dashboard de Estadísticas
Panel con conteo en tiempo real de ciudadanos validados, rechazados y total.

### 📁 Repositorio de Evidencias
Pestaña dedicada para consultar todos los registros rechazados con:
- Nombre y CURP del intento.
- Motivo del rechazo.
- Fecha y hora.
- Descarga del PDF original de evidencia.

### 🎨 Interfaz Premium
- Tema oscuro con glassmorphism.
- Animaciones suaves y micro-interacciones.
- Diseño responsive para desktop y móvil.
- Stepper visual del pipeline de validación.

### 🔐 Validación Robusta
- Comparación estricta palabra por palabra de nombres.
- Tolerancia a errores OCR con distancia de Levenshtein.
- Validación estructural de la CURP según reglas de RENAPO.
- Detección de documentos incorrectos (Acta de Nacimiento vs CURP).

---

## 👥 Autores

- **Joahan Josue Cruz Mancilla**

---

## 📄 Licencia

Este proyecto fue desarrollado como parte de la materia **Laboratorio de Paradigmas de Programación** - Proyecto 2.
