import os
import pymysql
import datetime
import json
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import pytesseract
import fitz  # PyMuPDF
from PIL import Image
import io
import re

app = Flask(__name__)
CORS(app)

# ========================================================
# 1. CREDENCIALES DE LA BASE DE DATOS EN NEUBOX
# ========================================================
DB_HOST = 'cegcontabilidad.com.mx'
DB_USER = 'cegconta_proyecto'
DB_PASS = 'UVV;8h^yF-VvpK+1'
DB_NAME = 'cegconta_evidencias'


def conectar_bd():
    return pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS,
        database=DB_NAME, cursorclass=pymysql.cursors.DictCursor
    )


def inicializar_bd():
    """Crea las tablas necesarias si no existen."""
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            # Tabla de ciudadanos (reemplaza database.json)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS ciudadanos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nombre VARCHAR(100) NOT NULL,
                    primer_apellido VARCHAR(100) NOT NULL,
                    segundo_apellido VARCHAR(100) DEFAULT '',
                    curp VARCHAR(18) NOT NULL,
                    status ENUM('Validado', 'Rechazado') NOT NULL,
                    reason TEXT,
                    details_json TEXT,
                    archivo_pdf MEDIUMBLOB,
                    nombre_archivo VARCHAR(255) DEFAULT '',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')
            # Tabla de rechazos/evidencias
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS registro_rechazos (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    citizen_id INT,
                    fecha DATETIME,
                    nombre_completo VARCHAR(255),
                    curp_ingresada VARCHAR(18),
                    motivo_rechazo TEXT,
                    detalles_json TEXT,
                    archivo_pdf MEDIUMBLOB,
                    nombre_archivo VARCHAR(255) DEFAULT ''
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ''')
        conexion.commit()
        conexion.close()
        print("[OK] Conexion exitosa a NEUBOX. Tablas listas.")
    except Exception as e:
        print(f"[ERROR] Error conectando a la BD: {e}")


inicializar_bd()


# ========================================================
# 2. ENDPOINTS DE LA API
# ========================================================

# --- GET /api/citizens ---
# Lista todos los ciudadanos registrados
@app.route('/api/citizens', methods=['GET'])
def listar_ciudadanos():
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute('SELECT * FROM ciudadanos ORDER BY created_at DESC')
            rows = cursor.fetchall()
        conexion.close()

        ciudadanos = []
        for row in rows:
            details = {}
            if row.get('details_json'):
                try:
                    details = json.loads(row['details_json'])
                except:
                    details = {}

            ciudadanos.append({
                'id': str(row['id']),
                'nombre': row['nombre'],
                'primerApellido': row['primer_apellido'],
                'segundoApellido': row['segundo_apellido'] or '',
                'curp': row['curp'],
                'status': row['status'],
                'details': details
            })

        return jsonify(ciudadanos), 200
    except Exception as e:
        return jsonify({'error': f'Error al obtener ciudadanos: {str(e)}'}), 500


# --- POST /api/citizens/register ---
# Registra un ciudadano (Validado o Rechazado) con archivo PDF
@app.route('/api/citizens/register', methods=['POST'])
def registrar_ciudadano():
    nombre = request.form.get('nombre', '').strip()
    primer_apellido = request.form.get('primerApellido', '').strip()
    segundo_apellido = request.form.get('segundoApellido', '').strip()
    curp = request.form.get('curp', '').strip().upper()
    status = request.form.get('status', '').strip()
    reason = request.form.get('reason', '').strip()
    details_raw = request.form.get('details', '{}')

    # Log de depuracion
    has_file = 'document' in request.files
    print(f"[REGISTER] nombre='{nombre}' ap1='{primer_apellido}' curp='{curp}' status='{status}' has_file={has_file}")

    # Validar campos obligatorios
    if not nombre or not primer_apellido or not curp:
        print(f"[REGISTER ERROR] Campos faltantes: nombre={bool(nombre)}, ap1={bool(primer_apellido)}, curp={bool(curp)}")
        return jsonify({'error': 'Faltan campos obligatorios (nombre, primerApellido, curp).'}), 400

    if status not in ['Validado', 'Rechazado']:
        print(f"[REGISTER ERROR] Status invalido: '{status}'")
        return jsonify({'error': 'Estado de validacion invalido.'}), 400

    # Parsear detalles
    try:
        details = json.loads(details_raw)
    except:
        details = {}

    # Leer archivo PDF si se envió
    pdf_bytes = None
    nombre_archivo = ''
    if 'document' in request.files:
        archivo = request.files['document']
        if archivo.filename:
            pdf_bytes = archivo.read()
            nombre_archivo = archivo.filename

    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:

            if status == 'Validado':
                # Verificar si ya existe un validado con esa CURP
                cursor.execute(
                    "SELECT id FROM ciudadanos WHERE UPPER(curp) = %s AND status = 'Validado' LIMIT 1",
                    (curp,)
                )
                if cursor.fetchone():
                    conexion.close()
                    return jsonify({'error': 'Ya existe un ciudadano validado con esta CURP.'}), 400

                # Requiere PDF para validados
                if not pdf_bytes:
                    conexion.close()
                    return jsonify({'error': 'Se requiere subir el PDF para registrar como Validado.'}), 400

                # Agregar metadata
                details['validatedAt'] = datetime.datetime.now().isoformat()
                details['fileName'] = nombre_archivo

                details_json = json.dumps(details, ensure_ascii=False)

                cursor.execute(
                    '''INSERT INTO ciudadanos
                       (nombre, primer_apellido, segundo_apellido, curp, status, reason, details_json, archivo_pdf, nombre_archivo)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    (nombre, primer_apellido, segundo_apellido, curp, status, reason, details_json, pdf_bytes, nombre_archivo)
                )
                conexion.commit()
                new_id = str(cursor.lastrowid)
                conexion.close()

                return jsonify({
                    'message': 'Ciudadano registrado y validado con éxito.',
                    'citizen': {
                        'id': new_id,
                        'nombre': nombre,
                        'primerApellido': primer_apellido,
                        'segundoApellido': segundo_apellido,
                        'curp': curp,
                        'status': status,
                        'details': details
                    }
                }), 201

            else:  # Rechazado
                details['rejectedAt'] = datetime.datetime.now().isoformat()
                if nombre_archivo:
                    details['fileName'] = nombre_archivo

                details_json = json.dumps(details, ensure_ascii=False)

                # Insertar en ciudadanos
                cursor.execute(
                    '''INSERT INTO ciudadanos
                       (nombre, primer_apellido, segundo_apellido, curp, status, reason, details_json, archivo_pdf, nombre_archivo)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
                    (nombre, primer_apellido, segundo_apellido, curp, status, reason, details_json, pdf_bytes, nombre_archivo)
                )
                citizen_id = cursor.lastrowid

                # Insertar en registro_rechazos (evidencias)
                nombre_completo = f"{nombre} {primer_apellido} {segundo_apellido}".strip()
                cursor.execute(
                    '''INSERT INTO registro_rechazos
                       (citizen_id, fecha, nombre_completo, curp_ingresada, motivo_rechazo, detalles_json, archivo_pdf, nombre_archivo)
                       VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s)''',
                    (citizen_id, nombre_completo, curp, reason or 'Error de validación', details_json, pdf_bytes, nombre_archivo)
                )
                conexion.commit()
                conexion.close()

                return jsonify({
                    'message': 'Registro guardado como rechazado por validación fallida.',
                    'citizen': {
                        'id': str(citizen_id),
                        'nombre': nombre,
                        'primerApellido': primer_apellido,
                        'segundoApellido': segundo_apellido,
                        'curp': curp,
                        'status': status,
                        'details': details
                    }
                }), 201

    except Exception as e:
        return jsonify({'error': f'Error al registrar ciudadano: {str(e)}'}), 500


# --- POST /api/citizens/reset ---
# Resetea la base de datos y limpia todo
@app.route('/api/citizens/reset', methods=['POST'])
def resetear_bd():
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute('TRUNCATE TABLE ciudadanos')
            cursor.execute('TRUNCATE TABLE registro_rechazos')
        conexion.commit()
        conexion.close()
        return jsonify({'message': 'Base de datos y archivos restablecidos de fábrica con éxito.'}), 200
    except Exception as e:
        return jsonify({'error': f'Error al restablecer: {str(e)}'}), 500


# --- GET /api/evidencias ---
# Lista las evidencias de rechazo
@app.route('/api/evidencias', methods=['GET'])
def listar_evidencias():
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute(
                '''SELECT id, citizen_id, fecha, nombre_completo, curp_ingresada,
                          motivo_rechazo, detalles_json, nombre_archivo
                   FROM registro_rechazos ORDER BY fecha DESC'''
            )
            rows = cursor.fetchall()
        conexion.close()

        evidencias = []
        for row in rows:
            detalles = {}
            if row.get('detalles_json'):
                try:
                    detalles = json.loads(row['detalles_json'])
                except:
                    detalles = {}

            fecha_iso = ''
            if row.get('fecha'):
                fecha_iso = row['fecha'].isoformat()

            evidencias.append({
                'id': f"{row.get('citizen_id', 0)}_{int(row['fecha'].timestamp()) if row.get('fecha') else 0}",
                'dbId': str(row['id']),
                'citizenId': str(row.get('citizen_id', '')),
                'nombre': row.get('nombre_completo', ''),
                'curpRegistrada': row.get('curp_ingresada', ''),
                'fechaIntento': fecha_iso,
                'motivoRechazo': row.get('motivo_rechazo', ''),
                'archivoPdf': row.get('nombre_archivo', ''),
                'detallesValidacion': detalles
            })

        return jsonify(evidencias), 200
    except Exception as e:
        return jsonify({'error': f'Error al obtener evidencias: {str(e)}'}), 500


# --- POST /api/evidencias/clear ---
# Vacía el repositorio de evidencias
@app.route('/api/evidencias/clear', methods=['POST'])
def vaciar_evidencias():
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute('TRUNCATE TABLE registro_rechazos')
        conexion.commit()
        conexion.close()
        return jsonify({'message': 'Repositorio de evidencias de rechazo vaciado exitosamente.'}), 200
    except Exception as e:
        return jsonify({'error': f'Error al vaciar evidencias: {str(e)}'}), 500


# --- GET /api/validos/download/<id> ---
# Descarga el PDF de un ciudadano validado por su ID
@app.route('/api/validos/download/<int:citizen_id>', methods=['GET'])
def descargar_valido(citizen_id):
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT archivo_pdf, nombre_archivo FROM ciudadanos WHERE id = %s AND status = 'Validado'",
                (citizen_id,)
            )
            row = cursor.fetchone()
        conexion.close()

        if not row or not row.get('archivo_pdf'):
            return jsonify({'error': 'Archivo validado no encontrado.'}), 404

        nombre = row.get('nombre_archivo') or f'CURP_{citizen_id}.pdf'
        return Response(
            row['archivo_pdf'],
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{nombre}"',
                'Content-Length': str(len(row['archivo_pdf']))
            }
        )
    except Exception as e:
        return jsonify({'error': f'Error al descargar: {str(e)}'}), 500


# --- GET /api/evidencias/download/<id> ---
# Descarga el PDF de una evidencia de rechazo por su ID
@app.route('/api/evidencias/download/<int:evidence_id>', methods=['GET'])
def descargar_evidencia(evidence_id):
    try:
        conexion = conectar_bd()
        with conexion.cursor() as cursor:
            cursor.execute(
                "SELECT archivo_pdf, nombre_archivo FROM registro_rechazos WHERE id = %s",
                (evidence_id,)
            )
            row = cursor.fetchone()
        conexion.close()

        if not row or not row.get('archivo_pdf'):
            return jsonify({'error': 'Archivo de evidencia no encontrado.'}), 404

        nombre = row.get('nombre_archivo') or f'evidencia_{evidence_id}.pdf'
        return Response(
            row['archivo_pdf'],
            mimetype='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{nombre}"',
                'Content-Length': str(len(row['archivo_pdf']))
            }
        )
    except Exception as e:
        return jsonify({'error': f'Error al descargar: {str(e)}'}), 500


# --- POST /validar-curp (ORIGINAL de app.py) ---
# Endpoint original de validación OCR del lado servidor
@app.route('/validar-curp', methods=['POST'])
def validar_curp():
    if 'documento' not in request.files:
        return jsonify({'error': 'No se envió ningún documento'}), 400

    nombre = request.form.get('nombre', '').strip().upper()
    ap_paterno = request.form.get('apPaterno', '').strip().upper()
    ap_materno = request.form.get('apMaterno', '').strip().upper()
    curp_esperada = request.form.get('curp_esperada', '').strip().upper()

    archivo_pdf = request.files['documento']

    try:
        pdf_bytes = archivo_pdf.read()
        pdf_document = fitz.open(stream=pdf_bytes, filetype="pdf")
        primera_pagina = pdf_document.load_page(0)

        # Detección y Extracción
        texto_extraido = primera_pagina.get_text().upper()
        if len(texto_extraido.strip()) < 50:
            pix = primera_pagina.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes()))
            texto_extraido = pytesseract.image_to_string(img, lang='spa').upper()

        # Limpieza de texto
        texto_super_limpio = re.sub(r'[\s\n\r\-]', '', texto_extraido)

        curp_valida = curp_esperada in texto_super_limpio
        apellidos_validos = ap_paterno in texto_extraido and ap_materno in texto_extraido

        if curp_valida and apellidos_validos:
            return jsonify({'mensaje': 'El documento es auténtico y los datos coinciden.'}), 200
        else:
            fecha_actual = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            nombre_completo = f"{nombre} {ap_paterno} {ap_materno}"

            conexion = conectar_bd()
            with conexion.cursor() as cursor:
                cursor.execute('''
                    INSERT INTO registro_rechazos
                    (fecha, nombre_completo, curp_ingresada, motivo_rechazo, archivo_pdf)
                    VALUES (%s, %s, %s, %s, %s)
                ''', (fecha_actual, nombre_completo, curp_esperada, 'Datos no coinciden con OCR', pdf_bytes))
            conexion.commit()
            conexion.close()

            return jsonify({'error': 'Los datos no coinciden. Expediente guardado en NEUBOX.'}), 400

    except Exception as e:
        return jsonify({'error': f'Error interno: {str(e)}'}), 500


# ========================================================
# 3. INICIAR SERVIDOR
# ========================================================
if __name__ == '__main__':
    print("========================================================")
    print("Servidor PlanValida (Flask) ejecutándose en http://localhost:5000")
    print("Usa ngrok para exponer: ngrok http 5000")
    print("========================================================")
    app.run(debug=True, port=5000)