
"""API local que recorre el árbol de diagnóstico y consulta el modelo."""

import json
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

from ApiLLM import explicar_solucion

app = Flask(__name__)
CORS(app)

ARCHIVO_JSON = Path(__file__).with_name(
    "EstructurasDeDatos.json"
)


def cargar_arbol():
    """Lee el árbol de diagnóstico desde el archivo JSON."""
    with open(ARCHIVO_JSON, "r", encoding="utf-8") as archivo:
        return json.load(archivo)


def obtener_nodo(ruta):
    """Recorre los índices de la ruta y devuelve el nodo y su texto."""
    nodo = cargar_arbol()
    camino = [nodo["valor"]]

    for indice in ruta:
        hijos = nodo.get("hijos", [])

        if not isinstance(indice, int):
            raise ValueError("Los índices deben ser números enteros.")

        if indice < 0 or indice >= len(hijos):
            raise ValueError("La ruta del diagnóstico no es válida.")

        nodo = hijos[indice]
        camino.append(nodo["valor"])

    return nodo, camino


def mostrar_opcion(valor):
    """Acorta las opciones largas y conserva respuestas Sí/No breves."""
    valor = valor.strip()

    for respuesta in ("Sí:", "Si:", "No:"):
        if valor.startswith(respuesta):
            return respuesta.rstrip(":")

    if len(valor) > 100:
        return valor[:97] + "..."

    return valor


def limpiar_solucion(valor):
    """Devuelve la recomendación sin la respuesta ni los metadatos internos."""
    valor = valor.strip()

    for respuesta in ("Sí:", "Si:", "No:"):
        if valor.startswith(respuesta):
            valor = valor[len(respuesta):].strip()
            break

    return valor.split(" Perfil:", maxsplit=1)[0].strip()


@app.get("/api/inicio")
def inicio():
    """Devuelve el tema inicial y las opciones del primer nivel."""
    try:
        raiz = cargar_arbol()

        return jsonify({
            "mensaje": raiz["valor"],
            "ruta": [],
            "opciones": [
                {
                    "indice": i,
                    "texto": mostrar_opcion(hijo["valor"])
                }
                for i, hijo in enumerate(raiz.get("hijos", []))
            ]
        })

    except (OSError, json.JSONDecodeError, KeyError) as error:
        return jsonify({"error": str(error)}), 500


@app.post("/api/nodo")
def consultar_nodo():
    """Devuelve el nodo indicado por la ruta y sus opciones siguientes."""
    datos = request.get_json(silent=True) or {}
    ruta = datos.get("ruta", [])

    if not isinstance(ruta, list):
        return jsonify({"error": "La ruta debe ser una lista."}), 400

    try:
        nodo, _ = obtener_nodo(ruta)
        hijos = nodo.get("hijos", [])
        mensaje = (
            limpiar_solucion(nodo["valor"])
            if not hijos
            else nodo["valor"]
        )

        return jsonify({
            "mensaje": mensaje,
            "ruta": ruta,
            "es_final": len(hijos) == 0,
            "opciones": [
                {
                    "indice": i,
                    "texto": mostrar_opcion(hijo["valor"])
                }
                for i, hijo in enumerate(hijos)
            ]
        })

    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (OSError, json.JSONDecodeError, KeyError) as error:
        return jsonify({"error": str(error)}), 500


@app.post("/api/diagnostico")
def diagnostico():
    """Explica una solución cuando la ruta ya llega a una hoja del árbol."""
    datos = request.get_json(silent=True) or {}
    ruta = datos.get("ruta", [])

    if not isinstance(ruta, list):
        return jsonify({"error": "La ruta debe ser una lista."}), 400

    try:
        nodo, camino = obtener_nodo(ruta)

        if nodo.get("hijos", []):
            return jsonify({
                "error": "El diagnóstico todavía no ha terminado."
            }), 400

        solucion = limpiar_solucion(nodo["valor"])
        explicacion = explicar_solucion(solucion)

        return jsonify({
            "diagnostico": solucion,
            "explicacion": explicacion,
            "ruta": camino
        })

    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (OSError, json.JSONDecodeError, KeyError) as error:
        return jsonify({"error": str(error)}), 500
    except Exception:
        app.logger.exception("Error al consultar Ollama")
        return jsonify({
            "error": "No se pudo generar la explicación. "
                     "Verifica que Ollama esté funcionando."
        }), 503


if __name__ == "__main__":
    # Inicia la API solo al ejecutar este archivo directamente.
    app.run(host="127.0.0.1", port=5000, debug=False)
