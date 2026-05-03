/* ==========================================================================
   DungeonMaker — lógica de la aplicación
   - Gestiona el formulario, persiste la API key opcionalmente y llama a
     OpenAI mostrando la respuesta en streaming.
   ========================================================================== */

(() => {
  "use strict";

  const API_URL = "https://api.openai.com/v1/chat/completions";
  const MODEL = "gpt-4o-mini";
  const STORAGE_KEY = "dungeonmaker.api_key";

  const DURATION_TOKENS = {
    corta: 900,
    media: 1800,
    larga: 3500,
    extensa: 12000,
  };

  const DURATION_LABELS = {
    corta: "corta (alrededor de 500 palabras)",
    media: "media (alrededor de 1000 palabras)",
    larga: "larga (alrededor de 2000 palabras)",
    extensa: "muy extensa (mínimo 6000 palabras, no recortes la trama)",
  };

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);

  const apiKeyInput = $("#api-key");
  const toggleKeyBtn = $("#toggle-key");
  const forgetKeyBtn = $("#forget-key");
  const rememberKey = $("#remember-key");

  const form = $("#story-form");
  const generateBtn = $("#generate-btn");
  const loadingEl = $("#loading");
  const errorEl = $("#error");
  const errorMsg = $("#error-message");
  const outputEl = $("#story-output");
  const storyEl = $("#story-content");
  const copyBtn = $("#copy-btn");
  const newBtn = $("#new-btn");

  const charsSection = $("#chars-section");
  const charsEmpty = $("#chars-empty");
  const charsLoadingInline = $("#chars-loading-inline");
  const charsContent = $("#chars-content");
  const generateCharsBtn = $("#generate-chars-btn");
  const generateCharsLabel = $("#generate-chars-label");
  const copyCharsBtn = $("#copy-chars-btn");
  const charactersInput = form.elements.namedItem("characters");

  const enemiesSection = $("#enemies-section");
  const enemiesEmpty = $("#enemies-empty");
  const enemiesLoadingInline = $("#enemies-loading-inline");
  const enemiesContent = $("#enemies-content");
  const generateEnemiesBtn = $("#generate-enemies-btn");
  const generateEnemiesLabel = $("#generate-enemies-label");
  const copyEnemiesBtn = $("#copy-enemies-btn");

  // ---------- API key persistence ----------
  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) apiKeyInput.value = savedKey;

  toggleKeyBtn.addEventListener("click", () => {
    apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
  });

  forgetKeyBtn.addEventListener("click", () => {
    apiKeyInput.value = "";
    localStorage.removeItem(STORAGE_KEY);
    apiKeyInput.focus();
  });

  // ---------- Prompt building ----------
  function buildPrompt(data) {
    const lines = [
      "Genera una aventura completa de Dungeons & Dragons (5ª edición) con los siguientes parámetros:",
      "",
      `**Temas:** ${data.themes.join(", ")}`,
      `**Tono:** ${data.tone}`,
      `**Duración aproximada:** ${DURATION_LABELS[data.duration] || data.duration}`,
    ];

    const optional = [
      ["Lugares relevantes", data.cities],
      ["Personajes principales del grupo", data.characters],
      ["Antagonista principal / Jefe final", data.villain],
      ["Enemigos secundarios", data.enemies],
      ["Ambientación específica", data.setting],
      ["Notas adicionales del DM", data.notes],
    ];

    for (const [label, value] of optional) {
      if (value && value.trim()) {
        lines.push(`**${label}:** ${value.trim()}`);
      }
    }

    lines.push(
      "",
      "Estructura tu respuesta en Markdown con estas secciones:",
      "1. Título de la aventura (como `# Título`)",
      "2. Sinopsis breve",
      "3. Gancho de inicio para los personajes",
      "4. **Acto I — Introducción**: lugar, NPCs clave y primeros eventos",
      "5. **Acto II — Desarrollo**: al menos dos escenas con desafíos (combate, social o exploración)",
      "6. **Acto III — Clímax**: confrontación final con el villano",
      "7. **Conclusión y recompensas**",
      "",
      "Usa lenguaje evocador y descriptivo, pero mantén la información jugable y clara para que el DM pueda dirigirla en mesa.",
    );

    if (data.duration === "extensa") {
      lines.push(
        "",
        "IMPORTANTE: la duración es 'extensa' — la aventura debe ocupar como mínimo 6000 palabras.",
        "Para llegar a esa extensión sin rellenar de paja: añade más escenas (al menos 5-6 entre los tres actos),",
        "describe a fondo los lugares y NPCs (apariencia, voz, motivaciones, secretos), incluye encuentros de",
        "combate detallados, encuentros sociales con NPCs neutrales, opciones de exploración con localizaciones",
        "secundarias, pistas y subtramas paralelas. NO recortes ni resumas: desarrolla cada acto a fondo.",
      );
    }

    return lines.join("\n");
  }

  const SYSTEM_PROMPT =
    "Eres un Dungeon Master experto con años de experiencia narrando partidas de Dungeons & Dragons 5ª edición. " +
    "Tu tarea es generar aventuras originales, evocadoras y jugables en mesa. " +
    "Usas un lenguaje rico en imaginería, equilibras la narrativa con la jugabilidad, " +
    "y respetas estrictamente los temas, tonos y restricciones que indique el usuario. " +
    "Siempre respondes en español y formateas tu salida en Markdown.";

  const CHARS_SYSTEM_PROMPT =
    "Eres un Dungeon Master experto que crea fichas de personaje completas de D&D 5ª edición, " +
    "profundamente coherentes con la aventura ya narrada. Tu salida combina narrativa (trasfondo, motivaciones, " +
    "vínculos con la trama) con un bloque de estadísticas funcionales que el jugador podría llevar a mesa " +
    "(CA, PG, velocidad, valores de atributo con modificadores, tiradas de salvación competentes, habilidades, " +
    "ataques principales y conjuros si procede). Cada personaje debe sentirse parte del mundo, no insertado " +
    "a la fuerza: su trasfondo conecta con NPCs, lugares o eventos concretos de la aventura. Respondes en " +
    "español y formateas en Markdown.";

  function buildCharsPrompt(data, storyText) {
    return [
      "A continuación tienes la aventura de Dungeons & Dragons que acabas de generar para el jugador:",
      "",
      "---",
      storyText,
      "---",
      "",
      "El jugador quiere jugar a los siguientes personajes:",
      "",
      data.characters.trim(),
      "",
      "Datos adicionales del mundo (úsalos si encajan):",
      `- Tono: ${data.tone}`,
      `- Temas: ${data.themes.join(", ")}`,
      data.setting.trim() ? `- Ambientación: ${data.setting.trim()}` : null,
      data.notes.trim() ? `- Notas del DM: ${data.notes.trim()}` : null,
      "",
      "Genera una ficha completa para CADA UNO de los personajes. Estructura cada ficha en Markdown así:",
      "",
      "## [Nombre del personaje]",
      "**[Raza] · [Clase y subclase] · Nivel [X] · Trasfondo: [trasfondo]**",
      "",
      "[Descripción narrativa de 2-3 párrafos. Conecta su trasfondo con lugares, NPCs o eventos específicos",
      "de la aventura. No te limites a 'es un guerrero valiente': dile QUÉ vínculo tiene con ESTA aventura.]",
      "",
      "### Estadísticas (D&D 5e)",
      "- **CA:** XX · **PG:** XX · **Velocidad:** XX pies · **Bono de competencia:** +X",
      "- **FUE** XX (+X) · **DES** XX (+X) · **CON** XX (+X) · **INT** XX (+X) · **SAB** XX (+X) · **CAR** XX (+X)",
      "- **Tiradas de salvación competentes:** ...",
      "- **Habilidades competentes:** ...",
      "- **Idiomas:** ...",
      "",
      "### Acciones y rasgos",
      "- **Ataques principales:** [arma — bonificador al ataque, daño y tipo]",
      "- **Rasgos de clase destacados:** ...",
      "- **Conjuros notables:** [si es lanzador: lista de hechizos representativos por nivel; si no, omite esta línea]",
      "",
      "### Equipamiento característico",
      "- ...",
      "",
      "### Rol en la aventura",
      "- **Motivación:** [por qué se involucra en los eventos de la historia]",
      "- **Conexión con la trama:** [NPC, lugar o evento de la aventura con el que tiene relación]",
      "",
      "Reglas importantes:",
      "1. El nivel de cada personaje debe ser coherente con los desafíos descritos en la aventura.",
      "2. Los stats deben ser realistas y funcionales para D&D 5e (atributos 8-18 antes de bonos raciales, CA y PG razonables para el nivel).",
      "3. Si el jugador ya indicó raza/clase/detalles, respétalos. Si solo dio el nombre, invéntalos en consonancia con la historia.",
      "4. Cada personaje debe sentirse parte del mundo, no genérico.",
      "5. NO repitas la sinopsis de la aventura.",
      "6. Separa cada ficha con `---`.",
    ].filter(Boolean).join("\n");
  }

  function estimateCharsTokens(text) {
    const count = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).length || 1;
    return Math.min(8000, Math.max(1500, count * 1300));
  }

  // ---------- Enemies (stat blocks) ----------
  const ENEMIES_SYSTEM_PROMPT =
    "Eres un Dungeon Master experto que crea bloques de estadísticas de criaturas y NPCs hostiles para " +
    "Dungeons & Dragons 5ª edición, en el formato clásico del Manual de Monstruos. Tu salida es funcional " +
    "y lista para mesa: cada bloque incluye CA, PG (con dado de golpe), velocidad, atributos con sus " +
    "modificadores, salvaciones y habilidades cuando proceda, sentidos, idiomas, valor de desafío (con PX), " +
    "rasgos especiales, acciones y reacciones. Los enemigos generados encajan en el tono y los eventos de " +
    "la aventura proporcionada. Respondes en español y formateas en Markdown.";

  function buildEnemiesPrompt(data, storyText) {
    return [
      "A continuación tienes la aventura de Dungeons & Dragons que acabas de generar:",
      "",
      "---",
      storyText,
      "---",
      "",
      "Datos del DM sobre los antagonistas:",
      data.villain.trim() ? `- Antagonista principal / jefe final indicado por el DM: ${data.villain.trim()}` : "- Antagonista principal: deduce del Acto III de la historia.",
      data.enemies.trim() ? `- Enemigos secundarios indicados por el DM: ${data.enemies.trim()}` : "- Enemigos secundarios: deduce de los encuentros descritos en la historia.",
      "",
      "Identifica TODOS los enemigos relevantes que aparecen en la aventura (los indicados por el DM más cualquier",
      "otra criatura hostil mencionada en los actos). Para cada uno, genera un bloque de estadísticas completo en",
      "el formato del Manual de Monstruos 5e. Estructura cada bloque así:",
      "",
      "## [Nombre del enemigo]",
      "*[Tamaño] [tipo de criatura], [alineamiento]*",
      "",
      "**Clase de Armadura** XX ([fuente: armadura natural, armadura, etc.])",
      "**Puntos de Golpe** XX (XdX + X)",
      "**Velocidad** XX pies[, vuelo XX pies si procede, etc.]",
      "",
      "**FUE** XX (+X) · **DES** XX (+X) · **CON** XX (+X) · **INT** XX (+X) · **SAB** XX (+X) · **CAR** XX (+X)",
      "",
      "**Tiradas de salvación** ... (omite la línea si no tiene)",
      "**Habilidades** ...",
      "**Resistencias / Inmunidades al daño** ... (omite si no tiene)",
      "**Inmunidades a estados** ... (omite si no tiene)",
      "**Sentidos** percepción pasiva XX[, visión en la oscuridad XX pies, etc.]",
      "**Idiomas** ...",
      "**Desafío** X (XXX PX) · **Bono de competencia** +X",
      "",
      "### Rasgos",
      "***[Nombre del rasgo].*** [Descripción.]",
      "",
      "### Acciones",
      "***Multiataque.*** [Si procede.]",
      "***[Ataque 1].*** *Ataque con arma cuerpo a cuerpo:* +X al impacto, alcance X pies, un objetivo. *Impacto:* X (XdX+X) de daño [tipo].",
      "",
      "### Reacciones",
      "[Si procede; omite la sección si no tiene.]",
      "",
      "### Rol en la aventura",
      "[1-2 frases sobre cuándo y cómo aparece este enemigo en la historia, qué encuentro le corresponde.]",
      "",
      "Reglas importantes:",
      "1. El valor de desafío de cada enemigo debe ser proporcional a su rol en la aventura (esbirros con CR bajo, jefes finales con CR alto).",
      "2. Las estadísticas deben ser funcionales y coherentes con el formato del Manual de Monstruos 5e.",
      "3. Si el villano principal es un personaje único, dale rasgos legendarios o de jefe acordes a su importancia.",
      "4. Separa cada bloque con `---`.",
      "5. NO repitas la sinopsis de la aventura.",
    ].filter(Boolean).join("\n");
  }

  function estimateEnemiesTokens(data) {
    const userEnemies = `${data.enemies}, ${data.villain}`
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean).length;
    const guess = Math.max(3, userEnemies);
    return Math.min(8000, guess * 1100);
  }

  // ---------- Form helpers ----------
  function readForm() {
    const fd = new FormData(form);
    const themes = fd.getAll("themes");
    return {
      themes,
      tone: fd.get("tone") || "épico",
      duration: fd.get("duration") || "media",
      cities: fd.get("cities") || "",
      characters: fd.get("characters") || "",
      villain: fd.get("villain") || "",
      enemies: fd.get("enemies") || "",
      setting: fd.get("setting") || "",
      notes: fd.get("notes") || "",
    };
  }

  // ---------- UI state helpers ----------
  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  function showError(message) {
    errorMsg.textContent = message;
    show(errorEl);
    errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetUI() {
    hide(errorEl);
    hide(outputEl);
    storyEl.textContent = "";
    storyEl.classList.remove("done");
  }

  function resetCharsUI() {
    hide(charsSection);
    hide(charsLoadingInline);
    hide(charsContent);
    show(charsEmpty);
    hide(copyCharsBtn);
    charsContent.innerHTML = "";
    charsContent.classList.remove("done");
    generateCharsLabel.textContent = "Forjar fichas";
  }

  function resetEnemiesUI() {
    hide(enemiesSection);
    hide(enemiesLoadingInline);
    hide(enemiesContent);
    show(enemiesEmpty);
    hide(copyEnemiesBtn);
    enemiesContent.innerHTML = "";
    enemiesContent.classList.remove("done");
    generateEnemiesLabel.textContent = "Forjar fichas de enemigos";
  }

  // ---------- Markdown rendering (mínimo, seguro) ----------
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inline(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function renderMarkdown(text) {
    const lines = text.split("\n");
    let html = "";
    let inUl = false;
    let inOl = false;
    let inP = false;

    const closeBlocks = () => {
      if (inUl) { html += "</ul>"; inUl = false; }
      if (inOl) { html += "</ol>"; inOl = false; }
      if (inP)  { html += "</p>";  inP = false; }
    };

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (/^### (.+)/.test(line)) {
        closeBlocks();
        html += `<h3>${inline(line.slice(4))}</h3>`;
      } else if (/^## (.+)/.test(line)) {
        closeBlocks();
        html += `<h2>${inline(line.slice(3))}</h2>`;
      } else if (/^# (.+)/.test(line)) {
        closeBlocks();
        html += `<h1>${inline(line.slice(2))}</h1>`;
      } else if (/^[-*] (.+)/.test(line)) {
        if (!inUl) { closeBlocks(); html += "<ul>"; inUl = true; }
        html += `<li>${inline(line.replace(/^[-*] /, ""))}</li>`;
      } else if (/^\d+\.\s+(.+)/.test(line)) {
        if (!inOl) { closeBlocks(); html += "<ol>"; inOl = true; }
        html += `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`;
      } else if (line.trim() === "") {
        closeBlocks();
      } else {
        if (inUl || inOl) closeBlocks();
        if (!inP) { html += "<p>"; inP = true; }
        else { html += " "; }
        html += inline(line);
      }
    }
    closeBlocks();
    return html;
  }

  // ---------- OpenAI streaming ----------
  async function* streamCompletion(apiKey, payload, signal) {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let detail = `Error ${response.status}`;
      try {
        const err = await response.json();
        if (err?.error?.message) detail = err.error.message;
      } catch { /* sin cuerpo JSON */ }
      throw new Error(detail);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          /* fragmento incompleto, lo ignoramos */
        }
      }
    }
  }

  // ---------- Submit ----------
  let currentController = null;
  let charactersController = null;
  let lastStoryText = "";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const apiKey = apiKeyInput.value.trim();
    const data = readForm();

    if (!apiKey) {
      showError("Necesitas introducir tu API key de OpenAI para generar historias.");
      apiKeyInput.focus();
      return;
    }
    if (data.themes.length === 0) {
      showError("Selecciona al menos un tema para tu historia.");
      return;
    }

    if (rememberKey.checked) {
      localStorage.setItem(STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }

    resetUI();
    resetCharsUI();
    resetEnemiesUI();
    lastStoryText = "";
    show(loadingEl);
    generateBtn.disabled = true;
    loadingEl.scrollIntoView({ behavior: "smooth", block: "center" });

    const payload = {
      model: MODEL,
      stream: true,
      temperature: 0.85,
      max_tokens: DURATION_TOKENS[data.duration] ?? 1800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(data) },
      ],
    };

    currentController = new AbortController();
    let fullText = "";
    let firstChunk = true;

    try {
      for await (const chunk of streamCompletion(apiKey, payload, currentController.signal)) {
        if (firstChunk) {
          hide(loadingEl);
          show(outputEl);
          outputEl.scrollIntoView({ behavior: "smooth", block: "start" });
          firstChunk = false;
        }
        fullText += chunk;
        storyEl.innerHTML = renderMarkdown(fullText);
      }
      storyEl.classList.add("done");
      lastStoryText = fullText;
      show(charsSection);
      show(enemiesSection);
    } catch (err) {
      hide(loadingEl);
      if (err.name === "AbortError") return;
      showError(err.message || "No se pudo conectar con OpenAI.");
    } finally {
      generateBtn.disabled = false;
      currentController = null;
    }
  });

  // ---------- Story actions ----------
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(storyEl.innerText);
      copyBtn.textContent = "¡Copiado!";
      setTimeout(() => (copyBtn.textContent = "Copiar"), 1500);
    } catch {
      copyBtn.textContent = "Error al copiar";
      setTimeout(() => (copyBtn.textContent = "Copiar"), 1500);
    }
  });

  let enemiesController = null;

  newBtn.addEventListener("click", () => {
    if (currentController) currentController.abort();
    if (charactersController) charactersController.abort();
    if (enemiesController) enemiesController.abort();
    resetUI();
    resetCharsUI();
    resetEnemiesUI();
    lastStoryText = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------- Character sheets generation ----------
  generateCharsBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const data = readForm();

    if (!apiKey) {
      showError("Necesitas tu API key de OpenAI.");
      apiKeyInput.focus();
      return;
    }
    if (!data.characters.trim()) {
      showError("Para generar fichas necesitas indicar al menos un personaje en 'Personajes principales'.");
      charactersInput.focus();
      charactersInput.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!lastStoryText) {
      showError("Genera primero una historia.");
      return;
    }

    hide(errorEl);
    hide(charsEmpty);
    hide(charsContent);
    charsContent.innerHTML = "";
    charsContent.classList.remove("done");
    hide(copyCharsBtn);
    show(charsLoadingInline);
    generateCharsBtn.disabled = true;

    if (charactersController) charactersController.abort();
    charactersController = new AbortController();

    const payload = {
      model: MODEL,
      stream: true,
      temperature: 0.85,
      max_tokens: estimateCharsTokens(data.characters),
      messages: [
        { role: "system", content: CHARS_SYSTEM_PROMPT },
        { role: "user", content: buildCharsPrompt(data, lastStoryText) },
      ],
    };

    let firstChunk = true;
    let fullText = "";

    try {
      for await (const chunk of streamCompletion(apiKey, payload, charactersController.signal)) {
        if (firstChunk) {
          hide(charsLoadingInline);
          show(charsContent);
          charsSection.scrollIntoView({ behavior: "smooth", block: "start" });
          firstChunk = false;
        }
        fullText += chunk;
        charsContent.innerHTML = renderMarkdown(fullText);
      }
      charsContent.classList.add("done");
      show(copyCharsBtn);
      generateCharsLabel.textContent = "Forjar de nuevo";
    } catch (err) {
      hide(charsLoadingInline);
      show(charsEmpty);
      if (err.name === "AbortError") return;
      showError(err.message || "No se pudo conectar con OpenAI.");
    } finally {
      generateCharsBtn.disabled = false;
      charactersController = null;
    }
  });

  copyCharsBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(charsContent.innerText);
      copyCharsBtn.textContent = "¡Copiado!";
      setTimeout(() => (copyCharsBtn.textContent = "Copiar"), 1500);
    } catch {
      copyCharsBtn.textContent = "Error al copiar";
      setTimeout(() => (copyCharsBtn.textContent = "Copiar"), 1500);
    }
  });

  // ---------- Enemy stat blocks generation ----------
  generateEnemiesBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    const data = readForm();

    if (!apiKey) {
      showError("Necesitas tu API key de OpenAI.");
      apiKeyInput.focus();
      return;
    }
    if (!lastStoryText) {
      showError("Genera primero una historia.");
      return;
    }

    hide(errorEl);
    hide(enemiesEmpty);
    hide(enemiesContent);
    enemiesContent.innerHTML = "";
    enemiesContent.classList.remove("done");
    hide(copyEnemiesBtn);
    show(enemiesLoadingInline);
    generateEnemiesBtn.disabled = true;

    if (enemiesController) enemiesController.abort();
    enemiesController = new AbortController();

    const payload = {
      model: MODEL,
      stream: true,
      temperature: 0.8,
      max_tokens: estimateEnemiesTokens(data),
      messages: [
        { role: "system", content: ENEMIES_SYSTEM_PROMPT },
        { role: "user", content: buildEnemiesPrompt(data, lastStoryText) },
      ],
    };

    let firstChunk = true;
    let fullText = "";

    try {
      for await (const chunk of streamCompletion(apiKey, payload, enemiesController.signal)) {
        if (firstChunk) {
          hide(enemiesLoadingInline);
          show(enemiesContent);
          enemiesSection.scrollIntoView({ behavior: "smooth", block: "start" });
          firstChunk = false;
        }
        fullText += chunk;
        enemiesContent.innerHTML = renderMarkdown(fullText);
      }
      enemiesContent.classList.add("done");
      show(copyEnemiesBtn);
      generateEnemiesLabel.textContent = "Forjar de nuevo";
    } catch (err) {
      hide(enemiesLoadingInline);
      show(enemiesEmpty);
      if (err.name === "AbortError") return;
      showError(err.message || "No se pudo conectar con OpenAI.");
    } finally {
      generateEnemiesBtn.disabled = false;
      enemiesController = null;
    }
  });

  copyEnemiesBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(enemiesContent.innerText);
      copyEnemiesBtn.textContent = "¡Copiado!";
      setTimeout(() => (copyEnemiesBtn.textContent = "Copiar"), 1500);
    } catch {
      copyEnemiesBtn.textContent = "Error al copiar";
      setTimeout(() => (copyEnemiesBtn.textContent = "Copiar"), 1500);
    }
  });

  // ---------- Theme toggle ----------
  const themeToggle = $("#theme-toggle");
  const THEME_KEY = "dungeonmaker.theme";

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  });
})();
