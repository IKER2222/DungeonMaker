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
      `**Duración aproximada:** ${data.duration}`,
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

    return lines.join("\n");
  }

  const SYSTEM_PROMPT =
    "Eres un Dungeon Master experto con años de experiencia narrando partidas de Dungeons & Dragons 5ª edición. " +
    "Tu tarea es generar aventuras originales, evocadoras y jugables en mesa. " +
    "Usas un lenguaje rico en imaginería, equilibras la narrativa con la jugabilidad, " +
    "y respetas estrictamente los temas, tonos y restricciones que indique el usuario. " +
    "Siempre respondes en español y formateas tu salida en Markdown.";

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

  newBtn.addEventListener("click", () => {
    if (currentController) currentController.abort();
    resetUI();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
