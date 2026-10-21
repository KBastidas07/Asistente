
import logging
import ollama

MODELO = "soporte-tecnico:latest"

logger = logging.getLogger(__name__)

INSTRUCCIONES_SISTEMA = """
Eres un asistente de soporte técnico que explica soluciones
de diagnóstico de manera clara, sencilla y útil.

Tu función es explicar la solución que proporciona el árbol
de diagnóstico, no realizar un diagnóstico nuevo.

REGLAS:
1. Responde siempre en español.
2. Explica la solución con palabras sencillas y naturales.
3. No te limites a copiar o cambiar unas pocas palabras del texto.
4. Si hay varias acciones, organízalas en pasos numerados.
5. Explica brevemente para qué sirve cada acción cuando
   se pueda deducir de la información proporcionada.
6. Conserva los detalles técnicos, las instrucciones y
   las condiciones importantes de la solución original.
7. No inventes causas confirmadas, resultados de pruebas,
   procedimientos ni información específica del equipo.
8. Si la solución indica que el problema puede persistir,
   conserva esa condición y explica cuándo solicitar soporte.
9. No contradigas la solución original.
10. No agregues saludos, encabezados innecesarios ni
    comentarios sobre cómo generaste la respuesta.

Devuelve directamente la explicación dirigida al usuario.
"""


def explicar_solucion(solucion: str) -> str:
    """
    Genera una explicación clara de la solución seleccionada
    en el árbol de diagnóstico.
    """

    if not isinstance(solucion, str) or not solucion.strip():
        logger.warning("Se recibió una solución vacía o inválida.")
        return "No hay una solución disponible para explicar."

    solucion = solucion.strip()

    prompt = f"""
Explica la siguiente solución de soporte técnico al usuario.

No cambies el objetivo de las instrucciones. Explica qué debe
hacer y, cuando sea posible deducirlo, para qué sirve cada paso.

SOLUCIÓN ORIGINAL:
{solucion}

Redacta una explicación útil y fácil de seguir. Evita repetir
innecesariamente el texto original y no añadas información
técnica que no esté respaldada por la solución.
"""

    try:
        respuesta = ollama.chat(
            model=MODELO,
            messages=[
                {
                    "role": "system",
                    "content": INSTRUCCIONES_SISTEMA,
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            options={
                "temperature": 0.3,
                "num_predict": 300,
            },
        )

        contenido = respuesta["message"]["content"].strip()

        if not contenido:
            logger.warning(
                "Ollama devolvió una explicación vacía."
            )
            return solucion

        return contenido

    except Exception:
        logger.exception(
            "Error al generar la explicación con %s.",
            MODELO,
        )
        return solucion
