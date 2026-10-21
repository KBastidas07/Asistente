// Dirección de la API local que entrega las preguntas y soluciones.
const API_URL = "http://127.0.0.1:5000/api";

// Elementos de la página que se actualizan durante el chat.
const conversation = document.querySelector("#conversation");
const restartButton = document.querySelector("#restart-button");
const backButton = document.querySelector("#back-button");

// La ruta guarda los índices elegidos en el árbol de diagnóstico.
let route = [];
let isBusy = false;

// Desplaza la conversación para mostrar el mensaje más reciente.
function scrollToLatest() {
  conversation.scrollTop = conversation.scrollHeight;
}

// Bloquea los controles mientras se espera una respuesta del servidor.
function setBusy(busy) {
  isBusy = busy;
  restartButton.disabled = busy;
  backButton.disabled = busy || route.length === 0;
}

// Agrega un mensaje del usuario o del asistente al historial visible.
function addMessage(text, sender = "assistant", details = "") {
  const row = document.createElement("div");
  row.className = `message-row ${sender}`;

  if (sender === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "+";
    row.append(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";

  const label = document.createElement("p");
  label.className = "message-label";
  label.textContent = sender === "user" ? "Tú" : "Asistente";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  content.append(label, bubble);

  if (details) {
    const disclosure = document.createElement("details");
    disclosure.className = "solution-details";
    const summary = document.createElement("summary");
    summary.textContent = "Ver solución registrada";
    const solution = document.createElement("p");
    solution.textContent = details;
    disclosure.append(summary, solution);
    content.append(disclosure);
  }

  row.append(content);
  conversation.append(row);
  scrollToLatest();
  return row;
}

// Muestra botones para las opciones recibidas desde la API.
function addOptions(options) {
  const group = document.createElement("div");
  group.className = "options";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Opciones de diagnóstico");

  for (const option of options) {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.textContent = option.texto;
    button.addEventListener("click", () => selectOption(option, group));
    group.append(button);
  }

  conversation.append(group);
  scrollToLatest();
}

// Añade un mensaje temporal mientras se procesa una petición.
function addLoadingMessage() {
  const row = addMessage("Un momento, estoy consultando el diagnóstico…");
  row.querySelector(".message-bubble").classList.add("loading");
  return row;
}

// Envía una petición a la API y valida tanto la conexión como la respuesta.
async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Comprueba que el backend esté iniciado."
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("El servidor devolvió una respuesta que no es JSON válido.");
  }

  if (!response.ok) {
    throw new Error(data.error || `Error del servidor (${response.status}).`);
  }

  return data;
}

// Solicita al backend el nodo correspondiente a la ruta actual.
function requestNodeAtRoute() {
  return requestJson("/nodo", {
    method: "POST",
    body: JSON.stringify({ ruta: route }),
  });
}

// Avanza automáticamente por preguntas que solo tienen una respuesta.
async function requestCurrentNode() {
  let node = await requestNodeAtRoute();

  while (
    !node.es_final &&
    node.opciones.length === 1 &&
    node.opciones[0].texto.trim().startsWith("¿")
  ) {
    route = [...route, node.opciones[0].indice];
    node = await requestNodeAtRoute();
  }

  return node;
}

// Informa del error y permite que el usuario vuelva al comienzo.
function displayError(error) {
  addMessage(`No pude continuar: ${error.message}`);
  addOptions([{ texto: "Volver al inicio", action: "restart" }]);
}

// Limpia o inicia el chat y carga las opciones del primer nivel.
async function startChat(clear = true) {
  if (isBusy) return;
  setBusy(true);

  if (clear) {
    conversation.replaceChildren();
    route = [];
  }

  const loading = addLoadingMessage();
  try {
    const data = await requestJson("/inicio");
    loading.remove();
    addMessage(
      "Hola, soy tu asistente de soporte. Cuéntame qué tipo de inconveniente tienes seleccionando una opción."
    );
    addOptions(data.opciones || []);
  } catch (error) {
    loading.remove();
    displayError(error);
  } finally {
    setBusy(false);
  }
}

// Registra la opción elegida y presenta la pregunta o solución siguiente.
async function selectOption(option, group) {
  if (isBusy) return;

  if (option.action === "restart") {
    await startChat();
    return;
  }

  group.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  addMessage(option.texto, "user");
  route = [...route, option.indice];
  setBusy(true);
  backButton.disabled = true;

  const loading = addLoadingMessage();
  try {
    const node = await requestCurrentNode();
    loading.remove();

    if (node.es_final) {
      await showDiagnosis(node.mensaje);
    } else {
      addMessage(node.mensaje);
      addOptions(node.opciones || []);
    }
  } catch (error) {
    loading.remove();
    displayError(error);
  } finally {
    setBusy(false);
  }
}

// Muestra la explicación del modelo junto con la solución registrada.
async function showDiagnosis(solution) {
  const loading = addLoadingMessage();
  try {
    const result = await requestJson("/diagnostico", {
      method: "POST",
      body: JSON.stringify({ ruta: route }),
    });
    loading.remove();
    if (
      typeof result.explicacion !== "string" ||
      !result.explicacion.trim() ||
      typeof result.diagnostico !== "string"
    ) {
      throw new Error("El servidor no devolvió una explicación válida.");
    }
    addMessage(result.explicacion, "assistant", result.diagnostico);
    addOptions([{ texto: "Iniciar un nuevo diagnóstico", action: "restart" }]);
  } catch (error) {
    loading.remove();
    addMessage(`No pude cargar la solución registrada. ${error.message}`);
    addOptions([{ texto: "Iniciar un nuevo diagnóstico", action: "restart" }]);
  }
}

// Retrocede un nivel en el árbol y actualiza la conversación.
async function goBack() {
  if (isBusy || route.length === 0) return;

  route = route.slice(0, -1);
  setBusy(true);
  const loading = addLoadingMessage();

  try {
    if (route.length === 0) {
      const data = await requestJson("/inicio");
      loading.remove();
      addMessage("Volvamos al inicio. Selecciona el tipo de inconveniente.");
      addOptions(data.opciones || []);
    } else {
      let node = await requestNodeAtRoute();
      if (
        route.length > 1 &&
        !node.es_final &&
        node.opciones.length === 1 &&
        node.opciones[0].texto.trim().startsWith("¿")
      ) {
        route = route.slice(0, -1);
        node = await requestNodeAtRoute();
      }
      loading.remove();
      addMessage(`Volvamos a: ${node.mensaje}`);
      if (node.es_final) {
        await showDiagnosis(node.mensaje);
      } else {
        addOptions(node.opciones || []);
      }
    }
  } catch (error) {
    loading.remove();
    displayError(error);
  } finally {
    setBusy(false);
  }
}

// Conecta los botones de reinicio y retroceso con sus acciones.
restartButton.addEventListener("click", () => startChat());
backButton.addEventListener("click", goBack);

// Carga el inicio automáticamente al abrir la página.
startChat();
